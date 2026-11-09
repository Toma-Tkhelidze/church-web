/**
 * YouTube-ის დასაკრავი სიის RSS ფიდი (videos.xml?playlist_id=…).
 *
 * ფიდი სიის ბოლო 15 ვიდეოს აბრუნებს, თითოეულს სრული აღწერით. ვიდეოს
 * გვერდი (watch?v=) GitHub-ის სერვერებიდან ხშირად არ იხსნება — YouTube
 * მათ ბოტად თვლის და აღწერას არ აჩვენებს. ამის გამო 2026 წლის ნოემბრის
 * ქადაგებებს საიტზე მქადაგებელი არ ეწერა. ფიდი კი იქიდანაც იკითხება,
 * ამიტომ აღწერას (და მქადაგებელს) პირველ რიგში აქედან ვიღებთ.
 */

function decodeXml(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// [{ id, title, published (ms), description }] — description null, თუ ფიდში არ ჩანს.
function parseFeed(xml) {
  return [...String(xml || '').matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => {
    const e = m[1];
    const desc = /<media:description>([\s\S]*?)<\/media:description>/.exec(e);
    return {
      id: (/<yt:videoId>([^<]+)</.exec(e) || [])[1] || null,
      title: decodeXml((/<title>([^<]*)</.exec(e) || [])[1] || ''),
      published: Date.parse((/<published>([^<]+)</.exec(e) || [])[1]),
      description: desc ? decodeXml(desc[1]) : (/<media:description\s*\/>/.test(e) ? '' : null)
    };
  }).filter(v => v.id);
}

// აღწერაში ასე წერია: „მქადაგებელი - ოლეგ ხუბაშვილი“. '' — ასეთი სტრიქონი არ არის.
function preacherFrom(description) {
  const m = /მქადაგებელი\s*[-–—:]\s*([^\n]+)/.exec(description || '');
  return m ? m[1].trim().replace(/[.,;]+$/, '') : '';
}

function feedUrl(playlistId) {
  return 'https://www.youtube.com/feeds/videos.xml?playlist_id=' + playlistId;
}

module.exports = { parseFeed, preacherFrom, feedUrl, decodeXml };
