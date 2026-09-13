const PROJECT_ID = 'f9j6xr69';
const DATASET = 'production';
const API_VERSION = 'v2021-10-21';

function getYouTubeId(url) {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

function getVideoDetails(url) {
  if (!url) return null;
  // YouTube
  const ytRegExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const ytMatch = url.match(ytRegExp);
  if (ytMatch && ytMatch[2].length === 11) {
    return { platform: 'youtube', id: ytMatch[2] };
  }
  // Vimeo
  const vimeoRegExp = /vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|album\/(\d+)\/video\/|video\/|)(\d+)(?:$|\/|\?)/;
  const vimeoMatch = url.match(vimeoRegExp);
  if (vimeoMatch && vimeoMatch[3]) {
    return { platform: 'vimeo', id: vimeoMatch[3] };
  }
  return null;
}

// ── YouTube-ის დასაკრავი სიები ────────────────────────────────────────
// ქადაგებები არხზე ორნაირად ლაგდება: სახელიანი playlist = სერია
// (ის Sanity-ში შედის), წლიური playlist = ცალკეული ყოველკვირეული
// ქადაგებები. აქ მხოლოდ მეორეს ვკითხულობთ — პირველი რიგში მდგომი
// მიმდინარე წელია და ბოლო ქადაგებაც იქიდან მოდის.
// არქივის ფაილი საიტის ძირშია, გვერდები კი სხვადასხვა დონეზე დევს —
// მისამართს თავად ამ სკრიპტის მისამართიდან ვიღებთ.
const SCRIPT_SRC = (document.currentScript && document.currentScript.src) || '';
const ARCHIVE_URL = (SCRIPT_SRC ? SCRIPT_SRC.slice(0, SCRIPT_SRC.lastIndexOf('/') + 1) : '') + 'data/sermon-archive.json';

const SERMON_PLAYLISTS = [
  { year: '2026', id: 'PLC_n-dqgCYfWAb2CbwumDHPRApAkcP99A' },
  { year: '2024', id: 'PLC_n-dqgCYfVoTDhwa3nqvBb-VT6h6BBn' },
  { year: '2023', id: 'PLC_n-dqgCYfVuW9J_rlhSNAdCSj6Qci2-' },
  { year: '2022', id: 'PLC_n-dqgCYfWBOSLMaNQTs8u6eivVOnPz' }
];

// feed ბრაუზერში მოკლე დროით ინახება, რომ გვერდიდან გვერდზე გადასვლამ
// ერთი და იგივე მოთხოვნა არ გააგზავნოს. ვადა განზრახ მოკლეა: ახალი
// ქადაგება არაუმეტეს 15 წუთს დააგვიანებს.
const FEED_CACHE_PREFIX = 'efc:playlist:v1:';
const FEED_CACHE_TTL = 15 * 60 * 1000;
// ლოდინის ზღვარი: მის გარეშე დაკიდებული მოთხოვნა სამუდამოდ
// დაუსრულებელს ტოვებდა მასზე დამოკიდებულ ჯაჭვს.
const FEED_TIMEOUT = 5000;

// ერთსა და იმავე playlist-ზე პარალელური მოთხოვნები ერთდება — მიმდინარე
// წლის feed-ს ორი მომხმარებელი ჰყავს (ბოლო ქადაგება და კვირეული სია).
const feedInFlight = {};

// ორდონიანი კეში: fresh — პირდაპირ გამოსაყენებელი; stale — ძველი,
// მაგრამ შენახული, რომ feed-ის ჩავარდნისას ცარიელზე არ ჩამოვვარდეთ.
function readCachedFeed(playlistId) {
  try {
    const raw = JSON.parse(localStorage.getItem(FEED_CACHE_PREFIX + playlistId));
    if (raw && Array.isArray(raw.items) && raw.items.length) {
      return { items: raw.items, fresh: Date.now() - raw.at < FEED_CACHE_TTL };
    }
  } catch (e) { /* private mode ან დაზიანებული ჩანაწერი */ }
  return null;
}

function cacheFeed(playlistId, items) {
  if (!items || !items.length) return;
  try {
    localStorage.setItem(FEED_CACHE_PREFIX + playlistId, JSON.stringify({ items: items, at: Date.now() }));
  } catch (e) { /* კვოტა ან private mode */ }
}

// rss2json-ის პასუხს მხოლოდ იმ ველებამდე ვამცირებთ, რაც საიტს სჭირდება.
function normalizeFeedItems(rssData) {
  if (!rssData || !Array.isArray(rssData.items)) return [];
  return rssData.items.map(item => {
    let id = null;
    if (item.guid) {
      const parts = item.guid.split(':');
      if (parts.length >= 3) id = parts[2];
    }
    if (!id) id = getYouTubeId(item.link);
    if (!id) return null;
    return { id: id, title: item.title || '', pubDate: item.pubDate || '' };
  }).filter(Boolean);
}

function fetchPlaylistFeed(playlistId) {
  const cached = readCachedFeed(playlistId);
  if (cached && cached.fresh) return Promise.resolve(cached.items);
  if (feedInFlight[playlistId]) return feedInFlight[playlistId];

  // ჩავარდნისას ბოლო ნაცნობ სიას დავუბრუნდებით, და არა null-ს.
  const stale = cached ? cached.items : null;

  // მისამართში გამანახლებელი (&t=...) განზრახ არ არის. ის rss2json-ს
  // აიძულებდა feed-ის თავიდან დამუშავებას და იწვევდა 429-ს. მისი გარეშე
  // სერვისი საკუთარ კეშს იყენებს და ახალ ვიდეოს ბევრად უფრო ადრე ვიგებთ.
  const feedUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent('https://www.youtube.com/feeds/videos.xml?playlist_id=' + playlistId)}`;

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), FEED_TIMEOUT) : null;

  const request = fetch(feedUrl, controller ? { signal: controller.signal } : undefined)
    .then(res => {
      if (!res.ok) {
        // ყველაზე ხშირი 429-ია (გადაჭარბებული ლიმიტი) — ვხედავთ დიაგნოსტიკისთვის.
        console.warn('YouTube playlist feed request failed with status', res.status, playlistId);
        return null;
      }
      return res.json();
    })
    .then(rssData => {
      const items = normalizeFeedItems(rssData);
      if (!items.length) return stale;
      cacheFeed(playlistId, items);
      return items;
    })
    .catch(rssError => {
      console.warn('Failed to fetch YouTube playlist', playlistId, '- falling back to cache:', rssError);
      return stale;
    })
    .finally(() => {
      if (timer) clearTimeout(timer);
      delete feedInFlight[playlistId];
    });

  feedInFlight[playlistId] = request;
  return request;
}

// ბოლო ქადაგება Sanity-სგან დამოუკიდებლად მოდის, რომ ნელმა ან
// მიუწვდომელმა Sanity-ის მოთხოვნამ გვერდზე ძველი ვიდეო არ დატოვოს.
// მიმდინარე წლის სია არქივიდან ვიცით — ახალი წლის დაწყებისას კოდის
// შეცვლა არ სჭირდება. არქივი იმავე დომენზეა და სწრაფად პასუხობს;
// თუ დაიგვიანა, ბოლო ქადაგებას არ ვაცდევინებთ და კოდში ჩაწერილს ვიყენებთ.
function currentSermonPlaylistId() {
  const fallback = SERMON_PLAYLISTS[0].id;
  const guard = new Promise(resolve => setTimeout(() => resolve(null), 2000));
  return Promise.race([fetchSermonArchive(), guard])
    .then(archive => (archive && archive.playlists && archive.playlists[0] && archive.playlists[0].id) || fallback)
    .catch(() => fallback);
}

function fetchLatestPlaylistVideoId() {
  return currentSermonPlaylistId().then(fetchPlaylistFeed).then(items => {
    if (!items || !items.length) return null;
    const latest = items.reduce((a, b) => (new Date(b.pubDate) > new Date(a.pubDate) ? b : a), items[0]);
    return latest ? latest.id : null;
  });
}

// ქადაგებების სია მხოლოდ Sanity-დან მოდის, ამიტომ მისი ჩავარდნისას
// გვერდი სრულიად ცარიელი რჩებოდა. ეს ფუნქცია ხსნის სათადარიგო
// შეტყობინებას — ის მხოლოდ sermons.html-ზე არსებობს.
function showSermonsFallback(reason) {
  const box = document.getElementById('seriesFallback');
  if (!box) return;
  const text = document.getElementById('seriesFallbackText');
  const btn = document.getElementById('seriesFallbackBtn');
  if (text) {
    text.textContent = reason === 'empty'
      ? 'ქადაგებები ჯერ არ არის დამატებული. მალე დაბრუნდით.'
      : 'ქადაგებების სია ვერ ჩაიტვირთა. შეამოწმეთ ინტერნეტთან კავშირი და სცადეთ თავიდან.';
  }
  // ცარიელი სიის შემთხვევაში განახლება ვერაფერს შეცვლის.
  if (btn) {
    btn.hidden = reason === 'empty';
    btn.onclick = () => location.reload();
  }
  box.hidden = false;
}

// Idempotent: safe to call from both the feed path and the Sanity path.
function applyLatestSermonId(sermonId) {
  if (!sermonId) return;

  document.querySelectorAll('#sanity-latest-sermon').forEach(el => {
    if (el.getAttribute('data-video-id') === sermonId) return;
    el.setAttribute('data-video-id', sermonId);
    if (typeof setYouTubeThumbnailBackground === 'function') {
      setYouTubeThumbnailBackground(el, sermonId, 'linear-gradient(rgba(0,0,0,0.1), rgba(0,0,0,0.2))');
    } else {
      el.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.1), rgba(0,0,0,0.2)), url('https://img.youtube.com/vi/${sermonId}/hqdefault.jpg')`;
    }
  });

  setSermonFacade(sermonId);
}

// Sanity-ს CDN ორიგინალ ფაილს აბრუნებს — ატვირთული PNG რამდენიმე
// მეგაბაიტიც შეიძლება იყოს. პარამეტრებით ზომასა და webp-ს ვთხოვთ;
// სხვა დომენის მისამართს (მაგ. Unsplash) ხელს არ ვახლებთ.
function sanityImageUrl(url, width) {
  if (!url || url.indexOf('cdn.sanity.io/images/') === -1) return url;
  const sep = url.indexOf('?') === -1 ? '?' : '&';
  return url + sep + 'w=' + width + '&fm=webp&q=80';
}

