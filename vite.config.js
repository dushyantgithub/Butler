import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  // No .env variables (even accidental VITE_* secrets) belong in the browser bundle.
  envPrefix: [],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    fs: {
      deny: [
        '.env',
        '.env.*',
        '*.{crt,pem,key,p12,pfx,cer,der}',
        '.npmrc',
        '.yarnrc.yml',
        '**/.git/**',
        '**/data/**',
        '**/.runtime/**',
        '**/agents/**',
        '**/skills/**',
      ],
    },
    proxy: { '/api': 'http://127.0.0.1:4310' },
  },
});
