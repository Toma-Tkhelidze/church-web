/* ==========================================================================
   ანალიტიკა — Google Analytics 4 + Microsoft Clarity
   --------------------------------------------------------------------------
   GA4    — რამდენი ვიზიტორია, საიდან მოვიდნენ, რომელ გვერდზე რამდენ ხანს
            დარჩნენ და რა გააკეთეს (ქვემოთ ჩამოთვლილი მოვლენები).
   Clarity — სად დააჭირეს და სად ჩამოსქროლეს (heatmap), ვიზიტის ჩანაწერი.

   ორივე მხოლოდ თანხმობის შემდეგ იტვირთება. სანამ ვიზიტორი ზოლზე არ
   უპასუხებს, საიტიდან არაფერი იგზავნება. უარის შემდეგ ზოლი ნახევარი
   წელი აღარ ჩნდება; ფუტერის „კონფიდენციალურობის“ ბმულით გადაწყვეტილების შეცვლა ყოველთვის
   შეიძლება.

   სანამ ორივე ID ცარიელია, ეს ფაილი არაფერს აკეთებს — არც ზოლს აჩენს.

   მოვლენები, რომლებსაც სხვა სკრიპტები efcTrack()-ით აგზავნიან:
     prayer_request        ლოცვითი საჭიროება გაიგზავნა
     registration_submit   ღონისძიებაზე რეგისტრაცია  {event_id}
     group_join            საოჯახო ჯგუფში გაწევრიანების თხოვნა
     contact_message       საკონტაქტო ფორმა
     newsletter_subscribe  ელფოსტის გამოწერა
     push_enabled          შეტყობინებები ჩაირთო
     app_installed         აპლიკაცია მთავარ ეკრანზე დაემატა
     sermon_play           ვიდეო ქადაგება ჩაირთო      {video_id, sermon_title}
     sermon_complete       ვიდეო ბოლომდე ნახეს        {video_id, sermon_title}
     audio_play            აუდიო ეპიზოდი ჩაირთო       {sermon_title}
     audio_complete        აუდიო ბოლომდე მოისმინეს    {sermon_title}
     video_play            სხვა ვიდეო (მისალმება, ბანაკი) {video_id, platform}
     bank_copy             „გაეცი“ გვერდზე რეკვიზიტი დაკოპირდა {field}
   ========================================================================== */
