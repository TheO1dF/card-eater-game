const EDIBLE = "edible";
const INEDIBLE = "inedible";

const CATEGORY_RULE_CONFIG = Object.freeze([
  { key: "fruit", type: "水果", action: "eat", verb: "吃", count: 3, multiplier: 1.35 },
  { key: "fastfood", type: "快餐", action: "eat", verb: "吃", count: 2, multiplier: 1.45 },
  { key: "dessert", type: "甜点", action: "eat", verb: "吃", count: 2, multiplier: 1.45 },
  { key: "drink", type: "饮料", action: "eat", verb: "吃", count: 2, multiplier: 1.5 },
  { key: "vegetable", type: "蔬菜", action: "eat", verb: "吃", count: 2, multiplier: 1.45 },
  { key: "celestial", type: "星体", action: "discard", verb: "弃", count: 2, multiplier: 1.55 },
  { key: "person", type: "人物", action: "discard", verb: "弃", count: 2, multiplier: 1.65 },
  { key: "animal", type: "动物", action: "discard", verb: "弃", count: 2, multiplier: 1.6 },
  { key: "utility", type: "通用", action: "discard", verb: "弃", count: 2, multiplier: 1.7 },
]);

const CATEGORY_RULES = CATEGORY_RULE_CONFIG.flatMap((category) => [
  {
    id: `${category.key}-craft`,
    name: `${category.type}专精`,
    description: `每张${category.type}牌${category.verb}分 +1`,
    scope: "flat_bonus",
    target_type: category.type,
    action: category.action,
    bonus: 1,
    multiplier: 1,
  },
  {
    id: `${category.key}-rhythm`,
    name: `${category.type}节拍`,
    description: `连续${category.verb} ${category.count} 张${category.type}牌：本轮 ×${category.multiplier}`,
    scope: category.action === "eat" ? "sequence_eat" : "sequence_discard",
    target_type: category.type,
    count: category.count,
    multiplier: category.multiplier,
    min_round: 2,
  },
]);

