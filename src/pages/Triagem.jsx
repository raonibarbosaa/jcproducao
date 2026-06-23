import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { doc, setDoc, updateDoc, deleteDoc, writeBatch, collection, getDocs, query, where, documentId } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import {
  mapeiaColunas, agrupaPedidos, MODO_ORDER, MODO_NM, MODO_COR,
  fmtData, fmtMoeda, situacaoPrazo, detectaRota,
  detectaOrigem, mapeiaColunasZeus, agrupaPedidosZeus, ORIGEM_NM, nomeCliente,
  linhaDoItem, pedidoCompleto, linhaPredominante, normaliza, achaCliente,
} from '../utils.js'

export default function Triagem({ pedidos }) {
  const { vendedores, clientes } = useCadastros()
  const { perfil } = useAuth()
  const ehDono = perfil === 'dono'
  const fileRef = useRef(null)
  const [soPendentes, setSoPendentes] = useState(false)
  const [msg, setMsg] = useState('')
  const [importando, setImportando] = useState(false)
  const [painelExcluir, setPainelExcluir] = useState(false)
  const [perIni, setPerIni] = useState('')
  const [perFim, setPerFim] = useState('')
  const [excluindo, setExcluindo] = useState(false)
  const [resultadoImportacao, setResultadoImportacao] = useState(null) // resumo da última importação

  async function importar(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportando(true); setMsg('Lendo planilha…')
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const linhas = XLSX.utils.sheet_to_json(ws, { defval: null })
      if (!linhas.length) { setMsg('Planilha vazia.'); setImportando(false); return }

      const colunas = Object.keys(linhas[0])
      const origem = detectaOrigem(colunas)
      if (!origem) {
        setMsg('Não reconheci o modelo da planilha (nem Posseidon, nem Zeus). Confira o arquivo.')
        setImportando(false); return
      }

      let novos
      if (origem === 'ZEUS') {
        const mapa = mapeiaColunasZeus(colunas)
        if (!mapa.id || !mapa.cliente) {
          setMsg('Planilha da Zeus sem as colunas Código / Cliente. Confira o arquivo.')
          setImportando(false); return
        }
        novos = agrupaPedidosZeus(linhas, mapa, vendedores)
      } else {
        const mapa = mapeiaColunas(colunas)
        if (!mapa.id || !mapa.cliente) {
          setMsg('Não encontrei as colunas ID Venda / Cliente. Confira o arquivo.')
          setImportando(false); return
        }
        novos = agrupaPedidos(linhas, mapa, vendedores)
      }

      // confere o histórico: pedido já entregue NÃO volta para a triagem
      setMsg('Conferindo histórico de entregas…')
      const idsPlanilha = novos.map((p) => p.idVenda)
      const jaEntregues = []
      for (let i = 0; i < idsPlanilha.length; i += 30) {
        const chunk = idsPlanilha.slice(i, i + 30)
        const snap = await getDocs(query(collection(db, 'entregues'), where(documentId(), 'in', chunk)))
        snap.forEach((d) => jaEntregues.push({ id: d.id, ...d.data() }))
      }
      const idsEntregues = new Set(jaEntregues.map((e) => e.id))
      const aImportar = novos.filter((p) => !idsEntregues.has(p.idVenda))

      // categoriza cada pedido (novo / atualizado-normal / atualizado-categorizado)
      // e cataloga clientes novos pra cadastrar automaticamente
      const existentes = Object.fromEntries(pedidos.map((p) => [p.idVenda, p]))
      const novosResumo = []          // pedidos que entraram pela 1a vez
      const atualizadosMantidos = []  // pedidos que existiam E já estavam categorizados
      const atualizadosNormais = []   // pedidos que existiam mas estavam sem categoria

      for (const p of aImportar) {
        const ja = existentes[p.idVenda]
        if (!ja) novosResumo.push(p)
        else if (ja.status) atualizadosMantidos.push({ ...p, _statusAnterior: ja.status })
        else atualizadosNormais.push(p)
      }

      // grava em lote (máx. 500 operações por lote no Firestore).
      // Mantém status/obs/cidade já definidos se o pedido já existia.
      setMsg('Gravando pedidos…')
      for (let i = 0; i < aImportar.length; i += 450) {
        const batch = writeBatch(db)
        for (const p of aImportar.slice(i, i + 450)) {
          const ja = existentes[p.idVenda]
          const dados = { ...p }
          if (ja && ja.status) { dados.status = ja.status }
          if (ja && ja.linhasItens) { dados.linhasItens = ja.linhasItens }
          if (ja && ja.obs) dados.obs = ja.obs || dados.obs
          // cidade definida manualmente não pode ser apagada por planilha sem cidade
          if (ja && ja.cidade && !dados.cidade) { dados.cidade = ja.cidade; dados.rota = ja.rota }
          batch.set(doc(db, 'pedidos', p.idVenda), dados, { merge: true })
        }
        await batch.commit()
      }

      // captura automática de clientes: pra cada razão social que aparece na planilha
      // e ainda NÃO está cadastrada, cria entrada com apelido vazio.
      // Cliente já cadastrado (mesmo com apelido vazio) é deixado em paz.
      setMsg('Conferindo clientes…')
      const razoesNovas = new Map() // razao normalizada -> razao original (1a vez vista)
      for (const p of aImportar) {
        const razao = (p.cliente || '').trim()
        if (!razao) continue
        if (achaCliente(razao, clientes)) continue
        const key = normaliza(razao)
        if (!razoesNovas.has(key)) razoesNovas.set(key, razao)
      }
      const clientesNovos = [...razoesNovas.values()].map((razao) => ({ razao, nome: '' }))
      if (clientesNovos.length) {
        const listaAtualizada = [...clientes, ...clientesNovos]
        await setDoc(doc(db, 'config', 'cadastros'), { clientes: listaAtualizada }, { merge: true })
      }

      // monta o resultado pro modal
      setResultadoImportacao({
        origem,
        totalLinhas: linhas.length,
        totalPedidos: novos.length,
        novos: novosResumo,
        atualizadosMantidos,
        atualizadosNormais,
        ignorados: jaEntregues,
        clientesNovos,
      })
      setMsg('')
    } catch (err) {
      console.error(err)
      setMsg('Erro ao importar: ' + err.message)
    } finally {
      setImportando(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function categorizar(idVenda, linha) {
    // Botão grande: aplica a linha a TODOS os itens do pedido.
    // Clicar de novo na mesma linha (quando o pedido inteiro já está nela) limpa tudo
    // e devolve o pedido pra Triagem.
    const p = pedidos.find((x) => x.idVenda === idVenda)
    if (!p) return
    const todosNaMesma =
      p.itens?.length
        ? p.itens.every((_, i) => linhaDoItem(p, i) === linha)
        : p.status === linha
    try {
      if (todosNaMesma) {
        await updateDoc(doc(db, 'pedidos', idVenda), { status: '', linhasItens: {} })
        return
      }
      // monta linhasItens com todos os índices apontando pra mesma linha
      const linhasItens = {}
      if (p.itens?.length) {
        p.itens.forEach((_, i) => { linhasItens[i] = linha })
      }
      await updateDoc(doc(db, 'pedidos', idVenda), { status: linha, linhasItens })
    } catch (err) {
      console.error('[categorizar] erro:', err)
      alert('Erro ao gravar: ' + err.message)
    }
  }

  // botãozinho por item — alterna a linha só daquele item.
  // recalcula status (linha predominante) e segura o pedido na Triagem se ainda faltar item.
  async function categorizarItem(idVenda, indice, linha) {
    const p = pedidos.find((x) => x.idVenda === idVenda)
    if (!p) { console.warn('[categorizarItem] pedido não encontrado:', idVenda); return }
    const atual = { ...(p.linhasItens || {}) }
    if (atual[indice] === linha) {
      delete atual[indice] // clicar de novo na mesma letra remove a linha do item
    } else {
      atual[indice] = linha
    }
    // simula o pedido com a mudança pra recalcular status e completude
    const pSimulado = { ...p, linhasItens: atual }
    const completo = pedidoCompleto(pSimulado)
    const novoStatus = completo ? linhaPredominante(pSimulado) : ''
    console.log('[categorizarItem]', { idVenda, indice, linha, atual, novoStatus })
    // SEM merge no objeto linhasItens — substitui inteiro pra que delete propague.
    // Mas mantém merge true no doc principal pra não apagar outros campos do pedido.
    try {
      await updateDoc(doc(db, 'pedidos', idVenda), { linhasItens: atual, status: novoStatus })
      console.log('[categorizarItem] gravado ✓')
    } catch (err) {
      console.error('[categorizarItem] erro ao gravar:', err)
      alert('Erro ao gravar: ' + err.message)
    }
  }

  // responsável define a cidade de um pedido sem rota -> sistema recalcula a rota
  async function definirCidade(p, cidadeNova) {
    const cidade = String(cidadeNova || '').trim().replace(/\s+/g, ' ')
    if (!cidade) return
    const { rota } = detectaRota(p.vendedorRaw || p.vendedor, cidade, vendedores)
    await setDoc(doc(db, 'pedidos', p.idVenda), { cidade, rota }, { merge: true })
  }

  // exclusão individual — só perfil dono
  async function excluirPedido(p) {
    if (!ehDono) return
    if (!confirm(`Excluir o pedido #${p.idVenda} — ${nomeCliente(p.cliente, clientes)}?\n\nEssa ação não tem volta.`)) return
    await deleteDoc(doc(db, 'pedidos', p.idVenda))
  }

  // pedidos dentro do período selecionado (pela data da venda)
  function pedidosDoPeriodo() {
    if (!perIni || !perFim) return []
    const ini = new Date(perIni + 'T00:00:00')
    const fim = new Date(perFim + 'T23:59:59')
    return pedidos.filter((p) => {
      if (!p.dataVenda) return false
      const d = new Date(p.dataVenda)
      return d >= ini && d <= fim
    })
  }

  // exclusão em lote por período — só perfil dono
  async function excluirPeriodo() {
    if (!ehDono) return
    const alvo = pedidosDoPeriodo()
    if (!alvo.length) { setMsg('Nenhum pedido no período selecionado.'); return }
    if (!confirm(`Excluir ${alvo.length} pedido(s) com venda entre ${fmtData(perIni + 'T12:00:00')} e ${fmtData(perFim + 'T12:00:00')}?\n\nEssa ação não tem volta.`)) return
    setExcluindo(true)
    try {
      // Firestore aceita até 500 operações por lote
      for (let i = 0; i < alvo.length; i += 450) {
        const batch = writeBatch(db)
        for (const p of alvo.slice(i, i + 450)) {
          batch.delete(doc(db, 'pedidos', p.idVenda))
        }
        await batch.commit()
      }
      setMsg(`${alvo.length} pedido(s) excluído(s).`)
      setPainelExcluir(false); setPerIni(''); setPerFim('')
    } catch (err) {
      console.error(err)
      setMsg('Erro ao excluir: ' + err.message)
    } finally {
      setExcluindo(false)
    }
  }

  const lista = (soPendentes ? pedidos.filter((p) => !pedidoCompleto(p)) : pedidos)
    .slice()
    .sort((a, b) => {
      // atrasados primeiro, depois sem definição, depois por id
      const sa = situacaoPrazo(a.previsao) === 'atrasado' ? 0 : 1
      const sb = situacaoPrazo(b.previsao) === 'atrasado' ? 0 : 1
      if (sa !== sb) return sa - sb
      return String(a.idVenda).localeCompare(String(b.idVenda))
    })

  return (
    <>
      <div className="toolbar">
        <h1 className="page-title">Triagem
          <small>{pedidos.length} pedidos · {pedidos.filter(p=>!pedidoCompleto(p)).length} sem definição</small>
        </h1>
        <div className="spacer" />
        <label className="filter-pill">
          <input type="checkbox" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)} />
          Só sem definição
        </label>
        <input ref={fileRef} type="file" accept=".xls,.xlsx" hidden onChange={importar} />
        <button className="btn primary" onClick={() => fileRef.current?.click()} disabled={importando}>
          {importando ? 'Importando…' : '↑ Importar planilha'}
        </button>
        {ehDono && (
          <button className="btn" style={{ color: 'var(--danger)' }} onClick={() => setPainelExcluir((v) => !v)}>
            🗑 Excluir por período
          </button>
        )}
      </div>

      {ehDono && painelExcluir && (
        <div className="filter-pill" style={{ marginBottom: 14, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <b style={{ color: 'var(--danger)' }}>Excluir pedidos por período (data da venda):</b>
          <label>de <input type="date" className="btn" value={perIni} onChange={(e) => setPerIni(e.target.value)} /></label>
          <label>até <input type="date" className="btn" value={perFim} onChange={(e) => setPerFim(e.target.value)} /></label>
          <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>
            {perIni && perFim ? `${pedidosDoPeriodo().length} pedido(s) no período` : 'escolha as duas datas'}
          </span>
          <button className="btn" style={{ color: 'var(--danger)', fontWeight: 700 }}
            disabled={excluindo || !perIni || !perFim || pedidosDoPeriodo().length === 0}
            onClick={excluirPeriodo}>
            {excluindo ? 'Excluindo…' : `Excluir ${perIni && perFim ? pedidosDoPeriodo().length : ''} pedido(s)`}
          </button>
        </div>
      )}

      {msg && <div className="filter-pill" style={{ marginBottom: 14 }}>{msg}</div>}

      {vendedores.length === 0 && (
        <div className="filter-pill" style={{ marginBottom: 14, background: 'rgba(240,180,41,0.13)', color: 'var(--warn)', borderColor: 'rgba(240,180,41,0.35)' }}>
          ⚠ Nenhum vendedor cadastrado — rotas e prazos não serão calculados. Vá em <b>&nbsp;Cadastros&nbsp;</b> e clique em "Importar dados atuais" antes de importar a planilha.
        </div>
      )}

      {lista.length === 0 ? (
        <div className="empty">
          <div className="big">📋</div>
          {pedidos.length === 0 ? 'Importe a planilha do Posseidon ou da Zeus para começar.' : 'Nada pendente — tudo categorizado!'}
        </div>
      ) : (
        <div className="cards">
          {lista.map((p) => (
            <CardTriagem key={p.idVenda} p={p} onCat={categorizar} onCatItem={categorizarItem} clientes={clientes}
              onCidade={definirCidade} onExcluir={ehDono ? excluirPedido : null} />
          ))}
        </div>
      )}

      {resultadoImportacao && (
        <ModalImportacao
          resultado={resultadoImportacao}
          clientes={clientes}
          onFechar={() => setResultadoImportacao(null)}
        />
      )}
    </>
  )
}

function CardTriagem({ p, onCat, onCatItem, onCidade, onExcluir, clientes }) {
  const [editandoCidade, setEditandoCidade] = useState(false)
  const [cidadeNova, setCidadeNova] = useState('')
  const atrasado = situacaoPrazo(p.previsao) === 'atrasado'
  const foraRota = p.rota === 'FORA DE ROTA' || p.rota === 'SEM ROTA'

  async function salvarCidade() {
    if (!cidadeNova.trim()) return
    await onCidade(p, cidadeNova)
    setEditandoCidade(false); setCidadeNova('')
  }

  return (
    <div className={`card ${atrasado ? 'atrasado' : 'em_dia'} ${foraRota ? 'fora-rota' : ''}`}>
      <div className="card-top">
        <div className="cliente">{nomeCliente(p.cliente, clientes)}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="idv">#{p.idVenda}</div>
          {onExcluir && (
            <button className="btn" title="Excluir pedido (admin)"
              style={{ padding: '2px 8px', color: 'var(--danger)' }}
              onClick={() => onExcluir(p)}>✕</button>
          )}
        </div>
      </div>

      <div className="meta-row">
        {p.origem && <span className={`chip origem-${p.origem.toLowerCase()}`}>{ORIGEM_NM[p.origem] || p.origem}</span>}
        <span className="chip">{p.vendedor}</span>
        <span className={`chip ${foraRota ? 'rota-warn' : ''}`}>{p.cidade || '—'} · {p.rota}</span>
        {atrasado
          ? <span className="chip atrasado">Atrasado · {fmtData(p.previsao)}</span>
          : <span className="chip">Entrega {fmtData(p.previsao)}</span>}
      </div>

      {foraRota && !editandoCidade && (
        <button className="btn" style={{ marginTop: 6, fontSize: 12 }}
          onClick={() => { setCidadeNova(p.cidade || ''); setEditandoCidade(true) }}>
          ✎ Definir cidade
        </button>
      )}
      {foraRota && editandoCidade && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          <input className="btn" style={{ flex: 1, minWidth: 120 }} placeholder="Cidade do pedido…"
            value={cidadeNova} autoFocus
            onChange={(e) => setCidadeNova(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && salvarCidade()} />
          <button className="btn ok" onClick={salvarCidade}>Salvar</button>
          <button className="btn" onClick={() => setEditandoCidade(false)}>Cancelar</button>
        </div>
      )}

      <ul className="itens">
        {p.itens.map((it, i) => {
          const m = linhaDoItem(p, i)
          return (
            <li key={i} style={{ alignItems: 'center' }}>
              <span>{it.produto} <span className="g">{it.grupo}</span></span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="q">{it.qtd}</span>
                <span style={{ display: 'inline-flex', gap: 2, marginLeft: 4 }}>
                  {MODO_ORDER.map((opt) => {
                    const sel = m === opt
                    const sigla = opt === 'PRODUCAO' ? 'P' : opt === 'GLICHE' ? 'G' : 'Gr'
                    return (
                      <button key={opt} title={MODO_NM[opt]}
                        onClick={() => onCatItem(p.idVenda, i, opt)}
                        style={{
                          width: 22, height: 22, borderRadius: 4,
                          border: '1px solid ' + (sel ? MODO_COR[opt] : 'var(--border)'),
                          background: sel ? MODO_COR[opt] : 'transparent',
                          color: sel ? '#fff' : MODO_COR[opt],
                          fontWeight: 700, fontSize: 11,
                          cursor: 'pointer', padding: 0,
                          lineHeight: 1,
                        }}>
                        {sigla}
                      </button>
                    )
                  })}
                </span>
              </span>
            </li>
          )
        })}
      </ul>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop: 8, flexWrap: 'wrap', gap: 6 }}>
        <span className="valor">{fmtMoeda(p.valorTotal)}</span>
        {/* pills do estado: mostra quantos itens em cada linha quando dividido */}
        <span style={{ display: 'inline-flex', gap: 4 }}>
          {(() => {
            const cont = {}
            p.itens.forEach((_, i) => {
              const m = linhaDoItem(p, i)
              if (!m) return
              cont[m] = (cont[m] || 0) + 1
            })
            const linhasUsadas = MODO_ORDER.filter((m) => cont[m])
            if (!linhasUsadas.length) return null
            return linhasUsadas.map((m) => (
              <span key={m}
                style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                  background: MODO_COR[m], color: '#fff',
                }}>
                {cont[m]}{m === 'PRODUCAO' ? 'P' : m === 'GLICHE' ? 'G' : 'Gr'}
              </span>
            ))
          })()}
        </span>
      </div>

      <div className="modo-btns">
        {MODO_ORDER.map((m) => {
          // botão grande "ativo" só quando TODOS os itens estão nessa linha
          const todosNela = p.itens.length && p.itens.every((_, i) => linhaDoItem(p, i) === m)
          return (
            <button
              key={m}
              className={`modo-btn ${todosNela ? 'sel-' + m : ''}`}
              onClick={() => onCat(p.idVenda, m)}
              title={`Marcar TODOS os itens como ${MODO_NM[m]}`}
            >
              {MODO_NM[m]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================
// MODAL DE RESUMO DA IMPORTAÇÃO
// Mostra estatísticas, lista de pedidos (com expandir),
// e permite definir apelido dos clientes novos sem sair do modal.
// ============================================================
function ModalImportacao({ resultado, clientes, onFechar }) {
  const { origem, totalLinhas, totalPedidos, novos, atualizadosMantidos, atualizadosNormais, ignorados, clientesNovos } = resultado

  // soma valores (só dos importados, sem os ignorados)
  const importados = [...novos, ...atualizadosNormais, ...atualizadosMantidos]
  const valorTotal = importados.reduce((s, p) => s + (p.valorTotal || 0), 0)
  const totalItens = importados.reduce((s, p) => s + (p.itens?.length || 0), 0)
  const vendedoresSet = new Set(importados.map((p) => p.vendedor).filter(Boolean))
  const datas = importados.map((p) => p.dataVenda).filter(Boolean).sort()
  const periodo = datas.length
    ? `${fmtData(datas[0])}${datas.length > 1 && datas[0] !== datas[datas.length - 1] ? ' a ' + fmtData(datas[datas.length - 1]) : ''}`
    : '—'

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onFechar}>
      <div className="card em_dia" style={{ maxWidth: 720, width: '100%', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="card-top">
          <div className="cliente">📥 Importação da {ORIGEM_NM[origem] || origem}</div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, marginTop: 10 }}>
          {/* Resumo numérico */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginBottom: 14 }}>
            <CaixaResumo num={totalLinhas} label="linhas na planilha" />
            <CaixaResumo num={totalPedidos} label="pedidos identificados" />
            <CaixaResumo num={novos.length} label="novos" cor="var(--ok)" />
            <CaixaResumo num={atualizadosMantidos.length + atualizadosNormais.length} label="atualizados" />
            {ignorados.length > 0 && <CaixaResumo num={ignorados.length} label="ignorados (entregues)" cor="var(--warn)" />}
          </div>

          {/* Totais */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            <span className="chip">💰 {fmtMoeda(valorTotal)}</span>
            <span className="chip">📦 {totalItens} itens</span>
            <span className="chip">👤 {vendedoresSet.size} vendedor(es)</span>
            <span className="chip">📅 {periodo}</span>
          </div>

          {/* Clientes novos capturados — com edição de apelido inline */}
          {clientesNovos.length > 0 && (
            <SecaoClientesNovos clientesNovos={clientesNovos} clientes={clientes} />
          )}

          {/* Seções de pedidos */}
          {novos.length > 0 && (
            <SecaoPedidos titulo={`✨ Novos (${novos.length})`} pedidos={novos} clientes={clientes} cor="var(--ok)" />
          )}
          {atualizadosNormais.length > 0 && (
            <SecaoPedidos titulo={`🔄 Atualizados (${atualizadosNormais.length})`} pedidos={atualizadosNormais} clientes={clientes} />
          )}
          {atualizadosMantidos.length > 0 && (
            <SecaoPedidos titulo={`🔒 Já categorizados — categoria mantida (${atualizadosMantidos.length})`} pedidos={atualizadosMantidos} clientes={clientes} />
          )}
          {ignorados.length > 0 && (
            <SecaoIgnorados ignorados={ignorados} clientes={clientes} />
          )}

          {importados.length === 0 && ignorados.length === 0 && (
            <div className="empty" style={{ padding: 20 }}>
              <div className="big">🤔</div>
              Nada para importar.
            </div>
          )}
        </div>

        <button className="btn primary" style={{ marginTop: 12, justifyContent: 'center' }}
          onClick={onFechar}>
          Fechar
        </button>
      </div>
    </div>
  )
}

function CaixaResumo({ num, label, cor }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: cor || 'var(--text)', lineHeight: 1 }}>{num}</div>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>{label}</div>
    </div>
  )
}

