import { BUILT_IN_DAYS } from "./day-plans.js";

const STORAGE_KEY = "osaka-day-trip-planner:v3";
const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const NOW = new Date();
const NOW_MONTH = NOW.getMonth() + 1;
const NOW_YEAR = NOW.getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => NOW_YEAR + i);
const TAG_ICONS = {
  hike: "🥾",
  museum: "🖼",
  temple: "🏯",
  shrine: "⛩",
  nature: "🌿",
  attraction: "✨",
  beach: "🏖",
  onsen: "♨",
  train: "🚂",
  exhibition: "🎨",
  area: "🏙",
  coast: "⛵",
  food: "🍜",
};

const QUICK_FILTERS = [
  ["all", "All fits"],
  ["bestNow", "Best now"],
  ["rainy", "Rain-safe"],
  ["lowCost", "Low cost"],
  ["tickets", "Book ahead"],
  ["hikes", "Hikes"],
  ["must", "Must-do"],
];

const STATUS_FILTERS = [
  ["active", "Active"],
  ["all", "All"],
  ["unplanned", "Unplanned"],
  ["planned", "Soft-booked"],
  ["completed", "Completed"],
];

const BASE_IDS = new Set(BUILT_IN_DAYS.map((day) => day.id));
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

let state = loadState();
let editingDayId = null;
let planningDayId = null;
let toastTimer = null;

init();

function init() {
  fillYearAndMonthSelects();
  bindEvents();
  renderAll();
}

function defaultState() {
  return {
    version: 3,
    filters: {
      query: "",
      month: "all",
      zone: "all",
      tag: "all",
      status: "active",
      quick: "all",
      sort: "smart",
    },
    planned: {},
    completed: {},
    overrides: {},
    customDays: {},
    deletedIds: [],
    pois: seedPois(),
  };
}

function seedPois() {
  return [
    {
      id: uid("poi"),
      name: "Kaiyodo Figure Museum Miraiza Osaka-Jo",
      type: "museum",
      zone: "Osaka",
      maps: "",
      notes: "Inside Miraiza Osaka-jo. Check current exhibitions.",
      createdAt: new Date().toISOString(),
    },
    {
      id: uid("poi"),
      name: "Donzurubo",
      type: "hike",
      zone: "Osaka",
      maps: "",
      notes: "Short volcanic-rock hike. Good pair-up stop rather than a standalone day.",
      createdAt: new Date().toISOString(),
    },
  ];
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return mergeState(defaultState(), parsed);
  } catch {
    return defaultState();
  }
}

function mergeState(base, incoming) {
  return {
    ...base,
    ...incoming,
    filters: { ...base.filters, ...(incoming?.filters || {}) },
    planned: incoming?.planned || base.planned,
    completed: incoming?.completed || base.completed,
    overrides: incoming?.overrides || base.overrides,
    customDays: incoming?.customDays || base.customDays,
    deletedIds: incoming?.deletedIds || base.deletedIds,
    pois: Array.isArray(incoming?.pois) ? incoming.pois : base.pois,
  };
}

