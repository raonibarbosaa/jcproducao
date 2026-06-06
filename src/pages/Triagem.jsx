import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { doc, setDoc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import {
  mapeiaColunas, agrupaPedidos, MODO_ORDER, MODO_NM, MODO_COR,
  fmtData, fmtMoeda, situacaoPrazo,
} from '../utils.js'

export default function Triagem({ pedidos }) {
  const { vendedores } = useCadastros()
  const fileRef = useRef(null)
  const [soPendentes, setSoPendentes] = useState(false)
  const [msg, setMsg] = useState('')
  const [importando, setImportando] = useState(false)

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

      const mapa = mapeiaColunas(Object.keys(linhas[0]))
      if (!mapa.id || !mapa.cliente) {
        setMsg('Não encontrei as colunas ID Venda / Cliente. Confira o arquivo.')
        setImportando(false); return
      }
      const novos = agrupaPedidos(linhas, mapa, vendedores)

      // grava em lote. Mantém status já definido se o pedido já existia.
      const existentes = Object.fromEntries(pedidos.map((p) => [p.idVenda, p]))
      const batch = writeBatch(db)
      let add = 0, mant = 0
      for (const p of novos) {
        const ja = existentes[p.idVenda]
        const dados = { ...p }
        if (ja && ja.status) { dados.status = ja.status; mant++ }
        if (ja && ja.obs) dados.obs = ja.obs || dados.obs
        batch.set(doc(db, 'pedidos', p.idVenda), dados, { merge: true })
        if (!ja) add++
      }
      await batch.commit()
      setMsg(`Importado: ${novos.length} pedidos (${add} novos, ${mant} já categorizados mantidos).`)
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
      </div>

      {msg && <div className="filter-pill" style={{ marginBottom: 14 }}>{msg}</div>}

      {vendedores.length === 0 && (
        <div className="filter-pill" style={{ marginBottom: 14, background: 'rgba(240,180,41,0.13)', color: 'var(--warn)', borderColor: 'rgba(240,180,41,0.35)' }}>
          ⚠ Nenhum vendedor cadastrado — rotas e prazos não serão calculados. Vá em <b>&nbsp;Cadastros&nbsp;</b> e clique em "Importar dados atuais" antes de importar a planilha.
        </div>
      )}

      {lista.length === 0 ? (
        <div className="empty">
          <div className="big">📋</div>
          {pedidos.length === 0 ? 'Importe a planilha do Posseidon para começar.' : 'Nada pendente — tudo categorizado!'}
        </div>
      ) : (
        <div className="cards">
          {lista.map((p) => <CardTriagem key={p.idVenda} p={p} onCat={categorizar} />)}
        </div>
      )}
    </>
  )
}

function CardTriagem({ p, onCat }) {
  const atrasado = situacaoPrazo(p.previsao) === 'atrasado'
  const foraRota = p.rota === 'FORA DE ROTA' || p.rota === 'SEM ROTA'
  return (
    <div className={`card ${atrasado ? 'atrasado' : 'em_dia'} ${foraRota ? 'fora-rota' : ''}`}>
      <div className="card-top">
        <div className="cliente">{p.cliente}</div>
        <div className="idv">#{p.idVenda}</div>
      </div>

      <div className="meta-row">
        <span className="chip">{p.vendedor}</span>
        <span className={`chip ${foraRota ? 'rota-warn' : ''}`}>{p.cidade} · {p.rota}</span>
        {atrasado
          ? <span className="chip atrasado">Atrasado · {fmtData(p.previsao)}</span>
          : <span className="chip">Entrega {fmtData(p.previsao)}</span>}
      </div>

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
