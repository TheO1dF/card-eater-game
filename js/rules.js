export const RULE_LIBRARY = Object.freeze([
  { id: "combo-fruit-3", name: "水果连击", description: "本轮连吃3张水果，总分 x1.5", scope: "sequence_eat", targetType: "水果", count: 3, multiplier: 1.5 },
  { id: "combo-fastfood-2", name: "暴食者", description: "本轮连吃2张快餐，总分 x1.5", scope: "sequence_eat", targetType: "快餐", count: 2, multiplier: 1.5 },
  { id: "speed-clear-8", name: "风驰电掣", description: "8秒内滑完本轮牌组，总分 x2.0", scope: "time_limit", timeLimitMs: 8000, multiplier: 2.0 },
  { id: "healthy-diet", name: "健康饮食", description: "本轮不吃任何快餐牌，总分 x1.5", scope: "no_eat_type", targetType: "快餐", multiplier: 1.5 },
  { id: "discard-master", name: "断舍离大师", description: "本轮丢弃至少 4 张牌，总分 x1.5", scope: "min_discard", count: 4, multiplier: 1.5 },
  { id: "fruit-base-up", name: "果园丰收", description: "所有水果牌吃牌基础分 +1", scope: "flat_bonus", targetType: "水果", bonus: 1, multiplier: 1},
  { id: "exact-eat-5", name: "精准节食", description: "本轮【精确】只吃 5 张牌（多一张少一张都不行），总分 x2.5", scope: "exact_eat_count", count: 5, multiplier: 2.5 },
  { id: "equal-balance", name: "太极阴阳", description: "本轮吃掉的牌数与弃掉的牌数【完全相等】，总分 x3.0", scope: "equal_eat_discard", multiplier: 3.0 },
  { id: "deck-minimalism", name: "极简主义", description: "如果你的永久卡组总数 ≤ 5 张，总分 x2.0", scope: "max_deck_size", count: 5, multiplier: 2.0 },
  { id: "discard-master", name: "断舍离宗师", description: "本轮丢弃至少 8 张牌，总分 x2.0", scope: "min_discard", count: 8, multiplier: 2.0 },
]);

// 抽取时不重复抽取玩家已经拥有的规则
export function randomDraftRules(count = 3, activeRules =[]) {
  const activeIds = activeRules.map(r => r.id);
  const pool = RULE_LIBRARY.filter(r => !activeIds.includes(r.id));
  const picked =[];
  while (picked.length < count && pool.length > 0) {
    picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return picked;
}