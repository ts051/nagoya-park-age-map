const AGE_GROUPS = [
  ["0-9", "#29966d"],
  ["10-19", "#5eaa4f"],
  ["20-29", "#0f6b78"],
  ["30-39", "#3988b5"],
  ["40-49", "#7b72b8"],
  ["50-59", "#b36b08"],
  ["60-69", "#c8503b"],
  ["70-79", "#a13f55"],
  ["80+", "#6f4f7a"]
];

const WARD_ORDER = [
  "名古屋市",
  "千種区",
  "東区",
  "北区",
  "西区",
  "中村区",
  "中区",
  "昭和区",
  "瑞穂区",
  "熱田区",
  "中川区",
  "港区",
  "南区",
  "守山区",
  "緑区",
  "名東区",
  "天白区"
];

const CITY = "名古屋市";
const NO_PARK = "";

const map = L.map("map", { zoomControl: false }).setView([35.1815, 136.9066], 11);
L.control.zoom({ position: "bottomleft" }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

const state = {
  data: null,
  selectedWard: CITY,
  selectedParkId: NO_PARK,
  activeAgeKeys: new Set(AGE_GROUPS.map(([key]) => key)),
  markers: new Map(),
  parkStats: new Map(),
  circles: [],
  radius: 800
};

const $ = (selector) => document.querySelector(selector);

async function main() {
  state.data = await loadJson("./data/app-data.json");
  $("#dataset-note").textContent = `${state.data.meta.parksAsOf} 公園 / ${state.data.meta.populationAsOf} 人口`;

  populateWardSelect();
  populateParkSelect();
  bindControls();
  recomputeParkStats();
  renderLegend();
  renderMarkers();
  updateView();
}

function bindControls() {
  $("#ward-select").addEventListener("change", (event) => {
    state.selectedWard = event.target.value;
    state.selectedParkId = NO_PARK;
    populateParkSelect();
    updateView();
  });

  $("#park-select").addEventListener("change", (event) => {
    state.selectedParkId = event.target.value;
    updateView();
  });

  $("#radius-select").addEventListener("change", (event) => {
    state.radius = Number(event.target.value);
    recomputeParkStats();
    populateParkSelect();
    updateMarkerIcons();
    updateView();
  });

  $("#all-ages-button").addEventListener("click", () => {
    if (state.activeAgeKeys.size === AGE_GROUPS.length) {
      state.activeAgeKeys.clear();
    } else {
      state.activeAgeKeys = new Set(AGE_GROUPS.map(([key]) => key));
    }
    populateParkSelect();
    updateView();
  });

  $("#help-button").addEventListener("click", toggleHelpPanel);
}

function toggleHelpPanel() {
  const existingPanel = $("#help-panel");
  const helpButton = $("#help-button");
  if (existingPanel) {
    existingPanel.remove();
    helpButton.setAttribute("aria-expanded", "false");
    return;
  }

  const panel = document.createElement("div");
  panel.className = "help-panel";
  panel.id = "help-panel";
  panel.innerHTML = `
    <h2>使い方</h2>
    <ol>
      <li>区域を選ぶと、表示する公園を名古屋市全体または各区に絞り込めます。</li>
      <li>公園名を選ばない場合は、選択中の区域全体の人口構成を確認できます。</li>
      <li>公園名を選ぶと、その公園を中心にマップが移動し、周辺の年齢構成を確認できます。</li>
      <li>周辺判定では、公園から何m以内の町丁目人口を集計するかを切り替えられます。範囲にまたがる町丁目は、重なった面積に応じて人口を按分します。</li>
      <li>年齢層ボタンを選ぶと、その年齢層が多い公園だけをマップに表示できます。複数選択も可能です。</li>
      <li>全選択を押すと、すべての年齢層の表示非表示を切り替えられます。</li>
      <li>マップ上の丸いプロットの色は、公園周辺で最も多い年齢層を表します。</li>
      <li>下部の詳細パネルでは、総人口、対象町丁目数、年齢層ごとの人数と割合を確認できます。</li>
    </ol>
  `;
  document.querySelector(".brand").insertAdjacentElement("afterend", panel);
  helpButton.setAttribute("aria-expanded", "true");
}

function populateWardSelect() {
  const select = $("#ward-select");
  const wards = new Set(state.data.parks.map((park) => park.ward).filter(Boolean));
  const ordered = WARD_ORDER.filter((ward) => ward === CITY || wards.has(ward));
  select.innerHTML = ordered.map((ward) => `<option value="${escapeHtml(ward)}">${escapeHtml(ward)}</option>`).join("");
  select.value = state.selectedWard;
}

function populateParkSelect() {
  const select = $("#park-select");
  const parks = filteredParksForMap();
  if (state.selectedParkId && !parks.some((park) => park.id === state.selectedParkId)) {
    state.selectedParkId = NO_PARK;
  }

  select.innerHTML = [
    `<option value="">―</option>`,
    ...parks.map((park) => `<option value="${escapeHtml(park.id)}">${escapeHtml(park.name)}</option>`)
  ].join("");
  select.value = state.selectedParkId;
}

function renderLegend() {
  $("#age-legend").innerHTML = AGE_GROUPS.map(([key, color]) => `
    <button class="legend-item" type="button" data-age="${key}" aria-pressed="${state.activeAgeKeys.has(key)}">
      <span class="legend-swatch" style="background:${color}"></span>
      <span>${ageLabel(key)}</span>
    </button>
  `).join("");

  for (const button of $("#age-legend").querySelectorAll(".legend-item")) {
    button.addEventListener("click", () => {
      const ageKey = button.dataset.age;
      if (state.activeAgeKeys.has(ageKey)) {
        state.activeAgeKeys.delete(ageKey);
      } else {
        state.activeAgeKeys.add(ageKey);
      }
      populateParkSelect();
      updateView();
    });
  }
}

function refreshLegendState() {
  const allAgesActive = state.activeAgeKeys.size === AGE_GROUPS.length;
  const allAgesButton = $("#all-ages-button");
  allAgesButton.textContent = allAgesActive ? "全非選択" : "全選択";
  allAgesButton.setAttribute("aria-label", allAgesActive ? "すべての年齢層を非表示" : "すべての年齢層を表示");
  allAgesButton.setAttribute("aria-pressed", String(allAgesActive));

  for (const button of $("#age-legend").querySelectorAll(".legend-item")) {
    const active = state.activeAgeKeys.has(button.dataset.age);
    button.classList.toggle("is-off", !active);
    button.setAttribute("aria-pressed", String(active));
  }
}

function renderMarkers() {
  for (const park of state.data.parks) {
    const marker = L.marker([park.lat, park.lng], { icon: markerIconFor(park), title: park.name });
    marker.bindTooltip(park.name);
    marker.on("click", () => {
      state.selectedParkId = park.id;
      $("#park-select").value = park.id;
      updateView();
    });
    state.markers.set(park.id, marker);
  }
}

function updateMarkerIcons() {
  for (const park of state.data.parks) {
    state.markers.get(park.id)?.setIcon(markerIconFor(park));
  }
}

function markerIconFor(park) {
  const stats = parkStats(park);
  const selected = park.id === state.selectedParkId;
  const size = selected ? 23 : 18;
  return L.divIcon({
    className: "park-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<span class="marker-dot${selected ? " is-selected" : ""}" style="--marker-color:${stats.color}"></span>`
  });
}

function updateView() {
  refreshLegendState();
  clearSelectionLayers();
  updateMarkerVisibility();

  const park = selectedPark();
  if (park) {
    renderParkDetail(park);
    drawParkSelection(park);
    map.setView([park.lat, park.lng], Math.max(map.getZoom(), 14), { animate: true });
  } else {
    renderAreaDetail();
    fitCurrentArea();
  }
  updateMarkerIcons();
}

function updateMarkerVisibility() {
  const visibleIds = new Set(filteredParksForMap().map((park) => park.id));
  for (const park of state.data.parks) {
    const marker = state.markers.get(park.id);
    if (!marker) continue;
    if (visibleIds.has(park.id)) {
      if (!map.hasLayer(marker)) marker.addTo(map);
    } else {
      marker.remove();
    }
  }
}

function filteredParksByWard() {
  return state.data.parks.filter((park) => state.selectedWard === CITY || park.ward === state.selectedWard);
}

function filteredParksForMap() {
  const allAgesActive = state.activeAgeKeys.size === AGE_GROUPS.length;
  return filteredParksByWard().filter((park) => {
    const dominantKey = parkStats(park).dominantKey;
    return allAgesActive ? true : state.activeAgeKeys.has(dominantKey);
  });
}

function selectedPark() {
  if (!state.selectedParkId) return null;
  return state.data.parks.find((park) => park.id === state.selectedParkId) ?? null;
}

function renderAreaDetail() {
  const title = state.selectedWard;
  const towns = townsForSelectedWard();
  const parks = filteredParksByWard();
  const ages = sumAgeGroups(towns);
  const total = Object.values(ages).reduce((sum, value) => sum + value, 0);
  renderDetail({
    title,
    subtitle: state.selectedWard === CITY ? "名古屋市全体" : `${state.selectedWard} 全体`,
    distance: "",
    metrics: [
      metric(total.toLocaleString("ja-JP"), "人口"),
      metric(towns.length.toLocaleString("ja-JP"), "町丁目"),
      metric(parks.length.toLocaleString("ja-JP"), "公園")
    ],
    ages,
    total,
    footer: `対象区域: ${title}`
  });
}

function renderParkDetail(park) {
  const stats = parkStats(park);
  renderDetail({
    title: park.name,
    subtitle: `${park.ward} / ${park.address}`,
    distance: `${state.radius.toLocaleString("ja-JP")}m`,
    metrics: [
      metric(stats.total.toLocaleString("ja-JP"), "周辺人口"),
      metric(stats.nearby.length.toLocaleString("ja-JP"), "町丁目"),
      metric(ageLabel(stats.dominantKey), "最多")
    ],
    ages: stats.ages,
    total: stats.total,
    footer: `対象町丁目: ${stats.nearby.map((town) => town.name).join("、") || "なし"}`
  });
}

function renderDetail({ title, subtitle, distance, metrics, ages, total, footer }) {
  const dominantKey = total ? dominantAgeKey(ages) : null;
  const rows = AGE_GROUPS.map(([key, color]) => {
    const value = ages[key] ?? 0;
    const pct = total ? Math.round((value / total) * 1000) / 10 : 0;
    return `
      <div class="bar-row${key === dominantKey ? " is-dominant" : ""}">
        <span>${ageLabel(key)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${pct}%;background:${color}"></span></span>
        <span class="bar-value">${value.toLocaleString("ja-JP")}人 (${pct}%)</span>
      </div>`;
  }).join("");

  $("#detail-panel").innerHTML = `
    <div class="detail-title">
      <div>
        <h2>${escapeHtml(title)}</h2>
        <p class="muted">${escapeHtml(subtitle)}</p>
      </div>
      <p class="muted">${escapeHtml(distance)}</p>
    </div>
    <div class="summary">${metrics.join("")}</div>
    <div class="age-bars">${rows}</div>
    <p class="towns">${escapeHtml(footer)}</p>
  `;
}

function metric(value, label) {
  return `<div class="metric"><strong>${value}</strong><span>${label}</span></div>`;
}

function drawParkSelection(park) {
  const stats = parkStats(park);
  const circle = L.circle([park.lat, park.lng], {
    radius: state.radius,
    color: stats.color,
    fillColor: stats.color,
    fillOpacity: 0.08,
    weight: 2
  }).addTo(map);
  state.circles.push(circle);
}

function clearSelectionLayers() {
  state.circles.forEach((layer) => layer.remove());
  state.circles = [];
}

function fitCurrentArea() {
  const parks = filteredParksForMap();
  if (state.selectedWard === CITY) {
    map.setView([35.1815, 136.9066], 11, { animate: true });
    return;
  }
  if (!parks.length) return;
  const bounds = L.latLngBounds(parks.map((park) => [park.lat, park.lng]));
  map.fitBounds(bounds.pad(0.18), { animate: true, maxZoom: 14 });
}

function townsForSelectedWard() {
  if (state.selectedWard === CITY) return state.data.towns;
  return state.data.towns.filter((town) => town.ward === state.selectedWard);
}

function recomputeParkStats() {
  state.parkStats = new Map(state.data.parks.map((park) => [park.id, calculateParkStats(park)]));
}

function parkStats(park) {
  if (!state.parkStats.has(park.id)) {
    state.parkStats.set(park.id, calculateParkStats(park));
  }
  return state.parkStats.get(park.id);
}

function calculateParkStats(park) {
  const nearby = nearbyTowns(park, state.radius);
  const ages = sumAgeGroups(nearby);
  const total = Object.values(ages).reduce((sum, value) => sum + value, 0);
  const dominantKey = total ? dominantAgeKey(ages) : null;
  return {
    nearby,
    ages,
    total,
    dominantKey,
    color: ageColor(dominantKey)
  };
}

function nearbyTowns(park, radiusMeters) {
  return state.data.towns
    .map((town) => weightedTownInRadius(park, town, radiusMeters))
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance);
}

