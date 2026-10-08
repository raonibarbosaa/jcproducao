import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

// IDENTIDADE DO BUILD (08/10/2026). O site é uma SPA com hash: a aba aberta
// nunca recarrega sozinha, e uma aba com o build ANTIGO continua rodando dias
// depois do deploy — foi assim que o designer "perdeu" todos os apelidos
// quando o cadastro de clientes mudou de lugar. Cada build grava o seu id no
// código (`__BUILD_ID__`) e em `version.json` ao lado do index; o app compara
// os dois de tempos em tempos (`AvisoVersao`) e pede para recarregar.
function idDoBuild() {
  let hash = 'semgit'
  try { hash = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch {}
  return `${hash}-${Date.now().toString(36)}`
}
const BUILD_ID = idDoBuild()

function versaoJson() {
  let ssr = false
  return {
    name: 'jc-version-json',
    apply: 'build',
    configResolved(config) { ssr = !!config.build.ssr },
    generateBundle() {
      // só no build do site — o SSR do `test:tela` não publica nada
      if (ssr) return
      this.emitFile({ type: 'asset', fileName: 'version.json',
        source: JSON.stringify({ build: BUILD_ID, em: new Date().toISOString() }) })
    },
  }
}

// base: './' garante que os assets carreguem no GitHub Pages
// (independente do nome do repositório)
export default defineConfig({
  plugins: [react(), versaoJson()],
  base: './',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  build: {
    rollupOptions: {
      output: {
        // bibliotecas em pedaços próprios: mudam raramente, então o navegador
        // (o tablet do posto) as reaproveita do cache a cada deploy nosso.
        // (função, não objeto: no build SSR do `test:tela` essas libs são
        // externas, e a forma de objeto derruba o build com erro.)
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return 'react'
          if (/node_modules\/(@firebase|firebase)\//.test(id)) return 'firebase'
        },
      },
    },
  },
})
