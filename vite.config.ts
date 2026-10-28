import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** The English data for reading text on floor plans is served from this app, in development and in the build. */
const ocrData = () => {
  // Look in the nearest node_modules first, then parent ones, so it works standalone (e.g. Vercel) and in a workspace.
  const rel = 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz';
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, rel)) && dirname(dir) !== dir) dir = dirname(dir);
  const file = join(dir, rel);
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
  server: { port: 5173 },
});
