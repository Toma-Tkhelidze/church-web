#!/usr/bin/env node
/**
 * ახალი ქადაგების შეტყობინება ელფოსტით.
 *
 * არქივიდან იღებს ბოლო ქადაგებას, ავსებს sermon-email.html-ს და
 * Brevo-ს API-ით უგზავნის სიას „ეკლესიის სიახლეები“.
 *
 * გაშვება:
 *   node scripts/send-sermon-email.js --print-latest   ბოლო ქადაგების ID
 *   node scripts/send-sermon-email.js --dry-run        ყველაფერს აკეთებს, გარდა გაგზავნისა
 *   node scripts/send-sermon-email.js                  გზავნის
 *
 * გაგზავნის ნაწილი (გასაღები, სია, გამომგზავნი) scripts/brevo.js-შია.
 */

const fs = require('fs');
const path = require('path');

// ── კონფიგურაცია ──────────────────────────────────────────────────
const { SITE_BASE, latestSermon, splitTitle } = require('./latest-sermon');
const { escapeHtml, fillTemplate, sendCampaign } = require('./brevo');

const TEMPLATE = path.join(__dirname, 'sermon-email.html');

// HD ყდა (maxresdefault) ყველა ვიდეოს არ აქვს — მაშინ YouTube 404-ს
// აბრუნებს. წერილში ცარიელი ან ნაცრისფერი სურათი არ უნდა წავიდეს, ამიტომ
// წინასწარ ვამოწმებთ და საჭიროებისას hqdefault-ს ვიღებთ, რომელიც
// ყოველთვის არსებობს.
async function thumbnailUrl(videoId) {
  const base = 'https://img.youtube.com/vi/' + encodeURIComponent(videoId) + '/';
  try {
    const res = await fetch(base + 'maxresdefault.jpg', { method: 'HEAD' });
    if (res.ok) return base + 'maxresdefault.jpg';
  } catch (e) { /* ქსელი — სარეზერვოზე გადავდივართ */ }
  return base + 'hqdefault.jpg';
}

async function buildHtml(sermon) {
  const parts = splitTitle(sermon.title, sermon.date);
  const values = {
    TITLE: escapeHtml(parts.title),
    DATE: escapeHtml(parts.date),
    THUMB: await thumbnailUrl(sermon.id),
    LINK: SITE_BASE + 'pages/sermons.html',
    YEAR: String(new Date().getFullYear())
  };
  const html = fillTemplate(fs.readFileSync(TEMPLATE, 'utf8'), values);
  return { html: html, subject: 'ახალი ქადაგება: ' + parts.title, parts: parts, thumb: values.THUMB };
}

async function send(mail) {
  return sendCampaign({
    name: 'ახალი ქადაგება — ' + mail.parts.title,
    subject: mail.subject,
    html: mail.html
  });
}

// ── გაშვება ───────────────────────────────────────────────────────
(async function main() {
  const args = process.argv.slice(2);
  const sermon = latestSermon();

  if (args.includes('--print-latest')) {
    process.stdout.write(sermon ? sermon.id : '');
    return;
  }

  if (!sermon) {
    console.error('არქივში ქადაგება ვერ ვიპოვე — არაფერი გაიგზავნა.');
    process.exitCode = 1;
    return;
  }

  const mail = await buildHtml(sermon);
  console.log('ქადაგება: ' + mail.parts.title);
  console.log('სურათი:   ' + mail.thumb);
  console.log('თარიღი:   ' + mail.parts.date);
  console.log('სათაური:  ' + mail.subject);
  console.log('სიგრძე:   ' + mail.html.length + ' სიმბოლო');

  if (args.includes('--dry-run')) {
    console.log('\nსატესტო რეჟიმი — წერილი არ გაგზავნილა.');
    return;
  }

  try {
    const id = await send(mail);
    console.log('\nგაიგზავნა. კამპანიის ნომერი: ' + id);
  } catch (err) {
    console.error('\nგაგზავნა ვერ მოხერხდა: ' + err.message);
    process.exitCode = 1;
  }
})();
