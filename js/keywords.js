export const KEYWORD_LIBRARY = Object.freeze({
  "摧毁": "将指定卡牌从本局永久牌组中移除；本轮之后也不会再次抽到。",
  "相邻": "读取初始牌序中紧挨本牌的前一张、后一张或两侧卡牌。",
  "成长": "永久提高这张实体卡牌写明的吃分或弃分；重洗与下一轮都会保留。",
  "生成": "向永久牌组加入一张新卡；达到牌组或该效果的生成上限时不会加入。",
  "重洗": "将本轮已处理且仍在永久牌组中的牌重新洗回抽牌堆。",
  "净化": "移除尚未结算的负面后续效果；已经扣除的分数不会返还。",
  "追溯": "读取本轮此前已经完成的行动或得分，不会再次触发那些卡牌。",
  "蓄势": "为之后符合条件的若干张牌保存加成；不符合条件的牌不会消耗次数。",
  "位置": "检查本牌在本轮行动顺序中的首位、次位、中位或末位。",
  "规模": "按永久牌组当前的张数、类别数量或不同卡名数量计算。",
  "复制": "复制指定分数数值，但不会复制被复制卡牌的效果。",
  "经济": "改变金币、商店价格、刷新费用或餐盘扩容费用。",
  "储存": "把数值保存在这张实体牌上，跨轮保留，直到效果写明的结算方式将其清空。",
  "预判": "读取本轮尚未处理的牌，但不会改变它们的牌序或触发它们的效果。",
});

const KIND_KEYWORDS = Object.freeze({
  bonus_if_previous: ["相邻"],
  bonus_if_next: ["相邻"],
  bonus_if_neighbors: ["相邻"],
  bonus_if_matching_neighbors: ["相邻"],
  bonus_if_exactly_one_neighbor: ["相邻"],
  bonus_if_neighbor_pair: ["相邻"],
  bonus_if_neighbor_types_different: ["相邻"],
  bonus_if_mixed_neighbors: ["相邻"],
  bonus_if_different_previous: ["相邻"],
  bonus_if_previous_score: ["相邻"],
  bonus_if_action_streak: ["追溯"],
  bonus_if_generated: ["生成"],
  bonus_from_next_base: ["相邻", "复制"],
  bonus_if_position_previous: ["位置", "相邻"],
  bonus_if_position: ["位置"],
  position_tradeoff: ["位置"],
  bonus_if_action_number: ["位置"],
  buff_next_action: ["蓄势"],
  buff_next_unique_types: ["蓄势"],
  grant_best_side_next: ["蓄势"],
  grant_opposite_side_next: ["蓄势"],
  wager_next_action: ["蓄势"],
  debuff_until_action: ["蓄势"],
  force_next_action_reward: ["蓄势"],
  debuff_next_action: ["蓄势"],
  clear_debuff: ["净化"],
  absorb_debuff: ["净化"],
  reset_buffs_bonus: ["净化"],
  permanent_growth_eat: ["成长"],
  permanent_growth_condition: ["成长"],
  consume_previous_card: ["摧毁", "成长", "相邻"],
  consume_next_card: ["摧毁", "成长", "相邻"],
  destroy_next_for_gold: ["摧毁", "相邻", "经济"],
  destroy_previous_generate: ["摧毁", "相邻", "生成"],
  destroy_previous_for_gold: ["摧毁", "相邻", "经济"],
  destroy_previous_discount: ["摧毁", "相邻", "经济"],
  destroy_self_buff: ["摧毁", "蓄势"],
  gold_economy: ["摧毁", "经济"],
  shop_free_reroll_destroy: ["摧毁", "经济"],
  gain_reshuffle_charge_destroy: ["摧毁", "重洗"],
  generate_card: ["生成"],
  scale_by_deck: ["规模"],
  scale_by_unique_deck: ["规模"],
  bonus_if_type_majority: ["规模"],
  scale_by_remaining: ["预判"],
  scale_by_history: ["追溯"],
  scale_by_unique_history: ["追溯"],
  scale_by_negative_history: ["追溯"],
  streak_scale: ["追溯"],
  retro_multiplier_eaten_tag: ["追溯"],
  copy_previous_score: ["复制", "相邻"],
  copy_previous_score_capped: ["复制", "相邻"],
  shop_discount: ["经济"],
  dynamic_shop_discount: ["经济", "追溯"],
  gain_gold: ["经济"],
  gold_on_discard_count: ["经济", "追溯"],
  gold_from_history: ["经济", "追溯"],
  store_or_cashout: ["储存"],
  rabbit_formation: ["规模"],
  discard_all_remaining: ["追溯"],
});

const DESTROY_SYNONYMS = /永久销毁|永久吞掉|永久藏走|永久烹掉|永久清走|销毁|吞掉|藏走|烹掉|清走/g;

export function canonicalizeDescription(description = "") {
  return String(description).replace(DESTROY_SYNONYMS, "摧毁");
}

export function getEffectKeywords(effect) {
  if (!effect) return [];
  const derived = [
    effect.destroy_self ? "摧毁" : null,
    effect.condition_position ? "位置" : null,
    effect.requires_previous || effect.requires_next ? "相邻" : null,
  ].filter(Boolean);
  return [...new Set([...(KIND_KEYWORDS[effect.kind] ?? []), ...derived, ...(effect.keywords ?? [])])]
    .filter((keyword) => KEYWORD_LIBRARY[keyword]);
}

export function normalizeEffect(effect) {
  if (!effect) return null;
  const keywords = getEffectKeywords(effect);
  const description = canonicalizeDescription(effect.description);
  return {
    ...effect,
    keywords,
    description: `${keywords.map((keyword) => `【${keyword}】`).join(" ")}${keywords.length ? " " : ""}${description}`,
  };
}

export function stripKeywordTags(description = "") {
  return String(description).replace(/【[^】]+】\s*/g, "").trim();
}
