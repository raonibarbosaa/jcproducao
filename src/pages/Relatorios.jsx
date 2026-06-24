// Página de Relatórios — casca inicial.
// Recebe, nas próximas etapas, os relatórios físicos de matéria-prima
// (kg de plástico, unidades de papel) por linha, rota, vendedor e data de entrega.
export default function Relatorios() {
  return (
    <>
      <div className="toolbar">
        <h1 className="page-title">Relatórios</h1>
      </div>
      <div className="empty">
        <div className="big">📊</div>
        Os relatórios de produção e de matéria-prima entram aqui.<br />
        <span style={{ color: 'var(--text-faint)' }}>
          Disponíveis assim que o cadastro de Itens (tipo de material e unidade) estiver em uso.
        </span>
      </div>
    </>
  )
}
