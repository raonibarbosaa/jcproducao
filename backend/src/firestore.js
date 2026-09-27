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

// Cache vivo de `config/cadastros` (clientes, vendedores, motoristas) para
// resolver quem é o número sem uma leitura por mensagem.
let cadastros = { clientes: [], vendedores: [], motoristas: [] }
export const getCadastros = () => cadastros
export function assinaCadastros() {
  db().doc('config/cadastros').onSnapshot(
    (s) => { cadastros = s.data() || cadastros; console.log(`[cadastros] ${cadastros.clientes?.length || 0} clientes, ${cadastros.vendedores?.length || 0} vendedores, ${cadastros.motoristas?.length || 0} motoristas`) },
    (e) => console.error('[cadastros] onSnapshot', e.message),
  )
}

// Números de pedido conhecidos (para a sugestão de vínculo não casar "2026").
// Pedido entregue por inteiro some de `pedidos`, então junta `entregues`.
let pedidosConhecidos = new Set()
export const getPedidosConhecidos = () => pedidosConhecidos
export function assinaPedidos() {
  const ids = { pedidos: new Set(), entregues: new Set() }
  const junta = () => { pedidosConhecidos = new Set([...ids.pedidos, ...ids.entregues]) }
  db().collection('pedidos').select('idVenda').onSnapshot(
    (s) => { ids.pedidos = new Set(s.docs.map((d) => String(d.get('idVenda') || d.id))); junta() },
    (e) => console.error('[pedidos] onSnapshot', e.message),
  )
  db().collection('entregues').select('idVenda').onSnapshot(
    (s) => { ids.entregues = new Set(s.docs.map((d) => String(d.get('idVenda') || d.id.split('-')[0]))); junta() },
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
