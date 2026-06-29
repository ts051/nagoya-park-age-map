import { readFile, writeFile } from "node:fs/promises";

const dataUrl = new URL("../data/app-data.json", import.meta.url);
const outUrl = new URL("../data/park-coordinate-review.csv", import.meta.url);

const data = JSON.parse(await readFile(dataUrl, "utf8"));
const rows = [
  ["id", "ward", "name", "address", "lat", "lng", "coordinateSource", "osmId", "reviewStatus", "note"]
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
