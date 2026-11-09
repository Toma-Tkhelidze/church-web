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
 * არქივს ასევე ვადგენთ, თუ ფიდში ვიდეოს აღწერაში მქადაგებელი წერია,
 * არქივში კი არ წერია ან სხვაა (აღწერა მოგვიანებით გაასწორეს).
 *
 * ბეჭდავს: new=true ან new=false (GITHUB_OUTPUT-ისთვის).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { parseFeed, preacherFrom, feedUrl } = require('./youtube-feed');

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

  const archived = {};
  Object.values(archive.years || {}).flat().forEach(v => { archived[v.id] = v; });
  const feed = parseFeed(await get(feedUrl(current.id)));
  const fresh = feed.filter(v => !archived[v.id]).map(v => v.id);

  // მქადაგებელი აღწერაში მოგვიანებით ჩაწერეს ან გაასწორეს — არქივიც
  // უნდა განახლდეს, თორემ საიტზე ძველი (ან არაფერი) დარჩებოდა.
  const preacher = feed.filter(v => archived[v.id] && v.description !== null &&
    preacherFrom(v.description) && preacherFrom(v.description) !== archived[v.id].preacher).map(v => v.id);

  if (fresh.length) console.error('ახალი ვიდეო ფიდში: ' + fresh.join(', '));
  if (preacher.length) console.error('მქადაგებელი შეიცვალა აღწერაში: ' + preacher.join(', '));
  console.log('new=' + (fresh.length > 0 || preacher.length > 0));
}

main().catch(err => {
  // ჩავარდნისას სრულ აგებას ვუშვებთ — სჯობს ზედმეტი შემოწმება, ვიდრე გამოტოვებული ქადაგება.
  console.error(err.message);
  console.log('new=true');
});
