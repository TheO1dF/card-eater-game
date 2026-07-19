import { GAME_CONFIG, isQuestRound } from "./config.js";
import { GAME_PHASES, createInitialPlayerState, resetRoundState, transitionPhase } from "./state.js";
import { createGestureController } from "./gesture.js";
import { createRoundEngine } from "./engine.js";
import { createShopService } from "./shop.js";
import { randomDraftRules } from "./rules.js";
import { applyRoundEndItems, applyRoundItemSetup } from "./items.js";
import { activatePendingQuestRewards, applyQuestRoundPenalty, finalizeQuest, randomDraftQuests, selectQuest } from "./quests.js";
import { createUI } from "./ui.js";
import { browserPlatform } from "./platform.js";
import { initAudio, playSound, toggleBGM } from "./audio.js";
import { safeAdd } from "./numbers.js";
import { takeRoundDrawPile } from "./plate.js";
import { activateReshuffle, getReshuffleStatus } from "./reshuffle.js";

const state = createInitialPlayerState({ create_id: browserPlatform.create_id });
const engine = createRoundEngine();
const shopService = createShopService({ random: browserPlatform.random, create_id: browserPlatform.create_id });
const ui = createUI(document);

let shopBuffer = null;
let shopItemBuffer = null;
let actionLocked = true;
let streak = { action: null, count: 0 };
let soundEnabled = true;
let bgmStarted = false;

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

function refreshTable() {
  ui.renderStack(state.round.draw_pile, gesture);
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
  state.round.elapsed_ms = Math.max(1, browserPlatform.now() - state.round.started_at_ms);

  const result = engine.finalizeRound(state);
  result.gold_reward = engine.getGoldReward(state);
  result.eat_actions = state.round.eat_sequence.length;
  result.gold_eaten = new Set(state.round.eat_sequence.map((entry) => entry.card_uuid)).size;
  state.gold = safeAdd(state.gold, result.gold_reward);
  result.breakdown.splice(-1, 0, { label: "基础金币（每张实体牌每轮首次吃 +1）", text: `+${result.gold_reward}`, kind: "bonus" });
  result.quest_result = finalizeQuest(state, result);
  result.round_end_item_results = applyRoundEndItems(state, { random: browserPlatform.random });
  result.round_end_item_results.forEach((message) => {
    result.breakdown.splice(-1, 0, { label: "道具 · 轮末变化", text: message, kind: "rule" });
  });
  refreshTable();

  const milestone = engine.levelProgressCheck(state);
  const failed = milestone.target > 0 && !milestone.passed;
  const won = !failed && state.current_round === GAME_CONFIG.total_rounds;
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
    shopItemBuffer = shopService.getShopItems(state);
    // Warm the shop art while the summary is visible, but never make game
    // progression depend on image decoding. Safari may leave decode() pending
    // for a long time on a slow or interrupted connection.
    void ui.preloadCardArt(shopBuffer);
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
    actionLocked = false;
    refreshTable();
    ui.showEffectFlash(`牌堆已空 · 可重洗 ${reshuffle.replayable_count} 张，剩余 ${reshuffle.charges} 次`);
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
  const entry = engine.recordAction(state, action, card);
  state.round.draw_pile.pop();
  if (state.deck.some((item) => item.uuid === card.uuid)) state.round.spent_pile.push(card);
  if (state.round.consume_next_uuid) {
    const consumed = state.round.draw_pile.at(-1);
    if (consumed?.uuid === state.round.consume_next_uuid) state.round.draw_pile.pop();
    state.round.consume_next_uuid = null;
  }

  ui.showFloatingScore(entry.points, action, hitCount);
  if (entry.effect_triggered) ui.showEffectFlash(entry.effect_triggered);
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
  }
}

const gesture = createGestureController({
  onEat: (card) => handleAction("eat", card),
  onDiscard: (card) => handleAction("discard", card),
  onProgress: (progress) => ui.setGestureProgress(progress),
  onCommit: () => { actionLocked = true; },
});

function prepareRound() {
  resetRoundState(state);
  const shuffledDeck = shuffle(state.deck.map((card) => ({ ...card, effect: card.effect ? { ...card.effect } : null })));
  Object.assign(state.round, takeRoundDrawPile(shuffledDeck, state.plate_capacity));
  applyRoundItemSetup(state);
  applyQuestRoundPenalty(state, browserPlatform.random);
  shopBuffer = null;
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
  });
}

