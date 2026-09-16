import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { veAssistenteVoz } from '../utils.js'
import Footer from './Footer.jsx'
import VoltarAoTopo from './VoltarAoTopo.jsx'
import MeuPin from './MeuPin.jsx'

const LABEL = {
  triagem: 'Triagem',
  ordens: 'Ordens de Fabricação',
  producao: 'Produção',
  carga: 'Entregas',
  rota: 'Rota',
  entregues: 'Entregues',
  localizar: 'Localizar',
  financeiro: 'Financeiro',
  relatorios: 'Relatórios',
  cadastros: 'Cadastros',
  usuarios: 'Usuários',
  meus: 'Meus Pedidos',
  ciencia: 'Ciência',
  erros: 'Erros',
  auditoria: 'Auditoria',
  conciliacao: 'Conciliação',
}

export default function Layout({ abas, contadores, children }) {
  const { nome, perfil, posto, logout } = useAuth()
  const [meuPin, setMeuPin] = useState(false)
  // PIN é do FUNCIONÁRIO: a conta do tablet não tem PIN próprio
  const temMeuPin = perfil === 'operador' && !posto

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
              {aba === 'erros' && contadores.errosAbertos > 0 && (
                <span className="badge alert">{contadores.errosAbertos}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="user-chip">
          <div className="who">
            <b>{nome}</b>
            <span>{perfil}</span>
          </div>
          {temMeuPin && (
            <button className="btn-logout btn-pin" onClick={() => setMeuPin(true)}>🔢 Meu PIN</button>
          )}
          <button className="btn-logout" onClick={logout}>Sair</button>
        </div>
      </header>

      <main className="main">
        {children}
        <Footer />
      </main>

      {meuPin && <MeuPin onFechar={() => setMeuPin(false)} />}

      <VoltarAoTopo desviaDaVoz={veAssistenteVoz(perfil)} />
    </div>
  )
}
