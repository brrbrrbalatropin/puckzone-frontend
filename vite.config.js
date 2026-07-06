import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // sockjs-client referencia `global` (Node); en navegador lo mapeamos a window
  define: {
    global: 'window',
  },
})
