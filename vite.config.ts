import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import glsl from 'vite-plugin-glsl'
import { resolve } from 'node:path'

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    glsl({
      include: ['**/*.glsl', '**/*.vert', '**/*.frag'],
      watch: true,
      // Safety net: a chunk reached via two different #include paths would
      // otherwise be inlined twice, redefining every function in it. GLSL
      // rejects that, and the error points at a line number that maps to no
      // file you wrote.
      removeDuplicatedImports: true,
    }),
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
        // Vite 8 bundles with Rolldown, not classic Rollup. `manualChunks` is
        // deprecated there and — more importantly — Rolldown re-merges the
        // chunks it produces, so three.js ended up inside the r3f chunk anyway.
        // `codeSplitting.groups` is the API that actually holds.
        //
        // Intent: keep three.js in its own cacheable chunk. It's the biggest
        // dependency and changes far less often than our app code, so a
        // returning visitor re-downloads only what actually changed.
        codeSplitting: {
          // Default minSize would merge these back together; three is ~600kB
          // so a low floor is safe here.
          minSize: 0,
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            { name: 'r3f', test: /node_modules[\\/]@react-three[\\/]/ },
          ],
        },
      },
    },
  },
})