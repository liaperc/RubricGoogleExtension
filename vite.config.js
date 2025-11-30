import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './public/manifest.json' with { type: 'json' };

export default defineConfig({
  plugins: [crx({ manifest })],
  publicDir: 'public',
  build: {
    outDir: 'dist'
    
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173
    }
  }
});