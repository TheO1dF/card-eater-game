export const GAME_CONFIG = Object.freeze({
  schema_version: 6,
  total_rounds: 15,
  draft_size: 3,
  quest_interval: 3,
  last_quest_round: 12,
  milestone_targets: Object.freeze({
    5: 150,
    10: 1500,
    15: 12000,
  }),
  delete_cost_step: 5,
  shop_offer_count: 3,
  shop_item_offer_count: 3,
  shop_reroll_base_cost: 3,
  shop_reroll_cost_step: 2,
  max_deck_size: 160,
  reshuffle_max_deck_size: 10,
  max_actions_per_round: 400,
  round_draw_base: 10,
  round_draw_step_cards: 10,
  round_draw_max: 14,
  base_gold_eat_cap: 6,
  deck_soft_limit: 12,
  deck_pressure_step_cards: 4,
  shop_size_surcharge_max: 5,
  overload_salvage_bonus_max: 3,
  precision_deck_maximum: 8,
  precision_deck_multiplier: 1.15,
  compact_deck_maximum: 10,
  compact_deck_multiplier: 1.07,
  max_score: 9_000_000_000_000_000,
});

export function isQuestRound(round) {
  return round >= GAME_CONFIG.quest_interval
    && round <= GAME_CONFIG.last_quest_round
    && round % GAME_CONFIG.quest_interval === 0;
}

export function getNextMilestone(currentRound) {
  const rounds = Object.keys(GAME_CONFIG.milestone_targets)
    .map(Number)
    .sort((a, b) => a - b);
  const round = rounds.find((item) => item >= currentRound);
  return round
    ? { round, target: GAME_CONFIG.milestone_targets[round] }
    : { round: GAME_CONFIG.total_rounds, target: GAME_CONFIG.milestone_targets[GAME_CONFIG.total_rounds] };
}
