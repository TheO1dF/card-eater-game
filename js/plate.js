import { GAME_CONFIG } from "./config.js";

function count(value) {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
}

export function getPlateDrawBudget(deckSize, plateCapacity) {
  return Math.min(count(deckSize), count(plateCapacity));
}

export function takeRoundDrawPile(shuffledDeck, plateCapacity) {
  const cards = [...shuffledDeck];
  const actionBudget = getPlateDrawBudget(cards.length, plateCapacity);
  return {
    draw_pile: cards.slice(0, actionBudget),
    action_budget: actionBudget,
    reserve_count: Math.max(0, cards.length - actionBudget),
  };
}

export function getPlateUpgradeBaseCost(upgradeCount) {
  const level = count(upgradeCount);
  return GAME_CONFIG.plate_upgrade_base_cost + level * (level + 3) / 2;
}

export function getPlateUpgradeCost(upgradeCount, discount = 0) {
  return Math.max(1, getPlateUpgradeBaseCost(upgradeCount) - count(discount));
}

export function getPlateSummary(deckSize, plateCapacity) {
  const size = count(deckSize);
  const capacity = Math.max(1, count(plateCapacity));
  const actionBudget = getPlateDrawBudget(size, capacity);
  return {
    deck_size: size,
    capacity,
    action_budget: actionBudget,
    reserve_count: Math.max(0, size - actionBudget),
  };
}
