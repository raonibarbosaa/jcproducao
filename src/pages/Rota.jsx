import { useState, useEffect } from 'react'
import { doc, setDoc, deleteDoc, updateDoc, writeBatch, deleteField } from 'firebase/firestore'
import { db } from '../firebase.js'
import { fmtData, fmtMoeda, situacaoPrazo, ORIGEM_NM, filtraPedidos, vendedoresDe, resumoFiltros, previsaoDe, nomeCliente, totaisPorMaterial, somaTotais, TOTAIS_ZERO, fmtTotais, fatiaProntos, saiuParaEntrega, fmtDataHora, qtdNaEtapa, qtdPendente,
  mapaEtapasComQtd, pedidoTodoEntregue, arredondaQtd, fmtQtd,
  temVolumes, volumesNaEtapa, mapaEtapasMovendoVolumes } from '../utils.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import FiltrosBar from '../components/FiltrosBar.jsx'
import DataEntrega from '../components/DataEntrega.jsx'
import SeloLinha from '../components/SeloLinha.jsx'

export default function Rota({ pedidos }) {
  const { vendedores: cadastros, clientes, motoristas, itens: itensCad } = useCadastros()
  const { perfil, nome } = useAuth()
  const podeEntregar = ['dono', 'designer', 'financeiro'].includes(perfil) // só estes dão "entregue"
  // quem carrega o caminhão é a expedição — então é ela que sabe a hora que a
  // rota saiu. Marca a saída (e desfaz), mas continua sem dar a entrega.
  const podeMarcarSaida = podeEntregar || perfil === 'expedicao'
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
  // A Rota mostra só o que já foi EXPEDIDO — e por QUANTIDADE: o pedido entra
  // com a fatia pronta (40 de 100), e o resto segue em produção.
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

  // Grava uma REMESSA em `entregues` (entregues/{idVenda}-{n}) e move a
  // QUANTIDADE entregue de `expedido` para `entregue`. O pedido só é apagado
  // quando não sobra nada pendente em item nenhum.
  // O item NÃO sai mais de `itens`: com produção parcial ele pode ter 40 saindo e
  // 60 ainda na linha, e apagá-lo levaria os 60 junto, sem erro na tela.
  async function gravarEntrega(p, motorista) {
    const todos = p._todos || p.itens || []
    const idxs = p._idxs || todos.map((_, i) => i)
    const base = { ...p, itens: todos }          // pedido cheio: as contas precisam do total
    const movs = idxs
      .map((i) => ({ idx: i, de: 'expedido', para: 'entregue', qtd: qtdNaEtapa(base, i, 'expedido') }))
      .filter((m) => m.qtd > 0)
    if (!movs.length) return
    // item embalado baixa VOLUME por volume; o legado continua por quantidade
    const porVolume = movs
      .filter((m) => temVolumes(base, m.idx))
      .map((m) => ({ idx: m.idx, ids: volumesNaEtapa(base, m.idx, 'expedido'), para: 'entregue' }))
      .filter((m) => m.ids.length)
    const etapas = porVolume.length
      ? mapaEtapasMovendoVolumes(base, porVolume, nome)
      : mapaEtapasComQtd(base, movs, nome)
    const depois = { ...base, etapas }
    const acabou = pedidoTodoEntregue(depois)
    const n = (p.remessas || 0) + 1
    // `id` fica de fora: é o id do doc de `pedidos`, e gravado aqui dentro ele
    // sobrescrevia o id do doc da remessa na leitura (ver `doDoc` em utils)
    const { _todos, _idxs, _pendentes, id, ...pedido } = p
    await setDoc(doc(db, 'entregues', `${p.idVenda}-${n}`), {
      ...pedido,
      idVenda: p.idVenda,          // campo (o id do doc agora tem sufixo de remessa)
      // qtd = o que saiu nesta remessa; qtdItem = o total do item no pedido
      itens: movs.map((m) => ({ ...todos[m.idx], qtd: m.qtd, qtdItem: arredondaQtd(todos[m.idx]?.qtd) })),
      remessa: n,
      parcial: !acabou,
      itensPendentes: todos.filter((_, i) => qtdPendente(depois, i) > 0).length,
      motorista: motorista || '',
      entregueEm: new Date().toISOString(),
    })
    if (acabou) {
      await deleteDoc(doc(db, 'pedidos', p.idVenda))
    } else {
      // o que sobrou continua na fábrica — não pode herdar a saída da remessa que foi
      await updateDoc(doc(db, 'pedidos', p.idVenda), {
        etapas, remessas: n,
        saidaEm: deleteField(), saidaMotorista: deleteField(), saidaPor: deleteField(),
      })
    }
  }

  async function entregar(p, motorista) {
    if (motoristasAtivos.length > 0 && !motorista) {
      alert('Escolha o motorista no seletor da rota antes de marcar como entregue.')
      return
    }
    const aviso = p._pendentes > 0
      ? `\n\nEntrega PARCIAL: ${p._pendentes} item(ns) continuam com quantidade em produção.`
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

      <FiltrosBar filtros={filtros} setFiltros={setFiltros} vendedores={vendedores} pedidos={categorizados} />

      {/* ---------- TELA ---------- */}
      <div className="screen-only">
        {lista.length === 0 ? (
          <div className="empty"><div className="big">🗺️</div>
            {categorizados.length === 0
              ? 'Nada para carregar no momento.'
              : emProducao > 0
                // o caso comum: tem pedido, mas nenhum foi expedido ainda. Sem
                // dizer isso, a tela vazia parece defeito (e por um tempo ela
                // mentia, listando pedido que ainda estava na linha)
                ? <>Nenhum pedido expedido ainda — {emProducao} continua(m) na produção.<br />
                    <span style={{ fontSize: 13 }}>
                      O pedido aparece aqui depois do <b>✓ Expedir</b>, na coluna Expedição do quadro.
                    </span></>
                : 'Nenhum pedido com esses filtros.'}
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
                      {podeMarcarSaida && (motoristasAtivos.length > 0 ? (
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
                          {podeEntregar && (
                            <button className="btn ok" onClick={() => entregarRota(vend, rota, Object.values(clientes).flat())}>
                              ✓ Entregar rota toda
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="no-print" style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                          🚚 cadastre motoristas em Cadastros › Motoristas para escolher na entrega
                        </span>
                      ))}
                      <button className="btn no-print"
                        style={{ marginLeft: (podeMarcarSaida && motoristasAtivos.length > 0) ? 0 : 'auto' }}
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
                                    <li key={i}>
                                      <span><SeloLinha linha={it._linha} />{it.produto}</span>
                                      <span className="q">
                                        {fmtQtd(it.qtd)}
                                        {/* produção parcial: sai só uma parte do item */}
                                        {it._qtdItem > it.qtd && <small className="q-de"> de {fmtQtd(it._qtdItem)}</small>}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                                {(podeEntregar || (podeMarcarSaida && saiuParaEntrega(p))) && (
                                  <div className="no-print" style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                    {podeEntregar && (
                                      <button className="btn ok" style={{ flex: 1, justifyContent:'center' }}
                                        onClick={() => entregar(p, motoristaSel[`${vend}|${rota}`] || '')}>
                                        ✓ Entregue
                                      </button>
                                    )}
                                    {podeMarcarSaida && saiuParaEntrega(p) && (
                                      <button className="btn" style={podeEntregar ? null : { flex: 1, justifyContent: 'center' }}
                                        title="Cancelar a saída (o caminhão não levou)"
                                        onClick={() => cancelarSaida(p)}>
                                        {podeEntregar ? '↩' : '↩ Cancelar saída'}
                                      </button>
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
                        <td className="q">
                          {fmtQtd(it.qtd)}
                          {it._qtdItem > it.qtd && <span className="ref"> de {fmtQtd(it._qtdItem)}</span>}
                        </td>
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
