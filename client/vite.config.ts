import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_PATHS = ['/webhook', '/health', '/config', '/hubspot', '/logs', '/test', '/wati'];

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(API_PATHS.map((path) => [path, 'http://localhost:3001'])),
  },
});
