import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, writeBatch } from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  indexaCienciasPorPedido, cienciaDoPedido, semCiencia, docCiencia, fmtDataHora, pegarIP,
  nomeCliente, previsaoDe, situacaoPrazo, fmtData, fmtMoeda, ORIGEM_NM, MODO_NM, linhaDoItem,
  filtraPedidos, vendedoresDe,
} from '../utils.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import FiltrosBar from '../components/FiltrosBar.jsx'

// Tela do DESIGNER/DONO: acompanha a ciência dos vendedores e dá a própria
// (conferido). A unidade é o PEDIDO — a faixa da rota mostra quantos de quantos,
// então dá para ver na hora se entrou pedido novo que ninguém conferiu ainda.
export default function Ciencia({ pedidos }) {
  const { user, nome } = useAuth()
  const { clientes, vendedores } = useCadastros()
  const [ciencias, setCiencias] = useState([])
  const [salvando, setSalvando] = useState('')
  const [abertos, setAbertos] = useState({})   // { "vendedor|rota": true }
  const [soPendentes, setSoPendentes] = useState(false)
  const [filtros, setFiltros] = useState({})

  const alternar = (k) => setAbertos((s) => ({ ...s, [k]: !s[k] }))

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'ciencias'),
      (snap) => setCiencias(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => console.error('Erro ao ler ciências:', e))
    return unsub
  }, [])

  const mapaC = indexaCienciasPorPedido(ciencias)
  const categorizados = (pedidos || []).filter((p) => p.status)
  const vendedoresFiltro = vendedoresDe(categorizados)
  const cat = filtraPedidos(categorizados, filtros, clientes)
  // pendente = falta a ciência do vendedor OU a conferência — é o que dá trabalho
  const pendente = (p) =>
    !cienciaDoPedido(mapaC, 'vendedor', p.idVenda) || !cienciaDoPedido(mapaC, 'designer', p.idVenda)

  const arvore = {}
  for (const p of cat) {
    if (soPendentes && !pendente(p)) continue
    const v = p.vendedor || '—'
    const r = p.rota || 'SEM ROTA'
    arvore[v] ??= {}
    arvore[v][r] ??= []
    arvore[v][r].push(p)
  }
  const vends = Object.keys(arvore).sort()
  const totalPendentes = cat.filter(pendente).length

  // conferência de um pedido só ou de todos os que faltam na rota (mesmo caminho)
  async function conferir(vendedor, ps, marca) {
    const faltam = semCiencia(mapaC, 'designer', ps)
    if (!faltam.length || salvando) return
    const msg = faltam.length === 1
      ? `Confirmar a conferência do pedido #${faltam[0].idVenda}?`
      : `Confirmar a conferência de ${faltam.length} pedido(s) de ${vendedor}?`
    if (!confirm(msg)) return
    setSalvando(marca)
    try {
      const ip = await pegarIP()
      const quem = { porUid: user.uid, porEmail: user.email, porNome: nome || user.email, ip }
      for (let i = 0; i < faltam.length; i += 450) {
        const batch = writeBatch(db)
        for (const p of faltam.slice(i, i + 450)) {
          batch.set(doc(collection(db, 'ciencias')), docCiencia({
            tipo: 'designer', vendedor, rota: p.rota || '', idVenda: p.idVenda, quem,
          }))
        }
        await batch.commit()
      }
    } catch (e) {
      alert('Não foi possível registrar: ' + (e.code || e.message))
    } finally {
      setSalvando('')
    }
  }

  return (
    <>
      <div className="toolbar">
        <h1 className="page-title">Ciência
          <small>
            conferência pedido a pedido ·{' '}
            {totalPendentes ? `${totalPendentes} pendente(s)` : 'tudo conferido'}
          </small>
        </h1>
        <div className="spacer" />
        <button className={`btn${soPendentes ? ' primary' : ''}`} onClick={() => setSoPendentes((v) => !v)}>
          {soPendentes ? '☑' : '☐'} Só pendentes
        </button>
      </div>

      <FiltrosBar filtros={filtros} setFiltros={setFiltros}
        vendedores={vendedoresFiltro} pedidos={categorizados} />

      {vends.length === 0 ? (
        <div className="empty"><div className="big">✍️</div>
          {soPendentes && cat.length
            ? 'Nenhuma pendência — tudo com ciência e conferido.'
            // com filtro na tela, dizer "não há pedido" seria mentira
            : (categorizados.length ? 'Nenhum pedido com esses filtros.' : 'Nenhum pedido categorizado para conferir.')}
        </div>
      ) : (
        vends.map((v) => (
          <div key={v} className="group-block">
            <div className="group-head"><h3>{v}</h3></div>
            {Object.entries(arvore[v]).sort().map(([rota, ps]) => {
              const foraRota = rota === 'FORA DE ROTA' || rota === 'SEM ROTA'
              const faltamV = semCiencia(mapaC, 'vendedor', ps)
              const faltamD = semCiencia(mapaC, 'designer', ps)
              const chave = v + '|' + rota
              const aberto = !!abertos[chave]
              return (
                <div key={rota} style={{ marginBottom: 14 }}>
                  <div className={`rota-band ${foraRota ? 'warn' : ''}`} style={{ cursor: 'pointer' }}
                    onClick={() => alternar(chave)}
                    title={aberto ? 'Recolher pedidos' : 'Ver pedidos'}>
                    <span className="rb-nome">{aberto ? '▾' : '▸'} 📍 {rota}</span>
                    <span className="rb-count">{ps.length} pedido(s)</span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '2px 2px 4px', alignItems: 'center' }}>
                    <Progresso titulo="Vendedor" total={ps.length} faltam={faltamV.length} />
                    <Progresso titulo="Conferido" total={ps.length} faltam={faltamD.length} />
                    {faltamD.length > 0 && (
                      <button className="btn ok" disabled={!!salvando} onClick={() => conferir(v, ps, chave)}>
                        {salvando === chave
                          ? 'Registrando…'
                          : `✓ Conferir ${faltamD.length === ps.length ? 'esta rota' : `os ${faltamD.length} que faltam`}`}
                      </button>
                    )}
                  </div>
                  {aberto && (
                    <div className="cards" style={{ marginTop: 6 }}>
                      {ps.map((p) => (
                        <CardCiencia key={p.idVenda} p={p} clientes={clientes} vendedores={vendedores}
                          cv={cienciaDoPedido(mapaC, 'vendedor', p.idVenda)}
                          cd={cienciaDoPedido(mapaC, 'designer', p.idVenda)}
                          salvando={salvando}
                          onConferir={() => conferir(v, [p], `p:${p.idVenda}`)} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))
      )}
    </>
  )
}

function Progresso({ titulo, total, faltam }) {
  const ok = total - faltam
  return (
    <span className="chip" style={faltam ? null : { color: 'var(--ok)' }}>
      {faltam ? '' : '✓ '}{titulo}: {ok} de {total}
    </span>
  )
}

function CardCiencia({ p, clientes, vendedores, cv, cd, salvando, onConferir }) {
  const previsao = previsaoDe(p, vendedores)
  const atrasado = situacaoPrazo(previsao) === 'atrasado'
  return (
    <div className={`card ${atrasado ? 'atrasado' : 'em_dia'}`}>
      <div className="card-top">
        <div className="cliente">{nomeCliente(p.cliente, clientes)}</div>
        <div className="idv">#{p.idVenda}</div>
      </div>
      <div className="meta-row">
        {p.origem && <span className={`chip origem-${p.origem.toLowerCase()}`}>{ORIGEM_NM[p.origem] || p.origem}</span>}
        <span className="chip">📍 {p.cidade || '—'}</span>
        {atrasado
          ? <span className="chip atrasado">Atrasado · {fmtData(previsao)}</span>
          : <span className="chip">{fmtData(previsao)}</span>}
      </div>
      <ul className="itens">
        {(p.itens || []).map((it, i) => (
          <li key={i}>
            <span>{it.produto} <span className="g">{MODO_NM[linhaDoItem(p, i)] || ''}</span></span>
            <span className="q">{it.qtd}</span>
          </li>
        ))}
      </ul>
      <div className="valor" style={{ marginTop: 8 }}>{fmtMoeda(p.valorTotal)}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        <CienciaTag titulo="Vendedor" c={cv} />
        {cd
          ? <CienciaTag titulo="Conferido" c={cd} />
          : <button className="btn ok no-print" disabled={!!salvando} onClick={onConferir}>
              {salvando === `p:${p.idVenda}` ? 'Registrando…' : '✓ Conferir este pedido'}
            </button>}
      </div>
    </div>
  )
}

function CienciaTag({ titulo, c }) {
  if (!c) return <span className="chip rota-warn">{titulo}: pendente</span>
  return (
    <span className="chip" style={{ color: 'var(--ok)' }}>
      ✓ {titulo}: {c.porEmail} · {fmtDataHora(c.quando)}{c.ip ? ` · IP ${c.ip}` : ''}
    </span>
  )
}
