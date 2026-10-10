#!/usr/bin/env node
/**
 * ყოველკვირეული შეხსენება აპლიკაციაში (Web Push, OneSignal).
 *
 * ტექსტები data/weekly-reminders.json-შია. დროს Cloudflare-ის ვორკერი
 * წყვეტს (workers/sermon-watch) — ის ზუსტ წუთზე უშვებს GitHub-ის
 * სამუშაოს „ყოველკვირეული შეხსენება“, ეს სამუშაო კი ამ სკრიპტს.
 *
 * გაშვება:
 *   node scripts/send-weekly-reminder.js sunday --dry-run   ბეჭდავს, არ გზავნის
 *   node scripts/send-weekly-reminder.js sunday             გზავნის
 *
 * გასაღებები: sunday, youth, family-groups.
 */

const fs = require('fs');
const path = require('path');
const { SITE_BASE, pushBody, sendPush } = require('./onesignal');

const FILE = path.join(__dirname, '..', 'data', 'weekly-reminders.json');

(async function main() {
  const args = process.argv.slice(2);
  const key = args.find(a => !a.startsWith('--'));
  const all = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const reminder = key && !key.startsWith('_') ? all[key] : null;

  if (!reminder) {
    console.error('უცნობი შეხსენება: „' + (key || '') + '“. არსებული: ' +
      Object.keys(all).filter(k => !k.startsWith('_')).join(', '));
    process.exitCode = 1;
    return;
  }

  const body = pushBody({
    heading: reminder.title,
    text: reminder.text,
    url: SITE_BASE + reminder.page,
    // წინა კვირის წაუკითხავ შეხსენებას ახალი ჩაანაცვლებს.
    topic: 'weekly-' + key
  });

  console.log('შეხსენება: ' + key + ' — ' + reminder.when);
  console.log('სათაური:   ' + body.headings.en);
  console.log('ტექსტი:    ' + body.contents.en);
  console.log('ბმული:     ' + body.url);

  if (reminder.enabled === false) {
    console.log('\nეს შეხსენება გამორთულია (enabled: false) — არაფერი გაიგზავნა.');
    return;
  }

  if (args.includes('--dry-run')) {
    console.log('\nსატესტო რეჟიმი — შეტყობინება არ გაგზავნილა.');
    return;
  }

  try {
    const data = await sendPush(body);
    console.log('\nგაიგზავნა. შეტყობინების ID: ' + data.id);
  } catch (err) {
    console.error('\nგაგზავნა ვერ მოხერხდა: ' + err.message);
    process.exitCode = 1;
  }
})();
