#!/usr/bin/env node
/**
 * დღის მუხლის „წაიკითხე მთელი თავი“ — სწორ წიგნს ხსნის თუ არა.
 *
 * ბმული წიგნს ნომრით ხსნის (pages/bible.html#p=52.5.8), ნომერი კი
 * holybible.ge-ს რიგია. ადრე ნომრები პროტესტანტული რიგით ეწერა და
 * „რომაელთა 5:8“ იაკობის 5:8-ს ხსნიდა. ამის განმეორებას ეს სკრიპტი
 * ორ ეტაპად იჭერს:
 *
 *   1. ლოკალურად (ინტერნეტის გარეშე): sanity-fetch.js-ის ყოველი წიგნის
 *      ყოველი ფორმა („რომ 5:8“, „რომაელთა 5:8“…) სწორ წიგნზე მიდის,
 *      ერთი ფორმა ორ წიგნზე არ იყოფა და 66-ვე წიგნს აქვს ფორმა;
 *   2. ქსელით: BIBLE_BOOKS ზუსტად ემთხვევა holybible.ge-ს წიგნების
 *      სიას ბიბლიის გვერდის ყველა თარგმანში. ბაზამ რიგი თუ შეცვალა,
 *      სკრიპტი ვარდება და GitHub ელფოსტას აგზავნის.
 *
 * გაშვება:  node scripts/check-bible-books.js            (ორივე)
 *           node scripts/check-bible-books.js --offline  (მხოლოდ პირველი)
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const API = 'https://holybible.ge/service.php';
const BOOK_OFFSET = 3;   // bibleNames-ის პირველი სამი სათაურია (bible.js-შიც ასეა)

// sanity-fetch.js ბრაუზერისთვისაა — საჭირო ნაწილს ცალკე ვჭრით და ვუშვებთ.
function loadParser() {
  const src = fs.readFileSync(path.join(ROOT, 'sanity-fetch.js'), 'utf8');
  const start = src.indexOf('const BIBLE_BOOKS');
  const end = src.indexOf('function bibleLinkFor');
  if (start < 0 || end < 0) throw new Error('sanity-fetch.js-ში BIBLE_BOOKS / bibleLinkFor ვერ ვიპოვე');
  const errors = [];
  const ctx = { console: { error: (...a) => errors.push(a.join(' ')) } };
  vm.runInNewContext(src.slice(start, end) +
    ';this.out = { BIBLE_BOOKS, BIBLE_BOOK_NAMES, parseBibleRef };', ctx);
  return Object.assign(ctx.out, { loadErrors: errors });
}

// თარგმანების სახელები bible.js-იდან, რომ აქ ხელით არ მეორდებოდეს.
function versions() {
  const src = fs.readFileSync(path.join(ROOT, 'bible.js'), 'utf8');
  const block = src.slice(src.indexOf('const VERSIONS'), src.indexOf('];', src.indexOf('const VERSIONS')));
  return [...block.matchAll(/name:\s*'([^']+)'/g)].map(m => m[1]);
}

function checkLocal(p) {
  const problems = [...p.loadErrors];
  if (p.BIBLE_BOOKS.length !== 66) problems.push('BIBLE_BOOKS-ში ' + p.BIBLE_BOOKS.length + ' წიგნია, 66-ის ნაცვლად');

  const covered = new Set();
  const owner = new Map();
  p.BIBLE_BOOK_NAMES.forEach(([name, aliases]) => {
    const want = p.BIBLE_BOOKS.indexOf(name) + 1;
    if (!want) return;
    covered.add(want);
    aliases.forEach(alias => {
      if (owner.has(alias) && owner.get(alias) !== want) {
        problems.push('„' + alias + '“ ორ წიგნშია: ' + p.BIBLE_BOOKS[owner.get(alias) - 1] + ' და ' + name);
      }
      owner.set(alias, want);
      for (const ref of [alias + ' 5:8', alias + '. 5:8', alias + ' 5:8-10']) {
        const r = p.parseBibleRef(ref);
        if (!r || r.book !== want || r.chapter !== 5 || r.verse !== 8) {
          const got = r ? (p.BIBLE_BOOKS[r.book - 1] || r.book) + ' ' + r.chapter + ':' + r.verse : 'ვერ გაირჩა';
          problems.push('„' + ref + '“ → ' + got + ', უნდა იყოს ' + name + ' 5:8');
        }
      }
    });
  });
  p.BIBLE_BOOKS.forEach((name, i) => {
    if (!covered.has(i + 1)) problems.push(name + '-ს მისამართის ფორმა არ აქვს (BIBLE_BOOK_NAMES)');
  });
  return problems;
}

async function checkRemote(p) {
  const problems = [];
  for (const version of versions()) {
    const url = API + '?w=' + (1 + BOOK_OFFSET) + '&t=1&m=0&s=&v1=&v2=&v3=&l1=&l2=&l3=&mv=' +
      encodeURIComponent(version) + '&language=geo&page=1';
    let names;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (efckutaisi.ge bible check)' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      names = ((await res.json()).bibleNames || []).slice(BOOK_OFFSET);
    } catch (e) {
      problems.push(version + ': holybible.ge არ პასუხობს (' + e.message + ')');
      continue;
    }
    const diff = [];
    for (let i = 0; i < Math.max(names.length, p.BIBLE_BOOKS.length); i++) {
      if (names[i] !== p.BIBLE_BOOKS[i]) diff.push((i + 1) + ': საიტზე „' + p.BIBLE_BOOKS[i] + '“, holybible.ge-ზე „' + names[i] + '“');
    }
    if (diff.length) problems.push(version + ' — წიგნების რიგი განსხვავდება:\n    ' + diff.join('\n    '));
    else console.log('✓ ' + version);
  }
  return problems;
}

(async function main() {
  const p = loadParser();
  const problems = checkLocal(p);
  if (!problems.length) console.log('✓ ყველა წიგნის ყველა ფორმა სწორ წიგნზე მიდის');
  if (!process.argv.includes('--offline')) problems.push(...await checkRemote(p));

  if (problems.length) {
    console.error('\n✗ ბიბლიის ბმულები:\n  ' + problems.join('\n  '));
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary) fs.appendFileSync(summary, '### ბიბლიის ბმულები\n\n```\n' + problems.join('\n') + '\n```\n');
    process.exit(1);
  }
})();
