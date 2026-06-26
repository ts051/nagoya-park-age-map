import { readFile } from "node:fs/promises";

const data = JSON.parse(await readFile(new URL("../data/app-data.json", import.meta.url), "utf8"));

const errors = [];
if (!Array.isArray(data.parks) || data.parks.length === 0) errors.push("parks is empty");
if (!Array.isArray(data.towns) || data.towns.length === 0) errors.push("towns is empty");

for (const park of data.parks ?? []) {
  if (!park.id || !park.name) errors.push(`park has no id/name: ${JSON.stringify(park)}`);
  if (!Number.isFinite(park.lat) || !Number.isFinite(park.lng)) errors.push(`park has invalid coordinates: ${park.name}`);
}

for (const town of data.towns ?? []) {
  if (!town.id || !town.name) errors.push(`town has no id/name: ${JSON.stringify(town)}`);
  if (!Number.isFinite(town.lat) || !Number.isFinite(town.lng)) errors.push(`town has invalid coordinates: ${town.name}`);
  if (!town.population || Object.keys(town.population).length === 0) errors.push(`town has no population: ${town.name}`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`OK: ${data.parks.length} parks, ${data.towns.length} towns`);
