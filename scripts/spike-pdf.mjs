// PDF spike — verify pdfnative Arabic shaping + RTL + Latin numbers on qt_1.
// Local Node run (faster than edge-fn deploy). Pass criteria:
//   - Arabic letters joined (isolated/initial/medial/final forms, not disconnected)
//   - RTL layout (direction: 'r2l')
//   - Numbers stay Latin (per kuwaiti-english-mixing)
//   - Render < 1s
//   - License OK (MIT — confirmed)
// Run: node scripts/spike-pdf.mjs

import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import {
  registerFonts,
  loadFontData,
  buildPDFBytes,
} from 'pdfnative';

// Register fonts lazily — only the locale's font loads per render.
registerFonts({
  ar: () => import('pdfnative/fonts/noto-arabic-data.js'),
  latin: () => import('pdfnative/fonts/noto-sans-data.js'),
});

const arFont = await loadFontData('ar');
const latinFont = await loadFontData('latin');

if (!arFont) throw new Error('Arabic font failed to load');
if (!latinFont) throw new Error('Latin font failed to load');

// qt_1 seed data (en labels)
const qt1 = {
  number: 'QT-2026-00001',
  customer: 'Areej Bookstore',
  date: '2026-04-05',
  validUntil: '2026-05-05',
  currency: 'KWD',
  lines: [
    { code: 'DC-2D', description: 'Display cooler — 2 door', qty: 2, unitPrice: 890, total: 1780 },
  ],
  subtotal: 1780,
  tax: 89,
  total: 1869,
};

// Arabic labels (kuwaiti-voice + product names stay Latin per kuwaiti-english-mixing)
const ar = {
  title: 'عرض سعر',
  number: 'رقم',
  customer: 'العميل',
  date: 'التاريخ',
  validUntil: 'صالح حتى',
  currency: 'العملة',
  headers: ['الرمز', 'الوصف', 'الكمية', 'سعر الوحدة', 'الإجمالي'],
  subtotal: 'المجموع الفرعي',
  tax: 'الضريبة',
  total: 'الإجمالي',
  customerAr: 'متجر أريج للكتب',
  lineDesc: 'Display cooler — 2 door', // product name stays Latin
};

function buildQuotePdf(locale) {
  const isAr = locale === 'ar';
  const fontEntries = isAr
    ? [
        { fontData: arFont, fontRef: 'F2', lang: 'ar' },
        { fontData: latinFont, fontRef: 'F1', lang: 'latin' },
      ]
    : [
        { fontData: latinFont, fontRef: 'F1', lang: 'latin' },
      ];

  const title = isAr ? ar.title : 'QUOTE';
  const infoItems = isAr
    ? [
        { label: ar.number, value: qt1.number },
        { label: ar.customer, value: ar.customerAr },
        { label: ar.date, value: qt1.date },
        { label: ar.validUntil, value: qt1.validUntil },
      ]
    : [
        { label: 'Number', value: qt1.number },
        { label: 'Customer', value: qt1.customer },
        { label: 'Date', value: qt1.date },
        { label: 'Valid until', value: qt1.validUntil },
      ];

  const headers = isAr ? ar.headers : ['Code', 'Description', 'Qty', 'Unit price', 'Total'];
  const rows = qt1.lines.map((l) => ({
    cells: [l.code, l.description, String(l.qty), String(l.unitPrice), String(l.total)],
  }));

  return buildPDFBytes(
    {
      docTitle: `${title} ${qt1.number}`,
      title,
      infoItems,
      balanceText: isAr ? `${ar.total}: KWD ${qt1.total}` : `Total: KWD ${qt1.total}`,
      countText: isAr ? `${qt1.lines.length} بنود` : `${qt1.lines.length} line item(s)`,
      headers,
      rows,
      footerText: isAr ? 'عرض سعر — صالح حتى تاريخه' : 'Quote — valid until the date shown',
      fontEntries,
    },
    {
      direction: isAr ? 'r2l' : 'l2r',
    },
  );
}

for (const locale of ['en', 'ar']) {
  const t0 = performance.now();
  const bytes = buildQuotePdf(locale);
  const ms = performance.now() - t0;
  const out = `/tmp/spike-qt-${locale}.pdf`;
  writeFileSync(out, bytes);
  console.log(`${locale.toUpperCase()}: ${bytes.length} bytes, ${ms.toFixed(0)}ms -> ${out}`);
}

console.log('Open both PDFs and verify: Arabic letters joined, RTL layout, Latin numbers.');
