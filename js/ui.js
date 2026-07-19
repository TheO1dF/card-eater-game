import { GAME_CONFIG, getNextMilestone } from "./config.js";
import { getItemById } from "./items.js";
import { formatScore } from "./numbers.js";
import { getQuestRequirement, getQuestTarget } from "./quests.js";
import { KEYWORD_LIBRARY } from "./keywords.js";
import { getCardById } from "./data.js";
import { getPlateSummary } from "./plate.js";

const PHASE_LABELS = Object.freeze({
  Init: "准备中", RuleDraft: "规则选择", QuestDraft: "任务选择", Playing: "出牌中", Scoring: "结算中",
  Shop: "商店", NextRound: "下一轮", GameOver: "本局结束",
});

const RARITY_CLASS = Object.freeze({ "普通": "common", "罕见": "uncommon", "稀有": "rare", "传奇": "legendary", "诅咒": "curse" });
const EDIBILITY_LABEL = Object.freeze({ edible: "可食用", inedible: "不可食用" });
const ROLE_LABEL = Object.freeze({ baseline: "基础", setup: "启动", payoff: "收割", sacrifice: "牺牲", engine: "成长引擎", economy: "经济" });
const CARD_ART_VERSION = 8;
const CARD_ATLAS_VERSION = 10;
const cardArtCache = new Map();
const signed = (value) => value > 0 ? `+${formatScore(value)}` : formatScore(value);
const cardArtUrl = (card) => card.runtime_art_mode === "atlas"
  ? `./assets/${card.runtime_atlas}?v=${CARD_ATLAS_VERSION}`
  : `./assets/${card.art_file}?v=${CARD_ART_VERSION}`;

function warmCardArt(cards) {
  const ready = cards.map((card) => {
    if (!card.art_file) return;
    const url = cardArtUrl(card);
    if (cardArtCache.has(url)) return cardArtCache.get(url).ready;
    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = "high";
    image.src = url;
    const imageReady = image.decode().catch(() => undefined);
    cardArtCache.set(url, { image, ready: imageReady });
    return imageReady;
  });
  return Promise.all(ready.filter(Boolean));
}

function spriteStyle(card) {
  const hue = Number(card.sprite_hue ?? 0);
  const scale = Number(card.sprite_scale ?? 1);
  if (card.runtime_art_mode === "atlas") {
    const columns = Number(card.runtime_columns);
    const rows = Number(card.runtime_rows);
    const x = Number(card.runtime_x) * 100 / (columns - 1);
    const y = Number(card.runtime_y) * 100 / (rows - 1);
    return `--sprite-image:url('${cardArtUrl(card)}');--sprite-x:${x}%;--sprite-y:${y}%;--sprite-size-x:${columns * 100}%;--sprite-size-y:${rows * 100}%;--sprite-hue:${hue}deg;--sprite-scale:${scale};`;
  }
  if (card.art_file) {
    return `--sprite-image:url('${cardArtUrl(card)}');--sprite-x:50%;--sprite-y:50%;--sprite-size-x:100%;--sprite-size-y:100%;--sprite-hue:${hue}deg;--sprite-scale:${scale};`;
  }
  const columns = Math.max(1, Number(card.sprite_columns ?? 5));
  const rows = Math.max(1, Number(card.sprite_rows ?? 4));
  const spriteX = Number(card.sprite_x ?? 0);
  const spriteY = Number(card.sprite_y ?? 0);
  // Generated sheets are 3:2 canvases containing a 5x2 grid. Render them with
  // their original aspect ratio and a little breathing room instead of
  // stretching every grid cell into a square.
  const generatedSheet = columns === 5 && rows === 2;
  const x = generatedSheet
    ? ((0.9 * spriteX - 0.05) / 3.5) * 100
    : spriteX * (columns === 1 ? 0 : 100 / (columns - 1));
  const y = generatedSheet
    ? (spriteY === 0 ? 12.5 : 87.5)
    : spriteY * (rows === 1 ? 0 : 100 / (rows - 1));
  const backgroundWidth = generatedSheet ? "450%" : `${columns * 100}%`;
  const backgroundHeight = generatedSheet ? "auto" : `${rows * 100}%`;
  const sheet = card.sprite_sheet ?? "card-sprites.webp";
  return `--sprite-image:url('./assets/${sheet}?v=3');--sprite-x:${x}%;--sprite-y:${y}%;--sprite-size-x:${backgroundWidth};--sprite-size-y:${backgroundHeight};--sprite-hue:${hue}deg;--sprite-scale:${scale};`;
}

