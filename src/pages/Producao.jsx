import { useState } from 'react'
import {
  MODO_ORDER, MODO_NM, MODO_COR, fmtData, situacaoPrazo, ORIGEM_NM,
  filtraPedidos, vendedoresDe, resumoFiltros, previsaoDe,
} from '../utils.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import FiltrosBar from '../components/FiltrosBar.jsx'

export default function Producao({ pedidos }) {
  const { vendedores: cadastros } = useCadastros()
  const [filtroLinha, setFiltroLinha] = useState('')
  const [filtros, setFiltros] = useState({})

  // recalcula a previsão de entrega com o calendário ATUAL do Cadastro
  const base = pedidos.map((p) => ({ ...p, previsao: previsaoDe(p, cadastros) }))
  const categorizados = base.filter((p) => p.status)
  const vendedores = vendedoresDe(categorizados)

  let lista = categorizados
  if (filtroLinha) lista = lista.filter((p) => p.status === filtroLinha)
  lista = filtraPedidos(lista, filtros)

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

  const vendedoresOrd = Object.keys(arvore).sort()
  const filtrado = lista.length !== categorizados.length

  return (
    <>
      <div className="toolbar no-print">
        <h1 className="page-title">Lista de Produção
          <small>
            {filtrado ? `${lista.length} de ${categorizados.length} pedidos` : `${lista.length} pedidos`}
          </small>
        </h1>
        <div className="spacer" />
        <select className="btn" value={filtroLinha} onChange={(e) => setFiltroLinha(e.target.value)}>
          <option value="">Todas as linhas</option>
          {MODO_ORDER.map((m) => <option key={m} value={m}>{MODO_NM[m]}</option>)}
        </select>
        <button className="btn" onClick={() => window.print()}>🖨 Imprimir</button>
      </div>

      <FiltrosBar filtros={filtros} setFiltros={setFiltros} vendedores={vendedores} />

      {/* ---------- TELA ---------- */}
      <div className="screen-only">
        {lista.length === 0 ? (
          <div className="empty"><div className="big">🏭</div>
            {categorizados.length === 0 ? 'Nenhum pedido categorizado ainda.' : 'Nenhum pedido com esses filtros.'}
          </div>
        ) : (
          vendedoresOrd.map((vend) => (
            <div key={vend} className="group-block">
              <div className="group-head"><h3>{vend}</h3></div>
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
      </div>

      {/* ---------- IMPRESSÃO ---------- */}
      <ImpressaoProducao
        arvore={arvore} vendedoresOrd={vendedoresOrd}
        filtros={filtros} filtroLinha={filtroLinha} total={lista.length}
      />
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
        <span className={`chip ${foraRota ? 'rota-warn' : ''}`}>📍 {p.cidade || '—'}</span>
        {atrasado && <span className="chip atrasado">Atrasado</span>}
      </div>
      <ul className="itens">
        {p.itens.map((it, i) => (
          <li key={i}><span>{it.produto}</span><span className="q">{it.qtd}</span></li>
        ))}
      </ul>
      {p.obs && <div style={{ fontSize: 12, color: 'var(--warn)', marginTop: 6 }}>⚠ {p.obs}</div>}
    </div>
  )
}

// ============================ LAYOUT DE IMPRESSÃO ============================
function ImpressaoProducao({ arvore, vendedoresOrd, filtros, filtroLinha, total }) {
  const hoje = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  const resumo = resumoFiltros(filtros)
  return (
    <div className="print-only">
      <div className="pr-head">
        <h1>JC Sacolas · Lista de Produção</h1>
        <div className="meta">
          Impresso em {hoje}<br />
          {total} pedido(s){filtroLinha ? ` · linha ${MODO_NM[filtroLinha]}` : ''}
          {resumo && <><br />{resumo}</>}
        </div>
      </div>

      {vendedoresOrd.map((vend) => (
        <div key={vend} className="pr-block">
          <div className="pr-vend">{vend}</div>
          {Object.entries(arvore[vend]).sort().map(([data, linhas]) => (
            <div key={data}>
              <div className="pr-data">Entrega: {data}</div>
              {MODO_ORDER.filter((m) => linhas[m]).map((m) => (
                <div key={m}>
                  <span className="pr-linha" style={{ color: MODO_COR[m], borderColor: MODO_COR[m] }}>{MODO_NM[m]}</span>
                  {Object.entries(linhas[m]).sort().map(([rota, ps]) => (
                    <div key={rota}>
                      <div className="pr-rota">{rota} · {ps.length} pedido(s)</div>
                      {ps.map((p) => (
                        <div key={p.idVenda} className="pr-ped">
                          <div className="top">
                            <span className="box" />
                            <span className="nm">#{p.idVenda} — {p.cliente}</span>
                            <span className="cid">({p.cidade || '—'})</span>
                          </div>
                          <table className="pr-itens"><tbody>
                            {p.itens.map((it, i) => (
                              <tr key={i}><td>{it.produto}</td><td className="q">{it.qtd}</td></tr>
                            ))}
                          </tbody></table>
                          {p.obs && <div className="pr-obs">⚠ {p.obs}</div>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
