import { GAME_CONFIG } from "./config.js";
import { createInitialDeck } from "./data.js";

export const GAME_PHASES = Object.freeze({
  INIT: "Init",
  RULE_DRAFT: "RuleDraft",
  QUEST_DRAFT: "QuestDraft",
  PLAYING: "Playing",
  SCORING: "Scoring",
  SHOP: "Shop",
  NEXT_ROUND: "NextRound",
  GAME_OVER: "GameOver",
});

// Kept as an alias for older integrations.
export const GAME_STATES = GAME_PHASES;

const PHASE_TRANSITIONS = Object.freeze({
  [GAME_PHASES.INIT]: [GAME_PHASES.RULE_DRAFT],
  [GAME_PHASES.RULE_DRAFT]: [GAME_PHASES.QUEST_DRAFT, GAME_PHASES.PLAYING],
  [GAME_PHASES.QUEST_DRAFT]: [GAME_PHASES.PLAYING],
  [GAME_PHASES.PLAYING]: [GAME_PHASES.SCORING],
  [GAME_PHASES.SCORING]: [GAME_PHASES.SHOP, GAME_PHASES.GAME_OVER],
  [GAME_PHASES.SHOP]: [GAME_PHASES.NEXT_ROUND],
  [GAME_PHASES.NEXT_ROUND]: [GAME_PHASES.RULE_DRAFT, GAME_PHASES.GAME_OVER],
  [GAME_PHASES.GAME_OVER]: [],
});

export function createRoundState() {
  return {
    draw_pile: [],
    action_budget: 0,
    reserve_count: 0,
    deck_size_at_start: 0,
    actions: [],
    eat_sequence: [],
    discard_sequence: [],
    spent_pile: [],
    buffs: [],
    final_multipliers: [],
    started_at_ms: null,
    elapsed_ms: 0,
    pending_gold_bonus: 0,
    force_discard_remaining: false,
    shop_discount: 0,
    shop_reroll_count: 0,
    shop_free_rerolls: 0,
    reshuffle_charges: 0,
    reshuffle_count: 0,
    effect_trigger_counts: {},
    consume_next_uuid: null,
    quest_flat_modifier: 0,
    quest_action_modifiers: {},
    quest_first_action_modifier: 0,
    quest_last_action_modifier: 0,
    generated_count: 0,
    destroyed_count: 0,
    grown_count: 0,
  };
}

export function createInitialPlayerState(options = {}) {
  const createId = options.create_id;
  return {
    schema_version: GAME_CONFIG.schema_version,
    phase: GAME_PHASES.INIT,
    current_round: 1,
    total_score: 0,
    gold: 0,
    deck: createInitialDeck({ create_id: createId }),
    active_rules: [],
    rule_history: [],
    items: [],
    active_quest: null,
    quest_history: [],
    pending_rewards: [],
    permanent_multipliers: [],
    remove_card_cost: 0,
    remove_count: 0,
    last_shop_transaction: null,
    outcome: null,
    phase_history: [],
    round: createRoundState(),
  };
}

export function canTransition(from, to) {
  return PHASE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function transitionPhase(state, nextPhase, metadata = {}) {
  if (!canTransition(state.phase, nextPhase)) {
    throw new Error(`Invalid phase transition: ${state.phase} -> ${nextPhase}`);
  }
  state.phase_history.push({ from: state.phase, to: nextPhase, ...metadata });
  state.phase = nextPhase;
  return state.phase;
}

export function resetRoundState(state) {
  state.round = createRoundState();
  return state.round;
}

export const INITIAL_PLAYER_STATE = Object.freeze(createInitialPlayerState({ create_id: (_, index) => `preview-${index}` }));

export function createGameState(options = {}) {
  return createInitialPlayerState(options);
}
