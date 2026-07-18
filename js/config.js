export const GAME_CONFIG = Object.freeze({
  schema_version: 2,
  total_rounds: 15,
  draft_size: 3,
  milestone_targets: Object.freeze({
    5: 150,
    10: 1500,
    15: 12000,
  }),
  delete_cost_step: 5,
  shop_offer_count: 3,
});

export function getNextMilestone(currentRound) {
  const rounds = Object.keys(GAME_CONFIG.milestone_targets)
    .map(Number)
    .sort((a, b) => a - b);
  const round = rounds.find((item) => item >= currentRound);
  return round
    ? { round, target: GAME_CONFIG.milestone_targets[round] }
    : { round: GAME_CONFIG.total_rounds, target: GAME_CONFIG.milestone_targets[GAME_CONFIG.total_rounds] };
}
