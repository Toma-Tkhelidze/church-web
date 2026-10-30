#!/usr/bin/env node
/**
 * საიტის Google Forms-ის ყოველდღიური შემოწმება.
 *
 * ფორმები Google-ს no-cors რეჟიმში ეგზავნება: ბრაუზერი პასუხს ვერ კითხულობს,
 * ამიტომ ვიზიტორი „გაიგზავნა“-ს ყოველთვის ხედავს — მაშინაც, როცა ფორმა
 * დახურულია ან კითხვა წაიშალა და მონაცემი უკვალოდ იკარგება. ეს სკრიპტი
 * სწორედ ამას ამოწმებს:
 *   1. ყველა ფორმა ღიაა (პასუხებს იღებს);
 *   2. საიტის კოდში ჩაწერილი ყოველი entry.XXXX ფორმაში ნამდვილად არსებობს;
 *   3. ფორმის ყველა სავალდებულო კითხვას საიტი აგზავნის — თორემ Google
 *      მთელ პასუხს ჩუმად უარყოფს.
 *
 * ღონისძიების ფორმა (ბანაკი, კონფერენცია) შეიძლება განზრახ დაიხუროს.
 * ასეთზე ვამოწმებთ Sanity-ს: თუ საიტზე რეგისტრაცია ისევ ღიაა — შეცდომაა,
 * თუ დახურულია — მხოლოდ შენიშვნა.
 *
 * შეცდომისას სამუშაო ვარდება და GitHub ელფოსტას აგზავნის.
 * გაშვება:  node scripts/check-forms.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SANITY = 'https://f9j6xr69.apicdn.sanity.io/v2021-10-21/data/query/production';
const FORM_URL = /docs\.google\.com\/forms\/d\/e\/([\w-]+)\/formResponse/g;
const ENTRY = /entry\.(\d+)/g;

function get(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (efckutaisi.ge form check)', 'Accept-Language': 'ka,en;q=0.8' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).href, redirects - 1));
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', d => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, url: url, body: body }));
    }).on('error', reject);
  });
}

// საიტის ფაილები, სადაც ფორმები წერია: გვერდები და ძირის სკრიპტები.
function siteFiles() {
  const pages = fs.readdirSync(path.join(ROOT, 'pages')).filter(f => f.endsWith('.html')).map(f => 'pages/' + f);
  const scripts = fs.readdirSync(ROOT).filter(f => f.endsWith('.js'));
  return ['index.html'].concat(pages, scripts);
}

// FB_PUBLIC_LOAD_DATA_: კითხვები [id, სათაური, აღწერა, ტიპი, [[entry, პასუხები, სავალდებულო], …]].
function readForm(html) {
  const m = /FB_PUBLIC_LOAD_DATA_ = (.*?);<\/script>/s.exec(html);
  if (!m) return null;
  const data = JSON.parse(m[1]);
  const questions = [];
  ((data[1] && data[1][1]) || []).forEach(item => {
    (item[4] || []).forEach(sub => {
      questions.push({ entry: String(sub[0]), title: String(item[1] || '').trim(), required: sub[2] === 1 });
    });
  });
  return { title: String((data[1] && data[1][8]) || data[3] || '').trim(), questions: questions };
}

// registration-modal.js-დან: რომელი ღონისძიება რომელ ფორმას იყენებს.
function eventForms() {
  const map = {};
  try {
    const src = fs.readFileSync(path.join(ROOT, 'registration-modal.js'), 'utf8');
    const box = { window: {}, document: {}, __out: null };
    vm.runInNewContext(src + '\n;__out = REG_EVENTS;', box);
    Object.keys(box.__out || {}).forEach(id => {
      const m = /\/e\/([\w-]+)\/formResponse/.exec(box.__out[id].action || '');
      if (m) map[m[1]] = id;
    });
  } catch (e) { /* ფაილი შეიცვალა — დახურული ფორმა უბრალოდ შეცდომად ჩაითვლება */ }
  return map;
}

