// 初始基础卡组池 (玩家一开始拥有的牌)
const BASE_CARD_DEFS =[
  { id: "F001", name: "苹果", rarity: "普通", type: "水果", eat_points: 1, discard_points: 0, effect: null },
  { id: "F002", name: "西瓜", rarity: "普通", type: "水果", eat_points: 2, discard_points: 0, effect: null },
  { id: "K001", name: "汉堡", rarity: "普通", type: "快餐", eat_points: 3, discard_points: 0, effect: { kind: "debuff_next_action", description: "吃后下一张牌得分-1", amount: -1, count: 1 } },
  { id: "A002", name: "猴子", rarity: "普通", type: "动物", eat_points: -2, discard_points: 1, effect: { kind: "scale_by_history", description: "弃掉时，本轮每吃一张水果额外+1分", action: "eat", tag: "水果", mult: 1 } },
];

// 商店专属扩充卡池 (肉鸽购买池)
const SHOP_CARD_DEFS =[
  { id: "F003", name: "榨汁机", rarity: "罕见", type: "工具", eat_points: -2, discard_points: 2, effect: { kind: "buff_next_tag", description: "弃掉后，接下来的3张水果得分x2", tag: "水果", count: 3, mult: 2 } },
  { id: "F004", name: "金苹果", rarity: "稀有", type: "水果", eat_points: 2, discard_points: 1, effect: { kind: "permanent_growth_eat", description: "每次被吃掉时，吃牌点数永久+1", amount: 1 } },
  { id: "K002", name: "冰可乐", rarity: "罕见", type: "快餐", eat_points: 1, discard_points: 1, effect: { kind: "clear_debuff_and_buff_next_tag", description: "清除负面，下一张快餐得分+3", clearDebuff: true, tag: "快餐", count: 1, add: 3 } },
  { id: "A001", name: "贪吃狗", rarity: "罕见", type: "动物", eat_points: -3, discard_points: 1, effect: { kind: "scale_by_history", description: "弃掉时，本轮每吃一张快餐额外+2分", action: "eat", tag: "快餐", mult: 2 } },
  { id: "I001", name: "储钱罐", rarity: "稀有", type: "物品", eat_points: 0, discard_points: 0, effect: { kind: "gold_economy", description: "弃掉结算+3金币；吃掉给10金币并永久销毁", discard_add_gold: 3, eat_destroy_add_gold: 10 } },
  { id: "I002", name: "优惠券", rarity: "罕见", type: "物品", eat_points: 0, discard_points: 1, effect: { kind: "shop_discount", description: "弃掉后，本轮商店所有卡牌价格-1", discount: 1 } },
  { id: "S001", name: "陨石", rarity: "传奇", type: "星体", eat_points: -10, discard_points: 5, effect: { kind: "discard_all_remaining", description: "弃掉时，立刻将剩余牌全部弃掉并计分", allRemaining: true } },
  { id: "F011", name: "魔鬼椒", rarity: "罕见", type: "水果", eat_points: -5, discard_points: 1, effect: { kind: "buff_next_tag", description: "接下来的 2 张任何牌吃分 x3", tag: "*", count: 2, mult: 3 } },
  { id: "T002", name: "堆肥箱", rarity: "稀有", type: "工具", eat_points: -2, discard_points: 0, effect: { kind: "scale_by_history", description: "弃掉时，本轮之前每【弃】过一张任何牌，额外+3分", action: "discard", tag: "*", mult: 3 } },
  { id: "K003", name: "发馊的外卖", rarity: "稀有", type: "快餐", eat_points: -2, discard_points: -5, effect: { kind: "retro_multiplier_eaten_tag", description: "吃下后，本轮此前吃掉的所有【快餐】基础分数总和翻倍(作为额外加分)", tag: "快餐", mult: 2 } },
  { id: "S002", name: "黑洞", rarity: "传奇", type: "星体", eat_points: 0, discard_points: 0, effect: { kind: "discard_all_remaining", description: "吃掉扣20分；弃掉时，立刻将剩余卡牌全弃并结算总分 x1.5", allRemaining: true, applyGlobalMult: 1.5 } }
];

export const CARD_TYPES = Object.freeze({ FRUIT: "水果", TOOL: "工具", FASTFOOD: "快餐", ANIMAL: "动物", ITEM: "物品", CELESTIAL: "星体", SPECIAL: "特殊" });

export const CARD_LIBRARY = Object.freeze([...BASE_CARD_DEFS, ...SHOP_CARD_DEFS].reduce((acc, card) => {
    acc[card.id] = Object.freeze({ ...card });
    return acc;
  }, {})
);

// 开局送给玩家的初始牌组 (各塞几张凑成10张)
export function createInitialDeck() {
  const deck =[];
  for(let i=0; i<2; i++) deck.push({...BASE_CARD_DEFS.find(c => c.id === "F001")}); // 2苹果
  for(let i=0; i<2; i++) deck.push({...BASE_CARD_DEFS.find(c => c.id === "F002")}); // 2西瓜
  for(let i=0; i<1; i++) deck.push({...BASE_CARD_DEFS.find(c => c.id === "K001")}); // 1汉堡
  for(let i=0; i<1; i++) deck.push({...BASE_CARD_DEFS.find(c => c.id === "A002")}); // 2猴子
  // 为每张卡赋予唯一 UUID，防止商店删牌时误删同名牌
  return deck.map(card => ({ ...card, uuid: Math.random().toString(36).substr(2, 9) }));
}

// 商店使用的肉鸽扩充卡池
export function createShopCardPool() {
  return SHOP_CARD_DEFS.map((card) => ({ ...card }));
}

export function getCardById(id) {
  const card = CARD_LIBRARY[id];
  return card ? { ...card } : null;
}