// ცარიელი CMS ველი „undefined“-ად არ უნდა დაიბეჭდოს.
function textOr(value, fallback) {
  return (value == null || value === '') ? (fallback || '') : String(value);
}

// CMS ტექსტი HTML-ში ჩასმამდე უნდა გაიწმინდოს.
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// საოჯახო ჯგუფების ბარათები. მარკაპი იმეორებს გვერდზე არსებულ სტატიკურ
// ბარათებს ერთ-ერთში, რომ იერი არ შეიცვალოს.
function renderFamilyGroups(groups) {
  const grid = document.querySelector('.groups-grid');
  if (!grid || !groups || groups.length === 0) return;

  const data = {};
  const cards = groups.map((group, index) => {
    const id = String(index + 1);
    const image = sanityImageUrl(group.imageAssetUrl, 800) || group.imageUrl || '';
    data[id] = {
      title: group.title,
      leader: group.leader,
      formLeader: group.formLeader || group.leader,
      time: group.time,
      location: group.location,
      type: group.groupType,
      image: image,
      description: group.description,
      map: group.mapUrl
    };

    return `
                <div class="group-card scroll-reveal" data-group-id="${id}">
                    <div class="group-image-wrap">
                        <img src="${escapeHtml(image)}"
                            alt="${escapeHtml(group.title)}">
                        <span class="group-badge">${escapeHtml(group.badge)}</span>
                    </div>
                    <div class="group-card-content">
                        <h3 class="group-leaders">${escapeHtml(group.title)}</h3>
                        <div class="group-meta-info">
                            <i class="fa-solid fa-user"></i> ${escapeHtml(group.leader)}
                        </div>
                        <div class="group-meta-info">
                            <i class="fa-regular fa-clock"></i> ${escapeHtml(group.cardTime)}
                        </div>
                        <div class="group-meta-info">
                            <a href="${escapeHtml(group.mapUrl)}" target="_blank"
                                rel="noopener noreferrer">
                                <i class="fa-solid fa-location-dot"></i> მისამართი (ნახვა რუკაზე)
                            </a>
                        </div>
                        <p class="group-excerpt">${escapeHtml(group.excerpt)}</p>
                        <span class="group-action-btn">დეტალების ნახვა <i class="fa-solid fa-arrow-right"></i></span>
                    </div>
                </div>`;
  });

  window.groupsData = data;
  grid.innerHTML = cards.join('');
  if (typeof window.setupScrollReveal === 'function') window.setupScrollReveal();
}

// მთავარ გვერდზე ღია რეგისტრაციების ზოლი. ვიზიტორმა შეიძლება ვერასოდეს
// მოახერხოს რეგისტრაციის გვერდზე, ამიტომ აქტიური ღონისძიება აქვეც ჩანს.
// თუ აქტიური არევია, ბლოკი დამალული რჩება — ცარიელი ადგილი არ რჩება.
function renderOpenEvents(events) {
  const mount = document.getElementById('openEvents');
  if (!mount) return;

  const open = (events || []).filter(evt => evt && evt.status === 'active' && evt.title);
  if (open.length === 0) {
    mount.hidden = true;
    return;
  }

  // სრული ბარათი: სურათი, სტატუსი, თარიღი, დეტალები და აღწერა —
  // იგივე, რაც რეგისტრაციის გვერდზეა, რომ ვიზიტორმა გადასვლამდე იცოდეს, რას ქანს.
  const cards = open.map(evt => {
    const metaIcon = evt.eventId === 'conference' ? 'fa-location-dot' : 'fa-users';
    // სურათის გარეშე ბარათი ერთსვეტიანი ხდება — თორემ ტექსტი ვიწრო სვეტში
    // იკუმშებოდა და გვერდით ცარიელი ადგილი რჩებოდა.
    const media = evt.imageUrl
      ? `<span class="event-promo-media"><img src="${escapeHtml(sanityImageUrl(evt.imageUrl, 800))}" alt="" loading="lazy"></span>`
      : '';
    const layoutClass = evt.imageUrl ? '' : ' is-textonly';
    const date = evt.dateText
      ? `<span><i class="fa-regular fa-calendar" aria-hidden="true"></i>${escapeHtml(evt.dateText)}</span>`
      : '';
    const details = evt.detailsText
      ? `<span><i class="fa-solid ${metaIcon}" aria-hidden="true"></i>${escapeHtml(evt.detailsText)}</span>`
      : '';
    const text = evt.description
      ? `<p class="event-promo-text">${escapeHtml(evt.description)}</p>`
      : '';
    // ბარათი განზრახ აღარ არის ბმული: გადასვლა მხოლოდ ღილაკით ხდება,
    // ისიც არა სხვა გვერდზე — ფორმა აქვე იხსნება.
    return `
      <div class="event-promo${layoutClass}">
        ${media}
        <span class="event-promo-body">
          <span class="event-promo-badge">
            <span class="event-promo-dot" aria-hidden="true"></span>რეგისტრაცია ღიაა
          </span>
          <span class="event-promo-title">${escapeHtml(evt.title)}</span>
          <span class="event-promo-meta">${date}${details}</span>
          ${text}
          <button type="button" class="event-promo-cta" data-event="${escapeHtml(evt.eventId || '')}" data-title="${escapeHtml(evt.title)}">
            რეგისტრაციის გავლა <i class="fa-solid fa-arrow-right-long" aria-hidden="true"></i>
          </button>
        </span>
      </div>`;
  }).join('');

  mount.innerHTML = `
    <div class="events-promo-inner">
      <div class="events-promo-head">
        <span class="grid-uppertitle">ღონისძიებები</span>
        <h2>დაიკავე შენი ადგილი</h2>
      </div>
      <div class="events-promo-list">${cards}</div>
    </div>`;

  // ფორმა აქვე იხსნება — ვიზიტორი მთავარ გვერდზე რჩება.
  mount.addEventListener('click', e => {
    const btn = e.target.closest('.event-promo-cta');
    if (!btn) return;
    const eventId = btn.getAttribute('data-event');
    if (typeof openRegistrationModal === 'function' && openRegistrationModal(eventId, btn.getAttribute('data-title'))) return;
    // ფორმა ამ ღონისძიებისთვის აღწერილი არ არის — რეგისტრაციის გვერდი სათადარიგოა.
    window.location.href = 'pages/registration.html' + (eventId ? '#' + encodeURIComponent(eventId) : '');
  });

  mount.hidden = false;
}

// მსახურთა გუნდი: უფროსი პასტორები + სულიერი საბჭო.
function renderTeam(members) {
  if (!members || members.length === 0) return;

  const pastor = members.find(m => m.memberRole === 'lead-pastor');
  if (pastor) {
    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el && value) el.textContent = value;
    };
    setText('sanity-pastor-name', pastor.name);
    setText('sanity-pastor-role', pastor.roleLabel);
    setText('sanity-pastor-tagline', pastor.tagline);
    setText('sanity-pastor-bio1', pastor.bio1);
    setText('sanity-pastor-bio2', pastor.bio2);

    const photo = document.getElementById('sanity-pastor-photo');
    const photoSrc = sanityImageUrl(pastor.photoAssetUrl, 800) || pastor.photoUrl;
    if (photo && photoSrc) {
      photo.src = photoSrc;
      if (pastor.name) photo.alt = pastor.name;
    }

    const email = document.getElementById('sanity-pastor-email');
    if (email && pastor.email) email.href = 'mailto:' + pastor.email;
  }

  const elders = members.filter(m => m.memberRole === 'elder');
  const eldersWrap = document.getElementById('sanity-elders-wrap');
  if (eldersWrap && elders.length > 0) {
    // ორ სვეტად, ისევე როგორც სტატიკურ ვერსიაში.
    const half = Math.ceil(elders.length / 2);
    const columns = [elders.slice(0, half), elders.slice(half)];
    eldersWrap.innerHTML = columns
      .filter(column => column.length > 0)
      .map(column => `
                        <div style="flex: 1; min-width: 140px;">
                            <ul style="list-style: none; padding: 0; margin: 0;">
${column.map(member => `                                <li style="padding: 10px 0; border-bottom: 1px solid #eee; color: #444;"><strong>${escapeHtml(member.name)}</strong> <div style="color: #888; font-size: 0.85rem; margin-top: 2px;">${escapeHtml(member.roleLabel || 'საბჭოს წევრი')}</div></li>`).join('\n')}
                            </ul>
                        </div>`)
      .join('');
  }
}

// ახალგაზრდულ და ბავშვთა გვერდებზე ბანაკის ღილაკი იმავე registrationEvent-ს
// ემორჩილება, რასაც რეგისტრაციის გვერდი — ერთხელ დახურავ, ყველგან იხურება.
function applyCampRegistrationStatus(events) {
  const button = document.getElementById('openCampModal');
  if (!button) return;

  const eventId = button.getAttribute('data-event');
  if (!eventId) return;

  const event = (events || []).find(e => e && e.eventId === eventId);
  // თუ ღონისძიება Sanity-ში არ არსებობს, ღილაკს ხელს არ ვახლებთ.
  if (!event) return;

  const note = document.getElementById('campRegClosedNote');
  const isActive = event.status === 'active';

  // პირველივე გაშვებაზე ვინახავთ თავდაპირველ წარწერას, რომ ხელახლა გახსნისას
  // ღილაკი უცვლელად დაბრუნდეს.
  if (button.dataset.openLabel === undefined) {
    button.dataset.openLabel = button.innerHTML;
  }

  if (isActive) {
    button.removeAttribute('disabled');
    button.removeAttribute('aria-disabled');
    button.innerHTML = button.dataset.openLabel;
    if (note) note.hidden = true;
    return;
  }

  button.setAttribute('disabled', 'true');
  button.setAttribute('aria-disabled', 'true');
  const icon = button.querySelector('i');
  button.textContent = ' რეგისტრაცია დასრულდა';
  if (icon) button.prepend(icon);
  if (note) note.hidden = false;
}

