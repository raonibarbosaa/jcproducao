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
import Auditoria from './pages/Auditoria.jsx'
import Conciliacao from './pages/Conciliacao.jsx'
import Erros from './pages/Erros.jsx'
import Carga from './pages/Carga.jsx'
import AssistenteVoz from './components/AssistenteVoz.jsx'
import { situacaoPrazo, veAssistenteVoz, abasDoUsuario, aplicaCorrecoes } from './utils.js'

// abas permitidas por perfil
const ACESSO = {
  designer:   ['triagem', 'producao', 'carga', 'rota', 'entregues', 'cadastros', 'relatorios', 'usuarios', 'ciencia', 'erros'],
  financeiro: ['producao', 'rota', 'entregues', 'cadastros'],   // cadastros: só a aba Itens (preço)
  dono:       ['triagem', 'producao', 'carga', 'rota', 'entregues', 'relatorios', 'cadastros', 'usuarios', 'ciencia', 'erros', 'auditoria', 'conciliacao'],
  vendedor:   ['meus'],
  operador:   ['producao'],   // chão de fábrica: só o quadro de produção (não vê valores)
  expedicao:  ['producao', 'carga', 'rota'],   // vê o quadro e a rota (na rota, só acompanha; não dá "entregue")
}

export default function App() {
  const { user, perfil, vendedorNome, setores, carregando } = useAuth()
  const [pedidos, setPedidos] = useState([])
  const [problemas, setProblemas] = useState([])

  // assina pedidos em tempo real. Vendedor só enxerga os PRÓPRIOS pedidos
  // (consulta filtrada — as regras do Firestore impõem o mesmo no servidor).
  useEffect(() => {
    if (!user || !perfil) return
    if (perfil === 'vendedor' && !vendedorNome) { setPedidos([]); return }
    const ref = perfil === 'vendedor'
      ? query(collection(db, 'pedidos'), where('vendedor', '==', vendedorNome))
      : collection(db, 'pedidos')
    const unsub = onSnapshot(ref, (snap) => {
      // as correções de erro são aplicadas AQUI, num ponto só: daí para baixo
      // toda tela, romaneio e conta de volume já enxerga a quantidade certa
      setPedidos(snap.docs.map((d) => aplicaCorrecoes({ id: d.id, ...d.data() })))
    }, (e) => console.error('Erro ao ler pedidos:', e))
    return unsub
  }, [user, perfil, vendedorNome])

  // erros reportados pela fábrica. O vendedor só pode ler os dos pedidos dele —
  // a regra do Firestore impõe isso, então a consulta precisa vir filtrada.
  useEffect(() => {
    if (!user || !perfil) return
    if (perfil === 'vendedor' && !vendedorNome) { setProblemas([]); return }
    const ref = perfil === 'vendedor'
      ? query(collection(db, 'problemas'), where('vendedor', '==', vendedorNome))
      : collection(db, 'problemas')
    const unsub = onSnapshot(ref,
      (snap) => setProblemas(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => console.error('Erro ao ler problemas:', e))
    return unsub
  }, [user, perfil, vendedorNome])

  if (carregando) return <div className="loading">Carregando…</div>
  if (!user) return <Login />

  // o perfil dá a base; para o operador, os SETORES ainda podem abrir aba
  const abas = abasDoUsuario(perfil, setores, ACESSO[perfil] || ACESSO.dono)

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
        {abas.includes('producao') && <Route path="/producao" element={<Producao pedidos={pedidos} problemas={problemas} />} />}
        {abas.includes('carga') && <Route path="/carga" element={<Carga pedidos={pedidos} />} />}
        {abas.includes('rota') && <Route path="/rota" element={<Rota pedidos={pedidos} />} />}
        {abas.includes('entregues') && <Route path="/entregues" element={<Entregues />} />}
        {abas.includes('relatorios') && <Route path="/relatorios" element={<Relatorios pedidos={pedidos} />} />}
        {abas.includes('cadastros') && <Route path="/cadastros" element={<Cadastros />} />}
        {abas.includes('usuarios') && <Route path="/usuarios" element={<Usuarios />} />}
        {abas.includes('meus') && <Route path="/meus" element={<MeusPedidos pedidos={pedidos} problemas={problemas} />} />}
        {abas.includes('ciencia') && <Route path="/ciencia" element={<Ciencia pedidos={pedidos} />} />}
        {abas.includes('erros') && <Route path="/erros" element={<Erros pedidos={pedidos} problemas={problemas} />} />}
        {abas.includes('auditoria') && <Route path="/auditoria" element={<Auditoria />} />}
        {abas.includes('conciliacao') && <Route path="/conciliacao" element={<Conciliacao pedidos={pedidos} />} />}
        <Route path="*" element={<Navigate to={`/${primeira}`} replace />} />
      </Routes>
    </Layout>
    {veAssistenteVoz(perfil) && <AssistenteVoz pedidos={pedidos} />}
    </>
  )
}
