import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    host: '0.0.0.0', // Listen on all interfaces (IPv4 + IPv6)
    port: parseInt(process.env.VITE_PORT || '5173', 10),
    strictPort: true, // Don't try alternative ports if the port is in use
    proxy: {
      '/ws': {
        target: process.env.BACKEND_URL || 'http://localhost:3000',
        ws: true,
      },
      '/api': {
        target: process.env.BACKEND_URL || 'http://localhost:3000',
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
