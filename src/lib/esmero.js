// A CHAMADA ao Esmero (o CRM/WhatsApp da Totali) — 07/10/2026.
//
// Quem chama é o NAVEGADOR de quem lançou o pedido no Controle de entrega, e a
// identidade é o token de sessão do Firebase: nenhum segredo no código (o
// repositório é público). O Esmero confere a assinatura do Google e descobre
// a empresa pelo id do projeto. Nunca lança: devolve sempre um objeto que
// `registroWhatsSaida` (utils) sabe traduzir para a tela.
import { auth } from '../firebase.js'

export const CAMINHO_AVISO = '/api/integracoes/jcproducao/aviso'

export async function enviarAvisoEsmero({ url, corpo }, { timeoutMs = 15000 } = {}) {
  const user = auth.currentUser
  if (!user) return { ok: false, motivo: 'sem_login', detalhe: 'sessão expirada: entre de novo' }
  let token
  try {
    token = await user.getIdToken()
  } catch (e) {
    return { ok: false, motivo: 'sem_login', detalhe: 'não foi possível obter o token de sessão' }
  }
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const r = await fetch(url + CAMINHO_AVISO, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: ctl.signal,
    })
    const json = await r.json().catch(() => null)
    if (json && typeof json.ok === 'boolean') {
      // 4xx com corpo do Esmero: o motivo dele vale mais que o status
      if (!json.ok && !json.motivo) return { ok: false, motivo: `http_${r.status}`, detalhe: json.erro || `o Esmero respondeu ${r.status}` }
      return json
    }
    return { ok: false, motivo: `http_${r.status}`, detalhe: `o Esmero respondeu ${r.status} sem conteúdo` }
  } catch (e) {
    const abortado = e?.name === 'AbortError'
    return { ok: false, motivo: abortado ? 'tempo' : 'rede', detalhe: abortado ? 'o Esmero demorou demais para responder' : 'sem conexão com o Esmero (endereço errado, CORS ou fora do ar)' }
  } finally { clearTimeout(t) }
}
