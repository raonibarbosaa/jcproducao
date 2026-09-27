// Backend da JC Sacolas na VPS. Ver ../../WHATSAPP.md (Decisão 0 e Fase 0).
//   GET  /saude                 vivo? (healthcheck do Docker e do Traefik)
//   POST /wa/webhook            eventos da Evolution API (Bearer WA_WEBHOOK_TOKEN)
//   GET  /wa/qr?chave=…         página para parear o celular (QR) — só o dono, uma vez
//   GET  /wa/estado             estado da conexão (ID token de quem atende)
//   POST /wa/conectar           cria/reconecta a instância (ID token de dono)
//   GET  /midia/:tel/:arquivo   mídia recebida (URL assinada)
//   GET  /midia-url?path=…      assina uma URL de mídia (ID token de quem atende)
import express from 'express'
import { timingSafeEqual } from 'node:crypto'
import { cfg, validaConfig } from './config.js'
import { iniciaFirebase, assinaCadastros, assinaPedidos, heartbeat, usuarioDoToken, podeAtender } from './firestore.js'
import { processaEvento } from './receber.js'
import { assinaFilaEnvio } from './enviar.js'
import { criarInstancia, obterQr, estadoInstancia, perfilInstancia, desconectarInstancia } from './evolution.js'
import { serveMidia, assinaMidia } from './midia.js'

validaConfig()
iniciaFirebase()

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(express.json({ limit: '25mb' }))

const igual = (a, b) => { const x = Buffer.from(String(a || '')); const y = Buffer.from(String(b || '')); return x.length === y.length && x.length > 0 && timingSafeEqual(x, y) }

app.get('/saude', (_req, res) => res.json({ ok: true, agora: new Date().toISOString(), instancia: cfg.wa.instancia }))

// ---------- webhook ----------
app.post('/wa/webhook', async (req, res) => {
  const tok = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!igual(tok, cfg.wa.webhookToken)) return res.status(401).json({ erro: 'não autorizado' })
  // responde 200 SEMPRE que o corpo é válido, mesmo ignorando — senão a
  // Evolution fica repetindo o evento
  try {
    const r = await processaEvento(req.body)
    if (r?.gravada) console.log(`[wa] ${r.tipo} de ${r.telefone} (${r.contato})${r.sugeridos?.length ? ` pedidos: ${r.sugeridos.join(', ')}` : ''}`)
    res.json({ ok: true, ...r })
  } catch (e) {
    console.error('[wa] webhook', e)
    res.status(500).json({ erro: e.message })
  }
})

// ---------- pareamento (QR) ----------
const exigeChave = (req, res, next) => (igual(req.query.chave, cfg.wa.adminChave) ? next() : res.status(403).send('chave inválida'))
const exigeUsuario = (quem) => async (req, res, next) => {
  const u = await usuarioDoToken(req.headers.authorization)
  if (!u || !quem(u)) return res.status(403).json({ erro: 'sem permissão' })
  req.usuario = u
  next()
}

app.get('/wa/qr', exigeChave, async (_req, res) => {
  const c = await criarInstancia()
  if (!c.ok) return res.status(502).send(`<p>${c.erro}</p>`)
  const q = c.data.estado === 'open' ? { ok: true, data: { qr: null, estado: 'open' } } : await obterQr()
  const p = await perfilInstancia()
  const estado = q.ok ? q.data.estado : '?'
  const numero = p.ok ? p.data.numero : null
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.send(`<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="20"><title>JC · WhatsApp</title>
<body style="font-family:system-ui;max-width:520px;margin:40px auto;text-align:center">
<h2>JC Sacolas — WhatsApp do sistema</h2>
<p>Instância <b>${cfg.wa.instancia}</b> · estado: <b>${estado}</b>${numero ? ` · número ${numero}` : ''}</p>
${estado === 'open'
  ? '<p style="color:green;font-size:1.2em">✅ Conectado. Pode fechar esta página.</p>'
  : (q.ok && q.data.qr
    ? `<img src="${q.data.qr}" alt="QR" style="width:320px;height:320px"><p>No celular: WhatsApp › ⋮ › <b>Aparelhos conectados</b> › Conectar aparelho › aponte para o QR.<br>A página atualiza sozinha a cada 20 s.</p>`
    : `<p>Gerando o QR… ${q.ok ? '' : q.erro}</p>`)}
</body>`)
})

app.get('/wa/estado', exigeUsuario(podeAtender), async (_req, res) => {
  const e = await estadoInstancia(); const p = await perfilInstancia()
  res.json({ estado: e.ok ? e.data : null, erro: e.ok ? null : e.erro, numero: p.ok ? p.data.numero : null, nome: p.ok ? p.data.nome : null })
})
app.post('/wa/conectar', exigeUsuario((u) => u.perfil === 'dono'), async (_req, res) => {
  const c = await criarInstancia(); if (!c.ok) return res.status(502).json({ erro: c.erro })
  const q = c.data.estado === 'open' ? { ok: true, data: { qr: null, estado: 'open' } } : await obterQr()
  res.json(q.ok ? q.data : { erro: q.erro })
})
app.post('/wa/desconectar', exigeUsuario((u) => u.perfil === 'dono'), async (_req, res) => {
  const r = await desconectarInstancia(); res.json(r.ok ? { ok: true } : { erro: r.erro })
})

// ---------- mídia ----------
app.get('/midia/:tel/:arquivo', serveMidia)
app.get('/midia-url', exigeUsuario(podeAtender), (req, res) => {
  const rel = String(req.query.path || '')
  if (!/^\d+\/[A-Za-z0-9_-]+\.[a-z0-9]+$/.test(rel)) return res.status(400).json({ erro: 'caminho inválido' })
  res.json({ url: `https://${cfg.dominio}${assinaMidia(rel)}` })
})

app.use((_req, res) => res.status(404).json({ erro: 'não encontrado' }))

// ---------- subida ----------
app.listen(cfg.porta, async () => {
  console.log(`[backend] ouvindo em :${cfg.porta} · instância ${cfg.wa.instancia} · webhook ${cfg.wa.webhookUrl}`)
  assinaCadastros()
  assinaPedidos()
  assinaFilaEnvio()
  const bate = async () => {
    const e = await estadoInstancia()
    await heartbeat({ estado: e.ok ? (e.data || 'sem-instancia') : 'evolution-fora', instancia: cfg.wa.instancia, versao: '0.1.0' })
  }
  await bate()
  setInterval(bate, 60_000)
  // garante a instância (idempotente); o QR é lido depois em /wa/qr
  const c = await criarInstancia()
  console.log(c.ok ? `[wa] instância ${c.data.criada ? 'criada' : 'já existia'} · estado ${c.data.estado}` : `[wa] instância: ${c.erro}`)
})
