import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered in src/main.tsx (virtual:pwa-register): it checks for a new deploy while the
      // app stays open and shows "A new version is ready - Reload" instead of reloading by itself.
      injectRegister: false,
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'KMCC Savings & Loans',
        short_name: 'KMCC',
        description: 'KMCC member savings, loans, profit and expense tracker',
        theme_color: '#0f3460',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
      },
    }),
  ],
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
