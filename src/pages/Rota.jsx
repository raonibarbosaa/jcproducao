import { useState, useEffect } from 'react'
import { doc, setDoc, deleteDoc, updateDoc, writeBatch, deleteField } from 'firebase/firestore'
import { db } from '../firebase.js'
import { fmtData, fmtMoeda, situacaoPrazo, ORIGEM_NM, filtraPedidos, vendedoresDe, resumoFiltros, previsaoDe, nomeCliente, totaisPorMaterial, somaTotais, TOTAIS_ZERO, fmtTotais, fatiaProntos, keyDoItem, saiuParaEntrega, fmtDataHora } from '../utils.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import FiltrosBar from '../components/FiltrosBar.jsx'
import DataEntrega from '../components/DataEntrega.jsx'
import SeloLinha from '../components/SeloLinha.jsx'

export default function Rota({ pedidos }) {
  const { vendedores: cadastros, clientes, motoristas, itens: itensCad } = useCadastros()
  const { perfil, nome } = useAuth()
  const podeEntregar = ['dono', 'designer', 'financeiro'].includes(perfil) // só estes dão "entregue"
  const [filtros, setFiltros] = useState({})
  const [motoristaSel, setMotoristaSel] = useState({}) // { "vendedor|rota": nome do motorista }
  const [soImprimir, setSoImprimir] = useState(null)   // "vend|rota" p/ imprimir só uma rota
  const motoristasAtivos = motoristas.filter((m) => m.ativo !== false)

  // ao pedir p/ imprimir uma rota específica: renderiza só ela e chama window.print()
  useEffect(() => {
    if (!soImprimir) return
    const t = setTimeout(() => window.print(), 60)
    const limpa = () => setSoImprimir(null)
    window.addEventListener('afterprint', limpa, { once: true })
    return () => { clearTimeout(t); window.removeEventListener('afterprint', limpa) }
  }, [soImprimir])

  // recalcula a previsão de entrega com o calendário ATUAL do Cadastro
  const base = pedidos.map((p) => ({ ...p, previsao: previsaoDe(p, cadastros) }))
  const categorizados = base.filter((p) => p.status)
  const vendedores = vendedoresDe(categorizados)
  // A Rota mostra só o que já foi EXPEDIDO — e por item: o pedido entra com a
  // fatia pronta, mesmo que o resto ainda esteja em produção (entrega parcial).
  // Pedido legado (que nunca passou pelo quadro) continua entrando inteiro.
  const lista = filtraPedidos(categorizados, filtros, clientes)
    .map(fatiaProntos)
    .filter((p) => p.itens.length > 0 || p._todos.length === 0)

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

  // Grava uma REMESSA em `entregues` (entregues/{idVenda}-{n}) com os itens que
  // saíram agora. Se sobrou item em produção, o pedido continua em `pedidos` só
  // com o que falta; quando não sobra nada, o pedido é apagado (como era antes).
  async function gravarEntrega(p, motorista) {
    const todos = p._todos || p.itens || []
    const idxs = p._idxs || todos.map((_, i) => i)
    const saindo = idxs.map((i) => todos[i])
    const restantes = todos.filter((_, i) => !idxs.includes(i))
    const parcial = restantes.length > 0
    const n = (p.remessas || 0) + 1
    const { _todos, _idxs, _pendentes, ...pedido } = p
    await setDoc(doc(db, 'entregues', `${p.idVenda}-${n}`), {
      ...pedido,
      idVenda: p.idVenda,          // campo (o id do doc agora tem sufixo de remessa)
      itens: saindo,
      remessa: n,
      parcial,
      itensPendentes: restantes.length,
      motorista: motorista || '',
      entregueEm: new Date().toISOString(),
    })
    if (parcial) {
      // tira do pedido só o que foi entregue; o resto segue no fluxo de produção
      const etapas = { ...(p.etapas || {}) }
      for (const i of idxs) delete etapas[keyDoItem({ itens: todos }, i)]
      // o que sobrou continua na fábrica — não pode herdar a saída da remessa que foi
      await updateDoc(doc(db, 'pedidos', p.idVenda), {
        itens: restantes, etapas, remessas: n,
        saidaEm: deleteField(), saidaMotorista: deleteField(), saidaPor: deleteField(),
      })
    } else {
      await deleteDoc(doc(db, 'pedidos', p.idVenda))
    }
  }

  async function entregar(p, motorista) {
    if (motoristasAtivos.length > 0 && !motorista) {
      alert('Escolha o motorista no seletor da rota antes de marcar como entregue.')
      return
    }
    const aviso = p._pendentes > 0
      ? `\n\nEntrega PARCIAL: saem ${p.itens.length} item(ns) e ficam ${p._pendentes} em produção.`
      : ''
    if (!confirm(`Confirmar entrega do pedido #${p.idVenda} — ${nomeCliente(p.cliente, clientes)}${motorista ? ` por ${motorista}` : ''}?${aviso}`)) return
    await gravarEntrega(p, motorista)
  }

  // 🚚 SAÍDA: o caminhão saiu com a rota. Fica no pedido (saidaEm/saidaMotorista/
  // saidaPor) porque o caminhão leva o pedido inteiro do que está pronto — é o
  // estado que faltava entre "expedido" e "entregue", e é o que o vendedor vê.
  async function marcarSaida(vend, rota, ps) {
    const motorista = motoristaSel[`${vend}|${rota}`] || ''
    if (motoristasAtivos.length > 0 && !motorista) {
      alert('Escolha o motorista antes de marcar a saída.')
      return
    }
    const faltam = ps.filter((p) => !saiuParaEntrega(p))
    if (!faltam.length) return
    if (!confirm(`Marcar ${faltam.length} pedido(s) da ${rota} como SAÍDOS para entrega${motorista ? ` com ${motorista}` : ''}?`)) return
    const agora = new Date().toISOString()
    try {
      for (let i = 0; i < faltam.length; i += 450) {
        const batch = writeBatch(db)
        for (const p of faltam.slice(i, i + 450)) {
          batch.update(doc(db, 'pedidos', p.idVenda), {
            saidaEm: agora, saidaMotorista: motorista, saidaPor: nome || '',
          })
        }
        await batch.commit()
      }
    } catch (e) {
      alert('Não foi possível marcar a saída: ' + (e.code || e.message))
    }
  }

  async function cancelarSaida(p) {
    if (!confirm(`Cancelar a saída do pedido #${p.idVenda}? Ele volta para "pronto, aguardando a rota".`)) return
    try {
      await updateDoc(doc(db, 'pedidos', p.idVenda), {
        saidaEm: deleteField(), saidaMotorista: deleteField(), saidaPor: deleteField(),
      })
    } catch (e) {
      alert('Não foi possível cancelar a saída: ' + (e.code || e.message))
    }
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
  // pedidos que ainda não têm NADA pronto (seguem no quadro de produção)
  const emProducao = filtraPedidos(categorizados, filtros, clientes).length - lista.length

  return (
    <>
      <div className="toolbar no-print">
        <h1 className="page-title">Lista de Rota
          <small>
            {lista.length} pedido(s) para entregar
            {emProducao > 0 && ` · ${emProducao} ainda em produção`}
          </small>
        </h1>
        <div className="spacer" />
        <button className="btn" onClick={() => { setSoImprimir(null); setTimeout(() => window.print(), 30) }}>🖨 Imprimir tudo</button>
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
                const totalRota = Object.values(clientes).flat()
                  .reduce((acc, p) => somaTotais(acc, totaisPorMaterial(p.itens, itensCad)), TOTAIS_ZERO)
                return (
                  <div key={rota} style={{ marginBottom: 16 }}>
                    <div className={`rota-band ${foraRota ? 'warn' : ''}`}>
                      <span className="rb-nome">📍 {rota}</span>
                      <span className="rb-count">
                        {Object.keys(clientes).length} cliente(s)
                      </span>
                      <span className="rb-totais">{fmtTotais(totalRota)}</span>
                      {podeEntregar && (motoristasAtivos.length > 0 ? (
                        <div className="no-print" style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginLeft:'auto' }}>
                          <select className="btn" value={motoristaSel[`${vend}|${rota}`] || ''}
                            onChange={(e) => setMotoristaSel((s) => ({ ...s, [`${vend}|${rota}`]: e.target.value }))}>
                            <option value="">🚚 Motorista…</option>
                            {motoristasAtivos.map((m, i) => <option key={i} value={m.nome}>{m.nome}</option>)}
                          </select>
                          {Object.values(clientes).flat().some((p) => !saiuParaEntrega(p)) && (
                            <button className="btn" title="O caminhão saiu com esta rota"
                              onClick={() => marcarSaida(vend, rota, Object.values(clientes).flat())}>
                              🚚 Saiu para entrega
                            </button>
                          )}
                          <button className="btn ok" onClick={() => entregarRota(vend, rota, Object.values(clientes).flat())}>
                            ✓ Entregar rota toda
                          </button>
                        </div>
                      ) : (
                        <span className="no-print" style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                          🚚 cadastre motoristas em Cadastros › Motoristas para escolher na entrega
                        </span>
                      ))}
                      <button className="btn no-print"
                        style={{ marginLeft: (podeEntregar && motoristasAtivos.length > 0) ? 0 : 'auto' }}
                        title="Imprimir o romaneio só desta rota"
                        onClick={() => setSoImprimir(`${vend}|${rota}`)}>🖨 Imprimir rota</button>
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
                                  {p._pendentes > 0 && (
                                    <span className="chip rota-warn" title="O resto do pedido ainda está no quadro de produção">
                                      ⏳ faltam {p._pendentes} item(ns) em produção
                                    </span>
                                  )}
                                  {saiuParaEntrega(p) && (
                                    <span className="chip" style={{ color: 'var(--ok)' }}
                                      title={p.saidaPor ? `marcado por ${p.saidaPor}` : ''}>
                                      🚚 saiu {fmtDataHora(p.saidaEm)}{p.saidaMotorista ? ` · ${p.saidaMotorista}` : ''}
                                    </span>
                                  )}
                                  <span className="valor" style={{ marginLeft:'auto' }}>{fmtMoeda(p.valorTotal)}</span>
                                </div>
                                <ul className="itens">
                                  {p.itens.map((it, i) => (
                                    <li key={i}><span><SeloLinha linha={it._linha} />{it.produto}</span><span className="q">{it.qtd}</span></li>
                                  ))}
                                </ul>
                                {podeEntregar && (
                                  <div className="no-print" style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                    <button className="btn ok" style={{ flex: 1, justifyContent:'center' }}
                                      onClick={() => entregar(p, motoristaSel[`${vend}|${rota}`] || '')}>
                                      ✓ Entregue
                                    </button>
                                    {saiuParaEntrega(p) && (
                                      <button className="btn" title="Cancelar a saída (o caminhão não levou)"
                                        onClick={() => cancelarSaida(p)}>↩</button>
                                    )}
                                  </div>
                                )}
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
        filtros={filtros} total={lista.length} motoristaSel={motoristaSel} itensCad={itensCad}
        soImprimir={soImprimir}
      />
    </>
  )
}

