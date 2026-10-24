/**
 * აუდიო ბიბლიის ბმულები mybible.ge-დან → data/audio-bible.json.
 *
 * mp3 ფაილები ჩვენთან არ ინახება — სულ 2–3 GB-ია და GitHub Pages-ზე
 * არ დაეტევა. ისინი ორიგინალი სერვერებიდან იკითხება, ისევე როგორც
 * mybible.ge-ზე: ახალი აღთქმა — Faith Comes By Hearing, ძველი — allgeo.org.
 * ჩვენთან მხოლოდ ბმულების სიაა, რომელსაც bible.js-ის პლეერი კითხულობს.
 *
 * გაშვება (mybible-new-ის ჩამოტვირთული რეპოს გზით):
 *   node scripts/build-audio-bible.js ../mybible-new
 *
 * წიგნის ნომრები holybible.ge-ს რიგითაა (1–66, ახალი აღთქმა 40-დან) —
 * mybible-ის books.json იმავე რიგითაა დალაგებული.
 */

const fs = require('fs');
const path = require('path');

// ორი საერთო თავსართი — ბმულები ასე ორჯერ მოკლდება.
const BASES = [
  'https://cloud.faithcomesbyhearing.com/mp3audiobibles2/GEOIBTN2DA/',
  'https://www.allgeo.org/Irakli/'
];

const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/build-audio-bible.js <path-to-mybible-new>');
  process.exit(1);
}

const books = JSON.parse(fs.readFileSync(path.join(src, 'src/data/books.json'), 'utf8'));
const pages = JSON.parse(fs.readFileSync(path.join(src, 'data/audio.json'), 'utf8'));
const bySlug = new Map(pages.filter(p => p.status === 'publish').map(p => [p.slug, p]));

// იგივე წაკითხვა, რაც mybible-ის src/lib/audio.ts-შია: „დაბადება 12" სტრიქონს
// მოსდევს მისი mp3. თავი სტრიქონის ბოლო რიცხვია („1 მეფეთა 5"-ში პირველი
// რიცხვი წიგნისაა). ფსალმუნები ბლოკებადაა („თავი 24-45"), იგავნი ერთი ფაილია
// უნომროდ — ასეთ ჩანაწერს მეოთხე ელემენტად ბოლო თავიც აქვს.
function tracksOf(page, book) {
  const lines = page.html.replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ')
    .split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const tracks = [];
  lines.forEach((line, i) => {
    const m = line.match(/https?:\/\/\S+\.mp3/i);
    if (!m) return;
    const title = lines[i - 1] && !/^https?:/.test(lines[i - 1]) ? lines[i - 1] : '';
    const n = title.match(/(\d+)(?:\s*[-–]\s*(\d+))?\s*$/);
    const url = m[0].replace(/^http:/, 'https:');
    const base = BASES.findIndex(b => url.startsWith(b));
    if (base < 0) throw new Error('unknown audio host: ' + url);
    const track = [n ? +n[1] : tracks.length + 1, base, url.slice(BASES[base].length)];
    if (n && n[2]) track.push(+n[2]);
    tracks.push(track);
  });
  if (tracks.length === 1 && book.chapters > 1 && !/\d\s*$/.test(lines[0])) tracks[0].push(book.chapters);
  return tracks.sort((a, b) => a[0] - b[0]);
}

const out = { bases: BASES, books: {} };
let count = 0;
books.forEach((b, i) => {
  const page = b.audio && bySlug.get(b.audio);
  if (!page) return;
  const tracks = tracksOf(page, b);
  if (!tracks.length) return;
  out.books[i + 1] = tracks;
  count += tracks.length;
});

const dest = path.join(__dirname, '..', 'data', 'audio-bible.json');
fs.writeFileSync(dest, JSON.stringify(out) + '\n');
console.log(Object.keys(out.books).length + ' books, ' + count + ' tracks → ' + dest);
