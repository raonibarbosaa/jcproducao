import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from './firebase.js'
import { useAuth } from './contexts/AuthContext.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Triagem from './pages/Triagem.jsx'
import Producao from './pages/Producao.jsx'
import Rota from './pages/Rota.jsx'
import Entregues from './pages/Entregues.jsx'
import Cadastros from './pages/Cadastros.jsx'
import Relatorios from './pages/Relatorios.jsx'
import Usuarios from './pages/Usuarios.jsx'
import MeusPedidos from './pages/MeusPedidos.jsx'
import Ciencia from './pages/Ciencia.jsx'
import AssistenteVoz from './components/AssistenteVoz.jsx'
import { situacaoPrazo } from './utils.js'

// abas permitidas por perfil
const ACESSO = {
  designer:   ['triagem', 'producao', 'entregues', 'cadastros', 'relatorios', 'ciencia'],
  financeiro: ['rota', 'entregues'],
  dono:       ['triagem', 'producao', 'rota', 'entregues', 'relatorios', 'cadastros', 'usuarios', 'ciencia'],
  vendedor:   ['meus'],
}

export default function App() {
  const { user, perfil, vendedorNome, carregando } = useAuth()
  const [pedidos, setPedidos] = useState([])

  // assina pedidos em tempo real. Vendedor só enxerga os PRÓPRIOS pedidos
  // (consulta filtrada — as regras do Firestore impõem o mesmo no servidor).
  useEffect(() => {
    if (!user || !perfil) return
    if (perfil === 'vendedor' && !vendedorNome) { setPedidos([]); return }
    const ref = perfil === 'vendedor'
      ? query(collection(db, 'pedidos'), where('vendedor', '==', vendedorNome))
      : collection(db, 'pedidos')
    const unsub = onSnapshot(ref, (snap) => {
      setPedidos(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    }, (e) => console.error('Erro ao ler pedidos:', e))
    return unsub
  }, [user, perfil, vendedorNome])

  if (carregando) return <div className="loading">Carregando…</div>
  if (!user) return <Login />

  const abas = ACESSO[perfil] || ACESSO.dono

  // contadores
  const semDef = pedidos.filter((p) => !p.status).length
  const atrasados = pedidos.filter((p) => situacaoPrazo(p.previsaoManual || p.previsao) === 'atrasado').length
  const contadores = { semDef, atrasados, total: pedidos.length }

  const primeira = abas[0]

  return (
    <>
    <Layout abas={abas} contadores={contadores}>
      <Routes>
        <Route path="/" element={<Navigate to={`/${primeira}`} replace />} />
        {abas.includes('triagem') && <Route path="/triagem" element={<Triagem pedidos={pedidos} />} />}
        {abas.includes('producao') && <Route path="/producao" element={<Producao pedidos={pedidos} />} />}
        {abas.includes('rota') && <Route path="/rota" element={<Rota pedidos={pedidos} />} />}
        {abas.includes('entregues') && <Route path="/entregues" element={<Entregues />} />}
        {abas.includes('relatorios') && <Route path="/relatorios" element={<Relatorios />} />}
        {abas.includes('cadastros') && <Route path="/cadastros" element={<Cadastros />} />}
        {abas.includes('usuarios') && <Route path="/usuarios" element={<Usuarios />} />}
        {abas.includes('meus') && <Route path="/meus" element={<MeusPedidos pedidos={pedidos} />} />}
        {abas.includes('ciencia') && <Route path="/ciencia" element={<Ciencia pedidos={pedidos} />} />}
        <Route path="*" element={<Navigate to={`/${primeira}`} replace />} />
      </Routes>
    </Layout>
    {perfil !== 'vendedor' && <AssistenteVoz pedidos={pedidos} />}
    </>
  )
}
