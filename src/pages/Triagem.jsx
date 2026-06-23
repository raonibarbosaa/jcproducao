import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { doc, setDoc, deleteDoc, writeBatch, collection, getDocs, query, where, documentId } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import {
  mapeiaColunas, agrupaPedidos, MODO_ORDER, MODO_NM, MODO_COR,
  fmtData, fmtMoeda, situacaoPrazo, detectaRota,
  detectaOrigem, mapeiaColunasZeus, agrupaPedidosZeus, ORIGEM_NM, nomeCliente,
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
  const [modalEntregues, setModalEntregues] = useState(null) // lista de pedidos ignorados ou null

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

      // grava em lote (máx. 500 operações por lote no Firestore).
      // Mantém status/obs/cidade já definidos se o pedido já existia.
      const existentes = Object.fromEntries(pedidos.map((p) => [p.idVenda, p]))
      let add = 0, mant = 0
      for (let i = 0; i < aImportar.length; i += 450) {
        const batch = writeBatch(db)
        for (const p of aImportar.slice(i, i + 450)) {
          const ja = existentes[p.idVenda]
          const dados = { ...p }
          if (ja && ja.status) { dados.status = ja.status; mant++ }
          if (ja && ja.obs) dados.obs = ja.obs || dados.obs
          // cidade definida manualmente não pode ser apagada por planilha sem cidade (Zeus)
          if (ja && ja.cidade && !dados.cidade) { dados.cidade = ja.cidade; dados.rota = ja.rota }
          batch.set(doc(db, 'pedidos', p.idVenda), dados, { merge: true })
          if (!ja) add++
        }
        await batch.commit()
      }
      setMsg(
        `Importado da ${ORIGEM_NM[origem]}: ${aImportar.length} pedidos ` +
        `(${add} novos, ${mant} já categorizados mantidos` +
        (jaEntregues.length ? `, ${jaEntregues.length} ignorados — já entregues` : '') + ').'
      )
      if (jaEntregues.length) setModalEntregues(jaEntregues)
    } catch (err) {
      console.error(err)
      setMsg('Erro ao importar: ' + err.message)
    } finally {
      setImportando(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function categorizar(idVenda, status) {
    // toggle: clicar de novo na mesma linha remove
    const atual = pedidos.find((p) => p.idVenda === idVenda)?.status
    const novo = atual === status ? '' : status
    await setDoc(doc(db, 'pedidos', idVenda), { status: novo }, { merge: true })
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

  const lista = (soPendentes ? pedidos.filter((p) => !p.status) : pedidos)
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
          <small>{pedidos.length} pedidos · {pedidos.filter(p=>!p.status).length} sem definição</small>
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
            <CardTriagem key={p.idVenda} p={p} onCat={categorizar} clientes={clientes}
              onCidade={definirCidade} onExcluir={ehDono ? excluirPedido : null} />
          ))}
        </div>
      )}

      {modalEntregues && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setModalEntregues(null)}>
          <div className="card em_dia" style={{ maxWidth: 540, width: '100%', maxHeight: '80vh',
            display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="card-top">
              <div className="cliente">⚠ Pedidos já entregues — não importados</div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '6px 0 10px' }}>
              Estes {modalEntregues.length} pedido(s) da planilha já constam no histórico de
              <b> Entregues</b> e foram ignorados para não voltarem à triagem:
            </p>
            <ul className="itens" style={{ overflowY: 'auto', flex: 1 }}>
              {modalEntregues.map((e) => (
                <li key={e.id}>
                  <span>
                    #{e.id} · {nomeCliente(e.cliente, clientes)}
                    {e.origem && <span className={`chip origem-${e.origem.toLowerCase()}`} style={{ marginLeft: 6 }}>{ORIGEM_NM[e.origem] || e.origem}</span>}
                  </span>
                  <span className="q">✓ {fmtData(e.entregueEm)}</span>
                </li>
              ))}
            </ul>
            <button className="btn primary" style={{ marginTop: 12, justifyContent: 'center' }}
              onClick={() => setModalEntregues(null)}>
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function CardTriagem({ p, onCat, onCidade, onExcluir, clientes }) {
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
        {p.itens.map((it, i) => (
          <li key={i}>
            <span>{it.produto} <span className="g">{it.grupo}</span></span>
            <span className="q">{it.qtd}</span>
          </li>
        ))}
      </ul>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop: 8 }}>
        <span className="valor">{fmtMoeda(p.valorTotal)}</span>
      </div>

      <div className="modo-btns">
        {MODO_ORDER.map((m) => (
          <button
            key={m}
            className={`modo-btn ${p.status === m ? 'sel-' + m : ''}`}
            onClick={() => onCat(p.idVenda, m)}
          >
            {MODO_NM[m]}
          </button>
        ))}
      </div>
    </div>
  )
}
