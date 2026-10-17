import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/');
          if (normalizedId.includes('/node_modules/three-stdlib/')) return 'three-stdlib';
          if (normalizedId.includes('/node_modules/@react-three/drei/')) return 'react-three-drei';
          if (normalizedId.includes('/node_modules/@react-three/fiber/')) return 'react-three-fiber';
          if (normalizedId.includes('/node_modules/three/')) return 'three';
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true
  }
});