function weightedTownInRadius(park, town, radiusMeters) {
  if (!Array.isArray(town.polygons) || !town.polygons.length) {
    const distance = distanceMeters(park.lat, park.lng, town.lat, town.lng);
    return distance <= radiusMeters ? { ...town, distance, weight: 1 } : null;
  }
  if (town.bbox && !circleIntersectsBbox(park, radiusMeters, town.bbox)) return null;

  let totalArea = 0;
  let overlapArea = 0;
  let minDistance = Infinity;
  for (const ring of town.polygons) {
    const projected = ring.map((point) => projectPointMeters(park, point));
    const ringArea = Math.abs(polygonArea(projected));
    if (!ringArea) continue;
    const clipped = clipPolygonToCircle(projected, radiusMeters);
    totalArea += ringArea;
    overlapArea += Math.abs(polygonArea(clipped));
    minDistance = Math.min(minDistance, distanceToRingMeters(projected));
  }

  if (!totalArea || !overlapArea) return null;
  const weight = Math.min(1, overlapArea / totalArea);
  if (weight <= 0) return null;
  return { ...town, distance: Number.isFinite(minDistance) ? minDistance : 0, weight };
}

function circleIntersectsBbox(park, radiusMeters, bbox) {
  const latDelta = radiusMeters / 111320;
  const lngDelta = radiusMeters / (111320 * Math.max(0.2, Math.cos((park.lat * Math.PI) / 180)));
  return !(bbox[2] < park.lng - lngDelta
    || bbox[0] > park.lng + lngDelta
    || bbox[3] < park.lat - latDelta
    || bbox[1] > park.lat + latDelta);
}

