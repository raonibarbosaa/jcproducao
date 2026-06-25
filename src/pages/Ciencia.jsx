import { useEffect, useState } from 'react'
import { collection, onSnapshot, addDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  indexaCiencias, cienciaDe, pegarIP, nomeCliente, previsaoDe,
  situacaoPrazo, fmtData, fmtMoeda, ORIGEM_NM, MODO_NM, linhaDoItem,
} from '../utils.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'

const fmtDataHora = (iso) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''

// Tela do DESIGNER/DONO: vê a ciência dos vendedores por rota (e-mail, IP, data/hora)
// e dá a própria ciência (conferido), com os mesmos critérios.
export default function Ciencia({ pedidos }) {
  const { user, nome } = useAuth()
  const { clientes, vendedores } = useCadastros()
  const [ciencias, setCiencias] = useState([])
  const [salvando, setSalvando] = useState('')
  const [abertos, setAbertos] = useState({}) // { "vendedor|rota": true }

  const alternar = (k) => setAbertos((s) => ({ ...s, [k]: !s[k] }))

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'ciencias'),
      (snap) => setCiencias(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => console.error('Erro ao ler ciências:', e))
    return unsub
  }, [])

  const mapaC = indexaCiencias(ciencias)
  const cat = (pedidos || []).filter((p) => p.status)

  const arvore = {}
  for (const p of cat) {
    const v = p.vendedor || '—'
    const r = p.rota || 'SEM ROTA'
    arvore[v] ??= {}
    arvore[v][r] ??= []
    arvore[v][r].push(p)
  }
  const vends = Object.keys(arvore).sort()

  async function conferir(vendedor, rota, ps) {
    if (!confirm(`Confirmar conferência (ciência) da ${rota} de ${vendedor}?`)) return
    setSalvando(vendedor + '|' + rota)
    try {
      const ip = await pegarIP()
      await addDoc(collection(db, 'ciencias'), {
        tipo: 'designer',
        vendedor, rota,
        pedidoIds: ps.map((p) => p.idVenda),
        qtdPedidos: ps.length,
        porUid: user.uid,
        porEmail: user.email,
        porNome: nome || user.email,
        ip,
        quando: new Date().toISOString(),
      })
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
          <small>conferência dos pedidos por rota</small>
        </h1>
      </div>

      {cat.length === 0 ? (
        <div className="empty"><div className="big">✍️</div>Nenhum pedido categorizado para conferir.</div>
      ) : (
        vends.map((v) => (
          <div key={v} className="group-block">
            <div className="group-head"><h3>{v}</h3></div>
            {Object.entries(arvore[v]).sort().map(([rota, ps]) => {
              const foraRota = rota === 'FORA DE ROTA' || rota === 'SEM ROTA'
              const cv = cienciaDe(mapaC, 'vendedor', v, rota)
              const cd = cienciaDe(mapaC, 'designer', v, rota)
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
                    <CienciaTag titulo="Vendedor" c={cv} />
                    {cd
                      ? <CienciaTag titulo="Conferido" c={cd} />
                      : <button className="btn ok" disabled={salvando === chave} onClick={() => conferir(v, rota, ps)}>
                          {salvando === chave ? 'Registrando…' : '✓ Dar ciência (conferido)'}
                        </button>}
                  </div>
                  {aberto && (
                    <div className="cards" style={{ marginTop: 6 }}>
                      {ps.map((p) => <CardCiencia key={p.idVenda} p={p} clientes={clientes} vendedores={vendedores} />)}
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

function CardCiencia({ p, clientes, vendedores }) {
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
