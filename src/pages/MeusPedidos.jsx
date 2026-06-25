import {
  previsaoDe, fmtData, fmtMoeda, situacaoPrazo, ORIGEM_NM,
  nomeCliente, MODO_NM, linhaDoItem,
} from '../utils.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'

// Tela do perfil VENDEDOR: vê apenas os próprios pedidos (já filtrados no App
// e impostos pelas regras do Firestore), agrupados por rota.
export default function MeusPedidos({ pedidos }) {
  const { vendedores, clientes } = useCadastros()
  const { vendedorNome, nome } = useAuth()

  const base = pedidos.map((p) => ({ ...p, previsao: previsaoDe(p, vendedores) }))
  const cat = base.filter((p) => p.status)

  const arvore = {}
  for (const p of cat) {
    const r = p.rota || 'SEM ROTA'
    arvore[r] ??= []
    arvore[r].push(p)
  }
  const rotas = Object.keys(arvore).sort()

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
          return (
            <div key={rota} style={{ marginBottom: 16 }}>
              <div className={`rota-band ${foraRota ? 'warn' : ''}`}>
                <span className="rb-nome">📍 {rota}</span>
                <span className="rb-count">{arvore[rota].length} pedido(s)</span>
              </div>
              <div className="cards">
                {arvore[rota].map((p) => <CardMeu key={p.idVenda} p={p} clientes={clientes} />)}
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
