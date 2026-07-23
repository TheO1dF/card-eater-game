export const GAME_CONFIG = Object.freeze({
  schema_version: 13,
  total_rounds: 15,
  draft_size: 3,
  quest_interval: 3,
  last_quest_round: 0,
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

export function isQuestRound(round) {
  return round >= GAME_CONFIG.quest_interval
    && round <= GAME_CONFIG.last_quest_round
    && round % GAME_CONFIG.quest_interval === 0;
}

export function getNextMilestone(currentRound, delays = {}) {
  const rounds = Object.keys(GAME_CONFIG.milestone_targets)
    .map(Number)
    .sort((a, b) => a - b);
  const baseRound = rounds.find((item) => item + (delays?.[item] ?? 0) >= currentRound) ?? rounds.at(-1);
  return {
    base_round: baseRound,
    round: baseRound + (delays?.[baseRound] ?? 0),
    target: GAME_CONFIG.milestone_targets[baseRound],
  };
}

export function getFinalRound(delays = {}) {
  return GAME_CONFIG.total_rounds + (delays?.[GAME_CONFIG.total_rounds] ?? 0);
}
