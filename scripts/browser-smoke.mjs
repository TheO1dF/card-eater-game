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
    const element = document.querySelector(${JSON.stringify(selector)});
    element?.scrollIntoView({ block: "center", inline: "center" });
    const rect = element?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  })()`);
  if (!point) throw new Error(`Element not found: ${selector}`);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
}

async function swipeElement(selector, direction) {
  const rect = await evaluate(`(() => {
    const bounds = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();
    return bounds ? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2, height: bounds.height } : null;
  })()`);
  if (!rect) throw new Error(`Element not found: ${selector}`);
  const distance = Math.max(110, rect.height * 0.34);
  const endY = rect.y + (direction === "eat" ? distance : -distance);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x, y: rect.y, button: "left", buttons: 1, clickCount: 1 });
  await wait(24);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: rect.x, y: (rect.y + endY) / 2, button: "left", buttons: 1 });
  await wait(24);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: rect.x, y: endY, button: "left", buttons: 1 });
  await wait(24);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x, y: endY, button: "left", buttons: 0, clickCount: 1 });
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
  if (viewport.mobile) {
    // Reproduce iOS/weak-network behavior where decode() can remain pending.
    // Entering the shop and round two must never wait for decorative art.
    await evaluate('HTMLImageElement.prototype.decode = () => new Promise(() => {})');
  }
  await capture(`${viewport.name}-welcome`);
  const onboarding = await evaluate(`(() => {
    const panel = document.querySelector(".welcome-panel");
    const objective = document.querySelector(".welcome-objective");
    const loop = document.querySelector(".welcome-loop");
    const rect = panel?.getBoundingClientRect();
    return {
      objective_text: objective?.textContent?.replace(/\\s+/g, " ").trim(),
      loop_step_count: loop?.children.length ?? 0,
      welcome_horizontal_overflow: Boolean(rect && (rect.left < -1 || rect.right > innerWidth + 1)),
      start_button_visible: Boolean(document.querySelector("#startGameButton")?.getBoundingClientRect().height),
    };
  })()`);
  await clickElement("#startGameButton");
  await waitFor('document.querySelectorAll(".rule-card").length > 0');
  await wait(180);
  await capture(`${viewport.name}-draft`);
  const draftCount = await evaluate('document.querySelectorAll(".rule-card").length');
  const draftGoal = await evaluate(`(() => ({
    target: document.querySelector("#draftTargetText")?.textContent,
    progress: document.querySelector("#draftTargetProgress")?.textContent,
    fill_width: document.querySelector("#draftTargetFill")?.style.width,
    help: document.querySelector(".rule-help")?.textContent?.replace(/\\s+/g, " ").trim(),
    tiers: [...document.querySelectorAll(".rule-tier")].map((node) => node.textContent),
  }))()`);
  const audioBeforeRule = await evaluate('(async () => (await import("./js/audio.js")).getAudioStatus())()');
  const audioOverflowSafe = await evaluate(`(async () => {
    const audio = await import("./js/audio.js");
    audio.playSound("eat", Number.MAX_VALUE);
    audio.playSound("effect", Number.POSITIVE_INFINITY);
    return true;
  })()`);
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
  const deckViewer = {};
  deckViewer.button_visible = await evaluate(`(() => {
    const button = document.querySelector("#deckInfoButton");
    const style = button ? getComputedStyle(button) : null;
    return Boolean(button && style?.display !== "none" && style?.visibility !== "hidden");
  })()`);
  deckViewer.topbar_buttons_overlap = await evaluate(`(() => {
    const selectors = ["#deckInfoButton", "#questInfoButton", "#soundButton", "#phaseValue"];
    const rects = selectors.map((selector) => document.querySelector(selector)?.getBoundingClientRect()).filter(Boolean);
    return rects.some((left, index) => rects.slice(index + 1).some((right) => !(
      left.right <= right.left || right.right <= left.left || left.bottom <= right.top || right.bottom <= left.top
    )));
  })()`);
  await clickElement("#deckInfoButton");
  await waitFor('document.querySelector("#deckStatus")?.classList.contains("show")');
  await wait(180);
  deckViewer.card_count = await evaluate('document.querySelectorAll("#deckStatusList .deck-status-card").length');
  deckViewer.effect_count = await evaluate('document.querySelectorAll("#deckStatusList .deck-status-card i").length');
  deckViewer.summary_text = await evaluate('document.querySelector("#deckStatusSummary")?.textContent?.replace(/\\s+/g, " ").trim()');
  deckViewer.keyword_count = await evaluate('document.querySelectorAll("#keywordGlossaryList > div").length');
  Object.assign(deckViewer, await evaluate(`(() => {
    const topbar = document.querySelector(".topbar")?.getBoundingClientRect();
    const overlay = document.querySelector("#deckStatus")?.getBoundingClientRect();
    const panel = document.querySelector(".deck-status-panel")?.getBoundingClientRect();
    const list = document.querySelector("#deckStatusList");
    const close = document.querySelector("#deckStatusClose")?.getBoundingClientRect();
    return {
      overlay_clears_topbar: Boolean(topbar && overlay && overlay.top >= topbar.bottom - 1),
      panel_inside_overlay: Boolean(panel && overlay && panel.top >= overlay.top && panel.bottom <= overlay.bottom + 1),
      close_button_visible: Boolean(close && close.top >= 0 && close.bottom <= innerHeight),
      list_scroll_height: list?.scrollHeight ?? 0,
      list_client_height: list?.clientHeight ?? 0,
      deck_horizontal_overflow: Boolean(panel && panel.right > innerWidth + 1),
      capacity_cell_count: document.querySelectorAll("#deckCapacitySummary > div").length,
    };
  })()`));
  await capture(`${viewport.name}-deck-status`);
  await clickElement("#deckStatusClose");
  await waitFor('!document.querySelector("#deckStatus")?.classList.contains("show")');
  let actions = 0;
  while (actions < 30) {
    const screen = await evaluate(`(() => {
      if (document.querySelector("#roundSummary")?.classList.contains("show")) return { summary: true };
      const card = document.querySelector(".game-card.is-active");
      return card ? { summary: false, edible: card.classList.contains("card-edible") } : null;
    })()`);
    if (!screen || screen.summary) break;
    if (viewport.mobile) await swipeElement(".game-card.is-active", screen.edible ? "eat" : "discard");
    else await clickElement(screen.edible ? "#eatButton" : "#discardButton");
    actions += 1;
    await wait(230);
  }
  await wait(300);
  await capture(`${viewport.name}-summary`);
  const roundComplete = await evaluate(`({
    summary_visible: document.querySelector("#roundSummary")?.classList.contains("show"),
    gold: Number(document.querySelector("#goldValue")?.textContent),
    remaining: Number.parseInt(document.querySelector("#remainingValue")?.textContent ?? "0", 10)
  })`);
  const deleteConfirmation = { attempted: false };
  if (roundComplete.summary_visible) {
    await clickElement("#summaryContinueBtn");
    await waitFor('document.querySelector("#shopPanel")?.classList.contains("show")');
    await wait(350);
    await capture(`${viewport.name}-shop`);
    deleteConfirmation.attempted = true;
    deleteConfirmation.deck_before = await evaluate('document.querySelectorAll("#shopDeckList .deck-chip").length');
    await clickElement("#shopDeckList .deck-chip");
    await waitFor('document.querySelector("#deleteConfirm")?.classList.contains("show")');
    await wait(180);
    deleteConfirmation.dialog_role = await evaluate('document.querySelector("#deleteConfirm")?.getAttribute("role")');
    deleteConfirmation.warning = await evaluate('document.querySelector("#deleteConfirmWarning")?.textContent');
    deleteConfirmation.accept_label = await evaluate('document.querySelector("#deleteConfirmAccept")?.textContent');
    deleteConfirmation.deck_while_open = await evaluate('document.querySelectorAll("#shopDeckList .deck-chip").length');
    await capture(`${viewport.name}-delete-confirm`);
    await clickElement("#deleteConfirmCancel");
    await waitFor('!document.querySelector("#deleteConfirm")?.classList.contains("show")');
    deleteConfirmation.deck_after_cancel = await evaluate('document.querySelectorAll("#shopDeckList .deck-chip").length');
    await clickElement("#shopDeckList .deck-chip");
    await waitFor('document.querySelector("#deleteConfirm")?.classList.contains("show")');
    await clickElement("#deleteConfirmAccept");
    await waitFor('!document.querySelector("#deleteConfirm")?.classList.contains("show")');
    await wait(180);
    deleteConfirmation.deck_after_accept = await evaluate('document.querySelectorAll("#shopDeckList .deck-chip").length');
    deleteConfirmation.message_after_accept = await evaluate('document.querySelector("#shopMessage")?.textContent');
  }
  const shopState = await evaluate(`({
    shop_visible: document.querySelector("#shopPanel")?.classList.contains("show"),
    offer_count: document.querySelectorAll(".shop-card").length,
    item_offer_count: document.querySelectorAll(".shop-item-card").length,
    plate_summary: document.querySelector("#shopPlateSummary")?.textContent?.replace(/\\s+/g, " ").trim(),
    plate_upgrade_label: document.querySelector("#shopPlateUpgrade")?.textContent,
    plate_upgrade_detail: document.querySelector("#shopPlateUpgradeDetail")?.textContent,
    loaded_sprite_sheets: [...document.querySelectorAll(".shop-card-icon")].map((node) => getComputedStyle(node).backgroundImage)
  })`);
  const secondRound = { second_round_attempted: false };
  if (shopState.shop_visible) {
    secondRound.second_round_attempted = true;
    await clickElement("#shopContinue");
    await waitFor('document.querySelector("#ruleDraft")?.classList.contains("show") && document.querySelector("#draftRoundValue")?.textContent === "02"');
    secondRound.second_draft_count = await evaluate('document.querySelectorAll(".rule-card").length');
    await capture(`${viewport.name}-round-2-draft`);
    await clickElement(".rule-card");
    await wait(2200);
    secondRound.second_phase = await evaluate('document.querySelector("#phaseValue")?.textContent');
    secondRound.second_start_remaining = await evaluate('Number.parseInt(document.querySelector("#remainingValue")?.textContent ?? "0", 10)');
    await capture(`${viewport.name}-round-2-playing`);
    let secondActions = 0;
    while (secondActions < 30) {
      const screen = await evaluate(`(() => {
        if (document.querySelector("#roundSummary")?.classList.contains("show")) return { summary: true };
        const card = document.querySelector(".game-card.is-active");
        return card ? { summary: false, edible: card.classList.contains("card-edible") } : null;
      })()`);
      if (!screen || screen.summary) break;
      if (viewport.mobile) await swipeElement(".game-card.is-active", screen.edible ? "eat" : "discard");
      else await clickElement(screen.edible ? "#eatButton" : "#discardButton");
      secondActions += 1;
      await wait(230);
    }
    await wait(300);
    secondRound.second_actions = secondActions;
    secondRound.second_summary_visible = await evaluate('document.querySelector("#roundSummary")?.classList.contains("show")');
    secondRound.second_remaining = await evaluate('Number.parseInt(document.querySelector("#remainingValue")?.textContent ?? "0", 10)');
    secondRound.second_continue_disabled = await evaluate('document.querySelector("#summaryContinueBtn")?.disabled');
    secondRound.second_milestone_text = await evaluate('document.querySelector("#summaryMilestoneScore")?.textContent');
    await capture(`${viewport.name}-round-2-summary`);
    if (secondRound.second_summary_visible) {
      await clickElement("#summaryContinueBtn");
      await waitFor('document.querySelector("#shopPanel")?.classList.contains("show")');
      await clickElement("#shopContinue");
      await waitFor('document.querySelector("#ruleDraft")?.classList.contains("show") && document.querySelector("#draftRoundValue")?.textContent === "03"');
      secondRound.third_draft_visible = true;
      secondRound.third_draft_count = await evaluate('document.querySelectorAll(".rule-card").length');
      await capture(`${viewport.name}-round-3-draft`);
      await clickElement(".rule-card");
      await waitFor('document.querySelector("#questDraft")?.classList.contains("show")');
      await wait(180);
      secondRound.quest_draft_count = await evaluate('document.querySelectorAll(".quest-card").length');
      secondRound.quest_round = await evaluate('document.querySelector("#questRoundValue")?.textContent');
      await capture(`${viewport.name}-round-3-quest`);
      await clickElement(".quest-card");
      await wait(2200);
      secondRound.third_phase = await evaluate('document.querySelector("#phaseValue")?.textContent');
      secondRound.third_start_remaining = await evaluate('Number.parseInt(document.querySelector("#remainingValue")?.textContent ?? "0", 10)');
      secondRound.quest_info_enabled = await evaluate('!document.querySelector("#questInfoButton")?.disabled');
      await clickElement("#questInfoButton");
      await waitFor('document.querySelector("#questStatus")?.classList.contains("show")');
      await wait(180);
      secondRound.quest_status_text = await evaluate('document.querySelector("#questStatusContent")?.textContent?.replace(/\\s+/g, " ").trim()');
      await capture(`${viewport.name}-round-3-quest-status`);
      await clickElement("#questStatusClose");
      await waitFor('!document.querySelector("#questStatus")?.classList.contains("show")');
      await capture(`${viewport.name}-round-3-playing`);
      let thirdActions = 0;
      while (thirdActions < 30) {
        const screen = await evaluate(`(() => {
          if (document.querySelector("#roundSummary")?.classList.contains("show")) return { summary: true };
          const card = document.querySelector(".game-card.is-active");
          return card ? { summary: false, edible: card.classList.contains("card-edible") } : null;
        })()`);
        if (!screen || screen.summary) break;
        if (viewport.mobile) await swipeElement(".game-card.is-active", screen.edible ? "eat" : "discard");
        else await clickElement(screen.edible ? "#eatButton" : "#discardButton");
        thirdActions += 1;
        await wait(230);
      }
      await wait(300);
      secondRound.third_actions = thirdActions;
      secondRound.third_summary_visible = await evaluate('document.querySelector("#roundSummary")?.classList.contains("show")');
      secondRound.third_quest_result = await evaluate('document.querySelector("#summaryQuestResult")?.textContent');
      secondRound.third_score_is_finite = await evaluate(`(() => {
        const text = document.querySelector("#scoreValue")?.textContent ?? "";
        return !/NaN|Infinity/.test(text);
      })()`);
      await capture(`${viewport.name}-round-3-summary`);
      if (secondRound.third_summary_visible) {
        await clickElement("#summaryContinueBtn");
        await waitFor('document.querySelector("#shopPanel")?.classList.contains("show")');
        secondRound.third_shop_offer_count = await evaluate('document.querySelectorAll(".shop-card").length');
        secondRound.third_shop_item_count = await evaluate('document.querySelectorAll(".shop-item-card").length');
        secondRound.reroll_gold_before = await evaluate('Number(document.querySelector("#shopGold")?.textContent)');
        secondRound.reroll_label_before = await evaluate('document.querySelector("#shopReroll")?.textContent');
        await clickElement("#shopReroll");
        await wait(250);
        secondRound.reroll_gold_after = await evaluate('Number(document.querySelector("#shopGold")?.textContent)');
        secondRound.reroll_label_after = await evaluate('document.querySelector("#shopReroll")?.textContent');
        secondRound.reroll_offer_count = await evaluate('document.querySelectorAll(".shop-card").length');
        secondRound.reroll_item_offer_count = await evaluate('document.querySelectorAll(".shop-item-card").length');
        secondRound.buy_after_reroll_gold_before = secondRound.reroll_gold_after;
        secondRound.buy_after_reroll_offer_before = secondRound.reroll_offer_count;
        const affordableCard = await evaluate(`(() => {
          const gold = Number(document.querySelector("#shopGold")?.textContent);
          const prices = [...document.querySelectorAll(".shop-card .price-tag")].map((node) => Number(node.textContent.replace(/[^0-9.-]/g, "")));
          const index = prices.findIndex((price) => Number.isFinite(price) && price <= gold);
          return { index, prices, gold };
        })()`);
        secondRound.buy_after_reroll_prices = affordableCard.prices;
        secondRound.buy_after_reroll_affordable_index = affordableCard.index;
        if (affordableCard.index >= 0) {
          await clickElement(`.shop-card:nth-child(${affordableCard.index + 1})`);
          await wait(180);
        }
        secondRound.buy_after_reroll_gold_after = await evaluate('Number(document.querySelector("#shopGold")?.textContent)');
        secondRound.buy_after_reroll_offer_after = await evaluate('document.querySelectorAll(".shop-card").length');
        secondRound.buy_after_reroll_message = await evaluate('document.querySelector("#shopMessage")?.textContent');
        await capture(`${viewport.name}-round-3-shop-rerolled`);
        await clickElement("#shopContinue");
        await waitFor('document.querySelector("#ruleDraft")?.classList.contains("show") && document.querySelector("#draftRoundValue")?.textContent === "04"');
        secondRound.fourth_draft_visible = true;
      }
    }
  }
  reports.push({ viewport: viewport.name, draft_count: draftCount, audio_before_rule: audioBeforeRule, audio_overflow_safe: audioOverflowSafe, ...onboarding, ...draftGoal, ...state, ...deckViewer, actions, ...roundComplete, ...deleteConfirmation, ...shopState, ...secondRound });
}

socket.close();
const failures = [];
for (const report of reports) {
  const fail = (condition, message) => { if (!condition) failures.push(`${report.viewport}: ${message}`); };
  fail(report.draft_count === 3, "规则三选一数量异常");
  fail(report.objective_text?.includes("100 / 500 / 1800"), "欢迎页未明确显示三阶段目标");
  fail(report.loop_step_count === 3, "欢迎页缺少三步流程");
  fail(report.welcome_horizontal_overflow === false, "欢迎页横向溢出");
  fail(report.target?.includes("100"), "规则页未显示下一阶段目标");
  fail(report.progress?.includes("还差") && report.progress?.includes("剩余"), "规则页缺少目标差值或剩余轮次");
  fail(report.help?.includes("规则怎么用"), "规则页缺少简要说明");
  fail(report.tiers?.length === 3, "规则卡缺少分层标签");
  fail(report.body_width <= report.viewport_width, "游戏页面横向溢出");
  fail(report.topbar_buttons_overlap === false, "顶栏按钮互相遮挡");
  fail(report.deck_horizontal_overflow === false, "牌组面板横向溢出");
  fail(report.card_count > 0 && report.effect_count === report.card_count, "牌组面板没有完整显示卡牌效果");
  fail(report.capacity_cell_count === 4, "牌组面板缺少餐盘容量信息");
  fail(report.summary_visible === true, "第一轮未正常结算");
  fail(report.shop_visible === true && report.offer_count === 3 && report.item_offer_count === 3, "商店商品数量异常");
  fail(report.attempted === true && report.dialog_role === "alertdialog", "删牌确认浮窗未打开");
  fail(report.deck_while_open === report.deck_before, "打开确认浮窗时牌已被误删");
  fail(report.deck_after_cancel === report.deck_before, "取消删牌后牌组发生变化");
  fail(report.deck_after_accept === report.deck_before - 1, "确认删牌后牌组未恰好减少一张");
  fail(report.message_after_accept?.includes("删除"), "确认删牌后缺少交易反馈");
  fail(report.second_summary_visible === true && report.third_summary_visible === true, "未完成前三轮结算");
  fail(report.quest_draft_count === 3 && report.quest_info_enabled === true, "第 3 轮任务流程异常");
  fail(report.reroll_offer_count === 3 && report.reroll_item_offer_count === 3, "第 3 轮刷新未补齐商品");
  fail(
    report.buy_after_reroll_affordable_index < 0
      || report.buy_after_reroll_offer_after === report.buy_after_reroll_offer_before - 1,
    "金币充足时刷新后购买未正常完成",
  );
  fail(report.fourth_draft_visible === true, "未连续推进到第 4 轮");
}
if (browserErrors.length > 0) failures.push(`浏览器控制台错误：${browserErrors.join(" | ")}`);
const finalReport = { reports, browser_errors: browserErrors, failures };
await writeFile(resolve(outputDir, "report.json"), `${JSON.stringify(finalReport, null, 2)}\n`, "utf8");
console.log(JSON.stringify(finalReport, null, 2));
if (failures.length > 0) throw new Error(`Edge smoke failed:\n${failures.join("\n")}`);
