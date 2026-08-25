import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config'

export default defineConfig({
  plugins: [crx({ manifest })],
  optimizeDeps: {
    include: ['exceljs', 'papaparse'],
  },
  build: {
    commonjsOptions: {
      include: [/exceljs/, /node_modules/],
    },
    rollupOptions: {
      input: {
        panel: 'src/panel/index.html',
        'pdf-viewer': 'src/pdf-viewer/index.html',
      },
    },
  },
})
