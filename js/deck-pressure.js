import { GAME_CONFIG } from "./config.js";

function count(value) {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
}

function overloadSteps(deckSize) {
  const excess = Math.max(0, count(deckSize) - GAME_CONFIG.deck_soft_limit);
  return Math.ceil(excess / GAME_CONFIG.deck_pressure_step_cards);
}

export function getRoundDrawBudget(deckSize) {
  const size = count(deckSize);
  if (size <= GAME_CONFIG.round_draw_base) return size;
  const growth = Math.floor((size - GAME_CONFIG.round_draw_base) / GAME_CONFIG.round_draw_step_cards);
  return Math.min(GAME_CONFIG.round_draw_max, GAME_CONFIG.round_draw_base + growth);
}

export function takeRoundDrawPile(shuffledDeck) {
  const cards = [...shuffledDeck];
  const actionBudget = getRoundDrawBudget(cards.length);
  return {
    draw_pile: cards.slice(0, actionBudget),
    action_budget: actionBudget,
    reserve_count: Math.max(0, cards.length - actionBudget),
    deck_size_at_start: cards.length,
  };
}

export function getDeckPrecisionMultiplier(deckSize) {
  const size = count(deckSize);
  if (size <= GAME_CONFIG.precision_deck_maximum) return GAME_CONFIG.precision_deck_multiplier;
  if (size <= GAME_CONFIG.compact_deck_maximum) return GAME_CONFIG.compact_deck_multiplier;
  return 1;
}

export function getDeckUpkeep(deckSize) {
  return overloadSteps(deckSize);
}

export function getShopSizeSurcharge(deckSize) {
  return Math.min(GAME_CONFIG.shop_size_surcharge_max, overloadSteps(deckSize));
}

export function getOverloadSalvageBonus(deckSize) {
  return Math.min(GAME_CONFIG.overload_salvage_bonus_max, overloadSteps(deckSize));
}

export function getBaseGoldEconomy(deckSize, eatCount) {
  const eaten = count(eatCount);
  const gross = Math.min(GAME_CONFIG.base_gold_eat_cap, eaten);
  const upkeep = getDeckUpkeep(deckSize);
  return {
    eaten,
    cap: GAME_CONFIG.base_gold_eat_cap,
    gross,
    upkeep,
    net: Math.max(0, gross - upkeep),
  };
}

export function getDeckPressureSummary(deckSize) {
  const size = count(deckSize);
  const actionBudget = getRoundDrawBudget(size);
  return {
    deck_size: size,
    action_budget: actionBudget,
    reserve_count: Math.max(0, size - actionBudget),
    precision_multiplier: getDeckPrecisionMultiplier(size),
    gold_cap: GAME_CONFIG.base_gold_eat_cap,
    upkeep: getDeckUpkeep(size),
    shop_surcharge: getShopSizeSurcharge(size),
    salvage_bonus: getOverloadSalvageBonus(size),
  };
}