function setText(node, value) {
  if (node) node.textContent = String(value);
}

function metaStyle(entry) {
  const x = entry.icon_x * 100 / Math.max(1, entry.icon_columns - 1);
  const y = entry.icon_y * 100 / Math.max(1, entry.icon_rows - 1);
  return `--meta-x:${x}%;--meta-y:${y}%;`;
}

function itemElement(entry) {
  const node = document.createElement("span");
  node.className = "item-chip";
  node.title = `${entry.name}：${entry.description}`;
  node.innerHTML = `<span class="meta-sprite" style="${metaStyle(entry)}"></span>`;
  return node;
}

function shopItemElement(entry, onBuy) {
  const button = document.createElement("button");
  button.className = "shop-item-card";
  button.type = "button";
  button.innerHTML = `
    <span class="shop-item-icon meta-sprite" style="${metaStyle(entry)}"></span>
    <span><small>${entry.rarity} · ${entry.role}</small><strong>${entry.name}</strong><em>${entry.description}</em></span>
    <b class="price-tag">$ ${entry.shop_price}</b>
  `;
  button.addEventListener("click", () => onBuy(entry));
  return button;
}

function questElement(entry, state, onChoose) {
  const target = getQuestTarget(state.current_round, entry.condition.target_multiplier ?? 1);
  const displayQuest = { ...entry, target };
  const reward = entry.reward.kind === "item" ? getItemById(entry.reward.item_id) : null;
  const button = document.createElement("button");
  button.className = "quest-card";
  button.type = "button";
  button.innerHTML = `
    <span class="quest-card-head"><i class="quest-card-icon meta-sprite" style="${metaStyle(entry)}"></i><span><small>${entry.risk}</small><strong>${entry.name}</strong></span></span>
    <span class="quest-block quest-penalty"><b>代价</b><span>${entry.penalty.description}</span></span>
    <span class="quest-block quest-requirement"><b>本轮要求</b><span>${getQuestRequirement(displayQuest)}</span></span>
    <span class="quest-reward">永久奖励 · ${reward ? `${reward.name}：${reward.description}` : entry.reward.name}</span>
  `;
  button.addEventListener("click", () => onChoose(entry), { once: true });
  return button;
}

function cardElement(card, active, depth) {
  const article = document.createElement("article");
  article.className = `game-card card-${card.edibility} rarity-${RARITY_CLASS[card.rarity] ?? "common"}${active ? " is-active" : ""}`;
  article.style.setProperty("--depth", depth);
  article.style.zIndex = String(10 - depth);
  article.dataset.cardUuid = card.uuid;
  article.setAttribute("aria-label", `${card.name}，吃牌 ${card.eat_points} 分，弃牌 ${card.discard_points} 分`);
  article.innerHTML = `
    <div class="card-noise" aria-hidden="true"></div>
    <div class="card-head"><span class="rarity-tag">${card.rarity}</span><span class="edibility-tag">${EDIBILITY_LABEL[card.edibility] ?? "特殊"}</span><span class="card-code">${card.id}</span></div>
    <div class="card-art" aria-hidden="true"><span class="game-sprite" style="${spriteStyle(card)}"></span></div>
    <div class="card-title"><small>${EDIBILITY_LABEL[card.edibility] ?? "特殊"} · ${card.type} · ${ROLE_LABEL[card.role] ?? "特殊"}</small><strong>${card.name}</strong></div>
    <div class="card-scores"><span class="discard-score"><i>↑</i>弃 ${signed(card.discard_points)}</span><span class="eat-score"><i>↓</i>吃 ${signed(card.eat_points)}</span></div>
    <div class="card-effect">${card.effect?.description ?? "没有额外效果"}</div>
  `;
  return article;
}

