import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase.js'
import { fmtData, fmtMoeda } from '../utils.js'

export default function Entregues() {
  const [itens, setItens] = useState([])
  const [busca, setBusca] = useState('')

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'entregues'), (snap) => {
      setItens(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [])

  const lista = itens
    .filter((p) =>
      !busca ||
      p.cliente?.toLowerCase().includes(busca.toLowerCase()) ||
      String(p.idVenda).includes(busca) ||
      p.cidade?.toLowerCase().includes(busca.toLowerCase())
    )
    .sort((a, b) => new Date(b.entregueEm) - new Date(a.entregueEm))

  const totalMes = lista.reduce((s, p) => s + (Number(p.valorTotal) || 0), 0)

  return (
    <>
      <div className="toolbar">
        <h1 className="page-title">Entregues
          <small>{lista.length} pedidos · {fmtMoeda(totalMes)}</small>
        </h1>
        <div className="spacer" />
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
                <div className="cliente">{p.cliente}</div>
                <div className="idv">#{p.idVenda}</div>
              </div>
              <div className="meta-row">
                <span className="chip">{p.vendedor}</span>
                <span className="chip">{p.cidade}</span>
                <span className="chip" style={{ color: 'var(--ok)' }}>✓ {fmtData(p.entregueEm)}</span>
              </div>
              <ul className="itens">
                {p.itens?.map((it, i) => (
                  <li key={i}><span>{it.produto}</span><span className="q">{it.qtd}</span></li>
                ))}
              </ul>
              <div className="valor" style={{ marginTop: 8 }}>{fmtMoeda(p.valorTotal)}</div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
