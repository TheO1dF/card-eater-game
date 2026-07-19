import { GAME_CONFIG } from "./config.js";
import { getCardById } from "./data.js";
import { addItem, getItemById } from "./items.js";
import { safeMultiply } from "./numbers.js";

const quest = (definition, iconIndex) => Object.freeze({
  icon_atlas: "meta-atlas.webp",
  icon_columns: 4,
  icon_rows: 4,
  icon_x: iconIndex % 4,
  icon_y: Math.floor(iconIndex / 4),
  ...definition,
});

export const QUEST_LIBRARY = Object.freeze([
  quest({
    id: "QST01", name: "虚空试吃", risk: "高风险",
    penalty: { kind: "void_round_cards", count: 3, description: "本轮随机 3 张牌变为吃 0 / 弃 0 的虚空牌。" },
    condition: { kind: "min_round_score", target_multiplier: 1, description: "本轮分数达到任务目标。" },
    reward: { kind: "item", item_id: "IT001" },
  }, 8),
  quest({
    id: "QST02", name: "回收誓约", risk: "中风险",
    penalty: { kind: "round_flat_modifier", amount: -1, description: "本轮所有牌得分 -1。" },
    condition: { kind: "min_discard", count: 5, description: "本轮至少弃 5 张牌。" },
    reward: { kind: "item", item_id: "IT002" },
  }, 9),
  quest({
    id: "QST03", name: "虚空债券", risk: "永久负面",
    penalty: { kind: "add_permanent_void", count: 2, description: "永久向牌组加入 2 张虚空牌。" },
    condition: { kind: "min_round_score", target_multiplier: 1.25, description: "本轮分数达到强化任务目标。" },
    reward: { kind: "item", item_id: "IT008" },
  }, 10),
  quest({
    id: "QST04", name: "终末观测", risk: "永久负面",
    penalty: { kind: "add_permanent_void", count: 1, description: "永久向牌组加入 1 张虚空牌。" },
    condition: { kind: "last_discard_and_score", target_multiplier: 0.9, description: "最后一张牌必须弃掉，并达到任务目标。" },
    reward: { kind: "item", item_id: "IT003" },
  }, 11),
  quest({
    id: "QST05", name: "破产采购", risk: "经济清零",
    penalty: { kind: "lose_all_gold", description: "立即失去当前全部金币。" },
    condition: { kind: "min_round_score", target_multiplier: 1.05, description: "本轮分数达到任务目标。" },
    reward: { kind: "item", item_id: "IT005" },
  }, 12),
  quest({
    id: "QST06", name: "袖珍循环", risk: "高风险", requires_item: "IT001", min_round: 6,
    penalty: { kind: "void_round_cards", count: 2, description: "本轮随机 2 张牌变为虚空牌。" },
    condition: { kind: "min_reshuffles", count: 1, description: "本轮至少重洗 1 次。" },
    reward: { kind: "item", item_id: "IT004" },
  }, 13),
  quest({
    id: "QST07", name: "苦味加冕", risk: "高风险", min_round: 6,
    penalty: { kind: "round_flat_modifier", amount: -2, description: "本轮所有牌得分 -2。" },
    condition: { kind: "min_negative_eat", count: 2, description: "本轮主动吃下至少 2 张负分牌。" },
    reward: { kind: "item", item_id: "IT006" },
  }, 14),
  quest({
    id: "QST08", name: "无底胃契", risk: "重度永久负面", min_round: 9,
    penalty: { kind: "add_permanent_void", count: 3, description: "永久向牌组加入 3 张虚空牌。" },
    condition: { kind: "min_round_score", target_multiplier: 1.4, description: "本轮分数达到极限任务目标。" },
    reward: { kind: "item", item_id: "IT007" },
  }, 15),
]);

const QUEST_TARGETS = Object.freeze({ 3: 30, 6: 120, 9: 500, 12: 2200 });

function cloneQuest(source) {
  return source ? {
    ...source,
    penalty: { ...source.penalty },
    condition: { ...source.condition },
    reward: { ...source.reward },
  } : null;
}

export function getQuestTarget(round, multiplier = 1) {
  const base = QUEST_TARGETS[round] ?? Math.max(30, Math.round(30 * Math.pow(2.05, Math.max(0, round - 3) / 3)));
  return safeMultiply(base, multiplier);
}

export function isQuestEligible(entry, state) {
  if ((entry.min_round ?? 1) > state.current_round) return false;
  if (entry.requires_item && !state.items.some((item) => item.id === entry.requires_item)) return false;
  return !state.quest_history.some((history) => history.id === entry.id);
}

