import { GAME_CONFIG } from "./config.js";
import { GAME_PHASES, createInitialPlayerState, resetRoundState, transitionPhase } from "./state.js";
import { createGestureController } from "./gesture.js";
import { createRoundEngine } from "./engine.js";
import { createShopService } from "./shop.js";
import { randomDraftRules } from "./rules.js";
import { applyRoundEndItems, applyRoundItemSetup } from "./items.js";
import { createUI } from "./ui.js";
import { browserPlatform } from "./platform.js";
import { initAudio, playSound, toggleBGM } from "./audio.js";
import { safeAdd } from "./numbers.js";
import { postponeCurrentCard, takeRoundDrawPile } from "./plate.js";
import { activateReshuffle, getReshuffleStatus } from "./reshuffle.js";

const state = createInitialPlayerState({ create_id: browserPlatform.create_id });
const engine = createRoundEngine({ random: browserPlatform.random });
const shopService = createShopService({ random: browserPlatform.random, create_id: browserPlatform.create_id });
const ui = createUI(document);

let shopBuffer = null;
let shopThemeBuffer = null;
let shopThemeType = null;
let shopItemBuffer = null;
let actionLocked = true;
let streak = { action: null, count: 0 };
let soundEnabled = true;
let bgmStarted = false;
const tutorial = {
  active: false,
  correct_eat: false,
  postponed: false,
  correct_discard: false,
};

const shuffle = (items) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(browserPlatform.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
};

function startSound() {
  if (!soundEnabled) return;
  initAudio();
  if (!bgmStarted) {
    toggleBGM(true);
    bgmStarted = true;
  }
}

function tutorialProgress() {
  return [
    { label: "正确吃牌", done: tutorial.correct_eat },
    { label: "后置排牌", done: tutorial.postponed },
    { label: "正确弃牌", done: tutorial.correct_discard },
  ];
}

function renderTutorial() {
  if (!tutorial.active) {
    ui.hideStoryGuide();
    return;
  }
  const progress = tutorialProgress();
  if (state.phase === GAME_PHASES.RULE_DRAFT) {
    ui.showStoryGuide({
      step: "contract",
      placement: "contract",
      chapter: "CHAPTER 1 · 第一份合约",
      message: "每次只持有一份合约。没完成不会受罚，它会留下来等你下轮再试。先选一份你看得懂的。",
      objective: "点击任意一张合约卡继续。",
      target: ".rule-card",
      progress,
    });
    return;
  }
  if (state.phase !== GAME_PHASES.PLAYING) {
    ui.hideStoryGuide();
    return;
  }

  const card = state.round.draw_pile.at(-1);
  if (!tutorial.correct_eat) {
    const edible = card?.edibility === "edible";
    ui.showStoryGuide({
      step: "eat",
      chapter: "CHAPTER 2 · 看食性，不看外表",
      message: edible
        ? `「${card.name}」标着可食用。下滑或点击“吃掉”，获得它的吃点，并取得这张实体牌本轮的基础金币。`
        : `「${card?.name ?? "当前牌"}」不可食用。先别硬吃；把它后置到餐盘末尾，继续寻找可食用牌。`,
      objective: edible ? "完成一次符合食性的吃牌。" : "点击“后置”，不结算地改变牌序。",
      target: edible ? "#eatButton" : "#postponeButton",
      progress,
    });
    return;
  }

  if (!tutorial.postponed) {
    ui.showStoryGuide({
      step: "postpone",
      chapter: "CHAPTER 3 · 餐盘不是传送带",
      message: "如果暂时不想处理这张牌，可以将它后置，它会到牌堆的最后一张。但是每轮每张牌只能后置一次哦。后置不会结算吃弃，也不消耗行动次数。",
      objective: "点击“后置”或左右侧滑一次。",
      target: "#postponeButton",
      progress,
    });
    return;
  }

  if (!tutorial.correct_discard) {
    const inedible = card?.edibility === "inedible";
    ui.showStoryGuide({
      step: "discard",
      chapter: "CHAPTER 4 · 不能吃，就让它走",
      message: inedible
        ? `「${card.name}」不可食用。上滑或点击“弃掉”，使用它更高的弃点。`
        : `「${card?.name ?? "当前牌"}」仍可食用。把它后置，找到一张不可食用牌再弃。`,
      objective: inedible ? "完成一次符合食性的弃牌。" : "用后置保留好牌，寻找不可食用牌。",
      target: inedible ? "#discardButton" : "#postponeButton",
      progress,
    });
    return;
  }

  ui.showStoryGuide({
    step: "complete",
    chapter: "EPILOGUE · 牌序就是构筑",
    message: "你已经会吃、弃和后置了。连续吃水果会不断提高水果连击；遇到非水果时，把它后置，就能尝试维持连击。",
    objective: "真正的选择是：现在拿分，还是为后面的爆发重排餐盘。",
    progress,
    can_continue: true,
    continue_label: "完成教学",
  });
}

