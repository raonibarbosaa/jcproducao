// Sub-abas reutilizáveis (rolagem horizontal, amigável no mobile).
// Usado pelo hub de Cadastros e em outras telas que precisem de abas internas.
//
// props:
//   abas   = [{ id, label, badge? }]   (apenas as abas que o usuário pode ver)
//   ativa  = id da aba ativa
//   onTrocar(id)
export default function SubTabs({ abas, ativa, onTrocar }) {
  return (
    <div className="subtabs no-print">
      {abas.map((a) => (
        <button
          key={a.id}
          className={'subtab' + (a.id === ativa ? ' active' : '')}
          onClick={() => onTrocar(a.id)}
        >
          {a.label}
          {a.badge ? <span className="subtab-badge">{a.badge}</span> : null}
        </button>
      ))}
    </div>
  )
}