async function sanityEventStatus(eventId) {
  const q = encodeURIComponent('*[_type == "registrationEvent" && eventId == $id][0].status');
  const res = await get(SANITY + '?query=' + q + '&$id=' + encodeURIComponent(JSON.stringify(eventId)));
  return JSON.parse(res.body).result || null;
}

(async () => {
  const errors = [];
  const notes = [];

  // ფაილი → მისი ფორმები და entry-ები
  const files = siteFiles().map(file => {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    return {
      file: file,
      forms: [...new Set([...text.matchAll(FORM_URL)].map(m => m[1]))],
      entries: [...new Set([...text.matchAll(ENTRY)].map(m => m[1]))]
    };
  }).filter(f => f.forms.length || f.entries.length);

  const events = eventForms();
  const forms = {};
  for (const id of new Set(files.flatMap(f => f.forms))) {
    try {
      const res = await get('https://docs.google.com/forms/d/e/' + id + '/viewform');
      const closed = /\/closedform/.test(res.url) || (res.status === 200 && !/FB_PUBLIC_LOAD_DATA_/.test(res.body) && /closedform|no longer accepting|აღარ იღებს/i.test(res.body));
      forms[id] = { status: res.status, closed: closed, form: closed ? null : readForm(res.body) };
    } catch (e) {
      forms[id] = { error: e.message };
    }
  }

  for (const f of files) {
    if (!f.forms.length) {
      errors.push(`${f.file}: entry-ები წერია (${f.entries.join(', ')}), მაგრამ ფორმის მისამართი ვერ ვიპოვე`);
      continue;
    }
    const known = new Set();
    for (const id of f.forms) {
      const r = forms[id];
      const label = `${f.file} → ფორმა …${id.slice(-8)}`;
      if (r.error) { errors.push(`${label}: ვერ გაიხსნა (${r.error})`); continue; }
      if (r.closed) {
        const eventId = events[id];
        const status = eventId ? await sanityEventStatus(eventId).catch(() => null) : null;
        if (eventId && status && status !== 'active') {
          notes.push(`${label}: დახურულია, საიტზეც რეგისტრაცია დახურულია (${eventId}) — ნორმალურია`);
        } else {
          errors.push(`${label}: Google Form პასუხებს აღარ იღებს, საიტი კი ფორმას ისევ აჩვენებს` + (eventId ? ` (${eventId}, Sanity: ${status || '?'})` : ''));
        }
        continue;
      }
      if (r.status !== 200 || !r.form) { errors.push(`${label}: გვერდი ვერ წავიკითხე (HTTP ${r.status})`); continue; }
      r.form.questions.forEach(q => known.add(q.entry));
      r.form.questions.filter(q => q.required && !f.entries.includes(q.entry)).forEach(q => {
        errors.push(`${label}: სავალდებულო კითხვა „${q.title}“ (entry.${q.entry}) საიტიდან არ იგზავნება — Google ყველა პასუხს უარყოფს`);
      });
    }
    // დახურული ან ვერ წაკითხული ფორმის კითხვები უცნობია — ასეთ ფაილში
    // entry-ებს ვერ შევამოწმებთ (ცრუ შეცდომები იქნებოდა).
    if (f.forms.some(id => !forms[id].form)) continue;
    f.entries.filter(e => !known.has(e)).forEach(e => {
      errors.push(`${f.file}: entry.${e} ფორმაში არ არსებობს — ეს ველი Google-ში არ ჩადის`);
    });
  }

  const formCount = Object.keys(forms).length;
  const lines = [`შემოწმდა ${formCount} ფორმა ${files.length} ფაილში.`];
  notes.forEach(n => lines.push('ℹ️ ' + n));
  errors.forEach(e => lines.push('❌ ' + e));
  if (!errors.length) lines.push('✅ ყველა ფორმა ღიაა და ველები ემთხვევა.');
  console.log(lines.join('\n'));

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## ფორმების შემოწმება\n\n' + lines.map(l => '- ' + l).join('\n') + '\n');
  }
  if (errors.length) process.exitCode = 1;
})();
