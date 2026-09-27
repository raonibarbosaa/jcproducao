// Cliente da Evolution API (serviço `whatsapp` do compose). Só o backend fala
// com ela, pela rede interna, com a WA_API_KEY. Nada aqui lança para fora:
// cada chamada devolve { ok, data } ou { ok:false, erro } em português.
// (Padrão copiado da Agência 100K, que roda a mesma versão nesta VPS.)
import { cfg } from './config.js'

export const EVENTOS_WEBHOOK = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE']

async function chamar(caminho, { method = 'GET', body, timeoutMs = 20_000 } = {}) {
  try {
    const r = await fetch(`${cfg.wa.url}${caminho}`, {
      method,
      headers: { apikey: cfg.wa.apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const texto = await r.text()
    let j = null
    try { j = texto ? JSON.parse(texto) : null } catch { j = null }
    if (r.ok) return { ok: true, data: j }
    return { ok: false, erro: mensagemDeErro(j, r.status), status: r.status }
  } catch (e) {
    const m = e?.message || String(e)
    return { ok: false, erro: /abort|timeout/i.test(m) ? 'O serviço do WhatsApp demorou demais para responder.' : 'Não foi possível falar com o serviço do WhatsApp.' }
  }
}

function mensagemDeErro(j, status) {
  const m = j?.response?.message ?? j?.message ?? j?.error
  const texto = Array.isArray(m) ? m.map(String).join('; ') : m ? String(m) : ''
  if (status === 401) return 'O serviço do WhatsApp recusou a chave (WA_API_KEY).'
  if (status === 404) return texto ? `O serviço do WhatsApp respondeu: ${texto}` : 'Instância não encontrada no serviço do WhatsApp.'
  return texto ? `O serviço do WhatsApp respondeu: ${texto}` : `O serviço do WhatsApp respondeu HTTP ${status}.`
}

const inst = () => encodeURIComponent(cfg.wa.instancia)

// Estado da instância; null quando ela não existe.
export async function estadoInstancia() {
  const r = await chamar(`/instance/connectionState/${inst()}`)
  if (!r.ok) return /não encontrada|not found|does not exist/i.test(r.erro) || r.status === 404 ? { ok: true, data: null } : r
  const s = r.data?.instance?.state
  return { ok: true, data: ['open', 'connecting', 'close'].includes(s) ? s : null }
}

// Cria a instância com o webhook apontando para este backend. Idempotente.
export async function criarInstancia() {
  const e = await estadoInstancia()
  if (e.ok && e.data) return { ok: true, data: { qr: null, estado: e.data, criada: false } }
  const r = await chamar('/instance/create', {
    method: 'POST', timeoutMs: 40_000,
    body: {
      instanceName: cfg.wa.instancia,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      // grupos ficam de fora (o grupo da rota continua no celular); não marca
      // como lido (quem lê é a pessoa, no sistema); sem sincronizar histórico
      groupsIgnore: true,
      readMessages: false,
      readStatus: false,
      syncFullHistory: false,
      alwaysOnline: false,
      rejectCall: false,
      webhook: {
        enabled: true,
        url: cfg.wa.webhookUrl,
        byEvents: false,
        base64: false,
        headers: { authorization: `Bearer ${cfg.wa.webhookToken}` },
        events: EVENTOS_WEBHOOK,
      },
    },
  })
  if (!r.ok) return r
  return { ok: true, data: { qr: r.data?.qrcode?.base64 ?? null, estado: 'connecting', criada: true } }
}

// QR atual (imagem base64) — vazio quando já conectado.
export async function obterQr() {
  const r = await chamar(`/instance/connect/${inst()}`, { timeoutMs: 30_000 })
  if (!r.ok) return r
  if (r.data?.instance?.state === 'open') return { ok: true, data: { qr: null, estado: 'open' } }
  return { ok: true, data: { qr: r.data?.base64 ?? null, estado: 'connecting' } }
}

export async function perfilInstancia() {
  const r = await chamar(`/instance/fetchInstances?instanceName=${inst()}`)
  if (!r.ok) return r
  const i = Array.isArray(r.data) ? (r.data.find((x) => (x.name ?? x.instanceName) === cfg.wa.instancia) ?? r.data[0]) : null
  const jid = i?.ownerJid ?? i?.number ?? null
  const numero = jid ? String(jid).split('@')[0].split(':')[0].replace(/\D/g, '') || null : null
  return { ok: true, data: { numero, nome: i?.profileName ?? null, estado: i?.connectionStatus ?? null } }
}

export async function desconectarInstancia() {
  const r = await chamar(`/instance/logout/${inst()}`, { method: 'DELETE' })
  return r.ok || /not connected/i.test(r.erro) ? { ok: true } : r
}

// ---------- envio ----------
export async function enviarTexto(numero, texto) {
  const r = await chamar(`/message/sendText/${inst()}`, { method: 'POST', timeoutMs: 30_000, body: { number: numero, text: texto, linkPreview: true } })
  return r.ok ? { ok: true, data: { waId: r.data?.key?.id ?? null } } : r
}

export async function enviarMidia(numero, { tipo, mime, nome, legenda, base64 }) {
  const r = await chamar(`/message/sendMedia/${inst()}`, {
    method: 'POST', timeoutMs: 90_000,
    body: { number: numero, mediatype: tipo, mimetype: mime, fileName: nome, caption: legenda || undefined, media: base64 },
  })
  return r.ok ? { ok: true, data: { waId: r.data?.key?.id ?? null } } : r
}

export async function enviarAudio(numero, base64) {
  const r = await chamar(`/message/sendWhatsAppAudio/${inst()}`, { method: 'POST', timeoutMs: 60_000, body: { number: numero, audio: base64, encoding: true } })
  return r.ok ? { ok: true, data: { waId: r.data?.key?.id ?? null } } : r
}

// ---------- mídia recebida ----------
export async function baixarMidia(waId) {
  const r = await chamar(`/chat/getBase64FromMediaMessage/${inst()}`, {
    method: 'POST', timeoutMs: 45_000,
    body: { message: { key: { id: waId } }, convertToMp4: false },
  })
  if (!r.ok) return r
  if (!r.data?.base64) return { ok: false, erro: 'O serviço do WhatsApp não devolveu a mídia.' }
  return { ok: true, data: { base64: r.data.base64, mime: r.data.mimetype || 'application/octet-stream', nome: r.data.fileName ?? null } }
}
