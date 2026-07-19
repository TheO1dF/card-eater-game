import { GAME_CONFIG } from "./config.js";
import { createShopCardPool, getCardById } from "./data.js";
import { getRarityPrice, getShopWeight, RARITY_MODEL } from "./balance.js";
import { safeAdd, safePositiveInteger } from "./numbers.js";

export const RARITY_PRICE = Object.freeze(Object.fromEntries(
  Object.entries(RARITY_MODEL).map(([rarity, model]) => [rarity, model.price]),
));

function takeWeighted(pool, round, random) {
  const weights = pool.map((card) => getShopWeight(card, round));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return pool.splice(0, 1)[0];

  let roll = random() * total;
  for (let index = 0; index < pool.length; index += 1) {
    roll -= weights[index];
    if (roll < 0) return pool.splice(index, 1)[0];
  }
  return pool.pop();
}

export function createShopService(options = {}) {
  const random = options.random ?? Math.random;
  const createId = options.create_id ?? (() => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

  function getShopCards(state) {
    const discount = state.round.shop_discount ?? 0;
    const pool = createShopCardPool().filter((card) => {
      if ((card.min_shop_round ?? 1) > state.current_round) return false;
      if (!card.max_copies) return true;
      return state.deck.filter((owned) => owned.id === card.id).length < card.max_copies;
    });
    const offers = [];
    while (offers.length < GAME_CONFIG.shop_offer_count && pool.length > 0) {
      offers.push(takeWeighted(pool, state.current_round, random));
    }
    return offers
      .map((card) => ({
        ...card,
        shop_price: Math.max(1, getRarityPrice(card.rarity) - discount),
      }));
  }

  function buyCard(state, card) {
    if (state.deck.length >= GAME_CONFIG.max_deck_size || state.gold < card.shop_price) return false;
    const cleanCard = getCardById(card.id);
    if (!cleanCard) return false;
    if (cleanCard.max_copies && state.deck.filter((owned) => owned.id === cleanCard.id).length >= cleanCard.max_copies) return false;
    state.gold = safeAdd(state.gold, -card.shop_price);
    state.deck.push({ ...cleanCard, uuid: createId(cleanCard, state.deck.length) });
    return true;
  }

  function getRerollCost(state) {
    if (state.round.shop_free_rerolls > 0) return 0;
    return GAME_CONFIG.shop_reroll_base_cost + state.round.shop_reroll_count * GAME_CONFIG.shop_reroll_cost_step;
  }

  function rerollShop(state) {
    const cost = getRerollCost(state);
    if (cost > 0 && state.gold < cost) return { success: false, cost, cards: null, free: false };
    const free = cost === 0;
    if (free) state.round.shop_free_rerolls = Math.max(0, state.round.shop_free_rerolls - 1);
    else state.gold = safeAdd(state.gold, -cost);
    state.round.shop_reroll_count = safePositiveInteger(state.round.shop_reroll_count + 1, 1000);
    return { success: true, cost, cards: getShopCards(state), free };
  }

  function removeCard(state, cardUuid) {
    if (state.deck.length <= 1 || state.gold < state.remove_card_cost) return false;
    const index = state.deck.findIndex((card) => card.uuid === cardUuid);
    if (index < 0) return false;

    state.gold = safeAdd(state.gold, -state.remove_card_cost);
    state.deck.splice(index, 1);
    state.remove_count += 1;
    state.remove_card_cost = state.remove_count * GAME_CONFIG.delete_cost_step;
    return true;
  }

  return { getShopCards, buyCard, removeCard, getRerollCost, rerollShop };
}