function saveState() {
  state.version = 3;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function bindEvents() {
  $("#searchInput").addEventListener("input", (event) => {
    state.filters.query = event.target.value;
    saveState();
    renderAll();
  });

  $("#sortSelect").addEventListener("change", (event) => {
    state.filters.sort = event.target.value;
    saveState();
    renderCardsAndPanels();
  });

  $("#importInput").addEventListener("change", importBackup);
  $("#dayForm").addEventListener("submit", saveDayFromForm);
  $("#planForm").addEventListener("submit", savePlanFromForm);

  document.addEventListener("click", (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;
    const { action, id, filter, value, quick } = actionEl.dataset;

    if (action === "filter") {
      state.filters[filter] = value;
      saveState();
      renderAll();
    }
    if (action === "quick") {
      state.filters.quick = quick;
      saveState();
      renderAll();
      scrollToCards();
    }
    if (action === "clear-filters") clearFilters();
    if (action === "open-day") openDayDialog(id);
    if (action === "add-stop") addStopRow();
    if (action === "delete-stop") actionEl.closest(".stop-edit-row")?.remove();
    if (action === "delete-day") deleteEditingDay();
    if (action === "plan-day") openPlanDialog(id);
    if (action === "toggle-done") toggleDone(id);
    if (action === "edit-day") openDayDialog(id);
    if (action === "open-detail") openDetail(id);
    if (action === "close-detail") $("#detailDialog").close();
    if (action === "open-poi") openPoiDialog();
    if (action === "save-poi") savePoi();
    if (action === "clear-poi") clearPoiForm();
    if (action === "delete-poi") deletePoi(id);
    if (action === "build-from-pois") buildDayFromSelectedPois();
    if (action === "export") exportBackup();
    if (action === "unplan-day") unplanDay(id);
  });
}

function fillYearAndMonthSelects() {
  $("#planMonth").innerHTML = MONTHS.slice(1).map((month, index) => (
    `<option value="${index + 1}">${month}</option>`
  )).join("");
  $("#planYear").innerHTML = YEARS.map((year) => `<option value="${year}">${year}</option>`).join("");
}

function renderAll() {
  $("#searchInput").value = state.filters.query;
  $("#sortSelect").value = state.filters.sort;
  renderFilterPills();
  renderCardsAndPanels();
}

function renderCardsAndPanels() {
  const days = allDays();
  const visible = filteredDays(days);
  const stats = summarize(days);
  $("#stat-total").textContent = stats.total;
  $("#stat-planned").textContent = stats.planned;
  $("#stat-done").textContent = stats.completed;
  $("#stat-left").textContent = stats.remaining;
  $("#resultText").textContent = `${visible.length} showing`;
  renderRecommendations(days);
  renderTimeline(days);
  renderCards(visible);
}

function renderFilterPills() {
  const days = allDays();
  const zones = ["all", ...unique(days.map((day) => day.zone)).sort()];
  const tags = ["all", ...unique(days.flatMap((day) => day.tags || [])).sort()];
  renderPills("#monthPills", [["all", "All"], ...MONTHS.slice(1).map((m, i) => [String(i + 1), m])], "month");
  renderPills("#zonePills", zones.map((zone) => [zone, zone === "all" ? "All zones" : zone]), "zone");
  renderPills("#tagPills", tags.map((tag) => [tag, tag === "all" ? "All types" : `${TAG_ICONS[tag] || "◆"} ${titleCase(tag)}`]), "tag");
  renderPills("#statusPills", STATUS_FILTERS, "status");
  renderPills("#quickPills", QUICK_FILTERS, "quick");
}

function renderPills(selector, items, filter) {
  const active = state.filters[filter];
  $(selector).innerHTML = items.map(([value, label]) => (
    `<button class="pill ${String(active) === String(value) ? "active" : ""}" data-action="filter" data-filter="${filter}" data-value="${escapeAttr(value)}">${escapeHtml(label)}</button>`
  )).join("");
}

function allDays() {
  const deleted = new Set(state.deletedIds);
  const builtIns = BUILT_IN_DAYS
    .filter((day) => !deleted.has(day.id))
    .map((day) => normalizeDay({ ...day, ...(state.overrides[day.id] || {}) }));
  const custom = Object.values(state.customDays).map(normalizeDay);
  return [...builtIns, ...custom];
}

function normalizeDay(day) {
  const tags = Array.isArray(day.tags) ? day.tags : splitList(day.tags);
  const months = Array.isArray(day.months) && day.months.length
    ? day.months.map(Number).filter(Boolean)
    : Array.from({ length: 12 }, (_, i) => i + 1);
  const zone = day.zone?.trim() || "Osaka";
  const duration = day.duration || durationFromSub(day.sub) || "Flexible day";
  return {
    id: day.id || uid("day"),
    zone,
    title: day.title?.trim() || "Untitled day plan",
    sub: day.sub || `${duration} · ${zone}`,
    duration,
    tags: tags.length ? tags : ["area"],
    months,
    stops: Array.isArray(day.stops) ? day.stops : [],
    transport: day.transport || "TBD",
    fees: day.fees || "TBD",
    total: day.total || "TBD",
    note: day.note || "",
    priority: Number(day.priority || 2),
    difficulty: day.difficulty || inferDifficulty(day),
    rain: day.rain || inferRain(tags),
    reservation: day.reservation || inferReservation(day),
    hours: day.hours || "Verify official hours before leaving",
    closed: day.closed || "Check closed days and last entry",
    source: day.source || (BASE_IDS.has(day.id) ? "original-dashboard" : "custom"),
  };
}

function filteredDays(days) {
  const { query, month, zone, tag, status, quick, sort } = state.filters;
  const q = query.trim().toLowerCase();
  let list = days.filter((day) => {
    if (status === "active" && state.completed[day.id]) return false;
    if (status === "planned" && !state.planned[day.id]) return false;
    if (status === "unplanned" && (state.planned[day.id] || state.completed[day.id])) return false;
    if (status === "completed" && !state.completed[day.id]) return false;
    if (zone !== "all" && day.zone !== zone) return false;
    if (tag !== "all" && !(day.tags || []).includes(tag)) return false;
    if (month !== "all") {
      const m = Number(month);
      const plannedForMonth = Number(state.planned[day.id]?.month) === m;
      if (!day.months.includes(m) && !plannedForMonth) return false;
    }
    if (quick !== "all" && !matchesQuick(day, quick)) return false;
    if (q && !searchText(day).includes(q)) return false;
    return true;
  });
  return sortDays(list, sort);
}

function matchesQuick(day, quick) {
  if (quick === "bestNow") return day.months.includes(NOW_MONTH) && !state.completed[day.id];
  if (quick === "rainy") return day.rain === "rain-friendly" || day.rain === "mixed";
  if (quick === "lowCost") return estimatedCost(day) <= 3500;
  if (quick === "tickets") return /book|reserve|advance|verify|ticket|ferry|required/i.test(`${day.reservation} ${day.note} ${searchText(day)}`);
  if (quick === "hikes") return day.tags.includes("hike");
  if (quick === "must") return Number(day.priority) >= 4;
  return true;
}

function sortDays(days, sort) {
  const sorted = [...days];
  const plannedRank = (day) => state.planned[day.id] ? 1 : 0;
  const doneRank = (day) => state.completed[day.id] ? 1 : 0;
  const bestNow = (day) => day.months.includes(NOW_MONTH) ? 1 : 0;
  const difficultyRank = { easy: 1, moderate: 2, hard: 3 };

  sorted.sort((a, b) => {
    if (sort === "priority") return compare(doneRank(a), doneRank(b)) || compare(b.priority, a.priority) || compareTitles(a, b);
    if (sort === "costLow") return compare(estimatedCost(a), estimatedCost(b)) || compareTitles(a, b);
    if (sort === "costHigh") return compare(estimatedCost(b), estimatedCost(a)) || compareTitles(a, b);
    if (sort === "difficulty") return compare(difficultyRank[b.difficulty] || 0, difficultyRank[a.difficulty] || 0) || compareTitles(a, b);
    if (sort === "duration") return compare(durationScore(b), durationScore(a)) || compareTitles(a, b);
    if (sort === "zone") return a.zone.localeCompare(b.zone) || compareTitles(a, b);
    return compare(doneRank(a), doneRank(b))
      || compare(plannedRank(b), plannedRank(a))
      || compare(bestNow(b), bestNow(a))
      || compare(b.priority, a.priority)
      || compare(estimatedCost(a), estimatedCost(b))
      || compareTitles(a, b);
  });
  return sorted;
}

function renderCards(days) {
  const cards = $("#cards");
  if (!days.length) {
    cards.innerHTML = `<div class="empty-state"><div>No matching trips.<br>Clear filters or add a new day plan.</div></div>`;
    return;
  }

  const groups = new Map();
  days.forEach((day) => {
    if (!groups.has(day.zone)) groups.set(day.zone, []);
    groups.get(day.zone).push(day);
  });

  cards.innerHTML = [...groups.entries()].map(([zone, group]) => (
    `<div class="zone-heading">${escapeHtml(zone)} <small>${group.length}</small></div>` +
    group.map(renderCard).join("")
  )).join("");
}

function renderCard(day) {
  const planned = state.planned[day.id];
  const completed = state.completed[day.id];
  const must = Number(day.priority) >= 4;
  const stops = day.stops.slice(0, 6).map(renderStop).join("");
  const extraStops = day.stops.length > 6 ? `<div class="transit">+ ${day.stops.length - 6} more stops</div>` : "";
  const tripClass = ["trip-card", must ? "must" : "", completed ? "completed" : ""].filter(Boolean).join(" ");

  return `
    <article class="${tripClass}" id="trip-${escapeAttr(day.id)}">
      <div class="trip-card-head">
        <div>
          <h3 class="trip-title">${escapeHtml(day.title)}</h3>
          <div class="trip-sub">${escapeHtml(day.sub)}</div>
        </div>
        <div class="status-stack">
          ${planned ? `<span class="status-chip planned">📅 ${MONTHS[planned.month]} ${planned.year}</span>` : ""}
          ${completed ? `<span class="status-chip done">★ done</span>` : ""}
          ${must ? `<span class="status-chip warn">priority ${day.priority}</span>` : ""}
        </div>
      </div>
      <div class="trip-tags">${day.tags.map((tag) => `<span class="tag ${escapeAttr(tag)}">${TAG_ICONS[tag] || "◆"} ${escapeHtml(tag)}</span>`).join("")}</div>
      <div class="trip-body">
        <div class="meta-grid">
          <span class="mini-chip">${difficultyLabel(day.difficulty)}</span>
          <span class="mini-chip">${rainLabel(day.rain)}</span>
          <span class="mini-chip">${escapeHtml(day.reservation)}</span>
        </div>
        <div class="stop-list">${stops}${extraStops}</div>
      </div>
      <div class="trip-footer">
        <div class="cost-row">
          <div><span>Transport</span><strong>${escapeHtml(day.transport)}</strong></div>
          <div><span>Entry</span><strong>${escapeHtml(day.fees)}</strong></div>
          <div><span>Total</span><strong>${escapeHtml(day.total)}</strong></div>
        </div>
        ${day.note ? `<div class="note-line">${escapeHtml(day.note)}</div>` : ""}
        <div class="month-row">${renderMonthDots(day)}</div>
        <div class="card-actions">
          <button class="btn primary" data-action="plan-day" data-id="${escapeAttr(day.id)}">${planned ? "Rebook" : "Plan"}</button>
          <button class="btn" data-action="open-detail" data-id="${escapeAttr(day.id)}">Prep</button>
          <button class="btn" data-action="edit-day" data-id="${escapeAttr(day.id)}">Edit</button>
          <button class="btn" data-action="toggle-done" data-id="${escapeAttr(day.id)}">${completed ? "Undo" : "Done"}</button>
        </div>
      </div>
    </article>
  `;
}

function renderStop(stop) {
  if (stop.transit || stop.t === "→") {
    return `<div class="transit">↳ ${escapeHtml(stop.d || stop.n || "")}</div>`;
  }
  const mapLink = stop.n ? `<a href="${mapSearchUrl(stop.n)}" target="_blank" rel="noreferrer">Map</a>` : "";
  return `
    <div class="stop">
      <div class="stop-time">${escapeHtml(stop.t || "")}</div>
      <div>
        <div class="stop-name">${escapeHtml(stop.n || "")} ${mapLink}</div>
        ${stop.d ? `<div class="stop-note">${escapeHtml(stop.d)}</div>` : ""}
        ${stop.trail ? `<div class="trail">🥾 ${escapeHtml(stop.trail)}</div>` : ""}
      </div>
    </div>
  `;
}

function renderMonthDots(day) {
  return MONTHS.slice(1).map((month, index) => {
    const m = index + 1;
    const classes = ["month-dot", day.months.includes(m) ? "best" : "", m === NOW_MONTH && day.months.includes(m) ? "now" : ""].filter(Boolean).join(" ");
    return `<span class="${classes}" title="${month}">${month[0]}</span>`;
  }).join("");
}

function renderRecommendations(days) {
  const recs = sortDays(days.filter((day) => !state.completed[day.id] && day.months.includes(NOW_MONTH)), "smart").slice(0, 3);
  $("#recommendations").innerHTML = recs.length
    ? recs.map((day) => `
      <button class="rec" data-action="open-detail" data-id="${escapeAttr(day.id)}">
        <strong>${escapeHtml(day.title)}</strong>
        <span>${escapeHtml(day.zone)} · ${rainLabel(day.rain)} · ${escapeHtml(day.total)}</span>
      </button>
    `).join("")
    : `<div class="empty-state">No current-month suggestions left.</div>`;
}

function renderTimeline(days) {
  const plannedItems = Object.entries(state.planned)
    .map(([id, plan]) => ({ day: days.find((candidate) => candidate.id === id), plan }))
    .filter((item) => item.day)
    .sort((a, b) => compare(a.plan.year, b.plan.year) || compare(a.plan.month, b.plan.month));

  $("#calendarCount").textContent = plannedItems.length ? `${plannedItems.length} trips` : "none yet";
  $("#timeline").innerHTML = plannedItems.length ? plannedItems.map(({ day, plan }) => `
    <div class="timeline-item">
      <div class="timeline-date">${MONTHS[plan.month]} ${plan.year}</div>
      <div>
        <div class="timeline-title">${escapeHtml(day.title)}</div>
        ${plan.note ? `<div class="trip-sub">${escapeHtml(plan.note)}</div>` : ""}
      </div>
      <button class="btn small" data-action="unplan-day" data-id="${escapeAttr(day.id)}">Remove</button>
    </div>
  `).join("") : `<div class="empty-state">Soft-book a trip to build your calendar.</div>`;
}

function openDayDialog(id) {
  if ($("#detailDialog").open) $("#detailDialog").close();
  editingDayId = id || null;
  const day = id ? allDays().find((candidate) => candidate.id === id) : normalizeDay({
    id: uid("day"),
    title: "",
    zone: state.filters.zone !== "all" ? state.filters.zone : "Osaka",
    duration: "Full day",
    tags: ["area"],
    months: [NOW_MONTH],
    stops: [{ t: "9:00", n: "", d: "" }],
    priority: 2,
    difficulty: "easy",
    rain: "mixed",
    source: "custom",
  });
  if (!day) return;

  $("#dayDialogTitle").textContent = id ? "Edit day plan" : "Add day plan";
  $("#deleteDayBtn").style.display = id ? "inline-flex" : "none";
  $("#dayId").value = day.id;
  $("#dayTitle").value = id ? day.title : "";
  $("#dayZone").value = day.zone;
  $("#dayDuration").value = day.duration || durationFromSub(day.sub);
  $("#dayTags").value = day.tags.join(", ");
  $("#dayTransport").value = day.transport === "TBD" ? "" : day.transport;
  $("#dayFees").value = day.fees === "TBD" ? "" : day.fees;
  $("#dayTotal").value = day.total === "TBD" ? "" : day.total;
  $("#dayPriority").value = String(day.priority || 2);
  $("#dayDifficulty").value = day.difficulty || "easy";
  $("#dayRain").value = day.rain || "mixed";
  $("#dayReservation").value = day.reservation || "";
  $("#dayHours").value = day.hours || "";
  $("#dayClosed").value = day.closed || "";
  $("#dayNote").value = day.note || "";
  renderMonthChecks(day.months);
  $("#stopsEditor").innerHTML = "";
  (day.stops.length ? day.stops : [{ t: "", n: "", d: "" }]).forEach(addStopRowFromStop);
  $("#dayDialog").showModal();
}

function renderMonthChecks(selected) {
  const selectedSet = new Set(selected.map(Number));
  $("#dayMonths").innerHTML = MONTHS.slice(1).map((month, index) => {
    const value = index + 1;
    return `<label><input type="checkbox" value="${value}" ${selectedSet.has(value) ? "checked" : ""}>${month}</label>`;
  }).join("");
}

function addStopRow() {
  addStopRowFromStop({ t: "", n: "", d: "" });
}

function addStopRowFromStop(stop = {}) {
  const row = document.createElement("div");
  row.className = "stop-edit-row";
  row.innerHTML = `
    <input data-field="t" placeholder="Time" value="${escapeAttr(stop.t || "")}">
    <input data-field="n" placeholder="Stop name" value="${escapeAttr(stop.n || "")}">
    <input data-field="d" placeholder="Details / transit" value="${escapeAttr(stop.d || "")}">
    <button type="button" class="icon-btn" data-action="delete-stop" aria-label="Remove stop">×</button>
  `;
  $("#stopsEditor").append(row);
}

function saveDayFromForm(event) {
  event.preventDefault();
  const id = $("#dayId").value || uid("day");
  const zone = $("#dayZone").value.trim() || "Osaka";
  const duration = $("#dayDuration").value.trim() || "Flexible day";
  const tags = splitList($("#dayTags").value).map((tag) => tag.toLowerCase());
  const months = $$("#dayMonths input:checked").map((input) => Number(input.value));
  const stops = $$(".stop-edit-row").map((row) => {
    const t = $('[data-field="t"]', row).value.trim();
    const n = $('[data-field="n"]', row).value.trim();
    const d = $('[data-field="d"]', row).value.trim();
    return { t, n, d, transit: t === "→" && !n };
  }).filter((stop) => stop.t || stop.n || stop.d);

  const day = normalizeDay({
    id,
    title: $("#dayTitle").value.trim(),
    zone,
    duration,
    sub: `${duration} · ${zone}`,
    tags: tags.length ? tags : ["area"],
    months: months.length ? months : Array.from({ length: 12 }, (_, i) => i + 1),
    stops,
    transport: $("#dayTransport").value.trim() || "TBD",
    fees: $("#dayFees").value.trim() || "TBD",
    total: $("#dayTotal").value.trim() || "TBD",
    priority: Number($("#dayPriority").value),
    difficulty: $("#dayDifficulty").value,
    rain: $("#dayRain").value,
    reservation: $("#dayReservation").value.trim() || "walk-up likely",
    hours: $("#dayHours").value.trim() || "Verify official hours before leaving",
    closed: $("#dayClosed").value.trim() || "Check closed days and last entry",
    note: $("#dayNote").value.trim(),
    source: BASE_IDS.has(id) ? "original-dashboard" : "custom",
  });

  if (!day.title) {
    showToast("Title is required.");
    return;
  }
  persistDay(day);
  saveState();
  $("#dayDialog").close();
  renderAll();
  showToast("Day plan saved.");
}

function persistDay(day) {
  if (BASE_IDS.has(day.id)) {
    state.overrides[day.id] = day;
  } else {
    state.customDays[day.id] = day;
  }
  state.deletedIds = state.deletedIds.filter((id) => id !== day.id);
}

function deleteEditingDay() {
  const id = $("#dayId").value;
  if (!id || !confirm("Delete this day plan from your planner?")) return;
  if (BASE_IDS.has(id)) {
    if (!state.deletedIds.includes(id)) state.deletedIds.push(id);
    delete state.overrides[id];
  } else {
    delete state.customDays[id];
  }
  delete state.planned[id];
  delete state.completed[id];
  saveState();
  $("#dayDialog").close();
  renderAll();
  showToast("Day plan deleted.");
}

function openPlanDialog(id) {
  if ($("#detailDialog").open) $("#detailDialog").close();
  const day = allDays().find((candidate) => candidate.id === id);
  if (!day) return;
  planningDayId = id;
  const current = state.planned[id] || {};
  $("#planTitle").textContent = day.title;
  $("#planMonth").value = current.month || NOW_MONTH;
  $("#planYear").value = current.year || NOW_YEAR;
  $("#planNote").value = current.note || "";
  $("#planDialog").showModal();
}

function savePlanFromForm(event) {
  event.preventDefault();
  if (!planningDayId) return;
  state.planned[planningDayId] = {
    month: Number($("#planMonth").value),
    year: Number($("#planYear").value),
    note: $("#planNote").value.trim(),
    updatedAt: new Date().toISOString(),
  };
  delete state.completed[planningDayId];
  planningDayId = null;
  saveState();
  $("#planDialog").close();
  renderAll();
  showToast("Trip soft-booked.");
}

function unplanDay(id) {
  delete state.planned[id];
  saveState();
  renderAll();
  showToast("Soft booking removed.");
}

function toggleDone(id) {
  if (state.completed[id]) {
    delete state.completed[id];
    showToast("Moved back to active.");
  } else {
    state.completed[id] = { doneAt: new Date().toISOString() };
    delete state.planned[id];
    showToast("Marked completed.");
  }
  saveState();
  renderAll();
}

function openDetail(id) {
  const day = allDays().find((candidate) => candidate.id === id);
  if (!day) return;
  const plan = state.planned[id];
  $("#detailMeta").textContent = `${day.zone} · ${day.duration || durationFromSub(day.sub)}`;
  $("#detailTitle").textContent = day.title;
  $("#detailBody").innerHTML = `
    <div class="detail-grid">
      <section>
        <div class="trip-tags">${day.tags.map((tag) => `<span class="tag ${escapeAttr(tag)}">${TAG_ICONS[tag] || "◆"} ${escapeHtml(tag)}</span>`).join("")}</div>
        <div class="detail-section">
          <h3>Route</h3>
          <div class="stop-list">${day.stops.map(renderStop).join("")}</div>
        </div>
        <div class="detail-section">
          <h3>Notes</h3>
          <p class="note-line">${escapeHtml(day.note || "No extra notes yet.")}</p>
        </div>
      </section>
      <aside>
        <div class="meta-grid">
          ${plan ? `<span class="status-chip planned">📅 ${MONTHS[plan.month]} ${plan.year}</span>` : ""}
          <span class="mini-chip">${difficultyLabel(day.difficulty)}</span>
          <span class="mini-chip">${rainLabel(day.rain)}</span>
          <span class="mini-chip">Priority ${day.priority}</span>
        </div>
        <div class="detail-section">
          <h3>Before leaving</h3>
          <div class="prep-list">${prepList(day).map((item) => `<div class="prep-item">${escapeHtml(item)}</div>`).join("")}</div>
        </div>
        <div class="detail-section">
          <h3>Trip facts</h3>
          <div class="cost-row">
            <div><span>Transport</span><strong>${escapeHtml(day.transport)}</strong></div>
            <div><span>Entry</span><strong>${escapeHtml(day.fees)}</strong></div>
            <div><span>Total</span><strong>${escapeHtml(day.total)}</strong></div>
          </div>
          <p class="note-line"><strong>Tickets:</strong> ${escapeHtml(day.reservation)}</p>
          <p class="note-line"><strong>Hours:</strong> ${escapeHtml(day.hours)}</p>
          <p class="note-line"><strong>Closed/risk:</strong> ${escapeHtml(day.closed)}</p>
        </div>
        <div class="detail-section card-actions">
          <a class="btn primary" href="${routeUrl(day)}" target="_blank" rel="noreferrer">Route</a>
          <a class="btn" href="${mapSearchUrl(day.title + " " + day.zone)}" target="_blank" rel="noreferrer">Search map</a>
          <button class="btn" data-action="plan-day" data-id="${escapeAttr(day.id)}">Plan</button>
          <button class="btn" data-action="edit-day" data-id="${escapeAttr(day.id)}">Edit</button>
        </div>
      </aside>
    </div>
  `;
  $("#detailDialog").showModal();
}

function prepList(day) {
  const items = [
    "Open the route and check the first train plus the last reasonable return.",
    day.hours,
    day.closed,
    "Bring IC card, cash for small temples/shops, battery pack, and offline map.",
  ];
  if (/book|reserve|advance|required|ticket|ferry|verify/i.test(`${day.reservation} ${day.note}`)) {
    items.push("Confirm booking, ticket release, ferry status, or reservation before committing.");
  }
  if (day.rain === "fair-weather") items.push("Check weather the night before and keep a rain-safe backup ready.");
  if (day.tags.includes("hike")) items.push("Pack water, snacks, proper shoes, headlamp/torch, and a saved trail map.");
  if (day.tags.includes("beach")) items.push("Pack towel, sunscreen, swim gear, and a dry bag.");
  if (day.tags.includes("onsen")) items.push("Pack a small towel and confirm tattoo rules if relevant.");
  if (day.tags.includes("museum") || day.tags.includes("exhibition")) items.push("Check current exhibition dates, last entry, and ticket queue rules.");
  return unique(items.filter(Boolean));
}

function openPoiDialog() {
  renderPoiList();
  $("#poiDialog").showModal();
}

function savePoi() {
  const name = $("#poiName").value.trim();
  if (!name) {
    showToast("POI name is required.");
    return;
  }
  const poi = {
    id: uid("poi"),
    name,
    type: $("#poiType").value,
    zone: $("#poiZone").value.trim(),
    maps: $("#poiMaps").value.trim(),
    notes: $("#poiNotes").value.trim(),
    createdAt: new Date().toISOString(),
  };
  const duplicate = findDuplicatePoi(poi);
  if (duplicate && !confirm(`"${poi.name}" may already exist as "${duplicate}". Save anyway?`)) return;
  const match = findZoneMatch(poi);
  if (match && confirm(`This looks like it could fit into "${match.title}". Add it as a stop there instead of saving as a loose POI?`)) {
    match.stops.push({ t: "+", n: poi.name, d: [poi.type, poi.notes, poi.maps].filter(Boolean).join(" · ") });
    persistDay(match);
    saveState();
    clearPoiForm();
    renderAll();
    renderPoiList();
    showToast("POI added to the matching day plan.");
    return;
  }
  state.pois.push(poi);
  saveState();
  clearPoiForm();
  renderPoiList();
  showToast("POI saved.");
}

function renderPoiList() {
  const selectedCount = $$("#poiList input:checked").length;
  $("#poiCount").textContent = `Saved POIs (${state.pois.length})`;
  $("#buildFromPoiBtn").disabled = selectedCount === 0;
  $("#poiList").innerHTML = state.pois.length ? state.pois.map((poi) => {
    const match = findZoneMatch(poi);
    return `
      <div class="poi-item">
        <input type="checkbox" data-poi-select="${escapeAttr(poi.id)}" aria-label="Select ${escapeAttr(poi.name)}">
        <div>
          <div class="poi-name">${escapeHtml(poi.name)}</div>
          <div class="poi-meta">${escapeHtml([poi.type, poi.zone, poi.notes].filter(Boolean).join(" · "))}</div>
          ${poi.maps ? `<a href="${escapeAttr(poi.maps)}" target="_blank" rel="noreferrer">Google Maps</a>` : ""}
          ${match ? `<div class="poi-meta">Could fit into: ${escapeHtml(match.title)}</div>` : ""}
        </div>
        <button type="button" class="icon-btn" data-action="delete-poi" data-id="${escapeAttr(poi.id)}" aria-label="Delete POI">×</button>
      </div>
    `;
  }).join("") : `<div class="empty-state">No loose POIs yet.</div>`;

  $$("#poiList input[type='checkbox']").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      $("#buildFromPoiBtn").disabled = $$("#poiList input:checked").length === 0;
    });
  });
}

