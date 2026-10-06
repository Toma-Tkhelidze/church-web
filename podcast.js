/**
 * აუდიო ქადაგებები — ქადაგებების გვერდის „აუდიო“ ჩანართი.
 *
 * ეპიზოდები პოდკასტის RSS ლენტიდან მოდის. Spotify-ის (anchor.fm) ლენტა
 * CORS-ს უშვებს, ამიტომ პირდაპირ ვკითხულობთ — rss2json-ის უფასო გეგმა
 * მხოლოდ ბოლო 10 ეპიზოდს აბრუნებს, არქივი კი ბევრად დიდია.
 *
 * ლენტას ყოველ შესვლაზე ვკითხულობთ, რომ ახალი ეპიზოდი გამოქვეყნებისთანავე
 * ჩანდეს. ბოლო ნაცნობი სია localStorage-შია — ის მაშინვე იხატება, ლენტის
 * პასუხი კი უკვე ნახატ სიას ანახლებს. ასე არც ლოდინია და არც დაგვიანება.
 *
 * სანამ PODCAST_FEED ცარიელია, ჩანართი სანიმუშო ეპიზოდებით მუშაობს და
 * „სატესტო რეჟიმის“ წარწერით ჩანს, რომ ნამდვილ სექციად არ ჩაითვალოს.
 */

// ── შესავსები ───────────────────────────────────────────────────
// პოდკასტის RSS მისამართი (Spotify for Creators → Settings → RSS).
// გარეკანსა და პლატფორმების ბმულებს ლენტიდანვე ვიღებთ.
const PODCAST_FEED = 'https://anchor.fm/s/118253064/podcast/rss';

const PODCAST_LINKS = {
  spotify: 'https://open.spotify.com/show/57yggrMA1rr8OcxzfYbAdj',
  apple: ''
};

const FEED_TIMEOUT_MS = 8000;
const FEED_CACHE_KEY = 'efc:podcast:v3';          // v3: ეპიზოდს preacher ველი დაემატა

// მოსმენის ადგილი — იმავე პრინციპით, რაც ვიდეოს პროგრესს აქვს.
const AUDIO_KEY = 'efc:listen:v1';
const AUDIO_MIN_SECONDS = 15;      // ამაზე ნაკლები დაწყებად არ ითვლება
const AUDIO_DONE_RATIO = 0.95;
const AUDIO_MAX_ENTRIES = 300;

const SPEEDS = [1, 1.25, 1.5, 2];

const LAST_KEY = 'efc:listen:last';        // ბოლოს ჩართული ეპიზოდი
const VOLUME_KEY = 'efc:volume:v1';
const PAUSE_KEEP_MS = 3 * 60 * 60 * 1000;  // ამდენ ხანს გვერდს თავიდან არ ვტვირთავთ
const STUCK_MS = 6000;                     // ამდენ ხანს უძრავი დაკვრა = გაწყვეტილი კავშირი

// სანამ ნამდვილი ლენტა არ დაემატება, ჩანართი ამ სანიმუშო ეპიზოდებით
// მუშაობს — რომ დიზაინი ადგილზე ჩანდეს. PODCAST_FEED-ის შევსებისთანავე
// მათ ნამდვილი ეპიზოდები ჩაანაცვლებს.
const PREVIEW_EPISODES = [
  { id: 'p1', title: 'ჩემი ეკლესია', preacher: 'სპარტაკ ჭანკვეტაძე', url: '', date: '2026-08-30 11:00:00', duration: 2292 },
  { id: 'p2', title: 'უკეთესობა ვაქციოთ ნორმად', preacher: 'სპარტაკ ჭანკვეტაძე', url: '', date: '2026-08-23 11:00:00', duration: 2465 },
  { id: 'p3', title: 'როგორი ეკლესიისთვის დაბრუნდება ქრისტე', preacher: 'სპარტაკ ჭანკვეტაძე', url: '', date: '2026-08-16 11:00:00', duration: 2140 },
  { id: 'p4', title: 'სამი რამ, რაც უფალს მოსწონს ჩვენში', preacher: 'სპარტაკ ჭანკვეტაძე', url: '', date: '2022-10-16 11:00:00', duration: 2010 }
];

function previewMode() {
  return !PODCAST_FEED;
}

// ── ლენტის ქეში ─────────────────────────────────────────────────
// ქეში ვადას არ ითვლის: ის მხოლოდ პირველი ნახატისთვის და ლენტის
// ჩავარდნისთვისაა. სიახლეს ყოველთვის ლენტა წყვეტს.
function readFeedCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(FEED_CACHE_KEY));
    if (!raw || !Array.isArray(raw.items) || !raw.items.length) return null;
    return { items: raw.items, cover: raw.cover || '' };
  } catch (e) { return null; }
}

function writeFeedCache(items, cover) {
  try {
    localStorage.setItem(FEED_CACHE_KEY, JSON.stringify({ items: items, cover: cover || '', at: Date.now() }));
  } catch (e) { /* კვოტა ან private mode */ }
}

// ── მოსმენის პროგრესი ───────────────────────────────────────────
function readListened() {
  try {
    const raw = JSON.parse(localStorage.getItem(AUDIO_KEY));
    return (raw && typeof raw === 'object') ? raw : {};
  } catch (e) { return {}; }
}

function writeListened(map) {
  try {
    const ids = Object.keys(map);
    if (ids.length > AUDIO_MAX_ENTRIES) {
      ids.sort((a, b) => (map[b].at || 0) - (map[a].at || 0))
        .slice(AUDIO_MAX_ENTRIES)
        .forEach(id => { delete map[id]; });
    }
    localStorage.setItem(AUDIO_KEY, JSON.stringify(map));
  } catch (e) { /* კვოტა ან private mode */ }
}

