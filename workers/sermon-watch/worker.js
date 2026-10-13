/**
 * Cloudflare Worker — ახალი ქადაგების და რეგისტრაციის მოდარაჯე,
 * ყოველკვირეული შეხსენებები.
 *
 * GitHub-ის განრიგს ზუსტად ვერ ვენდობით: 10-წუთიან ცრონს ის რეალურად
 * 4–7 საათში ერთხელ უშვებს. Cloudflare-ის განრიგი კი წუთის
 * სიზუსტით მუშაობს. ამიტომ შემოწმება აქ ხდება, ყოველ წუთს:
 *
 *   1. ვკითხულობთ data/sermon-archive.json-ს პირდაპირ GitHub-იდან
 *      (API-ით — საიტის ქეში რომ არ შეგვეშალოს);
 *   2. ვკითხულობთ მიმდინარე წლის დასაკრავ სიას YouTube Data API-ით
 *      (გასაღების გარეშე — RSS ფიდით, რომელიც აგვიანებს);
 *   3. თუ სიაში არქივისთვის უცნობი ვიდეოა — ვუშვებთ workflow-ს
 *      „ქადაგებების არქივის განახლება“. დანარჩენს (არქივი, ელფოსტა,
 *      push) ის აკეთებს, როგორც აქამდე.
 *
 * ორჯერ გაშვება საშიში არ არის: workflow ბოლო ქადაგების ID-ს
 * განახლებამდე და შემდეგ ადარებს, ამიტომ მეორე გაშვება შეტყობინებას
 * აღარ გააგზავნის.
 *
 * საიდუმლო: GITHUB_TOKEN — fine-grained ტოკენი მხოლოდ ამ რეპოზე,
 * უფლება „Actions: Read and write“ (+ „Contents: Read-only“).
 * YOUTUBE_API_KEY — Google Cloud-ის გასაღები, მხოლოდ YouTube Data API v3.
 * იხ. README.md ამავე საქაღალდეში.
 */

const REPO = 'Toma-Tkhelidze/church-web';
const WORKFLOW = 'update-sermon-archive.yml';

// ყოველკვირეული შეხსენებები: ცრონი (UTC, wrangler.toml) → რომელი.
// თბილისი = UTC + 4, ზაფხულის დრო არ გვაქვს.
const REMINDERS = {
  '0 5 * * SUN': 'sunday',          // კვირა 09:00 — ღვთისმსახურება 11:00
  '0 10 * * SAT': 'youth',          // შაბათი 14:00 — ახალგაზრდული 16:00
  '0 13 * * WED': 'family-groups'   // ოთხშაბათი 17:00 — საოჯახო ჯგუფები 19:00
};

async function github(env, path, init = {}) {
  return fetch('https://api.github.com/repos/' + REPO + path, {
    ...init,
    headers: {
      // ჩასმისას ბოლოში ხშირად ახალი ხაზი მიჰყვება — სათაურში ის შეცდომაა.
      Authorization: 'Bearer ' + (env.GITHUB_TOKEN || '').trim(),
      'User-Agent': 'efck-sermon-watch',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {})
    }
  });
}

async function dispatch(env, workflow, inputs) {
  const run = await github(env, '/actions/workflows/' + workflow + '/dispatches', {
    method: 'POST',
    headers: { Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify(inputs ? { ref: 'main', inputs } : { ref: 'main' })
  });
  if (!run.ok) throw new Error(workflow + ' ვერ გავუშვი: HTTP ' + run.status + ' ' + await run.text());
}

async function check(env) {
  const res = await github(env, '/contents/data/sermon-archive.json?ref=main', {
    headers: { Accept: 'application/vnd.github.raw+json' }
  });
  if (!res.ok) throw new Error('არქივი ვერ წავიკითხე: HTTP ' + res.status + ' ' + (await res.text()).slice(0, 300));
  const archive = await res.json();

  const playlist = archive.playlists && archive.playlists[0];
  if (!playlist) throw new Error('არქივში დასაკრავი სიები არ წერია');
  const known = new Set(Object.values(archive.years || {}).flat().map(v => v.id));

  const found = await playlistVideoIds(env, playlist.id);
  if (found.error) return found.error;
  const fresh = found.ids.filter(id => !known.has(id));
  if (!fresh.length) return 'ახალი ქადაგება არ არის (' + found.source + ')';

  // შემოწმება ყოველ წუთს ხდება, არქივის აწყობას კი ~1 წუთი სჭირდება.
  // ახლახან გაშვებულ სამუშაოს მეორეს არ ვამატებთ — თორემ ყოველ წუთს
  // ახალი დაემატებოდა, სანამ პირველი არქივს ჩაწერდა.
  if (await dispatchedRecently(env, WORKFLOW, 10)) {
    return 'ახალი ვიდეო: ' + fresh.join(', ') + ' — workflow უკვე გაშვებულია, ველოდები';
  }
  await dispatch(env, WORKFLOW);
  return 'ახალი ვიდეო: ' + fresh.join(', ') + ' (' + found.source + ') — workflow გაშვებულია';
}

// სიის ვიდეოები. ძირითადი გზა — YouTube Data API: ახალ ვიდეოს მაშინვე
// აჩვენებს და ეკლესიის გასაღებით მუშაობს, ამიტომ არ გვბლოკავს.
// RSS ფიდი მხოლოდ სათადარიგოა: ის საათამდე აგვიანებს და Cloudflare-ის
// მისამართებს ხშირად 429-ით უარს ეუბნება.
async function playlistVideoIds(env, playlistId) {
  const key = (env.YOUTUBE_API_KEY || '').trim();
  if (key) {
    const api = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails,status' +
      '&maxResults=15&playlistId=' + encodeURIComponent(playlistId) + '&key=' + encodeURIComponent(key));
    if (api.ok) {
      const data = await api.json();
      // დამალული ან ჯერ არასაჯარო ვიდეო არქივში ვერ მოხვდება — მას არ ვითვლით.
      const ids = (data.items || [])
        .filter(item => item.status && item.status.privacyStatus === 'public')
        .map(item => item.contentDetails.videoId);
      return { ids, source: 'API' };
    }
    console.log('YouTube API: HTTP ' + api.status + ' ' + (await api.text()).slice(0, 200) + ' — RSS-ზე გადავდივარ');
  }

  const feed = await fetch('https://www.youtube.com/feeds/videos.xml?playlist_id=' + playlistId, {
    cf: { cacheTtl: 0 }
  });
  if (!feed.ok) return { error: 'ფიდი მიუწვდომელია: HTTP ' + feed.status };
  const xml = await feed.text();
  return { ids: [...xml.matchAll(/<yt:videoId>([^<]+)<\/yt:videoId>/g)].map(m => m[1]), source: 'RSS' };
}

