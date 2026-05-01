import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const clientLlmEnabled = mode === 'development' && env.VITE_ENABLE_CLIENT_LLM === 'true';
  return {
    plugins: [react(), tailwindcss()],
    define: {
      // Never inline secrets into production/browser builds. For local-only
      // LLM testing, set VITE_ENABLE_CLIENT_LLM=true alongside GEMINI_API_KEY.
      'process.env.GEMINI_API_KEY': JSON.stringify(clientLlmEnabled ? env.GEMINI_API_KEY : undefined),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
