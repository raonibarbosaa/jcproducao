// Firebase Admin: escreve no Firestore IGNORANDO as rules. Por isso este
// processo é o único que grava `mensagens` com de:'nos' e o status do WhatsApp;
// o navegador só enfileira em `enviar/`.
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { cfg } from './config.js'

let app
export function iniciaFirebase() {
  if (app) return app
  const json = JSON.parse(Buffer.from(cfg.firebaseB64, 'base64').toString('utf8'))
  app = initializeApp({ credential: cert(json), projectId: json.project_id })
  console.log(`[firebase] projeto ${json.project_id}`)
  return app
}

export const db = () => getFirestore(iniciaFirebase())
export const auth = () => getAuth(iniciaFirebase())
export { FieldValue }

// Cache vivo de `config/cadastros` (vendedores, motoristas) + da coleção
// `clientes` para resolver quem é o número sem uma leitura por mensagem.
// Os clientes saíram do documento para a coleção em 07/10/2026 (correção 5 do
// site); o array que sobrou no documento é legado e perde para a coleção —
// a mesma mescla que `mesclaClientes` faz no site, sem importar o utils de lá
// (o build do Docker só enxerga esta pasta).
let cadastros = { clientes: [], vendedores: [], motoristas: [] }
let clientesCol = []
const normRazao = (s) => String(s || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')
export const getCadastros = () => {
  const vistos = new Set(clientesCol.map((c) => normRazao(c.razao)))
  const legado = (cadastros.clientes || []).filter((c) => c?.razao && !vistos.has(normRazao(c.razao)))
  return { ...cadastros, clientes: [...clientesCol, ...legado] }
}
export function assinaCadastros() {
  db().doc('config/cadastros').onSnapshot(
    (s) => { cadastros = s.data() || cadastros; console.log(`[cadastros] ${cadastros.clientes?.length || 0} clientes (legado), ${cadastros.vendedores?.length || 0} vendedores, ${cadastros.motoristas?.length || 0} motoristas`) },
    (e) => console.error('[cadastros] onSnapshot', e.message),
  )
  db().collection('clientes').onSnapshot(
    (s) => { clientesCol = s.docs.map((d) => ({ id: d.id, ...d.data() })); console.log(`[clientes] ${clientesCol.length} na coleção`) },
    (e) => console.error('[clientes] onSnapshot', e.message),
  )
}

// Números de pedido conhecidos (para a sugestão de vínculo não casar "2026").
// Pedido entregue por inteiro some de `pedidos`, então junta `entregues`.
// ⚠️ `select()` NÃO funciona com onSnapshot no Admin SDK ("'select' clauses
// are not supported for real-time queries") — ouve a coleção inteira: a
// leitura completa acontece UMA vez por subida; depois só chegam as mudanças.
let pedidosConhecidos = new Set()
export const getPedidosConhecidos = () => pedidosConhecidos
export function assinaPedidos() {
  const ids = { pedidos: new Set(), entregues: new Set() }
  const junta = () => { pedidosConhecidos = new Set([...ids.pedidos, ...ids.entregues]) }
  db().collection('pedidos').onSnapshot(
    (s) => { ids.pedidos = new Set(s.docs.map((d) => String(d.get('idVenda') || d.id))); junta(); console.log(`[pedidos] ${ids.pedidos.size} na fábrica`) },
    (e) => console.error('[pedidos] onSnapshot', e.message),
  )
  db().collection('entregues').onSnapshot(
    (s) => { ids.entregues = new Set(s.docs.map((d) => String(d.get('idVenda') || d.id.split('-')[0]))); junta(); console.log(`[entregues] ${ids.entregues.size} remessas`) },
    (e) => console.error('[entregues] onSnapshot', e.message),
  )
}

// Heartbeat: a tela lê `config/backend.vivoEm` e avisa quando passa de 3 min.
export async function heartbeat(extra = {}) {
  try {
    await db().doc('config/backend').set({ vivoEm: new Date().toISOString(), ...extra }, { merge: true })
  } catch (e) {
    console.error('[heartbeat]', e.message)
  }
}

// Usuário do sistema a partir do ID token do Firebase (para rotas que a tela
// chama). Devolve { uid, perfil, nome, atende } ou null.
export async function usuarioDoToken(authHeader) {
  const tok = String(authHeader || '').replace(/^Bearer\s+/i, '')
  if (!tok) return null
  try {
    const dec = await auth().verifyIdToken(tok)
    const u = await db().doc(`usuarios/${dec.uid}`).get()
    if (!u.exists) return null
    const d = u.data()
    return { uid: dec.uid, perfil: d.perfil || '', nome: d.nome || dec.email || '', atende: !!d.atende, email: dec.email || '' }
  } catch {
    return null
  }
}
export const podeAtender = (u) => !!u && (['dono', 'designer', 'financeiro'].includes(u.perfil) || u.atende)
