import { useState } from 'react'
import * as XLSX from 'xlsx'
import { doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  entradasDaPlanilha, classificaConciliacao, fimDoMesDaAba,
  nomeCliente, fmtData, fmtMoeda,
} from '../utils.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'

const POR_LOTE = 200        // 2 escritas por pedido; o limite do Firestore é 500
const MOSTRAR = 50          // linhas exibidas por lista (o resto sai no CSV)

// CONCILIAÇÃO COM A PLANILHA DE ENTREGAS — ferramenta de MIGRAÇÃO, só do dono.
// O sistema entrou no ar com pedidos que já tinham sido entregues de verdade e
// ficaram parados na produção. Aqui a planilha manual de entrega diz quais são.
//
// Fluxo obrigatório: subir planilha → conferir a prévia → BAIXAR O BACKUP →
// aplicar. O backup é exigido de propósito: a operação apaga o pedido de
// `pedidos` (é o mesmo caminho do botão "✓ Entregue"), e desfazer 2.000 entregas
// na mão não é opção. Com o JSON dá para recriar exatamente o que havia antes.
export default function Conciliacao({ pedidos }) {
  const { clientes } = useCadastros()
  const { nome } = useAuth()
  const [analise, setAnalise] = useState(null)
  const [msg, setMsg] = useState('')
  const [backupFeito, setBackupFeito] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [progresso, setProgresso] = useState(0)
  const [resultado, setResultado] = useState(null)

  async function lerPlanilha(ev) {
    const file = ev.target.files?.[0]
    if (!file) return
    setMsg('Lendo planilha…'); setAnalise(null); setResultado(null); setBackupFeito(false)
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
      const entradas = []
      const abas = []
      for (const aba of wb.SheetNames) {
        // raw:true é essencial — precisamos do NÚMERO para separar a série curta
        // da longa e para descartar célula de data na coluna do pedido
        const linhas = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, raw: true, defval: '' })
        const doAba = entradasDaPlanilha(linhas, aba)
        entradas.push(...doAba)
        abas.push({ aba, linhas: linhas.length, entradas: doAba.length, data: fimDoMesDaAba(aba) })
      }
      if (!entradas.length) {
        setMsg('Nenhuma linha "ENTREGUE" com número de pedido da nossa numeração foi encontrada.')
        return
      }
      setAnalise({ ...classificaConciliacao(entradas, pedidos, clientes), abas, total: entradas.length })
      setMsg('')
    } catch (e) {
      console.error(e)
      setMsg('Erro ao ler a planilha: ' + e.message)
    } finally {
      ev.target.value = ''
    }
  }

  function baixar(nomeArq, conteudo, tipo) {
    const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }))
    const a = document.createElement('a')
    a.href = url; a.download = nomeArq; a.click()
    URL.revokeObjectURL(url)
  }

  // backup = o estado ATUAL e completo dos pedidos que vão sair de `pedidos`
  function baixarBackup() {
    const dados = analise.aplicar.map(({ p }) => p)
    baixar(`backup-pedidos-antes-da-conciliacao-${dados.length}.json`,
      JSON.stringify(dados, null, 2), 'application/json')
    setBackupFeito(true)
  }

  // CSV com TODOS os pedidos que estão hoje na produção — para analisar por
  // número fora do sistema (Excel) sem depender desta tela
  function baixarPedidosDoSistema() {
    const cab = 'pedido;cliente;vendedor;rota;status;itens;valor\n'
    const linhas = (pedidos || [])
      .slice()
      .sort((a, b) => (Number(a.idVenda) || 0) - (Number(b.idVenda) || 0))
      .map((p) => [
        p.idVenda, nomeCliente(p.cliente, clientes), p.vendedor || '', p.rota || '',
        p.status || 'sem triagem', (p.itens || []).length, p.valorTotal || 0,
      ].join(';')).join('\n')
    baixar(`pedidos-na-producao-${(pedidos || []).length}.csv`, '\ufeff' + cab + linhas, 'text/csv;charset=utf-8')
  }

  function baixarCSV(lista, nomeArq, comSistema) {
    const cab = comSistema
      ? 'pedido;cliente na planilha;cliente no sistema;aba\n'
      : 'pedido;cliente na planilha;aba\n'
    const linhas = lista.map((e) => comSistema
      ? `${e.idVenda};${e.cliente};${e.clienteSistema || ''};${e.aba}`
      : `${e.idVenda};${e.cliente};${e.aba}`).join('\n')
    baixar(nomeArq, '﻿' + cab + linhas, 'text/csv;charset=utf-8')
  }

  function baixarForaDaPlanilha() {
    const cab = 'pedido;cliente;vendedor;rota;status;itens;valor\n'
    const linhas = analise.foraDaPlanilha.map((p) => [
      p.idVenda, nomeCliente(p.cliente, clientes), p.vendedor || '', p.rota || '',
      p.status || 'sem triagem', (p.itens || []).length, p.valorTotal || 0,
    ].join(';')).join('\n')
    baixar(`seguem-na-producao-${analise.foraDaPlanilha.length}.csv`, '\ufeff' + cab + linhas, 'text/csv;charset=utf-8')
  }

  async function aplicar() {
    const lista = analise.aplicar
    if (!lista.length || aplicando) return
    if (!confirm(
      `Marcar ${lista.length} pedido(s) como ENTREGUES?\n\n` +
      `Eles saem da produção e passam para Entregues. Esta ação mexe em dados de ` +
      `produção — só continue com o backup já baixado.`)) return
    setAplicando(true); setProgresso(0)
    const agora = new Date().toISOString()
    let feitos = 0
    try {
      for (let i = 0; i < lista.length; i += POR_LOTE) {
        const batch = writeBatch(db)
        for (const { p, motorista, entregueEm, aba } of lista.slice(i, i + POR_LOTE)) {
          const { id, ...pedido } = p            // `id` é do snapshot, não do documento
          batch.set(doc(db, 'entregues', `${p.idVenda}-${(p.remessas || 0) + 1}`), {
            ...pedido,
            idVenda: p.idVenda,
            itens: p.itens || [],
            remessa: (p.remessas || 0) + 1,
            parcial: false,
            itensPendentes: 0,
            motorista: motorista || '',
            entregueEm: entregueEm || agora,
            // marca a origem: é o que permite achar (e desfazer) só estes depois
            origem: 'conciliacao-planilha',
            conciliadoDe: aba,
            conciliadoPor: nome || '',
            conciliadoEm: agora,
          })
          batch.delete(doc(db, 'pedidos', p.idVenda))
        }
        await batch.commit()
        feitos += Math.min(POR_LOTE, lista.length - i)
        setProgresso(feitos)
      }
      setResultado({ ok: feitos })
      setAnalise(null)
    } catch (e) {
      console.error(e)
      setResultado({ ok: feitos, erro: e.message })
    } finally {
      setAplicando(false)
    }
  }

  return (
    <>
      <div className="toolbar">
        <h1 className="page-title">Conciliação de entregas
          <small>planilha manual → baixa dos pedidos que já saíram</small>
        </h1>
      </div>

      <div className="card em_dia" style={{ marginBottom: 18 }}>
        <p style={{ marginTop: 0 }}>
          Sobe a planilha de controle de entrega. Só entram as linhas marcadas
          <b> ENTREGUE</b> cujo número seja da <b>nossa numeração</b> e que ainda estejam
          na produção. Pedido que não existir aqui é apenas listado — nada é criado.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label className="btn primary" style={{ display: 'inline-block', cursor: 'pointer' }}>
            📄 Escolher planilha (.xlsx)
            <input type="file" accept=".xlsx,.xls" onChange={lerPlanilha} style={{ display: 'none' }} />
          </label>
          {/* independe da planilha: serve para conferir os números fora do sistema */}
          <button className="btn" onClick={baixarPedidosDoSistema}>
            ⬇ Baixar os {(pedidos || []).length} pedidos da produção (CSV)
          </button>
        </div>
        {msg && <div className="filter-pill" style={{ marginTop: 12 }}>{msg}</div>}
      </div>

      {resultado && (
        <div className={`card ${resultado.erro ? 'atrasado' : 'em_dia'}`} style={{ marginBottom: 18 }}>
          <h3 style={{ marginTop: 0 }}>
            {resultado.erro ? '⚠ Parou no meio' : '✓ Conciliação aplicada'}
          </h3>
          <p>{resultado.ok} pedido(s) marcados como entregues.</p>
          {resultado.erro && <p style={{ color: 'var(--danger)' }}>Erro: {resultado.erro}</p>}
        </div>
      )}

      {analise && (
        <>
          <div className="rel-cards">
            <Cartao n={analise.aplicar.length} rotulo="vão ser marcados" cor="var(--ok)" />
            <Cartao n={analise.revisar.length} rotulo="para revisar (cliente diferente)" cor="var(--accent)" />
            <Cartao n={analise.naoEncontrados.length} rotulo="não estão na produção" />
            <Cartao n={analise.foraDaPlanilha.length} rotulo="seguem na produção (fora da planilha)" />
            <Cartao n={analise.total} rotulo="linhas ENTREGUE lidas" />
          </div>

          <div className="card em_dia" style={{ marginBottom: 18 }}>
            <h3 style={{ marginTop: 0 }}>1. Backup antes de aplicar</h3>
            <p style={{ marginTop: 0 }}>
              Baixe o estado atual dos {analise.aplicar.length} pedido(s) que vão sair da produção.
              É o que permite reverter se algo estiver errado.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" onClick={baixarBackup}>
                ⬇ Baixar backup (JSON){backupFeito ? ' ✓' : ''}
              </button>
              {analise.revisar.length > 0 && (
                <button className="btn" onClick={() => baixarCSV(analise.revisar, 'revisar-cliente-diferente.csv', true)}>
                  ⬇ Lista para revisar (CSV)
                </button>
              )}
              {analise.naoEncontrados.length > 0 && (
                <button className="btn" onClick={() => baixarCSV(analise.naoEncontrados, 'nao-encontrados.csv', false)}>
                  ⬇ Não encontrados (CSV)
                </button>
              )}
              {analise.foraDaPlanilha.length > 0 && (
                <button className="btn" onClick={baixarForaDaPlanilha}>
                  ⬇ Seguem na produção (CSV)
                </button>
              )}
            </div>
          </div>

          <div className="card em_dia" style={{ marginBottom: 18 }}>
            <h3 style={{ marginTop: 0 }}>2. Aplicar</h3>
            {!backupFeito && (
              <p style={{ color: 'var(--accent)', marginTop: 0 }}>
                Baixe o backup primeiro — o botão libera em seguida.
              </p>
            )}
            <button className="btn ok" disabled={!backupFeito || aplicando || !analise.aplicar.length}
              onClick={aplicar}>
              {aplicando
                ? `Aplicando… ${progresso} de ${analise.aplicar.length}`
                : `✓ Marcar ${analise.aplicar.length} pedido(s) como entregues`}
            </button>
          </div>

          <Lista titulo="Vão ser marcados como entregues" itens={analise.aplicar} clientes={clientes} verde />
          <Lista titulo="Para revisar — o cliente da planilha não bate com o do sistema"
            itens={analise.revisar} clientes={clientes} mostraSistema />
          <Lista titulo="Não estão na produção (já entregues antes, ou nunca existiram aqui)"
            itens={analise.naoEncontrados} clientes={clientes} semPedido />

          <ListaPedidos titulo="Seguem na produção — estão no sistema e a planilha não menciona"
            itens={analise.foraDaPlanilha} clientes={clientes} />

          <div className="card em_dia">
            <h3 style={{ marginTop: 0 }}>Por aba da planilha</h3>
            <table className="rel-tab">
              <thead><tr><th>Aba</th><th className="q">Linhas</th><th className="q">ENTREGUE (nossa numeração)</th><th>Data que será gravada</th></tr></thead>
              <tbody>
                {analise.abas.map((a) => (
                  <tr key={a.aba}>
                    <td>{a.aba}</td>
                    <td className="q">{a.linhas}</td>
                    <td className="q">{a.entradas}</td>
                    <td>{a.data ? fmtData(a.data) : <span style={{ color: 'var(--danger)' }}>não reconheci o mês</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}

function Cartao({ n, rotulo, cor }) {
  return (
    <div className="rel-total-card" style={cor ? { borderLeft: `4px solid ${cor}` } : null}>
      <div className="rt-label">{rotulo}</div>
      <div className="rt-valor" style={cor ? { color: cor } : null}>{n}</div>
    </div>
  )
}

function ListaPedidos({ titulo, itens, clientes }) {
  if (!itens.length) return null
  return (
    <div className="card em_dia" style={{ marginBottom: 18 }}>
      <h3 style={{ marginTop: 0 }}>
        {titulo} <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>({itens.length})</span>
      </h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="rel-tab">
          <thead><tr><th>Pedido</th><th>Cliente</th><th>Vendedor</th><th>Rota</th><th className="q">Itens</th><th className="q">Valor</th></tr></thead>
          <tbody>
            {itens.slice(0, MOSTRAR).map((p) => (
              <tr key={p.idVenda}>
                <td>#{p.idVenda}</td>
                <td>{nomeCliente(p.cliente, clientes)}</td>
                <td>{p.vendedor || '—'}</td>
                <td>{p.rota || '—'}</td>
                <td className="q">{(p.itens || []).length}</td>
                <td className="q">{fmtMoeda(p.valorTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {itens.length > MOSTRAR && (
        <p style={{ color: 'var(--text-faint)', fontSize: 12, marginBottom: 0 }}>
          mostrando {MOSTRAR} de {itens.length} — baixe o CSV para a lista completa
        </p>
      )}
    </div>
  )
}

function Lista({ titulo, itens, clientes, mostraSistema, semPedido, verde }) {
  if (!itens.length) return null
  return (
    <div className="card em_dia" style={{ marginBottom: 18 }}>
      <h3 style={{ marginTop: 0, color: verde ? 'var(--ok)' : undefined }}>
        {titulo} <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>({itens.length})</span>
      </h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="rel-tab">
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Cliente na planilha</th>
              {mostraSistema && <th>Cliente no sistema</th>}
              {!semPedido && !mostraSistema && <th>Cliente no sistema</th>}
              <th>Aba</th>
              {!semPedido && <th className="q">Valor</th>}
            </tr>
          </thead>
          <tbody>
            {itens.slice(0, MOSTRAR).map((e) => (
              <tr key={e.idVenda}>
                <td>#{e.idVenda}</td>
                <td>{e.cliente || '—'}</td>
                {mostraSistema && <td style={{ color: 'var(--accent)' }}>{e.clienteSistema || '—'}</td>}
                {!semPedido && !mostraSistema && <td>{nomeCliente(e.p.cliente, clientes)}</td>}
                <td>{e.aba}</td>
                {!semPedido && <td className="q">{fmtMoeda(e.p.valorTotal)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {itens.length > MOSTRAR && (
        <p style={{ color: 'var(--text-faint)', fontSize: 12, marginBottom: 0 }}>
          mostrando {MOSTRAR} de {itens.length} — baixe o CSV para a lista completa
        </p>
      )}
    </div>
  )
}
