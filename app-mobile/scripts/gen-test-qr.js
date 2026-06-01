// One-off: render a linky:// deep-link as a PNG QR for on-screen scan testing.
//
// Usage: node scripts/gen-test-qr.js <orderId> <scanToken> [outputPath]
//
// The scanToken is the secret printed inside the QR (per the QR-gate migration
// 20260601_03). Without the token, the buyer scanning this QR would hit the
// server-side INVALID_SCAN_TOKEN gate. The script does NOT fetch the token
// itself (would need SUPABASE_SERVICE_ROLE_KEY in .env which isn't there) —
// the calling workflow (Claude) queries the DB via MCP and passes the token
// explicitly. If/when SUPABASE_SERVICE_ROLE_KEY lands in .env, this script
// can be extended to auto-fetch by orderId.
const fs = require('node:fs');
const path = require('node:path');
const QRCode = require('qrcode');

const orderId = process.argv[2];
const scanToken = process.argv[3];

if (!orderId || !scanToken) {
  console.error('Usage: node scripts/gen-test-qr.js <orderId> <scanToken> [outputPath]');
  console.error('');
  console.error('Fetch the token via SQL:');
  console.error('  SELECT scan_token FROM public.orders WHERE id = \'<orderId>\';');
  console.error('');
  console.error('Or ask Claude to run via MCP:');
  console.error('  mcp__supabase-linky__execute_sql with query:');
  console.error('    "select scan_token from public.orders where id=\'<orderId>\'"');
  console.error('  then re-run this script with the returned token as the 2nd arg.');
  process.exit(1);
}

const UUID_RE = /^[0-9a-f-]{36}$/i;
if (!UUID_RE.test(orderId)) {
  console.error(`Invalid orderId — must be a 36-char UUID. Got: ${orderId}`);
  process.exit(1);
}
if (!UUID_RE.test(scanToken)) {
  console.error(`Invalid scanToken — must be a 36-char UUID. Got: ${scanToken}`);
  process.exit(1);
}

const url = `linky://order/${orderId}/confirm?token=${scanToken}`;
const out = process.argv[4] || path.join(__dirname, `test-qr-${orderId}.png`);

QRCode.toFile(out, url, {
  width: 600,
  margin: 2,
  errorCorrectionLevel: 'M',
  color: { dark: '#000000', light: '#FFFFFF' },
}, (err) => {
  if (err) {
    console.error('QR generation failed:', err);
    process.exit(1);
  }
  const stat = fs.statSync(out);
  console.log(`Wrote ${out} (${stat.size} bytes)`);
  console.log(`Encodes: ${url}`);
});
