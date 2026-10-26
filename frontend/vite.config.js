/** Configure the JSX build and isolated browser-like unit tests. */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/test/**/*.test.jsx'],
    coverage: {
      provider: 'v8',
      include: ['src/utils/*.js', 'src/components/*.jsx', 'src/pages/*.jsx', 'src/App.jsx'],
      reporter: ['text'],
    },
  },
});