function clearPoiForm() {
  $("#poiName").value = "";
  $("#poiType").value = "museum";
  $("#poiZone").value = "";
  $("#poiMaps").value = "";
  $("#poiNotes").value = "";
}

function deletePoi(id) {
  state.pois = state.pois.filter((poi) => poi.id !== id);
  saveState();
  renderPoiList();
  showToast("POI deleted.");
}

function buildDayFromSelectedPois() {
  const selectedIds = new Set($$("#poiList input:checked").map((input) => input.dataset.poiSelect));
  const pois = state.pois.filter((poi) => selectedIds.has(poi.id));
  if (!pois.length) return;
  const zone = pois.find((poi) => poi.zone)?.zone || "Osaka";
  $("#poiDialog").close();
  openDayDialog();
  $("#dayTitle").value = pois.map((poi) => poi.name).join(" & ");
  $("#dayZone").value = zone;
  $("#dayDuration").value = "Flexible day";
  $("#dayTags").value = unique(pois.map((poi) => poi.type)).join(", ");
  $("#stopsEditor").innerHTML = "";
  pois.forEach((poi) => addStopRowFromStop({ t: "", n: poi.name, d: [poi.type, poi.notes, poi.maps].filter(Boolean).join(" · ") }));
}

function findZoneMatch(poi) {
  const zone = poi.zone?.toLowerCase();
  if (!zone) return null;
  return allDays().find((day) => {
    if (state.completed[day.id]) return false;
    const dz = day.zone.toLowerCase();
    return dz.includes(zone) || zone.includes(dz);
  });
}