// 每轮选择一条并永久加入本局；抽取时会排除所有已拥有规则。
export const RULE_LIBRARY = Object.freeze([
  ...CATEGORY_RULES,
  { id: "food-score-up", name: "加量不加价", description: "所有可食用牌吃分 +1", scope: "flat_bonus", target_edibility: EDIBLE, action: "eat", bonus: 1, multiplier: 1 },
  { id: "discard-score-up", name: "回收补贴", description: "所有不可食用牌弃分 +2", scope: "flat_bonus", target_edibility: INEDIBLE, action: "discard", bonus: 2, multiplier: 1 },
  { id: "clean-plate", name: "完美分类", description: "食物都吃、非食物都弃：本轮 ×1.45", scope: "perfect_sort", multiplier: 1.45, min_round: 3 },
  { id: "no-negative", name: "无伤清台", description: "没有任何负分动作：本轮 ×1.45", scope: "no_negative_action", multiplier: 1.45, min_round: 3 },
  { id: "speed-clear-12", name: "十二秒热身", description: "12 秒内清空牌组：本轮 ×1.35", scope: "time_limit", time_limit_ms: 12000, multiplier: 1.35, min_round: 2 },
  { id: "speed-clear-8", name: "八秒狂飙", description: "8 秒内清空牌组：本轮 ×1.7", scope: "time_limit", time_limit_ms: 8000, multiplier: 1.7, min_round: 3 },
  { id: "balanced-actions", name: "营养均衡", description: "吃与弃数量相差不超过 1：本轮 ×1.4", scope: "balanced_actions", multiplier: 1.4, min_round: 3 },
  { id: "exact-eat-4", name: "四分饱", description: "恰好吃 4 张牌：本轮 ×1.5", scope: "exact_eat_count", count: 4, multiplier: 1.5, min_round: 2 },
  { id: "eat-all-food", name: "绝不浪费", description: "不弃任何可食用牌：本轮 ×1.25", scope: "no_discard_edibility", target_edibility: EDIBLE, multiplier: 1.25 },
  { id: "eat-no-junk", name: "铁胃守则", description: "不吃任何不可食用牌：本轮 ×1.25", scope: "no_eat_edibility", target_edibility: INEDIBLE, multiplier: 1.25 },
  { id: "discard-3", name: "顺手整理", description: "至少弃 3 张牌：本轮 ×1.4", scope: "min_discard", count: 3, multiplier: 1.4, min_round: 2 },
  { id: "discard-5", name: "断舍离", description: "至少弃 5 张牌：本轮 ×1.85", scope: "min_discard", count: 5, multiplier: 1.85, min_round: 3 },
  { id: "eat-4", name: "开胃时刻", description: "至少吃 4 张牌：本轮 ×1.08", scope: "min_eat", count: 4, multiplier: 1.08 },
  { id: "eat-6", name: "饕餮盛宴", description: "至少吃 6 张牌：本轮 ×1.18", scope: "min_eat", count: 6, multiplier: 1.18, min_round: 3 },
  { id: "sacrifice-1", name: "苦尽甘来", description: "主动吃下至少 1 张负分牌：本轮 ×1.5", scope: "min_negative_eat", count: 1, multiplier: 1.5, min_round: 2 },
  { id: "sacrifice-2", name: "以痛换力", description: "主动吃下至少 2 张负分牌：本轮 ×2.4", scope: "min_negative_eat", count: 2, multiplier: 2.4, min_round: 4 },
  { id: "sacrifice-payoff-8", name: "先苦后甜", description: "负分吃牌后打出单张 8+ 分：本轮 ×1.8", scope: "sacrifice_then_score", score: 8, multiplier: 1.8, min_round: 3 },
  { id: "sacrifice-payoff-15", name: "绝境爆发", description: "负分吃牌后打出单张 15+ 分：本轮 ×2.5", scope: "sacrifice_then_score", score: 15, multiplier: 2.5, min_round: 6 },
  { id: "unique-eat-3", name: "环球菜单", description: "吃牌包含至少 3 种类别：本轮 ×1.5", scope: "unique_eat_types", count: 3, multiplier: 1.5, min_round: 2 },
  { id: "unique-discard-3", name: "垃圾分类大师", description: "弃牌包含至少 3 种类别：本轮 ×1.5", scope: "unique_discard_types", count: 3, multiplier: 1.5, min_round: 2 },
  { id: "tiny-deck-8", name: "袖珍牌组", description: "牌组不超过 8 张：本轮 ×1.6", scope: "max_deck_size", count: 8, multiplier: 1.6, min_round: 4 },
  { id: "lean-deck-10", name: "精简主义", description: "牌组不超过 10 张：本轮 ×1.17", scope: "max_deck_size", count: 10, multiplier: 1.17 },
  { id: "big-deck-12", name: "百纳食袋", description: "牌组达到 12 张：本轮 ×1.05", scope: "min_deck_size", count: 12, multiplier: 1.05, min_round: 4 },
  { id: "big-deck-16", name: "无底胃袋", description: "牌组达到 16 张：本轮 ×1.1", scope: "min_deck_size", count: 16, multiplier: 1.1, min_round: 8 },
  { id: "raw-score-30", name: "火力达标", description: "倍率前牌面与效果达到 30 分：本轮 ×1.3", scope: "round_card_score", score: 30, multiplier: 1.3, min_round: 3 },
  { id: "raw-score-70", name: "火力全开", description: "倍率前牌面与效果达到 70 分：本轮 ×1.7", scope: "round_card_score", score: 70, multiplier: 1.7, min_round: 7 },
  { id: "alternating-4", name: "吃弃四拍", description: "连续 4 次交替吃与弃：本轮 ×1.45", scope: "alternating_actions", count: 4, multiplier: 1.45, min_round: 2 },
  { id: "alternating-6", name: "完美律动", description: "连续 6 次交替吃与弃：本轮 ×2", scope: "alternating_actions", count: 6, multiplier: 2, min_round: 3 },
  { id: "eat-streak-5", name: "五口连吞", description: "连续吃 5 张牌：本轮 ×1.45", scope: "action_streak", action: "eat", count: 5, multiplier: 1.45, min_round: 3 },
  { id: "discard-streak-5", name: "五连清扫", description: "连续弃 5 张牌：本轮 ×1.55", scope: "action_streak", action: "discard", count: 5, multiplier: 1.55, min_round: 3 },
  { id: "no-eat", name: "绝食主义", description: "本轮一张也不吃且至少弃 1 张：本轮 ×2.2", scope: "no_eat", multiplier: 2.2, min_round: 4 },
  { id: "max-eat-2", name: "浅尝即止", description: "本轮最多吃 2 张牌：本轮 ×1.7", scope: "max_eat", count: 2, multiplier: 1.7, min_round: 3 },
  { id: "discard-ratio-2", name: "弃多于吃", description: "至少弃 4 张且弃牌数达到吃牌数 2 倍：本轮 ×1.7", scope: "discard_ratio", minimum: 4, ratio: 2, multiplier: 1.7, min_round: 3 },
  { id: "discard-food-2", name: "忍痛断舍", description: "主动弃掉至少 2 张可食用牌：本轮 ×1.8", scope: "min_discard_food", count: 2, multiplier: 1.8, min_round: 3 },
  { id: "discard-7", name: "清仓狂潮", description: "至少弃 7 张牌：本轮 ×2.2", scope: "min_discard", count: 7, multiplier: 2.2, min_round: 5 },
  { id: "micro-deck-7", name: "掌心引擎", description: "牌组不超过 7 张：本轮 ×1.8", scope: "max_deck_size", count: 7, multiplier: 1.8, min_round: 3 },
  { id: "reshuffle-1", name: "再来一遍", description: "本轮至少重洗 1 次：本轮 ×1.25", scope: "min_reshuffles", count: 1, multiplier: 1.25, min_round: 4, requires_reshuffle: true },
  { id: "reshuffle-2", name: "循环过载", description: "本轮至少重洗 2 次：本轮 ×1.5", scope: "min_reshuffles", count: 2, multiplier: 1.5, min_round: 7, requires_reshuffle: true },
  { id: "repeat-card-2", name: "熟能生巧", description: "同一张牌本轮触发至少 2 次：本轮 ×1.35", scope: "repeat_card_actions", count: 2, multiplier: 1.35, min_round: 5, requires_reshuffle: true },
  { id: "repeat-card-3", name: "永动节拍", description: "同一张牌本轮触发至少 3 次：本轮 ×1.7", scope: "repeat_card_actions", count: 3, multiplier: 1.7, min_round: 8, requires_reshuffle: true },
  { id: "post-reshuffle-5", name: "回锅加热", description: "重洗后再处理至少 5 张牌：本轮 ×1.35", scope: "post_reshuffle_actions", count: 5, multiplier: 1.35, min_round: 5, requires_reshuffle: true },
  { id: "post-reshuffle-score-20", name: "二次盛宴", description: "重洗后的牌面与效果达到 20 分：本轮 ×1.5", scope: "post_reshuffle_score", score: 20, multiplier: 1.5, min_round: 7, requires_reshuffle: true },
  { id: "last-celestial-discard", name: "行星落幕", description: "最后一张行动是弃掉星体：本轮 ×1.55", scope: "last_action", action: "discard", target_type: "星体", multiplier: 1.55, min_round: 3 },
  { id: "last-animal-discard", name: "兽群收尾", description: "最后一张行动是弃掉动物：本轮 ×1.6", scope: "last_action", action: "discard", target_type: "动物", multiplier: 1.6, min_round: 3 },
  { id: "eat-then-discard-ends", name: "先尝后清", description: "第一张吃、最后一张弃：本轮 ×1.65", scope: "first_last_actions", first_action: "eat", last_action: "discard", multiplier: 1.65, min_round: 3 },
  { id: "discard-then-eat-ends", name: "先清后宴", description: "第一张弃、最后一张吃：本轮 ×1.55", scope: "first_last_actions", first_action: "discard", last_action: "eat", multiplier: 1.55, min_round: 3 },
  { id: "destroy-1", name: "第一次拆解", description: "本轮通过【摧毁】移除至少 1 张牌：本轮 ×1.4", scope: "min_destroyed", count: 1, multiplier: 1.4, min_round: 3, requires_keyword: "摧毁" },
  { id: "destroy-3", name: "拆解流水线", description: "本轮通过【摧毁】移除至少 3 张牌：本轮 ×2.2", scope: "min_destroyed", count: 3, multiplier: 2.2, min_round: 6, requires_keyword: "摧毁" },
  { id: "generate-1", name: "新成员", description: "本轮通过【生成】加入至少 1 张牌：本轮 ×1.35", scope: "min_generated", count: 1, multiplier: 1.35, min_round: 3, requires_keyword: "生成" },
  { id: "generate-3", name: "量产牌组", description: "本轮通过【生成】加入至少 3 张牌：本轮 ×1.9", scope: "min_generated", count: 3, multiplier: 1.9, min_round: 6, requires_keyword: "生成" },
  { id: "grow-1", name: "破土而出", description: "本轮至少触发 1 次【成长】：本轮 ×1.35", scope: "min_grown", count: 1, multiplier: 1.35, min_round: 3, requires_keyword: "成长" },
  { id: "grow-2", name: "年轮加速", description: "本轮至少触发 2 次【成长】：本轮 ×1.75", scope: "min_grown", count: 2, multiplier: 1.75, min_round: 5, requires_keyword: "成长" },
  { id: "no-repeat-types", name: "类别跳格", description: "任意两张连续行动牌类别都不同：本轮 ×1.5", scope: "no_consecutive_type", multiplier: 1.5, min_round: 3 },
  { id: "exact-types-4", name: "四色餐盘", description: "本轮恰好处理 4 种类别：本轮 ×1.55", scope: "exact_unique_action_types", count: 4, multiplier: 1.55, min_round: 3 },
  { id: "adjacent-keyword-3", name: "位置学讲义", description: "打出至少 3 张带【相邻】的牌：本轮 ×1.5", scope: "min_keyword_actions", keyword: "相邻", count: 3, multiplier: 1.5, min_round: 3, requires_keyword: "相邻" },
  { id: "destroy-keyword-2", name: "危险工具箱", description: "打出至少 2 张带【摧毁】的牌：本轮 ×1.7", scope: "min_keyword_actions", keyword: "摧毁", count: 2, multiplier: 1.7, min_round: 4, requires_keyword: "摧毁" },
  { id: "negative-opener", name: "低谷开场", description: "第一张行动牌最终得分为负：本轮 ×1.6", scope: "first_action_negative", multiplier: 1.6, min_round: 3 },
  { id: "positive-finale", name: "高光谢幕", description: "最后一张行动牌最终得分为正：本轮 ×1.35", scope: "last_action_positive", multiplier: 1.35, min_round: 2 },
]);

