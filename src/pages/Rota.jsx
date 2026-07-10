import { useState } from 'react'
import { doc, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { fmtData, fmtMoeda, situacaoPrazo, ORIGEM_NM, filtraPedidos, vendedoresDe, resumoFiltros, previsaoDe, nomeCliente } from '../utils.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import FiltrosBar from '../components/FiltrosBar.jsx'
import DataEntrega from '../components/DataEntrega.jsx'

export default function Rota({ pedidos }) {
  const { vendedores: cadastros, clientes, motoristas } = useCadastros()
  const [filtros, setFiltros] = useState({})
  const [motoristaSel, setMotoristaSel] = useState({}) // { "vendedor|rota": nome do motorista }
  const motoristasAtivos = motoristas.filter((m) => m.ativo !== false)

  // recalcula a previsão de entrega com o calendário ATUAL do Cadastro
  const base = pedidos.map((p) => ({ ...p, previsao: previsaoDe(p, cadastros) }))
  const categorizados = base.filter((p) => p.status)
  const vendedores = vendedoresDe(categorizados)
  const lista = filtraPedidos(categorizados, filtros, clientes)

  // agrupa: Vendedor -> Rota -> Cliente -> pedidos
  const arvore = {}
  for (const p of lista) {
    const vend = p.vendedor || '—'
    const rota = p.rota || 'SEM ROTA'
    arvore[vend] ??= {}
    arvore[vend][rota] ??= {}
    const nomeCli = nomeCliente(p.cliente, clientes)
    arvore[vend][rota][nomeCli] ??= []
    arvore[vend][rota][nomeCli].push(p)
  }

  // grava 1 pedido como entregue (com o motorista escolhido) e tira de pedidos
  async function gravarEntrega(p, motorista) {
    await setDoc(doc(db, 'entregues', p.idVenda), {
      ...p,
      motorista: motorista || '',
      entregueEm: new Date().toISOString(),
    })
    await deleteDoc(doc(db, 'pedidos', p.idVenda))
  }

  async function entregar(p, motorista) {
    if (motoristasAtivos.length > 0 && !motorista) {
      alert('Escolha o motorista no seletor da rota antes de marcar como entregue.')
      return
    }
    if (!confirm(`Confirmar entrega do pedido #${p.idVenda} — ${nomeCliente(p.cliente, clientes)}${motorista ? ` por ${motorista}` : ''}?`)) return
    await gravarEntrega(p, motorista)
  }

  // marca todos os pedidos de uma rota como entregues, com o mesmo motorista
  async function entregarRota(vend, rota, ps) {
    const motorista = motoristaSel[`${vend}|${rota}`] || ''
    if (motoristasAtivos.length > 0 && !motorista) {
      alert('Escolha o motorista antes de entregar a rota toda.')
      return
    }
    if (!confirm(`Marcar TODOS os ${ps.length} pedido(s) da ${rota} (${vend}) como entregues${motorista ? ` por ${motorista}` : ''}?`)) return
    for (const p of ps) await gravarEntrega(p, motorista)
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
                    <div className={`rota-band ${foraRota ? 'warn' : ''}`}>
                      <span className="rb-nome">📍 {rota}</span>
                      <span className="rb-count">
                        {Object.keys(clientes).length} cliente(s)
                      </span>
                      {motoristasAtivos.length > 0 ? (
                        <div className="no-print" style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginLeft:'auto' }}>
                          <select className="btn" value={motoristaSel[`${vend}|${rota}`] || ''}
                            onChange={(e) => setMotoristaSel((s) => ({ ...s, [`${vend}|${rota}`]: e.target.value }))}>
                            <option value="">🚚 Motorista…</option>
                            {motoristasAtivos.map((m, i) => <option key={i} value={m.nome}>{m.nome}</option>)}
                          </select>
                          <button className="btn ok" onClick={() => entregarRota(vend, rota, Object.values(clientes).flat())}>
                            ✓ Entregar rota toda
                          </button>
                        </div>
                      ) : (
                        <span className="no-print" style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                          🚚 cadastre motoristas em Cadastros › Motoristas para escolher na entrega
                        </span>
                      )}
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
                                  <DataEntrega p={p} atrasado={atrasado} />
                                  <span className="valor" style={{ marginLeft:'auto' }}>{fmtMoeda(p.valorTotal)}</span>
                                </div>
                                <ul className="itens">
                                  {p.itens.map((it, i) => (
                                    <li key={i}><span>{it.produto}</span><span className="q">{it.qtd}</span></li>
                                  ))}
                                </ul>
                                <button className="btn ok no-print" style={{ width:'100%', justifyContent:'center', marginTop: 8 }}
                                  onClick={() => entregar(p, motoristaSel[`${vend}|${rota}`] || '')}>
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
        filtros={filtros} total={lista.length} motoristaSel={motoristaSel}
      />
    </>
  )
}

// ============================ ROMANEIO DE ENTREGA ============================
function ImpressaoRota({ arvore, vendedoresOrd, filtros, total, motoristaSel = {} }) {
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
          {Object.entries(arvore[vend]).sort().map(([rota, clientes]) => {
            const motoristaRota = motoristaSel[`${vend}|${rota}`]
            return (
            <div key={rota}>
              <div className="pr-rota forte">
                {rota} · {Object.keys(clientes).length} cliente(s)
                {motoristaRota ? ` · 🚚 ${motoristaRota}` : ''}
              </div>
              {Object.entries(clientes).map(([cliente, ps]) => {
                const totalParada = ps.reduce((s, p) => s + (p.valorTotal || 0), 0)
                return (
                <div key={cliente} className="pr-ped parada">
                  <div className="top">
                    <span className="box" />
                    <span className="nm">{cliente}</span>
                    <span className="cid">— {ps[0].cidade || '—'}</span>
                    <span className="ent">{fmtData(ps[0].previsao)}</span>
                    <span className="val">{fmtMoeda(totalParada)}</span>
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
                )
              })}
            </div>
            )
          })}
        </div>
        )
      })}
    </div>
  )
}
