import { CARD_ROLES } from "../js/balance.js";
import { GAME_CONFIG, isQuestRound } from "../js/config.js";
import { createRoundEngine } from "../js/engine.js";
import { applyRoundEndItems, applyRoundItemSetup } from "../js/items.js";
import { takeRoundDrawPile } from "../js/plate.js";
import { activatePendingQuestRewards, applyQuestRoundPenalty, finalizeQuest, randomDraftQuests, selectQuest } from "../js/quests.js";
import { activateReshuffle, getReshuffleStatus } from "../js/reshuffle.js";
import { randomDraftRules } from "../js/rules.js";
import { createShopService } from "../js/shop.js";
import { createInitialPlayerState, resetRoundState } from "../js/state.js";

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let next = value;
    next = Math.imul(next ^ next >>> 15, next | 1);
    next ^= next + Math.imul(next ^ next >>> 7, next | 61);
    return ((next ^ next >>> 14) >>> 0) / 4294967296;
  };
}

function shuffle(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function clone(value) {
  return structuredClone(value);
}

function correctAction(card) {
  return card.edibility === "edible" ? "eat" : "discard";
}

function questActionOverride(state, card) {
  const condition = state.active_quest?.condition;
  if (!condition || state.active_quest.finalized) return null;
  const actions = state.round.actions;
  const remaining = state.round.draw_pile.length;
  if (condition.kind === "first_eat_last_discard") {
    if (actions.length === 0) return "eat";
    if (remaining === 1) return "discard";
  }
  if (condition.kind === "last_discard_and_score" && remaining === 1) return "discard";
  if (condition.kind === "min_discard") {
    const needed = condition.count - state.round.discard_sequence.length;
    if (needed >= remaining) return "discard";
  }
  if (condition.kind === "min_negative_eat") {
    const completed = state.round.eat_sequence.filter((entry) => entry.printed_points < 0).length;
    if (completed < condition.count && card.eat_points < 0) return "eat";
  }
  if (condition.kind === "alternating_actions" && actions.length > 0) {
    return actions.at(-1).action === "eat" ? "discard" : "eat";
  }
  return null;
}

function actionUtility(state, engine, card, action) {
  const trial = clone(state);
  const trialCard = trial.round.draw_pile.find((entry) => entry.uuid === card.uuid) ?? clone(card);
  const before = {
    gold: trial.gold,
    pending: trial.round.pending_gold_bonus,
    discount: trial.round.shop_discount,
    charges: trial.round.reshuffle_charges,
    deck: trial.deck.length,
  };
  const entry = engine.recordAction(trial, action, trialCard);
  const economicValue = (trial.gold - before.gold + trial.round.pending_gold_bonus - before.pending) * 3.2;
  const discountValue = (trial.round.shop_discount - before.discount) * 2.2;
  const chargeValue = (trial.round.reshuffle_charges - before.charges) * 4;
  const deckChangeValue = (trial.deck.length - before.deck) * 0.35;
  const baseGoldValue = action === "eat" ? 1.15 : 0;
  return entry.points + economicValue + discountValue + chargeValue + deckChangeValue + baseGoldValue;
}

function chooseAction(state, engine, card) {
  const questChoice = questActionOverride(state, card);
  if (questChoice) return questChoice;
  const eat = actionUtility(state, engine, card, "eat");
  const discard = actionUtility(state, engine, card, "discard");
  return eat >= discard ? "eat" : "discard";
}

function playPlate(state, engine, random) {
  let safety = 0;
  while (safety < GAME_CONFIG.max_actions_per_round) {
    safety += 1;
    if (state.round.draw_pile.length === 0) {
      const status = getReshuffleStatus(state);
      if (!status.can_use) break;
      activateReshuffle(state, (cards) => shuffle(cards, random));
      continue;
    }
    const card = state.round.draw_pile.at(-1);
    const action = chooseAction(state, engine, card);
    engine.recordAction(state, action, card);
    state.round.draw_pile.pop();
    if (state.deck.some((owned) => owned.uuid === card.uuid)) state.round.spent_pile.push(card);
    if (state.round.consume_next_uuid) {
      if (state.round.draw_pile.at(-1)?.uuid === state.round.consume_next_uuid) state.round.draw_pile.pop();
      state.round.consume_next_uuid = null;
    }
  }
  if (safety >= GAME_CONFIG.max_actions_per_round) throw new Error("simulation action safety limit reached");
}

function rulePotential(rule, state) {
  const matching = rule.target_type ? state.deck.filter((card) => card.type === rule.target_type).length : state.deck.length;
  const multiplier = rule.multiplier ?? 1;
  let chance = 0.55;
  if (rule.scope === "flat_bonus") chance = matching > 0 ? 0.95 : 0;
  if (["perfect_sort", "no_negative_action", "last_action_positive"].includes(rule.scope)) chance = 0.85;
  if (["min_reshuffles", "repeat_card_actions", "post_reshuffle_actions", "post_reshuffle_score"].includes(rule.scope)) {
    chance = state.items.some((item) => item.effect?.kind === "round_reshuffle_charge")
      || state.deck.some((card) => ["gain_reshuffle_charge", "gain_reshuffle_charge_destroy"].includes(card.effect?.kind)) ? 0.9 : 0.05;
  }
  if (rule.scope === "max_deck_size") chance = state.deck.length <= rule.count ? 1 : 0;
  if (rule.scope === "min_deck_size") chance = state.deck.length >= rule.count ? 1 : 0.2;
  if (rule.scope === "time_limit") chance = 1;
  if (rule.count && matching < rule.count && rule.target_type) chance *= 0.25;
  return (multiplier - 1) * 20 * chance + (rule.bonus ?? 0) * matching * chance;
}

function chooseRule(options, state) {
  return [...options].sort((a, b) => rulePotential(b, state) - rulePotential(a, state))[0];
}

function questRisk(quest, state) {
  const condition = quest.condition;
  let score = 0;
  if (quest.penalty.kind === "add_permanent_void") score -= 18 * (quest.penalty.count ?? 1);
  if (quest.penalty.kind === "lose_all_gold") score -= state.gold * 2;
  if (condition.kind === "min_discard") score += 10;
  if (condition.kind === "first_eat_last_discard") score += 8;
  if (condition.kind === "alternating_actions") score += 5;
  if (condition.kind === "min_unique_action_types") {
    score += new Set(state.deck.map((card) => card.type)).size >= condition.count ? 8 : -10;
  }
  if (["min_destroyed", "min_generated", "min_reshuffles"].includes(condition.kind)) score -= 5;
  if (quest.reward.item_id === "IT001" || quest.reward.item_id === "IT002" || quest.reward.item_id === "IT005") score += 7;
  return score;
}

function chooseQuest(options, state) {
  return [...options].sort((a, b) => questRisk(b, state) - questRisk(a, state))[0];
}

const ROLE_VALUE = Object.freeze({
  [CARD_ROLES.ECONOMY]: 8,
  [CARD_ROLES.ENGINE]: 5,
  [CARD_ROLES.BASELINE]: 4,
  [CARD_ROLES.PAYOFF]: 3,
  [CARD_ROLES.SETUP]: 2,
  [CARD_ROLES.SACRIFICE]: -1,
});

function cardPurchaseValue(card, state, policy) {
  const action = correctAction(card);
  const printed = action === "eat" ? card.eat_points : card.discard_points;
  const tagMatches = card.synergy_tags.filter((tag) => state.deck.some((owned) => owned.synergy_tags.includes(tag))).length;
  const kind = card.effect?.kind;
  let effect = ROLE_VALUE[card.role] ?? 0;
  if (["gain_gold", "gold_economy", "gold_from_deck_type", "gold_from_reserve", "shop_discount", "dynamic_shop_discount"].includes(kind)) effect += 7;
  if (["gain_reshuffle_charge", "gain_reshuffle_charge_destroy"].includes(kind) && state.deck.length <= 10) effect += policy === "small" ? 18 : 11;
  if (["permanent_growth_eat", "permanent_growth_condition", "store_or_cashout"].includes(kind)) effect += state.current_round <= 7 ? 6 : 2;
  if (kind === "scale_by_deck" || kind === "scale_by_unique_deck") effect += policy === "large" ? 7 : 2;
  if (policy === "small" && ["generate_card", "generate_card_on_condition", "destroy_previous_generate"].includes(kind)) effect -= 8;
  if (kind === "position_tradeoff") effect -= 3;
  const compactPressure = policy === "small" ? Math.max(0, state.deck.length - 7) * 3 : 0;
  const capacityPressure = state.deck.length >= state.plate_capacity ? 2.5 : 0;
  return printed * 1.2 + effect + tagMatches * 0.8 - card.shop_price * 1.35 - capacityPressure - compactPressure;
}

function itemPurchaseValue(item, state, policy) {
  const kind = item.effect?.kind;
  const hasReserve = state.deck.length > state.plate_capacity;
  let value = 5 - item.shop_price * 0.75;
  if (item.role.includes("经济") || item.role === "商店") value += state.current_round <= 8 ? 8 : 3;
  if (kind === "round_reshuffle_charge" && state.deck.length <= 10) value += policy === "small" ? 18 : 11;
  if (kind === "plate_upgrade_discount") value += policy === "large" ? 8 : 4;
  if (kind === "keyword_card_bonus") value += state.deck.filter((card) => card.effect?.keywords?.includes(item.effect.keyword)).length;
  if (kind === "generated_card_gold") value += state.deck.filter((card) => card.generated_from).length * 2;
  if (kind === "keyword_first_gold") value += state.deck.some((card) => card.effect?.keywords?.includes(item.effect.keyword)) ? 5 : -2;
  if (kind === "compact_first_each_bonus") value += state.deck.length <= item.effect.maximum ? (policy === "small" ? 11 : 7) : -3;
  if (kind === "full_plate_reroll_discount") value += hasReserve ? 0 : 5;
  if (["reserve_matching_type_bonus", "reserve_last_bonus", "reserve_first_action_bonus", "reserve_first_discard_gold"].includes(kind)) value += hasReserve ? 5 : 0;
  if (kind === "singleton_name_bonus") value += state.deck.filter((card, index, deck) => deck.findIndex((owned) => owned.id === card.id) === index).length * 0.35;
  if (kind === "singleton_type_bonus") value += new Set(state.deck.map((card) => card.type)).size * 0.3;
  if (["wrong_edibility_bonus", "lower_side_bonus", "plate_edge_bonus", "last_correct_action_bonus"].includes(kind)) value += 3;
  return value;
}

function removalValue(card) {
  const correct = correctAction(card);
  const printed = correct === "eat" ? card.eat_points : card.discard_points;
  const role = ROLE_VALUE[card.role] ?? 0;
  const curse = card.rarity === "诅咒" ? -20 : 0;
  return printed * 1.5 + role + curse;
}

function shopTurn(state, shop, policy) {
  const events = [];
  let cards = shop.getShopCards(state);
  let items = shop.getShopItems(state);
  const buyBestItem = () => {
    const offer = items
      .filter((entry) => entry.shop_price <= state.gold)
      .map((entry) => ({ entry, value: itemPurchaseValue(entry, state, policy) }))
      .sort((a, b) => b.value - a.value)[0];
    if (offer && offer.value > 4 && shop.buyItem(state, offer.entry)) {
      events.push(`道具:${offer.entry.name}(${offer.entry.shop_price})`);
      items = items.filter((entry) => entry.id !== offer.entry.id);
      return true;
    }
    return false;
  };
  const buyBestCard = () => {
    const offer = cards
      .filter((entry) => entry.shop_price <= state.gold)
      .map((entry) => ({ entry, value: cardPurchaseValue(entry, state, policy) }))
      .sort((a, b) => b.value - a.value)[0];
    if (offer && offer.value > (policy === "large" ? -1 : 2) && shop.buyCard(state, offer.entry)) {
      events.push(`卡:${offer.entry.name}(${offer.entry.shop_price})`);
      cards = cards.filter((entry) => entry.id !== offer.entry.id);
      return true;
    }
    return false;
  };

  if (policy === "small") buyBestItem();
  else if (state.current_round <= 5) buyBestCard();
  else buyBestItem();

  const wantsExpansion = state.deck.length > state.plate_capacity
    || (policy === "large" && state.deck.length >= state.plate_capacity - 1);
  const upgrade = shop.getPlateUpgradeStatus(state);
  if (wantsExpansion && upgrade.ok && upgrade.cost <= Math.max(3, Math.floor(state.gold * 0.65))) {
    shop.buyPlateUpgrade(state);
    events.push(`扩容:+1(${upgrade.cost})`);
  }

  if (policy !== "small") buyBestCard();
  else if (state.deck.length < 8) buyBestCard();

  const worst = [...state.deck].sort((a, b) => removalValue(a) - removalValue(b))[0];
  const shouldDelete = worst && (worst.rarity === "诅咒" || state.deck.length > state.plate_capacity + 1 || (policy === "small" && state.deck.length > 8));
  const affordableDeleteLimit = policy === "small" ? 9 : 3;
  const deletionIsPrudent = policy !== "small" || state.remove_card_cost <= Math.max(3, Math.floor(state.gold * 0.4));
  if (shouldDelete && state.remove_card_cost <= state.gold && state.remove_card_cost <= affordableDeleteLimit && deletionIsPrudent) {
    const cost = state.remove_card_cost;
    if (shop.removeCard(state, worst.uuid)) events.push(`删:${worst.name}(${cost})`);
  }

  if (events.length === 0 && state.gold >= 4 && shop.getRerollCost(state) <= 1) {
    const reroll = shop.rerollShop(state);
    if (reroll.success) {
      cards = reroll.cards;
      items = reroll.items;
      events.push(`刷新(${reroll.cost})`);
      buyBestItem() || buyBestCard();
    }
  }
  return events;
}

export function simulateRun({ seed = 1, policy = "balanced", verbose = false } = {}) {
  const random = seededRandom(seed);
  let nextId = 0;
  const createId = (card) => `${card.id}-sim-${seed}-${nextId += 1}`;
  const state = createInitialPlayerState({ create_id: createId });
  const engine = createRoundEngine();
  const shop = createShopService({ random, create_id: createId });
  const log = [];

  for (let round = 1; round <= GAME_CONFIG.total_rounds; round += 1) {
    state.current_round = round;
    if (state.active_quest?.round < round) state.active_quest = null;
    activatePendingQuestRewards(state);
    const canReshuffle = state.items.some((item) => item.effect?.kind === "round_reshuffle_charge")
      || state.deck.some((card) => ["gain_reshuffle_charge", "gain_reshuffle_charge_destroy"].includes(card.effect?.kind));
    const rules = randomDraftRules(3, state.active_rules, random, state.deck, round, { can_reshuffle: canReshuffle });
    state.active_rules.push(chooseRule(rules, state));

    if (isQuestRound(round)) {
      const quests = randomDraftQuests(3, state, random);
      selectQuest(state, chooseQuest(quests, state), createId);
    }

    resetRoundState(state);
    const deck = shuffle(state.deck.map((card) => clone(card)), random);
    Object.assign(state.round, takeRoundDrawPile(deck, state.plate_capacity));
    applyRoundItemSetup(state);
    applyQuestRoundPenalty(state, random);
    playPlate(state, engine, random);
    state.round.elapsed_ms = 8000;
    const result = engine.finalizeRound(state);
    result.gold_reward = engine.getGoldReward(state);
    state.gold += result.gold_reward;
    result.quest_result = finalizeQuest(state, result);
    applyRoundEndItems(state, { random });
    const milestone = engine.levelProgressCheck(state);
    const failed = milestone.target > 0 && !milestone.passed;
    const snapshot = {
      round,
      round_score: Math.round(result.round_score),
      total_score: Math.round(state.total_score),
      gold_after_round: state.gold,
      deck: state.deck.length,
      plate: state.plate_capacity,
      reserve: state.round.reserve_count,
      actions: state.round.actions.length,
      reshuffles: state.round.reshuffle_count,
      quest: result.quest_result ? `${result.quest_result.name}:${result.quest_result.completed ? "完成" : "失败"}` : "-",
      milestone: milestone.target > 0 ? `${milestone.passed ? "通过" : "失败"}(${milestone.target})` : "-",
      shop: [],
    };
    log.push(snapshot);
    if (failed) break;
    if (round < GAME_CONFIG.total_rounds) snapshot.shop = shopTurn(state, shop, policy);
  }

  const won = log.length === GAME_CONFIG.total_rounds
    && state.total_score >= GAME_CONFIG.milestone_targets[GAME_CONFIG.total_rounds];
  const output = { seed, policy, won, rounds: log.length, score: Math.round(state.total_score), gold: state.gold, deck: state.deck.length, plate: state.plate_capacity, log };
  if (verbose) console.table(log.map((entry) => ({ ...entry, shop: entry.shop.join(" / ") })));
  return output;
}

export function simulateBatch({ seeds = 40, policies = ["balanced", "small", "large"] } = {}) {
  return policies.map((policy) => {
    const runs = Array.from({ length: seeds }, (_, index) => simulateRun({ seed: index + 1, policy }));
    const wins = runs.filter((run) => run.won);
    return {
      policy,
      runs: runs.length,
      wins: wins.length,
      win_rate: wins.length / runs.length,
      median_score: runs.map((run) => run.score).sort((a, b) => a - b)[Math.floor(runs.length / 2)],
      median_rounds: runs.map((run) => run.rounds).sort((a, b) => a - b)[Math.floor(runs.length / 2)],
      median_gold: runs.map((run) => run.gold).sort((a, b) => a - b)[Math.floor(runs.length / 2)],
    };
  });
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replaceAll("\\", "/")}`).href) {
  const seed = Number(process.argv[2] ?? 1);
  const policy = process.argv[3] ?? "balanced";
  const run = simulateRun({ seed, policy, verbose: true });
  console.log(JSON.stringify({ ...run, log: undefined }, null, 2));
  console.table(simulateBatch());
}
