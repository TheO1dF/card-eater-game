import { GAME_CONFIG } from "./config.js";
import { createInitialDeck } from "./data.js";

export const GAME_PHASES = Object.freeze({
  INIT: "Init",
  RULE_DRAFT: "RuleDraft",
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
  [GAME_PHASES.RULE_DRAFT]: [GAME_PHASES.PLAYING],
  [GAME_PHASES.PLAYING]: [GAME_PHASES.SCORING],
  [GAME_PHASES.SCORING]: [GAME_PHASES.SHOP, GAME_PHASES.GAME_OVER],
  [GAME_PHASES.SHOP]: [GAME_PHASES.NEXT_ROUND],
  [GAME_PHASES.NEXT_ROUND]: [GAME_PHASES.RULE_DRAFT, GAME_PHASES.GAME_OVER],
  [GAME_PHASES.GAME_OVER]: [],
});

export function createRoundState() {
  return {
    draw_pile: [],
    actions: [],
    eat_sequence: [],
    discard_sequence: [],
    buffs: [],
    final_multipliers: [],
    started_at_ms: null,
    elapsed_ms: 0,
    pending_gold_bonus: 0,
    force_discard_remaining: false,
    shop_discount: 0,
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
    remove_card_cost: 0,
    remove_count: 0,
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