function startTutorial() {
  tutorial.active = true;
  tutorial.correct_eat = false;
  tutorial.postponed = false;
  tutorial.correct_discard = false;
  renderTutorial();
}

function finishTutorial() {
  tutorial.active = false;
  browserPlatform.save_tutorial_complete();
  ui.hideStoryGuide();
}

function refreshTable() {
  ui.renderStack(state.round.draw_pile, gesture, state);
  ui.renderHud(state);
}

function updateStreak(action) {
  if (streak.action === action) streak.count += 1;
  else streak = { action, count: 1 };
  return streak.count;
}

function completeRound() {
  actionLocked = true;
  transitionPhase(state, GAME_PHASES.SCORING, { round: state.current_round });
  renderTutorial();
  state.round.elapsed_ms = Math.max(1, state.round.timer_frozen_elapsed_ms
    ?? (browserPlatform.now() - state.round.started_at_ms));

  const result = engine.finalizeRound(state);
  result.gold_reward = engine.getGoldReward(state);
  result.eat_actions = state.round.eat_sequence.length;
  result.gold_eaten = new Set(state.round.eat_sequence.map((entry) => entry.card_uuid)).size;
  state.gold = safeAdd(state.gold, result.gold_reward);
  result.breakdown.splice(-1, 0, { label: "基础金币（每张实体牌每轮首次吃 +1）", text: `+${result.gold_reward}`, kind: "bonus" });
  result.quest_result = null;
  result.round_end_item_results = applyRoundEndItems(state, { random: browserPlatform.random });
  result.round_end_item_results.forEach((message) => {
    result.breakdown.splice(-1, 0, { label: "道具 · 轮末变化", text: message, kind: "rule" });
  });
  refreshTable();

  const milestone = engine.levelProgressCheck(state);
  const failed = milestone.target > 0 && !milestone.passed;
  const won = !failed && state.current_round >= engine.getFinalRound(state);
  const outcome = failed ? "defeat" : won ? "victory" : null;

  if (outcome) {
    state.outcome = outcome;
    transitionPhase(state, GAME_PHASES.GAME_OVER, { outcome, score: state.total_score });
    browserPlatform.save_record({
      score: state.total_score,
      outcome,
      round: state.current_round,
      finished_at: new Date().toISOString(),
      schema_version: state.schema_version,
    });
  }

  if (!outcome && shopBuffer === null) {
    shopBuffer = shopService.getShopCards(state);
    const themed = shopService.getThemedShopCards(state);
    shopThemeBuffer = themed.cards;
    shopThemeType = themed.type;
    shopItemBuffer = shopService.getShopItems(state);
    // Warm the shop art while the summary is visible, but never make game
    // progression depend on image decoding. Safari may leave decode() pending
    // for a long time on a slow or interrupted connection.
    void ui.preloadCardArt([...shopBuffer, ...shopThemeBuffer]);
  }

  ui.showRoundSummary(result, state, outcome, () => {
    if (outcome) {
      location.reload();
      return;
    }
    ui.hideRoundSummary();
    transitionPhase(state, GAME_PHASES.SHOP, { round: state.current_round });
    enterShop();
  });
}

