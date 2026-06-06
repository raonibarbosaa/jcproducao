import { doc, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { fmtData, fmtMoeda, situacaoPrazo } from '../utils.js'

export default function Rota({ pedidos }) {
  // só pedidos categorizados entram na lista de rota (estão em produção)
  const lista = pedidos.filter((p) => p.status)

  // agrupa: Vendedor -> Rota -> Cliente -> pedidos
  const arvore = {}
  for (const p of lista) {
    const vend = p.vendedor || '—'
    const rota = p.rota || 'SEM ROTA'
    arvore[vend] ??= {}
    arvore[vend][rota] ??= {}
    arvore[vend][rota][p.cliente] ??= []
    arvore[vend][rota][p.cliente].push(p)
  }

  async function entregar(p) {
    if (!confirm(`Confirmar entrega do pedido #${p.idVenda} — ${p.cliente}?`)) return
    // move para 'entregues' e remove de 'pedidos'
    await setDoc(doc(db, 'entregues', p.idVenda), {
      ...p,
      entregueEm: new Date().toISOString(),
    })
    await deleteDoc(doc(db, 'pedidos', p.idVenda))
  }

  const vendedores = Object.keys(arvore).sort()

  return (
    <>
      <div className="toolbar">
        <h1 className="page-title">Lista de Rota
          <small>{lista.length} pedidos para entregar</small>
        </h1>
        <div className="spacer" />
        <button className="btn" onClick={() => window.print()}>🖨 Imprimir</button>
      </div>

      {lista.length === 0 ? (
        <div className="empty"><div className="big">🗺️</div>Nada para carregar no momento.</div>
      ) : (
        vendedores.map((vend) => (
          <div key={vend} className="group-block">
            <div className="group-head"><h3>{vend}</h3></div>
            {Object.entries(arvore[vend]).sort().map(([rota, clientes]) => {
              const foraRota = rota === 'FORA DE ROTA' || rota === 'SEM ROTA'
              return (
                <div key={rota} style={{ marginBottom: 16 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, margin:'8px 0' }}>
                    <span className={`chip ${foraRota ? 'rota-warn' : ''}`} style={{ fontSize: 13 }}>
                      {rota}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                      {Object.keys(clientes).length} cliente(s)
                    </span>
                  </div>
                  <div className="cards">
                    {Object.entries(clientes).map(([cliente, ps]) => (
                      <div key={cliente} className="card em_dia">
                        <div className="card-top">
                          <div className="cliente">{cliente}</div>
                        </div>
                        {ps.map((p) => {
                          const atrasado = situacaoPrazo(p.previsao) === 'atrasado'
                          return (
                            <div key={p.idVenda} style={{ borderTop: '1px dashed var(--border)', paddingTop: 8, marginTop: 8 }}>
                              <div className="meta-row">
                                <span className="idv">#{p.idVenda}</span>
                                {atrasado
                                  ? <span className="chip atrasado">Atrasado · {fmtData(p.previsao)}</span>
                                  : <span className="chip">{fmtData(p.previsao)}</span>}
                                <span className="valor" style={{ marginLeft:'auto' }}>{fmtMoeda(p.valorTotal)}</span>
                              </div>
                              <ul className="itens">
                                {p.itens.map((it, i) => (
                                  <li key={i}><span>{it.produto}</span><span className="q">{it.qtd}</span></li>
                                ))}
                              </ul>
                              <button className="btn ok no-print" style={{ width:'100%', justifyContent:'center', marginTop: 8 }}
                                onClick={() => entregar(p)}>
                                ✓ Entregue
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ))
      )}
    </>
  )
}
