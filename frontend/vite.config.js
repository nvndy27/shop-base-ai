import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'
import { publicAuthConfig, proxyOrigin } from './config/public-auth.js'

const frontendDir = fileURLToPath(new URL('.', import.meta.url))
const backendDir = fileURLToPath(new URL('../apps/web', import.meta.url))
const devOrigins = new Set(['http://localhost:5175', 'http://127.0.0.1:5175'])

export default defineConfig(({ mode }) => {
  // Existing backend configuration is read server-side only. Never spread it into define/env.
  const env = { ...loadEnv(mode, backendDir, ''), ...loadEnv(mode, frontendDir, ''), ...process.env }
  const auth = publicAuthConfig(env)
  return {
    // Disable Vite's blanket VITE_* exposure; define only the validated public pair below.
    envPrefix: [],
    plugins: [
      react(),
      {
        name: 'local-api-origin-guard',
        configureServer(server) {
          // The shared env lives outside Vite's root; reload config when it changes.
          const backendEnvFiles = ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]
            .map(name => fileURLToPath(new URL(`../apps/web/${name}`, import.meta.url)))
          server.watcher.add(backendEnvFiles)
          server.watcher.on('change', file => {
            if (backendEnvFiles.includes(file)) server.restart()
          })
          server.middlewares.use((request, response, next) => {
            if (request.url?.startsWith('/api/') && request.headers.origin &&
                !devOrigins.has(request.headers.origin)) {
              response.statusCode = 403
              response.end('Origin not allowed')
              return
            }
            next()
          })
        },
      },
    ],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(auth.url),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(auth.key),
    },
    server: {
      host: 'localhost',
      port: 5175,
      strictPort: true,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3000',
          timeout: 10000,
          proxyTimeout: 10000,
          // Same-origin browser requests; trusted development proxy adapts the upstream origin.
          headers: { Origin: proxyOrigin(env.APP_ORIGIN) },
        },
      },
    },
  }
})
