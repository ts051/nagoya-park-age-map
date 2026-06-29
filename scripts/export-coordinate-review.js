import { readFile, writeFile } from "node:fs/promises";

const dataUrl = new URL("../data/app-data.json", import.meta.url);
const outUrl = new URL("../data/park-coordinate-review.csv", import.meta.url);

const data = JSON.parse(await readFile(dataUrl, "utf8"));
const OFFICIAL_MAP_URL_BY_WARD = {
  "千種区": "https://www.city.nagoya.jp/_res/projects/default_project/_page_/001/014/871/01.pdf",
  "東区": "https://www.city.nagoya.jp/_res/projects/default_project/_page_/001/014/871/02r6higashi.pdf",
  "北区": "https://www.city.nagoya.jp/_res/projects/default_project/_page_/001/014/871/03r6kita.pdf",
  "西区": "https://www.city.nagoya.jp/_res/projects/default_project/_page_/001/014/871/04r6nishi.pdf",
  "中村区": "https://www.city.nagoya.jp/_res/projects/default_project/_page_/001/014/871/05r6nakamura.pdf",
  "中区": "https://www.city.nagoya.jp/_res/projects/default_project/_page_/001/014/871/06r6naka.pdf",
  "昭和区": "https://www.city.nagoya.jp/_res/projects/default_project/_page_/001/014/871/07r6shouwa.pdf",
  "瑞穂区": "https://www.city.nagoya.jp/_res/projects/default_project/_page_/001/014/871/08r6mizuho.pdf",
  "熱田区": "https://www.city.nagoya.jp/_res/projects/default_project/_page_/001/014/871/09r6atuta.pdf",
  "中川区": "https://www.city.nagoya.jp/_res/projects/default_project/_page_/001/014/871/10r6nakagawa.pdf",
  "港区": "https://www.city.nagoya.jp/_res/projects/default_project/_page_/001/014/871/11r6minato.pdf",
  "南区": "https://www.city.nagoya.jp/_res/projects/default_project/_page_/001/014/871/12r6minami.pdf",
  "守山区": "https://www.city.nagoya.jp/_res/projects/default_project/_page_/001/014/871/13r6moriyama.pdf",
  "緑区": "https://www.city.nagoya.jp/_res/projects/default_project/_page_/001/014/871/14r6midori.pdf",
  "名東区": "https://www.city.nagoya.jp/_res/projects/default_project/_page_/001/014/871/15r6meitou.pdf",
  "天白区": "https://www.city.nagoya.jp/_res/projects/default_project/_page_/001/014/871/16r6tenpaku.pdf"
};

const rows = [
  [
    "id",
    "ward",
    "name",
    "address",
    "lat",
    "lng",
    "coordinateSource",
    "osmId",
    "officialMapUrl",
    "googleMapsSearchUrl",
    "reviewStatus",
    "note"
  ]
];

for (const park of data.parks ?? []) {
  if (park.coordinateSource === "osm-park-poi" || park.coordinateSource === "manual-override") continue;
  rows.push([
    park.id,
    park.ward,
    park.name,
    park.address,
    park.lat,
    park.lng,
    park.coordinateSource,
    park.osmId ?? "",
    OFFICIAL_MAP_URL_BY_WARD[park.ward] ?? "",
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`名古屋市 ${park.ward} ${park.name}`)}`,
    "",
    ""
  ]);
}

await writeFile(outUrl, `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`, "utf8");
console.log(`Wrote ${rows.length - 1} review rows to ${outUrl.pathname}`);

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}
