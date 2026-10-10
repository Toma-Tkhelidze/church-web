#!/usr/bin/env node
/**
 * ახალი ქადაგების შეტყობინება აპლიკაციაში (Web Push, OneSignal).
 *
 * არქივიდან იღებს ბოლო ქადაგებას და OneSignal-ის API-ით უგზავნის ყველას,
 * ვინც საიტზე შეტყობინებები ჩართო. ფოსტის ტყუპისცალია — იგივე
 * ტრიგერი, სხვა არხი.
 *
 * გაშვება:
 *   node scripts/send-sermon-push.js --dry-run   ყველაფერს აკეთებს, გარდა გაგზავნისა
 *   node scripts/send-sermon-push.js             გზავნის
 *
 * გაგზავნის ნაწილი (გასაღები, App ID) scripts/onesignal.js-შია.
 */

const { latestSermon, splitTitle } = require('./latest-sermon');
const { SITE_BASE, pushBody, sendPush } = require('./onesignal');

function buildMessage(sermon) {
  const parts = splitTitle(sermon.title, sermon.date);
  return {
    parts,
    body: pushBody({
      heading: 'ახალი ქადაგება',
      text: parts.title + (parts.date ? ' · ' + parts.date : ''),
      url: SITE_BASE + 'pages/sermons.html',
      // ერთი თემა: თუ წინა კვირის შეტყობინება ჯერ არ წაუკითხავთ,
      // ახალი მას ჩაანაცვლებს და ორი არ დაგროვდება.
      topic: 'sermon'
    })
  };
}

// ── გაშვება ───────────────────────────────────────────────────────
(async function main() {
  const args = process.argv.slice(2);
  const sermon = latestSermon();

  if (!sermon) {
    console.error('არქივში ქადაგება ვერ ვიპოვე — არაფერი გაიგზავნა.');
    process.exitCode = 1;
    return;
  }

  const message = buildMessage(sermon);
  console.log('ქადაგება: ' + message.parts.title);
  console.log('თარიღი:   ' + message.parts.date);
  console.log('ტექსტი:   ' + message.body.headings.en + ' — ' + message.body.contents.en);
  console.log('ბმული:    ' + message.body.url);

  if (args.includes('--dry-run')) {
    console.log('\nსატესტო რეჟიმი — შეტყობინება არ გაგზავნილა.');
    return;
  }

  try {
    const data = await sendPush(message.body);
    console.log('\nგაიგზავნა. შეტყობინების ID: ' + data.id);
  } catch (err) {
    console.error('\nგაგზავნა ვერ მოხერხდა: ' + err.message);
    process.exitCode = 1;
  }
})();