function resolveForcedDiscards() {
  if (!state.round.force_discard_remaining) return;
  state.round.force_discard_remaining = false;
  while (state.round.draw_pile.length > 0 && state.round.actions.length < GAME_CONFIG.max_actions_per_round) {
    const forcedCard = state.round.draw_pile.pop();
    engine.recordAction(state, "discard", forcedCard);
    if (state.deck.some((item) => item.uuid === forcedCard.uuid)) state.round.spent_pile.push(forcedCard);
  }
  if (state.round.draw_pile.length > 0) state.round.draw_pile.length = 0;
}

function resolveEmptyDrawPile() {
  if (state.round.draw_pile.length > 0) return false;
  const reshuffle = getReshuffleStatus(state);
  if (reshuffle.can_use) {
    const result = activateReshuffle(state, shuffle);
    if (!result.success) {
      completeRound();
      return true;
    }
    actionLocked = true;
    streak = { action: null, count: 0 };
    refreshTable();
    ui.showEffectFlash(`自动重洗 · ${result.replayed_count} 张牌无缝回到餐盘 · 剩余 ${result.remaining_charges} 次`);
    ui.playReshuffleAnimation();
    window.setTimeout(() => {
      if (state.phase !== GAME_PHASES.PLAYING) return;
      actionLocked = false;
      refreshTable();
      renderTutorial();
    }, 580);
    return true;
  }
  completeRound();
  return true;
}

function handleAction(action, card) {
  if (state.phase !== GAME_PHASES.PLAYING) {
    actionLocked = false;
    return;
  }
  const currentCard = state.round.draw_pile.at(-1);
  if (!currentCard || currentCard.uuid !== card.uuid) {
    actionLocked = false;
    refreshTable();
    return;
  }

  const hitCount = updateStreak(action);
  state.round.live_elapsed_ms = Math.max(0, browserPlatform.now() - state.round.started_at_ms);
  const entry = engine.recordAction(state, action, card);
  if (tutorial.active) {
    if (action === "eat" && card.edibility === "edible") tutorial.correct_eat = true;
    if (action === "discard" && card.edibility === "inedible") tutorial.correct_discard = true;
  }
  if (state.round.timer_paused && state.round.timer_frozen_elapsed_ms === null) {
    state.round.timer_frozen_elapsed_ms = Math.max(1, browserPlatform.now() - state.round.started_at_ms);
  }
  state.round.draw_pile.pop();
  if (state.deck.some((item) => item.uuid === card.uuid)) state.round.spent_pile.push(card);
  if (state.round.consume_next_uuid) {
    const consumed = state.round.draw_pile.at(-1);
    if (consumed?.uuid === state.round.consume_next_uuid) state.round.draw_pile.pop();
    state.round.consume_next_uuid = null;
  }

  ui.showFloatingScore(entry.points, action, hitCount);
  if (entry.wrong_edibility) ui.showHardEat(entry.wrong_edibility_streak, entry.points);
  if (entry.fruit_combo) ui.showFruitCombo(entry.fruit_combo);
  if (entry.effect_triggered) ui.showEffectFlash(entry.effect_triggered, entry);
  ui.showPointMutation(entry, card);
  if (soundEnabled) {
    playSound(action, hitCount);
    if (entry.effect_triggered) playSound("effect", hitCount);
  }
  browserPlatform.vibrate(entry.points < 0 ? [16, 20, 16] : 7);
  if (entry.points < 0) {
    ui.triggerShake();
    if (soundEnabled) playSound("error", 1);
  }

  if (state.round.actions.length >= GAME_CONFIG.max_actions_per_round) {
    state.round.force_discard_remaining = true;
    ui.showEffectFlash("本轮行动已达安全上限，剩余牌自动清空");
  }
  resolveForcedDiscards();
  ui.setGestureProgress({ progress: 0, direction: null });
  if (!resolveEmptyDrawPile()) {
    actionLocked = false;
    refreshTable();
    renderTutorial();
  }
}

