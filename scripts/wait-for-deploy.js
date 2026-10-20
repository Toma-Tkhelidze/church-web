#!/usr/bin/env node
/**
 * ელოდება, სანამ ახალი არქივი საიტზე მართლა გამოჩნდება.
 *
 * git push-ის შემდეგ GitHub Pages ფაილს ერთ-ორ წუთში აქვეყნებს. თუ
 * შეტყობინება მანამდე გავიდა, მასზე დაჭერილი ადამიანი ძველ სიას
 * ნახულობდა. ამიტომ ფოსტა და push მხოლოდ ამ სკრიპტის შემდეგ იგზავნება.
 *
 * შეტყობინების ბმულიდან გახსნილი გვერდი არქივს ?v=<ქადაგების ID>-ით
 * ითხოვს. ეს მისამართი აქამდე არავის უთხოვია, ამიტომ CDN-ს მისი ძველი
 * ასლი არ აქვს — საკმარისია, საიტზე ფაილი განახლდეს. ვადის ამოწურვისას მაინც გადის (exit 0): დაგვიანებული შეტყობინება
 * სჯობს გაუგზავნელს.
 */

const { SITE_BASE, latestSermon } = require('./latest-sermon');

const TIMEOUT = 8 * 60 * 1000;
const STEP = 15 * 1000;

(async function main() {
  const sermon = latestSermon();
  if (!sermon) return;

  const url = SITE_BASE + 'data/sermon-archive.json?v=' + encodeURIComponent(sermon.id);
  const started = Date.now();

  while (Date.now() - started < TIMEOUT) {
    try {
      const res = await fetch(url + '&t=' + Date.now(), { cache: 'no-store' });
      if (res.ok && (await res.text()).includes('"' + sermon.id + '"')) {
        console.log('საიტზე გამოჩნდა ' + Math.round((Date.now() - started) / 1000) + ' წამში.');
        return;
      }
    } catch (e) { /* ქსელის ხარვეზი — ვცდით ისევ */ }
    await new Promise(r => setTimeout(r, STEP));
  }
  console.warn('საიტი 8 წუთში არ განახლდა — შეტყობინება მაინც იგზავნება.');
})();
