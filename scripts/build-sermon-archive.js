#!/usr/bin/env node
/**
 * ქადაგებების არქივის შემდგენელი.
 *
 * YouTube-ის RSS მაქსიმუმ 15 ჩანაწერს აბრუნებს (rss2json კი — 10),
 * ამიტომ სრული წლიური სია მისით ვერ აიწყობა: 2023 წელს 40 ქადაგებაა.
 * ეს სკრიპტი დასაკრავი სიის გვერდს კითხულობს, სადაც ყველა ვიდეოა,
 * და შედეგს ერთ ფაილში ინახავს — data/sermon-archive.json.
 *
 * წლიურ დასაკრავ სიებს არხზე თავად პოულობს სახელით
 * („2026 წლის ქადაგებები“), ამიტომ ახალი წლის დაწყებისას არც კოდში
 * და არც აქ არაფრის შეცვლა არ სჭირდება — საკმარისია, YouTube-ზე
 * ამავე სახელით შექმნა დასაკრავი სია.
 *
 * გაშვება:  node scripts/build-sermon-archive.js
 *           node scripts/build-sermon-archive.js --force   (შემცირების ნებართვა)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const CHANNEL_PLAYLISTS_URL = 'https://www.youtube.com/@EFC-Kutaisi/playlists';
// მხოლოდ წლიური სიები გვაინტერესებს; სახელიანი სერიები Sanity-შია.
const YEAR_PLAYLIST = /^(\d{4})\s+წლის\s+ქადაგებები$/;

const OUT = path.join(__dirname, '..', 'data', 'sermon-archive.json');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        // თანხმობის ფანჯარა HTML-ს ცვლის — ამით ვუვლით გვერდს.
        'Cookie': 'CONSENT=YES+1'
      }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(res.headers.location));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode + ' — ' + url));
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', d => { body += d; });
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

// ytInitialData-ს ფრჩხილების დათვლით ვჭრით: რეგულარული გამოსახულება
// ამხელა ჩადგმულ ობიექტზე საიმედო არ არის.
function sliceInitialData(html) {
  // YouTube ამ ცვლადს რამდენიმენაირად წერს და გვერდიდან გვერდზე ცვლის.
  const keys = ['var ytInitialData = ', 'window["ytInitialData"] = ', 'ytInitialData = '];
  let key = null, start = -1;
  for (const k of keys) {
    const at = html.indexOf(k);
    if (at >= 0 && html[at + k.length] === '{') { key = k; start = at; break; }
  }
  if (start < 0) throw new Error('ytInitialData ვერ მოიძებნა — YouTube-მა გვერდის სტრუქტურა შეცვალა');
  let depth = 0, inStr = false, esc = false;
  for (let i = start + key.length; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return html.slice(start + key.length, i + 1); }
  }
  throw new Error('ytInitialData დაუსრულებელია');
}

// YouTube ვიდეოსა და დასაკრავი სიის ბარათს ერთნაირად — lockupViewModel — ჰქვია.
function collectLockups(node, out) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach(n => collectLockups(n, out)); return out; }
  if (node.lockupViewModel) {
    const l = node.lockupViewModel;
    const meta = l.metadata && l.metadata.lockupMetadataViewModel;
    out.push({
      id: l.contentId || '',
      type: l.contentType || '',
      title: ((meta && meta.title && meta.title.content) || '').trim()
    });
    return out;
  }
  for (const k in node) collectLockups(node[k], out);
  return out;
}

// YouTube დროდადრო გვერდის სხვა ვარიანტს აბრუნებს — ერთი მცდელობა საიმედო არ არის.
async function readPage(url, attempts = 3) {
  let lastErr;
  for (let n = 1; n <= attempts; n++) {
    try {
      const html = await get(url);
      const items = collectLockups(JSON.parse(sliceInitialData(html)), []);
      if (!items.length) throw new Error('შიგთავსი ვერ ამოვიცანი');
      return items;
    } catch (err) {
      lastErr = err;
      if (n < attempts) await new Promise(r => setTimeout(r, 1200 * n));
    }
  }
  throw lastErr;
}

async function findYearPlaylists() {
  const found = [];
  for (const item of await readPage(CHANNEL_PLAYLISTS_URL)) {
    const m = YEAR_PLAYLIST.exec(item.title);
    if (m && item.id) found.push({ year: m[1], id: item.id });
  }
  // ახალი წელი პირველი — საიტი პირველს მიმდინარედ თვლის.
  found.sort((a, b) => Number(b.year) - Number(a.year));
  return found;
}

const KA_MONTHS = [
  'იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი',
  'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'
];

/**
 * თარიღი სათაურიდან: „ქადაგება | 30 აგვისტო, 2026“ → 2026-08-30.
 *
 * წელს სათაურს კი არ ვეკითხებით, არამედ დასაკრავ სიას — სამ სათაურში
 * წელი შეცდომითაა აკრეფილი („16 ოქტომბერი, 2020“ 2022 წლის სიაშია),
 * და სწორედ ესენი არღვევდა რიგს.
 */