function handlePostpone(card) {
  if (state.phase !== GAME_PHASES.PLAYING) {
    actionLocked = false;
    return;
  }
  const currentCard = state.round.draw_pile.at(-1);
  if (!currentCard || currentCard.uuid !== card.uuid) {
    actionLocked = false;
    refreshTable();
    return;
  }
  const result = postponeCurrentCard(state);
  if (!result.success) {
    actionLocked = false;
    ui.showEffectFlash(result.reason === "already_postponed"
      ? `「${card.name}」本轮已经后置过，不能再次后置`
      : "餐盘只剩一张牌，无法后置");
    refreshTable();
    return;
  }
  const effectResult = engine.recordPostpone(state, card);
  streak = { action: null, count: 0 };
  ui.setGestureProgress({ progress: 0, direction: null });
  const effectMessages = [];
  if (result.direction === "front") {
    effectMessages.push(`送餐员调度 · 末牌「${result.revealed_card?.name ?? "未知牌"}」立即登场`);
  } else {
    effectMessages.push(`后置「${card.name}」· 将在牌堆最后再次出现`);
  }
  if (result.score_bonus > 0) {
    effectMessages.push(`理牌托盘 +${result.score_bonus} 分`);
    ui.showFloatingScore(result.score_bonus, "postpone", 1);
  }
  effectMessages.push(...effectResult.messages);
  ui.showEffectFlash(effectMessages.join(" · "));
  if (tutorial.active) tutorial.postponed = true;
  if (soundEnabled) playSound("effect", 1);
  actionLocked = false;
  refreshTable();
  renderTutorial();
}

const gesture = createGestureController({
  onEat: (card) => handleAction("eat", card),
  onDiscard: (card) => handleAction("discard", card),
  onPostpone: (card) => handlePostpone(card),
  onProgress: (progress) => ui.setGestureProgress(progress),
  onCommit: () => { actionLocked = true; },
});

function prepareRound() {
  resetRoundState(state);
  const roundStartMessages = engine.applyRoundStartEffects(state);
  applyRoundItemSetup(state);
  state.deck.forEach((card) => {
    if ((card.dormant_until_round ?? Number.POSITIVE_INFINITY) >= state.current_round) return;
    delete card.dormant_until_round;
    card.status_keywords = (card.status_keywords ?? []).filter((keyword) => keyword !== "休眠");
  });
  const activeDeck = state.deck.filter((card) => (card.dormant_until_round ?? 0) !== state.current_round);
  const dormantCount = state.deck.length - activeDeck.length;
  if (dormantCount > 0) roundStartMessages.push(`【休眠】${dormantCount} 张新购入牌本轮不进入牌堆`);
  const shuffledDeck = shuffle(activeDeck.map((card) => ({ ...card, effect: card.effect ? { ...card.effect } : null })));
  Object.assign(state.round, takeRoundDrawPile(shuffledDeck, state.plate_capacity));
  shopBuffer = null;
  shopThemeBuffer = null;
  shopThemeType = null;
  shopItemBuffer = null;
  streak = { action: null, count: 0 };
  actionLocked = true;
  ui.renderTimer(0);
  refreshTable();
  ui.showCountdown(() => {
    transitionPhase(state, GAME_PHASES.PLAYING, { round: state.current_round });
    state.round.started_at_ms = browserPlatform.now();
    actionLocked = false;
    ui.renderHud(state);
    if (roundStartMessages.length > 0) ui.showEffectFlash(roundStartMessages.join(" · "));
    renderTutorial();
  });
}

