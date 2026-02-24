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

function buildSheetData(destData) {
  const aoa = [];
  aoa.push(['תרבותו']);
  aoa.push(['שם הטיול', 'ימים', 'מחיר', 'תאריך']);
  for (const t of destData.tarbutu) {
    aoa.push([str(t.name), str(t.days), str(t.price), str(t.date)]);
  }
  aoa.push([]);
  aoa.push(['מתחרים']);
  aoa.push(['חברה', 'שם הטיול', 'ימים', 'מחיר', 'תאריך', 'הערות']);
  for (const t of destData.competitors) {
    let note = str(t.note);
    if (t.guaranteed) note = 'מובטח' + (note ? '; ' + note : '');
    aoa.push([
      str(t.company),
      str(t.name),
      str(t.days),
      str(t.price),
      str(t.date),
      note,
    ]);
  }
  return aoa;
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
  XLSX.utils.book_append_sheet(wb, ws, title);
}

XLSX.writeFile(wb, outPath);
console.log('נוצר:', outPath);
