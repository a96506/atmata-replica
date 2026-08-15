// Render PDF page 1 to PNG for visual shaping verification.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const { createCanvas } = require('canvas');

async function renderPdfToPng(pdfPath, pngPath, scale = 2) {
  const data = new Uint8Array(readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport, canvasFactory: { create() {}, reset() {} } }).promise;
  writeFileSync(pngPath, canvas.toBuffer('image/png'));
  console.log(`${pngPath} ${canvas.width}x${canvas.height}`);
}

const pdf = process.argv[2];
const png = process.argv[3];
renderPdfToPng(pdf, png).catch(e => { console.error(e); process.exit(1); });
