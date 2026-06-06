import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { CadastrosProvider } from './contexts/CadastrosContext.jsx'
import './index.css'

// HashRouter: funciona no GitHub Pages sem configuração de servidor
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <CadastrosProvider>
          <App />
        </CadastrosProvider>
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>
)