// ── დამხმარეები ─────────────────────────────────────────────────
function clock(seconds) {
  // ბრაუზერი ხანგრძლივობას Infinity-ს აბრუნებს, როცა სერვერი
  // Range-მოთხოვნებს არ უჭერს მხარს — ასეთ რიცხვს არ ვხატავთ.
  if (!isFinite(seconds)) return '0:00';
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return (h ? h + ':' : '') + mm + ':' + String(r).padStart(2, '0');
}

const GE_MONTHS = ['იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი',
  'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'];

function geoDate(value) {
  const d = new Date(value);
  if (isNaN(d)) return '';
  return d.getDate() + ' ' + GE_MONTHS[d.getMonth()] + ', ' + d.getFullYear();
}

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// itunes:duration სხვადასხვანაირად მოდის: „38:12“, „2292“
// ან „01:38:12“. სამივეს წამებად ვაქცევთ.
function toSeconds(value) {
  if (value == null) return 0;
  const text = String(value).trim();
  if (!text) return 0;
  if (/^\d+$/.test(text)) return Number(text);
  const parts = text.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

// ეპიზოდის სათაური YouTube-ისას იმეორებს: „თემა | 6 თებერვალი, 2022“.
// ლენტის pubDate ატვირთვის დღეა და არა ქადაგებისა — ძველი ქადაგებები
// ერთად აიტვირთა — ამიტომ თარიღს სათაურიდან ვიღებთ და სათაურს ვაჭრით.
const TITLE_DATE = /\s*\|\s*(\d{1,2})\s+(\S+?),?\s+(\d{4})\s*$/;

function splitTitle(raw, fallbackDate) {
  const m = raw.match(TITLE_DATE);
  const month = m ? GE_MONTHS.indexOf(m[2]) : -1;
  if (month < 0) return { title: raw, date: fallbackDate };
  const pad = n => String(n).padStart(2, '0');
  return {
    title: raw.slice(0, m.index).trim(),
    date: m[3] + '-' + pad(month + 1) + '-' + pad(m[1]) + 'T11:00:00'
  };
}

// მქადაგებელი ეპიზოდის აღწერაშია: „…<br>მქადაგებელი - სახელი გვარი</p>“.
function findPreacher(description) {
  const m = String(description || '').match(/მქადაგებელი\s*[-–—:]\s*([^<\n]+)/);
  return m ? m[1].trim() : '';
}

function yearOf(ep) {
  const d = new Date(ep.date);
  return isNaN(d) ? '' : String(d.getFullYear());
}

function tagText(node, name) {
  const found = node.getElementsByTagName(name)[0];
  return found ? found.textContent.trim() : '';
}

function tagAttr(node, name, attr) {
  const found = node.getElementsByTagName(name)[0];
  return found ? (found.getAttribute(attr) || '') : '';
}

function normalise(xml) {
  return Array.from(xml.getElementsByTagName('item')).map(item => {
    const audio = tagAttr(item, 'enclosure', 'url');
    const pub = new Date(tagText(item, 'pubDate'));
    const parts = splitTitle(tagText(item, 'title'), isNaN(pub) ? '' : pub.toISOString());
    return {
      id: tagText(item, 'guid') || audio,
      title: parts.title,
      preacher: findPreacher(tagText(item, 'description')),
      url: audio,
      date: parts.date,
      // ეპიზოდს შეიძლება თავისი გარეკანი ჰქონდეს, შეიძლება — არა.
      // თუ არაა, შოუს საერთო გარეკანზე გადავდივართ.
      image: tagAttr(item, 'itunes:image', 'href'),
      duration: toSeconds(tagText(item, 'itunes:duration'))
    };
  }).filter(ep => ep.url && ep.title)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function fetchFeed() {
  const cached = readFeedCache();
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), FEED_TIMEOUT_MS) : null;

  // anchor.fm-ის CDN ლენტას ~7 დღით ინახავს (s-maxage), ამიტომ საათობრივი
  // პარამეტრით ახალ ეპიზოდებს მაქსიმუმ ერთ საათში ვხედავთ.
  const url = PODCAST_FEED + '?v=' + Math.floor(Date.now() / 3600000);
  return fetch(url, controller ? { signal: controller.signal } : undefined)
    .then(res => (res.ok ? res.text() : ''))
    .then(text => {
      const xml = text ? new DOMParser().parseFromString(text, 'application/xml') : null;
      const items = xml ? normalise(xml) : [];
      if (!items.length) return cached ? cached.items : [];
      // anchor.fm ხანდახან ძველ ასლს აბრუნებს (9 ეპიზოდით) — შემცირებულ
      // ლენტას ბოლო ნაცნობ, უფრო სრულ სიას არ ვაჩანაცვლებინებთ.
      if (cached && cached.items.length > items.length) return cached.items;
      // გარეკანს ლენტიდან ვიღებთ (არხის itunes:image).
      const channel = xml.getElementsByTagName('channel')[0];
      const showArt = channel && Array.from(channel.children)
        .find(n => n.tagName === 'itunes:image');
      if (showArt) coverUrl = showArt.getAttribute('href') || coverUrl;
      writeFeedCache(items, coverUrl);
      return items;
    })
    // ჩავარდნისას ბოლო ნაცნობ სიას ვაჩვენებთ და არა ცარიელს.
    .catch(() => (cached ? cached.items : []))
    .finally(() => { if (timer) clearTimeout(timer); });
}

let coverUrl = '';

