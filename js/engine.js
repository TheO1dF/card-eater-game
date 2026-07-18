import { GAME_CONFIG, getNextMilestone } from "./config.js";

const ACTIONS = Object.freeze({ EAT: "eat", DISCARD: "discard" });

function sequenceFor(state, action) {
  return action === ACTIONS.EAT ? state.round.eat_sequence : state.round.discard_sequence;
}

function matchesTarget(rule, card) {
  const typeMatches = !rule.target_type || rule.target_type === card.type;
  const rarityMatches = !rule.target_rarity || rule.target_rarity === card.rarity;
  const edibilityMatches = !rule.target_edibility || rule.target_edibility === card.edibility;
  return typeMatches && rarityMatches && edibilityMatches;
}

function getRuleFlatBonus(state, action, card) {
  return state.active_rules.reduce((total, rule) => {
    if (rule.scope !== "flat_bonus" || rule.action !== action || !matchesTarget(rule, card)) return total;
    return total + (rule.bonus ?? 0);
  }, 0);
}

function consumeActionBuffs(state, action, card) {
  let multiplier = 1;
  let flatBonus = 0;

  for (const buff of state.round.buffs) {
    const actionMatches = buff.action === "*" || buff.action === action;
    const typeMatches = !buff.target_type || buff.target_type === "*" || buff.target_type === card.type;
    const edibilityMatches = !buff.target_edibility || buff.target_edibility === card.edibility;
    if (buff.remaining <= 0 || !actionMatches || !typeMatches || !edibilityMatches) continue;

    if (buff.kind === "multiplier") multiplier *= buff.value;
    if (buff.kind === "flat") flatBonus += buff.value;
    buff.remaining -= 1;
  }

  state.round.buffs = state.round.buffs.filter((buff) => buff.remaining > 0);
  return { multiplier, flat_bonus: flatBonus };
}

function addBuff(state, buff) {
  state.round.buffs.push({ ...buff });
}

function markEffect(entry, card, detail = card.effect?.description) {
  entry.effect_triggered = detail ?? card.name;
}

function applyCardEffect(state, action, card, entry) {
  const effect = card.effect;
  if (!effect) return;

  if (effect.kind === "buff_next_action" && (effect.trigger_action === "*" || effect.trigger_action === action)) {
    addBuff(state, {
      kind: effect.modifier === "flat" ? "flat" : "multiplier",
      action: effect.action,
      target_type: effect.target_type,
      target_edibility: effect.target_edibility,
      remaining: effect.count,
      value: effect.modifier === "flat" ? effect.add : effect.multiplier,
      source: card.name,
    });
    markEffect(entry, card);
  }

  if (effect.kind === "debuff_next_action" && action === ACTIONS.EAT) {
    addBuff(state, {
      kind: "flat",
      action: effect.action ?? "*",
      target_type: effect.target_type,
      target_edibility: effect.target_edibility,
      remaining: effect.count,
      value: effect.amount,
      source: card.name,
    });
    markEffect(entry, card);
  }

  if (effect.kind === "clear_debuff" && action === ACTIONS.EAT) {
    state.round.buffs = state.round.buffs.filter((buff) => buff.kind !== "flat" || buff.value >= 0);
    markEffect(entry, card);
  }

  if (effect.kind === "permanent_growth_eat" && action === ACTIONS.EAT) {
    const permanentCard = state.deck.find((item) => item.uuid === card.uuid);
    if (permanentCard) permanentCard.eat_points += effect.amount ?? 0;
    markEffect(entry, card, `${card.name} 永久成长 +${effect.amount ?? 0}`);
  }

  if (effect.kind === "gold_economy") {
    if (action === ACTIONS.DISCARD) {
      state.round.pending_gold_bonus += effect.discard_add_gold ?? 0;
      markEffect(entry, card, `${card.name}：结算金币 +${effect.discard_add_gold ?? 0}`);
    }
    if (action === ACTIONS.EAT) {
      state.gold += effect.eat_destroy_add_gold ?? 0;
      const index = state.deck.findIndex((item) => item.uuid === card.uuid);
      if (index >= 0) state.deck.splice(index, 1);
      markEffect(entry, card, `${card.name}：金币 +${effect.eat_destroy_add_gold ?? 0}，永久销毁`);
    }
  }

  if (effect.kind === "shop_discount" && action === (effect.trigger_action ?? ACTIONS.DISCARD)) {
    state.round.shop_discount += effect.discount ?? 0;
    markEffect(entry, card, `${card.name}：商店价格 -${effect.discount ?? 0}`);
  }

  if (effect.kind === "scale_by_history" && action === effect.trigger_action) {
    const history = sequenceFor(state, effect.history_action);
    const count = history.filter((item) => {
      const typeMatches = !effect.target_type || item.type === effect.target_type;
      const edibilityMatches = !effect.target_edibility || item.edibility === effect.target_edibility;
      return typeMatches && edibilityMatches;
    }).length;
    entry.effect_bonus += count * (effect.multiplier ?? 0);
    if (count > 0) {
      entry.effect_log = `${card.name}：历史加成`;
      markEffect(entry, card, `${card.name}：历史加成 +${count * (effect.multiplier ?? 0)}`);
    }
  }

  if (effect.kind === "retro_multiplier_eaten_tag" && action === (effect.trigger_action ?? ACTIONS.EAT)) {
    const priorScore = state.round.eat_sequence
      .filter((item) => !effect.target_type || item.type === effect.target_type)
      .reduce((sum, item) => sum + item.points, 0);
    entry.effect_bonus += Math.round(priorScore * ((effect.multiplier ?? 1) - 1));
    if (priorScore !== 0) {
      entry.effect_log = `${card.name}：追溯加成`;
      markEffect(entry, card, `${card.name}：追溯 +${entry.effect_bonus}`);
    }
  }

  if (effect.kind === "bonus_if_previous" && action === (effect.trigger_action ?? ACTIONS.EAT)) {
    const history = effect.sequence === "discard"
      ? state.round.discard_sequence
      : effect.sequence === "actions"
        ? state.round.actions
        : state.round.eat_sequence;
    const previous = history.at(-1);
    const matches = previous
      && (!effect.target_type || previous.type === effect.target_type)
      && (!effect.target_edibility || previous.edibility === effect.target_edibility)
      && (!effect.previous_action || previous.action === effect.previous_action);
    if (matches) {
      entry.effect_bonus += effect.bonus ?? 0;
      entry.effect_log = `${card.name}：顺序加成`;
      markEffect(entry, card, `${card.name}：顺序正确 +${effect.bonus ?? 0}`);
    }
  }

  if (effect.kind === "bonus_if_position" && action === effect.trigger_action) {
    const isFirst = effect.position === "first" && state.round.actions.length === 0;
    const isLast = effect.position === "last" && state.round.draw_pile.length === 1;
    if (isFirst || isLast) {
      entry.effect_bonus += effect.bonus ?? 0;
      entry.effect_log = `${card.name}：${isFirst ? "首位" : "末位"}加成`;
      markEffect(entry, card, `${card.name}：${isFirst ? "首位" : "末位"} +${effect.bonus ?? 0}`);
    }
  }

  if (effect.kind === "copy_previous_score" && action === effect.trigger_action) {
    const copiedScore = Math.max(0, state.round.actions.at(-1)?.points ?? 0);
    if (copiedScore > 0) {
      entry.effect_bonus += copiedScore;
      entry.effect_log = `${card.name}：复制得分`;
      markEffect(entry, card, `${card.name}：复制 +${copiedScore}`);
    }
  }

  if (effect.kind === "discard_all_remaining" && action === effect.trigger_action) {
    state.round.force_discard_remaining = true;
    if (effect.final_multiplier) {
      state.round.final_multipliers.push({ name: card.name, multiplier: effect.final_multiplier });
    }
    markEffect(entry, card);
  }
}

