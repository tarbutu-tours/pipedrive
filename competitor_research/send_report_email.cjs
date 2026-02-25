// Run full scan, build Excel, send report by email. For Task Scheduler every 3 days.
// Run from project root: node competitor_research/send_report_email.cjs
// Set config.json email section (to, smtp_user, smtp_password, etc.).
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const CR = path.resolve(__dirname);
const ROOT = path.resolve(__dirname, '..');

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd: cwd || CR, stdio: 'inherit', shell: true });
  if (r.status !== 0) throw new Error(`${cmd} exited ${r.status}`);
}

console.log('Running full scan...');
try {
  run('node', ['competitor_research/run_full_scan.cjs'], ROOT);
} catch (e) {
  console.warn('Scan error:', e.message);
}

const configPath = path.join(CR, 'config.json');
if (!fs.existsSync(configPath)) {
  console.log('No config.json – skip email. Copy config.example.json to config.json and set email.');
  process.exit(0);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const email = config.email || {};
const to = (email.to || '').trim();
if (!to || to === 'YOUR_EMAIL@example.com') {
  console.log('Set config.json email.to to receive reports.');
  process.exit(0);
}

const nodemailerPath = path.join(ROOT, 'node_modules', 'nodemailer');
let transporter;
try {
  const nodemailer = require('nodemailer');
  transporter = nodemailer.createTransport({
    host: email.smtp_host || 'smtp.gmail.com',
    port: parseInt(email.smtp_port || '587', 10),
    secure: false,
    auth: { user: email.smtp_user, pass: email.smtp_password },
  });
} catch (e) {
  console.log('Install nodemailer: npm install nodemailer');
  process.exit(1);
}

const xlsxPath = path.join(CR, 'השוואת_טיולים_לפי_יעד.xlsx');
const date = new Date().toLocaleDateString('he-IL');
const subject = 'דוח השוואת טיולים – ' + date;

const mailOptions = {
  from: (email.from_name || 'Competitor Research') + ' <' + (email.smtp_user || '') + '>',
  to,
  subject,
  text: 'דוח השוואת טיולים מצורף. נוצר: ' + date,
  attachments: fs.existsSync(xlsxPath) ? [{ filename: 'השוואת_טיולים_לפי_יעד.xlsx', content: fs.readFileSync(xlsxPath) }] : [],
};

transporter.sendMail(mailOptions, (err, info) => {
  if (err) {
    console.error('Email failed:', err.message);
    process.exit(1);
  }
  console.log('Email sent to', to);
});
