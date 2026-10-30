#!/usr/bin/env node
/**
 * ქადაგებების გაზიარების გვერდები — s/<ID>.html.
 *
 * Facebook, Messenger, Viber და Telegram ბმულის ბარათს HTML-ის <head>-იდან
 * აწყობენ და JavaScript-ს არ უშვებენ. sermons.html?s=<ID> ყველასთვის
 * ერთნაირ, ზოგად ბარათს აჩვენებდა. აქ თითოეულ ქადაგებას თავისი პატარა
 * ფაილი აქვს საკუთარი სათაურითა და ყდით; ადამიანს კი ის მაშინვე
 * ქადაგებების გვერდზე გადაიყვანს, სადაც ეს ქადაგება იხსნება.
 *
 * ორი რამ განზრახაა:
 *  - og:url ამ ფაილზე მიუთითებს. sermons.html-ზე რომ მიეთითებინა,
 *    Facebook იქ გადავიდოდა და ისევ ზოგად ბარათს აიღებდა.
 *  - გადამისამართება მხოლოდ JavaScript-ითაა, <meta refresh>-ის გარეშე —
 *    ზოგი რობოტი refresh-ს მიჰყვება და ბარათს სამიზნე გვერდიდან აწყობს.
 *
 * წყარო data/sermon-archive.json-ია; ფაილებს არქივის სამუშაო ყოველი
 * განახლების შემდეგ თავიდან ადგენს. არქივიდან გამქრალი ქადაგების
 * ფაილი იშლება.
 *
 * გაშვება:  node scripts/build-share-pages.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const SITE_BASE = 'https://efckutaisi.ge/';
const ROOT = path.join(__dirname, '..');
const ARCHIVE = path.join(ROOT, 'data', 'sermon-archive.json');
const OUT_DIR = path.join(ROOT, 's');

const KA_MONTHS = [
  'იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი',
  'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'
];

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// იგივე წესი, რაც საიტზე (sanity-fetch.js → splitSermonTitle).
function splitTitle(raw, isoDate) {
  const text = (raw || '').replace(/\s+/g, ' ').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate || '');
  const fallback = m ? `${Number(m[3])} ${KA_MONTHS[Number(m[2]) - 1]}, ${m[1]}` : '';
  const i = text.lastIndexOf('|');
  if (i > 0) {
    const title = text.slice(0, i).trim();
    const tail = text.slice(i + 1).trim();
    // „|“-ის შემდეგ ზოგჯერ მქადაგებელია და არა თარიღი.
    const isDate = /\d/.test(tail) && KA_MONTHS.some(k => tail.indexOf(k) !== -1);
    if (title && isDate) return { title, date: tail };
    if (title && tail) return { title, date: fallback };
  }
  return { title: text, date: fallback };
}

// HD ყდა ყველა ვიდეოს არ აქვს. ყალბი ბარათი რომ არ გამოვიდეს, ერთხელ
// ვამოწმებთ და პასუხს ფაილშივე ვინახავთ — შემდეგ ჯერზე ქსელს აღარ ვეკითხებით.
function hasMaxres(id) {
  return new Promise(resolve => {
    const req = https.request(
      { method: 'HEAD', host: 'i.ytimg.com', path: '/vi/' + encodeURIComponent(id) + '/maxresdefault.jpg', timeout: 8000 },
      res => {
        res.resume();
        // ნაცრისფერი 120×90 სურათი ~1 KB-ია, ნამდვილი ყდა — ათეულობით KB.
        const size = Number(res.headers['content-length'] || 0);
        resolve(res.statusCode === 200 && (!size || size > 5000));
      }
    );
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
    req.end();
  });
}

function previousImage(file) {
  try {
    const m = /<meta property="og:image" content="([^"]+)"/.exec(fs.readFileSync(file, 'utf8'));
    return m ? m[1] : null;
  } catch (e) { return null; }
}

function page(sermon, image, hd) {
  const id = sermon.id;
  const parts = splitTitle(sermon.title, sermon.date);
  const url = SITE_BASE + 's/' + encodeURIComponent(id) + '.html';
  const target = '../pages/sermons.html?s=' + encodeURIComponent(id);
  const description = (parts.date ? parts.date + ' · ' : '') + 'ქადაგება — სახარების რწმენის ეკლესია, ქუთაისი';
  const w = hd ? 1280 : 480;
  const h = hd ? 720 : 360;
  const t = escapeHtml(parts.title);

  return `<!DOCTYPE html>
<html lang="ka">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${t} – სახარების რწმენის ეკლესია</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="${url}">
<meta property="og:type" content="video.other">
<meta property="og:site_name" content="სახარების რწმენის ეკლესია – ქუთაისი">
<meta property="og:locale" content="ka_GE">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="${w}">
<meta property="og:image:height" content="${h}">
<meta property="og:image:alt" content="${t}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${image}">
<link rel="icon" type="image/svg+xml" href="../pages/images/logo.svg">
<script>
// ?t= (წუთიდან გაზიარება) გადავცემთ, რომ ქადაგება იქიდან დაიწყოს.
var q = location.search.replace(/^\\?/, '');
location.replace('${target}' + (q ? '&' + q : ''));
</script>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:'Noto Sans Georgian',sans-serif;background:#fdfbf7;color:#222;text-align:center;padding:16px}a{color:#96823f}</style>
</head>
<body>
<p>ქადაგება იხსნება…<br><a href="${target}">${t}</a></p>
</body>
</html>
`;
}

(async function main() {
  const archive = JSON.parse(fs.readFileSync(ARCHIVE, 'utf8'));
  const sermons = Object.values(archive.years || {}).flat().filter(s => s && /^[\w-]{11}$/.test(s.id));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let written = 0;
  let checked = 0;
  const keep = new Set();
  for (const sermon of sermons) {
    const file = path.join(OUT_DIR, sermon.id + '.html');
    keep.add(path.basename(file));

    let image = previousImage(file);
    if (!image) {
      checked++;
      image = 'https://i.ytimg.com/vi/' + sermon.id + ((await hasMaxres(sermon.id)) ? '/maxresdefault.jpg' : '/hqdefault.jpg');
    }
    const html = page(sermon, image, image.endsWith('/maxresdefault.jpg'));

    let old = null;
    try { old = fs.readFileSync(file, 'utf8'); } catch (e) { /* ახალია */ }
    if (old !== html) { fs.writeFileSync(file, html); written++; }
  }

  let removed = 0;
  for (const name of fs.readdirSync(OUT_DIR)) {
    if (name.endsWith('.html') && !keep.has(name)) { fs.unlinkSync(path.join(OUT_DIR, name)); removed++; }
  }

  console.log(`გაზიარების გვერდები: ${sermons.length} ქადაგება, ჩაიწერა ${written}, წაიშალა ${removed}, ყდა შემოწმდა ${checked}`);
})();
