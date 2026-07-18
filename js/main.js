import { GAME_CONFIG } from "./config.js";
import { GAME_PHASES, createInitialPlayerState, resetRoundState, transitionPhase } from "./state.js";
import { createGestureController } from "./gesture.js";
import { createRoundEngine } from "./engine.js";
import { createShopService } from "./shop.js";
import { randomDraftRules } from "./rules.js";
import { createUI } from "./ui.js";
import { browserPlatform } from "./platform.js";
import { initAudio, playSound, toggleBGM } from "./audio.js";

const state = createInitialPlayerState({ create_id: browserPlatform.create_id });
const engine = createRoundEngine();
const shopService = createShopService({ random: browserPlatform.random, create_id: browserPlatform.create_id });
const ui = createUI(document);

let shopBuffer = [];
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
  const baseGold = engine.getGoldReward(state);
  result.gold_reward = baseGold;
  state.gold += baseGold;
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

  if (!outcome && shopBuffer.length === 0) {
    shopBuffer = shopService.getShopCards(state);
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
  while (state.round.draw_pile.length > 0) {
    const forcedCard = state.round.draw_pile.pop();
    engine.recordAction(state, "discard", forcedCard);
  }
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

  resolveForcedDiscards();
  ui.setGestureProgress({ progress: 0, direction: null });
  if (state.round.draw_pile.length === 0) completeRound();
  else {
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
  state.round.draw_pile = shuffle(state.deck.map((card) => ({ ...card, effect: card.effect ? { ...card.effect } : null })));
  shopBuffer = [];
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
  actionLocked = true;
  const options = randomDraftRules(GAME_CONFIG.draft_size, state.active_rules, browserPlatform.random, state.deck, state.current_round);
  ui.renderHud(state);
  ui.openRuleDraft(options, state, (rule) => {
    if (state.phase !== GAME_PHASES.RULE_DRAFT) return;
    state.active_rules.push({ ...rule });
    state.rule_history.push({ id: rule.id, name: rule.name, round: state.current_round });
    ui.closeRuleDraft();
    prepareRound();
  });
}

function enterShop() {
  if (state.phase !== GAME_PHASES.SHOP) return;
  if (shopBuffer.length === 0) shopBuffer = shopService.getShopCards(state);
  ui.openShop(
    state,
    shopBuffer,
    (item) => {
      if (shopService.buyCard(state, item)) {
        shopBuffer = shopBuffer.filter((card) => card !== item);
        ui.setShopMessage(`购入「${item.name}」，已加入永久牌组。`, "success");
      } else {
        ui.setShopMessage("金币不足，换个目标吧。", "error");
      }
      enterShop();
    },
    (cardUuid) => {
      if (shopService.removeCard(state, cardUuid)) {
        ui.setShopMessage(`精简成功，下次删牌费用为 ${state.remove_card_cost}。`, "success");
      } else {
        const reason = state.deck.length <= 1 ? "牌组至少保留 1 张牌。" : "金币不足，无法删除这张牌。";
        ui.setShopMessage(reason, "error");
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
  );
}

function tryCommit(action) {
  if (actionLocked || state.phase !== GAME_PHASES.PLAYING) return;
  if (gesture.commit(action)) actionLocked = true;
}

ui.bindControls({
  onEat: () => tryCommit("eat"),
  onDiscard: () => tryCommit("discard"),
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
