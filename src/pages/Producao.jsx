import { useState } from 'react'
import { doc, writeBatch, deleteField } from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  MODO_ORDER, MODO_NM, MODO_COR, MODO_DESC, fmtData, situacaoPrazo, ORIGEM_NM,
  filtraPedidos, vendedoresDe, resumoFiltros, previsaoDe, nomeCliente,
  linhasPresentes, itensDaLinha, materialDoItem, totaisPorMaterial, somaTotais, TOTAIS_ZERO, fmtTotais,
  MATERIAIS, nomeDoMaterial, linhaDoItem, etapaDoItem, acabamentoDoItem, acabamentoItemOk, normSetor,
  paineisVisiveis, itemPertenceAoPainel, podeNoMaterial,
} from '../utils.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import FiltrosBar from '../components/FiltrosBar.jsx'
import DataEntrega from '../components/DataEntrega.jsx'
import QuadroProducao from '../components/QuadroProducao.jsx'
import SubTabs from '../components/SubTabs.jsx'
import SeloLinha from '../components/SeloLinha.jsx'

export default function Producao({ pedidos }) {
  const { vendedores: cadastros, clientes, itens: itensCad } = useCadastros()
  const { perfil, nome, setores, materiais } = useAuth()
  const podeEditarData = perfil === 'dono' || perfil === 'designer'
  const [vista, setVista] = useState(['operador', 'expedicao'].includes(perfil) ? 'quadro' : 'lista')   // 'lista' | 'quadro' (fluxo gráfica)
  const [filtroLinha, setFiltroLinha] = useState('')
  const [painelEscolhido, setPainelAba] = useState('')  // aba do quadro ('' = automática)
  const [filtroMaterial, setFiltroMaterial] = useState('') // '' | 'papel' | 'plastico'
  const [filtros, setFiltros] = useState({})
  const [sel, setSel] = useState([])       // idVenda selecionados p/ alteração em lote
  const [dataLote, setDataLote] = useState('')
  const [salvandoLote, setSalvandoLote] = useState(false)

  // recalcula a previsão de entrega com o calendário ATUAL do Cadastro
  const base = pedidos.map((p) => ({ ...p, previsao: previsaoDe(p, cadastros) }))
  const categorizados = base.filter((p) => p.status)
  const vendedores = vendedoresDe(categorizados)

  // quadro por setor: TODO pedido categorizado entra (o item é que anda pela sua linha
  // — papel, plástico, alça torcida e etiqueta). Respeita os filtros do FiltrosBar;
  // o filtro de linha vai para o quadro, que esconde as colunas das outras linhas.
  // A trava da laminação é por item, dentro do próprio quadro.
  const pedidosQuadro = filtraPedidos(categorizados, filtros, clientes)

  // ---------- painéis do quadro (uma FILA POR SETOR) ----------
  // Cada aba é um posto de trabalho: SILK / GLICHE / GRÁFICA, as três montagens
  // (papel, plástico, etiq.+alça) e Expedição. O badge conta o que está parado
  // naquele posto — o item some da fila assim que avança. Dono e designer têm a
  // aba "Visão geral", que desenha todos os painéis lado a lado (o fluxo inteiro).
  const ehStaff = perfil === 'dono' || perfil === 'designer'
  const meusPaineis = paineisVisiveis({ perfil, setores, materiais })
  const meusMateriais = perfil === 'operador' ? (materiais || []) : []
  const conta = {}
  for (const pa of meusPaineis) conta[pa.id] = 0
  for (const p of pedidosQuadro) {
    (p.itens || []).forEach((_, i) => {
      const l = linhaDoItem(p, i)
      if (!l) return
      const mat = materialDoItem(p.itens[i], itensCad)
      if (!podeNoMaterial(meusMateriais, mat)) return
      for (const pa of meusPaineis) {
        if (!itemPertenceAoPainel(pa, p, i, mat)) continue
        if (pa.tipo === 'linha' && l === 'GRAFICA' && !acabamentoItemOk(acabamentoDoItem(p, i))) continue
        conta[pa.id]++
      }
    })
  }
  const totalNoFluxo = meusPaineis.reduce((s, pa) => s + (conta[pa.id] || 0), 0)
  const abasQuadro = [
    ...(ehStaff ? [{ id: 'geral', label: '▦ Visão geral', badge: totalNoFluxo }] : []),
    ...meusPaineis.map((pa) => ({ id: pa.id, label: pa.nome, badge: conta[pa.id] || 0 })),
  ]
  // sem escolha do usuário: staff abre na visão geral, operador na fila que tem serviço
  const painelAba = (abasQuadro.some((a) => a.id === painelEscolhido) && painelEscolhido)
    || (ehStaff ? 'geral' : (meusPaineis.find((pa) => conta[pa.id])?.id || meusPaineis[0]?.id || ''))
  const paineisDoQuadro = painelAba === 'geral' ? meusPaineis : meusPaineis.filter((pa) => pa.id === painelAba)
  const nomeAba = abasQuadro.find((a) => a.id === painelAba)?.label || '—'

  let lista = categorizados
  // filtroLinha agora filtra por "pedido que TEM algum item nessa linha"
  if (filtroLinha) lista = lista.filter((p) => linhasPresentes(p).includes(filtroLinha))
  // filtroMaterial: pedido que TEM algum item desse material (papel/plástico)
  if (filtroMaterial) lista = lista.filter((p) => (p.itens || []).some((it) => materialDoItem(it, itensCad) === filtroMaterial))
  lista = filtraPedidos(lista, filtros, clientes)

  // agrupa: Vendedor -> Data de entrega -> Linha -> Rota
  // Um mesmo pedido pode aparecer em MAIS DE UMA linha quando seus itens estão divididos.
  // Em cada bucket, o pedido entra com APENAS os itens daquela linha.
  const arvore = {}
  for (const p of lista) {
    const vend = p.vendedor || '—'
    const data = fmtData(p.previsao)
    const totalItens = (p.itens || []).length
    const linhas = linhasPresentes(p)
    for (const m of linhas) {
      if (filtroLinha && m !== filtroLinha) continue // só montra a linha filtrada
      // fatia do pedido: só os itens dessa linha (com índice original preservado)
      let itensFatia = totalItens ? itensDaLinha(p, m) : (p.itens || [])
      // filtroMaterial: dentro da linha, só os itens do material escolhido
      if (filtroMaterial) itensFatia = itensFatia.filter((it) => materialDoItem(it, itensCad) === filtroMaterial)
      if (filtroMaterial && !itensFatia.length) continue // esse card não tem item do material
      arvore[vend] ??= {}
      arvore[vend][data] ??= {}
      arvore[vend][data][m] ??= {}
      const rota = p.rota || 'SEM ROTA'
      arvore[vend][data][m][rota] ??= []
      arvore[vend][data][m][rota].push({
        ...p,
        itens: itensFatia,
        _totalItens: totalItens,
        _linhaCard: m,
      })
    }
  }

  const vendedoresOrd = Object.keys(arvore).sort()
  const filtrado = lista.length !== categorizados.length

  // ---------- seleção / alteração em lote (dono e designer) ----------
  // seleção é por idVenda (o pedido), não por card — pedido dividido em várias
  // linhas aparece em vários cards, mas conta como 1 seleção.
  const idsVisiveis = [...new Set(lista.map((p) => p.idVenda))]
  const todosSelecionados = sel.length > 0 && sel.length === idsVisiveis.length
  const toggleSel = (id) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id])
  const limparSel = () => setSel([])
  const selecionarTodos = () => setSel(todosSelecionados ? [] : idsVisiveis)

  async function gravarLote(campos) {
    const ids = [...new Set(sel)]
    if (!ids.length) return
    setSalvandoLote(true)
    try {
      for (let i = 0; i < ids.length; i += 450) {
        const batch = writeBatch(db)
        for (const id of ids.slice(i, i + 450)) batch.update(doc(db, 'pedidos', id), campos)
        await batch.commit()
      }
      setSel([]); setDataLote('')
    } catch (e) {
      console.error('Erro na alteração em lote:', e)
      alert('Erro ao alterar as datas em lote: ' + e.message)
    } finally {
      setSalvandoLote(false)
    }
  }

  const aplicarDataLote = () => {
    if (!dataLote) return
    if (!confirm(`Aplicar a data ${fmtData(dataLote + 'T00:00:00')} a ${sel.length} pedido(s)?`)) return
    gravarLote({
      previsaoManual: new Date(dataLote + 'T00:00:00').toISOString(),
      previsaoManualPor: nome || '',
      previsaoManualEm: new Date().toISOString(),
    })
  }

  const voltarAutomaticoLote = () => {
    if (!confirm(`Voltar ${sel.length} pedido(s) para a data automática do calendário?`)) return
    gravarLote({
      previsaoManual: deleteField(),
      previsaoManualPor: deleteField(),
      previsaoManualEm: deleteField(),
    })
  }

  return (
    <>
      <div className="toolbar no-print">
        <h1 className="page-title">{vista === 'quadro' ? `Produção · ${nomeAba}` : 'Lista de Produção'}
          <small>
            {vista === 'quadro'
              ? (painelAba === 'geral'
                  ? `${totalNoFluxo} item(ns) no fluxo`
                  : `${conta[painelAba] || 0} item(ns) neste setor`)
              : (filtrado ? `${lista.length} de ${categorizados.length} pedidos` : `${lista.length} pedidos`)}
          </small>
        </h1>
        <div className="spacer" />
        <div className="vista-toggle">
          <button className={`btn${vista === 'lista' ? ' primary' : ''}`} onClick={() => setVista('lista')}>☰ Lista</button>
          <button className={`btn${vista === 'quadro' ? ' primary' : ''}`} onClick={() => setVista('quadro')} title="Quadro por setor (fluxo da gráfica)">▦ Quadro</button>
        </div>
        {vista === 'lista' && (
          <select className="btn" value={filtroLinha} onChange={(e) => setFiltroLinha(e.target.value)}>
            <option value="">Todas as linhas</option>
            {MODO_ORDER.map((m) => <option key={m} value={m}>{MODO_NM[m]}</option>)}
          </select>
        )}
        {vista === 'lista' && (
          <select className="btn" value={filtroMaterial} onChange={(e) => setFiltroMaterial(e.target.value)} title="Filtrar por material">
            <option value="">Todos os materiais</option>
            {MATERIAIS.map((m) => <option key={m.id} value={m.id}>Só {m.nome}</option>)}
          </select>
        )}
        {vista === 'lista' && podeEditarData && lista.length > 0 && (
          <button className="btn" onClick={selecionarTodos}>
            {todosSelecionados ? '☑ Limpar seleção' : `☐ Selecionar todos (${idsVisiveis.length})`}
          </button>
        )}
        {vista === 'lista' && <button className="btn" onClick={() => window.print()}>🖨 Imprimir</button>}
      </div>

      <FiltrosBar filtros={filtros} setFiltros={setFiltros} vendedores={vendedores} pedidos={categorizados} />

      {vista === 'quadro' && (
        <div className="screen-only">
          {/* uma FILA por setor: a aba escolhida mostra só o posto dela;
              "Visão geral" (dono/designer) mostra todos os painéis lado a lado */}
          <SubTabs abas={abasQuadro} ativa={painelAba} onTrocar={setPainelAba} />
          {pedidosQuadro.length === 0
            ? <div className="empty"><div className="big">🏭</div>
                {categorizados.length === 0 ? 'Nenhum pedido categorizado ainda.' : 'Nenhum pedido com esses filtros.'}
              </div>
            : <QuadroProducao pedidos={pedidosQuadro} clientes={clientes} itensCad={itensCad} paineis={paineisDoQuadro} />}
        </div>
      )}
      {/* ---------- TELA (lista) ---------- */}
      {vista === 'lista' && (
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
                  {MODO_ORDER.filter((m) => linhas[m]).map((m) => {
                    const totalLinha = Object.values(linhas[m]).flat()
                      .reduce((acc, c) => somaTotais(acc, totaisPorMaterial(c.itens, itensCad)), TOTAIS_ZERO)
                    return (
                    <div key={m} className="linha-bloco" style={{ borderLeftColor: MODO_COR[m] }}>
                      <div className="linha-head" style={{ background: MODO_COR[m] }}>
                        {MODO_NM[m]} <span className="linha-desc">{MODO_DESC[m]}</span>
                      </div>
                      <div className="linha-body">
                        {Object.entries(linhas[m]).sort().map(([rota, ps]) => {
                          const foraRota = rota === 'FORA DE ROTA' || rota === 'SEM ROTA'
                          const totalRota = ps.reduce((acc, c) => somaTotais(acc, totaisPorMaterial(c.itens, itensCad)), TOTAIS_ZERO)
                          return (
                            <div key={rota} className="rota-bloco">
                              <div className="rota-head">
                                <span className={`rota-badge ${foraRota ? 'warn' : ''}`}>📍 {rota}</span>
                                <span className="rota-count">{ps.length} parada(s)</span>
                                <span className="rota-totais">{fmtTotais(totalRota)}</span>
                              </div>
                              <div className="cards">
                                {ps.map((p) => (
                                  <CardProd key={p.idVenda + ":" + p._linhaCard} p={p} clientes={clientes}
                                    selecionavel={podeEditarData}
                                    selecionado={sel.includes(p.idVenda)}
                                    onToggleSel={() => toggleSel(p.idVenda)} />
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <div className="linha-foot">
                        Total {MODO_NM[m]}: <b>{fmtTotais(totalLinha)}</b>
                      </div>
                    </div>
                  )})}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
      )}

      {/* ---------- BARRA DE ALTERAÇÃO EM LOTE (aparece com seleção) ---------- */}
      {vista === 'lista' && podeEditarData && sel.length > 0 && (
        <div className="batch-bar no-print">
          <span className="bb-count">{sel.length} pedido(s) selecionado(s)</span>
          <label className="bb-field">
            Nova data:
            <input type="date" value={dataLote} onChange={(e) => setDataLote(e.target.value)} />
          </label>
          <button className="btn ok" disabled={!dataLote || salvandoLote} onClick={aplicarDataLote}>
            {salvandoLote ? 'Salvando…' : '✓ Aplicar data'}
          </button>
          <button className="btn" disabled={salvandoLote} onClick={voltarAutomaticoLote} title="Remove a data manual e volta ao calendário do vendedor">
            ↺ Voltar ao automático
          </button>
          <button className="btn" disabled={salvandoLote} onClick={limparSel}>Limpar seleção</button>
        </div>
      )}

      {/* ---------- IMPRESSÃO ---------- */}
      <ImpressaoProducao
        arvore={arvore} vendedoresOrd={vendedoresOrd}
        filtros={filtros} filtroLinha={filtroLinha} filtroMaterial={filtroMaterial} total={lista.length} clientes={clientes} itensCad={itensCad}
      />
    </>
  )
}

function CardProd({ p, clientes, selecionavel, selecionado, onToggleSel }) {
  const atrasado = situacaoPrazo(p.previsao) === 'atrasado'
  const foraRota = p.rota === 'FORA DE ROTA' || p.rota === 'SEM ROTA'
  const dividido = p._totalItens && p.itens.length < p._totalItens
  return (
    <div className={`card ${atrasado ? 'atrasado' : 'em_dia'} ${foraRota ? 'fora-rota' : ''} ${selecionado ? 'selecionado' : ''}`}>
      <div className="card-top">
        {selecionavel && (
          <input type="checkbox" className="no-print card-check" checked={selecionado} onChange={onToggleSel}
            title="Selecionar para alterar a data em lote" />
        )}
        <div className="cliente">{nomeCliente(p.cliente, clientes)}</div>
        <div className="idv">#{p.idVenda}</div>
      </div>
      <div className="meta-row">
        {p.origem && <span className={`chip origem-${p.origem.toLowerCase()}`}>{ORIGEM_NM[p.origem] || p.origem}</span>}
        <span className={`chip ${foraRota ? 'rota-warn' : ''}`}>📍 {p.cidade || '—'}</span>
        <DataEntrega p={p} atrasado={atrasado} />
        {dividido && (
          <span className="chip" style={{ borderColor: 'var(--warn)', color: 'var(--warn)' }}>
            {p.itens.length} de {p._totalItens} itens
          </span>
        )}
      </div>
      <ul className="itens">
        {p.itens.map((it, i) => (
          <li key={i}><span><SeloLinha linha={p._linhaCard} />{it.produto}</span><span className="q">{it.qtd}</span></li>
        ))}
      </ul>
      {p.obs && <div style={{ fontSize: 12, color: 'var(--warn)', marginTop: 6 }}>⚠ {p.obs}</div>}
    </div>
  )
}

// ============================ LAYOUT DE IMPRESSÃO ============================
function ImpressaoProducao({ arvore, vendedoresOrd, filtros, filtroLinha, filtroMaterial, total, clientes, itensCad }) {
  const hoje = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  const resumo = resumoFiltros(filtros)
  return (
    <div className="print-only">
      <div className="pr-head">
        <h1>JC Sacolas · Lista de Produção{filtroMaterial ? ` — só ${nomeDoMaterial(filtroMaterial)}` : ''}</h1>
        <div className="meta">
          Impresso em {hoje}<br />
          {total} pedido(s){filtroLinha ? ` · linha ${MODO_NM[filtroLinha]}` : ''}{filtroMaterial ? ` · só ${nomeDoMaterial(filtroMaterial)}` : ''}
          {resumo && <><br />{resumo}</>}
        </div>
      </div>

      {vendedoresOrd.map((vend) => (
        <div key={vend} className="pr-block">
          <div className="pr-vend">{vend}</div>
          {Object.entries(arvore[vend]).sort().map(([data, linhas]) => (
            <div key={data}>
              <div className="pr-data">Entrega: {data}</div>
              {MODO_ORDER.filter((m) => linhas[m]).map((m) => {
                const totalLinha = Object.values(linhas[m]).flat()
                  .reduce((acc, c) => somaTotais(acc, totaisPorMaterial(c.itens, itensCad)), TOTAIS_ZERO)
                return (
                <div key={m}>
                  <span className="pr-linha" style={{ color: MODO_COR[m], borderColor: MODO_COR[m] }}>{MODO_NM[m]}</span>
                  {Object.entries(linhas[m]).sort().map(([rota, ps]) => {
                    const totalRota = ps.reduce((acc, c) => somaTotais(acc, totaisPorMaterial(c.itens, itensCad)), TOTAIS_ZERO)
                    return (
                    <div key={rota}>
                      <div className="pr-rota">{rota} · {ps.length} pedido(s) · <b>{fmtTotais(totalRota)}</b></div>
                      {ps.map((p) => (
                        <div key={p.idVenda + ':' + (p._linhaCard || '')} className="pr-ped">
                          <div className="top">
                            <span className="box" />
                            <span className="nm">#{p.idVenda} — {nomeCliente(p.cliente, clientes)}</span>
                            <span className="cid">({p.cidade || '—'})</span>
                          </div>
                          <table className="pr-itens"><tbody>
                            {p.itens.map((it, i) => (
                              <tr key={i}><td><SeloLinha linha={p._linhaCard} />{it.produto}</td><td className="q">{it.qtd}</td></tr>
                            ))}
                          </tbody></table>
                          {p.obs && <div className="pr-obs">⚠ {p.obs}</div>}
                        </div>
                      ))}
                    </div>
                    )
                  })}
                  <div className="pr-total-linha">Total {MODO_NM[m]}: {fmtTotais(totalLinha)}</div>
                </div>
                )
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