function updatePageContent() {
  const groqQuery = `{
    "siteContent": *[_type == "siteContent"][0]{
      title,
      youtubeUrl,
      "imageUrl": imageUrl.asset->url,
      buildingSubtitle,
      buildingTitle,
      buildingText1,
      buildingText2,
      latestSermonUrl,
      youthCampVideoUrl,
      youthCampTitle,
      youthCampDesc1,
      youthCampDesc2,
      kidsCampVideoUrl,
      kidsCampTitle,
      kidsCampDesc1,
      kidsCampDesc2,
      weeklyVerses[]{text, ref},
      weeklyVerseText,
      weeklyVerseRef,
      "weeklyVersePdf": weeklyVersePdf.asset->{url, originalFilename, size}
    },
    "events": *[_type == "registrationEvent"] | order(_createdAt asc) {
      eventId,
      title,
      status,
      dateText,
      detailsText,
      description,
      "imageUrl": imageUrl.asset->url
    },
    "familyGroups": *[_type == "familyGroup"] | order(order asc) {
      title,
      leader,
      formLeader,
      time,
      cardTime,
      badge,
      location,
      groupType,
      excerpt,
      description,
      mapUrl,
      imageUrl,
      "imageAssetUrl": image.asset->url
    },
    "teamMembers": *[_type == "teamMember"] | order(order asc) {
      name,
      memberRole,
      roleLabel,
      tagline,
      bio1,
      bio2,
      email,
      photoUrl,
      "photoAssetUrl": photo.asset->url
    },
    "sermons": *[_type == "sermonSeries"] | order(order asc, _createdAt desc) {
      title,
      subtitle,
      category,
      "thumbnailUrl": thumbnailUrl.asset->url,
      description,
      speaker,
      episodes[] {
        title,
        speaker,
        youtubeUrl,
        duration
      }
    }
  }`;

  const url = `https://${PROJECT_ID}.apicdn.sanity.io/${API_VERSION}/data/query/${DATASET}?query=${encodeURIComponent(groqQuery)}`;

  // Runs in parallel with the Sanity query; both paths update the page.
  const latestVideoIdPromise = fetchLatestPlaylistVideoId();
  latestVideoIdPromise.then(applyLatestSermonId);

  fetch(url)
    .then(response => response.json())
    .then(async data => {
      if (data && data.result) {
        const { siteContent, events, sermons, familyGroups, teamMembers } = data.result;

        renderFamilyGroups(familyGroups);
        renderTeam(teamMembers);
        renderOpenEvents(events);

        // 1. UPDATE SITECONTENT PROPERTIES
        if (siteContent) {
          // Main Title
          if (siteContent.title) {
            const titleEl = document.getElementById('sanity-main-title');
            if (titleEl) titleEl.textContent = siteContent.title;
          }

          // Main Video
          if (siteContent.youtubeUrl) {
            const videoUrl = siteContent.youtubeUrl;
            const containerEl = document.getElementById('building-video-container') || document.querySelector('.building-video-wrap .video-container');
            if (containerEl) {
              if (videoUrl.includes('.mp4') || videoUrl.includes('cloudinary.com')) {
                let optimizedUrl = videoUrl;
                if (videoUrl.includes('cloudinary.com') && !videoUrl.includes('f_auto') && !videoUrl.includes('q_auto')) {
                  optimizedUrl = videoUrl.replace('/video/upload/', '/video/upload/f_auto,q_auto/');
                }
                // Render HTML5 video element
                containerEl.innerHTML = `
                  <video 
                      id="sanity-video-element"
                      src="${optimizedUrl}" 
                      autoplay 
                      loop 
                      muted 
                      playsinline 
                      preload="metadata" 
                      style="width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0; pointer-events: none;">
                  </video>
                `;

                // Some browsers (notably iOS Safari) ignore the autoplay
                // attribute on media inserted via innerHTML, so start it
                // explicitly. The viewport observer in script.js still
                // decides whether it keeps playing.
                const injectedVideo = containerEl.querySelector('video');
                if (injectedVideo) {
                  injectedVideo.muted = true;
                  injectedVideo.playsInline = true;
                  const playAttempt = injectedVideo.play();
                  if (playAttempt && typeof playAttempt.catch === 'function') {
                    playAttempt.catch(() => { /* blocked by autoplay policy or paused while off-screen */ });
                  }
                }
              } else {
                const videoDetails = getVideoDetails(videoUrl);
                if (videoDetails) {
                  if (videoDetails.platform === 'vimeo') {
                    containerEl.innerHTML = `
                      <iframe 
                          id="sanity-video-iframe"
                          src="https://player.vimeo.com/video/${videoDetails.id}?autoplay=1&mute=1&loop=1&autopause=0&background=1" 
                          allow="autoplay; fullscreen; picture-in-picture" 
                          referrerpolicy="strict-origin-when-cross-origin"
                          allowfullscreen
                          style="width: 100%; height: 100%; position: absolute; top: 0; left: 0; pointer-events: none;"
                          frameborder="0">
                      </iframe>
                    `;
                  } else {
                    containerEl.innerHTML = `
                      <iframe 
                          id="sanity-video-iframe"
                          src="https://www.youtube-nocookie.com/embed/${videoDetails.id}?autoplay=1&mute=1&loop=1&playlist=${videoDetails.id}&controls=0&rel=0&modestbranding=1&disablekb=1&fs=0&iv_load_policy=3&showinfo=0&vq=hd1080" 
                          allow="autoplay; encrypted-media" 
                          referrerpolicy="strict-origin-when-cross-origin"
                          allowfullscreen
                          style="width: 100%; height: 100%; position: absolute; top: 0; left: 0; pointer-events: none;"
                          frameborder="0">
                      </iframe>
                    `;
                  }
                }
              }
            }
          }

          // Main Image (Background of Hero Section)
          if (siteContent.imageUrl) {
            const imgEl = document.getElementById('sanity-main-image');
            if (imgEl) imgEl.style.backgroundImage = `url('${sanityImageUrl(siteContent.imageUrl, 1920)}')`;
          }

          // Building Section Texts
          if (siteContent.buildingSubtitle) {
            const el = document.getElementById('sanity-building-subtitle');
            if (el) el.textContent = siteContent.buildingSubtitle;
          }
          if (siteContent.buildingTitle) {
            const el = document.getElementById('sanity-building-title');
            if (el) el.textContent = siteContent.buildingTitle;
          }
          if (siteContent.buildingText1) {
            const el = document.getElementById('sanity-building-text1');
            if (el) el.textContent = siteContent.buildingText1;
          }
          if (siteContent.buildingText2) {
            const el = document.getElementById('sanity-building-text2');
            if (el) el.textContent = siteContent.buildingText2;
          }

          // ბოლო ქადაგება: წყარო YouTube-ის feed-ია, Sanity მხოლოდ სარეზერვო.
          // განზრახ ცალკე ჯაჭვში — feed-ის ლოდინმა დანარჩენი კონტენტის
          // გამოჩენა არ უნდა დააყოვნოს.
          latestVideoIdPromise.then(feedId => {
            let sermonId = feedId;
            if (!sermonId && siteContent.latestSermonUrl) {
              sermonId = getYouTubeId(siteContent.latestSermonUrl);
            }
            applyLatestSermonId(sermonId);

            // Main Sermon Player falls back to the first Sanity episode only
            // when neither the playlist feed nor latestSermonUrl gave an id.
            if (!sermonId && sermons && sermons.length > 0) {
              const firstEpisode = sermons[0]?.episodes?.[0];
              const fallbackId = firstEpisode ? getYouTubeId(firstEpisode.youtubeUrl) : null;
              if (fallbackId) setSermonFacade(fallbackId);
            }
          });

          // Youth Camp (Youth Page)
          if (siteContent.youthCampVideoUrl) {
            const videoDetails = getVideoDetails(siteContent.youthCampVideoUrl);
            const campVideoEl = document.getElementById('sanity-youth-camp-video');
            if (videoDetails && campVideoEl) {
              const campVideoId = videoDetails.id;
              const platform = videoDetails.platform;
              campVideoEl.setAttribute('data-video-id', campVideoId);
              campVideoEl.setAttribute('data-video-platform', platform);
              if (platform === 'vimeo') {
                campVideoEl.style.backgroundSize = 'cover';
                campVideoEl.style.backgroundPosition = 'center';
                campVideoEl.style.position = 'relative';
                fetch(`https://vimeo.com/api/v2/video/${campVideoId}.json`)
                  .then(res => res.json())
                  .then(data => {
                    if (data && data[0] && data[0].thumbnail_large) {
                      campVideoEl.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.4)), url('${data[0].thumbnail_large}')`;
                    }
                  })
                  .catch(err => {
                    console.error('Error fetching Vimeo thumbnail:', err);
                    campVideoEl.style.backgroundColor = '#1e1e1e';
                  });
              } else {
                if (typeof setYouTubeThumbnailBackground === 'function') {
                  setYouTubeThumbnailBackground(campVideoEl, campVideoId, 'linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.4))');
                } else {
                  campVideoEl.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.4)), url('https://img.youtube.com/vi/${campVideoId}/hqdefault.jpg')`;
                }
              }
            }
          }
          if (siteContent.youthCampTitle) {
            const el = document.getElementById('sanity-youth-camp-title');
            if (el) el.textContent = siteContent.youthCampTitle;
          }
          if (siteContent.youthCampDesc1) {
            const el = document.getElementById('sanity-youth-camp-desc1');
            if (el) el.textContent = siteContent.youthCampDesc1;
          }
          if (siteContent.youthCampDesc2) {
            const el = document.getElementById('sanity-youth-camp-desc2');
            if (el) el.textContent = siteContent.youthCampDesc2;
          }

          // Kids Camp (Kids Page)
          if (siteContent.kidsCampVideoUrl) {
            const videoDetails = getVideoDetails(siteContent.kidsCampVideoUrl);
            const kidsVideoEl = document.getElementById('sanity-kids-camp-video');
            if (videoDetails && kidsVideoEl) {
              const kidsVideoId = videoDetails.id;
              const platform = videoDetails.platform;
              kidsVideoEl.setAttribute('data-video-id', kidsVideoId);
              kidsVideoEl.setAttribute('data-video-platform', platform);
              if (platform === 'vimeo') {
                kidsVideoEl.style.backgroundSize = 'cover';
                kidsVideoEl.style.backgroundPosition = 'center';
                kidsVideoEl.style.position = 'relative';
                fetch(`https://vimeo.com/api/v2/video/${kidsVideoId}.json`)
                  .then(res => res.json())
                  .then(data => {
                    if (data && data[0] && data[0].thumbnail_large) {
                      kidsVideoEl.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.4)), url('${data[0].thumbnail_large}')`;
                    }
                  })
                  .catch(err => {
                    console.error('Error fetching Vimeo thumbnail:', err);
                    kidsVideoEl.style.backgroundColor = '#1e1e1e';
                  });
              } else {
                if (typeof setYouTubeThumbnailBackground === 'function') {
                  setYouTubeThumbnailBackground(kidsVideoEl, kidsVideoId, 'linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.4))');
                } else {
                  kidsVideoEl.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.4)), url('https://img.youtube.com/vi/${kidsVideoId}/hqdefault.jpg')`;
                }
              }
            }
          }
          if (siteContent.kidsCampTitle) {
            const el = document.getElementById('sanity-kids-camp-title');
            if (el) el.textContent = siteContent.kidsCampTitle;
          }
          if (siteContent.kidsCampDesc1) {
            const el = document.getElementById('sanity-kids-camp-desc1');
            if (el) el.textContent = siteContent.kidsCampDesc1;
          }
          if (siteContent.kidsCampDesc2) {
            const el = document.getElementById('sanity-kids-camp-desc2');
            if (el) el.textContent = siteContent.kidsCampDesc2;
          }

          // დღის მუხლები (მთავარი გვერდი). თავად დახატვა ქვემოთ,
          // .finally()-ში ხდება — ისე ღილაკი მაშინაც მუშაობს, როცა
          // Sanity-სთან კავშირი ვერ დამყარდა.
          dailyVerseData = siteContent;
          // მუხლების PDF. ბმული მარკაპში დამალულია და მხოლოდ
          // აქ, ფაილის არსებობისას, იხსნება.
          const pdf = siteContent.weeklyVersePdf;
          if (pdf && pdf.url) {
            const el = document.getElementById('sanity-weekly-verse-pdf');
            if (el) {
              // Sanity-ს CDN სხვა დომენია, ამიტომ download ატრიბუტს
              // ბრაუზერი იგნორირებს — PDF ახალ ტაბში იხსნება.
              el.href = pdf.url;
              const meta = document.getElementById('sanity-weekly-verse-pdf-meta');
              if (meta && pdf.size) {
                const kb = pdf.size / 1024;
                meta.textContent = kb >= 1024
                  ? '· ' + (kb / 1024).toFixed(1) + ' MB'
                  : '· ' + Math.round(kb) + ' KB';
              }
              el.hidden = false;
            }
          }
        }

        // 2. UPDATE EVENTS (REGISTRATION PAGE + CAMP PAGES)
        applyCampRegistrationStatus(events);

        if (events && events.length > 0) {
          events.forEach(evt => {
            const card = document.querySelector(`.event-card[data-event="${evt.eventId}"]`);
            if (card) {
              const isActive = evt.status === 'active';
              const statusText = isActive ? 'ღიაა' : 'დასრულდა';
              const statusClassToRemove = isActive ? 'status-closed' : 'status-active';
              const statusClassToAdd = isActive ? 'status-active' : 'status-closed';
              const buttonText = isActive ? 'რეგისტრაციის გავლა' : 'რეგისტრაცია დასრულდა';
              const metaIconClass = evt.eventId === 'conference' ? 'fa-location-dot' : 'fa-users';

              // Update card classes
              card.classList.remove(statusClassToRemove);
              card.classList.add(statusClassToAdd);

              // Update status badge
              const badge = card.querySelector('.event-status-badge');
              if (badge) badge.textContent = statusText;

              // Update image
              const img = card.querySelector('.event-image-wrap img');
              if (img && evt.imageUrl) {
                img.src = sanityImageUrl(evt.imageUrl, 800);
              }

              // Update title
              const title = card.querySelector('.event-title');
              if (title && evt.title) title.textContent = evt.title;

              // Update metadata rows
              const metas = card.querySelectorAll('.event-meta');
              if (metas.length >= 2) {
                if (evt.dateText) {
                  metas[0].innerHTML = `<i class="fa-regular fa-calendar"></i> ${escapeHtml(evt.dateText)}`;
                }
                if (evt.detailsText) {
                  metas[1].innerHTML = `<i class="fa-solid ${metaIconClass}"></i> ${escapeHtml(evt.detailsText)}`;
                }
              }

              // Update description
              const desc = card.querySelector('.event-description');
              if (desc && evt.description) desc.textContent = evt.description;

              // Update button
              const button = card.querySelector('.btn-register-cta');
              if (button) {
                button.textContent = buttonText;
                if (isActive) {
                  button.removeAttribute('disabled');
                } else {
                  button.setAttribute('disabled', 'true');
                }
              }
            }
          });
        }

        // 3. UPDATE SERMONS (SERMONS PAGE)
        if (!sermons || sermons.length === 0) {
          showSermonsFallback('empty');
        } else {
          const seriesGrid = document.querySelector('.series-grid');
          if (seriesGrid) {
            // Keep static cards that are NOT in Sanity (e.g. by title)
            const staticCards = Array.from(seriesGrid.querySelectorAll('.series-card'));
            const sanityTitles = new Set(sermons.map(s => textOr(s.title).trim().toLowerCase()));
            
            const uniqueStaticCards = staticCards.filter(card => {
              const titleEl = card.querySelector('.series-info h3');
              if (!titleEl) return false;
              const title = titleEl.textContent.trim().toLowerCase();
              return !sanityTitles.has(title);
            });

            let sermonsHtml = '';
            sermons.forEach(series => {
              let episodesHtml = '';
              const episodeCount = series.episodes ? series.episodes.length : 0;
              
              if (series.episodes) {
                series.episodes.forEach((ep, index) => {
                  const epVideoId = getYouTubeId(ep.youtubeUrl);
                  const isPlayingClass = (index === 0) ? 'is-playing' : '';
                  // ეპიზოდის სპიკერი თუ არ წერია, სერიისას ვიყენებთ.
                  const epSpeaker = textOr(ep.speaker, textOr(series.speaker));
                  episodesHtml += `
                    <div class="episode-item ${isPlayingClass}" data-video-id="${escapeHtml(epVideoId || '')}">
                        <div class="episode-title-block">
                            <span class="episode-title"><i class="fa-solid fa-play"></i> ${escapeHtml(textOr(ep.title, 'ეპიზოდი ' + (index + 1)))}</span>
                            ${epSpeaker ? `<span class="episode-speaker">სპიკერი: ${escapeHtml(epSpeaker)}</span>` : ''}
                        </div>
                        ${ep.duration ? `<span class="episode-meta">${escapeHtml(ep.duration)}</span>` : ''}
                    </div>
                  `;
                });
              }

              // ყველა CMS ველი escape-ით: სათაურში „&“ ან „<“ მარკაპს არ უნდა შლიდეს.
              const seriesTitle = escapeHtml(textOr(series.title, 'უსათაურო სერია'));
              sermonsHtml += `
                <div class="series-card" data-category="${escapeHtml(textOr(series.category, 'biblical'))}">
                    <div class="series-thumbnail">
                        <div class="thumbnail-img-wrap">
                            <img src="${escapeHtml(sanityImageUrl(series.thumbnailUrl, 600) || 'https://picsum.photos/600/400')}" alt="${seriesTitle}" loading="lazy" onerror="this.onerror=null; this.src='https://picsum.photos/600/400';">
                        </div>
                        <div class="series-meta-details">
                            <div class="meta-description-section">
                                <span class="meta-label">სერიის შესახებ</span>
                                <p class="meta-description-text">${escapeHtml(textOr(series.description))}</p>
                            </div>
                            <div class="meta-tags-section">
                                <div class="meta-tag">
                                    <i class="fa-solid fa-folder"></i>
                                    <div>კატეგორია: ${
                                      series.category === 'spiritual' ? 'სულიერი ზრდა' :
                                      series.category === 'family' ? 'ოჯახი & ცხოვრება' : 'ბიბლიური სწავლებები'
                                    }</div>
                                </div>
                                <div class="meta-tag">
                                    <i class="fa-solid fa-user"></i>
                                    <div>სპიკერი: ${escapeHtml(textOr(series.speaker, '—'))}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="series-main">
                        <div class="series-header">
                            <div class="series-info">
                                <h3>${seriesTitle}</h3>
                                <p>${escapeHtml(textOr(series.subtitle))}</p>
                            </div>
                            <div style="display: flex; align-items: center;">
                                <span class="series-badge">${episodeCount} ეპიზოდი</span>
                                <i class="fa-solid fa-chevron-down series-icon"></i>
                            </div>
                        </div>
                        <div class="episodes-panel">
                            <div class="episodes-list">
                                ${episodesHtml}
                            </div>
                        </div>
                    </div>
                </div>
              `;
            });
            
            // Rebuild container and append cards
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = sermonsHtml;
            const sanityCards = Array.from(tempDiv.children);
            
            seriesGrid.innerHTML = '';
            sanityCards.forEach(card => seriesGrid.appendChild(card));
            uniqueStaticCards.forEach(card => seriesGrid.appendChild(card));

            // ეპიზოდები ახლა გაჩნდა DOM-ში — პროგრესის ზოლი და „ნანახია“
            // ნიშანი მათზეც უნდა დაიხატოს.
            refreshWatchUI();
          }
        }
      }
    })
    .catch(error => {
      console.error('Error fetching data from Sanity:', error);
      showSermonsFallback('error');
    })
    // წარმატებაზეც და შეცდომაზეც — ერთხელ. კავშირის გარეშე მუხლი
    // მარკაპში ჩაწერილი რჩება, სერიის მთვლელი კი მაინც მუშაობს.
    .finally(renderDailyVerse);
}

