// One-off renderer: WORK_PLAN.md -> WORK_PLAN.html
// Wraps marked output in a styled shell that matches the navy/saffron client-facing artifact identity.
const fs = require('node:fs');
const path = require('node:path');
const { marked } = require('marked');

const root = path.resolve(__dirname, '..');
const mdPath = path.join(root, 'WORK_PLAN.md');
const htmlPath = path.join(root, 'WORK_PLAN.html');

const md = fs.readFileSync(mdPath, 'utf8');
const bodyHtml = marked.parse(md, { gfm: true, breaks: false });

const css = `
:root {
  --navy: #1F4E7A;
  --navy-deep: #14304D;
  --navy-soft: #E8EFF6;
  --saffron: #E8A53D;
  --saffron-soft: #FBEDD3;
  --cream: #F4F6F9;
  --deep: #0F1A26;
  --text: #2A323D;
  --text-muted: #6B7480;
  --border: #C9D2DC;
  --border-soft: #DDE3EB;
  --green: #1E7A4D;
  --green-soft: #E5F2EC;
  --rust: #B23A48;
  --rust-soft: #F6E0E3;
}
@page { size: A4; margin: 14mm 14mm 14mm 14mm; }
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; background: #fff; color: var(--text);
  font-family: -apple-system, "Segoe UI", "Inter", Roboto, sans-serif;
  font-size: 9.5pt; line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
.page { max-width: 180mm; margin: 0 auto; padding: 0; }
h1 {
  font-size: 19pt; font-weight: 800; color: var(--navy);
  letter-spacing: -0.3px; margin: 0 0 6px 0;
  padding-bottom: 6px; border-bottom: 1.5px solid var(--navy);
}
h2 {
  font-size: 12pt; font-weight: 700; color: var(--navy-deep);
  margin: 18px 0 8px 0; padding-bottom: 4px;
  border-bottom: 1.5px solid var(--border-soft);
  letter-spacing: -0.15px;
}
h3 {
  font-size: 10.5pt; font-weight: 700; color: var(--navy-deep);
  margin: 14px 0 6px 0; letter-spacing: -0.1px;
}
h4 {
  font-size: 9.5pt; font-weight: 700; color: var(--deep);
  margin: 10px 0 4px 0;
}
p { margin: 4px 0 8px 0; }
strong { font-weight: 700; color: var(--deep); }
em { color: var(--saffron); font-style: italic; font-weight: 600; }
hr {
  border: 0; border-top: 1px solid var(--border-soft);
  margin: 14px 0;
}
code {
  font-family: "JetBrains Mono", "Consolas", monospace; font-size: 8.6pt;
  background: var(--cream); color: var(--deep);
  padding: 1px 5px; border-radius: 3px; border: 1px solid var(--border-soft);
}
ul, ol { margin: 4px 0 8px 0; padding-left: 22px; }
li { margin-bottom: 3px; font-size: 9.2pt; line-height: 1.45; }
li > p { margin: 2px 0; }

/* Checklist boxes: GFM task list items */
li.task-list-item, ul.contains-task-list > li {
  list-style: none; position: relative; padding-left: 0;
}
input[type="checkbox"] {
  margin-right: 6px; transform: translateY(1px);
}

blockquote {
  margin: 6px 0 10px 0; padding: 6px 12px;
  border-left: 4px solid var(--saffron);
  background: var(--saffron-soft);
  font-size: 9pt; color: var(--deep);
}

table {
  width: 100%; border-collapse: collapse; font-size: 8.8pt;
  margin: 6px 0 12px 0;
}
thead th {
  background: var(--navy-soft); color: var(--navy-deep);
  text-align: left; font-weight: 700; padding: 6px 9px;
  font-size: 8.4pt; letter-spacing: 0.04em;
  border-bottom: 1.5px solid var(--border);
}
tbody td {
  padding: 5px 9px; border-bottom: 1px solid var(--border-soft);
  vertical-align: top; line-height: 1.4;
}
tbody tr:last-child td { border-bottom: none; }

/* Highlight DONE / PENDING / PARTIAL tags inline in h3 */
h3:has(+ p), h3 { /* no-op selector to keep file valid */ }

.brand-header {
  display: flex; justify-content: space-between; align-items: flex-end;
  padding-bottom: 8px; margin-bottom: 14px;
  border-bottom: 2px solid var(--navy);
}
.brand-header .title { font-size: 18pt; font-weight: 800; color: var(--navy); letter-spacing: -0.3px; }
.brand-header .title .ver { font-size: 11pt; color: var(--saffron); margin-left: 6px; font-weight: 700; }
.brand-header .meta { text-align: right; font-size: 9pt; color: var(--text-muted); line-height: 1.4; }
.brand-header .meta .name { font-weight: 700; color: var(--navy); font-size: 10pt; }
`;

const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Linky — Work Plan to V1 (v3)</title>
<style>${css}</style>
</head>
<body>
<div class="page">
<div class="brand-header">
  <div class="title">Linky <span class="ver">v3</span></div>
  <div class="meta">
    <div class="name">Achraf Benamrane</div>
    <div>1 June 2026 · Pre-meeting update</div>
  </div>
</div>
${bodyHtml}
</div>
</body>
</html>
`;

fs.writeFileSync(htmlPath, html, 'utf8');
console.log(`Wrote ${htmlPath} (${html.length} bytes from ${md.length} md bytes)`);
