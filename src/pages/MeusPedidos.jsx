import { useEffect, useState } from 'react'
import { collection, onSnapshot, addDoc, query, where } from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  previsaoDe, fmtData, fmtMoeda, situacaoPrazo, ORIGEM_NM,
  nomeCliente, MODO_NM, linhaDoItem, pegarIP, indexaCiencias, cienciaDe,
} from '../utils.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'

const fmtDataHora = (iso) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''

// Tela do perfil VENDEDOR: vê apenas os próprios pedidos (filtrados no App e
// impostos pelas regras), agrupados por rota, e dá CIÊNCIA por rota.
export default function MeusPedidos({ pedidos }) {
  const { vendedores, clientes } = useCadastros()
  const { user, vendedorNome, nome } = useAuth()
  const [ciencias, setCiencias] = useState([])
  const [salvando, setSalvando] = useState('')

  useEffect(() => {
    if (!vendedorNome) return
    const q = query(collection(db, 'ciencias'), where('vendedor', '==', vendedorNome))
    const unsub = onSnapshot(q, (snap) => setCiencias(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => console.error('Erro ao ler ciências:', e))
    return unsub
  }, [vendedorNome])

  const mapaC = indexaCiencias(ciencias)

  const base = pedidos.map((p) => ({ ...p, previsao: previsaoDe(p, vendedores) }))
  const cat = base.filter((p) => p.status)

  const arvore = {}
  for (const p of cat) {
    const r = p.rota || 'SEM ROTA'
    arvore[r] ??= []
    arvore[r].push(p)
  }
  const rotas = Object.keys(arvore).sort()

  async function darCiencia(rota, ps) {
    if (!confirm(`Confirmar que você viu e está ciente dos ${ps.length} pedido(s) da ${rota}?`)) return
    setSalvando(rota)
    try {
      const ip = await pegarIP()
      await addDoc(collection(db, 'ciencias'), {
        tipo: 'vendedor',
        vendedor: vendedorNome,
        rota,
        pedidoIds: ps.map((p) => p.idVenda),
        qtdPedidos: ps.length,
        porUid: user.uid,
        porEmail: user.email,
        porNome: nome || user.email,
        ip,
        quando: new Date().toISOString(),
      })
    } catch (e) {
      alert('Não foi possível registrar a ciência: ' + (e.code || e.message))
    } finally {
      setSalvando('')
    }
  }

  return (
    <>
      <div className="toolbar no-print">
        <h1 className="page-title">Meus Pedidos
          <small>{vendedorNome || nome} · {cat.length} pedido(s)</small>
        </h1>
        <div className="spacer" />
        <button className="btn" onClick={() => window.print()}>🖨 Imprimir</button>
      </div>

      {cat.length === 0 ? (
        <div className="empty"><div className="big">📦</div>Nenhum pedido para você no momento.</div>
      ) : (
        rotas.map((rota) => {
          const foraRota = rota === 'FORA DE ROTA' || rota === 'SEM ROTA'
          const ps = arvore[rota]
          const c = cienciaDe(mapaC, 'vendedor', vendedorNome, rota)
          return (
            <div key={rota} style={{ marginBottom: 16 }}>
              <div className={`rota-band ${foraRota ? 'warn' : ''}`}>
                <span className="rb-nome">📍 {rota}</span>
                <span className="rb-count">{ps.length} pedido(s)</span>
                <div className="no-print" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {c ? (
                    <span className="chip" style={{ color: 'var(--ok)' }}>✓ Ciência em {fmtDataHora(c.quando)}</span>
                  ) : (
                    <button className="btn ok" disabled={salvando === rota}
                      onClick={() => darCiencia(rota, ps)}>
                      {salvando === rota ? 'Registrando…' : '✓ Dar ciência nesta rota'}
                    </button>
                  )}
                </div>
              </div>
              <div className="cards">
                {ps.map((p) => <CardMeu key={p.idVenda} p={p} clientes={clientes} />)}
              </div>
            </div>
          )
        })
      )}
    </>
  )
}

function CardMeu({ p, clientes }) {
  const atrasado = situacaoPrazo(p.previsao) === 'atrasado'
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
          ? <span className="chip atrasado">Atrasado · {fmtData(p.previsao)}</span>
          : <span className="chip">{fmtData(p.previsao)}</span>}
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
