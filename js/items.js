import { safeAdd } from "./numbers.js";
import { getCardById } from "./data.js";

const item = (definition, iconIndex) => Object.freeze({
  icon_atlas: "meta-atlas.webp",
  icon_columns: 4,
  icon_rows: 4,
  icon_x: iconIndex % 4,
  icon_y: Math.floor(iconIndex / 4),
  ...definition,
});

export const ITEM_LIBRARY = Object.freeze([
  item({
    id: "IT001", name: "重启按钮", rarity: "任务", role: "主动",
    description: "牌组不超过 10 张时，每轮获得 1 次重洗。",
    effect: { kind: "round_reshuffle_charge", charges: 1, max_deck_size: 10 },
  }, 0),
  item({
    id: "IT002", name: "回收钱包", rarity: "任务", role: "经济",
    description: "每轮每弃 3 张牌获得 2 金币，最多触发 3 次。",
    effect: { kind: "discard_gold_every", count: 3, gold: 2, max_triggers: 3 },
  }, 1),
  item({
    id: "IT003", name: "冥王星仪", rarity: "任务", role: "位置",
    description: "每轮最后一张牌若被弃掉，额外 +5 分。",
    effect: { kind: "last_discard_bonus", bonus: 5 },
  }, 2),
  item({
    id: "IT004", name: "袖珍食谱", rarity: "任务", role: "小牌组",
    description: "牌组不超过 8 张时，本轮最终得分 ×1.25。",
    effect: { kind: "deck_size_multiplier", maximum: 8, multiplier: 1.25 },
  }, 3),
  item({
    id: "IT005", name: "优惠打印机", rarity: "任务", role: "商店",
    description: "每间商店获得 1 次免费刷新；刷新后仍会提高后续价格。",
    effect: { kind: "free_shop_reroll", count: 1 },
  }, 4),
  item({
    id: "IT006", name: "苦味勋章", rarity: "任务", role: "牺牲",
    description: "吃下负分牌后的下一张牌额外 +4 分。",
    effect: { kind: "after_negative_eat_bonus", bonus: 4 },
  }, 5),
  item({
    id: "IT007", name: "无底封条", rarity: "任务", role: "大牌组",
    description: "牌组达到 14 张时，本轮最终得分 ×1.2。",
    effect: { kind: "deck_size_multiplier", minimum: 14, multiplier: 1.2 },
  }, 6),
  item({
    id: "IT008", name: "任务王冠", rarity: "任务", role: "通用",
    description: "永久使每轮最终得分 ×1.1。",
    effect: { kind: "global_multiplier", multiplier: 1.1 },
  }, 7),
  item({
    id: "IT009", name: "拆解徽记", rarity: "任务", role: "摧毁",
    description: "本轮至少【摧毁】1 张牌时，最终得分 ×1.15。",
    effect: { kind: "destroyed_multiplier", minimum: 1, multiplier: 1.15 },
  }, 0),
  item({
    id: "IT010", name: "万花镜", rarity: "任务", role: "多样性",
    description: "每轮每种类别首次出现时，该牌额外 +2 分。",
    effect: { kind: "first_type_bonus", bonus: 2 },
  }, 1),
  item({
    id: "IT011", name: "孵化灯", rarity: "任务", role: "生成",
    description: "由【生成】加入牌组的卡牌额外 +3 分。",
    effect: { kind: "generated_card_bonus", bonus: 3 },
  }, 2),
  item({
    id: "IT012", name: "节奏鞋", rarity: "任务", role: "交替",
    description: "行动与前一张牌的吃/弃不同时，额外 +2 分。",
    effect: { kind: "alternating_action_bonus", bonus: 2 },
  }, 3),
  item({
    id: "IT101", name: "魔法帽", rarity: "普通道具", role: "生成", shop_price: 7, min_shop_round: 2,
    description: "轮次结束时，将牌组中随机 1 张非兔子牌变为兔子。",
    effect: { kind: "round_end_transform", target_card_id: "A004" },
  }, 8),
  item({
    id: "IT102", name: "旧罗盘", rarity: "普通道具", role: "位置", shop_price: 5,
    description: "每轮第一张牌按正确食性处理时，额外 +2 分。",
    effect: { kind: "first_correct_action_bonus", bonus: 2 },
  }, 9),
  item({
    id: "IT103", name: "硬币别针", rarity: "普通道具", role: "经济", shop_price: 6,
    description: "每轮首次弃牌时，结算金币 +1。",
    effect: { kind: "first_discard_gold", gold: 1 },
  }, 10),
  item({
    id: "IT104", name: "冰箱贴", rarity: "普通道具", role: "相邻", shop_price: 6, min_shop_round: 2,
    description: "与上一张牌同类别且做相同行动时，额外 +1 分。",
    effect: { kind: "repeat_type_action_bonus", bonus: 1 },
  }, 11),
  item({
    id: "IT105", name: "扩容腰包", rarity: "普通道具", role: "大牌组", shop_price: 8, min_shop_round: 4,
    description: "牌组达到 14 张时，本轮最终得分 ×1.08。",
    effect: { kind: "deck_size_multiplier", minimum: 14, multiplier: 1.08 },
  }, 12),
  item({
    id: "IT106", name: "餐盘量尺", rarity: "普通道具", role: "餐盘", shop_price: 7, min_shop_round: 3,
    description: "餐盘扩容费用永久 -1，最低仍为 1 金币。",
    effect: { kind: "plate_upgrade_discount", amount: 1 },
  }, 13),
  item({
    id: "IT107", name: "铰链夹", rarity: "普通道具", role: "相邻", shop_price: 6, min_shop_round: 2,
    description: "打出带【相邻】关键字的牌时，额外 +1 分。",
    effect: { kind: "keyword_card_bonus", keyword: "相邻", bonus: 1 },
  }, 14),
  item({
    id: "IT108", name: "拆信刀", rarity: "普通道具", role: "摧毁", shop_price: 8, min_shop_round: 3,
    description: "打出带【摧毁】关键字的牌时，额外 +2 分。",
    effect: { kind: "keyword_card_bonus", keyword: "摧毁", bonus: 2 },
  }, 15),
  item({
    id: "IT109", name: "育苗盘", rarity: "普通道具", role: "生成", shop_price: 7, min_shop_round: 2,
    description: "由【生成】加入牌组的卡牌额外 +1 分。",
    effect: { kind: "generated_card_bonus", bonus: 1 },
  }, 4),
  item({
    id: "IT110", name: "年轮尺", rarity: "普通道具", role: "成长", shop_price: 7, min_shop_round: 3,
    description: "打出带【成长】关键字的牌时，额外 +1 分。",
    effect: { kind: "keyword_card_bonus", keyword: "成长", bonus: 1 },
  }, 5),
  item({
    id: "IT111", name: "双色骰", rarity: "普通道具", role: "交替", shop_price: 6, min_shop_round: 2,
    description: "行动与前一张牌的吃/弃不同时，额外 +1 分。",
    effect: { kind: "alternating_action_bonus", bonus: 1 },
  }, 6),
  item({
    id: "IT112", name: "苦差零钱袋", rarity: "普通道具", role: "经济", shop_price: 7, min_shop_round: 3,
    description: "每轮首次选择牌面负分的一侧时，结算金币 +1。",
    effect: { kind: "negative_action_gold", gold: 1, once_per_round: true },
  }, 7),
  item({
    id: "IT113", name: "夜市会员卡", rarity: "普通道具", role: "商店", shop_price: 9, min_shop_round: 4,
    description: "商店卡牌价格额外 -1，最低仍为 1 金币。",
    effect: { kind: "shop_price_discount", amount: 1 },
  }, 8),
  item({
    id: "IT114", name: "折叠镜", rarity: "普通道具", role: "位置", shop_price: 6, min_shop_round: 2,
    description: "既非首位也非末位的行动牌额外 +2 分。",
    effect: { kind: "middle_action_bonus", bonus: 2 },
  }, 9),
]);

