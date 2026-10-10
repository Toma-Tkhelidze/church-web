/**
 * Brevo-ს საერთო ნაწილი — ყველა წერილისთვის, რომელიც სიას ეგზავნება.
 *
 * ქადაგების და რეგისტრაციის წერილები ერთნაირად იგზავნება. ეს კოდი ერთ
 * ადგილას რომ არ იყოს, ერთში შესწორება მეორეს გამორჩებოდა.
 *
 * გასაღები BREVO_API_KEY გარემოს ცვლადიდან მოდის — კოდში არასდროს წერია.
 */

const API = 'https://api.brevo.com/v3';
const LIST_ID = 3;                       // „ეკლესიის სიახლეები“
// გამომგზავნი Brevo-ში ავთენტიფიცირებული დომენიდანაა — სხვა მისამართს
// Brevo @brevosend.com-ით ჩაანაცვლებდა.
const SENDER = { name: 'სახარების რწმენის ეკლესია', email: 'info@efckutaisi.ge' };

// HTML-ში ჩასმამდე ტექსტი უნდა გაიწმინდოს — „&“ ან „<“ შაბლონს არ უნდა შლიდეს.
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// შაბლონში {{KEY}}-ებს ავსებს. მნიშვნელობები უკვე გაწმენდილი უნდა იყოს.
function fillTemplate(html, values) {
  Object.keys(values).forEach(key => {
    html = html.split('{{' + key + '}}').join(values[key]);
  });
  return html;
}

async function brevo(method, endpoint, body) {
  const res = await fetch(API + endpoint, {
    method: method,
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok) throw new Error(method + ' ' + endpoint + ' → ' + res.status + ' ' + text);
  return text ? JSON.parse(text) : {};
}

// კამპანია და არა transactional: სიაზე გაგზავნისას Brevo თავად
// ამატებს გამოწერის გაუქმების ბმულს და პატივს სცემს უარის თქმას.
async function sendCampaign({ name, subject, html }) {
  if (!process.env.BREVO_API_KEY) {
    throw new Error('BREVO_API_KEY ცარიელია — გაგზავნა შეუძლებელია.');
  }
  const campaign = await brevo('POST', '/emailCampaigns', {
    name: name + ' (' + new Date().toISOString().slice(0, 10) + ')',
    subject: subject,
    sender: SENDER,
    type: 'classic',
    htmlContent: html,
    recipients: { listIds: [LIST_ID] }
  });
  await brevo('POST', '/emailCampaigns/' + campaign.id + '/sendNow');
  return campaign.id;
}

module.exports = { escapeHtml, fillTemplate, sendCampaign };
