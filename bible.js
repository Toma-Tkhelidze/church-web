/**
 * ბიბლიის მკითხველი — ტექსტი holybible.ge-დან მოდის (მათი თანხმობით,
 * 2026 სექტემბერი) და პირდაპირ ჩვენს გვერდზე, ჩვენი დიზაინით იკითხება.
 *
 * service.php-ის ენა: w = წიგნის ნომერი + 3 (სიის პირველი სამი ელემენტი
 * სათაურებია: „ბიბლია", „ძველი აღთქმა", „ახალი აღთქმა"), t = თავი,
 * mv = თარგმანის სახელი ისე, როგორც მათ საიტზე წერია. პასუხში
 * bibleData — მუხლები, tavi[0].cc — ამ წიგნის თავების რაოდენობა.
 *
 * ერთი მოთხოვნა თავზე; წამოღებული თავი მეორედ აღარ იტვირთება.
 */
(function () {
  'use strict';

  const API = 'https://holybible.ge/service.php';
  const POS_KEY = 'efck-bible-pos';
  const FONT_KEY = 'efck-bible-font';
  const THEME_KEY = 'efck-bible-theme';
  const BOOK_MQ = window.matchMedia('(min-width: 1000px)');
  const BOOK_OFFSET = 3;
  const FETCH_TIMEOUT = 10000;
  const SITE = 'https://holybible.ge';
  const NT_START = 40;

  // სახელები ზუსტად ისეა, როგორც holybible.ge-ს ბაზაშია — ტირეებიც კი.
  // „ახალი ქვეყნიერების თარგმანი" (იეჰოვას მოწმეების გამოცემა) განზრახ არ არის.
  const VERSIONS = [
    { id: '2015', name: 'ახალი გადამუშავებული გამოცემა 2015', short: 'გადამუშავებული 2015' },
    { id: 'sbs2013', name: 'სბს–2013', short: 'ბიბლიური საზოგადოება 2013' },
    { id: 'sbs2001', name: 'სბს–სტოკჰოლმი 2001', short: 'სტოკჰოლმი 2001' },
    { id: 'patr', name: 'საპატრიარქო – orthodoxy.ge', short: 'საპატრიარქოს გამოცემა' },
    { id: 'mtskheta', name: 'მცხეთური ხელნაწერი–გ. მთაწმინდელი', short: 'მცხეთური ხელნაწერი (ძველი ქართული)' },
    { id: 'nt1985', name: 'ახალი აღთქმა, სტოკჰოლმი 1985', short: 'ახალი აღთქმა 1985', ntOnly: true },
    { id: 'adishi', name: 'ადიშის ოთხთავი 897 წ. – ძველი მონუსკრიპტები', short: 'ადიშის ოთხთავი (897 წ.)', ntOnly: true }
  ];

  const root = document.getElementById('bibleReader');
  if (!root) return;

  const els = {
    version: root.querySelector('#bibleVersion'),
    book: root.querySelector('#bibleBook'),
    chapter: root.querySelector('#bibleChapter'),
    prev: root.querySelector('#biblePrev'),
    next: root.querySelector('#bibleNext'),
    prevBottom: root.querySelector('#biblePrevBottom'),
    nextBottom: root.querySelector('#bibleNextBottom'),
    title: root.querySelector('#bibleTitle'),
    text: root.querySelector('#bibleText'),
    status: root.querySelector('#bibleStatus'),
    fontDown: root.querySelector('#bibleFontDown'),
    fontUp: root.querySelector('#bibleFontUp'),
    bookView: root.querySelector('#bibleBookView'),
    pageInfo: root.querySelector('#biblePageInfo'),
    section: document.getElementById('bibleSection'),
    themes: Array.prototype.slice.call(root.querySelectorAll('.bible-theme'))
  };

  const memo = new Map();
  const state = { version: VERSIONS[0], books: [], book: 1, chapter: 1, chapters: 1, spread: 0, spreads: 1 };
  let loadSeq = 0;

  async function fetchChapter(version, book, chapter) {
    const key = version.id + '/' + book + '/' + chapter;
    if (memo.has(key)) return memo.get(key);
    const url = API + '?w=' + (book + BOOK_OFFSET) + '&t=' + chapter
      + '&m=0&s=&v1=&v2=&v3=&l1=&l2=&l3=&mv=' + encodeURIComponent(version.name)
      + '&language=geo&page=1';
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl && setTimeout(function () { ctrl.abort(); }, FETCH_TIMEOUT);
    let data;
    try {
      const res = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
      if (!res.ok) throw new Error('holybible.ge ' + res.status);
      data = await res.json();
      if (!data || !Array.isArray(data.bibleData)) throw new Error('holybible.ge: unexpected response');
    } finally {
      if (timer) clearTimeout(timer);
    }
    const result = {
      books: (data.bibleNames || []).slice(BOOK_OFFSET),
      chapters: Number(data.tavi && data.tavi[0] && data.tavi[0].cc) || 1,
      verses: (data.bibleData || []).map(function (v) {
        return { n: Number(v.muxli), text: String(v.bv || '').trim() };
      })
    };
    memo.set(key, result);
    return result;
  }

  function setStatus(msg, isError, actions) {
    els.status.textContent = msg || '';
    els.status.hidden = !msg;
    els.status.classList.toggle('is-error', !!isError);
    if (!actions || !actions.length) return;
    const row = document.createElement('span');
    row.className = 'bible-status__actions';
    actions.forEach(function (a) {
      const el = document.createElement(a.href ? 'a' : 'button');
      el.className = 'bible-status__btn' + (a.primary ? ' is-primary' : '');
      el.textContent = a.label;
      if (a.href) {
        el.href = a.href;
        el.target = '_blank';
        el.rel = 'noopener noreferrer';
      } else {
        el.type = 'button';
        el.addEventListener('click', a.onClick);
      }
      row.appendChild(el);
    });
    els.status.appendChild(row);
  }

  // იგივე თავი holybible.ge-ს საკუთარ გვერდზე — თუ ჩვენთან ვერ ჩაიტვირთა.
  function siteUrl() {
    return SITE + '/geo/bible/' + encodeURIComponent(state.version.name.replace(/ /g, '-'))
      + '/' + (state.book + BOOK_OFFSET) + '/' + state.chapter + '/0/0/1';
  }

  function fill(select, items, value) {
    select.innerHTML = '';
    items.forEach(function (item) {
      const opt = document.createElement('option');
      opt.value = item.value;
      opt.textContent = item.label;
      select.appendChild(opt);
    });
    select.value = value;
    select.disabled = false;
  }

  function fillBooks(books) {
    els.book.innerHTML = '';
    const groups = [
      { label: 'ძველი აღთქმა', from: 1, to: NT_START - 1 },
      { label: 'ახალი აღთქმა', from: NT_START, to: 66 }
    ];
    groups.forEach(function (g) {
      const group = document.createElement('optgroup');
      group.label = g.label;
      for (let n = g.from; n <= g.to && n <= books.length; n++) {
        const opt = document.createElement('option');
        opt.value = String(n);
        opt.textContent = books[n - 1];
        group.appendChild(opt);
      }
      els.book.appendChild(group);
    });
    els.book.disabled = false;
  }

  function readHash() {
    const params = new URLSearchParams(location.hash.replace(/^#/, ''));
    const p = (params.get('p') || '').split('.');
    return {
      version: params.get('v') || null,
      book: Number(p[0]) || null,
      chapter: Number(p[1]) || null
    };
  }

  function readSaved() {
    try { return JSON.parse(localStorage.getItem(POS_KEY)) || {}; } catch (e) { return {}; }
  }

  function savePosition() {
    const hash = '#v=' + state.version.id + '&p=' + state.book + '.' + state.chapter;
    if (location.hash !== hash) history.replaceState(null, '', hash);
    try {
      localStorage.setItem(POS_KEY, JSON.stringify({
        version: state.version.id, book: state.book, chapter: state.chapter
      }));
    } catch (e) { /* private mode */ }
  }

  function renderVerses(verses) {
    els.text.innerHTML = '';
    verses.forEach(function (v) {
      if (!v.text) return;
      const p = document.createElement('p');
      p.className = 'bible-verse';
      p.id = 'v' + v.n;
      const num = document.createElement('span');
      num.className = 'bible-verse__num';
      num.textContent = v.n;
      p.appendChild(num);
      p.appendChild(document.createTextNode(v.text));
      els.text.appendChild(p);
    });
  }

  function scrollToReader() {
    const top = root.getBoundingClientRect().top + window.scrollY - 90;
    if (window.scrollY > top) window.scrollTo({ top: top, behavior: 'smooth' });
  }

  /* ===== წიგნის რეჟიმი =====
     ფართო ეკრანზე ტექსტი ფიქსირებული სიმაღლის სვეტებში იშლება; ორი სვეტი
     ერთი გაშლილი წიგნია. ერთადერთი, რაც იცვლება, translateX-ია — ბრაუზერი
     ამას კომპოზიტორზე ხატავს, ტექსტს ხელახლა არ აწყობს. */
  const COL_GAP = 120;
  const PAGE_PAD = 26;

  function isBook() {
    return BOOK_MQ.matches;
  }

  function layoutBook() {
    if (!isBook()) {
      els.bookView.style.removeProperty('--bb-page-h');
      els.text.style.removeProperty('--bb-col-w');
      els.text.style.removeProperty('--bb-col-gap');
      els.text.style.transform = '';
      state.spread = 0;
      state.spreads = 1;
      updateNav();
      return;
    }
    const width = els.bookView.clientWidth;
    const colW = Math.floor((width - PAGE_PAD * 2 - COL_GAP) / 2);
    const pageH = Math.max(460, Math.min(window.innerHeight - 300, 860));
    els.bookView.style.setProperty('--bb-page-h', pageH + 'px');
    els.text.style.setProperty('--bb-col-w', colW + 'px');
    els.text.style.setProperty('--bb-col-gap', COL_GAP + 'px');

    // რამდენი სვეტი გამოვიდა: ბოლო მუხლის მარჯვენა კიდე გვეუბნება.
    els.text.style.transition = 'none';
    els.text.style.transform = 'none';
    const last = els.text.lastElementChild;
    let cols = 1;
    if (last) {
      const right = last.getBoundingClientRect().right - els.text.getBoundingClientRect().left - PAGE_PAD;
      cols = Math.max(1, Math.round((right + COL_GAP) / (colW + COL_GAP)));
    }
    state.spreads = Math.max(1, Math.ceil(cols / 2));
    goSpread(state.spread, true);
  }

  function goSpread(n, instant) {
    state.spread = Math.max(0, Math.min(n, state.spreads - 1));
    const colW = parseFloat(els.text.style.getPropertyValue('--bb-col-w')) || 0;
    const x = -state.spread * (colW + COL_GAP) * 2;
    if (instant) els.text.style.transition = 'none';
    els.text.style.transform = 'translateX(' + x + 'px)';
    if (instant) {
      void els.text.offsetWidth; // ერთი კადრი უანიმაციოდ
      els.text.style.transition = '';
    }
    updateNav();
  }

  function updateNav() {
    const firstChapter = state.book === 1 && state.chapter === 1;
    const lastChapter = state.book === 66 && state.chapter === state.chapters;
    els.prev.disabled = firstChapter;
    els.next.disabled = lastChapter;

    const prevLabel = els.prevBottom.querySelector('span');
    const nextLabel = els.nextBottom.querySelector('span');
    if (isBook()) {
      const onFirst = state.spread === 0;
      const onLast = state.spread === state.spreads - 1;
      els.prevBottom.disabled = firstChapter && onFirst;
      els.nextBottom.disabled = lastChapter && onLast;
      prevLabel.textContent = onFirst ? 'წინა თავი' : 'წინა გვერდი';
      nextLabel.textContent = onLast ? 'შემდეგი თავი' : 'შემდეგი გვერდი';
      const from = state.spread * 2 + 1;
      els.pageInfo.textContent = state.spreads > 1
        ? 'გვ. ' + from + '–' + (from + 1) + ' / ' + (state.spreads * 2)
        : '';
    } else {
      els.prevBottom.disabled = firstChapter;
      els.nextBottom.disabled = lastChapter;
      prevLabel.textContent = 'წინა თავი';
      nextLabel.textContent = 'შემდეგი თავი';
      els.pageInfo.textContent = '';
    }
  }

  async function load(opts) {
    opts = opts || {};
    const seq = ++loadSeq;
    root.classList.add('is-loading');
    els.version.value = state.version.id;

    let data;
    try {
      data = await fetchChapter(state.version, state.book, state.chapter);
    } catch (err) {
      if (seq !== loadSeq) return;
      // წამიერი შეფერხება ხშირია — ერთხელ ჩუმად ვცდით თავიდან.
      if (!opts.retried && navigator.onLine !== false) {
        setTimeout(function () {
          if (seq === loadSeq) load(Object.assign({}, opts, { retried: true }));
        }, 1500);
        return;
      }
      root.classList.remove('is-loading');
      els.text.innerHTML = '';
      setStatus(navigator.onLine === false
        ? 'ინტერნეტი არ არის — ამ თავის წაკითხვა ვერ მოხერხდა.'
        : 'ტექსტი ამჟამად ვერ ჩაიტვირთა. სცადე თავიდან ან წაიკითხე ეს თავი holybible.ge-ზე.', true, [
        { label: 'სცადე თავიდან', onClick: function () { load(opts); } },
        { label: 'გახსენი holybible.ge-ზე', href: siteUrl(), primary: true }
      ]);
      return;
    }
    if (seq !== loadSeq) return;

    if (data.books.length && data.books.length !== state.books.length) {
      state.books = data.books;
      fillBooks(state.books);
    }
    state.chapters = data.chapters;
    // ბოლო თავიდან უკან რომ მოდიხარ, „9999" აქ ნამდვილ ბოლო თავად იქცევა.
    if (state.chapter > state.chapters) {
      state.chapter = state.chapters;
      root.classList.remove('is-loading');
      return load(opts);
    }

    els.book.value = String(state.book);
    fill(els.chapter, Array.from({ length: state.chapters }, function (_, i) {
      return { value: String(i + 1), label: String(i + 1) };
    }), String(state.chapter));

    els.title.textContent = (state.books[state.book - 1] || '') + ' ' + state.chapter;
    setStatus('');
    const hasText = data.verses.some(function (v) { return v.text; });
    renderVerses(data.verses);
    if (!hasText) {
      setStatus('ამ თარგმანში ეს წიგნი არ არის — აირჩიე სხვა თარგმანი.', false);
    }
    state.spread = 0;
    layoutBook();
    if (opts.toEnd) goSpread(state.spreads - 1, true);
    savePosition();
    root.classList.remove('is-loading');
    if (!opts.silent) scrollToReader();
  }

  function stepChapter(delta, opts) {
    const next = state.chapter + delta;
    if (next >= 1 && next <= state.chapters) {
      state.chapter = next;
    } else {
      const book = state.book + delta;
      if (book < 1 || book > 66) return;
      state.book = book;
      state.chapter = delta > 0 ? 1 : 9999;
    }
    load(opts);
  }

  // ქვედა ღილაკები და ისრები: წიგნის რეჟიმში ჯერ გვერდი იფურცლება,
  // თავი მხოლოდ ბოლო/პირველ გვერდზე იცვლება.
  function stepPage(delta) {
    if (!isBook()) return stepChapter(delta);
    const target = state.spread + delta;
    if (target >= 0 && target < state.spreads) return goSpread(target);
    stepChapter(delta, { toEnd: delta < 0 });
  }

  function applyFont(size) {
    size = Math.min(Math.max(size, 15), 26);
    els.text.style.fontSize = size + 'px';
    try { localStorage.setItem(FONT_KEY, String(size)); } catch (e) { /* ignore */ }
    layoutBook();
    return size;
  }

  function applyTheme(name) {
    if (['sepia', 'dark', 'light'].indexOf(name) === -1) name = 'sepia';
    els.section.setAttribute('data-theme', name);
    els.themes.forEach(function (b) {
      const on = b.getAttribute('data-theme') === name;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    try { localStorage.setItem(THEME_KEY, name); } catch (e) { /* ignore */ }
  }

  function bind() {
    els.version.addEventListener('change', function () {
      state.version = VERSIONS.find(function (v) { return v.id === els.version.value; }) || VERSIONS[0];
      if (state.version.ntOnly && state.book < NT_START) {
        state.book = NT_START;
        state.chapter = 1;
      }
      load();
    });
    els.book.addEventListener('change', function () {
      state.book = Number(els.book.value) || 1;
      state.chapter = 1;
      load();
    });
    els.chapter.addEventListener('change', function () {
      state.chapter = Number(els.chapter.value) || 1;
      load();
    });
    els.prev.addEventListener('click', function () { stepChapter(-1); });
    els.next.addEventListener('click', function () { stepChapter(1); });
    els.prevBottom.addEventListener('click', function () { stepPage(-1); });
    els.nextBottom.addEventListener('click', function () { stepPage(1); });

    els.themes.forEach(function (b) {
      b.addEventListener('click', function () { applyTheme(b.getAttribute('data-theme')); });
    });

    let font = Number((function () { try { return localStorage.getItem(FONT_KEY); } catch (e) { return null; } })()) || 19;
    font = applyFont(font);
    els.fontDown.addEventListener('click', function () { font = applyFont(font - 1); });
    els.fontUp.addEventListener('click', function () { font = applyFont(font + 1); });

    document.addEventListener('keydown', function (e) {
      if (e.target.matches('input, select, textarea') || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowLeft') stepPage(-1);
      if (e.key === 'ArrowRight') stepPage(1);
    });

    // ფანჯრის ზომა იშვიათად იცვლება — გვერდები მხოლოდ ბოლო ცვლილების შემდეგ ითვლება.
    let resizeTimer = 0;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(layoutBook, 150);
    });
    // ტელეფონსა და დესკტოპს შორის გადასვლისას (მაგ. ეკრანის მობრუნება) დაუყოვნებლივ.
    if (BOOK_MQ.addEventListener) BOOK_MQ.addEventListener('change', layoutBook);
    else if (BOOK_MQ.addListener) BOOK_MQ.addListener(layoutBook);

    window.addEventListener('hashchange', function () {
      const h = readHash();
      if (!h.book) return;
      state.version = VERSIONS.find(function (v) { return v.id === h.version; }) || state.version;
      state.book = Math.min(Math.max(h.book, 1), 66);
      state.chapter = h.chapter || 1;
      load();
    });
  }

  function init() {
    fill(els.version, VERSIONS.map(function (v) {
      return { value: v.id, label: v.short };
    }), VERSIONS[0].id);
    applyTheme((function () { try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; } })());
    bind();

    const h = readHash();
    const saved = readSaved();
    state.version = VERSIONS.find(function (v) { return v.id === (h.version || saved.version); }) || VERSIONS[0];
    // პირველად მოსულს იოანეს სახარება ხვდება.
    state.book = Math.min(Math.max(h.book || saved.book || 43, 1), 66);
    state.chapter = h.chapter || (h.book ? 1 : saved.chapter) || 1;
    setStatus('იტვირთება…');
    load({ silent: true });
  }

  init();
})();
