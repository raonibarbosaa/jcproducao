import { useState } from 'react'
import {
  MODO_ORDER, MODO_NM, MODO_COR, fmtData, previsaoDe,
  linhaDoItem, totaisPorMaterial, somaTotais, TOTAIS_ZERO, fmtQtd,
  vendedoresDe,
} from '../utils.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'

// Relatório de consumo físico (kg de plástico, unidade de papel) por período,
// com quebra por LINHA e por ROTA. Regra: plástico = kg, papel = unidade.
export default function Relatorios({ pedidos }) {
  const { vendedores: cadastros, clientes, itens: itensCad } = useCadastros()
  const [ini, setIni] = useState('')
  const [fim, setFim] = useState('')
  const [vendedor, setVendedor] = useState('')
  const [linha, setLinha] = useState('')
  const [rota, setRota] = useState('')

  // previsão viva + só categorizados
  const base = pedidos
    .map((p) => ({ ...p, previsao: previsaoDe(p, cadastros) }))
    .filter((p) => p.status)

  const vendedores = vendedoresDe(base)
  const rotas = [...new Set(base.map((p) => p.rota || 'SEM ROTA'))].sort()

  // aplica os filtros (período pela data de entrega/previsão)
  const dIni = ini ? new Date(ini + 'T00:00:00') : null
  const dFim = fim ? new Date(fim + 'T23:59:59') : null
  const filtrados = base.filter((p) => {
    if (vendedor && (p.vendedor || '—') !== vendedor) return false
    if (rota && (p.rota || 'SEM ROTA') !== rota) return false
    if (dIni || dFim) {
      if (!p.previsao) return false
      const d = new Date(p.previsao)
      if (dIni && d < dIni) return false
      if (dFim && d > dFim) return false
    }
    return true
  })

  // explode item a item, atribuindo linha por item; respeita o filtro de linha
  // por-linha e por-rota, e total geral.
  const porLinha = {}   // { LINHA: totais }
  const porRota = {}    // { ROTA: totais }
  let geral = TOTAIS_ZERO
  let nItens = 0
  for (const p of filtrados) {
    const itens = p.itens || []
    itens.forEach((it, i) => {
      const l = linhaDoItem(p, i) || p.status || ''
      if (linha && l !== linha) return
      const tot = totaisPorMaterial([it], itensCad)
      porLinha[l] = somaTotais(porLinha[l] || TOTAIS_ZERO, tot)
      const r = p.rota || 'SEM ROTA'
      porRota[r] = somaTotais(porRota[r] || TOTAIS_ZERO, tot)
      geral = somaTotais(geral, tot)
      if (tot.plastico || tot.papel || tot.outro) nItens++
    })
  }

  const linhasOrd = MODO_ORDER.filter((m) => porLinha[m])
  const rotasOrd = Object.keys(porRota).sort()
  const temFiltro = ini || fim || vendedor || linha || rota
  const limpar = () => { setIni(''); setFim(''); setVendedor(''); setLinha(''); setRota('') }

  const periodoTxt = (ini || fim)
    ? `${ini ? fmtData(ini + 'T00:00:00') : '…'} a ${fim ? fmtData(fim + 'T00:00:00') : '…'}`
    : 'todas as datas'

  return (
    <>
      <div className="toolbar">
        <h1 className="page-title">Relatórios
          <small>consumo físico · plástico em kg · papel em unidade</small>
        </h1>
        <div className="spacer" />
        <button className="btn" onClick={() => window.print()}>🖨 Imprimir</button>
      </div>

      {/* ---------- FILTROS ---------- */}
      <div className="filtros no-print">
        <span className="filtro-label">Entrega de</span>
        <input type="date" className="filtro-input filtro-date" value={ini} onChange={(e) => setIni(e.target.value)} />
        <span className="filtro-label">até</span>
        <input type="date" className="filtro-input filtro-date" value={fim} onChange={(e) => setFim(e.target.value)} />
        <select className="filtro-input" value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
          <option value="">Todos vendedores</option>
          {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select className="filtro-input" value={linha} onChange={(e) => setLinha(e.target.value)}>
          <option value="">Todas as linhas</option>
          {MODO_ORDER.map((m) => <option key={m} value={m}>{MODO_NM[m]}</option>)}
        </select>
        <select className="filtro-input" value={rota} onChange={(e) => setRota(e.target.value)}>
          <option value="">Todas as rotas</option>
          {rotas.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        {temFiltro && <button className="btn-clear" onClick={limpar}>✕ limpar filtros</button>}
      </div>

      {/* ---------- RESULTADO ---------- */}
      <div className="rel-periodo">
        📅 {periodoTxt} · {filtrados.length} pedido(s)
      </div>

      {/* total geral em destaque */}
      <div className="rel-cards">
        <div className="rel-total-card plastico">
          <div className="rt-label">Plástico</div>
          <div className="rt-valor">{fmtQtd(geral.plastico)} <span>kg</span></div>
        </div>
        <div className="rel-total-card papel">
          <div className="rt-label">Papel</div>
          <div className="rt-valor">{fmtQtd(geral.papel)} <span>un</span></div>
        </div>
        {geral.outro > 0 && (
          <div className="rel-total-card outro">
            <div className="rt-label">Outros (sem material)</div>
            <div className="rt-valor">{fmtQtd(geral.outro)}</div>
          </div>
        )}
      </div>

      {filtrados.length === 0 ? (
        <div className="empty"><div className="big">📊</div>Nenhum pedido nesse filtro.</div>
      ) : (
        <div className="rel-grids">
          {/* por linha de produção */}
          <div className="rel-bloco">
            <h3>Por linha de produção</h3>
            <table className="rel-tab">
              <thead><tr><th>Linha</th><th className="q">Plástico (kg)</th><th className="q">Papel (un)</th></tr></thead>
              <tbody>
                {linhasOrd.map((m) => (
                  <tr key={m}>
                    <td><span className="rel-dot" style={{ background: MODO_COR[m] }} />{MODO_NM[m]}</td>
                    <td className="q">{fmtQtd(porLinha[m].plastico)}</td>
                    <td className="q">{fmtQtd(porLinha[m].papel)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td>Total</td><td className="q">{fmtQtd(geral.plastico)}</td><td className="q">{fmtQtd(geral.papel)}</td></tr></tfoot>
            </table>
          </div>

          {/* por rota */}
          <div className="rel-bloco">
            <h3>Por rota</h3>
            <table className="rel-tab">
              <thead><tr><th>Rota</th><th className="q">Plástico (kg)</th><th className="q">Papel (un)</th></tr></thead>
              <tbody>
                {rotasOrd.map((r) => (
                  <tr key={r}>
                    <td>📍 {r}</td>
                    <td className="q">{fmtQtd(porRota[r].plastico)}</td>
                    <td className="q">{fmtQtd(porRota[r].papel)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td>Total</td><td className="q">{fmtQtd(geral.plastico)}</td><td className="q">{fmtQtd(geral.papel)}</td></tr></tfoot>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
