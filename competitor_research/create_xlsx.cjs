// Create השוואת_טיולים_לפי_יעד.xlsx using JSZip (run: node create_xlsx.cjs)
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const BASE = __dirname;
const outPath = path.join(BASE, 'השוואת_טיולים_לפי_יעד.xlsx');

function escapeXml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colLetter(i) {
  if (i < 26) return String.fromCharCode(65 + i);
  return colLetter(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26));
}

const comparison = JSON.parse(fs.readFileSync(path.join(BASE, 'comparison_by_destination.json'), 'utf8'));
const fullScan = JSON.parse(fs.readFileSync(path.join(BASE, 'full_scan_results.json'), 'utf8'));

const strings = [];
function si(s) {
  const idx = strings.length;
  strings.push(escapeXml(s));
  return idx;
}

function buildSheetRows(destData) {
  const rows = [];
  rows.push([si('תרבותו')]);
  rows.push([si('שם הטיול'), si('ימים'), si('מחיר'), si('תאריך')]);
  for (const t of destData.tarbutu) {
    rows.push([
      si(t.name || ''),
      si(String(t.days ?? '')),
      si(String(t.price ?? '')),
      si(String(t.date ?? '')),
    ]);
  }
  rows.push([]);
  rows.push([si('מתחרים')]);
  rows.push([si('חברה'), si('שם הטיול'), si('ימים'), si('מחיר'), si('תאריך'), si('הערות')]);
  for (const t of destData.competitors) {
    let note = t.note || '';
    if (t.guaranteed) note = 'מובטח' + (note ? '; ' + note : '');
    rows.push([
      si(String(t.company ?? '')),
      si(String(t.name ?? '')),
      si(String(t.days ?? '')),
      si(String(t.price ?? '')),
      si(String(t.date ?? '')),
      si(note),
    ]);
  }
  return rows;
}

const sheetNames = {
  'שייט נהרות – רון, סיין, דורדון, ריין': 'שייט נהרות',
};

const allSheets = [];
for (const [destKey, destData] of Object.entries(comparison.destinations)) {
  const title = sheetNames[destKey] || destKey.slice(0, 31);
  allSheets.push({ title, rows: buildSheetRows(destData) });
}

// Summary sheet
const summaryRows = [];
summaryRows.push([si('סיכום תרבותו'), si(''), si(''), si('')]);
summaryRows.push([]);
summaryRows.push([si('טיולים יבשתיים')]);
summaryRows.push([si('שם הטיול'), si('ימים'), si('תאריך'), si('יעד'), si('מחיר')]);
for (const t of fullScan.tarbutu.land_tours) {
  summaryRows.push([si(t.name), si(String(t.days || '')), si(String(t.date || '')), si(String(t.destination || '')), si('לפי פנייה')]);
}
summaryRows.push([]);
summaryRows.push([si('קרוז ים')]);
summaryRows.push([si('שם הטיול'), si('ימים'), si('תאריך'), si('יעד'), si('מחיר')]);
for (const t of fullScan.tarbutu.sea_cruises) {
  summaryRows.push([si(t.name), si(String(t.days || '')), si(String(t.date || '')), si(String(t.destination || t.category || '')), si('לפי פנייה')]);
}
summaryRows.push([]);
summaryRows.push([si('שייט נהרות')]);
summaryRows.push([si('שם הטיול'), si('ימים'), si('תאריך'), si('ספינה'), si('מחיר')]);
for (const t of fullScan.tarbutu.river_cruises) {
  summaryRows.push([si(t.name), si(String(t.days || '')), si(String(t.date || '')), si(String(t.ship || t.ships || '')), si('לפי פנייה')]);
}
allSheets.unshift({ title: 'סיכום תרבותו', rows: summaryRows });

function sheetToXml(rows) {
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  let out = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  out += `<worksheet xmlns="${ns}"><sheetData>`;
  rows.forEach((row, rIdx) => {
    if (!row.length) return;
    const r = rIdx + 1;
    out += `<row r="${r}">`;
    row.forEach((sIdx, cIdx) => {
      if (typeof sIdx !== 'number') return;
      out += `<c r="${colLetter(cIdx)}${r}" t="s"><v>${sIdx}</v></c>`;
    });
    out += '</row>';
  });
  out += '</sheetData></worksheet>';
  return out;
}

const sstItems = strings.map(s => `<si><t>${s}</t></si>`).join('');
const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${sstItems}</sst>`;

const zip = new JSZip();
const ct = ['<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
  '<Default Extension="xml" ContentType="application/xml"/>',
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'];
for (let i = 1; i <= allSheets.length; i++) {
  ct.push(`<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
}
ct.push('<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>');
zip.file('[Content_Types].xml', ct.join('\n'));
zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml" Id="rId1"/>
</Relationships>`);

const sheetsXml = allSheets.map((_, i) => `<sheet name="${escapeXml(allSheets[i].title)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
const rels = allSheets.map((_, i) => `<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml" Id="rId${i + 1}"/>`).join('\n');
const rid = allSheets.length + 1;
zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets>${sheetsXml}</sheets></workbook>`);
zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${rels}
<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml" Id="rId${rid}"/>
</Relationships>`);
zip.file('xl/sharedStrings.xml', sharedStringsXml);
allSheets.forEach((sh, i) => {
  zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetToXml(sh.rows));
});

zip.generateAsync({ type: 'nodebuffer' }).then(buf => {
  fs.writeFileSync(outPath, buf);
  console.log('נוצר:', outPath);
});
