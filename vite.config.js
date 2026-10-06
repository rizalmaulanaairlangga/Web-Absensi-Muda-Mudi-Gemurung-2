import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

const useHttps = process.env.VITE_DEV_HTTPS === '1';

export default defineConfig({
  plugins: [...(useHttps ? [basicSsl()] : []), react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    ...(useHttps ? { https: true } : {}),
  },
  build: { outDir: 'dist' }
});
