/**
 * OneSignal-ის საერთო ნაწილი — ყველა push-შეტყობინებისთვის.
 *
 * ქადაგების, ყოველკვირეული შეხსენების და სხვა სკრიპტები ერთნაირად
 * აგზავნიან. ეს კოდი ერთ ადგილას რომ არ იყოს, ერთში შესწორება
 * მეორეს გამორჩებოდა.
 *
 * გასაღები ONESIGNAL_REST_API_KEY გარემოს ცვლადიდან მოდის — კოდში
 * არასდროს წერია. App ID საჯაროა (საიტის კოდშიც ისაა).
 */

const APP_ID = process.env.ONESIGNAL_APP_ID || 'b657bdbe-ade7-4269-b8d0-63fcf7c4f698';
const API = 'https://api.onesignal.com/notifications';
const SITE_BASE = 'https://efckutaisi.ge/';

// heading, text და url — დანარჩენი ყველა შეტყობინებისთვის ერთია.
// topic: ერთი თემის ახალი შეტყობინება წინა წაუკითხავს ჩაანაცვლებს.
function pushBody({ heading, text, url, topic }) {
  return {
    app_id: APP_ID,
    target_channel: 'push',
    // OneSignal-ის ნაგულისხმევი სეგმენტი — ყველა, ვინც ჩართო.
    included_segments: ['Total Subscriptions'],
    // OneSignal ენების ლექსიკონს ითხოვს და „en“ სავალდებულოა;
    // ტექსტი მაინც ქართულია — გასაღები მხოლოდ ფორმალობაა.
    headings: { en: heading },
    contents: { en: text },
    url: url,
    chrome_web_icon: SITE_BASE + 'icons/icon-192.png',
    web_push_topic: topic
  };
}

async function sendPush(body) {
  if (!process.env.ONESIGNAL_REST_API_KEY) {
    throw new Error('ONESIGNAL_REST_API_KEY ცარიელია — გაგზავნა შეუძლებელია.');
  }
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Key ' + process.env.ONESIGNAL_REST_API_KEY
    },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data.errors && data.errors.length)) {
    throw new Error('OneSignal ' + res.status + ': ' + JSON.stringify(data.errors || data));
  }
  return data;
}

module.exports = { SITE_BASE, pushBody, sendPush };
