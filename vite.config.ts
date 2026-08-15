import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative asset URLs so the built site works from any static host, including
  // GitHub Pages project sites served from a subpath.
  base: './',
})