function enterRuleDraft() {
  if (state.phase === GAME_PHASES.INIT || state.phase === GAME_PHASES.NEXT_ROUND) {
    transitionPhase(state, GAME_PHASES.RULE_DRAFT, { round: state.current_round });
  }
  if (state.active_quest?.round < state.current_round) state.active_quest = null;
  const activatedRewards = activatePendingQuestRewards(state);
  if (activatedRewards.length > 0) state.last_reward_activation = `任务奖励生效：${activatedRewards.join("、")}`;
  actionLocked = true;
  const canReshuffle = state.items.some((item) => item.effect?.kind === "round_reshuffle_charge")
    || state.deck.some((card) => card.effect?.kind === "gain_reshuffle_charge_destroy");
  const options = randomDraftRules(
    GAME_CONFIG.draft_size,
    state.active_rules,
    browserPlatform.random,
    state.deck,
    state.current_round,
    { can_reshuffle: canReshuffle },
  );
  ui.renderHud(state);
  ui.openRuleDraft(options, state, (rule) => {
    if (state.phase !== GAME_PHASES.RULE_DRAFT) return;
    state.active_rules.push({ ...rule });
    state.rule_history.push({ id: rule.id, name: rule.name, round: state.current_round });
    ui.closeRuleDraft();
    if (isQuestRound(state.current_round) && state.active_quest?.round !== state.current_round) enterQuestDraft();
    else prepareRound();
  });
}

function enterQuestDraft() {
  transitionPhase(state, GAME_PHASES.QUEST_DRAFT, { round: state.current_round });
  actionLocked = true;
  const options = randomDraftQuests(GAME_CONFIG.draft_size, state, browserPlatform.random);
  ui.openQuestDraft(options, state, (quest) => {
    if (state.phase !== GAME_PHASES.QUEST_DRAFT) return;
    selectQuest(state, quest, browserPlatform.create_id);
    ui.closeQuestDraft();
    prepareRound();
  });
}

function enterShop() {
  if (state.phase !== GAME_PHASES.SHOP) return;
  if (shopBuffer === null) shopBuffer = shopService.getShopCards(state);
  else shopBuffer = shopService.repriceShopCards(state, shopBuffer);
  if (shopItemBuffer === null) shopItemBuffer = shopService.getShopItems(state);
  ui.openShop(
    state,
    shopBuffer,
    shopItemBuffer,
    (item) => {
      if (shopService.buyCard(state, item)) {
        shopBuffer = shopBuffer.filter((card) => card !== item);
        ui.setShopMessage(`购入「${item.name}」，已加入永久牌组。`, "success");
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
          `删除「${transaction.card_name}」：支付 ${transaction.cost}；下次删牌费用 ${state.remove_card_cost}。`,
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
        shopItemBuffer = reroll.items;
        ui.setShopMessage(reroll.free ? "使用免费刷新机会。" : `支付 ${reroll.cost} 金币刷新商品。`, "success");
        void ui.preloadCardArt(shopBuffer);
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

function tryReshuffle() {
  if (actionLocked || state.phase !== GAME_PHASES.PLAYING) return;
  const result = activateReshuffle(state, shuffle);
  if (!result.success) return;
  actionLocked = true;
  streak = { action: null, count: 0 };
  ui.showEffectFlash(`重洗启动 · ${result.replayed_count} 张牌回到餐盘 · 剩余 ${result.remaining_charges} 次`);
  refreshTable();
  ui.playReshuffleAnimation();
  window.setTimeout(() => {
    if (state.phase !== GAME_PHASES.PLAYING) return;
    actionLocked = false;
    ui.renderHud(state);
  }, 580);
}

function tryFinishRound() {
  if (actionLocked || state.phase !== GAME_PHASES.PLAYING || state.round.draw_pile.length > 0) return;
  completeRound();
}

function tryCommit(action) {
  if (actionLocked || state.phase !== GAME_PHASES.PLAYING) return;
  if (gesture.commit(action)) actionLocked = true;
}

ui.bindControls({
  onEat: () => tryCommit("eat"),
  onDiscard: () => tryCommit("discard"),
  onReshuffle: tryReshuffle,
  onFinishRound: tryFinishRound,
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

window.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  event.preventDefault();
  tryCommit(event.key === "ArrowUp" ? "discard" : "eat");
});

function tickTimer() {
  if (state.phase === GAME_PHASES.PLAYING && state.round.started_at_ms !== null) {
    ui.renderTimer(browserPlatform.now() - state.round.started_at_ms);
  }
  requestAnimationFrame(tickTimer);
}

window.addEventListener("pagehide", () => gesture.destroy(), { once: true });
ui.setSoundState(soundEnabled);
requestAnimationFrame(tickTimer);
ui.openWelcome(() => {
  startSound();
  enterRuleDraft();
}, browserPlatform.load_records()[0]?.score ?? null);
