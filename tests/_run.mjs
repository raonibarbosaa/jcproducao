// Roda todos os *.test.mjs desta pasta. `npm test`.
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const aqui = dirname(fileURLToPath(import.meta.url))
const arquivos = readdirSync(aqui).filter((f) => f.endsWith('.test.mjs')).sort()

let falhas = 0
for (const f of arquivos) {
  const mod = await import(join(aqui, f))
  falhas += mod.default || 0
}
console.log(falhas ? `\n${falhas} FALHA(S)` : `\n${arquivos.length} arquivo(s) — tudo passou.`)
process.exit(falhas ? 1 : 0)