function hasSequence(sequence, rule) {
  let streak = 0;
  for (const item of sequence) {
    streak = matchesTarget(rule, item) ? streak + 1 : 0;
    if (streak >= rule.count) return true;
  }
  return false;
}

export function evaluateRule(state, rule) {
  const eat = state.round.eat_sequence;
  const discard = state.round.discard_sequence;
  const actions = state.round.actions;

  switch (rule.scope) {
    case "flat_bonus": return true;
    case "sequence_eat": return hasSequence(eat, rule);
    case "sequence_discard": return hasSequence(discard, rule);
    case "time_limit": return state.round.elapsed_ms > 0 && state.round.elapsed_ms <= rule.time_limit_ms;
    case "no_eat_type": return !eat.some((item) => item.type === rule.target_type);
    case "no_eat_edibility": return !eat.some((item) => item.edibility === rule.target_edibility);
    case "no_discard_edibility": return !discard.some((item) => item.edibility === rule.target_edibility);
    case "min_discard": return discard.length >= rule.count;
    case "min_eat": return eat.length >= rule.count;
    case "min_eat_target": return eat.filter((item) => matchesTarget(rule, item)).length >= rule.count;
    case "min_discard_target": return discard.filter((item) => matchesTarget(rule, item)).length >= rule.count;
    case "exact_eat_count": return eat.length === rule.count;
    case "equal_eat_discard": return eat.length > 0 && eat.length === discard.length;
    case "balanced_actions": return eat.length > 0 && discard.length > 0 && Math.abs(eat.length - discard.length) <= 1;
    case "max_deck_size": return state.deck.length <= rule.count;
    case "min_deck_size": return state.deck.length >= rule.count;
    case "no_negative_action": return actions.every((item) => item.points >= 0);
    case "min_negative_eat": return eat.filter((item) => item.points < 0).length >= rule.count;
    case "unique_eat_types": return new Set(eat.map((item) => item.type)).size >= rule.count;
    case "unique_discard_types": return new Set(discard.map((item) => item.type)).size >= rule.count;
    case "round_card_score": return actions.reduce((sum, item) => sum + item.points, 0) >= rule.score;
    case "sacrifice_then_score": return actions.some((item, index) => (
      item.action === ACTIONS.EAT
      && item.points < 0
      && actions.slice(index + 1).some((later) => later.points >= rule.score)
    ));
    case "alternating_actions": {
      let streak = actions.length > 0 ? 1 : 0;
      let best = streak;
      for (let index = 1; index < actions.length; index += 1) {
        streak = actions[index].action !== actions[index - 1].action ? streak + 1 : 1;
        best = Math.max(best, streak);
      }
      return best >= rule.count;
    }
    case "action_streak": {
      let streak = 0;
      for (const item of actions) {
        streak = item.action === rule.action ? streak + 1 : 0;
        if (streak >= rule.count) return true;
      }
      return false;
    }
    case "perfect_sort": return actions.length > 0 && actions.every((item) => (
      (item.edibility === "edible" && item.action === ACTIONS.EAT)
      || (item.edibility === "inedible" && item.action === ACTIONS.DISCARD)
    ));
    default: return false;
  }
}

