import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' garante que os assets carreguem no GitHub Pages
// (independente do nome do repositório)
export default defineConfig({
  plugins: [react()],
  base: './',
})
