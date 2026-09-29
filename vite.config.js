import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' garante que os assets carreguem no GitHub Pages
// (independente do nome do repositório)
export default defineConfig({
  plugins: [react()],
  base: './',
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
