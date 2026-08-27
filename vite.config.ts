/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { hullLibraryPlugin } from './vite.hull-library.ts'

export default defineConfig({
  // Project Pages live at https://<user>.github.io/hull-designer/
  base: process.env.GITHUB_PAGES === 'true' ? '/hull-designer/' : '/',
  plugins: [react(), hullLibraryPlugin()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
