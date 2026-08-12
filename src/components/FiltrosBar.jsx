// Barra de filtros compartilhada (Rota, Produção e o quadro do vendedor)
// filtros = { cliente, pedido, vendedor, rota, dataIni, dataFim }
// `semVendedor`: esconde o seletor de vendedor — na tela do vendedor todos os
// pedidos são dele, então o filtro não separaria nada.
// `rotas`: quando vem preenchido, mostra o seletor de rota.
export default function FiltrosBar({ filtros, setFiltros, vendedores, semVendedor, rotas }) {
  const set = (k, v) => setFiltros((f) => ({ ...f, [k]: v }))
  const limpar = () =>
    setFiltros({ cliente: '', pedido: '', vendedor: '', rota: '', dataIni: '', dataFim: '' })

  const algum =
    filtros.cliente || filtros.pedido || filtros.vendedor || filtros.rota
    || filtros.dataIni || filtros.dataFim

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
          onChange={(e) => set('vendedor', e.target.value)}
        >
          <option value="">Todos vendedores</option>
          {(vendedores || []).map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      )}
      {rotas?.length > 0 && (
        <select
          className="filtro-input"
          value={filtros.rota || ''}
          onChange={(e) => set('rota', e.target.value)}
        >
          <option value="">Todas as rotas</option>
          {rotas.map((r) => (
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
