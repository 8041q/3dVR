import fs from 'node:fs/promises'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

const apiTarget = `http://127.0.0.1:${process.env.PORT || 3001}`
const useHttps = process.env.VITE_DEV_HTTPS === '1'

export default defineConfig({
  plugins: [{ name:'safe-public-copy', async closeBundle() { for (const name of ['brand','icons','vendor','demo','sw.js','manifest.webmanifest']) await fs.cp('public/'+name,'dist/'+name,{recursive:true}) } }, react(), ...(useHttps ? [basicSsl()] : [])],
  server: {
    port: Number(process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).port : 0) || 5173,
    strictPort: true,
    proxy: {
      '/api': apiTarget,
      '/media': apiTarget,
      '/uploads': apiTarget,
    },
  },
  build: {
    sourcemap: false,
    copyPublicDir: false,
  },
})
