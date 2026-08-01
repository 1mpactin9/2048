import { defineConfig } from "vite";

export default defineConfig({
  base: "/engine2048/",
  server: {
    host: true,
    port: 5173,
  },
});
