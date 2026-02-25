// Full pipeline: scraper -> enrich -> Excel. Run from project root.
// Usage: node competitor_research/run_full_scan.cjs
const path = require('path');
const { spawnSync } = require('child_process');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const CR = path.join(ROOT, 'competitor_research');

function function run(cmd, args, opts) {
  const cwd = (opts && opts.cwd) || CR;
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: true });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited ${r.status}`);
}

console.log('1/3 Running Python scraper (מנו, קרוזתור, מסעות)...');
try {
  run('python', ['scraper.py'], { cwd: CR });
} catch (e) {
  console.warn('Scraper failed (optional):', e.message);
}

console.log('2/3 Enriching comparison data...');
run('node', ['enrich_competitors.cjs'], { cwd: CR });

console.log('3/3 Building Excel...');
run('node', ['create_xlsx_sheetjs.cjs'], { cwd: CR });

const xlsxPath = path.join(CR, 'השוואת_טיולים_לפי_יעד.xlsx');
if (fs.existsSync(xlsxPath)) {
  console.log('Done. File:', xlsxPath);
}
