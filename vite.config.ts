import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.json';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    crx({ manifest }),
  ],
  build: {
    rollupOptions: {
      input: {
        popup: 'src/popup/popup.html',
      },
    },
    // CRITICAL: Disable module preload for service worker compatibility
    // Module preload polyfill injects window.dispatchEvent which breaks service workers
    modulePreload: false,
  },
  // Ensure environment variables are available
  define: {
    'process.env': {},
  },
});
