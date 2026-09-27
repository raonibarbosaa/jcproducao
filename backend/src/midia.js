// Mídias (foto, áudio, documento) no disco da VPS, servidas pelo backend com
// URL ASSINADA e curta: o navegador não tem credencial para o disco, e a
// coleção só guarda o caminho. ⚠️ Backup do volume `midia` é obrigatório.
import { mkdir, writeFile, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { join, extname, normalize } from 'node:path'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { cfg } from './config.js'

const EXT = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
  'audio/ogg': '.ogg', 'audio/ogg; codecs=opus': '.ogg', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/aac': '.aac',
  'video/mp4': '.mp4', 'application/pdf': '.pdf',
}
const extDe = (mime, nome) => EXT[String(mime || '').toLowerCase()] || (nome && extname(nome)) || '.bin'

// grava e devolve o caminho RELATIVO (`<tel>/<waId>.<ext>`) que vai no doc
export async function salvaMidia({ telefone, waId, base64, mime, nome }) {
  const rel = `${telefone.replace(/\D/g, '')}/${waId.replace(/[^A-Za-z0-9_-]/g, '')}${extDe(mime, nome)}`
  const abs = join(cfg.midia.dir, rel)
  await mkdir(join(cfg.midia.dir, rel.split('/')[0]), { recursive: true })
  await writeFile(abs, Buffer.from(base64, 'base64'))
  return rel
}

// assinatura = HMAC(caminho|exp). URL vale `segundos` (padrão 1 h).
export function assinaMidia(rel, segundos = 3600) {
  const exp = Math.floor(Date.now() / 1000) + segundos
  const s = createHmac('sha256', cfg.midia.segredo).update(`${rel}|${exp}`).digest('hex')
  return `/midia/${rel}?exp=${exp}&s=${s}`
}

export function assinaturaValida(rel, exp, s) {
  if (!rel || !exp || !s) return false
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false
  const esperado = createHmac('sha256', cfg.midia.segredo).update(`${rel}|${exp}`).digest('hex')
  const a = Buffer.from(String(s)); const b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}

// rota GET /midia/:tel/:arquivo?exp&s
export async function serveMidia(req, res) {
  const rel = normalize(`${req.params.tel}/${req.params.arquivo}`).replace(/^(\.\.[/\\])+/, '')
  if (rel.includes('..') || !assinaturaValida(rel, req.query.exp, req.query.s)) return res.status(403).send('link inválido ou vencido')
  const abs = join(cfg.midia.dir, rel)
  try { await stat(abs) } catch { return res.status(404).send('não encontrado') }
  const ext = extname(abs).toLowerCase()
  const tipo = Object.entries(EXT).find(([, e]) => e === ext)?.[0] || 'application/octet-stream'
  res.setHeader('content-type', tipo.split(';')[0])
  res.setHeader('cache-control', 'private, max-age=3600')
  createReadStream(abs).pipe(res)
}
