import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// BASE_PATH permite publicar la aplicación en una subcarpeta, como en GitHub Pages
// (https://usuario.github.io/repositorio/). En local y en Vercel/Netlify se deja en "/".
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