// ── ცალკეული ყოველკვირეული ქადაგებები (ქადაგებების გვერდი) ──────────
// წლიური playlist-ებიდან. სერიები Sanity-ში რჩება — აქ მხოლოდ ის
// ქადაგებებია, რომლებიც სერიაში არ ერთიანდება.

const KA_MONTHS = [
  'იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი',
  'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'
];

// rss2json თარიღს "2026-08-31 18:17:04" სახით აბრუნებს — Date-ის
// კონსტრუქტორს ეს ფორმატი სტანდარტულად არ აქვს, ამიტომ ხელით ვშლით.
function formatFeedDate(pubDate) {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})/.exec(pubDate || '');
  if (!m) return '';
  return `${Number(m[3])} ${KA_MONTHS[Number(m[2]) - 1] || ''}, ${m[1]}`;
}

function feedDateValue(pubDate) {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})/.exec(pubDate || '');
  return m ? Number(m[1] + m[2] + m[3]) : 0;
}

// YouTube-ზე სათაურები "ქადაგება | 30 აგვისტო, 2026" სახისაა.
// სადაც ასე არ არის, თარიღს feed-იდან ვიღებთ.
function splitSermonTitle(raw, pubDate) {
  const text = (raw || '').trim();
  const i = text.lastIndexOf('|');
  if (i > 0) {
    const title = text.slice(0, i).trim();
    const date = text.slice(i + 1).trim();
    if (title && date) return { title: title, date: date };
  }
  return { title: text, date: formatFeedDate(pubDate) };
}

