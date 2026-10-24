/**
 * აუდიო ბიბლია (pages/audio-bible.html) — მხოლოდ მოსასმენად, ტექსტის გარეშე.
 *
 * mp3 ჩვენთან არ ინახება — ორიგინალი სერვერებიდან (Faith Comes By Hearing,
 * allgeo.org) იკითხება, როგორც mybible.ge-ზე. data/audio-bible.json-ში
 * მხოლოდ ბმულებია: books[წიგნი] = [[თავი, თავსართი, გზა, ბოლო თავი?], …].
 * ფსალმუნები და იგავნი ბლოკებადაა, ამიტომ ერთი ჩანაწერი რამდენიმე თავს
 * ფარავს. ჩანაწერი მხოლოდ „დაკვრაზე" იწყებს ჩამოტვირთვას (preload=none).
 *
 * ბოლოს მოსმენილი თავი და ადგილი ინახება — შემდეგ ვიზიტზე იქიდან გრძელდება.
 */
(function () {
  'use strict';

  const root = document.getElementById('audioBible');
  if (!root) return;

  const SCRIPT_SRC = (document.currentScript && document.currentScript.src) || location.href;
  const DATA_URL = new URL('data/audio-bible.json', SCRIPT_SRC).href;
  const POS_KEY = 'efck-audio-bible-pos';
  const RATE_KEY = 'efck-audio-bible-rate';
  const VOLUME_KEY = 'efck-audio-bible-volume';
  const RATES = [1, 1.25, 1.5, 0.75];
  const NT_START = 40;

  const els = {
    audio: document.getElementById('abAudio'),
    play: document.getElementById('abPlay'),
    prev: document.getElementById('abPrev'),
    next: document.getElementById('abNext'),
    book: document.getElementById('abNowBook'),
    chapter: document.getElementById('abNowChapter'),
    seek: document.getElementById('abSeek'),
    cur: document.getElementById('abCur'),
    dur: document.getElementById('abDur'),
    rate: document.getElementById('abRate'),
    volumeBox: document.getElementById('abVolumeBox'),
    volume: document.getElementById('abVolume'),
    mute: document.getElementById('abMute'),
    status: document.getElementById('abStatus'),
    tabs: Array.prototype.slice.call(root.querySelectorAll('.ab-tab')),
    books: document.getElementById('abBooks'),
    chapters: document.getElementById('abChapters'),
    chaptersTitle: document.getElementById('abChaptersTitle'),
    chapterGrid: document.getElementById('abChapterGrid'),
    missing: document.getElementById('abMissing'),
    player: root.querySelector('.ab-player'),
    mini: document.getElementById('abMini'),
    miniPlay: document.getElementById('abMiniPlay'),
    miniInfo: document.getElementById('abMiniInfo'),
    miniNext: document.getElementById('abMiniNext'),
    miniBook: document.getElementById('abMiniBook'),
    miniChapter: document.getElementById('abMiniChapter'),
    miniFill: document.getElementById('abMiniFill')
  };

  let data = null;
  let track = null;        // რაც ახლა პლეერშია
  let openBook = null;     // რომლის თავებიც ჩანს
  let testament = 'NT';
  let seeking = false;
  let resumeAt = 0;
  let saveTimer = 0;

  function trackAt(book, i) {
    const list = data.books[book];
    const t = list && list[i];
    if (!t) return null;
    return { book: book, index: i, from: t[0], to: t[3] || t[0], src: data.bases[t[1]] + t[2] };
  }

  // შემდეგი: იმავე წიგნის შემდეგი ჩანაწერი, ან მომდევნო წიგნის პირველი.
  // აუდიოს გარეშე დარჩენილ წიგნებზე (იერემიადან მალაქიამდე) ვჩერდებით.
  function nextOf(t) { return t && (trackAt(t.book, t.index + 1) || trackAt(t.book + 1, 0)); }
  function prevOf(t) {
    if (!t) return null;
    if (t.index > 0) return trackAt(t.book, t.index - 1);
    const list = data.books[t.book - 1];
    return list ? trackAt(t.book - 1, list.length - 1) : null;
  }

  function rangeLabel(t) {
    return t.from === t.to ? String(t.from) : t.from + '–' + t.to;
  }

  function chapterLabel(t) {
    if (t.book === 19) return 'ფსალმუნები ' + rangeLabel(t);
    if (t.from !== t.to) return 'თავები ' + rangeLabel(t);
    return 'თავი ' + t.from;
  }

  function fmtTime(s) {
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + sec : m + ':' + sec;
  }

  function isPlaying() { return !els.audio.paused && !els.audio.ended; }

  function setStatus(msg) {
    els.status.textContent = msg || '';
    els.status.hidden = !msg;
  }

  function savePos() {
    if (!track) return;
    try {
      localStorage.setItem(POS_KEY, JSON.stringify({
        book: track.book, index: track.index, time: Math.floor(els.audio.currentTime || 0)
      }));
    } catch (e) { /* private mode */ }
  }

  /* ---------- პლეერი ---------- */

  function renderPlayer() {
    const playing = isPlaying();
    els.play.innerHTML = '<i class="fa-solid ' + (playing ? 'fa-pause' : 'fa-play') + '" aria-hidden="true"></i>';
    els.play.setAttribute('aria-label', playing ? 'პაუზა' : 'დაკვრა');
    els.play.title = playing ? 'პაუზა' : 'დაკვრა';
    root.classList.toggle('is-playing', playing);
    els.prev.disabled = !prevOf(track);
    els.next.disabled = !nextOf(track);
    els.miniPlay.innerHTML = els.play.innerHTML;
    els.miniPlay.setAttribute('aria-label', els.play.getAttribute('aria-label'));
    els.miniNext.disabled = els.next.disabled;
    Array.prototype.forEach.call(root.querySelectorAll('.ab-chapter.is-current, .ab-book.is-current'), function (el) {
      el.classList.remove('is-current');
      el.removeAttribute('aria-current');
    });
    if (!track) return;
    const ch = els.chapterGrid.querySelector('.ab-chapter[data-book="' + track.book + '"][data-index="' + track.index + '"]');
    if (ch) { ch.classList.add('is-current'); ch.setAttribute('aria-current', 'true'); }
    const bk = els.books.querySelector('.ab-book[data-book="' + track.book + '"]');
    if (bk) bk.classList.add('is-current');
  }

  function loadTrack(t, opts) {
    opts = opts || {};
    track = t;
    resumeAt = opts.at || 0;
    els.audio.src = t.src;
    els.audio.playbackRate = Number(els.rate.dataset.rate) || 1;
    els.book.textContent = data.names[t.book - 1];
    els.chapter.textContent = chapterLabel(t);
    els.miniBook.textContent = els.book.textContent;
    els.miniChapter.textContent = els.chapter.textContent;
    els.miniFill.style.width = '0';
    els.seek.value = '0';
    els.seek.max = '0';
    els.seek.disabled = true;
    els.cur.textContent = fmtTime(resumeAt);
    els.dur.textContent = '–:––';
    setStatus('');
    if ('mediaSession' in navigator && typeof MediaMetadata === 'function') {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: data.names[t.book - 1] + ', ' + chapterLabel(t),
        artist: 'აუდიო ბიბლია',
        album: 'სახარების რწმენის ეკლესია'
      });
    }
    if (opts.play) play();
    renderPlayer();
    savePos();
  }

  function play() {
    if (!track) return;
    const p = els.audio.play();
    if (p && p.catch) p.catch(function (err) {
      if (err && err.name !== 'AbortError') renderPlayer();
    });
  }

  function step(t) {
    if (!t) return;
    if (openBook !== t.book) showBook(t.book, false);
    loadTrack(t, { play: true });
  }

  /* ---------- წიგნები და თავები ---------- */

  function renderBooks() {
    const from = testament === 'OT' ? 1 : NT_START;
    const to = testament === 'OT' ? NT_START - 1 : 66;
    els.books.innerHTML = '';
    const missing = [];
    for (let b = from; b <= to; b++) {
      if (!data.books[b]) { missing.push(data.names[b - 1]); continue; }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ab-book';
      btn.dataset.book = String(b);
      btn.textContent = data.names[b - 1];
      if (b === openBook) btn.classList.add('is-open');
      btn.addEventListener('click', function () { showBook(b, true); });
      els.books.appendChild(btn);
    }
    els.missing.hidden = !missing.length;
    els.missing.textContent = missing.length
      ? 'ამ წიგნების აუდიო ჯერ არ გვაქვს: ' + missing.join(', ') + '.'
      : '';
    els.tabs.forEach(function (tab) {
      const on = tab.dataset.testament === testament;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    renderPlayer();
  }

  function showBook(b, scroll) {
    openBook = b;
    const t = b >= NT_START ? 'NT' : 'OT';
    if (t !== testament) testament = t;
    renderBooks();
    els.chaptersTitle.textContent = data.names[b - 1];
    els.chapterGrid.innerHTML = '';
    els.chapterGrid.classList.toggle('is-wide', data.books[b].some(function (x) { return x[3]; }));
    data.books[b].forEach(function (_, i) {
      const t = trackAt(b, i);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ab-chapter';
      btn.dataset.book = String(b);
      btn.dataset.index = String(i);
      btn.textContent = rangeLabel(t);
      btn.setAttribute('aria-label', data.names[b - 1] + ', ' + chapterLabel(t));
      btn.addEventListener('click', function () {
        if (track && track.src === t.src) {
          if (isPlaying()) els.audio.pause(); else play();
          return;
        }
        loadTrack(t, { play: true });
      });
      els.chapterGrid.appendChild(btn);
    });
    els.chapters.hidden = false;
    renderPlayer();
    if (scroll) {
      const r = els.chapters.getBoundingClientRect();
      if (r.top > window.innerHeight - 120 || r.top < 0) {
        els.chapters.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  /* ---------- მოვლენები ---------- */

  function bind() {
    els.play.addEventListener('click', function () {
      if (!track) return;
      if (isPlaying()) els.audio.pause(); else play();
    });
    els.prev.addEventListener('click', function () {
      // ჩანაწერის დასაწყისიდან შორს — ჯერ თავიდან, როგორც ყველა პლეერში.
      if (els.audio.currentTime > 5) { els.audio.currentTime = 0; return; }
      step(prevOf(track));
    });
    els.next.addEventListener('click', function () { step(nextOf(track)); });
    els.rate.addEventListener('click', function () {
      const cur = Number(els.rate.dataset.rate) || 1;
      setRate(RATES[(RATES.indexOf(cur) + 1) % RATES.length]);
    });
    els.tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        testament = tab.dataset.testament;
        renderBooks();
      });
    });

    els.seek.addEventListener('input', function () {
      seeking = true;
      els.cur.textContent = fmtTime(Number(els.seek.value));
    });
    els.seek.addEventListener('change', function () {
      seeking = false;
      els.audio.currentTime = Number(els.seek.value);
    });

    const a = els.audio;
    a.addEventListener('play', renderPlayer);
    a.addEventListener('pause', function () { renderPlayer(); savePos(); });
    a.addEventListener('loadedmetadata', function () {
      if (resumeAt && resumeAt < a.duration - 3) a.currentTime = resumeAt;
      resumeAt = 0;
      els.seek.max = String(Math.floor(a.duration || 0));
      els.seek.disabled = false;
      els.dur.textContent = fmtTime(a.duration);
    });
    a.addEventListener('timeupdate', function () {
      if (!seeking) {
        els.seek.value = String(Math.floor(a.currentTime || 0));
        els.cur.textContent = fmtTime(a.currentTime);
      }
      if (a.duration) els.miniFill.style.width = (a.currentTime / a.duration * 100).toFixed(2) + '%';
      clearTimeout(saveTimer);
      saveTimer = setTimeout(savePos, 1000);
    });
    a.addEventListener('waiting', function () { root.classList.add('is-buffering'); });
    a.addEventListener('playing', function () { root.classList.remove('is-buffering'); });
    a.addEventListener('ended', function () {
      const n = nextOf(track);
      if (n) step(n);
      else { renderPlayer(); setStatus('ჩანაწერები აქ მთავრდება — აირჩიე სხვა წიგნი.'); }
    });
    a.addEventListener('error', function () {
      if (!a.getAttribute('src')) return;
      root.classList.remove('is-buffering');
      renderPlayer();
      setStatus('ჩანაწერი ვერ ჩაიტვირთა. შეამოწმე ინტერნეტი და სცადე თავიდან.');
    });

    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('nexttrack', function () { step(nextOf(track)); });
        navigator.mediaSession.setActionHandler('previoustrack', function () { step(prevOf(track)); });
      } catch (e) { /* ძველი ბრაუზერი */ }
    }

    bindMini();
    bindVolume();

    // ჰარი = პაუზა/დაკვრა, თუ ღილაკზე ან ველზე არ ვართ.
    document.addEventListener('keydown', function (e) {
      if (e.key !== ' ' || e.target.closest('button, input, select, textarea, a')) return;
      e.preventDefault();
      els.play.click();
    });
  }

  // თავს რომ ირჩევ, დიდი პლეერი ეკრანს ზემოთ რჩება — ქვემოთ პატარა
  // პლეერი ჩნდება. მხოლოდ მაშინ, როცა დიდი ზემოთაა გასული, არა ქვემოთ.
  function bindMini() {
    els.miniPlay.addEventListener('click', function () { els.play.click(); });
    els.miniNext.addEventListener('click', function () { els.next.click(); });
    els.miniInfo.addEventListener('click', function () {
      els.player.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    let shown = false;
    // ერთი getBoundingClientRect იაფია — scroll-ზე პირდაპირ ვითვლით.
    function check() {
      // დიდი პლეერის ღილაკები (ქვედა ნახევარი) ზემოთ რომ გაცდა — მაშინ.
      const r = els.player.getBoundingClientRect();
      const show = !!track && r.bottom < r.height / 2;
      if (show === shown) return;
      shown = show;
      els.mini.classList.toggle('is-visible', show);
      els.mini.setAttribute('aria-hidden', show ? 'false' : 'true');
      Array.prototype.forEach.call(els.mini.querySelectorAll('button'), function (b) {
        b.tabIndex = show ? 0 : -1;
      });
      document.body.classList.toggle('ab-mini-on', show);
    }
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    els.audio.addEventListener('loadstart', check);
  }

  /* ---------- ხმა ---------- */

  let lastVolume = 1;

  function renderVolume() {
    const a = els.audio;
    const v = a.muted ? 0 : a.volume;
    els.volume.value = String(Math.round(v * 100));
    const icon = v === 0 ? 'fa-volume-xmark' : v < 0.5 ? 'fa-volume-low' : 'fa-volume-high';
    els.mute.innerHTML = '<i class="fa-solid ' + icon + '" aria-hidden="true"></i>';
    const label = v === 0 ? 'ხმის ჩართვა' : 'ხმის გათიშვა';
    els.mute.setAttribute('aria-label', label);
    els.mute.title = label;
  }

  function setVolume(v) {
    v = Math.min(1, Math.max(0, v));
    els.audio.volume = v;
    els.audio.muted = v === 0;
    if (v > 0) lastVolume = v;
    renderVolume();
    try { localStorage.setItem(VOLUME_KEY, String(v)); } catch (e) { /* private mode */ }
  }

  function bindVolume() {
    // iPhone/iPad ხმას პროგრამულად არ აძლევს შეცვლის საშუალებას (მხოლოდ
    // ტელეფონის ღილაკებით) — იქ სლაიდერი არაფერს გააკეთებდა, ამიტომ ვმალავთ.
    const probe = new Audio();
    probe.volume = 0.5;
    if (probe.volume !== 0.5) { els.volumeBox.hidden = true; return; }

    const raw = (function () { try { return localStorage.getItem(VOLUME_KEY); } catch (e) { return null; } })();
    const saved = raw === null ? 1 : Number(raw);
    setVolume(saved >= 0 && saved <= 1 ? saved : 1);

    els.volume.addEventListener('input', function () { setVolume(Number(els.volume.value) / 100); });
    els.mute.addEventListener('click', function () {
      setVolume(els.audio.muted || els.audio.volume === 0 ? (lastVolume || 1) : 0);
    });
  }

  function setRate(r) {
    els.rate.dataset.rate = String(r);
    els.rate.textContent = String(r).replace('.', ',') + '×';
    els.audio.playbackRate = r;
    try { localStorage.setItem(RATE_KEY, String(r)); } catch (e) { /* private mode */ }
  }

  function init(d) {
    data = d;
    bind();
    const savedRate = Number((function () { try { return localStorage.getItem(RATE_KEY); } catch (e) { return null; } })());
    if (RATES.indexOf(savedRate) !== -1) setRate(savedRate);

    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(POS_KEY)); } catch (e) { /* private mode */ }
    // პირველად მოსულს იოანეს სახარება ხვდება — როგორც ბიბლიის გვერდზე.
    const start = (saved && trackAt(saved.book, saved.index)) || trackAt(43, 0);
    showBook(start.book, false);
    loadTrack(start, { at: saved && saved.book === start.book && saved.index === start.index ? saved.time : 0 });
    root.classList.remove('is-loading');
  }

  // GitHub Pages ბრაუზერს ფაილს 10 წუთით ანახვინებს — ბმულების სიის
  // განახლების შემდეგ ძველი ასლი გვერდს ტეხავდა. no-cache ყოველ ჯერზე
  // ამოწმებს (უცვლელზე 304, ბაიტები არ მოდის).
  fetch(DATA_URL, { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('audio-bible ' + r.status); return r.json(); })
    .then(function (d) {
      if (!d || !d.books || !Array.isArray(d.names)) throw new Error('audio-bible: unexpected data');
      init(d);
    })
    .catch(function (err) {
      if (window.console) console.error(err);
      root.classList.remove('is-loading');
      setStatus('აუდიო ბიბლია ამჟამად ვერ ჩაიტვირთა. სცადე გვერდის განახლება.');
    });
})();
