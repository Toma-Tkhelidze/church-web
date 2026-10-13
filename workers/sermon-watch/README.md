# ახალი ქადაგების მოდარაჯე (Cloudflare Worker)

ყოველ წუთს ამოწმებს, გამოჩნდა თუ არა YouTube-ის 2026 წლის სიაში
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

## YouTube API გასაღები

`YOUTUBE_API_KEY` — Google Cloud-ის გასაღები, შეზღუდული მხოლოდ
YouTube Data API v3-ზე. მის გარეშე ვორკერი RSS ფიდს კითხულობს, რომელიც
საათამდე აგვიანებს და Cloudflare-ს ხშირად 429-ით ბლოკავს.
უფასო ლიმიტი 10 000 ერთეულია დღეში; ვორკერი ~1 440-ს ხარჯავს.
ბრაუზერში ვორკერის მისამართზე „(API)“ ჩანს, თუ გასაღები მუშაობს.

## ცვლილების შემდეგ

`worker.js`-ის შეცვლის მერე ხელახლა `npx wrangler deploy`. GitHub-ზე
ფუშვა ვორკერს თავისით არ ანახლებს.
