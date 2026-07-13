const STORAGE_KEY = "radius-note-map.places.v1";
const DEFAULT_CENTER = [35.1815, 136.9066];

const map = L.map("map", { zoomControl: false }).setView(DEFAULT_CENTER, 12);
L.control.zoom({ position: "bottomright" }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

const elements = {
  name: document.querySelector("#name-input"),
  radius: document.querySelector("#radius-input"),
  memo: document.querySelector("#memo-input"),
  coordinates: document.querySelector("#coordinates"),
  status: document.querySelector("#editor-status"),
  save: document.querySelector("#save-button"),
  cancel: document.querySelector("#cancel-button"),
  list: document.querySelector("#place-list"),
  count: document.querySelector("#place-count"),
  clear: document.querySelector("#clear-button"),
  guide: document.querySelector("#map-guide")
};

const state = {
  places: loadPlaces(),
  draft: null,
  editingId: null,
  previewMarker: null,
  previewCircle: null,
  layers: new Map()
};

map.on("click", ({ latlng }) => beginNewPlace(latlng));
elements.radius.addEventListener("input", updatePreviewRadius);
elements.save.addEventListener("click", savePlace);
elements.cancel.addEventListener("click", resetEditor);
elements.clear.addEventListener("click", clearAllPlaces);

renderPlaces();
renderList();
fitSavedPlaces();

function beginNewPlace(latlng) {
  state.editingId = null;
  state.draft = { lat: latlng.lat, lng: latlng.lng };
  elements.name.value = "";
  elements.memo.value = "";
  elements.radius.value = "500";
  showDraft("新規地点");
}

function editPlace(id) {
  const place = state.places.find((item) => item.id === id);
  if (!place) return;
  state.editingId = id;
  state.draft = { lat: place.lat, lng: place.lng };
  elements.name.value = place.name;
  elements.memo.value = place.memo;
  elements.radius.value = String(place.radius);
  showDraft("編集中");
  map.setView([place.lat, place.lng], Math.max(map.getZoom(), 15), { animate: true });
  renderPlaces();
  renderList();
}

function showDraft(status) {
  clearPreview();
  const latlng = [state.draft.lat, state.draft.lng];
  state.previewCircle = L.circle(latlng, circleStyle(Number(elements.radius.value))).addTo(map);
  state.previewMarker = L.marker(latlng, { icon: pointIcon(true) }).addTo(map);
  elements.coordinates.textContent = `${state.draft.lat.toFixed(6)}, ${state.draft.lng.toFixed(6)}`;
  elements.status.textContent = status;
  elements.save.textContent = state.editingId ? "変更を保存" : "この地点を登録";
  elements.save.disabled = false;
  elements.cancel.disabled = false;
  elements.guide.textContent = "半径とメモを入力して保存";
  elements.name.focus();
}

function updatePreviewRadius() {
  if (!state.previewCircle) return;
  state.previewCircle.setRadius(normalizedRadius());
}

function savePlace() {
  if (!state.draft) return;
  const place = {
    id: state.editingId || crypto.randomUUID(),
    lat: state.draft.lat,
    lng: state.draft.lng,
    name: elements.name.value.trim() || `地点 ${state.places.length + 1}`,
    radius: normalizedRadius(),
    memo: elements.memo.value.trim()
  };
  const index = state.places.findIndex((item) => item.id === place.id);
  if (index >= 0) state.places[index] = place;
  else state.places.push(place);
  persist();
  resetEditor();
  renderPlaces();
  renderList();
  focusPlace(place.id);
}

function resetEditor() {
  state.draft = null;
  state.editingId = null;
  clearPreview();
  elements.name.value = "";
  elements.memo.value = "";
  elements.radius.value = "500";
  elements.coordinates.textContent = "緯度・経度は未選択です";
  elements.status.textContent = "地図をクリック";
  elements.save.textContent = "この地点を登録";
  elements.save.disabled = true;
  elements.cancel.disabled = true;
  elements.guide.textContent = "地図上の登録したい場所をクリック";
  renderPlaces();
}

function renderPlaces() {
  for (const { marker, circle } of state.layers.values()) {
    marker.remove();
    circle.remove();
  }
  state.layers.clear();
  for (const place of state.places) {
    const selected = place.id === state.editingId;
    const circle = L.circle([place.lat, place.lng], circleStyle(place.radius)).addTo(map);
    const marker = L.marker([place.lat, place.lng], { icon: pointIcon(selected), title: place.name }).addTo(map);
    const label = `<div class="note-card"><strong>${escapeHtml(place.name)}</strong>${place.memo ? `<br>${escapeHtml(place.memo)}` : ""}</div>`;
    marker.bindTooltip(label, { permanent: Boolean(place.memo), direction: "right", offset: [13, 0], className: "note-label" });
    marker.on("click", (event) => {
      L.DomEvent.stopPropagation(event);
      editPlace(place.id);
    });
    circle.on("click", (event) => {
      L.DomEvent.stopPropagation(event);
      editPlace(place.id);
    });
    state.layers.set(place.id, { marker, circle });
  }
}

function renderList() {
  elements.count.textContent = String(state.places.length);
  elements.clear.hidden = state.places.length === 0;
  if (!state.places.length) {
    elements.list.innerHTML = '<div class="empty">まだ地点がありません。<br>地図をクリックして登録してください。</div>';
    return;
  }
  elements.list.innerHTML = state.places.map((place) => `
    <article class="place-item${place.id === state.editingId ? " is-editing" : ""}">
      <button class="place-main" type="button" data-focus="${place.id}">
        <span class="place-name">${escapeHtml(place.name)}</span>
        <span class="place-meta">半径 ${place.radius.toLocaleString("ja-JP")}m${place.memo ? " · メモあり" : ""}</span>
      </button>
      <span class="place-actions">
        <button class="edit-one" type="button" data-edit="${place.id}" aria-label="${escapeHtml(place.name)}を編集">編集</button>
        <button class="delete-one" type="button" data-delete="${place.id}" aria-label="${escapeHtml(place.name)}を削除">×</button>
      </span>
    </article>`).join("");
  elements.list.querySelectorAll("[data-focus]").forEach((button) => button.addEventListener("click", () => focusPlace(button.dataset.focus)));
  elements.list.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => editPlace(button.dataset.edit)));
  elements.list.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => deletePlace(button.dataset.delete)));
}

