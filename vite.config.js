import { defineConfig } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

// HTTPS obligatoire : sans lui, l'iPhone refuse l'accès au gyroscope
export default defineConfig({
  base: './', // chemins relatifs : le site marche aussi dans un sous-dossier (GitHub Pages)
  plugins: [basicSsl()],
  server: { https: true, host: true, port: 5175 },
})
