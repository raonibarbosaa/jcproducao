import { ordemRota } from '../utils.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'

// Barra de filtros compartilhada (Triagem, Produção, Rota e o quadro do vendedor)
// filtros = { cliente, pedido, vendedor, rota, dataIni, dataFim }
//
// `pedidos`: a lista da tela. As ROTAS saem dela, não de uma lista fixa — assim só
// aparece rota que existe no que está na tela. Escolhendo um vendedor, o seletor
// passa a mostrar só as rotas DELE: cada vendedor tem a sua ROTA 01, e oferecer as
// de todo mundo junto levaria o operador a filtrar por uma rota que não é daquele
// vendedor e ver a tela vazia sem entender o motivo.
// `semVendedor`: esconde o seletor de vendedor — na tela do vendedor todos os
// pedidos são dele, então o filtro não separaria nada.
// `rotas`: lista pronta, para quem já a calcula (o quadro do vendedor).
export default function FiltrosBar({ filtros, setFiltros, vendedores, semVendedor, rotas, pedidos }) {
  const { vendedores: cadastros } = useCadastros()
  const set = (k, v) => setFiltros((f) => ({ ...f, [k]: v }))
  const limpar = () =>
    setFiltros({ cliente: '', pedido: '', vendedor: '', rota: '', dataIni: '', dataFim: '' })

  const algum =
    filtros.cliente || filtros.pedido || filtros.vendedor || filtros.rota
    || filtros.dataIni || filtros.dataFim

  // rotas do que está na tela, já respeitando o vendedor escolhido
  const doVendedor = (pedidos || []).filter((p) =>
    !filtros.vendedor || (p.vendedor || '—') === filtros.vendedor)
  const rotasCalc = [...new Set(doVendedor.map((p) => p.rota || 'SEM ROTA'))]
    .sort((a, b) => {
      const v = filtros.vendedor || doVendedor[0]?.vendedor
      return (ordemRota(v, a, cadastros) - ordemRota(v, b, cadastros)) || a.localeCompare(b)
    })
  const rotasVisiveis = rotas?.length ? rotas : rotasCalc

  // Trocar de vendedor pode deixar selecionada uma rota que não é dele. Sem
  // limpar, a tela fica vazia e nada na barra explica o porquê.
  const trocaVendedor = (v) => setFiltros((f) => {
    const aindaVale = !f.rota || (pedidos || []).some((p) =>
      (!v || (p.vendedor || '—') === v) && (p.rota || 'SEM ROTA') === f.rota)
    return { ...f, vendedor: v, rota: aindaVale ? f.rota : '' }
  })

  return (
    <div className="filtros no-print">
      <input
        className="filtro-input"
        placeholder="🔎 Cliente"
        value={filtros.cliente || ''}
        onChange={(e) => set('cliente', e.target.value)}
        style={{ minWidth: 170 }}
      />
      <input
        className="filtro-input"
        placeholder="Nº pedido"
        value={filtros.pedido || ''}
        onChange={(e) => set('pedido', e.target.value)}
        style={{ width: 110 }}
      />
      {!semVendedor && (
        <select
          className="filtro-input"
          value={filtros.vendedor || ''}
          onChange={(e) => trocaVendedor(e.target.value)}
        >
          <option value="">Todos vendedores</option>
          {(vendedores || []).map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      )}
      {rotasVisiveis.length > 0 && (
        <select
          className="filtro-input"
          value={filtros.rota || ''}
          onChange={(e) => set('rota', e.target.value)}
          title={filtros.vendedor ? `Rotas de ${filtros.vendedor}` : 'Rotas de todos os vendedores'}
        >
          <option value="">Todas as rotas</option>
          {rotasVisiveis.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      )}
      <span className="filtro-label">Entrega de</span>
      <input
        type="date"
        className="filtro-input filtro-date"
        value={filtros.dataIni || ''}
        onChange={(e) => set('dataIni', e.target.value)}
      />
      <span className="filtro-label">até</span>
      <input
        type="date"
        className="filtro-input filtro-date"
        value={filtros.dataFim || ''}
        onChange={(e) => set('dataFim', e.target.value)}
      />
      {algum && (
        <button className="btn-clear" onClick={limpar}>✕ limpar filtros</button>
      )}
    </div>
  )
}