// ── პლეერი ──────────────────────────────────────────────────────
(function () {
  const panel = document.getElementById('audioPanel');
  const tab = document.getElementById('audioTab');
  if (!panel || !tab) return;                     // მხოლოდ ქადაგებების გვერდზე

  const videoTab = document.getElementById('videoTab');
  const videoPanel = document.getElementById('videoPanel');

  const el = {
    cover: document.getElementById('audioCover'),
    title: document.getElementById('audioTitle'),
    preacher: document.getElementById('audioPreacher'),
    year: document.getElementById('audioYear'),
    meta: document.getElementById('audioMeta'),
    years: document.getElementById('audioYears'),
    bar: document.getElementById('audioBar'),
    fill: document.getElementById('audioFill'),
    dot: document.getElementById('audioDot'),
    cur: document.getElementById('audioCur'),
    left: document.getElementById('audioLeft'),
    play: document.getElementById('audioPlayBtn'),
    speed: document.getElementById('audioSpeed'),
    mute: document.getElementById('audioMute'),
    volume: document.getElementById('audioVolume'),
    list: document.getElementById('audioList'),
    found: document.getElementById('audioFound'),
    search: document.getElementById('audioSearch'),
    searchClear: document.getElementById('audioSearchClear'),
    elsewhere: document.getElementById('audioElsewhere'),
    spotify: document.getElementById('audioSpotify'),
    apple: document.getElementById('audioApple'),
    mini: document.getElementById('audioMini'),
    miniPlay: document.getElementById('audioMiniPlay'),
    miniTitle: document.getElementById('audioMiniTitle'),
    miniPreacher: document.getElementById('audioMiniPreacher'),
    miniFill: document.getElementById('audioMiniFill'),
    miniClose: document.getElementById('audioMiniClose')
  };

  const sound = new Audio();
  sound.preload = 'none';                          // ჩატვირთვა მხოლოდ დაკვრისას

  // iPhone-ზე ჩაკეტილ ეკრანზე დაპაუზებული და იქვე ხელახლა ჩართული ხმა
  // ჩუმად უკრავდა — დრო მიდიოდა, ხმა მხოლოდ აპის გახსნისას ჩნდებოდა.
  // „playback“ ტიპი iOS-ს ეუბნება, რომ ეს მედია-პლეერია (როგორც
  // პოდკასტის აპი) და ხმის არხი ფონზეც ღია უნდა დარჩეს. Safari 16.4+.
  function claimAudioSession() {
    try {
      if (navigator.audioSession && navigator.audioSession.type !== 'playback') {
        navigator.audioSession.type = 'playback';
      }
    } catch (e) { /* ძველი iOS — თვისება არ არის */ }
  }
  claimAudioSession();

  // ── დიაგნოსტიკის ჟურნალი ──────────────────────────────────────
  // iPhone-ის აპში ჩაკეტილი ეკრანის ქცევა აქედან ვერ ჩანს. ბოლო 80
  // მოვლენა ტელეფონშივე ინახება (არსად იგზავნება). სანახავად: პლეერში
  // თარიღის ხაზზე სამჯერ ზედიზედ დაჭერა.
  const LOG_KEY = 'efc:audiolog:v1';
  const LOG_BUILD = '2026-10-06c';

  function dlog(what) {
    let isSoft = false;
    try { isSoft = !!soft; } catch (e) { /* ჯერ არ არის გამოცხადებული */ }
    const d = new Date();
    const row = [
      d.toTimeString().slice(0, 8), what,
      document.hidden ? 'ფონი' : 'ეკრანი',
      sound.paused ? 'paused' : 'playing',
      sound.muted ? 'muted' : 'ხმა',
      'შ=' + (sound.currentTime || 0).toFixed(1),
      isSoft ? 'SOFT' : '',
      'rs' + sound.readyState + '/ns' + sound.networkState
    ].filter(Boolean).join(' ');
    try {
      const list = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
      list.push(row);
      localStorage.setItem(LOG_KEY, JSON.stringify(list.slice(-80)));
    } catch (e) { /* private mode */ }
  }

  dlog('ჩატვირთვა ' + LOG_BUILD + (navigator.standalone ? ' აპი' : ' ბრაუზერი')
    + (navigator.audioSession ? ' session=' + navigator.audioSession.type : ' session=არა'));
  ['play', 'playing', 'pause', 'waiting', 'stalled', 'suspend', 'error', 'ended', 'emptied']
    .forEach(name => sound.addEventListener(name, () => dlog('ev:' + name)));
  document.addEventListener('visibilitychange', () => dlog('ხილვადობა'));

  // სამი სწრაფი დაჭერა თარიღის ხაზზე → ჟურნალის ფანჯარა.
  let taps = [];
  el.meta.addEventListener('click', () => {
    const now = Date.now();
    taps = taps.filter(t => now - t < 800).concat(now);
    if (taps.length >= 3) { taps = []; showLog(); }
  });

  function showLog() {
    let rows = [];
    try { rows = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch (e) { /* — */ }
    const box = document.createElement('div');
    box.setAttribute('role', 'dialog');
    box.style.cssText = 'position:fixed;inset:12px;z-index:10000;display:flex;flex-direction:column;'
      + 'background:#111;color:#eee;border:1px solid #aa954f;border-radius:12px;padding:12px;font-size:12px;';
    const text = rows.join('\n') || '(ცარიელია)';
    box.innerHTML = '<div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">'
      + '<b style="flex:1;color:#d5bf7c">აუდიოს ჟურნალი</b>'
      + '<button type="button" data-act="copy">კოპირება</button>'
      + '<button type="button" data-act="clear">გასუფთავება</button>'
      + '<button type="button" data-act="close">დახურვა</button></div>'
      + '<pre style="flex:1;overflow:auto;margin:0;white-space:pre-wrap;font-size:11px;line-height:1.5"></pre>';
    box.querySelector('pre').textContent = text;
    box.addEventListener('click', e => {
      const act = e.target.getAttribute('data-act');
      if (act === 'copy' && navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
      if (act === 'clear') { try { localStorage.removeItem(LOG_KEY); } catch (err) { /* — */ } box.remove(); }
      if (act === 'close') box.remove();
    });
    document.body.appendChild(box);
  }

  // script.js დიდი პაუზის შემდეგ გვერდს თავიდან ტვირთავს — მიმდინარე
  // მოსმენა ამას არ უნდა შეეწიროს.
  // დაპაუზებული მოსმენაც ითვლება: გადატვირთვა ჩაკეტილი ეკრანის პლეერს
  // მოკლავდა და „დაკვრაზე“ დაჭერა აღარაფერს გააკეთებდა.
  let pausedAt = 0;
  (window.efcBusyChecks = window.efcBusyChecks || []).push(() =>
    !sound.paused || (pausedAt && Date.now() - pausedAt < PAUSE_KEEP_MS));

  let episodes = [];
  let shown = [];
  let activeYear = '';
  let current = null;
  let speedIdx = 0;
  let miniDismissed = false;
  let pendingSeek = 0;

  // ── ჩანართები ─────────────────────────────────────────────────
  function selectTab(name) {
    const audio = name === 'audio';
    tab.classList.toggle('is-active', audio);
    tab.setAttribute('aria-selected', String(audio));
    videoTab.classList.toggle('is-active', !audio);
    videoTab.setAttribute('aria-selected', String(!audio));
    panel.hidden = !audio;
    videoPanel.hidden = audio;
    updateMini();
  }

  tab.addEventListener('click', () => selectTab('audio'));
  videoTab.addEventListener('click', () => selectTab('video'));

  // ── სია ───────────────────────────────────────────────────────
  function card(ep) {
    const state = readListened()[ep.id];
    const done = state && state.done;
    const started = state && !state.done && state.t > 0;
    const classes = 'audio-item'
      + (current && current.id === ep.id ? ' is-current' : '')
      + (done ? ' is-done' : '');
    const note = done
      ? '<span class="audio-item-done"> · მოსმენილია</span>'
      : (started ? '<span class="audio-item-done"> · გაგრძელება ' + clock(state.t) + '</span>' : '');

    const badge = ep.image
      ? '<span class="audio-item-thumb" style="background-image:url(&quot;' + esc(ep.image) + '&quot;)">'
          + '<i class="fa-solid fa-play" aria-hidden="true"></i></span>'
      : '<span class="audio-item-icon"><i class="fa-solid fa-play" aria-hidden="true"></i></span>';

    return '<button type="button" class="' + classes + '" data-id="' + esc(ep.id) + '">'
      + badge
      + '<span class="audio-item-body">'
      + '<span class="audio-item-title">' + esc(ep.title) + '</span>'
      + '<span class="audio-item-date">'
      + (ep.preacher ? '<span class="audio-item-preacher">' + esc(ep.preacher) + '</span> · ' : '')
      + esc(geoDate(ep.date)) + note + '</span>'
      + '</span>'
      + '<span class="audio-item-dur">' + (ep.duration ? clock(ep.duration) : '') + '</span>'
      + '</button>';
  }

  function paintList() {
    if (!shown.length) {
      el.list.innerHTML = '<p class="audio-empty">ეპიზოდი ვერ მოიძებნა.</p>';
      return;
    }
    el.list.innerHTML = shown.map(card).join('');
  }

  // ── წლები — ვიდეოების მსგავსად, თითო წელს თავისი ჩანართი ──────
  function paintYears() {
    const counts = {};
    episodes.forEach(ep => {
      const y = yearOf(ep);
      if (y) counts[y] = (counts[y] || 0) + 1;
    });
    const years = Object.keys(counts).sort((a, b) => b.localeCompare(a));
    if (!years.includes(activeYear)) activeYear = years[0] || '';
    el.years.hidden = years.length < 2;
    el.years.innerHTML = years.map(y =>
      '<button type="button" class="year-tab' + (y === activeYear ? ' is-active' : '') + '"'
      + ' role="tab" aria-selected="' + (y === activeYear) + '" data-year="' + y + '">'
      + y + '</button>'
    ).join('');
  }

  el.years.addEventListener('click', e => {
    const btn = e.target.closest('.year-tab');
    if (!btn) return;
    activeYear = btn.getAttribute('data-year');
    el.years.querySelectorAll('.year-tab').forEach(b => {
      const on = b === btn;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
    });
    // წლის არჩევა ძებნიდან გამოსვლას ნიშნავს — ისევე, როგორც ვიდეოებში.
    el.search.value = '';
    filter('');
  });

  // ძებნა ყველა წელში ეძებს — სახელით, მქადაგებლით ან თარიღით.
  function filter(query) {
    const q = (query || '').trim().toLowerCase();
    shown = q
      ? episodes.filter(ep =>
          ep.title.toLowerCase().indexOf(q) > -1 ||
          (ep.preacher || '').toLowerCase().indexOf(q) > -1 ||
          geoDate(ep.date).toLowerCase().indexOf(q) > -1)
      : episodes.filter(ep => !activeYear || yearOf(ep) === activeYear);
    el.years.classList.toggle('is-searching', !!q);

    if (q) {
      el.found.textContent = shown.length
        ? 'ნაპოვნია ' + shown.length + ' ეპიზოდი'
        : 'ეპიზოდი ვერ მოიძებნა';
      el.found.hidden = false;
    } else {
      el.found.hidden = true;
    }
    el.searchClear.hidden = !q;
    paintList();
  }

  el.search.addEventListener('input', () => filter(el.search.value));
  el.searchClear.addEventListener('click', () => {
    el.search.value = '';
    filter('');
    el.search.focus();
  });

  el.list.addEventListener('click', e => {
    const btn = e.target.closest('.audio-item');
    if (!btn) return;
    const ep = episodes.find(x => String(x.id) === btn.getAttribute('data-id'));
    if (ep) load(ep, true);
  });

  // ── დაკვრა ────────────────────────────────────────────────────
  function load(ep, autoplay) {
    current = ep;
    // სატესტო რეჟიმში ფაილი არ არსებობს — მხოლოდ დიზაინს ვაჩვენებთ.
    if (ep.url) sound.src = ep.url;
    // ახალი src ბრაუზერს სიჩქარეს 1×-ზე უბრუნებს — ღილაკზე კი არჩეული
    // რჩება. ორივე ერთი და იგივე უნდა იყოს.
    sound.playbackRate = SPEEDS[speedIdx];
    el.title.textContent = ep.title;
    el.preacher.innerHTML = ep.preacher
      ? '<i class="fa-solid fa-microphone" aria-hidden="true"></i>' + esc(ep.preacher) : '';
    el.preacher.hidden = !ep.preacher;
    el.year.textContent = yearOf(ep);
    el.year.hidden = !yearOf(ep);
    el.meta.textContent = [geoDate(ep.date), ep.duration ? clock(ep.duration) : '']
      .filter(Boolean).join(' · ');
    el.miniTitle.textContent = ep.title;
    el.miniPreacher.textContent = ep.preacher || '';
    el.miniPreacher.hidden = !ep.preacher;

    const art = ep.image || coverUrl;
    el.cover.style.backgroundImage = art ? 'url("' + art + '")' : '';

    // სად გაჩერდა — იმ ადგილიდან ვაგრძელებთ. currentTime-ს src-ის
    // მინიჭებისთანავე ვერ დავაყენებთ: ბრაუზერს ჯერ მეტამონაცემები
    // უნდა წაიკითხოს, თორემ მნიშვნელობა ნულდება.
    const state = readListened()[ep.id];
    pendingSeek = (state && !state.done && state.t > AUDIO_MIN_SECONDS) ? state.t : 0;

    paintList();
    mediaSession(ep);
    if (autoplay) {
      try { localStorage.setItem(LAST_KEY, String(ep.id)); } catch (e) { /* private mode */ }
      resume();
      if (window.efcTrack) efcTrack('audio_play', { sermon_title: ep.title, resumed: pendingSeek ? 'yes' : 'no' });
    }
  }

  // ── დაკვრის აღდგენა ──────────────────────────────────────────
  // ტელეფონი ჩაკეტილ ეკრანზე დაპაუზებულ ხმას ქსელის კავშირს უწყვეტს.
  // შემდეგ play() შეცდომას არ აბრუნებს, მაგრამ ხმა აღარ მოდის — დრო
  // ადგილზე დგას. ასეთ დროს ფაილს თავიდან ვაბამთ იმავე წამიდან.
  let stuckTimer = 0;

  function reattach() {
    if (!current || !current.url) return;
    dlog('ხელახლა მიბმა');
    pendingSeek = sound.currentTime || pendingSeek;
    sound.src = current.url;
    sound.load();
    sound.playbackRate = SPEEDS[speedIdx];
  }

  function watchStuck(retried) {
    clearTimeout(stuckTimer);
    const from = sound.currentTime;
    stuckTimer = setTimeout(() => {
      if (sound.paused || sound.currentTime !== from) return;
      dlog('გაჭედვა' + (retried ? ' (მეორედ)' : ''));
      if (retried) return;                       // მეორედ აღარ ვცდით — ალბათ ქსელი არ არის
      reattach();
      sound.play().then(() => watchStuck(true)).catch(() => {});
    }, STUCK_MS);
  }

  function resume() {
    if (!current || !current.url) return;
    claimAudioSession();
    dlog('resume()');
    if (sound.error) reattach();
    sound.play()
      .then(() => { dlog('play() ok'); watchStuck(false); })
      .catch(err => {
        dlog('play() შეცდომა: ' + (err && err.name));
        // ბრაუზერმა თავად აკრძალა (მომხმარებლის დაჭერის გარეშე) — არაფერს ვცვლით.
        if (err && err.name === 'NotAllowedError') return;
        reattach();
        sound.play().then(() => watchStuck(true)).catch(() => {});
      });
  }

  // ლენტის ხანგრძლივობა სარეზერვოა: ბრაუზერისას ყოველთვის არ ვენდობით.
  function duration() {
    if (isFinite(sound.duration) && sound.duration > 0) return sound.duration;
    return (current && current.duration) || 0;
  }

  // ── „ჩუმი პაუზა“ — iPhone-ის დაყენებული აპისთვის ───────────────
  // WebKit-ის შეცდომა: მთავარ ეკრანზე დამატებულ აპში ჩაკეტილ ეკრანზე
  // დაპაუზებული ხმა ხელახლა ჩართვისას ჩუმად უკრავს (დრო მიდის, ხმა
  // არა) — სანამ აპს არ გახსნი. Safari-ში ეს არ ხდება. ამიტომ აქ
  // ჩაკეტილი ეკრანის პაუზა ფაილს არ აჩერებს: ხმას აჩუმებს და წამს
  // იმახსოვრებს. ჩართვისას იმავე წამზე ვბრუნდებით და ხმას ვაბრუნებთ —
  // iOS-ს დაკვრის შეწყვეტის საბაბი არ ეძლევა. 15 წუთის შემდეგ ან აპის
  // გახსნისას ჩვეულებრივ პაუზაზე გადავდივართ (წინა პლანზე ჩართვა მუშაობს).
  const IOS_APP = navigator.standalone === true;
  const SOFT_PAUSE_MAX_MS = 15 * 60 * 1000;
  let soft = null;                                 // { at, wasMuted, timer }

  function isPaused() {
    return sound.paused || !!soft;
  }

  function position() {
    return soft ? soft.at : sound.currentTime;
  }

  function softPause() {
    dlog('ჩუმი პაუზა');
    soft = {
      at: sound.currentTime,
      wasMuted: sound.muted,
      timer: setTimeout(hardenSoftPause, SOFT_PAUSE_MAX_MS)
    };
    sound.muted = true;
    clearTimeout(stuckTimer);
    pausedAt = Date.now();
    setPlaybackState('paused');
    save(); paintProgress(); paintPlayState();
  }

  // ჩუმი პაუზიდან გამოსვლა — at-ზე ვბრუნდებით და ხმას ვუბრუნებთ.
  function endSoft() {
    if (!soft) return null;
    const s = soft;
    clearTimeout(s.timer);
    soft = null;
    sound.muted = s.wasMuted;
    return s;
  }

  function softResume() {
    const s = endSoft();
    if (!s) return;
    dlog('ჩუმიდან გამოსვლა → ' + s.at.toFixed(1));
    sound.currentTime = s.at;
    if (sound.paused) { resume(); return; }        // iOS-მა მაინც გააჩერა
    pausedAt = 0;
    setPlaybackState('playing');
    paintPlayState();
  }

  // ჩუმი პაუზა ნამდვილ პაუზად იქცევა (დრო გავიდა ან აპი გაიხსნა).
  function hardenSoftPause() {
    const s = endSoft();
    if (!s) return;
    dlog('ჩუმი → ნამდვილი პაუზა');
    sound.currentTime = s.at;                      // ჯერ წამი, რომ pause-მა ის შეინახოს
    sound.pause();
  }

  function lockScreenPause() {
    dlog('ჩაკეტილი ეკრანი: პაუზა');
    if (soft) { softResume(); return; }            // ზოგჯერ ღილაკი „პაუზას“ აჩვენებს
    if (IOS_APP && document.hidden && !sound.paused) softPause();
    else sound.pause();
  }

  function lockScreenPlay() {
    dlog('ჩაკეტილი ეკრანი: დაკვრა');
    if (soft) softResume();
    else resume();
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && soft) hardenSoftPause();
  });

  function paintProgress() {
    const total = duration();
    const at = position();
    const pct = total ? (at / total) * 100 : 0;
    el.fill.style.width = pct + '%';
    el.dot.style.left = pct + '%';
    el.miniFill.style.width = pct + '%';
    el.cur.textContent = clock(at);
    el.left.textContent = total ? '-' + clock(total - at) : '';
    el.bar.setAttribute('aria-valuenow', String(Math.round(pct)));
  }

  function paintPlayState() {
    const icon = isPaused() ? 'fa-play' : 'fa-pause';
    const label = isPaused() ? 'დაკვრა' : 'პაუზა';
    el.play.querySelector('i').className = 'fa-solid ' + icon;
    el.play.setAttribute('aria-label', label);
    el.miniPlay.querySelector('i').className = 'fa-solid ' + icon;
    el.miniPlay.setAttribute('aria-label', label);
    updateMini();
  }

  el.play.addEventListener('click', () => {
    if (!current || !current.url) return;
    dlog('ღილაკი: ' + (isPaused() ? 'დაკვრა' : 'პაუზა'));
    if (soft) {
      softResume();
    } else if (sound.paused) {
      try { localStorage.setItem(LAST_KEY, String(current.id)); } catch (e) { /* private mode */ }
      resume();
    } else {
      sound.pause();
    }
  });

  el.miniPlay.addEventListener('click', () => el.play.click());

  document.querySelectorAll('#audioPanel [data-skip]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!current) return;
      const by = Number(btn.getAttribute('data-skip'));
      const max = duration() || sound.currentTime + by;
      sound.currentTime = Math.max(0, Math.min(max, sound.currentTime + by));
    });
  });

  el.speed.addEventListener('click', () => {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    sound.playbackRate = SPEEDS[speedIdx];
    el.speed.textContent = SPEEDS[speedIdx] + '×';
  });

  // ── ხმის სიმაღლე ──────────────────────────────────────────────
  // iPhone-ზე volume მხოლოდ წასაკითხია (ყოველთვის 1) — იქ სლაიდერს
  // ვმალავთ და მხოლოდ გამორთვის ღილაკი რჩება, რომელიც ყველგან მუშაობს.
  // მეორე audio ელემენტს არ ვქმნით — iOS-ზე ის ხმის სესიას ერევა.
  const volumeWorks = (() => {
    sound.volume = 0.5;
    const works = sound.volume === 0.5;
    sound.volume = 1;
    return works;
  })();

  function readVolume() {
    try {
      const raw = JSON.parse(localStorage.getItem(VOLUME_KEY));
      if (raw && typeof raw.v === 'number') return { v: Math.min(1, Math.max(0, raw.v)), m: !!raw.m };
    } catch (e) { /* private mode */ }
    return { v: 1, m: false };
  }

  function paintVolume() {
    const level = sound.muted ? 0 : sound.volume;
    const icon = level === 0 ? 'fa-volume-xmark' : (level < 0.5 ? 'fa-volume-low' : 'fa-volume-high');
    el.mute.querySelector('i').className = 'fa-solid ' + icon;
    el.mute.classList.toggle('is-muted', sound.muted);
    el.mute.setAttribute('aria-label', sound.muted ? 'ხმის ჩართვა' : 'ხმის გამორთვა');
    el.volume.value = String(Math.round(level * 100));
    el.volume.style.setProperty('--vol', Math.round(level * 100) + '%');
  }

  function storeVolume() {
    try { localStorage.setItem(VOLUME_KEY, JSON.stringify({ v: sound.volume, m: sound.muted })); } catch (e) { /* private mode */ }
  }

  const savedVolume = readVolume();
  if (volumeWorks) sound.volume = savedVolume.v || 1;
  sound.muted = savedVolume.m;
  el.volume.hidden = !volumeWorks;
  paintVolume();

  el.volume.addEventListener('input', () => {
    const v = Number(el.volume.value) / 100;
    sound.volume = v;
    sound.muted = v === 0;
    paintVolume();
  });
  el.volume.addEventListener('change', storeVolume);

  el.mute.addEventListener('click', () => {
    // ნულამდე დაწეულ ხმას გამორთვის მოხსნისას ნახევარზე ვაბრუნებთ.
    if (sound.muted && sound.volume === 0) sound.volume = 0.5;
    sound.muted = !sound.muted;
    paintVolume();
    storeVolume();
  });

  function seekFromEvent(e) {
    const rect = el.bar.getBoundingClientRect();
    const total = duration();
    if (!total) return;
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    sound.currentTime = ratio * total;
  }

  el.bar.addEventListener('click', seekFromEvent);
  el.bar.addEventListener('keydown', e => {
    if (!duration()) return;
    if (e.key === 'ArrowRight') { sound.currentTime += 15; e.preventDefault(); }
    if (e.key === 'ArrowLeft') { sound.currentTime -= 15; e.preventDefault(); }
  });

  sound.addEventListener('timeupdate', paintProgress);
  sound.addEventListener('loadedmetadata', () => {
    if (pendingSeek) {
      sound.currentTime = pendingSeek;
      pendingSeek = 0;
    }
    paintProgress();
    positionState();
  });
  sound.addEventListener('play', () => {
    pausedAt = 0;
    setPlaybackState('playing');
    paintPlayState();
  });
  sound.addEventListener('pause', () => {
    pausedAt = Date.now();
    clearTimeout(stuckTimer);
    setPlaybackState('paused');
    save(); paintPlayState();
  });
  sound.addEventListener('seeked', positionState);
  sound.addEventListener('ratechange', positionState);
  sound.addEventListener('ended', () => {
    // ჩუმი პაუზის დროს ეპიზოდი ბოლომდე „ჩაიკრა“ — ეს მოსმენა არ არის.
    // ვიზიტორი იქ რჩება, სადაც დააპაუზა.
    const s = endSoft();
    if (s) {
      sound.currentTime = s.at;
      setPlaybackState('paused');
      save(); paintProgress(); paintPlayState();
      return;
    }
    pausedAt = 0;
    clearTimeout(stuckTimer);
    setPlaybackState('none');
    save(); paintList(); paintPlayState();
    if (current && window.efcTrack) efcTrack('audio_complete', { sermon_title: current.title });
  });

  // პროგრესს პერიოდულადაც ვინახავთ — ჩანართის დახურვა pause-ს
  // ყოველთვის არ იწვევს.
  setInterval(() => { if (!isPaused()) save(); }, 10000);
  window.addEventListener('pagehide', save);

  function save() {
    const total = duration();
    const at = position();
    if (!current || !total || at < AUDIO_MIN_SECONDS) return;
    const map = readListened();
    const done = at >= total * AUDIO_DONE_RATIO;
    map[current.id] = {
      t: done ? 0 : Math.floor(at),
      d: Math.floor(total),
      done: done,
      at: Date.now()
    };
    writeListened(map);
  }

  // ── ჩაკეტილი ეკრანი ───────────────────────────────────────────
  function mediaSession(ep) {
    if (!('mediaSession' in navigator)) return;
    const src = ep.image || coverUrl;
    const art = src ? [{ src: src, sizes: '512x512' }] : [];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: ep.title,
      artist: ep.preacher || 'ქუთაისის სახარების რწმენის ეკლესია',
      album: 'ქადაგებები',
      artwork: art
    });
    const set = (action, handler) => {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch (e) { /* ბრაუზერს არ აქვს */ }
    };
    // ჩაკეტილი ეკრანის „დაკვრაც“ აღდგენით მიდის — იქ კავშირი ყველაზე ხშირად წყდება.
    set('play', lockScreenPlay);
    set('pause', lockScreenPause);
    // ჩუმ პაუზაში გადახვევა დამახსოვრებულ წამს ცვლის და არა ფაილს.
    set('seekbackward', () => {
      if (soft) { soft.at = Math.max(0, soft.at - 15); positionState(); return; }
      sound.currentTime = Math.max(0, sound.currentTime - 15);
    });
    set('seekforward', () => {
      if (soft) { soft.at = Math.min(duration() || soft.at + 15, soft.at + 15); positionState(); return; }
      sound.currentTime += 15;
    });
    set('previoustrack', () => step(-1));
    set('nexttrack', () => step(1));
  }

  // ჩაკეტილი ეკრანი თავისით ვერ ხვდება, ახლა უკრავს თუ არა. სწორი
  // მდგომარეობის გარეშე „დაკვრაზე“ დაჭერა iOS-ზე „პაუზად“ იგზავნება.
  function setPlaybackState(state) {
    if (!('mediaSession' in navigator)) return;
    try { navigator.mediaSession.playbackState = state; } catch (e) { /* ძველი ბრაუზერი */ }
    positionState();
  }

  function positionState() {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    const total = duration();
    if (!total) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: total,
        playbackRate: sound.playbackRate || 1,
        position: Math.min(position(), total)
      });
    } catch (e) { /* არასწორი მნიშვნელობები */ }
  }

  function step(by) {
    if (!current) return;
    const i = episodes.findIndex(x => x.id === current.id);
    const next = episodes[i + by];
    if (next) load(next, true);
  }

  // ── მინი-პლეერი ───────────────────────────────────────────────
  // ჩნდება მაშინ, როცა დაკვრა მიმდინარეობს და პლეერი ეკრანზე აღარაა.
  function updateMini() {
    if (!current || miniDismissed) { hideMini(); return; }
    const rect = document.getElementById('audioPlayer').getBoundingClientRect();
    const offScreen = rect.bottom < 0 || rect.top > window.innerHeight;
    if ((!sound.paused || sound.currentTime > 0) && (offScreen || panel.hidden)) showMini();
    else hideMini();
  }

  function showMini() {
    if (!el.mini.hidden) return;
    el.mini.hidden = false;
    document.body.classList.add('has-mini-player');
    requestAnimationFrame(() => el.mini.classList.add('is-open'));
    setTimeout(() => el.mini.classList.add('is-open'), 50);
  }

  function hideMini() {
    if (el.mini.hidden) return;
    el.mini.classList.remove('is-open');
    document.body.classList.remove('has-mini-player');
    setTimeout(() => { el.mini.hidden = true; }, 300);
  }

  el.miniClose.addEventListener('click', () => {
    sound.pause();
    miniDismissed = true;
    hideMini();
  });

  window.addEventListener('scroll', updateMini, { passive: true });
  window.addEventListener('resize', updateMini, { passive: true });

  // ── გაშვება ───────────────────────────────────────────────────
  if (previewMode()) {
    console.info('აუდიო ჩანართი სანიმუშო ეპიზოდებზე მუშაობს — podcast.js-ში PODCAST_FEED ცარიელია.');
  }

  if (PODCAST_LINKS.spotify) { el.spotify.href = PODCAST_LINKS.spotify; el.spotify.hidden = false; }
  if (PODCAST_LINKS.apple) { el.apple.href = PODCAST_LINKS.apple; el.apple.hidden = false; }
  el.elsewhere.hidden = !(PODCAST_LINKS.spotify || PODCAST_LINKS.apple);

  if (previewMode()) {
    // სატესტო რეჟიმი აშკარად უნდა ჩანდეს, რომ ნამდვილ სექციად არ ჩაითვალოს.
    const note = document.createElement('p');
    note.className = 'audio-preview-note';
    note.textContent = 'სატესტო რეჟიმი — ეპიზოდები სანიმუშოა და ხმა არ აქვს. მხოლოდ დიზაინის სანახავად.';
    panel.insertBefore(note, panel.firstElementChild);
    // გარეკანის ადგილას ლოგო, რომ ბარათი სრულად გამოიყურებოდეს.
    coverUrl = '../icons/icon-512.png';
  }

  // სიას ორჯერ ვხატავთ: ჯერ ქეშიდან (მაშინვე), მერე ლენტიდან (როცა მოვა).
  // მეორე ნახატი მიმდინარე დაკვრას არ წყვეტს — მხოლოდ სია და გარეკანი
  // ახლდება, თუ რამე შეიცვალა.
  function show(items) {
    if (!items.length) return;                    // ჩანართს არ ვაჩენთ
    if (coverUrl && !(current && current.image)) {
      el.cover.style.backgroundImage = 'url("' + coverUrl + '")';
    }

    const changed = items.length !== episodes.length
      || items.some((ep, i) => String(ep.id) !== String(episodes[i].id));
    if (episodes.length && !changed) return;

    episodes = items;
    paintYears();
    filter(el.search.value);

    tab.hidden = false;
    // პლეერში მზადაა ის ეპიზოდი, რომელსაც ვიზიტორი ბოლოს უსმენდა და ჯერ
    // არ დაუსრულებია (გვერდის გადატვირთვის შემდეგაც), სხვა შემთხვევაში —
    // უახლესი. თავისით არ ირთვება. თუ ლენტამ ახალი ეპიზოდი მოიტანა და
    // ვიზიტორს ჯერ არაფერი ჩაურთავს, პლეერშიც ის ჩადგება.
    let lastId = '';
    try { lastId = localStorage.getItem(LAST_KEY) || ''; } catch (e) { /* private mode */ }
    const lastState = readListened()[lastId];
    const unfinished = lastState && !lastState.done && lastState.t > 0
      && episodes.find(ep => String(ep.id) === lastId);
    const pick = unfinished || episodes[0];
    const idle = sound.paused && !sound.currentTime;
    if (!current || (idle && current.id !== pick.id)) {
      load(pick, false);
      paintProgress();
      paintPlayState();
    }
  }

  if (!PODCAST_FEED) {
    show(PREVIEW_EPISODES);
    return;
  }

  const cached = readFeedCache();
  if (cached) {
    coverUrl = cached.cover;
    show(cached.items);
  }
  fetchFeed().then(show);
})();
