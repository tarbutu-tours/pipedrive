// Local server: open dashboard, click button to run full scan (no Cursor approval needed).
// Run from project root: node competitor_research/server.cjs
// Then open http://localhost:3747 in browser.
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PORT = 3747;
const CR = path.resolve(__dirname);
const ROOT = path.resolve(__dirname, '..');

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(path.join(CR, 'dashboard.html'), 'utf8'));
    return;
  }
  if (req.method === 'POST' && req.url === '/run-scan') {
    const child = spawn('node', ['competitor_research/run_full_scan.cjs'], { cwd: ROOT, shell: true });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: code === 0,
        error: code !== 0 ? ('Exit ' + code + '\n' + out) : null,
        path: code === 0 ? path.join(CR, 'השוואת_טיולים_לפי_יעד.xlsx') : null,
      }));
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log('Dashboard: http://localhost:' + PORT);
  console.log('Press Ctrl+C to stop.');
});
