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
const FEED_CACHE_KEY = 'efc:podcast:v2';

// მოსმენის ადგილი — იმავე პრინციპით, რაც ვიდეოს პროგრესს აქვს.
const AUDIO_KEY = 'efc:listen:v1';
const AUDIO_MIN_SECONDS = 15;      // ამაზე ნაკლები დაწყებად არ ითვლება
const AUDIO_DONE_RATIO = 0.95;
const AUDIO_MAX_ENTRIES = 300;

const SPEEDS = [1, 1.25, 1.5, 2];

// სანამ ნამდვილი ლენტა არ დაემატება, ჩანართი ამ სანიმუშო ეპიზოდებით
// მუშაობს — რომ დიზაინი ადგილზე ჩანდეს. PODCAST_FEED-ის შევსებისთანავე
// მათ ნამდვილი ეპიზოდები ჩაანაცვლებს.
const PREVIEW_EPISODES = [
  { id: 'p1', title: 'ჩემი ეკლესია', url: '', date: '2026-08-30 11:00:00', duration: 2292 },
  { id: 'p2', title: 'უკეთესობა ვაქციოთ ნორმად', url: '', date: '2026-08-23 11:00:00', duration: 2465 },
  { id: 'p3', title: 'როგორი ეკლესიისთვის დაბრუნდება ქრისტე', url: '', date: '2026-08-16 11:00:00', duration: 2140 },
  { id: 'p4', title: 'სამი რამ, რაც უფალს მოსწონს ჩვენში', url: '', date: '2026-08-09 11:00:00', duration: 2010 }
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
    meta: document.getElementById('audioMeta'),
    bar: document.getElementById('audioBar'),
    fill: document.getElementById('audioFill'),
    dot: document.getElementById('audioDot'),
    cur: document.getElementById('audioCur'),
    left: document.getElementById('audioLeft'),
    play: document.getElementById('audioPlayBtn'),
    speed: document.getElementById('audioSpeed'),
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
    miniFill: document.getElementById('audioMiniFill'),
    miniClose: document.getElementById('audioMiniClose')
  };

  const sound = new Audio();
  sound.preload = 'none';                          // ჩატვირთვა მხოლოდ დაკვრისას

  // script.js დიდი პაუზის შემდეგ გვერდს თავიდან ტვირთავს — მიმდინარე
  // მოსმენა ამას არ უნდა შეეწიროს.
  (window.efcBusyChecks = window.efcBusyChecks || []).push(() => !sound.paused);

  let episodes = [];
  let shown = [];
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
      + '<span class="audio-item-date">' + esc(geoDate(ep.date)) + note + '</span>'
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

  function filter(query) {
    const q = (query || '').trim().toLowerCase();
    shown = q
      ? episodes.filter(ep =>
          ep.title.toLowerCase().indexOf(q) > -1 ||
          geoDate(ep.date).toLowerCase().indexOf(q) > -1)
      : episodes.slice();

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
    el.meta.textContent = [geoDate(ep.date), ep.duration ? clock(ep.duration) : '']
      .filter(Boolean).join(' · ');
    el.miniTitle.textContent = ep.title;

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
      sound.play().catch(() => { /* ავტომატური დაკვრა აიკრძალა */ });
      if (window.efcTrack) efcTrack('audio_play', { sermon_title: ep.title, resumed: pendingSeek ? 'yes' : 'no' });
    }
  }

  // ლენტის ხანგრძლივობა სარეზერვოა: ბრაუზერისას ყოველთვის არ ვენდობით.
  function duration() {
    if (isFinite(sound.duration) && sound.duration > 0) return sound.duration;
    return (current && current.duration) || 0;
  }

  function paintProgress() {
    const total = duration();
    const pct = total ? (sound.currentTime / total) * 100 : 0;
    el.fill.style.width = pct + '%';
    el.dot.style.left = pct + '%';
    el.miniFill.style.width = pct + '%';
    el.cur.textContent = clock(sound.currentTime);
    el.left.textContent = total ? '-' + clock(total - sound.currentTime) : '';
    el.bar.setAttribute('aria-valuenow', String(Math.round(pct)));
  }

  function paintPlayState() {
    const icon = sound.paused ? 'fa-play' : 'fa-pause';
    const label = sound.paused ? 'დაკვრა' : 'პაუზა';
    el.play.querySelector('i').className = 'fa-solid ' + icon;
    el.play.setAttribute('aria-label', label);
    el.miniPlay.querySelector('i').className = 'fa-solid ' + icon;
    el.miniPlay.setAttribute('aria-label', label);
    updateMini();
  }

  el.play.addEventListener('click', () => {
    if (!current || !current.url) return;
    if (sound.paused) sound.play().catch(() => {});
    else sound.pause();
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
  });
  sound.addEventListener('play', paintPlayState);
  sound.addEventListener('pause', () => { save(); paintPlayState(); });
  sound.addEventListener('ended', () => {
    save(); paintList(); paintPlayState();
    if (current && window.efcTrack) efcTrack('audio_complete', { sermon_title: current.title });
  });

  // პროგრესს პერიოდულადაც ვინახავთ — ჩანართის დახურვა pause-ს
  // ყოველთვის არ იწვევს.
  setInterval(() => { if (!sound.paused) save(); }, 10000);
  window.addEventListener('pagehide', save);

  function save() {
    const total = duration();
    if (!current || !total || sound.currentTime < AUDIO_MIN_SECONDS) return;
    const map = readListened();
    const done = sound.currentTime >= total * AUDIO_DONE_RATIO;
    map[current.id] = {
      t: done ? 0 : Math.floor(sound.currentTime),
      d: Math.floor(total),
      done: done,
      at: Date.now()
    };
    writeListened(map);
  }

  // ── ჩაკეტილი ეკრანი ───────────────────────────────────────────
  function mediaSession(ep) {
    if (!('mediaSession' in navigator)) return;
    const art = coverUrl ? [{ src: coverUrl, sizes: '512x512', type: 'image/png' }] : [];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: ep.title,
      artist: 'ქუთაისის სახარების რწმენის ეკლესია',
      album: 'ქადაგებები',
      artwork: art
    });
    const set = (action, handler) => {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch (e) { /* ბრაუზერს არ აქვს */ }
    };
    set('play', () => sound.play());
    set('pause', () => sound.pause());
    set('seekbackward', () => { sound.currentTime = Math.max(0, sound.currentTime - 15); });
    set('seekforward', () => { sound.currentTime += 15; });
    set('previoustrack', () => step(-1));
    set('nexttrack', () => step(1));
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
    filter(el.search.value);

    tab.hidden = false;
    // ბოლო ეპიზოდი პლეერში მზადაა, მაგრამ თავისით არ ირთვება. თუ ლენტამ
    // ახალი ეპიზოდი მოიტანა და ვიზიტორს ჯერ არაფერი ჩაურთავს, პლეერშიც
    // ახალი ჩადგება — ძველი (ქეშიდან ჩატვირთული) არ დარჩება.
    const idle = sound.paused && !sound.currentTime;
    if (!current || (idle && current.id !== episodes[0].id)) {
      load(episodes[0], false);
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
