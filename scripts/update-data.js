import { readFile, writeFile, mkdir } from "node:fs/promises";

const fileConfig = JSON.parse(await readFile(new URL("../data/source-config.json", import.meta.url), "utf8"));
const config = {
  ...fileConfig,
  populationPageUrl: process.env.NAGOYA_POPULATION_PAGE_URL || fileConfig.populationPageUrl,
  populationAsOf: process.env.NAGOYA_POPULATION_AS_OF || fileConfig.populationAsOf,
  parksAsOf: process.env.NAGOYA_PARKS_AS_OF || fileConfig.parksAsOf
};
const outUrl = new URL("../data/app-data.json", import.meta.url);
const cacheUrl = new URL("../data/geocode-cache.json", import.meta.url);

const AGE_KEYS = ["0-9", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70-79", "80+"];

async function main() {
  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  const cache = await readJson(cacheUrl, {});
  const parks = await loadParks(cache);
  const towns = await loadPopulation(cache);

  await writeFile(cacheUrl, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  await writeFile(outUrl, `${JSON.stringify({
    meta: {
      parksAsOf: config.parksAsOf,
      populationAsOf: config.populationAsOf,
      sourceCredit: config.sourceCredit,
      isSample: false
    },
    parks,
    towns
  }, null, 2)}\n`, "utf8");
  console.log(`Wrote ${parks.length} parks and ${towns.length} towns.`);
}

async function loadParks(cache) {
  const url = `${config.ckanBase}/package_show?id=${encodeURIComponent(config.parksPackageName)}`;
  const pkg = await fetchJson(url);
  const resources = pkg.result.resources.filter((resource) => resource.format?.toUpperCase() === "CSV");
  const parks = [];

  for (const resource of resources) {
    const csv = await fetchText(resource.url, "shift_jis");
    for (const row of parseCsv(csv)) {
      const no = Number(row["No."] ?? row.No);
      const name = row["名称"] ?? row["名　　称"] ?? row.name;
      const address = row["所在地"] ?? row["所　　在　　地"] ?? row.address;
      if (!no || !name || !address) continue;
      const key = `${name}|${address}`;
      cache[key] ??= await geocode(`名古屋市 ${address}`);
      if (!cache[key]) continue;
      parks.push({
        id: slug(`${resource.position}-${no}-${name}`),
        name,
        ward: wardFromAddress(address),
        address,
        lat: cache[key].lat,
        lng: cache[key].lng,
        areaHa: numberFrom(row["面積\n（ha）"] ?? row["面積（ha）"] ?? row.areaHa)
      });
    }
  }
  return parks;
}

async function loadPopulation(cache) {
  const page = await fetchText(config.populationPageUrl, "utf8");
  const excelUrl = latestExcelUrl(page);
  if (!excelUrl) throw new Error("Population Excel link was not found.");

  const XLSX = await import("xlsx");
  const buffer = Buffer.from(await (await fetch(excelUrl)).arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const towns = [];

  for (const sheetName of workbook.SheetNames.filter((name) => name !== "全市")) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" });
    for (const [index, row] of rows.slice(6).entries()) {
      const name = clean(row[1]);
      if (!name) continue;
      const geoKey = `town|${sheetName}|${name}`;
      cache[geoKey] ??= await geocode(`名古屋市 ${sheetName} ${name}`);
      towns.push({
        id: slug(`${sheetName}-${name}-${index}`),
        name,
        ward: sheetName,
        lat: cache[geoKey]?.lat ?? null,
        lng: cache[geoKey]?.lng ?? null,
        population: {
          "0-9": numberFrom(row[6]),
          "10-19": numberFrom(row[7]),
          "20-29": numberFrom(row[8]),
          "30-39": numberFrom(row[9]),
          "40-49": numberFrom(row[10]),
          "50-59": numberFrom(row[11]),
          "60-69": numberFrom(row[12]),
          "70-79": numberFrom(row[13]),
          "80+": numberFrom(row[14]) + numberFrom(row[15]) + numberFrom(row[16])
        }
      });
    }
  }
  return towns.filter((town) => Number.isFinite(town.lat) && Number.isFinite(town.lng));
}

function latestExcelUrl(html) {
  const matches = [...html.matchAll(/href=["']([^"']+\.xlsx?[^"']*)["']/gi)];
  const latest = matches.at(-1)?.[1]?.replace(/&amp;/g, "&");
  if (!latest) return null;
  return new URL(latest, config.populationPageUrl).toString();
}

async function geocode(query) {
  const url = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(query)}`;
  const results = await fetchJson(url);
  const first = Array.isArray(results) ? results[0] : null;
  if (!first?.geometry?.coordinates) return null;
  const [lng, lat] = first.geometry.coordinates;
  await delay(120);
  return { lat, lng };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

async function fetchText(url, encoding) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const buffer = await response.arrayBuffer();
  return new TextDecoder(encoding).decode(buffer);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(clean(cell));
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(clean(cell));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(clean(cell));
    rows.push(row);
  }

  const headerIndex = rows.findIndex((items) => items.includes("No.") || items.some((item) => item.includes("名称")));
  const header = rows[headerIndex]?.map((item) => item.replace(/\s+/g, "")) ?? [];
  return rows.slice(headerIndex + 1).map((items) => Object.fromEntries(header.map((key, index) => [key, items[index]])));
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function numberFrom(value) {
  const number = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(number) ? number : 0;
}

function wardFromAddress(address) {
  return address.match(/名古屋市?([^市\s]+区)|([^市\s]+区)/)?.[1] ?? address.match(/([^市\s]+区)/)?.[1] ?? "";
}

function slug(value) {
  return String(value).normalize("NFKC").replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase();
}

async function readJson(url, fallback) {
  try {
    return JSON.parse(await readFile(url, "utf8"));
  } catch {
    return fallback;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
