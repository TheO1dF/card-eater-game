import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const debugPort = Number(process.argv[2] ?? 9223);
const gameUrl = process.argv[3] ?? "http://127.0.0.1:8765";
const outputDir = resolve(process.argv[4] ?? ".artifacts/smoke");
const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
const target = targets.find((item) => item.type === "page");
if (!target) throw new Error("No debuggable Chrome page found.");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolveOpen, rejectOpen) => {
  socket.addEventListener("open", resolveOpen, { once: true });
  socket.addEventListener("error", rejectOpen, { once: true });
});

let nextId = 1;
const pending = new Map();
const browserErrors = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve: resolveMessage, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolveMessage(message.result);
  }
  if (message.method === "Runtime.exceptionThrown") {
    browserErrors.push(message.params.exceptionDetails.text);
  }
  if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
    browserErrors.push(message.params.entry.text);
  }
});

function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolveMessage, reject) => pending.set(id, { resolve: resolveMessage, reject }));
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(expression, timeout = 8000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await wait(100);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function clickElement(selector) {
  const point = await evaluate(`(() => {
    const rect = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  })()`);
  if (!point) throw new Error(`Element not found: ${selector}`);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
}

async function capture(name) {
  const result = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  await writeFile(resolve(outputDir, `${name}.png`), Buffer.from(result.data, "base64"));
}

await mkdir(outputDir, { recursive: true });
await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");

const reports = [];
for (const viewport of [
  { name: "mobile", width: 390, height: 844, mobile: true },
  { name: "desktop", width: 1280, height: 800, mobile: false },
]) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
    screenWidth: viewport.width,
    screenHeight: viewport.height,
  });
  await send("Page.navigate", { url: `${gameUrl}?smoke=${viewport.name}-${Date.now()}` });
  await waitFor('document.readyState === "complete" && typeof document.querySelector("#startGameButton")?.onclick === "function"');
  await capture(`${viewport.name}-welcome`);
  await clickElement("#startGameButton");
  await waitFor('document.querySelectorAll(".rule-card").length > 0');
  await capture(`${viewport.name}-draft`);
  const draftCount = await evaluate('document.querySelectorAll(".rule-card").length');
  const audioBeforeRule = await evaluate('(async () => (await import("./js/audio.js")).getAudioStatus())()');
  await clickElement(".rule-card");
  await wait(2200);
  await capture(`${viewport.name}-playing`);
  const state = await evaluate(`({
    phase: document.querySelector("#phaseValue")?.textContent,
    cards: document.querySelectorAll(".game-card").length,
    active_cards: document.querySelectorAll(".game-card.is-active").length,
    body_width: document.body.scrollWidth,
    viewport_width: document.documentElement.clientWidth
  })`);
  let actions = 0;
  while (actions < 30) {
    const screen = await evaluate(`(() => {
      if (document.querySelector("#roundSummary")?.classList.contains("show")) return { summary: true };
      const card = document.querySelector(".game-card.is-active");
      return card ? { summary: false, edible: card.classList.contains("card-edible") } : null;
    })()`);
    if (!screen || screen.summary) break;
    await clickElement(screen.edible ? "#eatButton" : "#discardButton");
    actions += 1;
    await wait(230);
  }
  await wait(300);
  await capture(`${viewport.name}-summary`);
  const roundComplete = await evaluate(`({
    summary_visible: document.querySelector("#roundSummary")?.classList.contains("show"),
    gold: Number(document.querySelector("#goldValue")?.textContent),
    remaining: Number(document.querySelector("#remainingValue")?.textContent)
  })`);
  if (roundComplete.summary_visible) {
    await clickElement("#summaryContinueBtn");
    await waitFor('document.querySelector("#shopPanel")?.classList.contains("show")');
    await wait(350);
    await capture(`${viewport.name}-shop`);
  }
  const shopState = await evaluate(`({
    shop_visible: document.querySelector("#shopPanel")?.classList.contains("show"),
    offer_count: document.querySelectorAll(".shop-card").length,
    loaded_sprite_sheets: [...document.querySelectorAll(".shop-card-icon")].map((node) => getComputedStyle(node).backgroundImage)
  })`);
  reports.push({ viewport: viewport.name, draft_count: draftCount, audio_before_rule: audioBeforeRule, ...state, actions, ...roundComplete, ...shopState });
}

socket.close();
console.log(JSON.stringify({ reports, browser_errors: browserErrors }, null, 2));
