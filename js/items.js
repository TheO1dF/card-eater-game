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

const shopItem = (definition, iconIndex) => Object.freeze({
  icon_atlas: "shop-items-atlas-v013.webp",
  icon_columns: 6,
  icon_rows: 4,
  icon_x: iconIndex % 6,
  icon_y: Math.floor(iconIndex / 6),
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
    description: "牌组达到 14 张时，本轮最终得分 ×1.1。",
    effect: { kind: "deck_size_multiplier", minimum: 14, multiplier: 1.1 },
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
  shopItem({
    id: "IT101", name: "魔法帽", rarity: "普通道具", role: "生成", shop_price: 15, min_shop_round: 7,
    description: "轮次结束时，将牌组中随机 1 张非兔子牌变为兔子。",
    effect: { kind: "round_end_transform", target_card_id: "A004" },
  }, 0),
  shopItem({
    id: "IT102", name: "旧罗盘", rarity: "普通道具", role: "首位", shop_price: 4,
    description: "每轮第一张牌按正确食性处理时，额外 +1 分。",
    effect: { kind: "first_correct_action_bonus", bonus: 1 },
  }, 1),
  shopItem({
    id: "IT103", name: "硬币别针", rarity: "普通道具", role: "经济", shop_price: 8, min_shop_round: 3,
    description: "每轮首次弃牌时，结算金币 +1。",
    effect: { kind: "first_discard_gold", gold: 1 },
  }, 2),
  shopItem({
    id: "IT104", name: "候补餐签", rarity: "普通道具", role: "餐盘", shop_price: 5, min_shop_round: 2,
    description: "若餐盘外还有同类别牌，每轮该类别首次处理时额外 +1 分。",
    effect: { kind: "reserve_matching_type_bonus", bonus: 1, once_per_type: true },
  }, 3),
  shopItem({
    id: "IT105", name: "合盖餐罩", rarity: "普通道具", role: "小牌组", shop_price: 7, min_shop_round: 3,
    description: "若全部牌都能登上餐盘，付费刷新费用 -1，最低仍为 1 金币。",
    effect: { kind: "full_plate_reroll_discount", amount: 1 },
  }, 4),
  shopItem({
    id: "IT106", name: "餐盘量尺", rarity: "普通道具", role: "餐盘", shop_price: 9, min_shop_round: 4,
    description: "餐盘扩容费用永久 -1，最低仍为 1 金币。",
    effect: { kind: "plate_upgrade_discount", amount: 1 },
  }, 5),
  shopItem({
    id: "IT107", name: "铰链夹", rarity: "普通道具", role: "相邻", shop_price: 6, min_shop_round: 2,
    description: "打出带【相邻】关键字的牌时，额外 +1 分。",
    effect: { kind: "keyword_card_bonus", keyword: "相邻", bonus: 1 },
  }, 6),
  shopItem({
    id: "IT108", name: "拆信刀", rarity: "普通道具", role: "摧毁", shop_price: 7, min_shop_round: 3,
    description: "打出带【摧毁】关键字的牌时，额外 +1 分。",
    effect: { kind: "keyword_card_bonus", keyword: "摧毁", bonus: 1 },
  }, 7),
  shopItem({
    id: "IT109", name: "育苗盘", rarity: "普通道具", role: "生成经济", shop_price: 7, min_shop_round: 3,
    description: "每轮首次处理由【生成】加入的牌时，结算金币 +1。",
    effect: { kind: "generated_card_gold", gold: 1 },
  }, 8),
  shopItem({
    id: "IT110", name: "年轮尺", rarity: "普通道具", role: "成长经济", shop_price: 7, min_shop_round: 3,
    description: "每轮首次打出带【成长】的牌时，结算金币 +1。",
    effect: { kind: "keyword_first_gold", keyword: "成长", gold: 1 },
  }, 9),
  shopItem({
    id: "IT111", name: "独页餐册", rarity: "普通道具", role: "精简", shop_price: 6, min_shop_round: 2,
    description: "牌组中只有 1 张同名牌时，处理它额外 +2 分。",
    effect: { kind: "singleton_name_bonus", bonus: 2 },
  }, 10),
  shopItem({
    id: "IT112", name: "苦差零钱袋", rarity: "普通道具", role: "风险经济", shop_price: 8, min_shop_round: 4,
    description: "每轮首次选择牌面负分的一侧时，结算金币 +1。",
    effect: { kind: "negative_action_gold", gold: 1, once_per_round: true },
  }, 11),
  shopItem({
    id: "IT113", name: "夜市会员卡", rarity: "普通道具", role: "商店", shop_price: 12, min_shop_round: 6,
    description: "商店卡牌价格额外 -1，最低仍为 1 金币。",
    effect: { kind: "shop_price_discount", amount: 1 },
  }, 12),
  shopItem({
    id: "IT114", name: "候补餐罩", rarity: "普通道具", role: "餐盘末位", shop_price: 5, min_shop_round: 2,
    description: "若有牌未登上餐盘，本轮最后一张牌额外 +2 分。",
    effect: { kind: "reserve_last_bonus", bonus: 2 },
  }, 13),
  shopItem({
    id: "IT115", name: "回卷发条", rarity: "普通道具", role: "重洗", shop_price: 16, min_shop_round: 7,
    description: "牌组不超过 10 张时，每轮获得 1 次重洗；可与其他重洗次数叠加。",
    effect: { kind: "round_reshuffle_charge", charges: 1, max_deck_size: 10 },
  }, 14),
  shopItem({
    id: "IT116", name: "剩菜罐", rarity: "普通道具", role: "候补经济", shop_price: 7, min_shop_round: 3,
    description: "若有牌未登上餐盘，每轮首次弃牌时结算金币 +1。",
    effect: { kind: "reserve_first_discard_gold", gold: 1 },
  }, 15),
  shopItem({
    id: "IT117", name: "缺口餐叉", rarity: "普通道具", role: "弃食", shop_price: 4, min_shop_round: 1,
    description: "主动弃掉可食用牌时，额外 +2 分。",
    effect: { kind: "wrong_edibility_bonus", action: "discard", target_edibility: "edible", bonus: 2 },
  }, 16),
  shopItem({
    id: "IT118", name: "牛皮纸袋", rarity: "普通道具", role: "硬吃", shop_price: 4, min_shop_round: 1,
    description: "主动吃下不可食用牌时，额外 +1 分。",
    effect: { kind: "wrong_edibility_bonus", action: "eat", target_edibility: "inedible", bonus: 1 },
  }, 17),
  shopItem({
    id: "IT119", name: "随身盐盒", rarity: "普通道具", role: "小牌组", shop_price: 4, min_shop_round: 1,
    description: "牌组不超过 8 张时，每轮首次吃牌与首次弃牌各额外 +2 分。",
    effect: { kind: "compact_first_each_bonus", maximum: 8, bonus: 2 },
  }, 18),
  shopItem({
    id: "IT120", name: "盘沿夹", rarity: "普通道具", role: "位置", shop_price: 4, min_shop_round: 1,
    description: "每轮第一张与最后一张行动牌各额外 +1 分。",
    effect: { kind: "plate_edge_bonus", bonus: 1 },
  }, 19),
  shopItem({
    id: "IT121", name: "保温软垫", rarity: "普通道具", role: "餐盘", shop_price: 4, min_shop_round: 1,
    description: "有牌未登上餐盘时，每轮第一张行动牌额外 +2 分。",
    effect: { kind: "reserve_first_action_bonus", bonus: 2 },
  }, 20),
  shopItem({
    id: "IT122", name: "独份餐签", rarity: "普通道具", role: "单卡", shop_price: 5, min_shop_round: 2,
    description: "牌组中仅有 1 张该类别的牌时，处理它额外 +3 分。",
    effect: { kind: "singleton_type_bonus", bonus: 3 },
  }, 21),
  shopItem({
    id: "IT123", name: "尾单夹", rarity: "普通道具", role: "位置", shop_price: 4, min_shop_round: 1,
    description: "每轮最后一张牌按正确食性处理时，额外 +2 分。",
    effect: { kind: "last_correct_action_bonus", bonus: 2 },
  }, 22),
  shopItem({
    id: "IT124", name: "逆向弹簧", rarity: "普通道具", role: "反向选择", shop_price: 5, min_shop_round: 2,
    description: "选择两项牌面中较低的一侧时，额外 +2 分。",
    effect: { kind: "lower_side_bonus", bonus: 2 },
  }, 23),
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
  const selectedPrinted = action === "eat" ? card.eat_points : card.discard_points;
  const otherPrinted = action === "eat" ? card.discard_points : card.eat_points;
  const isCorrectAction = (targetAction, targetCard) => (
    (targetCard.edibility === "edible" && targetAction === "eat")
    || (targetCard.edibility === "inedible" && targetAction === "discard")
  );
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
      if (isCorrectAction(action, card)) {
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
    if (effect.kind === "generated_card_gold" && card.generated_from) {
      const key = `item:${entry.id}:gold`;
      if (!state.round.effect_trigger_counts[key]) {
        state.round.effect_trigger_counts[key] = 1;
        state.round.pending_gold_bonus = safeAdd(state.round.pending_gold_bonus, effect.gold);
        messages.push(`${entry.name}：金币 +${effect.gold}`);
      }
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
    if (effect.kind === "keyword_first_gold" && card.effect?.keywords?.includes(effect.keyword)) {
      const key = `item:${entry.id}:gold`;
      if (!state.round.effect_trigger_counts[key]) {
        state.round.effect_trigger_counts[key] = 1;
        state.round.pending_gold_bonus = safeAdd(state.round.pending_gold_bonus, effect.gold);
        messages.push(`${entry.name}：金币 +${effect.gold}`);
      }
    }
    if (effect.kind === "negative_action_gold") {
      const key = `item:${entry.id}:negative`;
      if (selectedPrinted < 0 && !state.round.effect_trigger_counts[key]) {
        state.round.effect_trigger_counts[key] = 1;
        state.round.pending_gold_bonus = safeAdd(state.round.pending_gold_bonus, effect.gold);
        messages.push(`${entry.name}：金币 +${effect.gold}`);
      }
    }
    if (effect.kind === "reserve_matching_type_bonus" && (state.round.reserve_type_counts?.[card.type] ?? 0) > 0) {
      const key = `item:${entry.id}:type:${card.type}`;
      if (!effect.once_per_type || !state.round.effect_trigger_counts[key]) {
        state.round.effect_trigger_counts[key] = 1;
        flatBonus = safeAdd(flatBonus, effect.bonus);
        messages.push(`${entry.name} +${effect.bonus}`);
      }
    }
    if (effect.kind === "reserve_last_bonus" && state.round.reserve_count > 0 && state.round.draw_pile.length === 1) {
      flatBonus = safeAdd(flatBonus, effect.bonus);
      messages.push(`${entry.name} +${effect.bonus}`);
    }
    if (effect.kind === "wrong_edibility_bonus" && action === effect.action && card.edibility === effect.target_edibility) {
      flatBonus = safeAdd(flatBonus, effect.bonus);
      messages.push(`${entry.name} +${effect.bonus}`);
    }
    if (effect.kind === "compact_first_each_bonus" && state.deck.length <= effect.maximum) {
      const key = `item:${entry.id}:${action}`;
      if (!state.round.effect_trigger_counts[key]) {
        state.round.effect_trigger_counts[key] = 1;
        flatBonus = safeAdd(flatBonus, effect.bonus);
        messages.push(`${entry.name} +${effect.bonus}`);
      }
    }
    if (effect.kind === "singleton_name_bonus" && state.deck.filter((owned) => owned.id === card.id).length === 1) {
      flatBonus = safeAdd(flatBonus, effect.bonus);
      messages.push(`${entry.name} +${effect.bonus}`);
    }
    if (effect.kind === "singleton_type_bonus" && state.deck.filter((owned) => owned.type === card.type).length === 1) {
      flatBonus = safeAdd(flatBonus, effect.bonus);
      messages.push(`${entry.name} +${effect.bonus}`);
    }
    if (effect.kind === "lower_side_bonus" && selectedPrinted < otherPrinted) {
      flatBonus = safeAdd(flatBonus, effect.bonus);
      messages.push(`${entry.name} +${effect.bonus}`);
    }
    if (effect.kind === "plate_edge_bonus" && (state.round.actions.length === 0 || state.round.draw_pile.length === 1)) {
      flatBonus = safeAdd(flatBonus, effect.bonus);
      messages.push(`${entry.name} +${effect.bonus}`);
    }
    if (effect.kind === "reserve_first_action_bonus" && state.round.reserve_count > 0 && state.round.actions.length === 0) {
      flatBonus = safeAdd(flatBonus, effect.bonus);
      messages.push(`${entry.name} +${effect.bonus}`);
    }
    if (effect.kind === "reserve_first_discard_gold" && state.round.reserve_count > 0 && action === "discard" && state.round.discard_sequence.length === 0) {
      state.round.pending_gold_bonus = safeAdd(state.round.pending_gold_bonus, effect.gold);
      messages.push(`${entry.name}：金币 +${effect.gold}`);
    }
    if (effect.kind === "last_correct_action_bonus" && state.round.draw_pile.length === 1 && isCorrectAction(action, card)) {
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