function sermonDate(title, year) {
  const bar = (title || '').lastIndexOf('|');
  if (bar < 0) return null;
  const tail = title.slice(bar + 1);
  const day = /(\d{1,2})/.exec(tail);
  if (!day) return null;
  // „ააპრილი“-ს მსგავს შეცდომებს substring-შემოწმება იტანს.
  const month = KA_MONTHS.findIndex(m => tail.indexOf(m) !== -1);
  if (month < 0) return null;
  const dd = String(Number(day[1])).padStart(2, '0');
  return year + '-' + String(month + 1).padStart(2, '0') + '-' + dd;
}

// სათაურში თარიღი არ წერია, მაგრამ ვიცით — თომამ დააზუსტა. YouTube-ზე
// სათაურის გასწორებისას („… | 19 ოქტომბერი, 2025“) ჩანაწერი ზედმეტი ხდება.
const KNOWN_DATES = {
  uyDmyTFl_0k: '2025-10-19'   // რწმენის მიზანი
};

async function readPlaylist(pl) {
  const items = await readPage('https://www.youtube.com/playlist?list=' + pl.id);
  const seen = new Set();
  const videos = items
    .filter(v => /^[A-Za-z0-9_-]{11}$/.test(v.id) && !seen.has(v.id) && seen.add(v.id))
    .map(v => ({ id: v.id, title: v.title, date: sermonDate(v.title, pl.year) || KNOWN_DATES[v.id] || null }));

  // ზოგ სათაურში თარიღი საერთოდ არ წერია. ასეთს უახლოესი დათარიღებული
  // მეზობლის თარიღს ვაძლევთ, რომ სიაში თავის ადგილას დარჩეს.
  let last = null;
  videos.forEach(v => { if (v.date) last = v.date; else v.sortDate = last; });
  for (let i = videos.length - 1; i >= 0; i--) {
    if (!videos[i].date && !videos[i].sortDate) videos[i].sortDate = videos[i + 1] ? (videos[i + 1].date || videos[i + 1].sortDate) : null;
  }

  // დასაკრავი სიების რიგი ერთგვაროვანი არ არის — ზოგი ძველიდან ახლისკენ
  // ალაგია, ზოგი პირიქით. ამიტომ რიგს თავად ვადგენთ თარიღით.
  return videos
    .map((v, i) => ({ v: v, i: i }))
    .sort((a, b) => {
      const da = a.v.date || a.v.sortDate || '';
      const db = b.v.date || b.v.sortDate || '';
      if (da !== db) return db < da ? -1 : 1;
      return a.i - b.i; // ერთი თარიღისას საწყისი რიგი რჩება
    })
    .map(x => ({ id: x.v.id, title: x.v.title, date: x.v.date || null }));
}

/**
 * მქადაგებელი ვიდეოს აღწერიდან: „მქადაგებელი - სპარტაკ ჭანკვეტაძე“.
 * '' — აღწერაში ასეთი სტრიქონი არ არის; null — გვერდი ვერ წავიკითხე.
 */