function focusPlace(id) {
  const place = state.places.find((item) => item.id === id);
  if (!place) return;
  map.setView([place.lat, place.lng], zoomForRadius(place.radius), { animate: true });
  if (!place.memo) state.layers.get(id)?.marker.openTooltip();
}

function deletePlace(id) {
  const place = state.places.find((item) => item.id === id);
  if (!place || !confirm(`「${place.name}」を削除しますか？`)) return;
  state.places = state.places.filter((item) => item.id !== id);
  persist();
  if (state.editingId === id) resetEditor();
  renderPlaces();
  renderList();
}

function clearAllPlaces() {
  if (!confirm("登録地点をすべて削除しますか？")) return;
  state.places = [];
  persist();
  resetEditor();
  renderPlaces();
  renderList();
}

function fitSavedPlaces() {
  if (!state.places.length) return;
  const bounds = L.latLngBounds(state.places.map((place) => [place.lat, place.lng]));
  map.fitBounds(bounds.pad(.35), { maxZoom: 15 });
}

function clearPreview() {
  state.previewMarker?.remove();
  state.previewCircle?.remove();
  state.previewMarker = null;
  state.previewCircle = null;
}

function pointIcon(selected = false) {
  return L.divIcon({ className: "point-marker", iconSize: [20, 20], iconAnchor: [10, 10], html: `<span class="point-dot${selected ? " selected" : ""}"></span>` });
}

function circleStyle(radius) {
  return { radius, color: "#174c45", fillColor: "#4ba58c", fillOpacity: .13, weight: 2 };
}

function normalizedRadius() {
  return Math.min(50000, Math.max(10, Number(elements.radius.value) || 500));
}

function zoomForRadius(radius) {
  if (radius <= 100) return 18;
  if (radius <= 300) return 17;
  if (radius <= 700) return 16;
  if (radius <= 1500) return 15;
  if (radius <= 4000) return 13;
  return 11;
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.places));
}

function loadPlaces() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.filter(isValidPlace) : [];
  } catch {
    return [];
  }
}

function isValidPlace(place) {
  return place && typeof place.id === "string" && Number.isFinite(place.lat) && Number.isFinite(place.lng) && Number.isFinite(place.radius);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}
