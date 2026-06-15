// Barra de filtros compartilhada (Rota e Produção)
// filtros = { cliente, pedido, vendedor, dataIni, dataFim }
export default function FiltrosBar({ filtros, setFiltros, vendedores }) {
  const set = (k, v) => setFiltros((f) => ({ ...f, [k]: v }))
  const limpar = () =>
    setFiltros({ cliente: '', pedido: '', vendedor: '', dataIni: '', dataFim: '' })

  const algum =
    filtros.cliente || filtros.pedido || filtros.vendedor || filtros.dataIni || filtros.dataFim

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
      <select
        className="filtro-input"
        value={filtros.vendedor || ''}
        onChange={(e) => set('vendedor', e.target.value)}
      >
        <option value="">Todos vendedores</option>
        {vendedores.map((v) => (
          <option key={v} value={v}>{v}</option>
        ))}
      </select>
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