function weeklySermonCard(item, showYear) {
  const parts = splitSermonTitle(item.title, item.pubDate);
  // ძებნისას წლები ერევა, ამიტომ თითოეულს წელს ვაწერთ.
  const badge = showYear && item.year
    ? `<span class="weekly-year-badge">${escapeHtml(item.year)}</span>`
    : '';
  return `
    <button type="button" class="weekly-item" data-video-id="${escapeHtml(item.id)}">
      <span class="weekly-thumb">
        <img src="https://img.youtube.com/vi/${encodeURIComponent(item.id)}/mqdefault.jpg" alt="" loading="lazy">
        <span class="weekly-play" aria-hidden="true"><i class="fa-solid fa-play"></i></span>
      </span>
      <span class="weekly-body">
        <span class="weekly-title">${escapeHtml(parts.title)}</span>
        <span class="weekly-date">${escapeHtml(parts.date)}</span>
        ${badge}
      </span>
    </button>`;
}

// ══ მუხლის მისამართი → ბიბლიის გვერდის ბმული ═══════════════════════
// „ფსალმუნი 22:1", „1 კორ. 13:4-7", „იოანე 3:16" → pages/bible.html#p=წიგნი.თავი.მუხლი
// წიგნების ნომრები ბიბლიის გვერდის ნუმერაციაა (1–66; 1–4 მეფეთა = სამუელი და მეფეები,
// ფსალმუნები ქართული გამოცემების ნუმერაციით). სახელი ვერ ვიცანით — ბმული არ ჩნდება.
const BIBLE_BOOK_ALIASES = [
  [1, ['დაბადება', 'დაბ']], [2, ['გამოსვლა', 'გამ']], [3, ['ლევიანნი', 'ლევიანები', 'ლევ']],
  [4, ['რიცხვნი', 'რიცხვთა', 'რიცხ']], [5, ['მეორე რჯული', '2 რჯული', 'რჯული', 'რჯ']],
  [6, ['იესო ნავეს ძე', 'იესო ნავე', 'ისუ ნავე', 'ისუ']], [7, ['მსაჯულთა', 'მსაჯული', 'მსაჯ']],
  [8, ['რუთი', 'რუთ']],
  [9, ['1 სამუელი', '1 სამ', '1 მეფეთა', '1 მეფ']], [10, ['2 სამუელი', '2 სამ', '2 მეფეთა', '2 მეფ']],
  [11, ['3 მეფეთა', '3 მეფ']], [12, ['4 მეფეთა', '4 მეფ']],
  [13, ['1 ნეშტთა', '1 ნეშტ', '1 მატიანე']], [14, ['2 ნეშტთა', '2 ნეშტ', '2 მატიანე']],
  [15, ['ეზრა']], [16, ['ნეემია', 'ნეემ']], [17, ['ესთერი', 'ესთ']], [18, ['იობი', 'იობ']],
  [19, ['ფსალმუნები', 'ფსალმუნნი', 'ფსალმუნი', 'ფსალმ', 'ფს']],
  [20, ['იგავნი სოლომონისა', 'იგავნი', 'იგავები', 'იგავი', 'იგავ']],
  [21, ['ეკლესიასტე', 'ეკლ']], [22, ['ქებათა-ქება', 'ქებათა ქება', 'ქება']],
  [23, ['ესაია', 'ეს']], [24, ['იერემია', 'იერ']], [25, ['გოდება იერემიასი', 'გოდება', 'გოდ']],
  [26, ['ეზეკიელი', 'ეზეკ']], [27, ['დანიელი', 'დან']], [28, ['ოსია', 'ოს']], [29, ['იოველი', 'იოვ']],
  [30, ['ამოსი', 'ამ']], [31, ['აბდია', 'აბდ']], [32, ['იონა', 'იონ']], [33, ['მიქა', 'მიქ']],
  [34, ['ნაუმი', 'ნაუმ']], [35, ['აბაკუმი', 'აბაკ']], [36, ['სოფონია', 'სოფ']], [37, ['ანგია', 'ანგ']],
  [38, ['ზაქარია', 'ზაქ']], [39, ['მალაქია', 'მალ']],
  [40, ['მათეს სახარება', 'მათე', 'მათ']], [41, ['მარკოზის სახარება', 'მარკოზი', 'მარკოზ', 'მარკ']],
  [42, ['ლუკას სახარება', 'ლუკა', 'ლუკ']], [43, ['იოანეს სახარება', 'იოანე', 'იოან', 'ინ']],
  [44, ['მოციქულთა საქმენი', 'საქმე მოციქულთა', 'საქმენი', 'საქმე', 'საქ']],
  [45, ['რომაელთა', 'რომაელებს', 'რომ']],
  [46, ['1 კორინთელთა', '1 კორინთელებს', '1 კორ']], [47, ['2 კორინთელთა', '2 კორინთელებს', '2 კორ']],
  [48, ['გალატელთა', 'გალატელებს', 'გალ']], [49, ['ეფესელთა', 'ეფესელებს', 'ეფეს', 'ეფ']],
  [50, ['ფილიპელთა', 'ფილიპელებს', 'ფილიპ', 'ფილ']], [51, ['კოლოსელთა', 'კოლასელთა', 'კოლოსელებს', 'კოლ']],
  [52, ['1 თესალონიკელთა', '1 თესალონიკელებს', '1 თეს']], [53, ['2 თესალონიკელთა', '2 თესალონიკელებს', '2 თეს']],
  [54, ['1 ტიმოთე', '1 ტიმ']], [55, ['2 ტიმოთე', '2 ტიმ']], [56, ['ტიტე', 'ტიტ']], [57, ['ფილიმონი', 'ფილიმ', 'ფლმ']],
  [58, ['ებრაელთა', 'ებრაელებს', 'ებრ']], [59, ['იაკობი', 'იაკობ', 'იაკ']],
  [60, ['1 პეტრე', '1 პეტ']], [61, ['2 პეტრე', '2 პეტ']],
  [62, ['1 იოანე', '1 იოან', '1 ინ']], [63, ['2 იოანე', '2 იოან', '2 ინ']], [64, ['3 იოანე', '3 იოან', '3 ინ']],
  [65, ['იუდა', 'იუდ']], [66, ['გამოცხადება', 'გამოცხ', 'აპოკალიფსი']]
];

function parseBibleRef(ref) {
  if (!ref) return null;
  let s = String(ref).toLowerCase()
    .replace(/[„“”"()]/g, ' ')
    .replace(/\b(iii|III)\b|მესამე/g, '3 ')
    .replace(/\b(ii|II)\b|მეორე(?!\s+რჯ)/g, '2 ')
    .replace(/\b(i|I)\b|პირველი/g, '1 ')
    .replace(/[-–—]?\s*ის\s+/g, ' ')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // ბოლოში თავი და მუხლი: „22:1", „3,16", „8:28-30", „119"
  const m = s.match(/(\d+)\s*[:,]\s*(\d+)(?:\s*[-–]\s*\d+)?\s*$/) || s.match(/(\d+)\s*$/);
  if (!m) return null;
  const chapter = Number(m[1]);
  const verse = m[2] ? Number(m[2]) : null;
  const name = s.slice(0, m.index).trim();
  if (!name || !chapter) return null;

  let best = null;
  BIBLE_BOOK_ALIASES.forEach(pair => {
    pair[1].forEach(alias => {
      const a = alias.toLowerCase();
      if ((name === a || name.indexOf(a) === 0) && (!best || a.length > best.len)) {
        best = { book: pair[0], len: a.length };
      }
    });
  });
  if (!best) return null;
  return { book: best.book, chapter, verse };
}

function bibleLinkFor(ref) {
  const r = parseBibleRef(ref);
  if (!r) return '';
  const inPages = /\/pages\//.test(window.location.pathname);
  return (inPages ? '' : 'pages/') + 'bible.html#p=' + r.book + '.' + r.chapter + (r.verse ? '.' + r.verse : '');
}

// ══ დღის მუხლი ═════════════════════════════════════════════════════
// CMS-ში კვირაში ერთხელ იწერება შვიდი მუხლი — თითო დღეს თითო. საიტი
// დღევანდელს თავად ირჩევს, ამიტომ ყოველდღიური განახლება საჭირო არაა.
// წაკითხვის ნიშანი და ზედიზედ დღეების მთვლელი მხოლოდ ვიზიტორის
// ბრაუზერშია — არსად იგზავნება.

let dailyVerseData = null;

const VERSE_KEY = 'efc:verse:v1';
// კვირა ორშაბათიდან იწყება: კვირადღის ქადაგების მუხლები მომდევნო
// შვიდ დღეს მიჰყვება, თავად კვირადღე კი რიგის ბოლოშია.
const VERSE_LABELS = ['ორ', 'სა', 'ოთ', 'ხუ', 'პა', 'შა', 'კვ'];
const VERSE_DAY_NAMES = ['ორშაბათი', 'სამშაბათი', 'ოთხშაბათი', 'ხუთშაბათი', 'პარასკევი', 'შაბათი', 'კვირა'];
// სერიის დასათვლელად ორი თარიღიც კმარა, მაგრამ დღეების ზოლს მიმდინარე
// კვირის შვიდივე დღე სჭირდება. ორმოცდაათი ჩანაწერი ~1 KB-ია.
const VERSE_MAX_DAYS = 50;
// ამაზე გრძელი მუხლი უფრო პატარა შრიფტით იწერება. ზღვარი გაზომვით
// შეირჩა: 180 სიმბოლო მობილურზე დაახლოებით შვიდ სტრიქონს იკავებს.
const VERSE_LONG_CHARS = 180;

// თარიღი ადგილობრივი დროით, YYYY-MM-DD. UTC-ს ვერ გამოვიყენებთ:
// საღამოს გვიან წაკითხვა მეორე დღეს ჩაეთვლებოდა.
function verseDayKey(date) {
  const d = date || new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + day;
}

function verseYesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return verseDayKey(d);
}

function readVerseState() {
  const empty = { last: '', streak: 0, days: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(VERSE_KEY));
    if (!raw || typeof raw !== 'object') return empty;
    return {
      last: typeof raw.last === 'string' ? raw.last : '',
      streak: typeof raw.streak === 'number' ? raw.streak : 0,
      days: (raw.days && typeof raw.days === 'object') ? raw.days : {}
    };
  } catch (e) { return empty; }
}