// ბოლო `minutes` წუთში ხელით (ვორკერით) გაშვებული სამუშაო თუ არსებობს.
async function dispatchedRecently(env, workflow, minutes) {
  const res = await github(env, '/actions/workflows/' + workflow + '/runs?event=workflow_dispatch&per_page=1', {
    headers: { Accept: 'application/vnd.github+json' }
  });
  if (!res.ok) return false;
  const run = ((await res.json()).workflow_runs || [])[0];
  return Boolean(run && Date.now() - Date.parse(run.created_at) < minutes * 60 * 1000);
}

// რეგისტრაცია: Sanity-ში რომელი ღონისძიებაა ღია და რომელზე გავიდა უკვე
// შეტყობინება (data/registration-notified.json). თუ ერთმანეთს არ
// ემთხვევა — ახლად გახსნილი ან დახურული — ვუშვებთ registration-notify.yml-ს.
// რას აგზავნის და რას ინიშნავს, თავად ის წყვეტს.
const SANITY_QUERY = 'https://f9j6xr69.api.sanity.io/v2021-10-21/data/query/production?query=' +
  encodeURIComponent('*[_type == "registrationEvent" && !(_id in path("drafts.**")) && defined(eventId)]{eventId, status}');

async function checkRegistrations(env) {
  const res = await fetch(SANITY_QUERY);
  if (!res.ok) throw new Error('Sanity: HTTP ' + res.status);
  const events = (await res.json()).result || [];

  const file = await github(env, '/contents/data/registration-notified.json?ref=main', {
    headers: { Accept: 'application/vnd.github.raw+json' }
  });
  if (!file.ok) throw new Error('ჩანაწერი ვერ წავიკითხე: HTTP ' + file.status);
  const notified = await file.json();

  const changed = events.filter(e => (e.status === 'active') !== Boolean(notified[e.eventId]));
  if (!changed.length) return 'რეგისტრაცია: ცვლილება არ არის';

  if (await dispatchedRecently(env, 'registration-notify.yml', 4)) {
    return 'რეგისტრაცია: ' + changed.map(e => e.eventId).join(', ') + ' — workflow უკვე გაშვებულია, ველოდები';
  }
  await dispatch(env, 'registration-notify.yml');
  return 'რეგისტრაცია: ' + changed.map(e => e.eventId + ' → ' + e.status).join(', ') + ' — workflow გაშვებულია';
}

// ორი შემოწმება ერთმანეთისგან დამოუკიდებელია: YouTube-ის ჩავარდნამ
// რეგისტრაცია არ უნდა შეაჩეროს და პირიქით. ქადაგება ყოველ წუთს
// მოწმდება, რეგისტრაცია — ყოველ მე-5 წუთს (მას სისწრაფე არ სჭირდება).
async function checkAll(env, withRegistrations = true) {
  const checks = [check(env)];
  if (withRegistrations) checks.push(checkRegistrations(env));
  const results = await Promise.allSettled(checks);
  return results.map(r => r.status === 'fulfilled' ? r.value : 'შეცდომა: ' + r.reason.message).join('\n');
}

export default {
  async scheduled(event, env, ctx) {
    const reminder = REMINDERS[event.cron];
    if (reminder) {
      await dispatch(env, 'weekly-reminder.yml', { reminder });
      console.log('შეხსენება გაშვებულია: ' + reminder);
      return;
    }
    const minute = new Date(event.scheduledTime).getUTCMinutes();
    console.log(await checkAll(env, minute % 5 === 0));
  },

  // ხელით შემოწმება ბრაუზერიდან: ვორკერის მისამართი გახსენი და
  // ნახავ, რას ხედავს. ვერაფერს გააფუჭებს — იგივე შემოწმებაა.
  async fetch(request, env) {
    try {
      return new Response(await checkAll(env) + '\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    } catch (err) {
      return new Response('შეცდომა: ' + err.message + '\n', { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  }
};
