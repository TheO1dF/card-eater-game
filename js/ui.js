import { GAME_CONFIG, getNextMilestone } from "./config.js";

const PHASE_LABELS = Object.freeze({
  Init: "准备中", RuleDraft: "规则选择", Playing: "出牌中", Scoring: "结算中",
  Shop: "商店", NextRound: "下一轮", GameOver: "本局结束",
});

const RARITY_CLASS = Object.freeze({ "普通": "common", "罕见": "uncommon", "稀有": "rare", "传奇": "legendary" });
const EDIBILITY_LABEL = Object.freeze({ edible: "可食用", inedible: "不可食用" });
const ROLE_LABEL = Object.freeze({ baseline: "基础", setup: "启动", payoff: "收割", sacrifice: "牺牲", engine: "成长引擎", economy: "经济" });
const CARD_ART_VERSION = 5;
const CARD_ATLAS_VERSION = 7;
const cardArtCache = new Map();
const signed = (value) => value > 0 ? `+${value}` : String(value);
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
  button.innerHTML = `
    <span class="shop-card-icon game-sprite" style="${spriteStyle(card)}"></span>
    <span class="shop-card-copy"><small>${card.rarity} · ${card.type} · ${ROLE_LABEL[card.role] ?? "特殊"}</small><strong>${card.name}</strong><em>吃 ${signed(card.eat_points)} / 弃 ${signed(card.discard_points)}</em><i>${card.effect?.description ?? "稳定基础价值"}</i></span>
    <span class="price-tag">$ ${card.shop_price}</span>
  `;
  button.addEventListener("click", () => onBuy(card));
  return button;
}

function deckChipElement(card, cost, onRemove) {
  const button = document.createElement("button");
  button.className = "deck-chip";
  button.type = "button";
  button.title = `${card.name}：点击支付 ${cost} 金币删除`;
  button.innerHTML = `<span class="game-sprite" style="${spriteStyle(card)}"></span><b>${card.name}</b><small>${EDIBILITY_LABEL[card.edibility]} · 吃 ${signed(card.eat_points)} / 弃 ${signed(card.discard_points)}</small><i>删除 $${cost}</i>`;
  button.addEventListener("click", () => onRemove(card.uuid));
  return button;
}

export function createUI(root) {
  const get = (selector) => root.querySelector(selector);
  const nodes = {
    stack: get("#cardStack"), empty: get("#deckEmpty"), round: get("#roundValue"), score: get("#scoreValue"),
    gold: get("#goldValue"), remaining: get("#remainingValue"), timer: get("#timerValue"), phase: get("#phaseValue"),
    eatZone: get("#eatZone"), discardZone: get("#discardZone"), swipeStatus: get("#swipeStatus"),
    draft: get("#ruleDraft"), draftList: get("#ruleDraftList"), summary: get("#roundSummary"),
    shop: get("#shopPanel"), shopOffers: get("#shopOfferList"), shopDeck: get("#shopDeckList"), welcome: get("#welcomeOverlay"),
  };

  function renderHud(state) {
    setText(nodes.round, `${state.current_round}/${GAME_CONFIG.total_rounds}`);
    setText(nodes.score, state.total_score);
    setText(nodes.gold, state.gold);
    setText(nodes.remaining, state.round.draw_pile.length);
    setText(nodes.phase, PHASE_LABELS[state.phase] ?? state.phase);
    setText(get("#shopGold"), state.gold);
    setText(get("#shopDeleteCost"), state.remove_card_cost);
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
    bindControls({ onEat, onDiscard, onSound }) {
      get("#eatButton")?.addEventListener("click", onEat);
      get("#discardButton")?.addEventListener("click", onDiscard);
      get("#soundButton")?.addEventListener("click", onSound);
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
      floater.textContent = `${signed(points)}${comboLabel ? ` · ${streak} ${comboLabel}` : ""}`;
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
      setText(get("#summaryMilestoneScore"), `累计 ${state.total_score} / 目标 ${milestone.target} 分`);
      get("#summaryMilestoneFill")?.style.setProperty("width", `${milestoneProgress}%`);

      list.innerHTML = result.breakdown.map((item) => `<div class="receipt-line ${item.kind ?? ""}"><span>${item.label}</span><b>${item.text}</b></div>`).join("");
      ruleResults.innerHTML = result.rule_results
        .filter((item) => item.multiplier !== 1)
        .map((item) => `<span class="rule-result ${item.achieved ? "achieved" : "missed"}">${item.achieved ? "✓" : "·"} ${item.name}</span>`)
        .join("");
      get("#activeRulesList").innerHTML = state.active_rules.map((rule) => `<li><b>${rule.name}</b><span>${rule.description}</span></li>`).join("");

      if (outcome === "victory") {
        eyebrow.textContent = "15 ROUNDS COMPLETE";
        title.textContent = "通关成功！";
        tip.textContent = `最终得分 ${state.total_score}，记录已保存到本机。`;
        button.textContent = "再来一局";
        button.classList.add("danger-action");
      } else if (outcome === "defeat") {
        eyebrow.textContent = "TARGET MISSED";
        title.textContent = "挑战失败";
        tip.textContent = `本阶段需要 ${getNextMilestone(state.current_round).target} 分，当前为 ${state.total_score} 分。`;
        button.textContent = "重新开始";
        button.classList.add("danger-action");
      } else {
        eyebrow.textContent = `ROUND ${String(state.current_round).padStart(2, "0")} CLEAR`;
        title.textContent = "本轮结算";
        tip.textContent = `用时 ${(state.round.elapsed_ms / 1000).toFixed(1)} 秒 · 吃了 ${result.gold_reward} 张牌 · 金币 +${result.gold_reward}`;
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
    openShop(state, cards, onBuy, onRemove, onContinue) {
      renderHud(state);
      nodes.shopOffers.replaceChildren(...cards.map((card) => shopCardElement(card, onBuy)));
      if (cards.length === 0) nodes.shopOffers.innerHTML = '<p class="empty-shop">商品售罄</p>';
      nodes.shopDeck.replaceChildren(...state.deck.map((card) => deckChipElement(card, state.remove_card_cost, onRemove)));
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