function enterRuleDraft() {
  if (state.phase === GAME_PHASES.INIT || state.phase === GAME_PHASES.NEXT_ROUND) {
    transitionPhase(state, GAME_PHASES.RULE_DRAFT, { round: state.current_round });
  }
  actionLocked = true;
  if (state.active_rules.length > 0) {
    ui.renderHud(state);
    prepareRound();
    return;
  }
  const options = randomDraftRules(
    GAME_CONFIG.draft_size,
    state.rule_history.filter((entry) => entry.completed),
    browserPlatform.random,
    state.deck,
    state.current_round,
  );
  ui.renderHud(state);
  ui.openRuleDraft(options, state, (rule) => {
    if (state.phase !== GAME_PHASES.RULE_DRAFT) return;
    state.active_rules = [{ ...rule, selected_round: state.current_round }];
    state.rule_history.push({
      id: rule.id,
      name: rule.name,
      selected_round: state.current_round,
      completed: false,
      completed_round: null,
    });
    ui.closeRuleDraft();
    prepareRound();
  });
  renderTutorial();
}

function enterShop() {
  if (state.phase !== GAME_PHASES.SHOP) return;
  if (shopBuffer === null) shopBuffer = shopService.getShopCards(state);
  else shopBuffer = shopService.repriceShopCards(state, shopBuffer);
  if (shopThemeBuffer === null) {
    const themed = shopService.getThemedShopCards(state);
    shopThemeBuffer = themed.cards;
    shopThemeType = themed.type;
  } else shopThemeBuffer = shopService.repriceShopCards(state, shopThemeBuffer);
  if (shopItemBuffer === null) shopItemBuffer = shopService.getShopItems(state);
  shopService.applyOpeningPriceOverride(state, [shopBuffer, shopThemeBuffer]);
  ui.openShop(
    state,
    shopBuffer,
    shopThemeBuffer,
    shopThemeType,
    shopItemBuffer,
    (item) => {
      if (shopService.buyCard(state, item)) {
        shopBuffer = shopBuffer.filter((card) => card !== item);
        shopThemeBuffer = shopThemeBuffer.filter((card) => card !== item);
        const refund = state.last_shop_transaction?.refund ?? 0;
        const dormant = state.last_shop_transaction?.dormant;
        ui.setShopMessage(`购入「${item.name}」，已加入永久牌组${dormant ? "；受预购券影响，下轮休眠" : ""}${refund > 0 ? `；候补餐罩返还 ${refund} 金币` : ""}。`, "success");
      } else {
        const status = shopService.getBuyCardStatus(state, item);
        const message = {
          insufficient_gold: `金币不足：需要 ${item.shop_price}，当前 ${state.gold}。`,
          deck_full: `牌组已达 ${GAME_CONFIG.max_deck_size} 张上限，先删除一张牌。`,
          copy_limit: `「${item.name}」已达到本局持有上限。`,
          missing_card: "商品数据已失效，请刷新商店。",
          invalid_offer: "商品价格异常，请刷新商店。",
        }[status.reason] ?? "购买失败，请刷新后重试。";
        ui.setShopMessage(message, "error");
      }
      enterShop();
    },
    (item) => {
      if (shopService.buyItem(state, item)) {
        shopItemBuffer = shopItemBuffer.filter((entry) => entry !== item);
        ui.setShopMessage(`购入道具「${item.name}」，效果已装备。`, "success");
      } else {
        const status = shopService.getBuyItemStatus(state, item);
        const message = status.reason === "insufficient_gold"
          ? `金币不足：道具需要 ${item.shop_price}，当前 ${state.gold}。`
          : status.reason === "already_owned"
            ? `已经持有「${item.name}」。`
            : "道具购买失败，请刷新后重试。";
        ui.setShopMessage(message, "error");
      }
      enterShop();
    },
    (cardUuid) => {
      if (shopService.removeCard(state, cardUuid)) {
        const transaction = state.last_shop_transaction;
        ui.setShopMessage(
          `删除「${transaction.card_name}」：${transaction.cost === 0 ? "使用免费删除" : `支付 ${transaction.cost}`}；下次删牌费用 ${state.remove_card_cost}。`,
          "success",
        );
      } else {
        const reason = state.deck.length <= 1 ? "牌组至少保留 1 张牌。" : "金币不足，无法删除这张牌。";
        ui.setShopMessage(reason, "error");
      }
      enterShop();
    },
    () => {
      const upgrade = shopService.buyPlateUpgrade(state);
      if (upgrade.success) {
        ui.setShopMessage(`支付 ${upgrade.cost} 金币，餐盘上限永久提升至 ${upgrade.plate_capacity}。`, "success");
      } else if (upgrade.reason === "max_capacity") {
        ui.setShopMessage(`餐盘已达到 ${GAME_CONFIG.max_plate_capacity} 张上限。`, "error");
      } else {
        ui.setShopMessage(`金币不足：餐盘扩容需要 ${upgrade.cost}，当前 ${state.gold}。`, "error");
      }
      enterShop();
    },
    () => {
      const reroll = shopService.rerollShop(state);
      if (!reroll.success) {
        ui.setShopMessage(`金币不足，刷新需要 ${reroll.cost} 金币。`, "error");
      } else {
        shopBuffer = reroll.cards;
        shopThemeBuffer = reroll.themed_cards;
        shopThemeType = reroll.theme_type;
        shopItemBuffer = reroll.items;
        ui.setShopMessage(reroll.free ? "使用免费刷新机会。" : `支付 ${reroll.cost} 金币刷新商品。`, "success");
        void ui.preloadCardArt([...shopBuffer, ...shopThemeBuffer]);
      }
      enterShop();
    },
    () => {
      if (state.phase !== GAME_PHASES.SHOP) return;
      ui.closeShop();
      transitionPhase(state, GAME_PHASES.NEXT_ROUND, { round: state.current_round });
      state.current_round += 1;
      enterRuleDraft();
    },
    shopService.getPlateUpgradeStatus(state),
  );
}