function writeVerseState(state) {
  try {
    const keys = Object.keys(state.days);
    if (keys.length > VERSE_MAX_DAYS) {
      keys.sort().slice(0, keys.length - VERSE_MAX_DAYS)
        .forEach(k => { delete state.days[k]; });
    }
    localStorage.setItem(VERSE_KEY, JSON.stringify(state));
  } catch (e) { /* კვოტა ან private mode */ }
}

// გუშინდელზე ძველი ჩანაწერი სერიას წყვეტს — შენახული რიცხვი
// ავტომატურად აღარ ითვლება.
function verseStreakNow(state) {
  if (!state.last) return 0;
  return (state.last === verseDayKey() || state.last === verseYesterdayKey())
    ? state.streak
    : 0;
}

function markVerseRead() {
  const state = readVerseState();
  const today = verseDayKey();
  if (state.last === today) return state;
  state.streak = (state.last === verseYesterdayKey()) ? state.streak + 1 : 1;
  state.last = today;
  state.days[today] = 1;
  writeVerseState(state);
  return state;
}

function renderDailyVerse() {
  const textEl = document.getElementById('sanity-weekly-verse');
  if (!textEl) return;                       // ბარათი მხოლოდ მთავარ გვერდზეა
  const refEl = document.getElementById('sanity-weekly-verse-ref');

  // მუხლების სია. ახალი ველი პრიორიტეტულია; თუ ცარიელია, ძველ ერთ
  // მუხლს ვიყენებთ; თუ ისიც — მარკაპში ჩაწერილ სარეზერვოს.
  const cms = dailyVerseData || {};
  let verses = Array.isArray(cms.weeklyVerses)
    ? cms.weeklyVerses.filter(v => v && v.text)
    : [];
  if (!verses.length && cms.weeklyVerseText) {
    verses = [{ text: cms.weeklyVerseText, ref: cms.weeklyVerseRef || '' }];
  }
  if (!verses.length) {
    verses = [{
      text: textEl.textContent.trim(),
      ref: refEl ? refEl.textContent.trim() : ''
    }];
  }

  // getDay() კვირადღეს ნულს აბრუნებს — ერთი დღით ვძრავთ, რომ
  // ორშაბათი გახდეს ნული, კვირადღე კი ექვსი.
  const todayIdx = (new Date().getDay() + 6) % 7;
  let shownIdx = todayIdx;

  const daysBox = document.getElementById('verseDays');
  const progressBox = document.getElementById('verseProgress');
  const readBtn = document.getElementById('verseReadBtn');
  const streakEl = document.getElementById('verseStreak');

  // მიმდინარე კვირის კონკრეტული თარიღი — დღეების ზოლს სჭირდება,
  // რომ დაინახოს, რომელი დღე იყო წაკითხული. შუადღეს ვითვლით,
  // რომ ზაფხულის დროზე გადასვლამ დღე არ წაძრას.
  function dateOfWeekday(i) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - todayIdx + i);
    return d;
  }

  function paintVerse() {
    // შვიდზე ნაკლები მუხლიც მუშაობს — სია ციკლურად ტრიალდება.
    const v = verses[shownIdx % verses.length];
    textEl.textContent = v.text;
    // გრძელი მუხლი ბარათს ორჯერ მაღალს ხდის. შრიფტს ოდნავ ვაპატარავებთ,
    // რომ ტექსტი მთლიანად ჩანდეს — ჩამოჭრა წმინდა წერილს არ შეეფერება.
    textEl.classList.toggle('is-long', (v.text || '').length > VERSE_LONG_CHARS);
    if (refEl) refEl.textContent = v.ref || '';
    // „წაიკითხე მთელი თავი" — ბიბლიის გვერდზე, მუხლი გამოყოფილი. თუ მისამართი
    // ვერ გავარჩიეთ, ბმული უბრალოდ არ ჩანს.
    const openEl = document.getElementById('verseOpenBtn');
    if (openEl) {
      const href = bibleLinkFor(v.ref);
      openEl.hidden = !href;
      if (href) openEl.href = href;
    }
  }

  function paintDays() {
    if (!daysBox || daysBox.hidden) return;
    const state = readVerseState();
    Array.prototype.forEach.call(daysBox.children, (btn, i) => {
      const future = i > todayIdx;
      btn.classList.toggle('is-today', i === todayIdx);
      btn.classList.toggle('is-active', i === shownIdx);
      btn.classList.toggle('is-future', future);
      btn.classList.toggle('is-read', !!state.days[verseDayKey(dateOfWeekday(i))]);
      // მომავალი დღეები დაკეტილია: თუ შვიდივე ერთდროულად იკითხება,
      // ყოველდღიური დაბრუნების მიზეზი ქრება.
      btn.disabled = future;
      btn.setAttribute('aria-pressed', i === shownIdx ? 'true' : 'false');
    });
  }

  function paintProgress() {
    if (!progressBox || !readBtn) return;
    const state = readVerseState();
    const label = readBtn.querySelector('.verse-read-label');
    const icon = readBtn.querySelector('i');
    const doneToday = !!state.days[verseDayKey()];

    if (shownIdx !== todayIdx) {
      // სხვა დღეს ათვალიერებს — ღილაკი უკან აბრუნებს.
      readBtn.classList.remove('is-done');
      readBtn.disabled = false;
      readBtn.dataset.action = 'today';
      if (label) label.textContent = 'დღევანდელ მუხლზე დაბრუნება';
      if (icon) icon.className = 'fa-solid fa-arrow-rotate-left';
    } else if (doneToday) {
      readBtn.classList.add('is-done');
      readBtn.disabled = true;
      readBtn.dataset.action = '';
      if (label) label.textContent = 'დღეს წაკითხულია';
      if (icon) icon.className = 'fa-solid fa-circle-check';
    } else {
      readBtn.classList.remove('is-done');
      readBtn.disabled = false;
      readBtn.dataset.action = 'read';
      if (label) label.textContent = 'წავიკითხე';
      if (icon) icon.className = 'fa-regular fa-circle-check';
    }

    if (streakEl) {
      const n = verseStreakNow(state);
      // ერთი დღე ჯერ სერია არაა — მთვლელი მეორე დღიდან ჩნდება.
      if (n >= 2) {
        streakEl.innerHTML = '<span aria-hidden="true">🔥</span> <b>' + n + '</b> დღე ზედიზედ';
        streakEl.hidden = false;
      } else {
        streakEl.hidden = true;
      }
    }

    progressBox.hidden = false;
  }

  function repaint() {
    paintVerse();
    paintDays();
    paintProgress();
  }

  // დღეების ზოლი მხოლოდ მაშინ, როცა ასარჩევი ნამდვილად არის.
  if (daysBox && verses.length > 1) {
    daysBox.innerHTML = VERSE_LABELS.map((lbl, i) =>
      `<button type="button" class="verse-day" data-day="${i}" aria-pressed="false" aria-label="${escapeHtml(VERSE_DAY_NAMES[i])}">${escapeHtml(lbl)}</button>`
    ).join('');
    daysBox.hidden = false;
    daysBox.addEventListener('click', e => {
      const btn = e.target.closest('.verse-day');
      if (!btn || btn.disabled) return;
      shownIdx = Number(btn.getAttribute('data-day'));
      repaint();
    });
  }

  if (readBtn) {
    readBtn.addEventListener('click', () => {
      if (readBtn.dataset.action === 'today') {
        shownIdx = todayIdx;
        repaint();
        return;
      }
      markVerseRead();
      paintDays();
      paintProgress();
    });
  }

  repaint();
}

// ══ ყურების პროგრესი ═══════════════════════════════════════════════
// ვიზიტორი ხშირად ვერ ასწრებს ქადაგების ბოლომდე მოსმენას. აქ ვინახავთ,
// სად გაჩერდა, რომ დაბრუნებისას იქიდან გააგრძელოს. ყველაფერი მხოლოდ
// მის ბრაუზერშია — არსად იგზავნება.

const WATCH_KEY = 'efc:watch:v1';
const WATCH_MIN_SECONDS = 15;      // ამაზე ნაკლები დაწყებად არ ითვლება
const WATCH_DONE_RATIO = 0.92;     // ბოლო წუთებში ტიტრებია — ნანახად ჩავთვლით
// ერთი ჩანაწერი ~254 ბაიტია, ბრაუზერის ლიმიტი კი ~5 MB. 1000 ჩანაწერი
// დაახლოებით 0.24 MB-ია — ლიმიტის 5%-ზე ნაკლები. წელიწადში ~24 ქადაგებით
// ეს ზღვარი ათწლეულებში არ მიიღწევა; ის მხოლოდ იმისთვისაა, რომ
// დაზიანებულმა ჩანაწერმა მეხსიერება უსასრულოდ არ შეავსოს.
const WATCH_MAX_ENTRIES = 1000;

function readWatchMap() {
  try {
    const raw = JSON.parse(localStorage.getItem(WATCH_KEY));
    return (raw && typeof raw === 'object') ? raw : {};
  } catch (e) { return {}; }
}

function writeWatchMap(map) {
  try {
    const ids = Object.keys(map);
    if (ids.length > WATCH_MAX_ENTRIES) {
      ids.sort((a, b) => (map[b].at || 0) - (map[a].at || 0))
        .slice(WATCH_MAX_ENTRIES)
        .forEach(id => { delete map[id]; });
    }
    localStorage.setItem(WATCH_KEY, JSON.stringify(map));
  } catch (e) { /* კვოტა ან private mode */ }
}

function watchEntry(videoId) {
  return videoId ? (readWatchMap()[videoId] || null) : null;
}

function saveWatchProgress(videoId, seconds, duration, title) {
  if (!videoId || !duration || seconds < WATCH_MIN_SECONDS) return;
  const map = readWatchMap();
  const done = seconds >= duration * WATCH_DONE_RATIO;
  const prev = map[videoId] || {};
  map[videoId] = {
    // დასრულებულს ნულს ვუბრუნებთ, რომ ხელახლა დაწყებისას თავიდან წავიდეს.
    t: done ? 0 : Math.floor(seconds),
    d: Math.floor(duration),
    done: done,
    title: title || prev.title || '',
    at: Date.now()
  };
  writeWatchMap(map);
}