async function readPreacher(id) {
  try {
    const html = await get('https://www.youtube.com/watch?v=' + id);
    const key = '"shortDescription":';
    const at = html.indexOf(key);
    if (at < 0) return null;
    const start = at + key.length;
    let esc = false, desc = null;
    for (let i = start + 1; i < html.length; i++) {
      const c = html[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { desc = JSON.parse(html.slice(start, i + 1)); break; }
    }
    if (desc === null) return null;
    const m = /მქადაგებელი\s*[-–—:]\s*([^\n]+)/.exec(desc);
    return m ? m[1].trim().replace(/[.,;]+$/, '') : '';
  } catch (e) {
    return null;
  }
}

// წინა არქივში უკვე ნაპოვნ მქადაგებლებს თავიდან აღარ ვეძებთ —
// აღწერას მხოლოდ ახალი ვიდეოსთვის ვკითხულობთ.
function previousPreachers() {
  const known = {};
  try {
    const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    Object.values(prev.years || {}).forEach(list => list.forEach(v => {
      if (v && v.id && typeof v.preacher === 'string') known[v.id] = v.preacher;
    }));
  } catch (e) { /* პირველი გაშვება */ }
  return known;
}

async function addPreachers(years) {
  const known = previousPreachers();
  let fetched = 0;
  for (const list of Object.values(years)) {
    for (const v of list) {
      if (v.id in known) { v.preacher = known[v.id]; continue; }
      const p = await readPreacher(v.id);
      fetched++;
      // ვერ წაკითხულს ველს არ ვაძლევთ — შემდეგ გაშვებაზე თავიდან ვცდით.
      if (p !== null) v.preacher = p;
    }
  }
  if (fetched) console.log('მქადაგებელი ვეძებე ' + fetched + ' ახალ ვიდეოში');
}

(async () => {
  let playlists;
  try {
    playlists = await findYearPlaylists();
  } catch (err) {
    console.log('არხის დასაკრავი სიები ვერ წავიკითხე — ' + err.message);
    process.exitCode = 1;
    return;
  }

  if (!playlists.length) {
    console.log('წლიური დასაკრავი სია ვერ ვიპოვე. სახელი ასეთი უნდა იყოს: „2027 წლის ქადაგებები“.');
    process.exitCode = 1;
    return;
  }

  console.log('ვიპოვე ' + playlists.length + ' წლიური სია: ' + playlists.map(p => p.year).join(', ') + '\n');

  const years = {};
  for (const pl of playlists) {
    process.stdout.write(pl.year + ' … ');
    try {
      const videos = await readPlaylist(pl);
      years[pl.year] = videos;
      console.log(videos.length + ' ქადაგება');
    } catch (err) {
      console.log('ვერ წავიკითხე — ' + err.message);
      process.exitCode = 1;
      return;
    }
  }

  await addPreachers(years);

  const total = Object.values(years).reduce((n, v) => n + v.length, 0);

  // უსაფრთხოების ზღვარი — მთავარია ავტომატური გაშვებისთვის: თუ YouTube-მა
  // ნაკლული გვერდი დააბრუნა, სრული არქივი არ უნდა ჩავანაცვლოთ მოკლეთი.
  if (fs.existsSync(OUT) && !process.argv.includes('--force')) {
    try {
      const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
      const prevTotal = Object.values(prev.years || {}).reduce((n, v) => n + v.length, 0);
      if (total < prevTotal) {
        console.log('\nშევჩერდი: ახალ სიაში ' + total + ' ქადაგებაა, არსებულში კი ' + prevTotal +
          '. ფაილი უცვლელი დარჩა. თუ შემცირება განზრახია — --force.');
        process.exitCode = 1;
        return;
      }
    } catch (e) { /* დაზიანებული ფაილი — უბრალოდ გადავაწერთ */ }
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({
    generatedAt: new Date().toISOString().slice(0, 10),
    playlists,
    years
  }, null, 1) + '\n');

  console.log('\nჩაიწერა ' + path.relative(process.cwd(), OUT) + ' — სულ ' + total + ' ქადაგება');
})();
