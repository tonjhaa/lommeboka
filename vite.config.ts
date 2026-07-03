import path from 'path'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'

/**
 * Dev-utgave av /api/finn (Vercel-funksjonen i api/finn.ts) — samme parser,
 * slik at FINN-oppslag også virker under `npm run dev`.
 */
function finnDevApi(): Plugin {
  return {
    name: 'finn-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/finn', (req, res) => {
        void (async () => {
          const url = new URL(req.url ?? '', 'http://localhost')
          const finnkode = (url.searchParams.get('finnkode') ?? '').trim()
          const { fetchFinnAd, isValidFinnkode, FinnLookupError } = await import('./src/domain/finn/finnAdParser')
          res.setHeader('Content-Type', 'application/json')
          if (!isValidFinnkode(finnkode)) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'Ugyldig FINN-kode — lim inn tallet fra annonsen (8–10 sifre).' }))
            return
          }
          try {
            const data = await fetchFinnAd(finnkode)
            res.statusCode = 200
            res.end(JSON.stringify(data))
          } catch (err) {
            const isLookupErr = err instanceof FinnLookupError
            res.statusCode = isLookupErr ? err.statusCode : 502
            res.end(JSON.stringify({ error: isLookupErr ? err.message : 'Klarte ikke å hente annonsen fra FINN.' }))
          }
        })()
      })
    },
  }
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  build: {
    sourcemap: 'hidden',
  },
  plugins: [
    react(),
    tailwindcss(),
    finnDevApi(),
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      disable: !process.env.SENTRY_AUTH_TOKEN,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
