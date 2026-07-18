export const RARITY_MODEL = Object.freeze({
  "普通": Object.freeze({ price: 3, shop_weight: 58, expected_base: 1, synergy_ceiling: 3 }),
  "罕见": Object.freeze({ price: 6, shop_weight: 27, expected_base: 2, synergy_ceiling: 7 }),
  "稀有": Object.freeze({ price: 10, shop_weight: 12, expected_base: 3, synergy_ceiling: 16 }),
  "传奇": Object.freeze({ price: 16, shop_weight: 3, expected_base: 1, synergy_ceiling: 40 }),
});

export const CARD_ROLES = Object.freeze({
  BASELINE: "baseline",
  SETUP: "setup",
  PAYOFF: "payoff",
  SACRIFICE: "sacrifice",
  ENGINE: "engine",
  ECONOMY: "economy",
});

export function getRarityPrice(rarity) {
  return RARITY_MODEL[rarity]?.price ?? RARITY_MODEL["普通"].price;
}

export function getShopWeight(card, round) {
  const base = RARITY_MODEL[card.rarity]?.shop_weight ?? 1;
  if (card.rarity === "传奇" && round < 6) return 0;
  if (card.rarity === "稀有" && round < 3) return base * 0.3;
  if (card.rarity === "普通" && round >= 10) return base * 0.55;
  if (card.rarity === "稀有" && round >= 8) return base * 1.8;
  if (card.rarity === "传奇" && round >= 11) return base * 3;
  return base;
}