function projectPointMeters(park, [lng, lat]) {
  return [
    (lng - park.lng) * 111320 * Math.cos((park.lat * Math.PI) / 180),
    (lat - park.lat) * 111320
  ];
}

function clipPolygonToCircle(points, radiusMeters) {
  const circle = circlePolygon(radiusMeters);
  return circle.reduce((subject, edgeEnd, index) => {
    if (!subject.length) return subject;
    const edgeStart = circle[(index + circle.length - 1) % circle.length];
    return clipPolygonToEdge(subject, edgeStart, edgeEnd);
  }, points);
}

function circlePolygon(radiusMeters) {
  return Array.from({ length: 48 }, (_, index) => {
    const angle = (index / 48) * Math.PI * 2;
    return [Math.cos(angle) * radiusMeters, Math.sin(angle) * radiusMeters];
  });
}

function clipPolygonToEdge(points, edgeStart, edgeEnd) {
  const clipped = [];
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const previous = points[(i + points.length - 1) % points.length];
    const currentInside = leftOfEdge(edgeStart, edgeEnd, current) >= 0;
    const previousInside = leftOfEdge(edgeStart, edgeEnd, previous) >= 0;
    if (currentInside && !previousInside) clipped.push(lineIntersection(previous, current, edgeStart, edgeEnd));
    if (currentInside) clipped.push(current);
    if (!currentInside && previousInside) clipped.push(lineIntersection(previous, current, edgeStart, edgeEnd));
  }
  return clipped.filter(Boolean);
}

