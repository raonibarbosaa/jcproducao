import { useState } from 'react'
import {
  MODO_ORDER, MODO_NM, MODO_COR, fmtData, fmtMoeda, situacaoPrazo, ORIGEM_NM,
} from '../utils.js'

export default function Producao({ pedidos }) {
  const [filtroLinha, setFiltroLinha] = useState('')

  // só pedidos já categorizados
  let lista = pedidos.filter((p) => p.status)
  if (filtroLinha) lista = lista.filter((p) => p.status === filtroLinha)

  // agrupa: Vendedor -> Data de entrega -> Linha -> Rota
  const arvore = {}
  for (const p of lista) {
    const vend = p.vendedor || '—'
    const data = fmtData(p.previsao)
    arvore[vend] ??= {}
    arvore[vend][data] ??= {}
    arvore[vend][data][p.status] ??= {}
    const rota = p.rota || 'SEM ROTA'
    arvore[vend][data][p.status][rota] ??= []
    arvore[vend][data][p.status][rota].push(p)
  }

  const vendedores = Object.keys(arvore).sort()

  return (
    <>
      <div className="toolbar">
        <h1 className="page-title">Lista de Produção
          <small>{lista.length} pedidos</small>
        </h1>
        <div className="spacer" />
        <select className="btn" value={filtroLinha} onChange={(e) => setFiltroLinha(e.target.value)}>
          <option value="">Todas as linhas</option>
          {MODO_ORDER.map((m) => <option key={m} value={m}>{MODO_NM[m]}</option>)}
        </select>
        <button className="btn" onClick={() => window.print()}>🖨 Imprimir</button>
      </div>

      {lista.length === 0 ? (
        <div className="empty"><div className="big">🏭</div>Nenhum pedido categorizado ainda.</div>
      ) : (
        vendedores.map((vend) => (
          <div key={vend} className="group-block">
            <div className="group-head">
              <h3>{vend}</h3>
            </div>
            {Object.entries(arvore[vend]).sort().map(([data, linhas]) => (
              <div key={data} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: 'var(--text-dim)', fontWeight: 600, margin: '6px 0' }}>
                  📅 Entrega: {data}
                </div>
                {MODO_ORDER.filter((m) => linhas[m]).map((m) => (
                  <div key={m} style={{ marginBottom: 10 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, margin:'8px 0 6px' }}>
                      <span className="chip linha" style={{ background: MODO_COR[m] }}>{MODO_NM[m]}</span>
                    </div>
                    {Object.entries(linhas[m]).sort().map(([rota, ps]) => (
                      <div key={rota} style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-faint)', margin: '4px 0', fontWeight: 600 }}>
                          {rota} · {ps.length}
                        </div>
                        <div className="cards">
                          {ps.map((p) => <CardProd key={p.idVenda} p={p} />)}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))
      )}
    </>
  )
}

function CardProd({ p }) {
  const atrasado = situacaoPrazo(p.previsao) === 'atrasado'
  const foraRota = p.rota === 'FORA DE ROTA' || p.rota === 'SEM ROTA'
  return (
    <div className={`card ${atrasado ? 'atrasado' : 'em_dia'} ${foraRota ? 'fora-rota' : ''}`}>
      <div className="card-top">
        <div className="cliente">{p.cliente}</div>
        <div className="idv">#{p.idVenda}</div>
      </div>
      <div className="meta-row">
        {p.origem && <span className={`chip origem-${p.origem.toLowerCase()}`}>{ORIGEM_NM[p.origem] || p.origem}</span>}
        <span className={`chip ${foraRota ? 'rota-warn' : ''}`}>{p.cidade || '—'}</span>
        {atrasado && <span className="chip atrasado">Atrasado</span>}
      </div>
      <ul className="itens">
        {p.itens.map((it, i) => (
          <li key={i}>
            <span>{it.produto}</span>
            <span className="q">{it.qtd}</span>
          </li>
        ))}
      </ul>
      {p.obs && <div style={{ fontSize: 12, color: 'var(--warn)', marginTop: 6 }}>⚠ {p.obs}</div>}
    </div>
  )
}
