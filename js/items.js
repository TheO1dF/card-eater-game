import { safeAdd } from "./numbers.js";

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
]);

const ITEM_BY_ID = Object.freeze(Object.fromEntries(ITEM_LIBRARY.map((entry) => [entry.id, entry])));

function cloneItem(source) {
  return source ? { ...source, effect: { ...source.effect } } : null;
}

export function getItemById(id) {
  return cloneItem(ITEM_BY_ID[id]);
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
  }
  return multipliers;
}
