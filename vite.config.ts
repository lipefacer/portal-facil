import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Cast process to any to resolve TS error about missing cwd() method
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    build: {
      outDir: 'dist',
      sourcemap: false
    },
    publicDir: 'public',
    server: {
      port: 3000
    },
    define: {
      // Polyfill para process.env.API_KEY funcionar no client-side
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    }
  };
});