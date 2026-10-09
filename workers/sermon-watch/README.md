# ახალი ქადაგების მოდარაჯე (Cloudflare Worker)

ყოველ 5 წუთში ამოწმებს, გამოჩნდა თუ არა YouTube-ის 2026 წლის სიაში
ქადაგება, რომელიც `data/sermon-archive.json`-ში ჯერ არ წერია. თუ
გამოჩნდა, უშვებს GitHub-ის workflow-ს „ქადაგებების არქივის განახლება“,
რომელიც არქივს ანახლებს და ელფოსტასა და push-შეტყობინებას აგზავნის.

რატომ: GitHub-ის საკუთარ 10-წუთიან განრიგს ის რეალურად 4–7 საათში
ერთხელ უშვებს. ის ახლა სათადარიგოდ რჩება.

## პირველი აწყობა

1. **Cloudflare ანგარიში** — dash.cloudflare.com, უფასო გეგმა,
   სასურველია `info@efckutaisi.ge`-ზე.
2. **GitHub ტოკენი** — github.com → Settings → Developer settings →
   Fine-grained tokens → Generate new token:
   - Repository access: *Only select repositories* → `church-web`
   - Permissions: **Actions — Read and write**, **Contents — Read-only**
   - Expiration: მაქსიმუმი 1 წელია — ვადის გასვლამდე განაახლე!
3. ამ საქაღალდიდან:

   ```bash
   npx wrangler login
   npx wrangler deploy
   npx wrangler secret put GITHUB_TOKEN
   ```

   ბოლო ბრძანება ტოკენს გთხოვს — ჩასვი და Enter.

## შემოწმება

- `npx wrangler deploy` ვორკერის მისამართს დაბეჭდავს
  (`https://efck-sermon-watch.<ანგარიში>.workers.dev`). გახსენი ბრაუზერში —
  უნდა ეწეროს „ახალი ქადაგება არ არის“. „შეცდომა: … 401“ ნიშნავს,
  რომ ტოკენი არასწორია ან ვადა გაუვიდა.
- ჟურნალი: Cloudflare → Workers → efck-sermon-watch → Logs.

## ცვლილების შემდეგ

`worker.js`-ის შეცვლის მერე ხელახლა `npx wrangler deploy`. GitHub-ზე
ფუშვა ვორკერს თავისით არ ანახლებს.
