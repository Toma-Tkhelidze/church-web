#!/usr/bin/env node
/**
 * რეგისტრაციის გახსნის შეტყობინება: push (OneSignal) და ელფოსტა (Brevo).
 *
 * Sanity-ში ღონისძიების სტატუსი „ღიაა“ რომ გახდება, Cloudflare-ის ვორკერი
 * ამას ამჩნევს და GitHub-ის სამუშაოს „რეგისტრაციის შეტყობინება“ უშვებს.
 * სამუშაო ამ სკრიპტს ორჯერ იძახებს:
 *
 *   --claim       Sanity-ს ადარებს data/registration-notified.json-ს,
 *                 ფაილს ანახლებს და ბეჭდავს იმ ღონისძიებებს, რომლებზეც
 *                 შეტყობინება უნდა გავიდეს. სამუშაო ფაილს ჯერ ფუშავს —
 *                 ასე ორი პარალელური გაშვება ერთსა და იმავეს ვერ გააგზავნის.
 *   --send ID…    ამ ღონისძიებებზე აგზავნის push-ს და წერილს.
 *   --dry-run     (--send-თან ერთად) ბეჭდავს, არ გზავნის.
 *
 * „დასრულდა“-ზე დაბრუნებისას ღონისძიება ფაილიდან იშლება, რომ შემდეგ
 * გახსნაზე (მაგ. მომავალ წელს) შეტყობინება ისევ წავიდეს.
 */

const fs = require('fs');
const path = require('path');
const { SITE_BASE, pushBody, sendPush } = require('./onesignal');
const { escapeHtml, fillTemplate, sendCampaign } = require('./brevo');

const FILE = path.join(__dirname, '..', 'data', 'registration-notified.json');
const TEMPLATE = path.join(__dirname, 'registration-email.html');
// api და არა apicdn: CDN-ის ქეში ახლახან გამოქვეყნებულ ცვლილებას დამალავდა.
const SANITY = 'https://f9j6xr69.api.sanity.io/v2021-10-21/data/query/production?query=';
const QUERY = '*[_type == "registrationEvent" && !(_id in path("drafts.**")) && defined(eventId)]' +
  '{eventId, title, status, dateText, detailsText, description, "imageUrl": imageUrl.asset->url}';

async function events() {
  const res = await fetch(SANITY + encodeURIComponent(QUERY));
  if (!res.ok) throw new Error('Sanity: HTTP ' + res.status);
  return (await res.json()).result || [];
}

function readNotified() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return {}; }
}

function link(evt) {
  return SITE_BASE + 'pages/registration.html#' + encodeURIComponent(evt.eventId);
}

function image(evt, width) {
  return evt.imageUrl ? evt.imageUrl + '?w=' + width + '&fm=jpg&q=80' : '';
}

async function claim() {
  const notified = readNotified();
  const opened = [];
  for (const evt of await events()) {
    if (evt.status === 'active' && !notified[evt.eventId]) {
      notified[evt.eventId] = { title: evt.title, at: new Date().toISOString() };
      opened.push(evt.eventId);
    } else if (evt.status !== 'active' && notified[evt.eventId]) {
      delete notified[evt.eventId];
      console.error('დაიხურა: ' + evt.eventId + ' — შემდეგ გახსნაზე ისევ გაიგზავნება.');
    }
  }
  fs.writeFileSync(FILE, JSON.stringify(notified, null, 2) + '\n');
  if (opened.length) console.error('გაიხსნა: ' + opened.join(', '));
  process.stdout.write(opened.join(' '));
}

function buildPush(evt) {
  const facts = [evt.dateText, evt.detailsText].filter(Boolean).join(' · ');
  return pushBody({
    heading: 'რეგისტრაცია გაიხსნა: ' + evt.title,
    text: (facts ? facts + '. ' : '') + 'დარეგისტრირდი!',
    url: link(evt),
    topic: 'registration-' + evt.eventId,
    image: image(evt, 1024)
  });
}

function buildMail(evt) {
  const img = image(evt, 1120);
  const values = {
    TITLE: escapeHtml(evt.title),
    DATE: escapeHtml(evt.dateText),
    DETAILS: escapeHtml(evt.detailsText),
    DESCRIPTION: escapeHtml(evt.description).replace(/\n/g, '<br>'),
    LINK: link(evt),
    IMAGE_ROW: img
      ? '<tr><td align="center" style="padding:0;"><a href="' + link(evt) + '" style="display:block;text-decoration:none;">' +
        '<img src="' + img + '" alt="" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;"></a></td></tr>'
      : '',
    YEAR: String(new Date().getFullYear())
  };
  return {
    name: 'რეგისტრაცია — ' + evt.title,
    subject: 'რეგისტრაცია გაიხსნა: ' + evt.title,
    html: fillTemplate(fs.readFileSync(TEMPLATE, 'utf8'), values)
  };
}

async function send(ids, dryRun) {
  const all = await events();
  for (const id of ids) {
    const evt = all.find(e => e.eventId === id);
    if (!evt || evt.status !== 'active') {
      console.log(id + ': აღარ არის ღია — გამოტოვებულია.');
      continue;
    }
    const push = buildPush(evt);
    const mail = buildMail(evt);
    console.log('\n' + id);
    console.log('  push:    ' + push.headings.en + ' — ' + push.contents.en);
    console.log('  ბმული:   ' + push.url);
    console.log('  სურათი:  ' + (push.chrome_web_image || '—'));
    console.log('  წერილი:  ' + mail.subject + ' (' + mail.html.length + ' სიმბოლო)');
    if (dryRun) {
      console.log('  სატესტო რეჟიმი — არაფერი გაგზავნილა.');
      continue;
    }
    // ერთი არხის ჩავარდნამ მეორე არ უნდა შეაჩეროს.
    try {
      console.log('  push გაიგზავნა: ' + (await sendPush(push)).id);
    } catch (err) {
      console.error('  push ვერ გაიგზავნა: ' + err.message);
      process.exitCode = 1;
    }
    try {
      console.log('  წერილი გაიგზავნა, კამპანია ' + await sendCampaign(mail));
    } catch (err) {
      console.error('  წერილი ვერ გაიგზავნა: ' + err.message);
      process.exitCode = 1;
    }
  }
}

(async function main() {
  const args = process.argv.slice(2);
  try {
    if (args.includes('--claim')) return await claim();
    const i = args.indexOf('--send');
    if (i !== -1) {
      const ids = args.slice(i + 1).filter(a => !a.startsWith('--'));
      return await send(ids, args.includes('--dry-run'));
    }
    console.error('გამოყენება: --claim | --send ID… [--dry-run]');
    process.exitCode = 1;
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
})();
