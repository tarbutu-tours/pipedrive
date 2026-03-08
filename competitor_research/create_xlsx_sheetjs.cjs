// Create השוואת_טיולים_לפי_יעד.xlsx – בסגנון דוגמה: כותרת בולטת, גושי טבלאות, מסגרות, יישור למרכז, RTL
// Run from project root: node competitor_research/create_xlsx_sheetjs.cjs
const fs = require('fs');
const path = require('path');
let XLSX;
try {
  XLSX = require('xlsx-js-style');
} catch (e) {
  try {
    XLSX = require('xlsx');
  } catch (e2) {
    try {
      XLSX = require('../node_modules/xlsx-js-style');
    } catch (e3) {
      XLSX = require('../node_modules/xlsx');
    }
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

const COMPANY_URL = { 'קרוזתור': 'https://cruise.co.il/', 'קשרי תעופה': 'https://www.kishrey-teufa.co.il/cruise.html', 'גולדן טורס': 'https://www.goldentours.co.il/kosher-cruise/', 'מנו ספנות': 'https://cruise.mano.co.il/', 'מסעות': 'https://www.masaot.co.il/' };

const cellStyle = {
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: {
    top: { style: 'thin' }, bottom: { style: 'thin' },
    left: { style: 'thin' }, right: { style: 'thin' },
  },
};

const headerStyle = {
  ...cellStyle,
  fill: { fgColor: { rgb: 'D4EDDA' } },
  font: { bold: true },
};

const titleStyle = {
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  fill: { fgColor: { rgb: '92D050' } },
  font: { bold: true, sz: 14 },
  border: {
    top: { style: 'thin' }, bottom: { style: 'thin' },
    left: { style: 'thin' }, right: { style: 'thin' },
  },
};

function setCellStyle(cell, style) {
  if (cell && style) cell.s = style;
}

function buildSheetData(destKey, destData) {
  const aoa = [];
  const titleText = 'השוואת מחירים ומתחרים – ' + destKey;
  aoa.push([titleText]); // row 0 – ימורח אחר כך
  aoa.push([]); // row 1 – רווח
  aoa.push(['תרבותו']); // row 2
  aoa.push(['שם הטיול', 'ימים', 'מחיר', 'תאריך']); // row 3
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

function applySheetFormat(ws, destKey, destData) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const linkCol = 6;
  const firstCompetitorRow = 5 + (destData.tarbutu ? destData.tarbutu.length : 0);

  ws['!rtl'] = true;

  const tarbutuLen = destData.tarbutu ? destData.tarbutu.length : 0;
  const headerRows = new Set([0, 2, 3, 5 + tarbutuLen, 6 + tarbutuLen]);
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const ref = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[ref];
      if (!cell) continue;
      if (R === 0) setCellStyle(cell, titleStyle);
      else if (headerRows.has(R)) setCellStyle(cell, headerStyle);
      else setCellStyle(cell, cellStyle);
    }
  }

  for (let i = 0; i < (destData.competitors || []).length; i++) {
    const r = firstCompetitorRow + i;
    const url = destData.competitors[i].url || COMPANY_URL[destData.competitors[i].company];
    if (url) {
      const ref = XLSX.utils.encode_cell({ r, c: linkCol });
      if (ws[ref]) ws[ref].l = { Target: url };
    }
  }

  if (!ws['!merges']) ws['!merges'] = [];
  ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(6, range.e.c) } });
}

const sheetNames = {
  'שייט נהרות – רון, סיין, דורדון, ריין': 'שייט נהרות',
};

const wb = XLSX.utils.book_new();

// ---- גיליון סיכום תרבותו ----
const summaryAoa = [];
summaryAoa.push(['השוואת מחירים ומתחרים – סיכום תרבותו']);
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
wsSummary['!rtl'] = true;
if (!wsSummary['!merges']) wsSummary['!merges'] = [];
wsSummary['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } });
const sumRange = XLSX.utils.decode_range(wsSummary['!ref'] || 'A1');
const landLen = fullScan.tarbutu.land_tours?.length || 0;
const seaLen = fullScan.tarbutu.sea_cruises?.length || 0;
const sumHeaderRows = new Set([0, 2, 3, 5 + landLen, 6 + landLen, 8 + landLen + seaLen, 9 + landLen + seaLen]);
for (let R = sumRange.s.r; R <= sumRange.e.r; R++) {
  for (let C = sumRange.s.c; C <= sumRange.e.c; C++) {
    const ref = XLSX.utils.encode_cell({ r: R, c: C });
    const cell = wsSummary[ref];
    if (!cell) continue;
    if (R === 0) setCellStyle(cell, titleStyle);
    else if (sumHeaderRows.has(R)) setCellStyle(cell, headerStyle);
    else setCellStyle(cell, cellStyle);
  }
}
XLSX.utils.book_append_sheet(wb, wsSummary, 'סיכום תרבותו');

// ---- גיליון לכל יעד ----
for (const [destKey, destData] of Object.entries(comparison.destinations)) {
  const title = sheetNames[destKey] || destKey.slice(0, 31);
  const aoa = buildSheetData(destKey, destData);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  applySheetFormat(ws, destKey, destData);
  XLSX.utils.book_append_sheet(wb, ws, title);
}

XLSX.writeFile(wb, outPath);
console.log('נוצר:', outPath);
