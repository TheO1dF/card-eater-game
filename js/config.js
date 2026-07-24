export const GAME_CONFIG = Object.freeze({
  schema_version: 14,
  total_rounds: 15,
  draft_size: 3,
  hard_quest_interval: 4,
  last_hard_quest_round: 12,
  milestone_targets: Object.freeze({
    5: 100,
    10: 300,
    15: 500,
  }),
  delete_cost_step: 3,
  shop_offer_count: 3,
  shop_item_offer_count: 2,
  shop_reroll_base_cost: 2,
  shop_reroll_cost_step: 1,
  max_deck_size: 160,
  reshuffle_max_deck_size: 10,
  max_actions_per_round: 400,
  initial_plate_capacity: 10,
  max_plate_capacity: 160,
  plate_upgrade_base_cost: 2,
  max_score: 9_000_000_000_000_000,
});

export const GAME_MODES = Object.freeze({
  NORMAL: "normal",
  ENDLESS: "endless",
  HARD: "hard",
});

export function isQuestRound(round, mode = GAME_MODES.NORMAL) {
  return mode === GAME_MODES.HARD
    && round >= GAME_CONFIG.hard_quest_interval
    && round <= GAME_CONFIG.last_hard_quest_round
    && round % GAME_CONFIG.hard_quest_interval === 0;
}

export function isFreeRemovalRound(round) {
  return Number.isInteger(round) && round > 0 && round % 5 === 0;
}

export function getNextMilestone(currentRound, delays = {}, mode = GAME_MODES.NORMAL) {
  const rounds = Object.keys(GAME_CONFIG.milestone_targets)
    .map(Number)
    .sort((a, b) => a - b);
  const baseRound = rounds.find((item) => item + (delays?.[item] ?? 0) >= currentRound);
  if (baseRound === undefined && mode === GAME_MODES.ENDLESS) {
    return { base_round: null, round: null, target: 0, endless: true };
  }
  const resolvedRound = baseRound ?? rounds.at(-1);
  return {
    base_round: resolvedRound,
    round: resolvedRound + (delays?.[resolvedRound] ?? 0),
    target: GAME_CONFIG.milestone_targets[resolvedRound],
    endless: false,
  };
}

export function getFinalRound(delays = {}, mode = GAME_MODES.NORMAL) {
  if (mode === GAME_MODES.ENDLESS) return Number.POSITIVE_INFINITY;
  return GAME_CONFIG.total_rounds + (delays?.[GAME_CONFIG.total_rounds] ?? 0);
}