const ITEM_BY_ID = Object.freeze(Object.fromEntries(ITEM_LIBRARY.map((entry) => [entry.id, entry])));

function cloneItem(source) {
  return source ? { ...source, effect: { ...source.effect } } : null;
}

export function getItemById(id) {
  return cloneItem(ITEM_BY_ID[id]);
}

export function createShopItemPool() {
  return ITEM_LIBRARY.filter((entry) => entry.rarity === "普通道具").map(cloneItem);
}

export function addItem(state, id) {
  if (state.items.some((entry) => entry.id === id)) return false;
  const entry = getItemById(id);
  if (!entry) return false;
  state.items.push(entry);
  return true;
}

export function applyRoundItemSetup(state) {
  for (const entry of state.items) {
    const effect = entry.effect;
    if (effect.kind === "round_reshuffle_charge" && state.deck.length <= effect.max_deck_size) {
      state.round.reshuffle_charges += effect.charges;
    }
    if (effect.kind === "free_shop_reroll") {
      state.round.shop_free_rerolls += effect.count;
    }
  }
}

export function resolveItemActionEffects(state, action, card) {
  let flatBonus = 0;
  const messages = [];
  for (const entry of state.items) {
    const effect = entry.effect;
    if (effect.kind === "last_discard_bonus" && action === "discard" && state.round.draw_pile.length === 1) {
      flatBonus = safeAdd(flatBonus, effect.bonus);
      messages.push(`${entry.name} +${effect.bonus}`);
    }
    if (effect.kind === "after_negative_eat_bonus") {
      const previous = state.round.actions.at(-1);
      if (previous?.action === "eat" && previous.points < 0) {
        flatBonus = safeAdd(flatBonus, effect.bonus);
        messages.push(`${entry.name} +${effect.bonus}`);
      }
    }
    if (effect.kind === "discard_gold_every" && action === "discard") {
      const discardCount = state.round.discard_sequence.length + 1;
      const key = `item:${entry.id}`;
      const triggers = state.round.effect_trigger_counts[key] ?? 0;
      if (discardCount % effect.count === 0 && triggers < effect.max_triggers) {
        state.round.effect_trigger_counts[key] = triggers + 1;
        state.round.pending_gold_bonus += effect.gold;
        messages.push(`${entry.name}：金币 +${effect.gold}`);
      }
    }
    if (effect.kind === "first_correct_action_bonus" && state.round.actions.length === 0) {
      const correct = (card.edibility === "edible" && action === "eat")
        || (card.edibility === "inedible" && action === "discard");
      if (correct) {
        flatBonus = safeAdd(flatBonus, effect.bonus);
        messages.push(`${entry.name} +${effect.bonus}`);
      }
    }
    if (effect.kind === "first_discard_gold" && action === "discard") {
      const key = `item:${entry.id}:gold`;
      if (!state.round.effect_trigger_counts[key]) {
        state.round.effect_trigger_counts[key] = 1;
        state.round.pending_gold_bonus = safeAdd(state.round.pending_gold_bonus, effect.gold);
        messages.push(`${entry.name}：金币 +${effect.gold}`);
      }
    }
    if (effect.kind === "repeat_type_action_bonus") {
      const previous = state.round.actions.at(-1);
      if (previous?.type === card.type && previous.action === action) {
        flatBonus = safeAdd(flatBonus, effect.bonus);
        messages.push(`${entry.name} +${effect.bonus}`);
      }
    }
    if (effect.kind === "first_type_bonus") {
      const key = `item:${entry.id}:type:${card.type}`;
      if (!state.round.effect_trigger_counts[key]) {
        state.round.effect_trigger_counts[key] = 1;
        flatBonus = safeAdd(flatBonus, effect.bonus);
        messages.push(`${entry.name} +${effect.bonus}`);
      }
    }
    if (effect.kind === "generated_card_bonus" && card.generated_from) {
      flatBonus = safeAdd(flatBonus, effect.bonus);
      messages.push(`${entry.name} +${effect.bonus}`);
    }
    if (effect.kind === "alternating_action_bonus") {
      const previous = state.round.actions.at(-1);
      if (previous && previous.action !== action) {
        flatBonus = safeAdd(flatBonus, effect.bonus);
        messages.push(`${entry.name} +${effect.bonus}`);
      }
    }
    if (effect.kind === "keyword_card_bonus" && card.effect?.keywords?.includes(effect.keyword)) {
      flatBonus = safeAdd(flatBonus, effect.bonus);
      messages.push(`${entry.name} +${effect.bonus}`);
    }
    if (effect.kind === "negative_action_gold") {
      const printed = action === "eat" ? card.eat_points : card.discard_points;
      const key = `item:${entry.id}:negative`;
      if (printed < 0 && !state.round.effect_trigger_counts[key]) {
        state.round.effect_trigger_counts[key] = 1;
        state.round.pending_gold_bonus = safeAdd(state.round.pending_gold_bonus, effect.gold);
        messages.push(`${entry.name}：金币 +${effect.gold}`);
      }
    }
    if (effect.kind === "middle_action_bonus" && state.round.actions.length > 0 && state.round.draw_pile.length > 1) {
      flatBonus = safeAdd(flatBonus, effect.bonus);
      messages.push(`${entry.name} +${effect.bonus}`);
    }
  }
  return { flat_bonus: flatBonus, messages };
}