function tryCommit(action) {
  if (actionLocked || state.phase !== GAME_PHASES.PLAYING) return;
  if (gesture.commit(action)) actionLocked = true;
}

ui.bindControls({
  onEat: () => tryCommit("eat"),
  onDiscard: () => tryCommit("discard"),
  onPostpone: () => tryCommit("postpone"),
  onSound: () => {
    soundEnabled = !soundEnabled;
    if (soundEnabled) {
      startSound();
      toggleBGM(true);
      bgmStarted = true;
    } else {
      toggleBGM(false);
      bgmStarted = false;
    }
    ui.setSoundState(soundEnabled);
  },
});

ui.bindTutorial({
  onSkip: finishTutorial,
  onContinue: finishTutorial,
  onReplay: startTutorial,
});

window.addEventListener("keydown", (event) => {
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  tryCommit(event.key === "ArrowUp" ? "discard" : event.key === "ArrowDown" ? "eat" : "postpone");
});

function tickTimer() {
  if (state.phase === GAME_PHASES.PLAYING && state.round.started_at_ms !== null) {
    ui.renderTimer(state.round.timer_frozen_elapsed_ms ?? (browserPlatform.now() - state.round.started_at_ms));
  }
  requestAnimationFrame(tickTimer);
}

window.addEventListener("pagehide", () => gesture.destroy(), { once: true });
ui.setSoundState(soundEnabled);
requestAnimationFrame(tickTimer);
const launchGame = (withTutorial) => {
  startSound();
  if (withTutorial) startTutorial();
  else ui.hideStoryGuide();
  enterRuleDraft();
};

ui.openWelcome(
  () => launchGame(false),
  () => launchGame(true),
  browserPlatform.load_records()[0]?.score ?? null,
  browserPlatform.load_tutorial_complete(),
);