function SecaoPedidos({ titulo, pedidos, clientes, cor }) {
  const [expandido, setExpandido] = useState(new Set())
  function toggle(id) {
    const novo = new Set(expandido)
    novo.has(id) ? novo.delete(id) : novo.add(id)
    setExpandido(novo)
  }
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: cor || 'var(--text-dim)', marginBottom: 6 }}>
        {titulo}
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 6 }}>
        {pedidos.map((p, i) => {
          const aberto = expandido.has(p.idVenda)
          return (
            <div key={p.idVenda}
              style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
              <div onClick={() => toggle(p.idVenda)}
                style={{ padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-faint)', minWidth: 60 }}>#{p.idVenda}</span>
                <span style={{ flex: 1 }}>{nomeCliente(p.cliente, clientes)}</span>
                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{p.itens?.length || 0} item(ns)</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{fmtMoeda(p.valorTotal)}</span>
                <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>{aberto ? '▲' : '▼'}</span>
              </div>
              {aberto && p.itens?.length > 0 && (
                <ul className="itens" style={{ borderTop: '1px dashed var(--border)', margin: '0 10px', padding: '6px 0' }}>
                  {p.itens.map((it, j) => (
                    <li key={j}>
                      <span>{it.produto} <span className="g">{it.grupo}</span></span>
                      <span className="q">{it.qtd}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SecaoIgnorados({ ignorados, clientes }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--warn)', marginBottom: 6 }}>
        ⚠ Já entregues — ignorados ({ignorados.length})
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 6 }}>
        Estes pedidos já estão no histórico de Entregues. Não voltaram para a Triagem.
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 6 }}>
        {ignorados.map((e, i) => (
          <div key={e.id}
            style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
              borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-faint)', minWidth: 60 }}>#{e.id}</span>
            <span style={{ flex: 1 }}>{nomeCliente(e.cliente, clientes)}</span>
            <span className="q">✓ {fmtData(e.entregueEm)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SecaoClientesNovos({ clientesNovos, clientes }) {
  // estado local: razão -> apelido que está sendo digitado.
  // Cliente sem apelido no banco = razão social vai aparecer nos cards (fallback automático).
  const [edicoes, setEdicoes] = useState({})
  const [salvos, setSalvos] = useState(new Set())

  async function salvarApelido(razao) {
    const apelido = (edicoes[razao] || '').trim()
    if (!apelido) return // vazio = mantém só a razão social, nada a salvar
    // pega a lista mais atual do contexto e atualiza só esse cliente
    const idx = clientes.findIndex((c) => normaliza(c.razao) === normaliza(razao))
    if (idx === -1) return // estranho, mas defensivo
    const lista = clientes.map((c, i) => (i === idx ? { ...c, nome: apelido } : c))
    await setDoc(doc(db, 'config', 'cadastros'), { clientes: lista }, { merge: true })
    const novo = new Set(salvos); novo.add(razao); setSalvos(novo)
  }

  return (
    <div style={{ marginBottom: 16, padding: 10, border: '1px dashed var(--accent)', borderRadius: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', marginBottom: 4 }}>
        🏷️ {clientesNovos.length} cliente(s) novo(s) cadastrado(s) automaticamente
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>
        Defina um apelido agora (opcional) ou faça depois em Cadastros → Clientes. Sem apelido, os cards
        mostram a razão social.
      </div>
      {clientesNovos.map((c) => {
        const jaSalvo = salvos.has(c.razao)
        return (
          <div key={c.razao} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text-dim)', flex: '1 1 220px', minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.razao}>
              {c.razao}
            </span>
            <input
              placeholder="Apelido"
              value={edicoes[c.razao] || ''}
              onChange={(e) => setEdicoes({ ...edicoes, [c.razao]: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && salvarApelido(c.razao)}
              style={{ width: 160, background: 'var(--surface-2)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '5px 8px', color: 'var(--text)', fontSize: 13 }}
            />
            {jaSalvo
              ? <span style={{ fontSize: 12, color: 'var(--ok)' }}>✓ salvo</span>
              : <button className="btn" style={{ padding: '4px 10px', fontSize: 12 }}
                  onClick={() => salvarApelido(c.razao)}>Salvar</button>}
          </div>
        )
      })}
    </div>
  )
}
