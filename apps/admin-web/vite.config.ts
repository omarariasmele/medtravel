import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Pedido explícito del usuario: acceder al panel desde afuera vía
    // Caddy (medtravelapp.oysgroup.com.ar:8444 -> localhost:5173) —
    // Vite bloquea por defecto cualquier Host header que no sea
    // localhost/IP local (protección contra DNS rebinding).
    allowedHosts: ['medtravelapp.oysgroup.com.ar'],
  },
})
