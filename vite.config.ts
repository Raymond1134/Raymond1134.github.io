import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import glsl from 'vite-plugin-glsl'
import { resolve } from 'node:path'

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    glsl({ include: ['**/*.glsl', '**/*.vert', '**/*.frag'], watch: true }),
  ],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  server: {
    host: true,
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/')) return 'three'
          if (id.includes('node_modules/@react-three/fiber') || id.includes('node_modules/@react-three/drei')) return 'r3f'
        },
      },
    },
  },
})