export function getRuleUnlockRound(rule) {
  return Math.max(1, Number.isFinite(rule?.min_round) ? Math.floor(rule.min_round) : 1);
}

function matchesCard(rule, card) {
  const typeMatches = !rule.target_type || card.type === rule.target_type;
  const edibilityMatches = !rule.target_edibility || card.edibility === rule.target_edibility;
  return typeMatches && edibilityMatches;
}

export function isRuleEligible(rule, deck = [], currentRound = 1, context = {}) {
  if (!rule) return false;
  if (getRuleUnlockRound(rule) > currentRound) return false;
  if (rule.requires_reshuffle && !context.can_reshuffle) return false;
  if (rule.requires_keyword && !deck.some((card) => card.effect?.keywords?.includes(rule.requires_keyword))) return false;
  if (deck.length === 0) return true;
  const matchingCount = deck.filter((card) => matchesCard(rule, card)).length;

  if (rule.target_type && matchingCount === 0) return false;
  if (["sequence_eat", "sequence_discard", "min_eat_target", "min_discard_target"].includes(rule.scope)) {
    return matchingCount >= rule.count;
  }
  if (["exact_eat_count", "min_eat", "min_discard", "action_streak", "alternating_actions"].includes(rule.scope)) {
    return deck.length >= rule.count;
  }
  if (["unique_eat_types", "unique_discard_types"].includes(rule.scope)) {
    return new Set(deck.map((card) => card.type)).size >= rule.count;
  }
  if (rule.scope === "max_deck_size") return deck.length <= rule.count;
  if (rule.scope === "min_deck_size") return deck.length >= rule.count;
  return true;
}