export function getItemFinalMultipliers(state) {
  const multipliers = [];
  for (const entry of state.items) {
    const effect = entry.effect;
    if (effect.kind === "global_multiplier") {
      multipliers.push({ name: entry.name, multiplier: effect.multiplier, source: "item" });
    }
    if (effect.kind === "deck_size_multiplier") {
      const meetsMinimum = effect.minimum === undefined || state.deck.length >= effect.minimum;
      const meetsMaximum = effect.maximum === undefined || state.deck.length <= effect.maximum;
      if (meetsMinimum && meetsMaximum) {
        multipliers.push({ name: entry.name, multiplier: effect.multiplier, source: "item" });
      }
    }
    if (effect.kind === "destroyed_multiplier" && state.round.destroyed_count >= (effect.minimum ?? 1)) {
      multipliers.push({ name: entry.name, multiplier: effect.multiplier, source: "item" });
    }
  }
  return multipliers;
}

export function applyRoundEndItems(state, options = {}) {
  const random = options.random ?? Math.random;
  const messages = [];
  for (const entry of state.items) {
    const effect = entry.effect;
    if (effect.kind !== "round_end_transform") continue;
    const target = getCardById(effect.target_card_id);
    if (!target) continue;
    const candidates = state.deck
      .map((card, index) => ({ card, index }))
      .filter(({ card }) => card.id !== effect.target_card_id);
    if (candidates.length === 0) continue;
    const selected = candidates[Math.floor(random() * candidates.length)];
    const previousName = selected.card.name;
    state.deck[selected.index] = {
      ...target,
      synergy_tags: [...target.synergy_tags],
      effect: target.effect ? { ...target.effect } : null,
      uuid: selected.card.uuid,
    };
    messages.push(`${entry.name}：${previousName} → ${target.name}`);
  }
  return messages;
}
