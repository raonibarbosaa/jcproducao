import { useEffect, useState } from 'react'
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc, deleteField } from 'firebase/firestore'
import { db } from '../firebase.js'
import { fmtData, fmtMoeda, ORIGEM_NM, nomeCliente, ehGrafica } from '../utils.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'

export default function Entregues() {
  const [itens, setItens] = useState([])
  const { clientes } = useCadastros()
  const { perfil, nome } = useAuth()
  const podeCancelar = perfil === 'dono' || perfil === 'designer'
  const podeBaixa = perfil === 'dono' || perfil === 'financeiro'   // baixa financeira
  const podeRetornar = perfil === 'dono' || perfil === 'designer' || perfil === 'financeiro' // não foi entregue
  const [busca, setBusca] = useState('')
  const [motoristaFiltro, setMotoristaFiltro] = useState('')
  const [soPendentes, setSoPendentes] = useState(false)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'entregues'), (snap) => {
      setItens(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [])

  // motoristas que aparecem no histórico (inclui inativos/antigos)
  const motoristasNasEntregas = [...new Set(itens.map((p) => p.motorista).filter(Boolean))].sort()

  // desfaz a entrega: devolve o pedido ao fluxo (volta pra Rota/Produção) e sai do histórico
  async function cancelarEntrega(p) {
    if (!confirm(`Cancelar a entrega do pedido #${p.idVenda} — ${nomeCliente(p.cliente, clientes)}? Ele volta para a lista de rota.`)) return
    const { id, entregueEm, motorista, pago, pagoPor, pagoEm, ...pedido } = p
    await setDoc(doc(db, 'pedidos', p.idVenda), pedido)
    await deleteDoc(doc(db, 'entregues', p.idVenda))
  }

  // não foi entregue: devolve o pedido para a EXPEDIÇÃO (volta ao quadro de produção)
  async function retornarExpedicao(p) {
    if (!confirm(`O pedido #${p.idVenda} — ${nomeCliente(p.cliente, clientes)} NÃO foi entregue? Ele volta para a Expedição no quadro de produção.`)) return
    const { id, entregueEm, motorista, pago, pagoPor, pagoEm, ...pedido } = p
    await setDoc(doc(db, 'pedidos', p.idVenda), {
      ...pedido, etapa: 'expedicao', etapaPor: nome || '', etapaEm: new Date().toISOString(),
    })
    await deleteDoc(doc(db, 'entregues', p.idVenda))
  }

  // baixa financeira: confirma o pagamento e fecha o pedido
  async function darBaixa(p) {
    await updateDoc(doc(db, 'entregues', p.idVenda), {
      pago: true, pagoPor: nome || '', pagoEm: new Date().toISOString(),
    })
  }
  async function desfazerBaixa(p) {
    if (!confirm(`Reabrir o pagamento do pedido #${p.idVenda}? Ele volta para "pendente".`)) return
    await updateDoc(doc(db, 'entregues', p.idVenda), {
      pago: false, pagoPor: deleteField(), pagoEm: deleteField(),
    })
  }

  const lista = itens
    .filter((p) =>
      !busca ||
      nomeCliente(p.cliente, clientes).toLowerCase().includes(busca.toLowerCase()) ||
      p.cliente?.toLowerCase().includes(busca.toLowerCase()) ||
      String(p.idVenda).includes(busca) ||
      p.cidade?.toLowerCase().includes(busca.toLowerCase())
    )
    .filter((p) => {
      if (!motoristaFiltro) return true
      if (motoristaFiltro === '__sem__') return !p.motorista
      return p.motorista === motoristaFiltro
    })
    .filter((p) => !soPendentes || !p.pago)
    .sort((a, b) => new Date(b.entregueEm) - new Date(a.entregueEm))

  const totalMes = lista.reduce((s, p) => s + (Number(p.valorTotal) || 0), 0)
  const nPendentes = itens.filter((p) => !p.pago).length

  return (
    <>
      <div className="toolbar">
        <h1 className="page-title">Entregues
          <small>{lista.length} pedidos · {fmtMoeda(totalMes)}{nPendentes > 0 ? ` · ${nPendentes} pendente(s) de baixa` : ''}</small>
        </h1>
        <div className="spacer" />
        {(podeBaixa || nPendentes > 0) && (
          <label className="filter-pill">
            <input type="checkbox" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)} />
            Só pendentes de baixa
          </label>
        )}
        {motoristasNasEntregas.length > 0 && (
          <select className="btn" style={{ minWidth: 170 }}
            value={motoristaFiltro} onChange={(e) => setMotoristaFiltro(e.target.value)}>
            <option value="">🚚 Todos os motoristas</option>
            {motoristasNasEntregas.map((m, i) => <option key={i} value={m}>{m}</option>)}
            <option value="__sem__">— sem motorista —</option>
          </select>
        )}
        <input className="btn" style={{ minWidth: 200 }} placeholder="Buscar cliente/cidade/ID…"
          value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      {lista.length === 0 ? (
        <div className="empty"><div className="big">📦</div>Nenhuma entrega registrada ainda.</div>
      ) : (
        <div className="cards">
          {lista.map((p) => (
            <div key={p.idVenda} className="card em_dia">
              <div className="card-top">
                <div className="cliente">{nomeCliente(p.cliente, clientes)}</div>
                <div className="idv">#{p.idVenda}</div>
              </div>
              <div className="meta-row">
                {p.origem && <span className={`chip origem-${p.origem.toLowerCase()}`}>{ORIGEM_NM[p.origem] || p.origem}</span>}
                <span className="chip">{p.vendedor}</span>
                <span className="chip">{p.cidade || '—'}</span>
                {p.motorista && <span className="chip">🚚 {p.motorista}</span>}
                <span className="chip" style={{ color: 'var(--ok)' }}>✓ {fmtData(p.entregueEm)}</span>
                {p.pago
                  ? <span className="chip" style={{ borderColor: 'var(--ok)', color: 'var(--ok)' }} title={`Baixa por ${p.pagoPor || '—'}${p.pagoEm ? ` em ${fmtData(p.pagoEm)}` : ''}`}>💰 pago</span>
                  : <span className="chip rota-warn">⏳ pendente de baixa</span>}
              </div>
              <ul className="itens">
                {p.itens?.map((it, i) => (
                  <li key={i}><span>{it.produto}</span><span className="q">{it.qtd}</span></li>
                ))}
              </ul>
              <div className="valor" style={{ marginTop: 8 }}>{fmtMoeda(p.valorTotal)}</div>
              {(podeCancelar || podeBaixa || podeRetornar) && (
                <div className="modo-btns" style={{ marginTop: 10 }}>
                  {podeBaixa && (
                    p.pago
                      ? <button className="modo-btn" onClick={() => desfazerBaixa(p)}>↩ desfazer baixa</button>
                      : <button className="modo-btn" onClick={() => darBaixa(p)} style={{ color: 'var(--ok)', borderColor: 'var(--ok)' }}>💰 Dar baixa (pago)</button>
                  )}
                  {podeRetornar && ehGrafica(p) && (
                    <button className="modo-btn" onClick={() => retornarExpedicao(p)} style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }}>
                      ↩ Retornar para Expedição
                    </button>
                  )}
                  {podeCancelar && (
                    <button className="modo-btn" onClick={() => cancelarEntrega(p)} style={{ color: 'var(--danger)' }}>
                      ↩ Cancelar entrega
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