export function createRoundEngine() {
  function recordAction(state, action, card) {
    if (action !== ACTIONS.EAT && action !== ACTIONS.DISCARD) {
      throw new Error(`Unknown card action: ${action}`);
    }

    if (card.effect?.kind === "clear_debuff" && action === ACTIONS.EAT) {
      state.round.buffs = state.round.buffs.filter((buff) => buff.kind !== "flat" || buff.value >= 0);
    }

    const printedPoints = action === ACTIONS.EAT ? card.eat_points ?? 0 : card.discard_points ?? 0;
    const ruleBonus = getRuleFlatBonus(state, action, card);
    const buffs = consumeActionBuffs(state, action, card);
    const entry = {
      card_id: card.id,
      card_uuid: card.uuid,
      name: card.name,
      type: card.type,
      edibility: card.edibility,
      rarity: card.rarity,
      action,
      printed_points: printedPoints,
      rule_bonus: ruleBonus,
      buff_flat_bonus: buffs.flat_bonus,
      buff_multiplier: buffs.multiplier,
      effect_bonus: 0,
      effect_log: null,
      effect_triggered: null,
      points: 0,
    };

    // Effects are applied after consuming existing buffs, so newly created buffs affect future cards only.
    applyCardEffect(state, action, card, entry);
    entry.points = Math.round((printedPoints + ruleBonus + buffs.flat_bonus) * buffs.multiplier) + entry.effect_bonus;

    state.round.actions.push(entry);
    sequenceFor(state, action).push(entry);
    return entry;
  }

  function getRuleResults(state) {
    return state.active_rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      achieved: evaluateRule(state, rule),
      multiplier: rule.multiplier ?? 1,
    }));
  }

  function finalizeRound(state) {
    const cardScore = state.round.actions.reduce((sum, item) => sum + item.points, 0);
    const ruleResults = getRuleResults(state);
    const multipliers = [
      ...state.round.final_multipliers,
      ...ruleResults
        .filter((result) => result.achieved && result.multiplier !== 1)
        .map((result) => ({ name: result.name, multiplier: result.multiplier })),
    ];
    const totalMultiplier = multipliers.reduce((value, item) => value * item.multiplier, 1);
    const roundScore = Math.round(cardScore * totalMultiplier);

    const breakdown = [{ label: "牌面与效果", text: `${cardScore} 分` }];
    const byType = state.round.actions.reduce((result, item) => {
      result[item.type] = (result[item.type] ?? 0) + item.points;
      return result;
    }, {});
    Object.entries(byType)
      .sort(([, a], [, b]) => b - a)
      .forEach(([type, score]) => breakdown.push({ label: `↳ ${type}`, text: `${score} 分`, kind: "detail" }));

    state.round.actions
      .filter((item) => item.effect_bonus !== 0 && item.effect_log)
      .forEach((item) => breakdown.push({ label: item.effect_log, text: `${item.effect_bonus > 0 ? "+" : ""}${item.effect_bonus}`, kind: "bonus" }));

    if (multipliers.length === 0) {
      breakdown.push({ label: "规则倍率", text: "×1" });
    } else {
      multipliers.forEach((item) => breakdown.push({ label: `规则 · ${item.name}`, text: `×${item.multiplier}`, kind: "rule" }));
    }
    breakdown.push({ label: "本轮得分", text: `${roundScore >= 0 ? "+" : ""}${roundScore}`, kind: "total" });

    state.total_score += roundScore;
    state.gold += state.round.pending_gold_bonus;
    state.round.pending_gold_bonus = 0;

    return {
      card_score: cardScore,
      total_multiplier: totalMultiplier,
      round_score: roundScore,
      rule_results: ruleResults,
      breakdown,
    };
  }

  function levelProgressCheck(state) {
    const target = GAME_CONFIG.milestone_targets[state.current_round] ?? 0;
    return { passed: target === 0 || state.total_score >= target, target };
  }

  function getGoldReward(state) {
    return state.round.eat_sequence.length;
  }

  return {
    recordAction,
    finalizeRound,
    getGoldReward,
    levelProgressCheck,
    getNextTargetInfo: getNextMilestone,
  };
}
