#!/usr/bin/env node
/**
 * ქადაგების მოდარაჯის (workers/sermon-watch) ყოველდღიური შემოწმება.
 *
 * ახალ ქადაგებას საიტზე Cloudflare Worker აჩენს: ყოველ წუთს YouTube-ს
 * ამოწმებს და GitHub-ის ტოკენით უშვებს არქივის განახლებას. 2026-11-08-ს
 * ტოკენს ვადა გაუვიდა — ვორკერი ჩუმად ვარდებოდა და ქადაგება საიტზე არ
 * ჩანდა. ეს სკრიპტი ამის ხელახლა მოხდენას აფრთხილებს:
 *   1. ვორკერის ტოკენი მუშაობს (…workers.dev/health);
 *   2. ტოკენის ვადის გასვლამდე 14 დღეზე მეტია;
 *   3. YouTube-ის სიაში არ არის ქადაგება, რომელიც საათზე მეტია გამოჩნდა
 *      და არქივში მაინც არ ჩაწერილა (ვორკერი საერთოდ თუ გაჩერდა);
 *   4. ბოლო ქადაგებას საიტზე მქადაგებელი უწერია.
 *
 * შეცდომისას სამუშაო ვარდება და GitHub ელფოსტას აგზავნის.
 * ტოკენის განახლება: workers/sermon-watch/README.md.
 * გაშვება:  node scripts/check-sermon-watch.js
 */

const fs = require('fs');
const path = require('path');
const { parseFeed, preacherFrom, feedUrl } = require('./youtube-feed');

const HEALTH = 'https://efck-sermon-watch.sermon-watch.workers.dev/health';
const ARCHIVE = path.join(__dirname, '..', 'data', 'sermon-archive.json');
const WARN_DAYS = 14;
const LATE_MINUTES = 60;

async function checkToken(errors, notes) {
  let health;
  try {
    const res = await fetch(HEALTH, { headers: { 'User-Agent': 'efckutaisi.ge sermon-watch check' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    health = await res.json();
  } catch (err) {
    errors.push('ვორკერი არ პასუხობს (' + err.message + ') — Cloudflare → Workers → efck-sermon-watch');
    return;
  }

  const gh = health.github || {};
  if (!gh.ok) {
    errors.push('ვორკერის GitHub-ტოკენი არ მუშაობს (' + (gh.error || 'HTTP ' + gh.status) + ') — ' +
      'ახალი ქადაგება საიტზე თავისით აღარ გამოჩნდება. ტოკენი განაახლე: workers/sermon-watch/README.md');
    return;
  }
  if (gh.daysLeft === null || gh.daysLeft === undefined) {
    notes.push('ვორკერის ტოკენი მუშაობს, ვადა არ აქვს.');
  } else if (gh.daysLeft < WARN_DAYS) {
    errors.push('ვორკერის GitHub-ტოკენს ვადა ' + gh.daysLeft + ' დღეში გასდის (' + gh.expiresAt.slice(0, 10) + '). ' +
      'მანამდე განაახლე, თორემ ქადაგება საიტზე თავისით აღარ გამოჩნდება: workers/sermon-watch/README.md');
  } else {
    notes.push('ვორკერის ტოკენი მუშაობს, ვადა: ' + gh.expiresAt.slice(0, 10) + ' (' + gh.daysLeft + ' დღე).');
  }
}

// YouTube-ის სიის ფიდი ხანდახან 404-ს აბრუნებს — მაშინ მხოლოდ შენიშვნაა.
async function checkMissed(errors, notes) {
  const archive = JSON.parse(fs.readFileSync(ARCHIVE, 'utf8'));
  const playlist = archive.playlists && archive.playlists[0];
  if (!playlist) { errors.push('არქივში დასაკრავი სიები არ წერია'); return; }
  const known = new Set(Object.values(archive.years || {}).flat().map(v => v.id));

  let feed;
  try {
    const res = await fetch(feedUrl(playlist.id));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    feed = parseFeed(await res.text());
  } catch (err) {
    notes.push('YouTube-ის ფიდი ვერ წავიკითხე (' + err.message + ') — გამოტოვებული ქადაგება და მქადაგებელი ვერ შემოწმდა.');
    return;
  }

  checkLatestPreacher(archive, feed, errors, notes);

  const late = feed.filter(v => !known.has(v.id) && Date.now() - v.published > LATE_MINUTES * 60000);

  if (late.length) {
    errors.push('YouTube-ზე საათზე მეტია ჩანს, საიტზე კი არა: ' + late.map(v => '„' + v.title + '“ (' + v.id + ')').join(', ') +
      ' — ვორკერმა ვერ დაინახა. Actions → ქადაგებების არქივის განახლება → Run workflow, მერე ვორკერის ჟურნალი.');
  } else {
    notes.push('YouTube-ის სიის ყველა ქადაგება არქივშია.');
  }
}

// საიტზე ქადაგების ბარათს მქადაგებელი არქივიდან ეწერება, არქივს კი ის
// YouTube-ის აღწერიდან („მქადაგებელი - სახელი გვარი“) ხვდება.
function checkLatestPreacher(archive, feed, errors, notes) {
  const year = archive.playlists[0].year;
  const latest = ((archive.years || {})[year] || [])[0];
  if (!latest) return;
  if (latest.preacher) {
    notes.push('ბოლო ქადაგების მქადაგებელი: ' + latest.preacher + '.');
    return;
  }
  const inFeed = feed.find(v => v.id === latest.id);
  const onYouTube = inFeed && preacherFrom(inFeed.description);
  errors.push('ბოლო ქადაგებას („' + latest.title + '“) საიტზე მქადაგებელი არ უწერია. ' + (onYouTube
    ? 'YouTube-ის აღწერაში წერია („' + onYouTube + '“), არქივში კი ვერ მოხვდა — Actions → ქადაგებების არქივის განახლება → Run workflow.'
    : 'YouTube-ზე ვიდეოს აღწერაში დაამატე სტრიქონი „მქადაგებელი - სახელი გვარი“ — საიტი რამდენიმე საათში თავად განახლდება.'));
}

(async () => {
  const errors = [];
  const notes = [];
  await checkToken(errors, notes);
  await checkMissed(errors, notes);

  const lines = notes.map(n => 'ℹ️ ' + n).concat(errors.map(e => '❌ ' + e));
  if (!errors.length) lines.push('✅ ქადაგების მოდარაჯე მუშაობს.');
  console.log(lines.join('\n'));

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## ქადაგების მოდარაჯე\n\n' + lines.map(l => '- ' + l).join('\n') + '\n');
  }
  if (errors.length) process.exitCode = 1;
})();
