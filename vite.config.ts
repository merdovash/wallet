/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { apiPlugin } from './vite-plugin-api'

export default defineConfig({
  plugins: [react(), tailwindcss(), apiPlugin()],
  server: {
    host: true,
    watch: {
      ignored: ['**/dist/**', '**/logs/**', '**/.git/**'],
    },
  },
  preview: {
    host: true,
  },
  test: {
    globals: true,
    environment: 'node',
  },
})
