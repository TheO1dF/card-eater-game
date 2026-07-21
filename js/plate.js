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
  const reserve = cards.slice(actionBudget);
  return {
    draw_pile: cards.slice(0, actionBudget),
    action_budget: actionBudget,
    reserve_count: reserve.length,
    reserve_type_counts: reserve.reduce((counts, card) => {
      counts[card.type] = (counts[card.type] ?? 0) + 1;
      return counts;
    }, {}),
  };
}

export function getPlateUpgradeBaseCost(upgradeCount) {
  const level = count(upgradeCount);
  return GAME_CONFIG.plate_upgrade_base_cost + level * (level + 1) / 2;
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

export function postponeCurrentCard(state) {
  const pile = state?.round?.draw_pile;
  if (!Array.isArray(pile) || pile.length < 2) return { success: false, reason: "not_enough_cards" };
  const card = pile.pop();
  pile.unshift(card);
  state.round.postponed_uuids ??= [];
  if (!state.round.postponed_uuids.includes(card.uuid)) state.round.postponed_uuids.push(card.uuid);
  state.round.postpone_count = (state.round.postpone_count ?? 0) + 1;
  return { success: true, card, remaining: pile.length };
}