// ============================ ROMANEIO DE ENTREGA ============================
function ImpressaoRota({ arvore, vendedoresOrd, filtros, total, motoristaSel = {}, itensCad, soImprimir }) {
  const hoje = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  const resumo = resumoFiltros(filtros)
  // impressão de UMA rota só: filtra o vendedor e a rota escolhidos
  const corte = soImprimir ? soImprimir.indexOf('|') : -1
  const vendFiltro = soImprimir ? soImprimir.slice(0, corte) : null
  const rotaFiltro = soImprimir ? soImprimir.slice(corte + 1) : null
  const vends = soImprimir ? vendedoresOrd.filter((v) => v === vendFiltro) : vendedoresOrd
  const rotaOk = ([rota]) => !soImprimir || rota === rotaFiltro
  const totalImp = soImprimir
    ? Object.values(arvore[vendFiltro]?.[rotaFiltro] || {}).flat().length
    : total
  return (
    <div className="print-only">
      <div className="pr-head">
        <h1>JC Sacolas · Romaneio de Entrega{soImprimir ? ` · ${rotaFiltro}` : ''}</h1>
        <div className="meta">
          Impresso em {hoje}<br />
          {totalImp} entrega(s){soImprimir ? ` · ${vendFiltro}` : ''}
          {resumo && !soImprimir && <><br />{resumo}</>}
        </div>
      </div>

      {vends.map((vend) => {
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
          {Object.entries(arvore[vend]).sort().filter(rotaOk).map(([rota, clientes]) => {
            const motoristaRota = motoristaSel[`${vend}|${rota}`]
            const totalRota = Object.values(clientes).flat()
              .reduce((acc, p) => somaTotais(acc, totaisPorMaterial(p.itens, itensCad)), TOTAIS_ZERO)
            return (
            <div key={rota}>
              <div className="pr-rota forte">
                {rota} · {Object.keys(clientes).length} cliente(s)
                {motoristaRota ? ` · 🚚 ${motoristaRota}` : ''} · {fmtTotais(totalRota)}
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
                        <td><SeloLinha linha={it._linha} />{it.produto} <span className="ref">#{p.idVenda}</span></td>
                        <td className="q">{it.qtd}</td>
                      </tr>
                    )))}
                  </tbody></table>
                  {/* entrega parcial: o romaneio precisa dizer o que NÃO foi nesta viagem */}
                  {ps.some((p) => p._pendentes > 0) && (
                    <div className="pr-parcial">
                      ⚠ ENTREGA PARCIAL —{' '}
                      {ps.filter((p) => p._pendentes > 0)
                        .map((p) => `#${p.idVenda}: ${p._pendentes} item(ns) ainda em produção`)
                        .join(' · ')}
                    </div>
                  )}
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
