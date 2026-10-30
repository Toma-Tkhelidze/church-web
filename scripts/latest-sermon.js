/**
 * ბოლო ქადაგება არქივიდან — საერთო ნაწილი ფოსტისა და push-ისთვის.
 *
 * ორივე შეტყობინება ერთსა და იმავე ქადაგებაზეა და ერთნაირად კითხულობს
 * data/sermon-archive.json-ს. ეს კოდი ერთ ადგილას რომ არ იყოს, ერთ
 * სკრიპტში შესწორება მეორეს გამორჩებოდა.
 */

const fs = require('fs');
const path = require('path');

const SITE_BASE = 'https://efckutaisi.ge/';
const ARCHIVE = path.join(__dirname, '..', 'data', 'sermon-archive.json');

function latestSermon() {
  const archive = JSON.parse(fs.readFileSync(ARCHIVE, 'utf8'));
  // playlists[0] მიმდინარე წელია, სიაში კი ახალი ქადაგება პირველია.
  const year = archive.playlists && archive.playlists[0] && archive.playlists[0].year;
  const list = year && archive.years ? archive.years[year] : null;
  if (!list || !list.length) return null;
  return list[0];
}

// სათაურები ასე იწერება: „ჩემი ეკლესია | 30 აგვისტო, 2026“.
// შეტყობინებაში სათაური და თარიღი ცალ-ცალკე გვინდა.
// „|“-ის შემდეგ ზოგჯერ მქადაგებელია და არა თარიღი — ასეთი კუდი თარიღად არ ითვლება.
const MONTH = /იანვარი|თებერვალი|მარტი|აპრილი|მაისი|ივნისი|ივლისი|აგვისტო|სექტემბერი|ოქტომბერი|ნოემბერი|დეკემბერი/;

function splitTitle(raw, isoDate) {
  const text = (raw || '').trim();
  const i = text.lastIndexOf('|');
  if (i > 0) {
    const title = text.slice(0, i).trim();
    const tail = text.slice(i + 1).trim();
    if (title && /\d/.test(tail) && MONTH.test(tail)) return { title, date: tail };
    if (title && tail) return { title, date: isoDate || '' };
  }
  return { title: text, date: isoDate || '' };
}

module.exports = { SITE_BASE, latestSermon, splitTitle };
