// საოჯახო ჯგუფების ბარათების რუკები OpenStreetMap-ის მონაცემებიდან.
// თითო ჯგუფისთვის ხატავს ქალაქის ხედს (ქუჩები, შენობები, რიონი, პარკები)
// ჯგუფის უბანზე ცენტრირებულს; ახლოს მყოფი სხვა ჯგუფები პატარა წრეებად
// ჩანს. ათასობით შენობით SVG მძიმეა, ამიტომ საბოლოო ფაილი WebP-ია:
// pages/images/family-groups/<file>.webp (2x, რეტინა ეკრანებისთვის).
// WebP-ისთვის sharp უნდა: npm i sharp (ან %TEMP%/imgtool-ში დაყენებული).
//
// ქინძისთავი უბნის ან ქუჩის შუაა და არა სახლი, სადაც ჯგუფი იკრიბება —
// შეხვედრის ზუსტი მისამართი საიტზე განზრახ არ ჩანს.
//
// გაშვება: node scripts/build-group-maps.js
// ახალი ჯგუფი: დაამატე GROUPS-ში და family-groups.html-ის GROUP_MAPS-ში.
// გადმოწერილი მონაცემები scratch/osm-cache/-ში ინახება და ხელახლა
// მხოლოდ მაშინ მოდის, როცა ჯგუფების დაფარვის არე იცვლება.
//
// მონაცემები © OpenStreetMap-ის მონაწილეები, ODbL — ატრიბუცია გვერდზეა.

const fs = require('fs');
const os = require('os');
const path = require('path');

let sharp;
try {
  sharp = require('sharp');
} catch {
  sharp = require(path.join(os.tmpdir(), 'imgtool', 'node_modules', 'sharp'));
}

const GROUPS = [
  { file: 'vakisubani', lat: 42.23500, lon: 42.67300 },    // რევაზ თაბუკაშვილის ქუჩა
  { file: 'nikea', lat: 42.23383, lon: 42.69156 },         // ნიკეას ქუჩა
  { file: 'kakhianouri', lat: 42.24300, lon: 42.71300 },   // ახალგაზრდობის გამზირი
  { file: 'agmashenebeli', lat: 42.26159, lon: 42.69537 }, // დავით აღმაშენებლის გამზირი
  { file: 'tsereteli', lat: 42.25992, lon: 42.70768 },     // აკაკი წერეთლის ქუჩა
  { file: 'chavchavadze', lat: 42.25241, lon: 42.68475 }   // ილია ჭავჭავაძის გამზირი
];

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'pages', 'images', 'family-groups');
const CACHE_FILE = path.join(ROOT, 'scratch', 'osm-cache', 'kutaisi-main-roads.json');
const DETAIL_FILE = path.join(ROOT, 'scratch', 'osm-cache', 'kutaisi-detail.json');
const W = 520, H = 300;           // ბარათიც და ფანჯარაც ცენტრიდან ჭრის (slice)
const METERS_ACROSS = 3800;       // რამდენი მეტრი ჩანს სიგანეში
const PX_PER_M = W / METERS_ACROSS;

const COLORS = {
  land: '#efe7d4',
  building: '#e2d6bb',
  minor: '#f9f5ec',
  park: '#dfe4c8',
  water: '#bcd2d8',
  road: '#fffdf8',
  pin: '#aa954f'
};

// გზის კლასი → ხაზის სისქე; დანარჩენი ქუჩები ამ მასშტაბზე არ იხატება
const ROAD_WIDTH = {
  motorway: 4.5, trunk: 4.5, primary: 4.5, secondary: 3, tertiary: 1.8,
  residential: 0.9, unclassified: 0.9, living_street: 0.7
};

const metersPerDegLon = lat => 111320 * Math.cos(lat * Math.PI / 180);

// ყველა ჯგუფის ხედის გაერთიანებული საზღვარი, ცოტა მარაგით
function unionBbox() {
  const halfW = W / PX_PER_M / 2 * 1.1, halfH = H / PX_PER_M / 2 * 1.1;
  let s = 90, w = 180, n = -90, e = -180;
  for (const g of GROUPS) {
    const dLat = halfH / 110540, dLon = halfW / metersPerDegLon(g.lat);
    s = Math.min(s, g.lat - dLat); n = Math.max(n, g.lat + dLat);
    w = Math.min(w, g.lon - dLon); e = Math.max(e, g.lon + dLon);
  }
  return [s, w, n, e].map(x => x.toFixed(5)).join(',');
}

const MAIN_QUERY = b => `[out:json][timeout:180];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](${b});
  way["waterway"="river"](${b});
  way["natural"="water"](${b});
  relation["natural"="water"](${b});
  way["waterway"="riverbank"](${b});
  way["leisure"="park"](${b});
  way["landuse"="forest"](${b});
);
out geom(${b});`;

// შენობები და პატარა ქუჩები — ცალკე, რადგან დიდია
const DETAIL_QUERY = b => `[out:json][timeout:300][maxsize:536870912];
(
  way["building"](${b});
  way["highway"~"^(residential|unclassified|living_street)$"](${b});
);
out geom(${b});`;

