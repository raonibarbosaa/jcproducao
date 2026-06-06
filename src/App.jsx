import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from './firebase.js'
import { useAuth } from './contexts/AuthContext.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Triagem from './pages/Triagem.jsx'
import Producao from './pages/Producao.jsx'
import Rota from './pages/Rota.jsx'
import Entregues from './pages/Entregues.jsx'
import Cadastros from './pages/Cadastros.jsx'
import { situacaoPrazo } from './utils.js'

// abas permitidas por perfil
const ACESSO = {
  designer:   ['triagem', 'producao', 'cadastros'],
  financeiro: ['rota', 'entregues'],
  dono:       ['triagem', 'producao', 'rota', 'entregues', 'cadastros'],
}

export default function App() {
  const { user, perfil, carregando } = useAuth()
  const [pedidos, setPedidos] = useState([])

  // assina pedidos em tempo real (para contadores e páginas)
  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(collection(db, 'pedidos'), (snap) => {
      setPedidos(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [user])

  if (carregando) return <div className="loading">Carregando…</div>
  if (!user) return <Login />

  const abas = ACESSO[perfil] || ACESSO.dono

  // contadores
  const semDef = pedidos.filter((p) => !p.status).length
  const atrasados = pedidos.filter((p) => situacaoPrazo(p.previsao) === 'atrasado').length
  const contadores = { semDef, atrasados, total: pedidos.length }

  const primeira = abas[0]

  return (
    <Layout abas={abas} contadores={contadores}>
      <Routes>
        <Route path="/" element={<Navigate to={`/${primeira}`} replace />} />
        {abas.includes('triagem') && <Route path="/triagem" element={<Triagem pedidos={pedidos} />} />}
        {abas.includes('producao') && <Route path="/producao" element={<Producao pedidos={pedidos} />} />}
        {abas.includes('rota') && <Route path="/rota" element={<Rota pedidos={pedidos} />} />}
        {abas.includes('entregues') && <Route path="/entregues" element={<Entregues />} />}
        {abas.includes('cadastros') && <Route path="/cadastros" element={<Cadastros />} />}
        <Route path="*" element={<Navigate to={`/${primeira}`} replace />} />
      </Routes>
    </Layout>
  )
}
