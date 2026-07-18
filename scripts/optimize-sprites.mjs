import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const debugPort = Number(process.argv[2] ?? 9226);
const siteUrl = process.argv[3] ?? "http://127.0.0.1:8766/";
const quality = Number(process.argv[4] ?? 0.82);
const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const sheets = [
  "card-sprites.png",
  "card-sprites-set-1.png",
  "card-sprites-set-2.png",
  "card-sprites-set-3.png",
  "card-sprites-set-4.png",
  "card-sprites-set-5.png",
];

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
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const handlers = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) handlers.reject(new Error(message.error.message));
  else handlers.resolve(message.result);
});

function send(method, params = {}) {
  const id = nextId;
  nextId += 1;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolveMessage, reject) => pending.set(id, { resolve: resolveMessage, reject }));
}

await send("Page.enable");
await send("Page.navigate", { url: siteUrl });
await new Promise((resolveWait) => setTimeout(resolveWait, 500));

const expression = `(async () => {
  const sheets = ${JSON.stringify(sheets)};
  const quality = ${JSON.stringify(quality)};
  const sheetOutput = [];
  const loadedSheets = new Map();
  for (const source of sheets) {
    const image = new Image();
    image.src = new URL(\`assets/\${source}\`, location.href).href;
    await image.decode();
    loadedSheets.set(source, image);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { alpha: true });
    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0);
    const dataUrl = canvas.toDataURL("image/webp", quality);
    sheetOutput.push({ source, data: dataUrl.slice(dataUrl.indexOf(",") + 1) });
  }

  const { CARD_LIBRARY } = await import("./js/data.js");
  const cardOutput = [];
  const size = 320;
  for (const card of Object.values(CARD_LIBRARY)) {
    const source = card.sprite_sheet.replace(/\\.webp$/u, ".png");
    const image = loadedSheets.get(source);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d", { alpha: true });
    context.imageSmoothingEnabled = false;

    if (card.sprite_rows === 2) {
      const width = 4.5 * size;
      const height = width * image.naturalHeight / image.naturalWidth;
      const x = (0.05 - 0.9 * card.sprite_x) * size;
      const positionY = card.sprite_y === 0 ? 0.125 : 0.875;
      const y = (size - height) * positionY;
      context.drawImage(image, x, y, width, height);
    } else {
      const width = card.sprite_columns * size;
      const height = card.sprite_rows * size;
      context.drawImage(image, -card.sprite_x * size, -card.sprite_y * size, width, height);
    }

    const dataUrl = canvas.toDataURL("image/webp", quality);
    cardOutput.push({ id: card.id.toLowerCase(), data: dataUrl.slice(dataUrl.indexOf(",") + 1) });
  }
  return { sheets: sheetOutput, cards: cardOutput };
})()`;

const result = await send("Runtime.evaluate", {
  expression,
  awaitPromise: true,
  returnByValue: true,
});
if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);

for (const item of result.result.value.sheets) {
  const outputName = item.source.replace(/\.png$/u, ".webp");
  await writeFile(resolve(root, "assets", outputName), Buffer.from(item.data, "base64"));
  console.log(`Optimized ${item.source} -> ${outputName}`);
}

const cardOutput = resolve(root, "assets", "cards");
await mkdir(cardOutput, { recursive: true });
for (const item of result.result.value.cards) {
  const outputName = `${item.id}.webp`;
  await writeFile(resolve(cardOutput, outputName), Buffer.from(item.data, "base64"));
  console.log(`Exported card -> cards/${outputName}`);
}

socket.close();
