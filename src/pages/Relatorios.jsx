import { useState } from 'react'
import {
  MODO_ORDER, MODO_NM, MODO_COR, fmtData, previsaoDe,
  linhaDoItem, totaisPorMaterial, somaTotais, TOTAIS_ZERO, fmtQtd,
  vendedoresDe, materialDoItem, normaliza,
} from '../utils.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'

const MATERIAL_NM = { papel: 'Papel', plastico: 'Plástico' }

// Relatório de consumo físico (kg de plástico, unidade de papel) por período,
// com quebra por LINHA e por ROTA. Regra: plástico = kg, papel = unidade.
// Filtro de material (papel × plástico) e, quando "Papel", seleção de itens
// (caixas de seleção) para gerar relatório de um, dois ou mais itens de papel.
export default function Relatorios({ pedidos }) {
  const { vendedores: cadastros, clientes, itens: itensCad } = useCadastros()
  const [ini, setIni] = useState('')
  const [fim, setFim] = useState('')
  const [vendedor, setVendedor] = useState('')
  const [linha, setLinha] = useState('')
  const [rota, setRota] = useState('')
  const [material, setMaterial] = useState('')            // '' | 'plastico' | 'papel'
  const [itensOff, setItensOff] = useState(() => new Set()) // itens de papel DESmarcados (chave normalizada)

  // previsão viva + só categorizados
  const base = pedidos
    .map((p) => ({ ...p, previsao: previsaoDe(p, cadastros) }))
    .filter((p) => p.status)

  const vendedores = vendedoresDe(base)
  const rotas = [...new Set(base.map((p) => p.rota || 'SEM ROTA'))].sort()

  // filtros de pedido (período pela data de entrega/previsão)
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

  const soPapel = material === 'papel'
  const soPlast = material === 'plastico'
  const showPlast = !soPapel   // esconde coluna de plástico quando "só Papel"
  const showPapel = !soPlast   // esconde coluna de papel quando "só Plástico"

  // explode item a item: aplica a linha (por item), o material e a seleção de
  // itens. O catálogo de itens de papel (p/ as caixas de seleção) é montado
  // ANTES do filtro de seleção, pra o item continuar na lista mesmo desmarcado.
  const porLinha = {}   // { LINHA: totais }
  const porRota = {}    // { ROTA: totais }
  let geral = TOTAIS_ZERO
  const itensPapelMap = {}   // chave -> { nome, qtd }  (todos os itens de papel do escopo)
  for (const p of filtrados) {
    const itens = p.itens || []
    itens.forEach((it, i) => {
      const l = linhaDoItem(p, i) || p.status || ''
      if (linha && l !== linha) return
      const mat = materialDoItem(it, itensCad)

      // cataloga item de papel do escopo (independe da seleção/desmarcação)
      if (mat === 'papel') {
        const k = normaliza(it.produto)
        if (!itensPapelMap[k]) itensPapelMap[k] = { nome: (it.produto || '').trim() || '—', qtd: 0 }
        itensPapelMap[k].qtd += Number(it.qtd) || 0
      }

      // filtro de material + seleção de itens de papel (caixas)
      if (material && mat !== material) return
      if (soPapel && itensOff.has(normaliza(it.produto))) return

      const tot = totaisPorMaterial([it], itensCad)
      porLinha[l] = somaTotais(porLinha[l] || TOTAIS_ZERO, tot)
      const r = p.rota || 'SEM ROTA'
      porRota[r] = somaTotais(porRota[r] || TOTAIS_ZERO, tot)
      geral = somaTotais(geral, tot)
    })
  }

  const linhasOrd = MODO_ORDER.filter((m) => porLinha[m])
  const rotasOrd = Object.keys(porRota).sort()

  // itens de papel: lista p/ as caixas (alfabética) e ranking selecionado (por qtd)
  const itensPapel = Object.entries(itensPapelMap).map(([key, v]) => ({ key, ...v }))
  const itensPapelAlfa = [...itensPapel].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const itensPapelSel = itensPapel
    .filter((it) => !itensOff.has(it.key))
    .sort((a, b) => b.qtd - a.qtd)
  const nSel = itensPapelSel.length
  const nTotalItens = itensPapel.length

  const toggleItem = (k) => setItensOff((prev) => {
    const n = new Set(prev)
    if (n.has(k)) n.delete(k)
    else n.add(k)
    return n
  })
  const marcarTodos = () => setItensOff(new Set())
  const desmarcarTodos = () => setItensOff(new Set(itensPapel.map((i) => i.key)))

  const temFiltro = ini || fim || vendedor || linha || rota || material
  const limpar = () => {
    setIni(''); setFim(''); setVendedor(''); setLinha(''); setRota('')
    setMaterial(''); setItensOff(new Set())
  }

  const periodoTxt = (ini || fim)
    ? `${ini ? fmtData(ini + 'T00:00:00') : '…'} a ${fim ? fmtData(fim + 'T00:00:00') : '…'}`
    : 'todas as datas'
  const materialTxt = material ? ` · só ${MATERIAL_NM[material]}` : ''
  const itensTxt = (soPapel && nTotalItens && nSel !== nTotalItens)
    ? ` · ${nSel} de ${nTotalItens} item(ns)` : ''

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
        <select className="filtro-input" value={material} onChange={(e) => setMaterial(e.target.value)} title="Filtrar por material (papel × plástico)">
          <option value="">Todos os materiais</option>
          <option value="papel">Só Papel</option>
          <option value="plastico">Só Plástico</option>
        </select>
        {temFiltro && <button className="btn-clear" onClick={limpar}>✕ limpar filtros</button>}
      </div>

      {/* ---------- SELEÇÃO DE ITENS (só quando Papel) ---------- */}
      {soPapel && (
        <div className="rel-itens-sel no-print">
          <div className="ris-cab">
            <span className="filtro-label">Itens de papel</span>
            <span className="ris-count">{nSel}/{nTotalItens} selecionado(s)</span>
            <div className="spacer" />
            <button className="ris-mini" onClick={marcarTodos} disabled={!nTotalItens}>marcar todos</button>
            <button className="ris-mini" onClick={desmarcarTodos} disabled={!nTotalItens}>limpar</button>
          </div>
          {nTotalItens === 0 ? (
            <div className="ris-vazio">Nenhum item de papel no filtro atual.</div>
          ) : (
            <div className="rel-chks">
              {itensPapelAlfa.map((it) => {
                const on = !itensOff.has(it.key)
                return (
                  <label key={it.key} className={`rel-chk${on ? '' : ' off'}`}>
                    <input type="checkbox" checked={on} onChange={() => toggleItem(it.key)} />
                    <span className="rc-nome">{it.nome}</span>
                    <span className="rc-qtd">{fmtQtd(it.qtd)}</span>
                  </label>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ---------- RESULTADO ---------- */}
      <div className="rel-periodo">
        📅 {periodoTxt} · {filtrados.length} pedido(s){materialTxt}{itensTxt}
      </div>

      {/* total geral em destaque */}
      <div className="rel-cards">
        {showPlast && (
          <div className="rel-total-card plastico">
            <div className="rt-label">Plástico</div>
            <div className="rt-valor">{fmtQtd(geral.plastico)} <span>kg</span></div>
          </div>
        )}
        {showPapel && (
          <div className="rel-total-card papel">
            <div className="rt-label">Papel</div>
            <div className="rt-valor">{fmtQtd(geral.papel)} <span>un</span></div>
          </div>
        )}
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
        <>
          <div className="rel-grids">
            {/* por linha de produção */}
            <div className="rel-bloco">
              <h3>Por linha de produção</h3>
              <table className="rel-tab">
                <thead><tr>
                  <th>Linha</th>
                  {showPlast && <th className="q">Plástico (kg)</th>}
                  {showPapel && <th className="q">Papel (un)</th>}
                </tr></thead>
                <tbody>
                  {linhasOrd.map((m) => (
                    <tr key={m}>
                      <td><span className="rel-dot" style={{ background: MODO_COR[m] }} />{MODO_NM[m]}</td>
                      {showPlast && <td className="q">{fmtQtd(porLinha[m].plastico)}</td>}
                      {showPapel && <td className="q">{fmtQtd(porLinha[m].papel)}</td>}
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr>
                  <td>Total</td>
                  {showPlast && <td className="q">{fmtQtd(geral.plastico)}</td>}
                  {showPapel && <td className="q">{fmtQtd(geral.papel)}</td>}
                </tr></tfoot>
              </table>
            </div>

            {/* por rota */}
            <div className="rel-bloco">
              <h3>Por rota</h3>
              <table className="rel-tab">
                <thead><tr>
                  <th>Rota</th>
                  {showPlast && <th className="q">Plástico (kg)</th>}
                  {showPapel && <th className="q">Papel (un)</th>}
                </tr></thead>
                <tbody>
                  {rotasOrd.map((r) => (
                    <tr key={r}>
                      <td>📍 {r}</td>
                      {showPlast && <td className="q">{fmtQtd(porRota[r].plastico)}</td>}
                      {showPapel && <td className="q">{fmtQtd(porRota[r].papel)}</td>}
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr>
                  <td>Total</td>
                  {showPlast && <td className="q">{fmtQtd(geral.plastico)}</td>}
                  {showPapel && <td className="q">{fmtQtd(geral.papel)}</td>}
                </tr></tfoot>
              </table>
            </div>
          </div>

          {/* por item (só quando Papel) — venda de itens por tipo de item */}
          {soPapel && (
            <div className="rel-bloco rel-item-bloco">
              <h3>Por item · papel
                {nSel !== nTotalItens && <small className="ib-sub"> ({nSel} de {nTotalItens} selecionado{nSel === 1 ? '' : 's'})</small>}
              </h3>
              {nSel === 0 ? (
                <div className="ris-vazio">Nenhum item de papel selecionado.</div>
              ) : (
                <table className="rel-tab">
                  <thead><tr><th>Item</th><th className="q">Papel (un)</th></tr></thead>
                  <tbody>
                    {itensPapelSel.map((it) => (
                      <tr key={it.key}>
                        <td><span className="rel-dot" style={{ background: '#1A5FB4' }} />{it.nome}</td>
                        <td className="q">{fmtQtd(it.qtd)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td>Total</td><td className="q">{fmtQtd(geral.papel)}</td></tr></tfoot>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </>
  )
}
