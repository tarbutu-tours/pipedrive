// Create השוואת_טיולים_לפי_יעד.xlsx using SheetJS (xlsx) - standard compliant
// Run from project root: node competitor_research/create_xlsx_sheetjs.cjs
const fs = require('fs');
const path = require('path');
let XLSX;
try {
  XLSX = require('xlsx');
} catch (e) {
  try {
    XLSX = require('../node_modules/xlsx');
  } catch (e2) {
    console.error('Install xlsx: npm install xlsx');
    process.exit(1);
  }
}

const BASE = path.resolve(__dirname);
const outPath = path.join(BASE, 'השוואת_טיולים_לפי_יעד.xlsx');

const comparison = JSON.parse(fs.readFileSync(path.join(BASE, 'comparison_by_destination.json'), 'utf8'));
const fullScan = JSON.parse(fs.readFileSync(path.join(BASE, 'full_scan_results.json'), 'utf8'));

function str(v) {
  if (v == null || v === undefined) return '';
  return String(v);
}

// Base URLs for link column when not in data
const COMPANY_URL = { 'קרוזתור': 'https://cruise.co.il/', 'קשרי תעופה': 'https://www.kishrey-teufa.co.il/cruise.html', 'גולדן טורס': 'https://www.goldentours.co.il/kosher-cruise/', 'מנו ספנות': 'https://cruise.mano.co.il/', 'מסעות': 'https://www.masaot.co.il/' };

function buildSheetData(destData) {
  const aoa = [];
  aoa.push(['תרבותו']);
  aoa.push(['שם הטיול', 'ימים', 'מחיר', 'תאריך']);
  for (const t of destData.tarbutu) {
    aoa.push([str(t.name), str(t.days), str(t.price), str(t.date)]);
  }
  aoa.push([]);
  aoa.push(['מתחרים']);
  aoa.push(['חברה', 'שם הטיול', 'ימים', 'מחיר', 'תאריך', 'הערות', 'קישור']);
  for (const t of destData.competitors) {
    let note = str(t.note);
    if (t.guaranteed) note = 'מובטח' + (note ? '; ' + note : '');
    const link = t.url || COMPANY_URL[t.company] || '';
    aoa.push([
      str(t.company),
      str(t.name),
      str(t.days),
      str(t.price),
      str(t.date),
      note,
      link ? 'קישור' : '',
    ]);
  }
  return aoa;
}

function applySheetFormat(ws, destData) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const linkCol = 6;
  const firstCompetitorRow = 5 + (destData.tarbutu ? destData.tarbutu.length : 0);
  for (let i = 0; i < (destData.competitors || []).length; i++) {
    const r = firstCompetitorRow + i;
    const url = destData.competitors[i].url || COMPANY_URL[destData.competitors[i].company];
    if (url) {
      const ref = XLSX.utils.encode_cell({ r, c: linkCol });
      if (ws[ref]) ws[ref].l = { Target: url };
    }
  }
  ws['!rtl'] = true;
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const ref = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[ref];
      if (!cell) continue;
      cell.s = {
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: {
          top: { style: 'thin' }, bottom: { style: 'thin' },
          left: { style: 'thin' }, right: { style: 'thin' },
        },
      };
    }
  }
}

const sheetNames = {
  'שייט נהרות – רון, סיין, דורדון, ריין': 'שייט נהרות',
};

const wb = XLSX.utils.book_new();

// Summary sheet first
const summaryAoa = [];
summaryAoa.push(['סיכום תרבותו', '', '', '']);
summaryAoa.push([]);
summaryAoa.push(['טיולים יבשתיים']);
summaryAoa.push(['שם הטיול', 'ימים', 'תאריך', 'יעד', 'מחיר']);
for (const t of fullScan.tarbutu.land_tours) {
  summaryAoa.push([str(t.name), str(t.days), str(t.date), str(t.destination), 'לפי פנייה']);
}
summaryAoa.push([]);
summaryAoa.push(['קרוז ים']);
summaryAoa.push(['שם הטיול', 'ימים', 'תאריך', 'יעד', 'מחיר']);
for (const t of fullScan.tarbutu.sea_cruises) {
  summaryAoa.push([str(t.name), str(t.days), str(t.date), str(t.destination || t.category), 'לפי פנייה']);
}
summaryAoa.push([]);
summaryAoa.push(['שייט נהרות']);
summaryAoa.push(['שם הטיול', 'ימים', 'תאריך', 'ספינה', 'מחיר']);
for (const t of fullScan.tarbutu.river_cruises) {
  summaryAoa.push([str(t.name), str(t.days), str(t.date), str(t.ship || t.ships), 'לפי פנייה']);
}
const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa);
XLSX.utils.book_append_sheet(wb, wsSummary, 'סיכום תרבותו');

// One sheet per destination
for (const [destKey, destData] of Object.entries(comparison.destinations)) {
  const title = sheetNames[destKey] || destKey.slice(0, 31);
  const aoa = buildSheetData(destData);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  applySheetFormat(ws, destData);
  XLSX.utils.book_append_sheet(wb, ws, title);
}

// RTL for summary sheet
wsSummary['!rtl'] = true;
const sumRange = XLSX.utils.decode_range(wsSummary['!ref'] || 'A1');
for (let R = sumRange.s.r; R <= sumRange.e.r; R++) {
  for (let C = sumRange.s.c; C <= sumRange.e.c; C++) {
    const ref = XLSX.utils.encode_cell({ r: R, c: C });
    const cell = wsSummary[ref];
    if (cell) cell.s = { alignment: { horizontal: 'center', vertical: 'center' }, border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } } };
  }
}

XLSX.writeFile(wb, outPath);
console.log('נוצר:', outPath);
