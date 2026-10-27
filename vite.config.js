import { defineConfig } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

// HTTPS obligatoire : sans lui, l'iPhone refuse l'accès au gyroscope
export default defineConfig({
  plugins: [basicSsl()],
  server: { https: true, host: true, port: 5175 },
})
