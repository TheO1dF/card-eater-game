import { createInitialDeck } from "./data.js";

export const GAME_STATES = Object.freeze({
  INIT: "Init",
  RULE_DRAFT: "RuleDraft",
  PLAYING: "Playing",
  SCORING: "Scoring",
  SHOP: "Shop",
  NEXT_ROUND: "NextRound",
  GAME_OVER: "GameOver",
});

export function createInitialPlayerState() {
  return {
    current_round: 1,
    total_score: 0,
    target_score: 0,
    gold: 0,
    deck: createInitialDeck(),
    active_rules: [],
    pending_rule_choices:[],
    remove_card_cost: 0,
    remove_count: 0,
    history: [],
    eatHistory:[],
    discardHistory: [],
    roundHistory: [],
    lastCombos:[],
    lastRoundScore: 0,
    lastBaseScore: 0,
    lastComboBonus: 0,
    roundTimerStartedAt: null,
    roundElapsedMs: 0,
    lastTimeMultiplier: 1,
    lastTimeQualified: false,
    turnBuffs:[],
    pendingGoldBonus: 0,
    forceDiscardRemaining: false,
    shopDiscount: 0,
  };
}

export const INITIAL_PLAYER_STATE = Object.freeze(createInitialPlayerState());

export function createGameState() {
  return {
    phase: GAME_STATES.INIT,
    player: createInitialPlayerState(),
    history:[],
  };
}