function ruleElement(rule, onChoose) {
  const button = document.createElement("button");
  button.className = "rule-card";
  button.type = "button";
  button.innerHTML = `
    <span class="rule-icon">✦</span>
    <span class="rule-copy"><small>永久规则 · 本局不重复</small><strong>${rule.name}</strong><em>${rule.description}</em></span>
    <span class="rule-multiplier">${rule.multiplier === 1 ? `+${rule.bonus ?? 1}` : `×${rule.multiplier}`}</span>
  `;
  button.addEventListener("click", () => onChoose(rule), { once: true });
  return button;
}

function shopCardElement(card, onBuy) {
  const button = document.createElement("button");
  button.className = `shop-card rarity-${RARITY_CLASS[card.rarity] ?? "common"}`;
  button.type = "button";
  const priceNote = card.shop_discount > 0
    ? `<small class="shop-price-note">基础 $${card.shop_base_price} · 优惠 -${card.shop_discount}</small>`
    : "";
  button.title = `基础价 ${card.shop_base_price ?? card.shop_price}；优惠 ${card.shop_discount ?? 0}`;
  button.innerHTML = `
    <span class="shop-card-icon game-sprite" style="${spriteStyle(card)}"></span>
    <span class="shop-card-copy"><small>${card.rarity} · ${card.type} · ${ROLE_LABEL[card.role] ?? "特殊"}</small><strong>${card.name}</strong><em>吃 ${signed(card.eat_points)} / 弃 ${signed(card.discard_points)}</em><i>${card.effect?.description ?? "稳定基础价值"}</i>${priceNote}</span>
    <span class="price-tag">$ ${card.shop_price}</span>
  `;
  button.addEventListener("click", () => onBuy(card));
  return button;
}

function deckChipElement(card, cost, onRemove) {
  const button = document.createElement("button");
  button.className = "deck-chip";
  button.type = "button";
  button.title = `${card.name}：支付 ${cost} 金币从永久牌组中删除，不返还金币`;
  button.innerHTML = `<span class="game-sprite" style="${spriteStyle(card)}"></span><b>${card.name}</b><small>${EDIBILITY_LABEL[card.edibility]} · 吃 ${signed(card.eat_points)} / 弃 ${signed(card.discard_points)}</small><i>删除 $${cost} · 无返还</i>`;
  button.addEventListener("click", () => onRemove(card.uuid));
  return button;
}

function deckStatusCardElement(card, quantity) {
  const article = document.createElement("article");
  article.className = `deck-status-card rarity-${RARITY_CLASS[card.rarity] ?? "common"}`;
  const progress = card.growth_uses ? `<small>成长进度：${card.growth_uses}/${card.effect?.every ?? "?"}</small>` : "";
  const stored = card.stored_score ? `<small>当前储存：${card.stored_score} 分</small>` : "";
  const generated = card.generated_from
    ? `<small>生成来源：${getCardById(card.generated_from)?.name ?? card.generated_from}</small>`
    : "";
  article.innerHTML = `
    <span class="deck-status-art game-sprite" style="${spriteStyle(card)}"></span>
    <span class="deck-status-copy">
      <span class="deck-status-head"><strong>${card.name}</strong><b>×${quantity}</b></span>
      <small>${card.id} · ${card.rarity} · ${card.type} · ${EDIBILITY_LABEL[card.edibility]}</small>
      <em>吃 ${signed(card.eat_points)} / 弃 ${signed(card.discard_points)}</em>
      ${generated}${stored}${progress}
      <i>${card.effect?.description ?? "无类别、无效果。"}</i>
    </span>
  `;
  return article;
}

