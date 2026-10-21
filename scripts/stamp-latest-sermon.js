#!/usr/bin/env node
/**
 * ბოლო ქადაგების ID-ს HTML-შივე წერს.
 *
 * ქადაგებების გვერდის პლეერი და „ბოლო ქადაგების“ ბლოკები ჯერ HTML-ში
 * ჩაწერილ ID-ს აჩვენებენ, ბოლოს კი JavaScript არქივიდან და feed-იდან
 * იგებს. თუ HTML-ში ძველი ID დგას, ძველი ყდა წამიერად ჩანს და მერე
 * იცვლება. არქივის სამუშაო ამ სკრიპტს ყოველი განახლების შემდეგ უშვებს,
 * ამიტომ გვერდი თავიდანვე ახალ ქადაგებას აჩვენებს. JavaScript-ის
 * შემოწმება სათადარიგოდ რჩება.
 *
 * გაშვება:  node scripts/stamp-latest-sermon.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const archive = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'sermon-archive.json'), 'utf8'));
const year = archive.playlists && archive.playlists[0] && archive.playlists[0].year;
const latest = year && archive.years && archive.years[year] && archive.years[year][0];
if (!latest || !/^[\w-]{11}$/.test(latest.id)) {
  console.log('ბოლო ქადაგება არქივში ვერ მოიძებნა — არაფერი შეიცვალა');
  process.exit(0);
}
const id = latest.id;

// მხოლოდ ეს ადგილები — სხვა ვიდეოებს (ბანაკი, მისალმება) ხელს არ ვახლებთ.
const RULES = [
  // „ბოლო ქადაგების“ ბლოკი მთავარ და სხვა გვერდებზე
  /(id="sanity-latest-sermon"[^>]*?data-video-id=")[\w-]{11}(")/g,
  // ქადაგებების გვერდის პლეერი: ღილაკი და მისი ყდა
  /(id="sermonFacade"[\s\S]{0,200}?data-video-id=")[\w-]{11}(")/g,
  /(class="player-facade__thumb"[\s\S]{0,200}?img\.youtube\.com\/vi\/)[\w-]{11}(\/)/g,
  // script.js-ის სათადარიგო მნიშვნელობა
  /(getAttribute\('data-video-id'\) \|\| ')[\w-]{11}(')/g
];

const files = [path.join(ROOT, 'index.html'), path.join(ROOT, 'script.js')]
  .concat(fs.readdirSync(path.join(ROOT, 'pages'))
    .filter(n => n.endsWith('.html'))
    .map(n => path.join(ROOT, 'pages', n)));

let changed = 0;
for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  for (const rule of RULES) after = after.replace(rule, '$1' + id + '$2');
  if (after !== before) {
    fs.writeFileSync(file, after);
    changed++;
    console.log('  ' + path.relative(ROOT, file));
  }
}
console.log('ბოლო ქადაგება ' + id + ' — შეიცვალა ' + changed + ' ფაილი');