function draftWeight(rule, deck) {
  if (rule.scope === "max_deck_size" && deck.length <= rule.count) return 1.25;
  if (rule.scope === "min_deck_size" && deck.length >= rule.count) return 0.75;
  return 1;
}

function weightedPick(candidates, deck, random) {
  const total = candidates.reduce((sum, rule) => sum + draftWeight(rule, deck), 0);
  let roll = random() * total;
  for (const rule of candidates) {
    roll -= draftWeight(rule, deck);
    if (roll < 0) return rule;
  }
  return candidates.at(-1);
}

function ruleArchetype(rule) {
  if (["min_reshuffles", "repeat_card_actions", "post_reshuffle_actions", "post_reshuffle_score", "max_deck_size"].includes(rule.scope)) return "small-deck";
  if (rule.scope === "min_deck_size") return "big-deck";
  if (["last_action", "first_last_actions"].includes(rule.scope)) return "position";
  if (["min_destroyed", "min_generated", "min_grown", "min_keyword_actions"].includes(rule.scope)) return "engine";
  if (rule.action === "discard" || rule.scope.includes("discard") || rule.scope === "no_eat" || rule.scope === "max_eat") return "discard";
  if (rule.action === "eat" || rule.scope.includes("eat")) return "eat";
  return "tempo";
}

export function randomDraftRules(count = 3, excludedRules = [], random = Math.random, deck = [], currentRound = 1, context = {}) {
  const excludedIds = new Set(excludedRules.map((rule) => rule.id));
  const pool = RULE_LIBRARY.filter((rule) => !excludedIds.has(rule.id) && isRuleEligible(rule, deck, currentRound, context));
  const picked = [];
  const archetypes = new Set();
  while (picked.length < count && pool.length > 0) {
    const diversePool = pool.filter((rule) => !archetypes.has(ruleArchetype(rule)));
    const candidates = diversePool.length > 0 ? diversePool : pool;
    const selected = weightedPick(candidates, deck, random);
    pool.splice(pool.indexOf(selected), 1);
    picked.push(selected);
    archetypes.add(ruleArchetype(selected));
  }
  return picked;
}
