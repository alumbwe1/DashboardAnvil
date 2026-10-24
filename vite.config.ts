import { defineConfig, searchForWorkspaceRoot } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

/**
 * The public origin of this dev server is injected by the container manager
 * when it supervises the preview (see docs/preview-pipeline.md):
 *
 *  - PREVIEW_PUBLIC_ORIGIN — production: the reverse-proxy origin for this
 *    project, e.g. `https://8f81fa480a5ca51e.preview.tryanvil.dev`. The
 *    browser reaches Vite through the proxy over HTTPS/WSS, so the HMR
 *    client must advertise `wss://<host>/` (port 443) — never the internal
 *    `localhost:5173`, which broke HMR behind the proxy and collided with
 *    the app's own Vite on developer machines.
 *
 *  - PREVIEW_PUBLIC_PORT — local dev / tunnel mode: the loopback host port
 *    this container's 5173 is published on (`127.0.0.1:<port>`, bound
 *    1:1). Vite still listens on 5173 inside the container; the CLIENT is
 *    told to use the public port for HMR sockets and asset URLs.
 *
 * Dependencies usually come from the image's shared, read-only
 * /node_modules (resolved by walking up from /workspace), so the dep cache
 * lives in the workspace (`.vite`) and `fs.allow` admits the shared tree
 * for assets Vite serves straight from a package (fonts, CSS).
 *
 * Readiness is a real HTTP 200 probe from the manager, so `strictPort` is
 * safe: a port conflict must fail loudly instead of silently moving the
 * server somewhere the proxy cannot reach it.
 */
export default defineConfig(() => {
  const publicOrigin = process.env.PREVIEW_PUBLIC_ORIGIN || ''
  const publicPort = process.env.PREVIEW_PUBLIC_PORT || ''
  const port = Number(process.env.PORT || 5173)
  const behindProxy = Boolean(publicOrigin)
  const proxyHostname = behindProxy ? new URL(publicOrigin).hostname : ''

  // `overlay: false`: Vite's red error overlay would render inside the
  // user's preview. Anvil shows its own friendly error card instead (fed by
  // the dev-server log stream), and hides errors entirely mid-generation.
  const hmr = behindProxy
    ? { protocol: 'wss' as const, host: proxyHostname, clientPort: 443, overlay: false }
    : publicPort
      ? { host: '127.0.0.1', clientPort: Number(publicPort), overlay: false }
      : { overlay: false }

  return {
    plugins: [react(), tailwindcss()],
    // `@/` = src/ (shadcn convention the agent writes by default).
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    cacheDir: '.vite',
    server: {
      fs: { allow: [searchForWorkspaceRoot(process.cwd()), '/node_modules'] },
      host: '0.0.0.0',
      port,
      strictPort: true,
      // Advertise the public origin so injected module URLs and the dev
      // client's websocket target are correct by construction.
      origin: behindProxy
        ? publicOrigin
        : publicPort
          ? `http://127.0.0.1:${publicPort}`
          : undefined,
      // Behind the proxy only the project's own hostname may reach this
      // server (Vite's host check otherwise rejects proxied requests).
      // Vite only accepts strings here — a RegExp fails `tsc -b`.
      ...(behindProxy ? { allowedHosts: [proxyHostname] } : {}),
      hmr,
    },
  }
})
