import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'assets',
  server: {
    port: 5173,
    open: true,
    // 2026-09-11 跨机：监听所有网卡，同一局域网的其他机器可用 http://<你的IP>:5173 访问。
    host: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@data': path.resolve(__dirname, 'src/data'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});