// წამები საათის სახით: 3725 → „1:02:05“
function formatWatchTime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = n => (n < 10 ? '0' : '') + n;
  return h ? h + ':' + two(m) + ':' + two(sec) : m + ':' + two(sec);
}

// ── პლეერი ─────────────────────────────────────────────────────────
// დროის წასაკითხად YouTube-ის IFrame API გვჭირდება. სანამ ის ჩაიტვირთება
// (ან თუ საერთოდ ვერ ჩაიტვირთა), ვიდეო ჩვეულებრივ, src-ით იხსნება —
// დაწყების წერტილს მაშინ URL-ის &start= გადასცემს.

let ytPlayer = null;
// true, როცა დაკვრა ვიზიტორის დაჭერით დაიწყო.
let ytWantsPlay = false;
let ytPollTimer = null;
let ytPendingTitle = '';

function sermonFrame() { return document.getElementById('mainSermonPlayer'); }

function playingVideoId() {
  if (ytPlayer && ytPlayer.getVideoData) {
    try { return (ytPlayer.getVideoData() || {}).video_id || null; } catch (e) { return null; }
  }
  return null;
}

function recordWatchNow() {
  if (!ytPlayer || !ytPlayer.getCurrentTime || !ytPlayer.getDuration) return;
  let t, d;
  try { t = ytPlayer.getCurrentTime(); d = ytPlayer.getDuration(); } catch (e) { return; }
  const id = playingVideoId();
  if (!id || !d) return;
  saveWatchProgress(id, t, d, ytPendingTitle);
  refreshWatchUI();
  // ბლოკი მიმდინარე ქადაგებას უნდა მისდევდეს. სანამ ის მხოლოდ გვერდის
  // გახსნისას იხატებოდა, ეკრანზე შეიძლებოდა სულ სხვა ქადაგების დრო
  // ეწერა, ვიდრე პლეერში იკვრებოდა — ციფრები ერთმანეთს არ ემთხვეოდა.
  renderResumeBar();
}

function stopWatchPoll() {
  if (ytPollTimer) { clearInterval(ytPollTimer); ytPollTimer = null; }
}

function onSermonStateChange(event) {
  const YTS = window.YT && YT.PlayerState;
  if (!YTS) return;
  if (event.data === YTS.PLAYING) {
    stopWatchPoll();
    ytPollTimer = setInterval(recordWatchNow, 5000);
  } else {
    stopWatchPoll();
    if (event.data === YTS.PAUSED) recordWatchNow();
    if (event.data === YTS.ENDED) {
      const id = playingVideoId();
      let d = 0;
      try { d = ytPlayer.getDuration(); } catch (e) { /* ignore */ }
      if (id && d) saveWatchProgress(id, d, d, ytPendingTitle);
      if (id && window.efcTrack) efcTrack('sermon_complete', { video_id: id, sermon_title: ytPendingTitle });
      refreshWatchUI();
      renderResumeBar();
    }
  }
}

// გლობალური უნდა იყოს — YouTube-ის სკრიპტი სახელით ეძებს.
window.onYouTubeIframeAPIReady = function () {
  if (!sermonFrame() || !window.YT || !YT.Player) return;
  ytPlayer = new YT.Player('mainSermonPlayer', {
    events: {
      onReady: function (event) {
        refreshWatchUI();
        // ვიზიტორმა დაკვრა უკვე ითხოვა — თუ ბრაუზერმა ავტომატური
        // გაშვება არ დაუშვა, აქ ვასწორებთ.
        if (ytWantsPlay && event && event.target && event.target.playVideo) {
          try { event.target.playVideo(); } catch (e) { /* ბრაუზერმა უარი თქვა */ }
        }
      },
      onStateChange: onSermonStateChange
    }
  });
};

/** სურათი, რომელიც პლეერის ადგილას დგას დაკვრის დაწყებამდე. */
function setSermonFacade(videoId) {
  const facade = document.getElementById('sermonFacade');
  // დაკვრა თუ უკვე დაიწყო, სურათს აღარ ვცვლით — პლეერი უკან არ უნდა დაბრუნდეს.
  if (!facade || facade.hidden || !videoId) return;
  facade.dataset.videoId = videoId;
  const img = facade.querySelector('.player-facade__thumb');
  if (img) img.src = 'https://img.youtube.com/vi/' + encodeURIComponent(videoId) + '/maxresdefault.jpg';
}

/** სურათს პლეერით ვცვლით. */
function revealSermonPlayer() {
  const facade = document.getElementById('sermonFacade');
  const frame = sermonFrame();
  if (facade) facade.hidden = true;
  if (frame) frame.hidden = false;
}

/** YouTube-ის API მხოლოდ პირველი დაკვრისას გვჭირდება. */
let ytApiRequested = false;
function loadYouTubeApi() {
  if (ytApiRequested || (window.YT && window.YT.Player)) return;
  ytApiRequested = true;
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
}

