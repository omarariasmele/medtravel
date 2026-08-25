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
    // Bug real reportado en vivo: "la web no carga" — el server había
    // quedado escuchando SOLO en IPv6 (::1), nunca en 127.0.0.1; un
    // navegador que resuelve "localhost" a IPv4 primero no podía
    // conectar. host:true fuerza escuchar en todas las interfaces
    // (IPv4 y IPv6), sin afectar allowedHosts de arriba.
    host: true,
  },
})
