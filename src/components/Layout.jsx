import { NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import Footer from './Footer.jsx'

const LABEL = {
  triagem: 'Triagem',
  producao: 'Produção',
  rota: 'Rota',
  entregues: 'Entregues',
  relatorios: 'Relatórios',
  cadastros: 'Cadastros',
  usuarios: 'Usuários',
  meus: 'Meus Pedidos',
  ciencia: 'Ciência',
}

export default function Layout({ abas, contadores, children }) {
  const { nome, perfil, logout } = useAuth()

  return (
    <div className="app-shell">
      <header className="header">
        <div className="brand">
          <span className="dot" />
          JC Sacolas
          <small>Produção</small>
        </div>

        <nav className="tabs">
          {abas.map((aba) => (
            <NavLink
              key={aba}
              to={`/${aba}`}
              className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}
            >
              {LABEL[aba]}
              {aba === 'triagem' && contadores.semDef > 0 && (
                <span className="badge">{contadores.semDef}</span>
              )}
              {aba === 'producao' && contadores.atrasados > 0 && (
                <span className="badge alert">{contadores.atrasados}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="user-chip">
          <div className="who">
            <b>{nome}</b>
            <span>{perfil}</span>
          </div>
          <button className="btn-logout" onClick={logout}>Sair</button>
        </div>
      </header>

      <main className="main">
        {children}
        <Footer />
      </main>
    </div>
  )
}