/** ქადაგების გახსნა მთავარ პლეერში, შენახული წუთიდან. */
function playSermon(videoId, title) {
  const frame = sermonFrame();
  if (!videoId || !frame) return;

  // წინა ვიდეოს პროგრესი გადართვამდე უნდა შევინახოთ.
  recordWatchNow();

  const entry = watchEntry(videoId);
  const start = (entry && !entry.done && entry.t > WATCH_MIN_SECONDS) ? entry.t : 0;
  ytPendingTitle = title || (entry && entry.title) || '';
  if (window.efcTrack) {
    efcTrack('sermon_play', {
      video_id: videoId,
      sermon_title: ytPendingTitle,
      resumed: start ? 'yes' : 'no'
    });
  }

  if (ytPlayer && ytPlayer.loadVideoById) {
    ytPlayer.loadVideoById({ videoId: videoId, startSeconds: start });
  } else {
    // playsinline=1 — ამის გარეშე iPhone ვიდეოს სრულ ეკრანზე ითხოვს და
    // ავტომატურ დაკვრას ბლოკავს: ხალხს YouTube-ის თავისი play-ღილაკის
    // დაჭერა უწევდა. ytWantsPlay კი მეორე დაზღვევაა — პლეერის მზადყოფნისას
    // დაკვრას თავად ვთხოვთ.
    // ჯერ ვაჩენთ, მერე ვტვირთავთ: დამალულ ჩარჩოში ჩატვირთული ვიდეო
    // iPhone-ს დაჭერის ნებართვად არ ჩაეთვლება.
    ytWantsPlay = true;
    revealSermonPlayer();
    frame.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(videoId) +
      '?rel=0&modestbranding=1&autoplay=1&playsinline=1&enablejsapi=1&vq=hd1080' + (start ? '&start=' + start : '');
    loadYouTubeApi();
  }

  document.querySelectorAll('.weekly-item, .episode-item').forEach(el => {
    el.classList.toggle('is-playing', el.getAttribute('data-video-id') === videoId);
  });
  refreshWatchUI();

  const zone = document.getElementById('playerZone');
  if (zone) zone.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** ბარათებზე პროგრესის ზოლი და „ნანახია“ ნიშანი. */
function refreshWatchUI() {
  const map = readWatchMap();
  document.querySelectorAll('.weekly-item, .episode-item').forEach(el => {
    const entry = map[el.getAttribute('data-video-id')];
    const done = !!(entry && entry.done);
    const pct = (entry && !done && entry.d) ? Math.min(100, Math.round(entry.t / entry.d * 100)) : 0;

    el.classList.toggle('is-watched', done);

    let bar = el.querySelector('.watch-progress');
    if (pct > 0) {
      if (!bar) {
        bar = document.createElement('span');
        bar.className = 'watch-progress';
        bar.innerHTML = '<span class="watch-progress-fill"></span>';
        (el.querySelector('.weekly-thumb') || el).appendChild(bar);
      }
      bar.firstChild.style.width = pct + '%';
    } else if (bar) {
      bar.remove();
    }

    let mark = el.querySelector('.watch-done');
    if (done && !mark) {
      mark = document.createElement('span');
      mark.className = 'watch-done';
      mark.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i>ნანახია';
      (el.querySelector('.weekly-body') || el.querySelector('.episode-title-block') || el).appendChild(mark);
    } else if (!done && mark) {
      mark.remove();
    }
  });
}

/** „განაგრძე ყურება“ — ბოლო დაუსრულებელი ქადაგება პლეერის ქვემოთ. */
let resumeSignature = '';
function renderResumeBar() {
  const box = document.getElementById('resumeBar');
  if (!box) return;
  const map = readWatchMap();
  const unfinished = Object.keys(map)
    .map(id => Object.assign({ id: id }, map[id]))
    .filter(e => !e.done && e.t > WATCH_MIN_SECONDS && e.d)
    .sort((a, b) => (b.at || 0) - (a.at || 0))[0];

  if (!unfinished) { box.hidden = true; resumeSignature = ''; return; }

  const pct = Math.min(100, Math.round(unfinished.t / unfinished.d * 100));
  const left = Math.max(0, unfinished.d - unfinished.t);
  const parts = splitSermonTitle(unfinished.title, '');

  // ყოველ 5 წამში innerHTML-ის თავიდან აგება ზედმეტია — მხოლოდ მაშინ
  // ვხატავთ, როცა რამე მართლა შეიცვალა.
  const signature = unfinished.id + '|' + Math.floor(unfinished.t) + '|' + unfinished.d;
  if (signature === resumeSignature && !box.hidden) return;
  resumeSignature = signature;

  box.hidden = false;
  box.innerHTML =
    '<span class="resume-thumb"><img src="https://img.youtube.com/vi/' + encodeURIComponent(unfinished.id) + '/mqdefault.jpg" alt="" loading="lazy"></span>' +
    '<span class="resume-body">' +
      '<span class="resume-label">განაგრძე ყურება</span>' +
      '<span class="resume-title">' + escapeHtml(parts.title || 'ბოლო ქადაგება') + '</span>' +
      '<span class="resume-track">' +
        '<span class="watch-progress"><span class="watch-progress-fill" style="width:' + pct + '%"></span></span>' +
        '<span class="resume-pct">' + pct + '%</span>' +
      '</span>' +
      // სრული ხანგრძლივობაც ჩანს, რომ ციფრები პლეერს გადაუმოწმდეს.
      '<span class="resume-meta">გაჩერდი <strong>' + formatWatchTime(unfinished.t) + '</strong>-ზე · დარჩა <strong>' + formatWatchTime(left) + '</strong> <span class="resume-total">(სულ ' + formatWatchTime(unfinished.d) + ')</span></span>' +
    '</span>' +
    '<button type="button" class="resume-btn" data-video-id="' + escapeHtml(unfinished.id) + '" aria-label="ყურების გაგრძელება">' +
      // ჩაშენებული SVG და არა Font Awesome: ტელეფონზე ღილაკი მხოლოდ
      // ხატულაა და თუ შრიფტი ვერ ჩაიტვირთა, ცარიელი წრე რჩებოდა.
      '<svg class="resume-btn-icon" viewBox="0 0 12 14" aria-hidden="true" focusable="false">' +
        '<path d="M11.2 6.15 1.8.28A1 1 0 0 0 .3 1.13v11.74a1 1 0 0 0 1.5.85l9.4-5.87a1 1 0 0 0 0-1.7Z"/>' +
      '</svg>' +
      '<span class="resume-btn-text">გაგრძელება</span>' +
    '</button>';
}

function initSermonWatch() {
  if (!sermonFrame()) return;

  // script.js დიდი პაუზის შემდეგ გვერდს თავიდან ტვირთავს — მიმდინარე
  // დაკვრა ამას არ უნდა შეეწიროს.
  (window.efcBusyChecks = window.efcBusyChecks || []).push(() => {
    try { return !!ytPlayer && ytPlayer.getPlayerState() === 1; } catch (e) { return false; }
  });

  // საიტიდან გასვლისას ბოლო წამები რომ არ დაიკარგოს.
  window.addEventListener('pagehide', recordWatchNow);
  document.addEventListener('visibilitychange', () => { if (document.hidden) recordWatchNow(); });

  const facade = document.getElementById('sermonFacade');
  if (facade) {
    facade.addEventListener('click', () => {
      const id = facade.dataset.videoId;
      if (id) playSermon(id, '');
    });
  }

  const box = document.getElementById('resumeBar');
  if (box) {
    box.addEventListener('click', e => {
      const btn = e.target.closest('.resume-btn');
      if (btn) playSermon(btn.getAttribute('data-video-id'));
    });
  }

  renderResumeBar();
  refreshWatchUI();
}

// სრული სია რეპოზიტორიაშივე დევს: YouTube-ის feed მაქსიმუმ 10-15
// ჩანაწერს აბრუნებს, 2023 წელს კი 40 ქადაგებაა. ფაილს
// scripts/build-sermon-archive.js ადგენს.
let archivePromise = null;
function fetchSermonArchive() {
  if (archivePromise) return archivePromise;
  archivePromise = fetch(ARCHIVE_URL)
    .then(res => (res.ok ? res.json() : null))
    .catch(err => {
      console.warn('ქადაგებების არქივი ვერ ჩაიტვირთა, ვრჩებით feed-ზე:', err);
      return null;
    });
  return archivePromise;
}

function renderWeeklySermons() {
  const root = document.getElementById('weeklySermons');
  if (!root) return;
  const tabsBox = root.querySelector('.year-tabs');
  const list = root.querySelector('.weekly-list');
  if (!tabsBox || !list) return;

  // წლების ნუსხა არქივიდან მოდის, მას კი სკრიპტი თავად ადგენს არხზე
  // არსებული სიების მიხედვით — ახალი წლის ჩანართი კოდის შეხების
  // გარეშე ჩნდება. SERMON_PLAYLISTS მხოლოდ სათადარიგოა.
  let currentYear = SERMON_PLAYLISTS[0].year;

  const searchInput = document.getElementById('weeklySearch');
  const searchClear = document.getElementById('weeklySearchClear');
  const foundLine = document.getElementById('weeklyFound');

  // ძებნა ყველა წელს მოიცავს, ამიტომ ცალკე საერთო ნუსხას ვინახავთ.
  // ჩანართის სია და ძებნის შედეგი ერთმანეთს არ ცვლის — ტექსტის
  // წაშლისთანავე არჩეულ წელს ვუბრუნდებით.
  let allSermons = [];
  let yearItems = [];

  function query() {
    return searchInput ? searchInput.value.trim().toLowerCase() : '';
  }

  function paint() {
    const q = query();
    if (searchClear) searchClear.hidden = !q;

    if (!q) {
      if (foundLine) foundLine.hidden = true;
      list.innerHTML = yearItems.length
        ? yearItems.map(item => weeklySermonCard(item, false)).join('')
        : '<p class="weekly-state">ამ წლის ქადაგებები ვერ ჩაიტვირთა. სცადეთ ცოტა ხანში.</p>';
      return;
    }

    const hits = allSermons.filter(item => (item.title || '').toLowerCase().indexOf(q) !== -1);
    if (foundLine) {
      // შედეგის გარეშე ხაზი ცარიელ ადგილს იკავებდა — შეტყობინება ისედაც სიაშია.
      foundLine.hidden = !hits.length;
      foundLine.textContent = 'ნაპოვნია ' + hits.length + ' ქადაგება ყველა წელს შორის';
    }
    list.innerHTML = hits.length
      ? hits.map(item => weeklySermonCard(item, true)).join('')
      : '<p class="weekly-state">„' + escapeHtml(searchInput.value.trim()) + '“ — ვერაფერი მოიძებნა. სცადე სხვა სიტყვა ან თარიღი.</p>';
    // ბარათები ახლად აიგო — ნიშნები თავიდან უნდა დაეხატოს.
    refreshWatchUI();
  }

  function show(playlistId, year, button) {
    tabsBox.querySelectorAll('.year-tab').forEach(b => {
      const on = b === button;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
    });
    list.innerHTML = '<p class="weekly-state">იტვირთება…</p>';

    // მიმდინარე წელს feed-საც ვეკითხებით, რომ ახალი ქადაგება არქივის
    // თავიდან შედგენის გარეშე გამოჩნდეს. ძველი წლები აღარ იცვლება.
    const isCurrent = year === currentYear;
    const live = isCurrent ? fetchPlaylistFeed(playlistId) : Promise.resolve(null);

    Promise.all([fetchSermonArchive(), live]).then(([archive, feed]) => {
      // არქივი ქრონოლოგიურია — გვერდზე ახლიდან ძველისკენ ვაჩვენებთ.
      const stored = (archive && archive.years && archive.years[year]) || null;
      // თუ არქივი მიუწვდომელია, ძველ წელზეც feed-ს ვეკითხებით —
      // არასრული სია სჯობს ცარიელს.
      if (!stored && !feed) return fetchPlaylistFeed(playlistId).then(f => [null, f]);
      return [stored, feed];
    }).then(([stored, feed]) => {
      if (tabsBox.querySelector('.year-tab.is-active') !== button) return; // ვიზიტორმა სხვა წელი აირჩია

      // არქივი უკვე ახლიდან ძველისკენაა დალაგებული — სკრიპტი მას
      // თარიღით ალაგებს, რადგან დასაკრავი სიების რიგი ერთგვაროვანი არ არის.
      let items = stored ? stored.slice() : [];

      if (feed && feed.length) {
        const known = new Set(items.map(i => i.id));
        const fresh = feed.filter(i => !known.has(i.id))
          .sort((a, b) => feedDateValue(b.pubDate) - feedDateValue(a.pubDate));
        items = fresh.concat(items);
      }

      yearItems = items.map(item => Object.assign({ year: year }, item));

      // ცოცხალმა feed-მა შეიძლება არქივში ჯერ არარსებული ქადაგება
      // მოიტანოს — საერთო ნუსხაშიც ვასწორებთ, რომ ძებნამ იპოვოს.
      const merged = allSermons.filter(s => s.year !== year);
      allSermons = yearItems.concat(merged)
        .sort((a, b) => Number(b.year) - Number(a.year));

      paint();
    });
  }

  tabsBox.addEventListener('click', e => {
    const btn = e.target.closest('.year-tab');
    if (!btn) return;
    // წლის არჩევა ძებნიდან გამოსვლას ნიშნავს, თორემ ჩანართი აქტიური
    // ჩანდა და სია სულ სხვას აჩვენებდა.
    if (searchInput && searchInput.value) searchInput.value = '';
    show(btn.getAttribute('data-playlist'), btn.getAttribute('data-year'), btn);
  });

  // ქადაგება ზემოთ, უკვე არსებულ პლეერში იხსნება — ვიზიტორი საიტზე რჩება.
  // playSermon თავად აგრძელებს იქიდან, სადაც წინა ჯერზე გაჩერდა.
  list.addEventListener('click', e => {
    const item = e.target.closest('.weekly-item');
    if (!item) return;
    const titleEl = item.querySelector('.weekly-title');
    playSermon(item.getAttribute('data-video-id'), titleEl ? titleEl.textContent : '');
  });

  if (searchInput) {
    searchInput.addEventListener('input', paint);
    // Escape-ით ძებნიდან გამოსვლა კლავიატურით მომუშავეს ეხმარება.
    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Escape' && searchInput.value) { searchInput.value = ''; paint(); }
    });
  }
  if (searchClear) {
    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchInput.focus();
      paint();
    });
  }

  list.innerHTML = '<p class="weekly-state">იტვირთება…</p>';
  fetchSermonArchive().then(archive => {
    const playlists = (archive && archive.playlists && archive.playlists.length)
      ? archive.playlists
      : SERMON_PLAYLISTS;
    currentYear = playlists[0].year;

    // ძებნას ყველა წელი მაშინვე სჭირდება — არქივი ისედაც ერთ ფაილშია,
    // ამიტომ დამატებითი მოთხოვნა არ ხდება.
    if (archive && archive.years) {
      allSermons = playlists.reduce((acc, pl) => {
        const stored = archive.years[pl.year];
        if (!stored) return acc;
        return acc.concat(stored.map(item => Object.assign({ year: pl.year }, item)));
      }, []);
    }

    tabsBox.innerHTML = playlists.map((pl, i) =>
      `<button type="button" class="year-tab${i === 0 ? ' is-active' : ''}" role="tab" aria-selected="${i === 0}" data-playlist="${pl.id}" data-year="${pl.year}">${pl.year}</button>`
    ).join('');

    const first = tabsBox.querySelector('.year-tab');
    if (first) show(first.getAttribute('data-playlist'), first.getAttribute('data-year'), first);
  });
}

document.addEventListener('DOMContentLoaded', updatePageContent);
document.addEventListener('DOMContentLoaded', renderWeeklySermons);
document.addEventListener('DOMContentLoaded', initSermonWatch);