export function randomDraftQuests(count, state, random = Math.random) {
  const pool = QUEST_LIBRARY.filter((entry) => isQuestEligible(entry, state)).map(cloneQuest);
  const picked = [];
  while (picked.length < count && pool.length > 0) {
    picked.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  }
  return picked;
}

function addPermanentVoidCards(state, count, createId) {
  const source = getCardById("Q001");
  if (!source) return 0;
  let added = 0;
  while (added < count && state.deck.length < GAME_CONFIG.max_deck_size) {
    state.deck.push({ ...source, effect: null, uuid: createId(source, state.deck.length + added) });
    added += 1;
  }
  return added;
}

export function selectQuest(state, selected, createId) {
  const entry = cloneQuest(selected);
  entry.round = state.current_round;
  entry.target = getQuestTarget(state.current_round, entry.condition.target_multiplier ?? 1);
  entry.completed = false;
  entry.finalized = false;
  state.active_quest = entry;
  if (entry.penalty.kind === "lose_all_gold") state.gold = 0;
  if (entry.penalty.kind === "add_permanent_void") {
    entry.penalty.applied_count = addPermanentVoidCards(state, entry.penalty.count, createId);
  }
  return entry;
}

export function applyQuestRoundPenalty(state, random = Math.random) {
  const entry = state.active_quest;
  if (!entry || entry.round !== state.current_round) return;
  if (entry.penalty.kind === "round_flat_modifier") {
    state.round.quest_flat_modifier = entry.penalty.amount;
  }
  if (entry.penalty.kind === "void_round_cards") {
    const voidCard = getCardById("Q001");
    const available = state.round.draw_pile.map((_, index) => index);
    const count = Math.min(entry.penalty.count, available.length);
    for (let picked = 0; picked < count; picked += 1) {
      const optionIndex = Math.floor(random() * available.length);
      const targetIndex = available.splice(optionIndex, 1)[0];
      const original = state.round.draw_pile[targetIndex];
      state.round.draw_pile[targetIndex] = {
        ...voidCard,
        uuid: original.uuid,
        name: `虚空·${original.name}`,
        quest_original_id: original.id,
        quest_void: true,
      };
    }
  }
}

export function getQuestRequirement(entry) {
  if (!entry) return "";
  if (["min_round_score", "last_discard_and_score"].includes(entry.condition.kind)) {
    return `${entry.condition.description}（${entry.target} 分）`;
  }
  return entry.condition.description;
}

function evaluateQuest(state, entry, result) {
  const actions = state.round.actions;
  switch (entry.condition.kind) {
    case "min_round_score": return result.round_score >= entry.target;
    case "min_discard": return state.round.discard_sequence.length >= entry.condition.count;
    case "last_discard_and_score": return actions.at(-1)?.action === "discard" && result.round_score >= entry.target;
    case "min_reshuffles": return state.round.reshuffle_count >= entry.condition.count;
    case "min_negative_eat": return state.round.eat_sequence.filter((action) => action.points < 0).length >= entry.condition.count;
    default: return false;
  }
}

function grantReward(state, entry) {
  if (entry.reward.kind === "item") {
    const granted = addItem(state, entry.reward.item_id);
    const reward = getItemById(entry.reward.item_id);
    return { granted, label: reward ? `${reward.name}：${reward.description}` : entry.reward.item_id };
  }
  if (entry.reward.kind === "permanent_multiplier") {
    const exists = state.permanent_multipliers.some((reward) => reward.id === entry.reward.id);
    if (!exists) state.permanent_multipliers.push({ ...entry.reward });
    return { granted: !exists, label: `${entry.reward.name} ×${entry.reward.multiplier}` };
  }
  return { granted: false, label: "无" };
}

export function finalizeQuest(state, result) {
  const entry = state.active_quest;
  if (!entry || entry.round !== state.current_round || entry.finalized) return null;
  entry.completed = evaluateQuest(state, entry, result);
  entry.finalized = true;
  const rewardResult = entry.completed ? grantReward(state, entry) : { granted: false, label: "任务失败，奖励未获得" };
  const history = {
    id: entry.id,
    name: entry.name,
    round: entry.round,
    completed: entry.completed,
    reward: rewardResult.label,
  };
  state.quest_history.push(history);
  return {
    id: entry.id,
    name: entry.name,
    completed: entry.completed,
    requirement: getQuestRequirement(entry),
    penalty: entry.penalty.description,
    reward: rewardResult.label,
  };
}