export function createUI(root) {
  const get = (selector) => root.querySelector(selector);
  const nodes = {
    stack: get("#cardStack"), empty: get("#deckEmpty"), round: get("#roundValue"), score: get("#scoreValue"),
    gold: get("#goldValue"), remaining: get("#remainingValue"), timer: get("#timerValue"), phase: get("#phaseValue"),
    eatZone: get("#eatZone"), discardZone: get("#discardZone"), swipeStatus: get("#swipeStatus"),
    draft: get("#ruleDraft"), draftList: get("#ruleDraftList"), summary: get("#roundSummary"),
    quest: get("#questDraft"), questList: get("#questDraftList"),
    shop: get("#shopPanel"), shopOffers: get("#shopOfferList"), shopItems: get("#shopItemOfferList"), shopDeck: get("#shopDeckList"), welcome: get("#welcomeOverlay"),
    questStatus: get("#questStatus"), questInfoButton: get("#questInfoButton"),
    deckStatus: get("#deckStatus"), deckInfoButton: get("#deckInfoButton"),
  };

  function openDeckStatus(state) {
    const grouped = new Map();
    for (const card of state.deck) {
      const key = [card.id, card.eat_points, card.discard_points, card.generated_from ?? "", card.stored_score ?? 0, card.growth_uses ?? 0].join("|");
      const group = grouped.get(key) ?? { card, quantity: 0 };
      group.quantity += 1;
      grouped.set(key, group);
    }
    const groups = [...grouped.values()].sort((left, right) => (
      left.card.type.localeCompare(right.card.type, "zh-CN") || left.card.name.localeCompare(right.card.name, "zh-CN")
    ));
    const typeCounts = state.deck.reduce((counts, card) => {
      counts[card.type] = (counts[card.type] ?? 0) + 1;
      return counts;
    }, {});
    get("#deckStatusSummary").innerHTML = `
      <b>${state.deck.length} / ${GAME_CONFIG.max_deck_size} 张</b>
      <span>${Object.entries(typeCounts).sort(([, a], [, b]) => b - a).map(([type, count]) => `${type} ${count}`).join(" · ")}</span>
    `;
    const liveRound = state.phase === "Playing" || state.phase === "Scoring";
    const plate = getPlateSummary(state.deck.length, state.plate_capacity);
    const actionBudget = liveRound && state.round.action_budget ? state.round.action_budget : plate.action_budget;
    const reserveCount = liveRound && state.round.action_budget ? state.round.reserve_count : plate.reserve_count;
    get("#deckCapacitySummary").innerHTML = `
      <div><small>${liveRound ? "本轮登场" : "下轮预计"}</small><b>${actionBudget} / ${state.deck.length}</b><span>${reserveCount > 0 ? `${reserveCount} 张留在牌组` : "全牌组登场"}</span></div>
      <div><small>永久餐盘</small><b>${state.plate_capacity} 张</b><span>商店可付费扩容</span></div>
      <div><small>未登场候选</small><b>${reserveCount} 张</b><span>每轮重新随机抽取</span></div>
      <div><small>容量上限</small><b>${GAME_CONFIG.max_plate_capacity} 张</b><span>每次扩容永久 +1</span></div>
    `;
    get("#deckStatusList").replaceChildren(...groups.map(({ card, quantity }) => deckStatusCardElement(card, quantity)));
    get("#keywordGlossaryList").innerHTML = Object.entries(KEYWORD_LIBRARY)
      .map(([keyword, description]) => `<div><b>【${keyword}】</b><span>${description}</span></div>`)
      .join("");
    nodes.questStatus?.classList.remove("show");
    nodes.deckStatus?.classList.add("show");
  }

  function openQuestStatus(state) {
    const entry = state.active_quest;
    const content = get("#questStatusContent");
    const title = get("#questStatusTitle");
    if (entry) {
      const reward = entry.reward.kind === "item" ? getItemById(entry.reward.item_id) : null;
      setText(title, entry.name);
      content.innerHTML = `
        <div class="quest-status-state ${entry.finalized ? (entry.completed ? "success" : "failed") : "active"}">${entry.finalized ? (entry.completed ? "任务完成" : "任务失败") : `第 ${entry.round} 轮进行中`}</div>
        <div class="quest-block quest-penalty"><b>当前惩罚</b><span>${entry.penalty.description}</span></div>
        <div class="quest-block quest-requirement"><b>完成要求</b><span>${getQuestRequirement(entry)}</span></div>
        <div class="quest-status-reward"><b>完成奖励</b><span>${reward ? `${reward.name}：${reward.description}` : entry.reward.name}</span><small>完成后在下一轮开始时生效</small></div>
      `;
    } else {
      setText(title, "任务记录");
      content.innerHTML = state.quest_history.length === 0
        ? '<p class="quest-status-empty">本轮没有危险任务。任务会在第 3 / 6 / 9 / 12 轮出现。</p>'
        : `<ul class="quest-history-list">${state.quest_history.map((history) => `<li class="${history.completed ? "success" : "failed"}"><b>${history.completed ? "✓" : "×"} ${history.name}</b><span>第 ${history.round} 轮 · ${history.reward}</span></li>`).join("")}</ul>`;
    }
    nodes.deckStatus?.classList.remove("show");
    nodes.questStatus?.classList.add("show");
  }

  function renderItems(state) {
    const tray = get("#itemTray");
    if (!tray) return;
    if (state.items.length === 0) tray.innerHTML = '<span class="item-empty">尚未获得</span>';
    else tray.replaceChildren(...state.items.map(itemElement));
  }

  function renderHud(state) {
    setText(nodes.round, `${state.current_round}/${GAME_CONFIG.total_rounds}`);
    setText(nodes.score, formatScore(state.total_score));
    nodes.score.title = String(state.total_score);
    setText(nodes.gold, formatScore(state.gold));
    const liveRound = state.phase === "Playing" || state.phase === "Scoring";
    const budget = liveRound && state.round.action_budget
      ? state.round.action_budget
      : getPlateSummary(state.deck.length, state.plate_capacity).action_budget;
    setText(get("#remainingLabel"), liveRound ? "餐盘剩余" : "下轮登场");
    setText(nodes.remaining, liveRound ? `${state.round.draw_pile.length}/${budget}` : `${budget}张`);
    nodes.remaining.title = `${liveRound ? "本轮" : "下轮预计"}登场 ${budget} 张；永久牌组 ${state.deck.length} 张`;
    setText(nodes.phase, PHASE_LABELS[state.phase] ?? state.phase);
    setText(get("#shopGold"), formatScore(state.gold));
    setText(get("#shopDeleteCost"), state.remove_card_cost);
    setText(get("#reshuffleCount"), state.round.reshuffle_charges);
    if (nodes.questInfoButton) {
      nodes.questInfoButton.disabled = !state.active_quest && state.quest_history.length === 0;
      nodes.questInfoButton.classList.toggle("has-active-quest", Boolean(state.active_quest && !state.active_quest.finalized));
      nodes.questInfoButton.title = state.active_quest
        ? `${state.active_quest.name}：${getQuestRequirement(state.active_quest)}；惩罚：${state.active_quest.penalty.description}`
        : "查看任务记录";
      nodes.questInfoButton.onclick = () => {
        if (nodes.questStatus?.classList.contains("show")) nodes.questStatus.classList.remove("show");
        else openQuestStatus(state);
      };
    }
    if (nodes.deckInfoButton) {
      nodes.deckInfoButton.title = `查看永久牌组（${state.deck.length} 张）`;
      nodes.deckInfoButton.onclick = () => {
        if (nodes.deckStatus?.classList.contains("show")) nodes.deckStatus.classList.remove("show");
        else openDeckStatus(state);
      };
    }
    const reshuffleButton = get("#reshuffleButton");
    if (reshuffleButton) {
      const canReshuffle = state.phase === "Playing"
        && state.deck.length <= GAME_CONFIG.reshuffle_max_deck_size
        && state.round.reshuffle_charges > 0
        && state.round.spent_pile.length > 0;
      reshuffleButton.disabled = !canReshuffle;
      reshuffleButton.title = state.deck.length > GAME_CONFIG.reshuffle_max_deck_size
        ? `牌组超过 ${GAME_CONFIG.reshuffle_max_deck_size} 张，无法重洗`
        : `将 ${state.round.spent_pile.length} 张已处理牌洗回牌堆`;
    }
    renderItems(state);
  }

  function setGestureProgress({ progress = 0, direction = null }) {
    const strength = Math.max(0, Math.min(1, progress));
    nodes.eatZone?.style.setProperty("--gesture", direction === "eat" ? strength : 0);
    nodes.discardZone?.style.setProperty("--gesture", direction === "discard" ? strength : 0);
    nodes.eatZone?.classList.toggle("is-target", direction === "eat" && strength > 0.12);
    nodes.discardZone?.classList.toggle("is-target", direction === "discard" && strength > 0.12);
    if (nodes.swipeStatus) {
      nodes.swipeStatus.className = `swipe-status${direction ? ` ${direction}` : ""}`;
      nodes.swipeStatus.textContent = strength > 0.12 ? (direction === "eat" ? "松手吃掉" : "松手弃掉") : "";
      nodes.swipeStatus.style.opacity = String(strength);
    }
  }

  return {
    preloadCardArt: warmCardArt,
    openWelcome(onStart, bestScore = null) {
      setText(get("#welcomeBestScore"), bestScore ?? "--");
      const button = get("#startGameButton");
      button.onclick = () => {
        nodes.welcome.classList.remove("show");
        onStart();
      };
      nodes.welcome.classList.add("show");
    },
    renderHud,
    renderTimer(milliseconds) { setText(nodes.timer, `${(milliseconds / 1000).toFixed(1)}s`); },
    renderStack(cards, gesture) {
      nodes.stack.replaceChildren();
      const visible = cards.slice(-3);
      visible.forEach((card, index) => {
        const depth = visible.length - 1 - index;
        nodes.stack.appendChild(cardElement(card, depth === 0, depth));
      });
      const activeCard = cards.at(-1);
      const activeElement = nodes.stack.querySelector(".game-card.is-active");
      nodes.empty.hidden = Boolean(activeCard);
      if (activeElement && activeCard) gesture.bind(activeElement, activeCard);
    },
    setGestureProgress,
    bindControls({ onEat, onDiscard, onReshuffle, onSound }) {
      get("#eatButton")?.addEventListener("click", onEat);
      get("#discardButton")?.addEventListener("click", onDiscard);
      get("#soundButton")?.addEventListener("click", onSound);
      get("#reshuffleButton")?.addEventListener("click", onReshuffle);
      get("#questStatusClose")?.addEventListener("click", () => nodes.questStatus?.classList.remove("show"));
      get("#deckStatusClose")?.addEventListener("click", () => nodes.deckStatus?.classList.remove("show"));
    },
    setSoundState(enabled) {
      const button = get("#soundButton");
      if (!button) return;
      button.textContent = enabled ? "♪" : "×";
      button.setAttribute("aria-pressed", String(enabled));
      button.classList.toggle("is-muted", !enabled);
    },
    showFloatingScore(points, action, streak) {
      const stage = get(".deck-stage");
      if (!stage) return;
      const floater = document.createElement("div");
      floater.className = `score-floater ${points < 0 ? "negative" : action}`;
      floater.style.setProperty("--score-scale", Math.min(1 + Math.max(0, streak - 1) * 0.12, 1.7));
      const comboLabel = streak >= 8 ? "OVERDRIVE" : streak >= 5 ? "FEVER" : streak >= 3 ? "HIT" : "";
      floater.textContent = `${points > 0 ? "+" : ""}${formatScore(points)}${comboLabel ? ` · ${streak} ${comboLabel}` : ""}`;
      stage.appendChild(floater);
      floater.addEventListener("animationend", () => floater.remove(), { once: true });
    },
    showEffectFlash(message) {
      const stage = get(".deck-stage");
      if (!stage) return;
      const flash = document.createElement("div");
      flash.className = "effect-flash";
      flash.textContent = `✦ ${message}`;
      stage.appendChild(flash);
      flash.addEventListener("animationend", () => flash.remove(), { once: true });
    },
    triggerShake() {
      const shell = get(".game-shell");
      shell?.classList.remove("shake");
      void shell?.offsetWidth;
      shell?.classList.add("shake");
    },
    openRuleDraft(options, state, onChoose) {
      const milestone = getNextMilestone(state.current_round);
      setText(get("#draftRoundValue"), String(state.current_round).padStart(2, "0"));
      setText(get("#draftTargetText"), `第 ${milestone.round} 轮 · ${milestone.target} 分 · 已有 ${state.active_rules.length} 条`);
      nodes.draftList.replaceChildren(...options.map((rule) => ruleElement(rule, onChoose)));
      nodes.draft.classList.add("show");
    },
    closeRuleDraft() { nodes.draft.classList.remove("show"); },
    openQuestDraft(options, state, onChoose) {
      setText(get("#questRoundValue"), String(state.current_round).padStart(2, "0"));
      nodes.questList.replaceChildren(...options.map((entry) => questElement(entry, state, onChoose)));
      nodes.quest.classList.add("show");
    },
    closeQuestDraft() { nodes.quest.classList.remove("show"); },
    showCountdown(onComplete) {
      const overlay = get("#countdownOverlay");
      const text = get("#countdownText");
      const frames = ["3", "2", "1", "开吃!"];
      let index = 0;
      overlay.classList.add("show");
      const advance = () => {
        text.classList.remove("pop");
        void text.offsetWidth;
        text.textContent = frames[index];
        text.classList.add("pop");
        index += 1;
        if (index < frames.length) setTimeout(advance, 420);
        else setTimeout(() => { overlay.classList.remove("show"); onComplete(); }, 320);
      };
      advance();
    },
    showRoundSummary(result, state, outcome, onConfirm) {
      const title = get("#summaryTitle");
      const tip = get("#summaryTip");
      const eyebrow = get("#summaryEyebrow");
      const button = get("#summaryContinueBtn");
      const list = get("#summaryBreakdownList");
      const ruleResults = get("#summaryRuleResults");
      const milestone = getNextMilestone(state.current_round);
      const roundsRemaining = Math.max(0, milestone.round - state.current_round);
      const milestoneProgress = milestone.target > 0
        ? Math.max(0, Math.min(100, state.total_score / milestone.target * 100))
        : 100;

      setText(
        get("#summaryMilestoneRounds"),
        roundsRemaining === 0 ? `本轮为第 ${milestone.round} 轮目标结算` : `距离第 ${milestone.round} 轮目标还有 ${roundsRemaining} 轮`,
      );
      setText(get("#summaryMilestoneScore"), `累计 ${formatScore(state.total_score)} / 目标 ${formatScore(milestone.target)} 分`);
      get("#summaryMilestoneFill")?.style.setProperty("width", `${milestoneProgress}%`);

      list.innerHTML = result.breakdown.map((item) => `<div class="receipt-line ${item.kind ?? ""}"><span>${item.label}</span><b>${item.text}</b></div>`).join("");
      ruleResults.innerHTML = result.rule_results
        .filter((item) => item.multiplier !== 1)
        .map((item) => `<span class="rule-result ${item.achieved ? "achieved" : "missed"}">${item.achieved ? "✓" : "·"} ${item.name}</span>`)
        .join("");
      get("#activeRulesList").innerHTML = state.active_rules.map((rule) => `<li><b>${rule.name}</b><span>${rule.description}</span></li>`).join("");
      const questResult = get("#summaryQuestResult");
      if (result.quest_result) {
        questResult.hidden = false;
        questResult.className = `quest-result ${result.quest_result.completed ? "success" : "failed"}`;
        questResult.textContent = result.quest_result.completed
          ? `✓ 任务完成 · 要求：${result.quest_result.requirement} · 已承受：${result.quest_result.penalty} · 奖励：${result.quest_result.reward}（第 ${result.quest_result.reward_effective_round} 轮生效）`
          : `× 任务失败 · 未达成：${result.quest_result.requirement} · 已承受：${result.quest_result.penalty}`;
      } else {
        questResult.hidden = true;
        questResult.className = "quest-result";
      }

      if (outcome === "victory") {
        eyebrow.textContent = "15 ROUNDS COMPLETE";
        title.textContent = "通关成功！";
        tip.textContent = `最终得分 ${formatScore(state.total_score)}，记录已保存到本机。`;
        button.textContent = "再来一局";
        button.classList.add("danger-action");
      } else if (outcome === "defeat") {
        eyebrow.textContent = "TARGET MISSED";
        title.textContent = "挑战失败";
        tip.textContent = `本阶段需要 ${formatScore(getNextMilestone(state.current_round).target)} 分，当前为 ${formatScore(state.total_score)} 分。`;
        button.textContent = "重新开始";
        button.classList.add("danger-action");
      } else {
        eyebrow.textContent = `ROUND ${String(state.current_round).padStart(2, "0")} CLEAR`;
        title.textContent = "本轮结算";
        tip.textContent = `用时 ${(state.round.elapsed_ms / 1000).toFixed(1)} 秒 · 吃牌 ${result.gold_eaten} 次 · 基础金币 +${result.gold_reward}`;
        button.textContent = "确认结算 · 进入商店";
        button.classList.remove("danger-action");
      }
      button.disabled = false;
      button.onclick = async () => {
        const label = button.textContent;
        button.disabled = true;
        if (!outcome) button.textContent = "正在准备商店…";
        try {
          await onConfirm();
        } finally {
          button.disabled = false;
          if (nodes.summary.classList.contains("show")) {
            button.textContent = label;
          }
        }
      };
      nodes.summary.classList.add("show");
    },
    hideRoundSummary() { nodes.summary.classList.remove("show"); },
    openShop(state, cards, itemOffers, onBuy, onBuyItem, onRemove, onPlateUpgrade, onReroll, onContinue, plateUpgradeStatus) {
      renderHud(state);
      const plate = getPlateSummary(state.deck.length, state.plate_capacity);
      get("#shopPlateSummary").innerHTML = `
        <span><b>${state.deck.length} 张牌</b> · 永久餐盘 <b>${state.plate_capacity}</b> 张 · 下轮登场 ${plate.action_budget} 张</span>
        <span>${plate.reserve_count > 0 ? `${plate.reserve_count} 张不会在下轮登场` : "当前牌组可全部登场"}</span>
      `;
      nodes.shopOffers.replaceChildren(...cards.map((card) => shopCardElement(card, onBuy)));
      if (cards.length === 0) nodes.shopOffers.innerHTML = '<p class="empty-shop">商品售罄</p>';
      nodes.shopItems.replaceChildren(...itemOffers.map((entry) => shopItemElement(entry, onBuyItem)));
      if (itemOffers.length === 0) nodes.shopItems.innerHTML = '<p class="empty-shop">本局低级道具已售罄</p>';
      nodes.shopDeck.replaceChildren(...state.deck.map((card) => deckChipElement(card, state.remove_card_cost, onRemove)));
      const plateUpgradeButton = get("#shopPlateUpgrade");
      const plateUpgradeDetail = get("#shopPlateUpgradeDetail");
      const plateMaxed = plateUpgradeStatus.reason === "max_capacity";
      plateUpgradeButton.disabled = plateMaxed;
      plateUpgradeButton.textContent = plateMaxed
        ? `餐盘已满 · ${state.plate_capacity}/${GAME_CONFIG.max_plate_capacity}`
        : `永久扩容 +1 · $${plateUpgradeStatus.cost}`;
      plateUpgradeButton.onclick = onPlateUpgrade;
      plateUpgradeDetail.textContent = plateMaxed
        ? "已达到本局餐盘容量上限"
        : `当前 ${state.plate_capacity} 张 → ${state.plate_capacity + 1} 张${plateUpgradeStatus.discount > 0 ? ` · 量尺优惠 -${plateUpgradeStatus.discount}` : ""}`;
      const rerollCost = state.round.shop_free_rerolls > 0
        ? 0
        : GAME_CONFIG.shop_reroll_base_cost + state.round.shop_reroll_count * GAME_CONFIG.shop_reroll_cost_step;
      const rerollButton = get("#shopReroll");
      rerollButton.textContent = rerollCost === 0
        ? `免费刷新 · 剩余 ${state.round.shop_free_rerolls}`
        : `刷新商品 · $${rerollCost}`;
      rerollButton.disabled = rerollCost > 0 && state.gold < rerollCost;
      rerollButton.onclick = onReroll;
      get("#shopContinue").onclick = onContinue;
      nodes.shop.classList.add("show");
    },
    closeShop() { nodes.shop.classList.remove("show"); },
    setShopMessage(message, tone = "normal") {
      const node = get("#shopMessage");
      setText(node, message);
      node.dataset.tone = tone;
    },
  };
}
