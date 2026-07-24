import { defineConfig } from 'vite';

export default defineConfig({
  base: '/2048/',
  server: {
    host: true,
    port: 5173,
  },
});
