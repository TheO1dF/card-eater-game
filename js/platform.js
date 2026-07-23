const RECORD_KEY = "cardeater.run-history.v1";
const TUTORIAL_KEY = "cardeater.story-tutorial.v1";

function makeId(card, index = 0) {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${card?.id ?? "card"}-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadRecords() {
  try {
    const value = JSON.parse(localStorage.getItem(RECORD_KEY) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveRecord(record) {
  const records = [...loadRecords(), record]
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
  try { localStorage.setItem(RECORD_KEY, JSON.stringify(records)); } catch { /* Storage may be disabled. */ }
  return records;
}

function loadTutorialComplete() {
  try { return localStorage.getItem(TUTORIAL_KEY) === "complete"; } catch { return false; }
}

function saveTutorialComplete() {
  try { localStorage.setItem(TUTORIAL_KEY, "complete"); } catch { /* Storage may be disabled. */ }
  return true;
}

export const browserPlatform = Object.freeze({
  now: () => Date.now(),
  random: () => Math.random(),
  create_id: makeId,
  vibrate: (pattern = 8) => globalThis.navigator?.vibrate?.(pattern),
  load_records: loadRecords,
  save_record: saveRecord,
  load_tutorial_complete: loadTutorialComplete,
  save_tutorial_complete: saveTutorialComplete,
});
