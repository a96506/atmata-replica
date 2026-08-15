// Extract text from AR PDF to verify Arabic content is present in logical order.
import { readFileSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const data = new Uint8Array(readFileSync('/tmp/spike-qt-ar.pdf'));
const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
const page = await doc.getPage(1);
const tc = await page.getTextContent();
const strings = tc.items.map((i) => i.str).filter(Boolean);
console.log('AR PDF text items (in render order):');
for (const s of strings) console.log(JSON.stringify(s));
console.log('\n--- joined ---');
console.log(strings.join(' '));
