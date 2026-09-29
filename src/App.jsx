import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore'
import { db } from './firebase.js'
import { useAuth } from './contexts/AuthContext.jsx'
import { useCadastros } from './contexts/CadastrosContext.jsx'
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
import Localizar from './pages/Localizar.jsx'
import Financeiro from './pages/Financeiro.jsx'
import OrdensFabricacao from './pages/OrdensFabricacao.jsx'
import AssistenteVoz from './components/AssistenteVoz.jsx'
import { situacaoPrazo, veAssistenteVoz, abasDoUsuario, aplicaCorrecoes, rotaDe, doDoc } from './utils.js'

// abas permitidas por perfil
const ACESSO = {
  // 'ordens' logo depois da Triagem: é o passo seguinte do fluxo (quem solta
  // as Ordens de Fabricação são dono e designer — decisão de 16/09/2026)
  designer:   ['triagem', 'ordens', 'producao', 'carga', 'rota', 'entregues', 'localizar', 'cadastros', 'relatorios', 'usuarios', 'ciencia', 'erros'],
  // 'financeiro' PRIMEIRO: é a tela de trabalho dele (contas a receber).
  financeiro: ['financeiro', 'producao', 'rota', 'entregues', 'localizar', 'cadastros'],   // cadastros: só a aba Itens (preço)
  dono:       ['triagem', 'ordens', 'producao', 'carga', 'rota', 'entregues', 'financeiro', 'localizar', 'relatorios', 'cadastros', 'usuarios', 'ciencia', 'erros', 'auditoria', 'conciliacao'],
  vendedor:   ['meus'],
  operador:   ['producao'],   // chão de fábrica: só o quadro de produção (não vê valores)
  // a expedição VÊ os erros (o "já foi entregue" do vendedor é o aviso de não
  // carregar de novo o que já saiu), mas não resolve: a tela abre só de leitura.
  // 'localizar' é a busca de "onde está o pedido": quem precisa achar a
  // mercadoria no galpão é ela, então entra pelos DOIS eixos (perfil aqui, setor
  // em `abasDoUsuario`). Também só leitura — desbloquear é do escritório.
  expedicao:  ['producao', 'carga', 'rota', 'localizar', 'erros'],   // vê o quadro e a rota (na rota, só acompanha; não dá "entregue")
}

export default function App() {
  const { user, perfil, semPerfil, nome, logout, vendedorNome, setores, posto, carregando } = useAuth()
  const { vendedores: cadastros } = useCadastros()
  const [pedidosCrus, setPedidos] = useState([])
  const [problemas, setProblemas] = useState([])
  // Ordens de Fabricação e a chave da virada (config/producao). Lidas AQUI, num
  // ponto só: a aba de OFs e o quadro da produção precisam ver as mesmas.
  const [ordens, setOrdens] = useState([])
  const [erroOrdens, setErroOrdens] = useState('')
  const [producaoCfg, setProducaoCfg] = useState({})

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

  useEffect(() => {
    // vendedor não lê `ordens` (a rule barra) e não precisa: o quadro dele é outro
    if (!user || !perfil || perfil === 'vendedor') { setOrdens([]); return undefined }
    return onSnapshot(collection(db, 'ordens'),
      (snap) => { setOrdens(snap.docs.map(doDoc)); setErroOrdens('') },
      (e) => { console.error('Erro ao ler ordens:', e); setErroOrdens(e.code || e.message) })
  }, [user, perfil])
  useEffect(() => {
    if (!user || !perfil) { setProducaoCfg({}); return undefined }
    return onSnapshot(doc(db, 'config', 'producao'),
      (snap) => setProducaoCfg(snap.exists() ? snap.data() : {}),
      (e) => console.error('Erro ao ler config/producao:', e))
  }, [user, perfil])

  // A ROTA é recalculada aqui, num ponto só — como as correções de quantidade.
  // Congelada no import, ela não acompanhava o cadastro de cidades: corrigir a
  // rota de uma cidade não mexia em nenhum pedido já importado.
  const pedidos = useMemo(
    () => pedidosCrus.map((p) => ({ ...p, rota: rotaDe(p, cadastros) })),
    [pedidosCrus, cadastros])

  if (carregando) return <div className="loading">Carregando…</div>
  if (!user) return <Login />
  // Autenticado sem cadastro: NÃO entra. O `ACESSO[perfil] || ACESSO.dono` mais
  // abaixo cairia no perfil de dono com `perfil` nulo — outro caminho de falha
  // aberta, e este fecha os dois de uma vez.
  if (semPerfil || !perfil) {
    return (
      <div className="loading" style={{ flexDirection: 'column', gap: 14, textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: 40 }}>🔒</div>
        <div><b>Acesso não liberado</b></div>
        <div style={{ color: 'var(--text-dim)', maxWidth: 420, fontSize: 14 }}>
          A conta <b>{user.email}</b> não está cadastrada neste sistema.
          Fale com o administrador para liberar o seu acesso.
        </div>
        <button className="btn" onClick={logout}>Sair</button>
      </div>
    )
  }

  // o perfil dá a base; para o operador, os SETORES ainda podem abrir aba
  const abas = abasDoUsuario(perfil, setores, ACESSO[perfil] || ACESSO.dono, posto)

  // contadores
  const semDef = pedidos.filter((p) => !p.status).length
  const atrasados = pedidos.filter((p) => situacaoPrazo(p.previsaoManual || p.previsao) === 'atrasado').length
  // erro reportado que ninguém vê não serve para nada — e desde que o VENDEDOR
  // também reporta ("já foi entregue"), quem resolve não passa mais na aba por
  // acaso: o número é o que o chama até lá.
  const errosAbertos = problemas.filter((x) => x.status === 'aberto').length
  const contadores = { semDef, atrasados, errosAbertos, total: pedidos.length }

  const primeira = abas[0]

  return (
    <>
    <Layout abas={abas} contadores={contadores}>
      <Routes>
        <Route path="/" element={<Navigate to={`/${primeira}`} replace />} />
        {abas.includes('triagem') && <Route path="/triagem" element={<Triagem pedidos={pedidos} />} />}
        {abas.includes('ordens') && <Route path="/ordens" element={<OrdensFabricacao pedidos={pedidos} ordens={ordens} erroOrdens={erroOrdens} producaoCfg={producaoCfg} />} />}
        {abas.includes('producao') && <Route path="/producao" element={<Producao pedidos={pedidos} problemas={problemas} ordens={ordens} producaoCfg={producaoCfg} />} />}
        {abas.includes('carga') && <Route path="/carga" element={<Carga pedidos={pedidos} />} />}
        {abas.includes('rota') && <Route path="/rota" element={<Rota pedidos={pedidos} />} />}
        {abas.includes('entregues') && <Route path="/entregues" element={<Entregues />} />}
        {abas.includes('localizar') && <Route path="/localizar" element={<Localizar pedidos={pedidos} problemas={problemas} />} />}
        {abas.includes('financeiro') && <Route path="/financeiro" element={<Financeiro pedidos={pedidos} />} />}
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
