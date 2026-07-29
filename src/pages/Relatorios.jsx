import { useState } from 'react'
import {
  MODO_ORDER, MODO_NM, MODO_COR, fmtData, previsaoDe,
  linhaDoItem, totaisPorMaterial, somaTotais, TOTAIS_ZERO, fmtQtd,
  vendedoresDe, materialDoItem, normaliza,
  MATERIAIS, nomeDoMaterial, corDoMaterial, unidadeDoMaterial,
} from '../utils.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'

// Relatório de consumo físico por período, com quebra por LINHA e por ROTA.
// Regra: plástico em kg; papel, etiquetas e alça torcida em unidade.
// Filtro de material e, quando um material é escolhido, seleção de itens
// (caixas de seleção) para gerar relatório de um, dois ou mais itens.
export default function Relatorios({ pedidos }) {
  const { vendedores: cadastros, clientes, itens: itensCad } = useCadastros()
  const [ini, setIni] = useState('')
  const [fim, setFim] = useState('')
  const [vendedor, setVendedor] = useState('')
  const [linha, setLinha] = useState('')
  const [rota, setRota] = useState('')
  const [material, setMaterial] = useState('')            // '' | id de material
  const [itensOff, setItensOff] = useState(() => new Set()) // itens DESmarcados (chave normalizada)

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

  // explode item a item: aplica a linha (por item), o material e a seleção de
  // itens. O catálogo de itens do material escolhido é montado ANTES do filtro
  // de seleção, pra o item continuar na lista mesmo desmarcado.
  const porLinha = {}   // { LINHA: totais }
  const porRota = {}    // { ROTA: totais }
  let geral = TOTAIS_ZERO
  const itensSelMap = {}   // chave -> { nome, qtd }  (itens do material escolhido)
  for (const p of filtrados) {
    const itens = p.itens || []
    itens.forEach((it, i) => {
      const l = linhaDoItem(p, i) || p.status || ''
      if (linha && l !== linha) return
      const mat = materialDoItem(it, itensCad)

      // cataloga itens do material escolhido (independe da desmarcação)
      if (material && mat === material) {
        const k = normaliza(it.produto)
        if (!itensSelMap[k]) itensSelMap[k] = { nome: (it.produto || '').trim() || '—', qtd: 0 }
        itensSelMap[k].qtd += Number(it.qtd) || 0
      }

      // filtro de material + seleção de itens (caixas)
      if (material && mat !== material) return
      if (material && itensOff.has(normaliza(it.produto))) return

      const tot = totaisPorMaterial([it], itensCad)
      porLinha[l] = somaTotais(porLinha[l] || TOTAIS_ZERO, tot)
      const r = p.rota || 'SEM ROTA'
      porRota[r] = somaTotais(porRota[r] || TOTAIS_ZERO, tot)
      geral = somaTotais(geral, tot)
    })
  }

  const linhasOrd = MODO_ORDER.filter((m) => porLinha[m])
  const rotasOrd = Object.keys(porRota).sort()

  // materiais a exibir: o filtrado, ou todos os presentes (qtd > 0)
  const matsPresentes = material
    ? [material]
    : MATERIAIS.map((m) => m.id).filter((id) => geral[id] > 0)
  const colMats = matsPresentes.length ? matsPresentes : ['plastico', 'papel']

  // itens do material escolhido: caixas (alfabética) e ranking selecionado (por qtd)
  const itens = Object.entries(itensSelMap).map(([key, v]) => ({ key, ...v }))
  const itensAlfa = [...itens].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const itensSel = itens.filter((it) => !itensOff.has(it.key)).sort((a, b) => b.qtd - a.qtd)
  const nSel = itensSel.length
  const nTotalItens = itens.length
  const nomeSel = material ? nomeDoMaterial(material) : ''
  const unidSel = material ? unidadeDoMaterial(material) : ''

  const toggleItem = (k) => setItensOff((prev) => {
    const n = new Set(prev)
    if (n.has(k)) n.delete(k)
    else n.add(k)
    return n
  })
  const marcarTodos = () => setItensOff(new Set())
  const desmarcarTodos = () => setItensOff(new Set(itens.map((i) => i.key)))

  const temFiltro = ini || fim || vendedor || linha || rota || material
  const limpar = () => {
    setIni(''); setFim(''); setVendedor(''); setLinha(''); setRota('')
    setMaterial(''); setItensOff(new Set())
  }

  const periodoTxt = (ini || fim)
    ? `${ini ? fmtData(ini + 'T00:00:00') : '…'} a ${fim ? fmtData(fim + 'T00:00:00') : '…'}`
    : 'todas as datas'
  const materialTxt = material ? ` · só ${nomeSel}` : ''
  const itensTxt = (material && nTotalItens && nSel !== nTotalItens)
    ? ` · ${nSel} de ${nTotalItens} item(ns)` : ''

  const colHead = (id) => `${nomeDoMaterial(id)} (${unidadeDoMaterial(id)})`

  return (
    <>
      <div className="toolbar">
        <h1 className="page-title">Relatórios
          <small>consumo físico · plástico em kg · demais em unidade</small>
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
        <select className="filtro-input" value={material} onChange={(e) => { setMaterial(e.target.value); setItensOff(new Set()) }} title="Filtrar por material">
          <option value="">Todos os materiais</option>
          {MATERIAIS.map((m) => <option key={m.id} value={m.id}>Só {m.nome}</option>)}
        </select>
        {temFiltro && <button className="btn-clear" onClick={limpar}>✕ limpar filtros</button>}
      </div>

      {/* ---------- SELEÇÃO DE ITENS (quando um material é escolhido) ---------- */}
      {material && (
        <div className="rel-itens-sel no-print">
          <div className="ris-cab">
            <span className="filtro-label">Itens de {nomeSel.toLowerCase()}</span>
            <span className="ris-count">{nSel}/{nTotalItens} selecionado(s)</span>
            <div className="spacer" />
            <button className="ris-mini" onClick={marcarTodos} disabled={!nTotalItens}>marcar todos</button>
            <button className="ris-mini" onClick={desmarcarTodos} disabled={!nTotalItens}>limpar</button>
          </div>
          {nTotalItens === 0 ? (
            <div className="ris-vazio">Nenhum item de {nomeSel.toLowerCase()} no filtro atual.</div>
          ) : (
            <div className="rel-chks">
              {itensAlfa.map((it) => {
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
        {matsPresentes.map((id) => (
          <div key={id} className="rel-total-card" style={{ borderLeft: `4px solid ${corDoMaterial(id)}` }}>
            <div className="rt-label">{nomeDoMaterial(id)}</div>
            <div className="rt-valor">{fmtQtd(geral[id])} <span>{unidadeDoMaterial(id)}</span></div>
          </div>
        ))}
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
                  {colMats.map((id) => <th key={id} className="q">{colHead(id)}</th>)}
                </tr></thead>
                <tbody>
                  {linhasOrd.map((m) => (
                    <tr key={m}>
                      <td><span className="rel-dot" style={{ background: MODO_COR[m] }} />{MODO_NM[m]}</td>
                      {colMats.map((id) => <td key={id} className="q">{fmtQtd(porLinha[m][id])}</td>)}
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr>
                  <td>Total</td>
                  {colMats.map((id) => <td key={id} className="q">{fmtQtd(geral[id])}</td>)}
                </tr></tfoot>
              </table>
            </div>

            {/* por rota */}
            <div className="rel-bloco">
              <h3>Por rota</h3>
              <table className="rel-tab">
                <thead><tr>
                  <th>Rota</th>
                  {colMats.map((id) => <th key={id} className="q">{colHead(id)}</th>)}
                </tr></thead>
                <tbody>
                  {rotasOrd.map((r) => (
                    <tr key={r}>
                      <td>📍 {r}</td>
                      {colMats.map((id) => <td key={id} className="q">{fmtQtd(porRota[r][id])}</td>)}
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr>
                  <td>Total</td>
                  {colMats.map((id) => <td key={id} className="q">{fmtQtd(geral[id])}</td>)}
                </tr></tfoot>
              </table>
            </div>
          </div>

          {/* por item (quando um material é escolhido) — venda de itens por tipo */}
          {material && (
            <div className="rel-bloco rel-item-bloco">
              <h3>Por item · {nomeSel.toLowerCase()}
                {nSel !== nTotalItens && <small className="ib-sub"> ({nSel} de {nTotalItens} selecionado{nSel === 1 ? '' : 's'})</small>}
              </h3>
              {nSel === 0 ? (
                <div className="ris-vazio">Nenhum item de {nomeSel.toLowerCase()} selecionado.</div>
              ) : (
                <table className="rel-tab">
                  <thead><tr><th>Item</th><th className="q">{nomeSel} ({unidSel})</th></tr></thead>
                  <tbody>
                    {itensSel.map((it) => (
                      <tr key={it.key}>
                        <td><span className="rel-dot" style={{ background: corDoMaterial(material) }} />{it.nome}</td>
                        <td className="q">{fmtQtd(it.qtd)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td>Total</td><td className="q">{fmtQtd(geral[material])}</td></tr></tfoot>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </>
  )
}
