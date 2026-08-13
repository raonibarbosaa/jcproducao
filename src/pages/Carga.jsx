import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  STATUS_CARGA, itensParaCarga, proximoNumeroCarga, cargaAberta, progressoConferencia,
  cargaConferida, agrupaCargaPorPedido, pedidosDaCarga, arredondaQtd,
  nomeCliente, fmtData, fmtDataHora, fmtQtd, situacaoPrazo, ordemRota,
  materialDoItem, totaisPorMaterial, somaTotais, TOTAIS_ZERO, fmtTotais,
  filtraPedidos, vendedoresDe, previsaoDe, resumoFiltros,
} from '../utils.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import SeloLinha from '../components/SeloLinha.jsx'
import FiltrosBar from '../components/FiltrosBar.jsx'

// CONTROLE DE ENTREGAS — a carga é a VIAGEM do caminhão.
// A tela de Rota mostra o que está pronto agora (uma foto do momento). Aqui o
// operador da expedição monta o que vai NESTE caminhão: escolhe pedido a pedido,
// podendo misturar rotas e deixar para trás o que não coube, confere item a item
// ao carregar e marca a saída. O romaneio passa a ser o papel dessa carga.
//
// A expedição monta, confere e marca a saída — mas NÃO dá a entrega: é ela que
// abre a cobrança, e segue com dono/designer/financeiro na tela de Rota.
export default function Carga({ pedidos }) {
  const { clientes, motoristas, itens: itensCad, vendedores: cadastros } = useCadastros()
  const { nome } = useAuth()
  const [cargas, setCargas] = useState([])
  const [sel, setSel] = useState(() => new Set())
  const [motorista, setMotorista] = useState('')
  const [salvando, setSalvando] = useState('')
  const [aba, setAba] = useState('montar')      // 'montar' | 'historico'
  const [filtros, setFiltros] = useState({})
  const motoristasAtivos = motoristas.filter((m) => m.ativo !== false)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'cargas'),
      (snap) => setCargas(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => console.error('Erro ao ler cargas:', e))
    return unsub
  }, [])

  const aberta = cargaAberta(cargas)

  // Quanto de cada item já está comprometido com alguma carga viva (montando ou
  // que já saiu). Sem isso o mesmo pedido entraria em duas cargas — e o caso não
  // é raro: expediram 40, foram numa carga, depois expediram os outros 60.
  const comprometido = new Map()
  for (const c of cargas) {
    if (c.status === STATUS_CARGA.CONCLUIDA) continue
    for (const it of c.itens || []) {
      const k = `${it.idVenda}|${it.itemKey}`
      comprometido.set(k, arredondaQtd((comprometido.get(k) || 0) + (Number(it.qtd) || 0)))
    }
  }

  // pedidos com quantidade expedida ainda LIVRE para entrar numa carga.
  // A lista NÃO é filtrada: é a base da seleção. Assim dá para filtrar a ROTA 01,
  // marcar, trocar para a ROTA 02 e marcar mais — sem perder o que já foi escolhido.
  const disponiveis = []
  for (const p of (pedidos || []).map((x) => ({ ...x, previsao: previsaoDe(x, cadastros) }))) {
    const livres = itensParaCarga(p)
      .map((it) => ({
        ...it,
        material: materialDoItem({ produto: it.produto }, itensCad),
        qtd: arredondaQtd(it.qtd - (comprometido.get(`${it.idVenda}|${it.itemKey}`) || 0)),
      }))
      .filter((it) => it.qtd > 0)
    if (livres.length) disponiveis.push({ p, itens: livres })
  }

  const vendedoresFiltro = vendedoresDe(disponiveis.map((d) => d.p))
  // o filtro vale só para o que APARECE; a seleção sobrevive à troca de filtro
  const idsFiltrados = new Set(
    filtraPedidos(disponiveis.map((d) => d.p), filtros, clientes).map((p) => p.idVenda))
  const visiveis = disponiveis.filter((d) => idsFiltrados.has(d.p.idVenda))

  // agrupa por rota (na ordem do cadastro do vendedor) só para facilitar a escolha
  const porRota = {}
  for (const d of visiveis) {
    const r = d.p.rota || 'SEM ROTA'
    ;(porRota[r] ??= { rota: r, vendedor: d.p.vendedor || '', linhas: [] }).linhas.push(d)
  }
  const rotas = Object.values(porRota).sort((a, b) =>
    (ordemRota(a.vendedor, a.rota, cadastros) - ordemRota(b.vendedor, b.rota, cadastros))
    || a.rota.localeCompare(b.rota))

  const escolhidos = disponiveis.filter((d) => sel.has(d.p.idVenda))
  const totaisSel = escolhidos.reduce(
    (acc, d) => somaTotais(acc, totaisPorMaterial(d.itens.map((i) => ({ produto: i.produto, qtd: i.qtd })), itensCad)),
    TOTAIS_ZERO)

  const alterna = (id) => setSel((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const marcarRota = (r, ligar) => setSel((s) => {
    const n = new Set(s)
    for (const d of r.linhas) ligar ? n.add(d.p.idVenda) : n.delete(d.p.idVenda)
    return n
  })

  async function criarCarga() {
    if (!escolhidos.length || salvando) return
    if (motoristasAtivos.length > 0 && !motorista) {
      alert('Escolha o motorista da carga.')
      return
    }
    setSalvando('criar')
    try {
      const numero = proximoNumeroCarga(cargas)
      const itens = escolhidos.flatMap((d) => d.itens)
      await setDoc(doc(collection(db, 'cargas')), {
        numero,
        status: STATUS_CARGA.MONTANDO,
        motorista: motorista || '',
        itens,
        pedidos: escolhidos.map((d) => d.p.idVenda),
        rotas: [...new Set(escolhidos.map((d) => d.p.rota || 'SEM ROTA'))],
        criadaEm: new Date().toISOString(),
        criadaPor: nome || '',
      })
      setSel(new Set()); setMotorista('')
    } catch (e) {
      alert('Não foi possível criar a carga: ' + (e.code || e.message))
    } finally { setSalvando('') }
  }

  // conferência: marca o item como carregado
  async function conferir(carga, n, valor) {
    const itens = (carga.itens || []).map((it, i) => (i === n ? { ...it, conferido: valor } : it))
    await updateDoc(doc(db, 'cargas', carga.id), { itens })
  }
  async function conferirTudo(carga, valor) {
    await updateDoc(doc(db, 'cargas', carga.id), {
      itens: (carga.itens || []).map((it) => ({ ...it, conferido: valor })),
    })
  }

  // saída: fecha a carga e carimba a saída em cada pedido (é o que o vendedor vê)
  async function marcarSaida(carga) {
    const { total, conferidos } = progressoConferencia(carga)
    if (conferidos < total && !confirm(
      `Faltam ${total - conferidos} item(ns) para conferir. Marcar a saída assim mesmo?`)) return
    if (!confirm(`Confirmar a saída da carga #${carga.numero}${carga.motorista ? ` com ${carga.motorista}` : ''}?`)) return
    setSalvando('saida')
    try {
      const agora = new Date().toISOString()
      const ids = [...new Set(carga.pedidos || [])]
      for (let i = 0; i < ids.length; i += 400) {
        const batch = writeBatch(db)
        for (const id of ids.slice(i, i + 400)) {
          batch.update(doc(db, 'pedidos', id), {
            saidaEm: agora, saidaMotorista: carga.motorista || '', saidaPor: nome || '',
          })
        }
        await batch.commit()
      }
      await updateDoc(doc(db, 'cargas', carga.id), {
        status: STATUS_CARGA.SAIU, saiuEm: agora, saiuPor: nome || '',
      })
    } catch (e) {
      alert('Não foi possível marcar a saída: ' + (e.code || e.message))
    } finally { setSalvando('') }
  }

  async function cancelarCarga(carga) {
    if (!confirm(`Cancelar a carga #${carga.numero}? Os pedidos voltam a ficar disponíveis para outra carga.`)) return
    await deleteDoc(doc(db, 'cargas', carga.id))
  }

  const historico = cargas
    .filter((c) => c.status !== STATUS_CARGA.MONTANDO)
    .sort((a, b) => (b.criadaEm || '').localeCompare(a.criadaEm || ''))

  return (
    <>
      <div className="toolbar no-print">
        <h1 className="page-title">Controle de entregas
          <small>
            {aberta
              ? `carga #${aberta.numero} em montagem`
              : `${disponiveis.length} pedido(s) prontos para carregar`}
          </small>
        </h1>
        <div className="spacer" />
        <div className="vista-toggle">
          <button className={`btn${aba === 'montar' ? ' primary' : ''}`} onClick={() => setAba('montar')}>
            📦 Carga atual
          </button>
          <button className={`btn${aba === 'historico' ? ' primary' : ''}`} onClick={() => setAba('historico')}>
            ☰ Histórico {historico.length > 0 && `(${historico.length})`}
          </button>
        </div>
      </div>

      {aba === 'montar' && (aberta
        ? <Conferencia carga={aberta} pedidos={pedidos} clientes={clientes} itensCad={itensCad}
            salvando={salvando} onConferir={conferir} onConferirTudo={conferirTudo}
            onSaida={marcarSaida} onCancelar={cancelarCarga} />
        : <>
            <FiltrosBar filtros={filtros} setFiltros={setFiltros}
              vendedores={vendedoresFiltro} pedidos={disponiveis.map((d) => d.p)} />
            {resumoFiltros(filtros) && (
              <div style={{ fontSize: 12, color: 'var(--text-faint)', margin: '0 2px 10px' }}>
                {visiveis.length} de {disponiveis.length} pedido(s) · {resumoFiltros(filtros)}
              </div>
            )}
            <Montagem rotas={rotas} sel={sel} alterna={alterna} marcarRota={marcarRota}
              clientes={clientes} escolhidos={escolhidos} totais={totaisSel}
              motorista={motorista} setMotorista={setMotorista} motoristas={motoristasAtivos}
              salvando={salvando} onCriar={criarCarga}
              temFiltro={!!resumoFiltros(filtros)} />
          </>)}

      {aba === 'historico' && <Historico cargas={historico} clientes={clientes} />}
    </>
  )
}

// ---------- escolher o que vai no caminhão ----------
function Montagem({ rotas, sel, alterna, marcarRota, clientes, escolhidos, totais,
                    motorista, setMotorista, motoristas, salvando, onCriar, temFiltro }) {
  if (!rotas.length) {
    return <div className="empty"><div className="big">📦</div>
      {temFiltro
        ? 'Nenhum pedido com esses filtros.'
        : <>Nada expedido para carregar. Os pedidos aparecem aqui depois do <b>✓ Expedir</b> no quadro.</>}
    </div>
  }
  return (
    <>
      {rotas.map((r) => {
        const todosMarcados = r.linhas.every((d) => sel.has(d.p.idVenda))
        return (
          <div key={r.rota} style={{ marginBottom: 16 }}>
            <div className="rota-band">
              <span className="rb-nome">📍 {r.rota}</span>
              <span className="rb-count">{r.linhas.length} pedido(s)</span>
              <button className="btn no-print" style={{ marginLeft: 'auto' }}
                onClick={() => marcarRota(r, !todosMarcados)}>
                {todosMarcados ? 'Desmarcar rota' : 'Marcar rota toda'}
              </button>
            </div>
            <div className="cards">
              {r.linhas.map(({ p, itens }) => {
                const atrasado = situacaoPrazo(p.previsao) === 'atrasado'
                const marcado = sel.has(p.idVenda)
                return (
                  <div key={p.idVenda} className={`card ${atrasado ? 'atrasado' : 'em_dia'}`}
                    style={marcado ? { borderColor: 'var(--ok)' } : null}>
                    <label style={{ display: 'flex', gap: 10, cursor: 'pointer', alignItems: 'flex-start' }}>
                      <input type="checkbox" className="card-check" checked={marcado}
                        onChange={() => alterna(p.idVenda)} />
                      <span style={{ flex: 1 }}>
                        <span className="card-top">
                          <span className="cliente">{nomeCliente(p.cliente, clientes)}</span>
                          <span className="idv">#{p.idVenda}</span>
                        </span>
                        <span className="meta-row">
                          <span className="chip">📍 {p.cidade || '—'}</span>
                          <span className={`chip ${atrasado ? 'atrasado' : ''}`}>{fmtData(p.previsao)}</span>
                        </span>
                      </span>
                    </label>
                    <ul className="itens">
                      {itens.map((it) => (
                        <li key={it.itemKey}>
                          <span><SeloLinha linha={it.linha} />{it.produto}</span>
                          <span className="q">
                            {fmtQtd(it.qtd)}
                            {it.qtdItem > it.qtd && <small className="q-de"> de {fmtQtd(it.qtdItem)}</small>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {escolhidos.length > 0 && (
        <div className="batch-bar no-print">
          <span>
            <b>{escolhidos.length}</b> pedido(s) · {fmtTotais(totais)}
            {/* o filtro esconde, mas não desmarca — senão o operador perderia a
                seleção ao trocar de rota sem perceber */}
            {temFiltro && <small style={{ color: 'var(--text-faint)' }}> (inclui os fora do filtro)</small>}
          </span>
          {motoristas.length > 0 && (
            <select className="btn" value={motorista} onChange={(e) => setMotorista(e.target.value)}>
              <option value="">🚚 Motorista…</option>
              {motoristas.map((m, i) => <option key={i} value={m.nome}>{m.nome}</option>)}
            </select>
          )}
          <button className="btn ok" disabled={!!salvando} onClick={onCriar}>
            {salvando === 'criar' ? 'Criando…' : '📦 Montar carga'}
          </button>
        </div>
      )}
    </>
  )
}

// ---------- conferir e marcar a saída ----------
function Conferencia({ carga, pedidos, clientes, itensCad, salvando, onConferir, onConferirTudo, onSaida, onCancelar }) {
  const { total, conferidos } = progressoConferencia(carga)
  const grupos = agrupaCargaPorPedido(carga, pedidos)
  const pronto = cargaConferida(carga)
  const idxDe = (it) => (carga.itens || []).findIndex((x) => x.idVenda === it.idVenda && x.itemKey === it.itemKey)
  return (
    <>
      <div className={`card ${pronto ? 'em_dia' : ''} no-print`} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Carga #{carga.numero}</h3>
          {carga.motorista && <span className="chip">🚚 {carga.motorista}</span>}
          <span className="chip">{(carga.rotas || []).join(' · ') || '—'}</span>
          <span className={`chip${pronto ? '' : ' rota-warn'}`} style={pronto ? { color: 'var(--ok)' } : null}>
            {conferidos} de {total} conferidos
          </span>
          <div className="spacer" style={{ flex: 1 }} />
          <button className="btn" onClick={() => onConferirTudo(carga, !pronto)}>
            {pronto ? 'Desmarcar tudo' : '✓ Conferir tudo'}
          </button>
          <button className="btn" onClick={() => window.print()}>🖨 Romaneio</button>
          <button className="btn ok" disabled={!!salvando} onClick={() => onSaida(carga)}>
            {salvando === 'saida' ? 'Registrando…' : '🚚 Marcar saída'}
          </button>
          <button className="btn" style={{ color: 'var(--danger)' }}
            onClick={() => onCancelar(carga)}>Cancelar carga</button>
        </div>
      </div>

      <div className="screen-only">
        {grupos.map((g) => (
          <div key={g.idVenda} className="card em_dia" style={{ marginBottom: 12 }}>
            <div className="card-top">
              <div className="cliente">{g.p ? nomeCliente(g.p.cliente, clientes) : `#${g.idVenda}`}</div>
              <div className="idv">#{g.idVenda}</div>
            </div>
            {g.p && (
              <div className="meta-row">
                <span className="chip">📍 {g.p.cidade || '—'}</span>
                <span className="chip">{g.p.rota || 'SEM ROTA'}</span>
              </div>
            )}
            <ul className="itens">
              {g.itens.map((it) => (
                <li key={it.itemKey}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, cursor: 'pointer' }}>
                    <input type="checkbox" className="card-check" checked={!!it.conferido}
                      onChange={(e) => onConferir(carga, idxDe(it), e.target.checked)} />
                    <span style={it.conferido ? { textDecoration: 'line-through', opacity: .6 } : null}>
                      <SeloLinha linha={it.linha} />{it.produto}
                    </span>
                  </label>
                  <span className="q">{fmtQtd(it.qtd)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <RomaneioCarga carga={carga} grupos={grupos} clientes={clientes} />
    </>
  )
}

// ---------- romaneio impresso da carga ----------
function RomaneioCarga({ carga, grupos, clientes }) {
  return (
    <div className="print-only">
      <div className="pr-head">
        <h1>JC Sacolas · Romaneio de Entrega · Carga #{carga.numero}</h1>
        <div className="meta">
          {fmtData(carga.criadaEm)}<br />
          {carga.motorista ? `🚚 ${carga.motorista} · ` : ''}
          {pedidosDaCarga(carga).length} entrega(s)
        </div>
      </div>
      <div className="pr-rota forte">
        {(carga.rotas || []).join(' · ') || 'SEM ROTA'} · {(carga.itens || []).length} item(ns)
      </div>
      {grupos.map((g) => (
        <div key={g.idVenda} className="pr-ped parada">
          <div className="top">
            <span className="box" />
            <span className="nm">{g.p ? nomeCliente(g.p.cliente, clientes) : `#${g.idVenda}`}</span>
            <span className="cid">— {g.p?.cidade || '—'}</span>
            <span className="ent">{g.p ? fmtData(g.p.previsao) : ''}</span>
          </div>
          <table className="pr-itens"><tbody>
            {g.itens.map((it) => (
              <tr key={it.itemKey}>
                <td><SeloLinha linha={it.linha} />{it.produto} <span className="ref">#{g.idVenda}</span></td>
                <td className="q">
                  {fmtQtd(it.qtd)}
                  {it.qtdItem > it.qtd && <span className="ref"> de {fmtQtd(it.qtdItem)}</span>}
                </td>
              </tr>
            ))}
          </tbody></table>
          {/* produção parcial: o romaneio precisa dizer que sai só uma parte */}
          {g.itens.some((it) => it.qtdItem > it.qtd) && (
            <div className="pr-parcial">⚠ ENTREGA PARCIAL — parte do pedido segue em produção</div>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------- histórico das viagens ----------
function Historico({ cargas, clientes }) {
  if (!cargas.length) {
    return <div className="empty"><div className="big">🚚</div>Nenhuma carga registrada ainda.</div>
  }
  return (
    <div className="card em_dia">
      <table className="rel-tab">
        <thead>
          <tr><th>Carga</th><th>Saída</th><th>Motorista</th><th>Rotas</th><th className="q">Pedidos</th><th className="q">Itens</th><th>Status</th></tr>
        </thead>
        <tbody>
          {cargas.map((c) => (
            <tr key={c.id}>
              <td>#{c.numero}</td>
              <td>{c.saiuEm ? fmtDataHora(c.saiuEm) : '—'}</td>
              <td>{c.motorista || '—'}</td>
              <td>{(c.rotas || []).join(' · ')}</td>
              <td className="q">{(c.pedidos || []).length}</td>
              <td className="q">{(c.itens || []).length}</td>
              <td>{c.status === 'saiu' ? '🚚 saiu' : '✓ concluída'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
