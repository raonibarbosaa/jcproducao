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
  const [marcados, setMarcados] = useState(() => new Set())   // idVenda escolhidos

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
      const cls = classificaConciliacao(entradas, pedidos, clientes)
      // já vem marcado o que casou pelo nome; o que divergiu fica para você decidir
      setMarcados(new Set(cls.aplicar.map((x) => x.idVenda)))
      setAnalise({ ...cls, abas, total: entradas.length })
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
    const dados = escolhidos.map(({ p }) => p)
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

  // os dois lados juntos: tudo que está na planilha E na produção
  const candidatos = analise
    ? [...analise.aplicar.map((x) => ({ ...x, casou: true })),
       ...analise.revisar.map((x) => ({ ...x, casou: false }))]
      .sort((a, b) => (Number(a.idVenda) || 0) - (Number(b.idVenda) || 0))
    : []
  const escolhidos = candidatos.filter((c) => marcados.has(c.idVenda))
  const alterna = (id) => setMarcados((s) => {
    const n = new Set(s)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })

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
    const lista = escolhidos
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
            <Cartao n={escolhidos.length} rotulo="marcados para aplicar" cor="var(--ok)" />
            <Cartao n={candidatos.length} rotulo="estão na planilha E na produção" />
            <Cartao n={analise.revisar.length} rotulo="com nome de cliente diferente" cor="var(--accent)" />
            <Cartao n={analise.naoEncontrados.length} rotulo="não estão na produção" />
            <Cartao n={analise.foraDaPlanilha.length} rotulo="seguem na produção (fora da planilha)" />
            <Cartao n={analise.total} rotulo="linhas ENTREGUE lidas" />
          </div>

          <div className="card em_dia" style={{ marginBottom: 18 }}>
            <h3 style={{ marginTop: 0 }}>1. Backup antes de aplicar</h3>
            <p style={{ marginTop: 0 }}>
              Baixe o estado atual dos {escolhidos.length} pedido(s) marcados abaixo.
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
            <button className="btn ok" disabled={!backupFeito || aplicando || !escolhidos.length}
              onClick={aplicar}>
              {aplicando
                ? `Aplicando… ${progresso} de ${escolhidos.length}`
                : `✓ Marcar ${escolhidos.length} pedido(s) como entregues`}
            </button>
          </div>

          <Candidatos itens={candidatos} marcados={marcados} alterna={alterna}
            marcarTodos={() => setMarcados(new Set(candidatos.map((c) => c.idVenda)))}
            desmarcarTodos={() => setMarcados(new Set())} />

          <Lista titulo="Não estão na produção (já entregues antes, ou nunca existiram aqui)"
            itens={analise.naoEncontrados} />

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

// Tudo que está na planilha E na produção, para você marcar o que aplicar.
// Vem pré-marcado o que casou pelo nome do cliente; o que divergiu vem
// desmarcado e destacado — a planilha escreve "JAMSOFT(EXPEDIÇÃO)" onde o
// sistema tem a razão social, mas também tem número reaproveitado por outro
// cliente. Só o olho humano separa os dois casos, e são poucas linhas.
function Candidatos({ itens, marcados, alterna, marcarTodos, desmarcarTodos }) {
  if (!itens.length) return null
  const divergentes = itens.filter((c) => !c.casou).length
  return (
    <div className="card em_dia" style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>
          Na planilha e na produção <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>({itens.length})</span>
        </h3>
        <div className="spacer" style={{ flex: 1 }} />
        <button className="btn" onClick={marcarTodos}>Marcar todos</button>
        <button className="btn" onClick={desmarcarTodos}>Desmarcar todos</button>
      </div>
      {divergentes > 0 && (
        <p style={{ color: 'var(--accent)', fontSize: 13 }}>
          {divergentes} linha(s) com o nome do cliente diferente vieram <b>desmarcadas</b> —
          confira uma a uma antes de marcar. Pode ser só o nome escrito de outro jeito,
          ou pode ser um número reaproveitado por outro cliente.
        </p>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table className="rel-tab">
          <thead>
            <tr>
              <th style={{ width: 32 }}></th>
              <th>Pedido</th>
              <th>Cliente na planilha</th>
              <th>Cliente no sistema</th>
              <th>Vendedor</th>
              <th className="q">Itens</th>
              <th className="q">Valor</th>
              <th>Aba</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((c) => (
              <tr key={c.idVenda} style={c.casou ? null : { background: 'rgba(255,176,32,.07)' }}>
                <td>
                  <input type="checkbox" className="card-check" checked={marcados.has(c.idVenda)}
                    onChange={() => alterna(c.idVenda)} />
                </td>
                <td>#{c.idVenda}</td>
                <td>{c.cliente || '—'}</td>
                <td style={c.casou ? null : { color: 'var(--accent)' }}>
                  {c.casou ? c.p.cliente : c.clienteSistema}
                </td>
                <td>{c.p.vendedor || '—'}</td>
                <td className="q">{(c.p.itens || []).length}</td>
                <td className="q">{fmtMoeda(c.p.valorTotal)}</td>
                <td>{c.aba}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

function Lista({ titulo, itens }) {
  if (!itens.length) return null
  return (
    <div className="card em_dia" style={{ marginBottom: 18 }}>
      <h3 style={{ marginTop: 0 }}>
        {titulo} <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>({itens.length})</span>
      </h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="rel-tab">
          <thead><tr><th>Pedido</th><th>Cliente na planilha</th><th>Aba</th></tr></thead>
          <tbody>
            {itens.slice(0, MOSTRAR).map((e) => (
              <tr key={e.idVenda}>
                <td>#{e.idVenda}</td>
                <td>{e.cliente || '—'}</td>
                <td>{e.aba}</td>
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
