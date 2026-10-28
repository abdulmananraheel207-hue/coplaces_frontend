import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** The English data for reading text on floor plans is served from this app, in development and in the build. */
const ocrData = () => {
  const file = fileURLToPath(new URL('../node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', import.meta.url));
  return {
    name: 'ocr-data',
    configureServer(server: { middlewares: { use: (path: string, fn: (req: unknown, res: { setHeader: (k: string, v: string) => void; end: (b: Buffer) => void }) => void) => void } }) {
      server.middlewares.use('/ocr/eng.traineddata.gz', (_req, res) => {
        res.setHeader('Content-Type', 'application/gzip');
        res.end(readFileSync(file));
      });
    },
    generateBundle(this: { emitFile: (f: { type: 'asset'; fileName: string; source: Buffer }) => void }) {
      this.emitFile({ type: 'asset', fileName: 'ocr/eng.traineddata.gz', source: readFileSync(file) });
    },
  };
};

export default defineConfig({
  plugins: [react(), tailwindcss(), ocrData()],
  server: {
    port: 5173,
    proxy: { '/api': 'https://coplacesbackend.vercel.app' },
  },
});
