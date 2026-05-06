import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  base: './',
  build: {
    sourcemap: false,
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/renderer/index.html'),
        player: resolve(__dirname, 'src/renderer/player.html')
      },
      output: {
        manualChunks(id) {
          const p = id.replace(/\\/g, '/')
          if (p.includes('/node_modules/react-dom/') || p.includes('/node_modules/scheduler/')) return 'vendor-react'
          if (p.includes('/node_modules/react/')) return 'vendor-react'
          if (p.includes('/node_modules/react-konva/')) return 'vendor-react-konva'
          if (p.includes('/node_modules/konva/')) return 'vendor-konva'
        }
      }
    }
  },
  server: {
    port: 5176,
    fs: {
      allow: [resolve(__dirname, 'src'), resolve(__dirname, 'resources')]
    }
  }
})
