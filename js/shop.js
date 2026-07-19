import { GAME_CONFIG } from "./config.js";
import { createShopCardPool, getCardById } from "./data.js";
import { addItem, createShopItemPool, getItemById } from "./items.js";
import { getRarityPrice, getShopWeight, RARITY_MODEL } from "./balance.js";
import { safeAdd, safePositiveInteger } from "./numbers.js";
import { getPlateUpgradeBaseCost, getPlateUpgradeCost } from "./plate.js";

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

  function getCardPriceModifiers(state) {
    const itemDiscount = state.items
      .filter((entry) => entry.effect?.kind === "shop_price_discount")
      .reduce((total, entry) => total + (entry.effect.amount ?? 0), 0);
    return { discount: (state.round.shop_discount ?? 0) + itemDiscount };
  }

  function repriceShopCards(state, cards) {
    const { discount } = getCardPriceModifiers(state);
    return cards.map((card) => ({
      ...card,
      shop_base_price: getRarityPrice(card.rarity),
      shop_discount: discount,
      shop_price: Math.max(1, getRarityPrice(card.rarity) - discount),
    }));
  }

  function getShopCards(state) {
    const pool = createShopCardPool().filter((card) => {
      if ((card.min_shop_round ?? 1) > state.current_round) return false;
      if (!card.max_copies) return true;
      return state.deck.filter((owned) => owned.id === card.id).length < card.max_copies;
    });
    const offers = [];
    while (offers.length < GAME_CONFIG.shop_offer_count && pool.length > 0) {
      offers.push(takeWeighted(pool, state.current_round, random));
    }
    return repriceShopCards(state, offers);
  }

  function getShopItems(state) {
    const pool = createShopItemPool().filter((entry) => (
      (entry.min_shop_round ?? 1) <= state.current_round
      && (entry.max_shop_round ?? GAME_CONFIG.total_rounds) >= state.current_round
      && !state.items.some((owned) => owned.id === entry.id)
      && !state.pending_rewards?.some((reward) => reward.item_id === entry.id)
    ));
    const offers = [];
    while (offers.length < GAME_CONFIG.shop_item_offer_count && pool.length > 0) {
      offers.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
    }
    return offers.map((entry) => ({ ...entry, shop_price: entry.shop_price }));
  }

  function getBuyCardStatus(state, card) {
    if (!card || !Number.isFinite(card.shop_price)) return { ok: false, reason: "invalid_offer" };
    if (state.deck.length >= GAME_CONFIG.max_deck_size) return { ok: false, reason: "deck_full" };
    if (state.gold < card.shop_price) return { ok: false, reason: "insufficient_gold" };
    const cleanCard = getCardById(card.id);
    if (!cleanCard) return { ok: false, reason: "missing_card" };
    if (cleanCard.max_copies && state.deck.filter((owned) => owned.id === cleanCard.id).length >= cleanCard.max_copies) {
      return { ok: false, reason: "copy_limit" };
    }
    return { ok: true, reason: null, card: cleanCard };
  }

  function buyCard(state, card) {
    const status = getBuyCardStatus(state, card);
    if (!status.ok) return false;
    const cleanCard = status.card;
    state.gold = safeAdd(state.gold, -card.shop_price);
    state.deck.push({ ...cleanCard, uuid: createId(cleanCard, state.deck.length) });
    let refund = 0;
    if (state.round.reserve_count > 0) {
      for (const entry of state.items.filter((owned) => owned.effect?.kind === "reserve_purchase_refund")) {
        const key = `item:${entry.id}:purchase-refund`;
        if (state.round.effect_trigger_counts[key]) continue;
        state.round.effect_trigger_counts[key] = 1;
        refund = safeAdd(refund, Math.min(card.shop_price, entry.effect.gold ?? 0));
      }
    }
    state.gold = safeAdd(state.gold, refund);
    state.last_shop_transaction = { kind: "buy_card", card_name: cleanCard.name, cost: card.shop_price, refund };
    return true;
  }

  function getBuyItemStatus(state, entry) {
    if (!entry || !Number.isFinite(entry.shop_price)) return { ok: false, reason: "invalid_offer" };
    if (state.items.some((owned) => owned.id === entry.id)) return { ok: false, reason: "already_owned" };
    if (state.gold < entry.shop_price) return { ok: false, reason: "insufficient_gold" };
    return { ok: Boolean(getItemById(entry.id)), reason: getItemById(entry.id) ? null : "missing_item" };
  }

  function buyItem(state, entry) {
    const status = getBuyItemStatus(state, entry);
    if (!status.ok) return false;
    state.gold = safeAdd(state.gold, -entry.shop_price);
    return addItem(state, entry.id);
  }

  function getRerollCost(state) {
    if (state.round.shop_free_rerolls > 0) return 0;
    const fullPlateDiscount = state.deck.length <= state.plate_capacity
      ? state.items
        .filter((entry) => entry.effect?.kind === "full_plate_reroll_discount")
        .reduce((total, entry) => total + (entry.effect.amount ?? 0), 0)
      : 0;
    return Math.max(
      1,
      GAME_CONFIG.shop_reroll_base_cost + state.round.shop_reroll_count * GAME_CONFIG.shop_reroll_cost_step - fullPlateDiscount,
    );
  }

  function rerollShop(state) {
    const cost = getRerollCost(state);
    if (cost > 0 && state.gold < cost) return { success: false, cost, cards: null, free: false };
    const free = cost === 0;
    if (free) state.round.shop_free_rerolls = Math.max(0, state.round.shop_free_rerolls - 1);
    else state.gold = safeAdd(state.gold, -cost);
    state.round.shop_reroll_count = safePositiveInteger(state.round.shop_reroll_count + 1, 1000);
    return { success: true, cost, cards: getShopCards(state), items: getShopItems(state), free };
  }

  function getPlateUpgradeStatus(state) {
    const discount = state.items
      .filter((entry) => entry.effect?.kind === "plate_upgrade_discount")
      .reduce((total, entry) => total + (entry.effect.amount ?? 0), 0);
    const baseCost = getPlateUpgradeBaseCost(state.plate_upgrade_count);
    const cost = getPlateUpgradeCost(state.plate_upgrade_count, discount);
    if (state.plate_capacity >= GAME_CONFIG.max_plate_capacity) {
      return { ok: false, reason: "max_capacity", cost, base_cost: baseCost, discount };
    }
    if (state.gold < cost) return { ok: false, reason: "insufficient_gold", cost, base_cost: baseCost, discount };
    return { ok: true, reason: null, cost, base_cost: baseCost, discount };
  }

  function buyPlateUpgrade(state) {
    const status = getPlateUpgradeStatus(state);
    if (!status.ok) return status;
    state.gold = safeAdd(state.gold, -status.cost);
    state.plate_capacity = Math.min(GAME_CONFIG.max_plate_capacity, state.plate_capacity + 1);
    state.plate_upgrade_count = safePositiveInteger(state.plate_upgrade_count + 1, GAME_CONFIG.max_plate_capacity);
    state.last_shop_transaction = {
      kind: "plate_upgrade",
      cost: status.cost,
      plate_capacity: state.plate_capacity,
    };
    return { ...status, success: true, plate_capacity: state.plate_capacity };
  }

  function removeCard(state, cardUuid) {
    if (state.deck.length <= 1 || state.gold < state.remove_card_cost) return false;
    const index = state.deck.findIndex((card) => card.uuid === cardUuid);
    if (index < 0) return false;

    const removed = state.deck[index];
    const cost = state.remove_card_cost;
    state.gold = safeAdd(state.gold, -cost);
    state.deck.splice(index, 1);
    state.remove_count += 1;
    state.remove_card_cost = state.remove_count * GAME_CONFIG.delete_cost_step;
    state.last_shop_transaction = {
      kind: "remove",
      card_name: removed.name,
      cost,
    };
    return true;
  }

  return {
    getShopCards,
    repriceShopCards,
    getShopItems,
    getBuyCardStatus,
    buyCard,
    getBuyItemStatus,
    buyItem,
    removeCard,
    getRerollCost,
    rerollShop,
    getPlateUpgradeStatus,
    buyPlateUpgrade,
  };
}