async function overpass(cacheFile, makeQuery) {
  const b = unionBbox();
  if (fs.existsSync(cacheFile)) {
    const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (cached.bbox === b) return cached.data;
  }
  const query = makeQuery(b);
  // საჯარო სერვერები ხშირად გადატვირთულია (504) — რამდენჯერმე ვცდით.
  const servers = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
  let lastError;
  for (let attempt = 0; attempt < 10; attempt++) {
    const server = servers[attempt % servers.length];
    try {
      const res = await fetch(server, {
        method: 'POST',
        signal: AbortSignal.timeout(330000),
        headers: { 'User-Agent': 'efckutaisi.ge family-group maps', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query)
      });
      if (res.ok) {
        const data = await res.json();
        fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
        fs.writeFileSync(cacheFile, JSON.stringify({ bbox: b, data }));
        return data;
      }
      lastError = new Error(server + ' ' + res.status);
    } catch (err) {
      lastError = err;
    }
    console.log('  ვცდი თავიდან:', String(lastError));
    await new Promise(r => setTimeout(r, 8000));
  }
  throw lastError;
}

function projector(lat0, lon0) {
  const kx = metersPerDegLon(lat0) * PX_PER_M, ky = 110540 * PX_PER_M;
  return (lat, lon) => [W / 2 + (lon - lon0) * kx, H / 2 - (lat - lat0) * ky];
}

function pathData(points, project, closed) {
  let d = '', last = '';
  for (const p of points) {
    const [x, y] = project(p.lat, p.lon);
    const pt = `${x.toFixed(1)} ${y.toFixed(1)}`;
    if (pt === last) continue;
    d += (d ? 'L' : 'M') + pt;
    last = pt;
  }
  return d && closed ? d + 'Z' : d;
}

// ხაზი ხედში ხვდება? (ხედის გარეთ დარჩენილი ხაზები ფაილს ტყუილად ზრდის)
function visible(points, project) {
  const m = 40;
  return points.some(p => { const [x, y] = project(p.lat, p.lon); return x > -m && x < W + m && y > -m && y < H + m; });
}

function render(group, data) {
  const project = projector(group.lat, group.lon);
  const park = [], water = [], river = [], roads = {}, building = [];

  for (const el of data.elements) {
    const tags = el.tags || {};
    const parts = el.type === 'way' ? [el.geometry]
      : (el.members || []).filter(m => m.geometry && m.role !== 'inner').map(m => m.geometry);
    for (const part of parts) {
      const pts = (part || []).filter(Boolean);
      if (pts.length < 2 || !visible(pts, project)) continue;
      if (tags.building) {
        building.push(pathData(pts, project, true));
      } else if (tags.highway) {
        const w = ROAD_WIDTH[tags.highway];
        if (w) (roads[w] = roads[w] || []).push(pathData(pts, project, false));
      } else if (tags.waterway === 'riverbank' || tags.natural === 'water') {
        water.push(pathData(pts, project, true));
      } else if (tags.waterway) {
        river.push(pathData(pts, project, false));
      } else {
        park.push(pathData(pts, project, true));
      }
    }
  }

  const roadPaths = Object.keys(roads).map(Number).sort((a, b) => a - b)
    .map(w => `<path stroke="${w < 1 ? COLORS.minor : COLORS.road}" stroke-width="${w}" d="${roads[w].join('')}"/>`).join('');

  const others = GROUPS.filter(g => g !== group).map(g => {
    const [x, y] = project(g.lat, g.lon);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#fff" stroke="${COLORS.pin}" stroke-width="2"/>`;
  }).join('');

  const cx = W / 2, tip = H / 2;
  const pin =
    `<circle cx="${cx}" cy="${tip}" r="34" fill="${COLORS.pin}" opacity="0.18"/>` +
    `<circle cx="${cx}" cy="${tip}" r="46" fill="${COLORS.pin}" opacity="0.16"/>` +
    `<circle cx="${cx}" cy="${tip}" r="24" fill="${COLORS.pin}" opacity="0.26"/>` +
    `<ellipse cx="${cx}" cy="${tip}" rx="9" ry="3" fill="#000" opacity="0.2"/>` +
    `<path fill="${COLORS.pin}" d="M${cx} ${tip}C${cx - 4} ${tip - 8} ${cx - 15} ${tip - 17} ${cx - 15} ${tip - 28}A15 15 0 1 1 ${cx + 15} ${tip - 28}C${cx + 15} ${tip - 17} ${cx + 4} ${tip - 8} ${cx} ${tip}Z"/>` +
    `<circle cx="${cx}" cy="${tip - 28}" r="5.5" fill="#fff"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">` +
    `<!-- Map data © OpenStreetMap contributors, ODbL — openstreetmap.org/copyright -->` +
    `<rect width="${W}" height="${H}" fill="${COLORS.land}"/>` +
    (park.length ? `<path fill="${COLORS.park}" d="${park.join('')}"/>` : '') +
    (building.length ? `<path fill="${COLORS.building}" d="${building.join('')}"/>` : '') +
    (water.length ? `<path fill="${COLORS.water}" d="${water.join('')}"/>` : '') +
    `<g fill="none" stroke-linecap="round" stroke-linejoin="round">` +
    (river.length ? `<path stroke="${COLORS.water}" stroke-width="10" d="${river.join('')}"/>` : '') +
    roadPaths + `</g>` +
    others + pin + `</svg>\n`;
}

(async () => {
  const main = await overpass(CACHE_FILE, MAIN_QUERY);
  const detail = await overpass(DETAIL_FILE, DETAIL_QUERY);
  // შენობები და პატარა ქუჩები ქვემოთ, მთავარი ქუჩები და წყალი ზემოთ
  const data = { elements: detail.elements.concat(main.elements) };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const group of GROUPS) {
    const svg = render(group, data);
    const file = path.join(OUT_DIR, group.file + '.webp');
    await sharp(Buffer.from(svg), { density: 144 }).resize(W * 2, H * 2).webp({ quality: 82 }).toFile(file);
    console.log(group.file, Math.round(fs.statSync(file).size / 1024), 'KB');
  }
})().catch(err => { console.error(err); process.exit(1); });
