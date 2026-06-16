import { useState } from 'react'
import { doc, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { fmtData, fmtMoeda, situacaoPrazo, ORIGEM_NM, filtraPedidos, vendedoresDe, resumoFiltros } from '../utils.js'
import FiltrosBar from '../components/FiltrosBar.jsx'

export default function Rota({ pedidos }) {
  const [filtros, setFiltros] = useState({})

  const categorizados = pedidos.filter((p) => p.status)
  const vendedores = vendedoresDe(categorizados)
  const lista = filtraPedidos(categorizados, filtros)

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
    await setDoc(doc(db, 'entregues', p.idVenda), {
      ...p,
      entregueEm: new Date().toISOString(),
    })
    await deleteDoc(doc(db, 'pedidos', p.idVenda))
  }

  const vendedoresOrd = Object.keys(arvore).sort()
  const filtrado = lista.length !== categorizados.length

  return (
    <>
      <div className="toolbar no-print">
        <h1 className="page-title">Lista de Rota
          <small>
            {filtrado
              ? `${lista.length} de ${categorizados.length} pedidos`
              : `${lista.length} pedidos para entregar`}
          </small>
        </h1>
        <div className="spacer" />
        <button className="btn" onClick={() => window.print()}>🖨 Imprimir</button>
      </div>

      <FiltrosBar filtros={filtros} setFiltros={setFiltros} vendedores={vendedores} />

      {/* ---------- TELA ---------- */}
      <div className="screen-only">
        {lista.length === 0 ? (
          <div className="empty"><div className="big">🗺️</div>
            {categorizados.length === 0 ? 'Nada para carregar no momento.' : 'Nenhum pedido com esses filtros.'}
          </div>
        ) : (
          vendedoresOrd.map((vend) => (
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
                                  {p.origem && <span className={`chip origem-${p.origem.toLowerCase()}`}>{ORIGEM_NM[p.origem] || p.origem}</span>}
                                  <span className={`chip ${foraRota ? 'rota-warn' : ''}`}>📍 {p.cidade || '—'}</span>
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
      </div>

      {/* ---------- IMPRESSÃO (ROMANEIO) ---------- */}
      <ImpressaoRota
        arvore={arvore} vendedoresOrd={vendedoresOrd}
        filtros={filtros} total={lista.length}
      />
    </>
  )
}

// ============================ ROMANEIO DE ENTREGA ============================
function ImpressaoRota({ arvore, vendedoresOrd, filtros, total }) {
  const hoje = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  const resumo = resumoFiltros(filtros)
  return (
    <div className="print-only">
      <div className="pr-head">
        <h1>JC Sacolas · Romaneio de Entrega</h1>
        <div className="meta">
          Impresso em {hoje}<br />
          {total} entrega(s)
          {resumo && <><br />{resumo}</>}
        </div>
      </div>

      {vendedoresOrd.map((vend) => {
        // data(s) de entrega deste vendedor — a mesma que aparece na tela, abaixo do nome
        const datasVend = [...new Set(
          Object.values(arvore[vend])
            .flatMap((clientes) => Object.values(clientes))
            .flat()
            .map((p) => fmtData(p.previsao))
        )].join(' · ')
        return (
        <div key={vend} className="pr-block">
          <div className="pr-vend">{vend}</div>
          <div className="pr-data">Entrega: {datasVend}</div>
          {Object.entries(arvore[vend]).sort().map(([rota, clientes]) => (
            <div key={rota}>
              <div className="pr-rota forte">{rota} · {Object.keys(clientes).length} cliente(s)</div>
              {Object.entries(clientes).map(([cliente, ps]) => (
                <div key={cliente} className="pr-ped parada">
                  <div className="top">
                    <span className="box" />
                    <span className="nm">{cliente}</span>
                    <span className="cid">— {ps[0].cidade || '—'}</span>
                    <span className="ent">{fmtData(ps[0].previsao)}</span>
                  </div>
                  <table className="pr-itens"><tbody>
                    {ps.flatMap((p) => p.itens.map((it, i) => (
                      <tr key={`${p.idVenda}-${i}`}>
                        <td>{it.produto} <span className="ref">#{p.idVenda}</span></td>
                        <td className="q">{it.qtd}</td>
                      </tr>
                    )))}
                  </tbody></table>
                  <div className="pr-sign">
                    Recebido por: ______________________________   Obs: ______________________
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
        )
      })}
    </div>
  )
}
