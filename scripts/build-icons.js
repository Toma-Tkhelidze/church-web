#!/usr/bin/env node
/**
 * ხატულების შრიფტი (Font Awesome 6.4.0) — მხოლოდ ის ხატულები, რასაც საიტი იყენებს.
 *
 * სრული Font Awesome CDN-იდან ყოველ გვერდზე ~280 KB-ს ტვირთავდა (სამი შრიფტი
 * 2000-ზე მეტი ხატულით), საიტი კი ~110-ს იყენებს. ეს სკრიპტი საიტის კოდს
 * ათვალიერებს, პოულობს გამოყენებულ ხატულებს (fa-house, fa-play…) და აწყობს:
 *   icons.css              — Font Awesome-ის CSS მხოლოდ ამ ხატულებით
 *   fonts/fa/*.woff2       — სამი შრიფტი, მხოლოდ ამ ხატულების გლიფებით
 * ხატულები იგივეა (იგივე ფაილებიდანაა ამოჭრილი), იერი არ იცვლება.
 *
 * ახალი ხატულის დამატებისას (ნებისმიერ გვერდზე ან სკრიპტში) ეს უნდა
 * გაეშვას თავიდან — თორემ ის ხატულა ცარიელ კვადრატად გამოჩნდება:
 *   npm install --no-save subset-font
 *   node scripts/build-icons.js
 * GitHub ამას ყოველ push-ზე ამოწმებს (check-icons.yml → --check) და
 * გამოტოვებულ ხატულაზე მეილს აგზავნის.
 *
 *   node scripts/build-icons.js --check   მხოლოდ შემოწმება, დამოკიდებულებების გარეშე
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const FA_VERSION = '6.4.0';
const CDN = `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/${FA_VERSION}/`;
const FONTS = ['fa-solid-900', 'fa-regular-400', 'fa-brands-400'];
const OUT_CSS = path.join(ROOT, 'icons.css');
const OUT_DIR = path.join(ROOT, 'fonts', 'fa');

// fa-solid/fa-regular/fa-brands და ზომა-ანიმაციის კლასები ხატულები არ არიან.
// „/“-ის შემდეგ მდგომი ფაილის სახელია (fonts/fa/fa-solid-900.woff2) და არა კლასი.
const NAME = /(?<![\w/.-])fa-([a-z0-9]+(?:-[a-z0-9]+)*)/g;
// CSS-ში პირდაპირ ჩაწერილი ხატულა: content: "\f025" (Font Awesome-ის კოდები E000–F8FF-შია).
const CSS_GLYPH = /content:\s*["']\\([ef][0-9a-f]{3})["']/gi;

// საიტის ფაილები, სადაც ხატულა შეიძლება ეწეროს.
function siteFiles() {
  const list = ['index.html', '404.html', 'offline.html', 'style.css'];
  fs.readdirSync(path.join(ROOT, 'pages')).filter(f => f.endsWith('.html')).forEach(f => list.push('pages/' + f));
  fs.readdirSync(ROOT).filter(f => f.endsWith('.js')).forEach(f => list.push(f));
  fs.readdirSync(path.join(ROOT, 'data')).filter(f => f.endsWith('.json')).forEach(f => list.push('data/' + f));
  return list.filter(f => fs.existsSync(path.join(ROOT, f)));
}

function scanSite() {
  const names = new Map();   // სახელი → სად შეგვხვდა
  const glyphs = new Map();  // კოდი → სად შეგვხვდა
  for (const file of siteFiles()) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of text.matchAll(NAME)) if (!names.has(m[1])) names.set(m[1], file);
    for (const m of text.matchAll(CSS_GLYPH)) if (!glyphs.has(m[1].toLowerCase())) glyphs.set(m[1].toLowerCase(), file);
  }
  return { names, glyphs };
}

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode + ' — ' + url)); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

// CSS-ს ზედა დონის ბლოკებად ვჭრით (@keyframes-ის შიგნით ფრჩხილებს ვითვლით).
function topLevelBlocks(css) {
  const blocks = [];
  let depth = 0, start = 0, quote = null;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) { blocks.push(css.slice(start, i + 1).trim()); start = i + 1; }
  }
  return blocks.filter(Boolean);
}

// .fa-house:before,.fa-home:before{content:"\f015"} → ['house','home'], 'f015'
function iconRule(block) {
  const m = /^((?:\.fa-[a-z0-9-]+:{1,2}(?:before|after),?)+)\{content:"\\([0-9a-f]+)"\}$/i.exec(block.replace(/\s+/g, ''));
  if (!m) return null;
  return { names: [...m[1].matchAll(/\.fa-([a-z0-9-]+):/g)].map(x => x[1]), code: m[2].toLowerCase() };
}

// ── შემოწმება: ყველა გამოყენებული ხატულა icons.css-შია? ─────────────
function check() {
  if (!fs.existsSync(OUT_CSS)) { console.log('❌ icons.css არ არსებობს — გაუშვი node scripts/build-icons.js'); process.exitCode = 1; return; }
  const css = fs.readFileSync(OUT_CSS, 'utf8');
  // icons.css-ში ყველა .fa-* კლასი ცნობილია (ხატულებიც და fa-solid/fa-spin-ის მსგავსი კლასებიც).
  const known = new Set([...css.matchAll(/\.fa-([a-z0-9-]+)/g)].map(m => m[1]));
  const manifest = /codepoints: ([0-9a-f, ]+)/.exec(css);
  const codes = new Set(manifest ? manifest[1].split(/[ ,]+/).filter(Boolean) : []);
  const { names, glyphs } = scanSite();
  const missing = [...names].filter(([n]) => !known.has(n)).map(([n, f]) => `fa-${n} (${f})`)
    .concat([...glyphs].filter(([c]) => !codes.has(c)).map(([c, f]) => `\\${c} (${f})`));
  if (missing.length) {
    console.log('❌ ეს ხატულები icons.css-ში არ არის და საიტზე ცარიელ კვადრატად ჩანს:\n  ' + missing.join('\n  ') +
      '\nგამოსწორება: npm install --no-save subset-font && node scripts/build-icons.js — შემდეგ icons.css და fonts/fa დააკომიტე.');
    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## ხატულები\n\nაკლია: ' + missing.map(x => '`' + x + '`').join(', ') + '\n');
    }
    process.exitCode = 1;
    return;
  }
  console.log(`✅ ყველა ${names.size} ხატულა და ${glyphs.size} CSS-ხატულა icons.css-შია.`);
}

// ── აწყობა ─────────────────────────────────────────────────────────
async function build() {
  let subsetFont;
  try { subsetFont = require('subset-font'); } catch (e) {
    console.log('ჯერ: npm install --no-save subset-font');
    process.exitCode = 1;
    return;
  }

  const { names, glyphs } = scanSite();
  const css = (await download(CDN + 'css/all.min.css')).toString('utf8');

  const keep = [];
  const codes = new Set(glyphs.keys());
  const iconNames = new Set();
  for (const block of topLevelBlocks(css)) {
    const icon = iconRule(block);
    if (icon) {
      icon.names.forEach(n => iconNames.add(n));
      if (icon.names.some(n => names.has(n))) { keep.push(block); codes.add(icon.code); }
      continue;
    }
    if (block.startsWith('@font-face')) {
      // მხოლოდ Font Awesome 6-ის სამი ოჯახი; v4-თან თავსებადობის შრიფტები საიტს არ სჭირდება.
      const file = FONTS.find(f => block.includes('/' + f + '.'));
      if (!file || /font-family:\s*"?FontAwesome"?;/.test(block) || /unicode-range/.test(block)) continue;
      keep.push(block.replace(/src:[^;}]+/, `src:url(fonts/fa/${file}.woff2) format("woff2")`));
      continue;
    }
    keep.push(block);
  }

  // სახელი, რომელიც არც ხატულაა და არც icons.css-ის სხვა კლასი — სავარაუდოდ შეცდომაა.
  const keptCss = keep.join('\n');
  const unknown = [...names.keys()].filter(n => !iconNames.has(n) && !new RegExp('\\.fa-' + n + '(?![a-z0-9-])').test(keptCss));
  if (unknown.length) console.log('⚠️ Font Awesome-ში არ არსებობს (შეცდომით აკრეფილი?): ' + unknown.map(n => 'fa-' + n).join(', '));

  const text = [...codes].map(c => String.fromCodePoint(parseInt(c, 16))).join('');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const font of FONTS) {
    const full = await download(CDN + 'webfonts/' + font + '.woff2');
    const small = await subsetFont(full, text, { targetFormat: 'woff2' });
    fs.writeFileSync(path.join(OUT_DIR, font + '.woff2'), small);
    console.log(`${font}.woff2: ${Math.round(full.length / 1024)} KB → ${Math.round(small.length / 1024)} KB`);
  }

  const header = `/* Font Awesome Free ${FA_VERSION} — მხოლოდ საიტზე გამოყენებული ხატულები.
   ავტომატურად აწყობილია: node scripts/build-icons.js — ხელით ნუ შეცვლი.
   ლიცენზია: https://fontawesome.com/license/free (Icons: CC BY 4.0, Fonts: SIL OFL 1.1, Code: MIT)
   codepoints: ${[...codes].sort().join(',')} */\n`;
  fs.writeFileSync(OUT_CSS, header + keptCss + '\n');
  console.log(`icons.css: ${Math.round(css.length / 1024)} KB → ${Math.round((header.length + keptCss.length) / 1024)} KB, ${codes.size} ხატულა`);
}

if (process.argv.includes('--check')) check();
else build().catch(err => { console.error(err); process.exitCode = 1; });
