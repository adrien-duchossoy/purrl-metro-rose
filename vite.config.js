import { defineConfig } from 'vite'

// Serveur local en simple HTTP (localhost est un contexte sûr pour le navigateur de l'ordinateur).
// Sur téléphone, le gyroscope exige HTTPS : on teste sur la version publiée sur GitHub Pages.
export default defineConfig({
  base: './', // chemins relatifs : le site marche aussi dans un sous-dossier (GitHub Pages)
  server: { host: true, port: 5175 },
})