function findDuplicatePoi(poi) {
  const name = normalizeText(poi.name);
  const existingPoi = state.pois.find((candidate) => normalizeText(candidate.name) === name);
  if (existingPoi) return existingPoi.name;
  for (const day of allDays()) {
    for (const stop of day.stops) {
      if (normalizeText(stop.n || "").includes(name) || name.includes(normalizeText(stop.n || ""))) return stop.n;
    }
  }
  return null;
}

function exportBackup() {
  const payload = {
    name: "Osaka Day Trip Planner backup",
    exportedAt: new Date().toISOString(),
    version: 3,
    state,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `osaka-trip-planner-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("Backup exported.");
}

async function importBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const incoming = payload.state || payload;
    const merged = mergeState(defaultState(), incoming);
    if (!confirm("Import this backup and replace the current local planner state?")) return;
    state = merged;
    saveState();
    renderAll();
    showToast("Backup imported.");
  } catch (error) {
    console.error(error);
    showToast("Import failed. Use a planner JSON backup.");
  } finally {
    event.target.value = "";
  }
}

function clearFilters() {
  state.filters = { ...defaultState().filters, sort: state.filters.sort };
  saveState();
  renderAll();
}

function summarize(days) {
  const completed = Object.keys(state.completed).filter((id) => days.some((day) => day.id === id)).length;
  const planned = Object.keys(state.planned).filter((id) => days.some((day) => day.id === id)).length;
  return {
    total: days.length,
    planned,
    completed,
    remaining: Math.max(days.length - completed, 0),
  };
}

function searchText(day) {
  return [
    day.title,
    day.sub,
    day.zone,
    day.duration,
    day.tags.join(" "),
    day.transport,
    day.fees,
    day.total,
    day.note,
    day.priority,
    day.difficulty,
    day.rain,
    day.reservation,
    day.hours,
    day.closed,
    day.stops.map((stop) => `${stop.t} ${stop.n} ${stop.d} ${stop.trail || ""}`).join(" "),
    day.months.map((month) => MONTHS[month]).join(" "),
  ].join(" ").toLowerCase();
}

function estimatedCost(day) {
  const totalValues = yenValues(day.total);
  if (totalValues.length) return Math.min(...totalValues);
  const values = yenValues(`${day.transport} ${day.fees}`);
  if (!values.length) return 999999;
  return Math.min(...values);
}

function yenValues(value) {
  return [...String(value).matchAll(/[¥￥]\s*([0-9,]+)/g)]
    .map((match) => Number(match[1].replace(/,/g, "")))
    .filter(Boolean);
}

function durationScore(day) {
  const s = searchText(day);
  if (/brutal|8\.5hr|7\.5hr|6\.5/.test(s)) return 5;
  if (/full/.test(s)) return 4;
  if (/half/.test(s)) return 2;
  return 3;
}

function inferDifficulty(day) {
  const s = JSON.stringify(day).toLowerCase();
  if (/hard|brutal/.test(s)) return "hard";
  if (/moderate/.test(s)) return "moderate";
  return day.tags?.includes("hike") ? "moderate" : "easy";
}

function inferRain(tags) {
  if (tags.some((tag) => ["museum", "exhibition", "onsen", "food", "train"].includes(tag))) return "rain-friendly";
  if (tags.some((tag) => ["hike", "beach", "coast", "nature"].includes(tag))) return "fair-weather";
  return "mixed";
}

function inferReservation(day) {
  const s = JSON.stringify(day).toLowerCase();
  return /book|reservation|required|advance|ticket|ferry|sell out/.test(s) ? "verify/book ahead" : "walk-up likely";
}

function difficultyLabel(value) {
  return value === "hard" ? "Hard effort" : value === "moderate" ? "Moderate effort" : "Easygoing";
}

function rainLabel(value) {
  if (value === "rain-friendly") return "Rain-friendly";
  if (value === "fair-weather") return "Fair-weather";
  return "Mixed weather";
}

function durationFromSub(sub = "") {
  return sub.split("·")[0]?.trim() || "";
}

function splitList(value = "") {
  return Array.isArray(value) ? value : String(value).split(",").map((part) => part.trim()).filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareTitles(a, b) {
  return a.title.localeCompare(b.title);
}

function titleCase(value) {
  return String(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeText(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function mapSearchUrl(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query + " Japan")}`;
}

function routeUrl(day) {
  const stops = day.stops.filter((stop) => stop.n).map((stop) => stop.n);
  if (!stops.length) return mapSearchUrl(day.title);
  const destination = stops.at(-1);
  const waypoints = stops.slice(0, -1).slice(0, 8).join("|");
  const params = new URLSearchParams({
    api: "1",
    origin: "Osaka Station",
    destination: `${destination} Japan`,
    travelmode: "transit",
  });
  if (waypoints) params.set("waypoints", waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function scrollToCards() {
  $("#cards").scrollIntoView({ block: "start", behavior: "smooth" });
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value = "") {
  return escapeHtml(value);
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
