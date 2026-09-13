/**
 * Service worker — ოფლაინ წვდომა და მთავარ ეკრანზე დაინსტალირება.
 *
 * მთავარი საფრთხე აქ ერთია: ქეშმა ძველი ფაილი შემოინახოს და ხალხს
 * განახლებული საიტი აღარ დაუბრუნდეს — შენ კი ვერ მიხვდე, რატომ.
 * ამიტომ HTML, CSS, JS და JSON ყოველთვის ჯერ ქსელიდან მოდის და
 * ქეში მხოლოდ მაშინ ერთვება, როცა ინტერნეტი არ არის.
 * ქეშიდან პირდაპირ მხოლოდ სურათები და შრიფტები იკითხება — ისინი
 * იშვიათად იცვლება და მათი სისწრაფე უფრო ღირს.
 *
 * გარე მისამართებს (Sanity, YouTube, Google Fonts, Brevo) საერთოდ არ
 * ვეხებით: მათ საკუთარი კეშირება აქვთ და ჩარევა მხოლოდ დააზიანებდა.
 */

// Push შეტყობინებები (OneSignal): ეს სკრიპტი ვორკერს push-ისა და
// შეტყობინებაზე დაჭერის დამუშავებას ამატებს. ქეშირებას ხელს არ უშლის —
// ქვემოთ fetch-ის ლოგიკა სხვა დომენებს ისედაც არ ეხება.
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

const VERSION = 'v3';
const SHELL_CACHE = 'efck-shell-' + VERSION;
const RUNTIME_CACHE = 'efck-runtime-' + VERSION;

// საიტი GitHub Pages-ის ქვესაქაღალდეშია და მოგვიანებით დომენის ძირში
// იქნება — ბაზას თავად ამ ფაილის მისამართიდან ვიღებთ.
const BASE = new URL('./', self.location).href;

const SHELL_FILES = [
  'index.html',
  'offline.html',
  'style.css',
  'analytics.js',
  'script.js',
  'sanity-fetch.js',
  'registration-modal.js',
  'bible.js',
  'pages/bible.html',
  'icons/icon-192.png',
  'pages/images/logo.svg'
].map(file => new URL(file, BASE).href);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // ერთი ფაილის ჩავარდნა მთელ ინსტალაციას არ უნდა შეაფერხოს.
      .then(cache => Promise.allSettled(SHELL_FILES.map(url => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names
          .filter(name => name.startsWith('efck-') && name !== SHELL_CACHE && name !== RUNTIME_CACHE)
          .map(name => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

// ჯერ ქსელი, ჩავარდნისას ქეში. წარმატებულ პასუხს ვინახავთ, რომ
// ოფლაინში იგივე გვერდი გაიხსნას.
function networkFirst(request, fallbackUrl) {
  return fetch(request)
    .then(response => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    })
    .catch(() => caches.match(request).then(cached => {
      if (cached) return cached;
      if (fallbackUrl) return caches.match(fallbackUrl);
      return Response.error();
    }));
}

// ჯერ ქეში, პარალელურად ფონურად ვანახლებთ — შემდეგი შემოსვლისთვის.
function cacheFirst(request) {
  return caches.match(request).then(cached => {
    const network = fetch(request)
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => cached || Response.error());
    return cached || network;
  });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // სხვა დომენი — ხელს არ ვახლებთ.
  if (url.origin !== self.location.origin) return;

  // გვერდიდან გვერდზე გადასვლა.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, new URL('offline.html', BASE).href));
    return;
  }

  // კოდი და მონაცემები — ყოველთვის ახალი, თუ ინტერნეტია.
  if (/\.(css|js|json)$/i.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // სურათები, შრიფტები და დანარჩენი.
  event.respondWith(cacheFirst(request));
});
