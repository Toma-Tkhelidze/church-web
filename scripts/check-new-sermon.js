#!/usr/bin/env node
/**
 * სწრაფი შემოწმება: მიმდინარე წლის დასაკრავ სიაში არის თუ არა
 * ქადაგება, რომელიც data/sermon-archive.json-ში ჯერ არ წერია.
 *
 * საიტი ახალ ქადაგებას rss2json-ის გავლით იგებს, ის კი YouTube-ის
 * ფიდს საათამდე ინახავს. სამუშაო ამ სკრიპტს ყოველ 10 წუთში უშვებს
 * და არქივს მხოლოდ მაშინ ადგენს თავიდან, როცა აქ რამე ახალი ჩანს —
 * ასე არხის გვერდებს ტყუილად არ ვკითხულობთ.
 *
 * ბეჭდავს: new=true ან new=false (GITHUB_OUTPUT-ისთვის).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ARCHIVE = path.join(__dirname, '..', 'data', 'sermon-archive.json');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode + ' — ' + url));
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', d => { body += d; });
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

async function main() {
  const archive = JSON.parse(fs.readFileSync(ARCHIVE, 'utf8'));
  const current = archive.playlists && archive.playlists[0];
  if (!current) throw new Error('არქივში დასაკრავი სიები არ წერია');

  const known = new Set(Object.values(archive.years || {}).flat().map(v => v.id));
  const xml = await get('https://www.youtube.com/feeds/videos.xml?playlist_id=' + current.id);
  const ids = [...xml.matchAll(/<yt:videoId>([^<]+)<\/yt:videoId>/g)].map(m => m[1]);
  const fresh = ids.filter(id => !known.has(id));

  if (fresh.length) console.error('ახალი ვიდეო ფიდში: ' + fresh.join(', '));
  console.log('new=' + (fresh.length > 0));
}

main().catch(err => {
  // ჩავარდნისას სრულ აგებას ვუშვებთ — სჯობს ზედმეტი შემოწმება, ვიდრე გამოტოვებული ქადაგება.
  console.error(err.message);
  console.log('new=true');
});
