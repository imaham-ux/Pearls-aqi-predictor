import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Python Flask backend (python-backend/app/flask_api.py) - override with
// VITE_FLASK_API_URL if it's running somewhere other than localhost:5001.
const FLASK_API_URL = process.env.VITE_FLASK_API_URL || 'http://127.0.0.1:5001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: FLASK_API_URL,
        changeOrigin: true
      }
    }
  }
});