(function () {
  // ── შესავსები ───────────────────────────────────────────────────
  // GA4: analytics.google.com → Admin → Data streams → Measurement ID
  const GA_ID = 'G-PQF331DDYG';
  // Clarity: clarity.microsoft.com → პროექტი → Settings → Project ID
  // ID-ის ჩაწერისას ზოლის ტექსტშიც (openBar) დაამატე Microsoft Clarity —
  // თანხმობა მხოლოდ დასახელებულ სერვისებზე მოქმედებს.
  const CLARITY_ID = '';

  const KEY = 'efck:consent:v1';
  const DECLINE_QUIET_DAYS = 180;

  let loaded = false;

  // სხვა სკრიპტები ამას ყოველთვის იძახებენ — თანხმობის გარეშე უბრალოდ
  // ჩუმად რჩება. ტექსტური ველები 100 სიმბოლომდე იჭრება: GA4 უფრო
  // გრძელს ისედაც აგდებს.
  window.efcTrack = function (name, params) {
    if (!window.gtag || !loaded) return;
    const clean = {};
    Object.keys(params || {}).forEach(k => {
      const v = params[k];
      clean[k] = typeof v === 'string' ? v.slice(0, 100) : v;
    });
    try { window.gtag('event', name, clean); } catch (e) { /* ignore */ }
  };

  if (!GA_ID && !CLARITY_ID) return;

  const installed = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  function readState() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function writeState(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
  }

  // ── ჩატვირთვა ───────────────────────────────────────────────────
  function load() {
    if (loaded) return;
    loaded = true;

    if (GA_ID) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      // app_mode — რომ ვიცოდეთ, რამდენი შემოდის დაინსტალირებული აპლიკაციიდან
      window.gtag('set', 'user_properties', { app_mode: installed ? 'pwa' : 'browser' });
      window.gtag('config', GA_ID, { anonymize_ip: true });

      const s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
      document.head.appendChild(s);
    }

    if (CLARITY_ID) {
      window.clarity = window.clarity || function () {
        (window.clarity.q = window.clarity.q || []).push(arguments);
      };
      const s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.clarity.ms/tag/' + encodeURIComponent(CLARITY_ID);
      document.head.appendChild(s);
      // ჩანაწერებში PWA-ს ვიზიტები ცალკე გაიფილტრება
      window.clarity('set', 'app_mode', installed ? 'pwa' : 'browser');
    }
  }

  // ── ზოლი ────────────────────────────────────────────────────────
  function openBar() {
    if (document.querySelector('.consent-bar')) return;

    const bar = document.createElement('div');
    bar.className = 'install-bar consent-bar';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'ქუქიების თანხმობა');
    bar.innerHTML =
      '<span class="consent-icon" aria-hidden="true"><i class="fa-solid fa-cookie-bite"></i></span>' +
      '<div class="install-body">' +
        '<span class="install-eyebrow">ქუქიები</span>' +
        '<strong>გვინდა, ვებ გვერდი თქვენთვის იყოს</strong>' +
        '<span class="install-lead">Google Analytics გვაჩვენებს, თუ როგორ შეგვიძლია ' +
          'გავაუმჯობესოთ ვებ გვერდი. ჩვენ ვხედავთ მხოლოდ საერთო სურათს და თითოეული ' +
          'სტუმარი ჩვენთვის ანონიმური რჩება. ამ ინფორმაციით ვებ გვერდს ისე ვაწყობთ, ' +
          'რომ თქვენ გამოგადგეთ.</span>' +
        '<div class="consent-actions">' +
          '<button type="button" class="install-go consent-accept">ვეთანხმები</button>' +
          '<button type="button" class="consent-decline">მხოლოდ საჭირო</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(bar);
    const open = () => bar.classList.add('is-open');
    requestAnimationFrame(open);
    setTimeout(open, 50);

    const close = () => {
      bar.classList.remove('is-open');
      setTimeout(() => bar.remove(), 300);
    };

    bar.querySelector('.consent-accept').addEventListener('click', () => {
      writeState({ choice: 'accept', at: Date.now() });
      close();
      load();
    });
    bar.querySelector('.consent-decline').addEventListener('click', () => {
      const wasOn = readState().choice === 'accept';
      writeState({ choice: 'decline', at: Date.now() });
      // თანხმობის გაუქმება: გვერდს ვტვირთავთ, რომ უკვე ჩატვირთული
      // სკრიპტები მართლა გაქრეს.
      if (wasOn) {
        window.location.reload();
        return;
      }
      close();
    });
  }

  // ── ფუტერის ბმული — გადაწყვეტილების შეცვლა ──────────────────────
  // საავტორო ხაზის ბოლოს მკრთალი ბმული: კანონი ითხოვს, რომ თანხმობის
  // გაუქმება ადვილი იყოს და არა თვალში საცემი. დაჭერა ისევ ზოლს ხსნის.
  function mountFooterLink() {
    const copy = document.querySelector('.footer-bottom .footer-copy');
    if (!copy || copy.querySelector('.footer-consent')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'footer-consent';
    btn.textContent = 'კონფიდენციალურობა';
    btn.setAttribute('aria-label', 'კონფიდენციალურობა: ანალიტიკის ჩართვა ან გამორთვა');
    btn.addEventListener('click', openBar);
    copy.append(' · ', btn);
  }

  // ── გაშვება ─────────────────────────────────────────────────────
  const state = readState();
  if (state.choice === 'accept') {
    load();
  }

  const start = () => {
    mountFooterLink();
    if (state.choice === 'accept') return;
    const quiet = state.choice === 'decline'
      && Date.now() - (state.at || 0) < DECLINE_QUIET_DAYS * 864e5;
    // ზოლი ცოტა დაგვიანებით — ჯერ საიტი დაინახონ, მერე კითხვა.
    if (!quiet) setTimeout(openBar, 2500);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