function leftOfEdge(a, b, point) {
  return ((b[0] - a[0]) * (point[1] - a[1])) - ((b[1] - a[1]) * (point[0] - a[0]));
}

function lineIntersection(a, b, c, d) {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const cdx = d[0] - c[0];
  const cdy = d[1] - c[1];
  const denominator = (abx * cdy) - (aby * cdx);
  if (Math.abs(denominator) < 1e-9) return b;
  const t = (((c[0] - a[0]) * cdy) - ((c[1] - a[1]) * cdx)) / denominator;
  return [a[0] + (abx * t), a[1] + (aby * t)];
}

function polygonArea(points) {
  if (points.length < 3) return 0;
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + ((point[0] * next[1]) - (next[0] * point[1]));
  }, 0) / 2;
}

function distanceToRingMeters(points) {
  if (pointInProjectedRing([0, 0], points)) return 0;
  return Math.min(...points.map(([x, y]) => Math.hypot(x, y)));
}

function pointInProjectedRing(point, ring) {
  let inside = false;
  const [x, y] = point;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function sumAgeGroups(towns) {
  const result = Object.fromEntries(AGE_GROUPS.map(([key]) => [key, 0]));
  for (const town of towns) {
    const weight = Number.isFinite(town.weight) ? town.weight : 1;
    for (const key of Object.keys(result)) {
      result[key] += Number(town.population[key] ?? 0) * weight;
    }
  }
  for (const key of Object.keys(result)) {
    result[key] = Math.round(result[key]);
  }
  return result;
}

function dominantAgeKey(ages) {
  const [key] = Object.entries(ages).sort((a, b) => b[1] - a[1])[0] ?? ["-"];
  return key;
}

function ageLabel(key) {
  if (!key || key === "-") return "該当なし";
  return key === "80+" ? "80歳以上" : `${key}歳`;
}

function ageColor(key) {
  return AGE_GROUPS.find(([ageKey]) => ageKey === key)?.[1] ?? "#8a928b";
}

function totalPopulation(population) {
  return Object.values(population).reduce((sum, value) => sum + Number(value), 0);
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const radius = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

main().catch((error) => {
  $("#dataset-note").textContent = "データの読み込みに失敗しました";
  console.error(error);
});

async function loadJson(url) {
  if (typeof fetch === "function") {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return response.json();
  }

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", url);
    request.overrideMimeType("application/json; charset=utf-8");
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        try {
          resolve(JSON.parse(request.responseText));
        } catch (error) {
          reject(error);
        }
      } else {
        reject(new Error(`${request.status} ${url}`));
      }
    });
    request.addEventListener("error", () => reject(new Error(`Network error: ${url}`)));
    request.send();
  });
}
