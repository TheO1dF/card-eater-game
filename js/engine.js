import { GAME_CONFIG, getNextMilestone } from "./config.js";
import { createShopCardPool, getCardById } from "./data.js";
import { getItemFinalMultipliers, resolveItemActionEffects } from "./items.js";
import { formatScore, safeAdd, safeMultiply, safeProduct } from "./numbers.js";

const ACTIONS = Object.freeze({ EAT: "eat", DISCARD: "discard" });

function sequenceFor(state, action) {
  return action === ACTIONS.EAT ? state.round.eat_sequence : state.round.discard_sequence;
}

function matchesTarget(rule, card) {
  const idMatches = !rule.target_id || rule.target_id === card.id || rule.target_id === card.card_id;
  const typeMatches = !rule.target_type || rule.target_type === card.type;
  const rarityMatches = !rule.target_rarity || rule.target_rarity === card.rarity;
  const edibilityMatches = !rule.target_edibility || rule.target_edibility === card.edibility;
  return idMatches && typeMatches && rarityMatches && edibilityMatches;
}

function matchesPosition(state, position) {
  if (position === "first") return state.round.actions.length === 0;
  if (position === "second") return state.round.actions.length === 1;
  if (position === "last") return state.round.draw_pile.length === 1;
  if (position === "middle") return state.round.actions.length > 0 && state.round.draw_pile.length > 1;
  return false;
}

function isWrongEdibilityAction(action, card) {
  return (card.edibility === "edible" && action === ACTIONS.DISCARD)
    || (card.edibility === "inedible" && action === ACTIONS.EAT);
}

function getRuleFlatBonus(state, action, card) {
  return state.active_rules.reduce((total, rule) => {
    if (rule.scope !== "flat_bonus" || rule.action !== action || !matchesTarget(rule, card)) return total;
    return safeAdd(total, rule.bonus ?? 0);
  }, 0);
}

function consumeActionBuffs(state, action, card) {
  let multiplier = 1;
  let flatBonus = 0;
  let useBestSide = false;
  let useOppositeSide = false;

  for (const buff of state.round.buffs) {
    if (buff.kind === "until_action" && action === buff.stop_action) {
      buff.remaining = 0;
      continue;
    }
    if (buff.kind === "wrong_edibility_flat") {
      if (buff.remaining > 0 && isWrongEdibilityAction(action, card)) {
        flatBonus = safeAdd(flatBonus, buff.value ?? 0);
        buff.remaining -= 1;
      }
      continue;
    }
    const actionMatches = buff.action === "*" || buff.action === action;
    const typeMatches = !buff.target_type || buff.target_type === "*" || buff.target_type === card.type;
    const edibilityMatches = !buff.target_edibility || buff.target_edibility === card.edibility;
    if (buff.remaining <= 0 || !actionMatches || !typeMatches || !edibilityMatches) continue;

    if (buff.kind === "multiplier") multiplier = safeProduct(multiplier, buff.value);
    if (buff.kind === "flat") flatBonus = safeAdd(flatBonus, buff.value);
    if (buff.kind === "best_side") useBestSide = true;
    if (buff.kind === "opposite_side") useOppositeSide = true;
    if (buff.kind === "until_action") flatBonus = safeAdd(flatBonus, buff.value ?? 0);
    if (buff.kind === "wager") {
      const chosenSide = action === ACTIONS.EAT ? card.eat_points ?? 0 : card.discard_points ?? 0;
      if (chosenSide > 0) multiplier = safeProduct(multiplier, buff.multiplier ?? 1);
      else flatBonus = safeAdd(flatBonus, buff.failure_penalty ?? 0);
    }
    if (buff.kind === "choice") {
      if (action === buff.good_action) flatBonus = safeAdd(flatBonus, buff.good_bonus ?? 0);
      if (action === buff.bad_action) flatBonus = safeAdd(flatBonus, buff.bad_penalty ?? 0);
    }
    if (buff.kind === "unique_flat") {
      buff.seen_types ??= [];
      if (buff.seen_types.includes(card.type)) continue;
      buff.seen_types.push(card.type);
      flatBonus = safeAdd(flatBonus, buff.value);
    }
    if (buff.kind !== "until_action") buff.remaining -= 1;
  }

  state.round.buffs = state.round.buffs.filter((buff) => buff.remaining > 0);
  return {
    multiplier,
    flat_bonus: flatBonus,
    use_best_side: useBestSide,
    use_opposite_side: useOppositeSide,
  };
}

function addBuff(state, buff) {
  state.round.buffs.push({ ...buff });
}

function consumeOncePerRound(state, card, effect) {
  if (!effect.once_per_round) return true;
  const key = `card:${card.uuid}:${effect.kind}`;
  if (state.round.effect_trigger_counts[key]) return false;
  state.round.effect_trigger_counts[key] = 1;
  return true;
}

function removePermanentCard(state, cardUuid) {
  const index = state.deck.findIndex((item) => item.uuid === cardUuid);
  if (index < 0) return null;
  const removed = state.deck.splice(index, 1)[0];
  state.round.destroyed_count = (state.round.destroyed_count ?? 0) + 1;
  return removed;
}

function growPermanentCard(state, card, stat, amount) {
  const growth = Math.max(0, amount ?? 0);
  if (growth === 0) return 0;
  const permanentCard = state.deck.find((item) => item.uuid === card.uuid);
  if (permanentCard) permanentCard[stat] = safeAdd(permanentCard[stat] ?? 0, growth);
  if (card !== permanentCard) card[stat] = safeAdd(card[stat] ?? 0, growth);
  state.round.grown_count = (state.round.grown_count ?? 0) + 1;
  return growth;
}

function changePermanentCard(state, card, stat, amount, limits = {}) {
  const delta = Number(amount ?? 0);
  if (!Number.isFinite(delta) || delta === 0) return 0;
  const permanentCard = state.deck.find((item) => item.uuid === card.uuid);
  if (!permanentCard) return 0;
  const before = permanentCard[stat] ?? 0;
  const next = Math.max(limits.min ?? -GAME_CONFIG.max_score, Math.min(limits.max ?? GAME_CONFIG.max_score, safeAdd(before, delta)));
  permanentCard[stat] = next;
  const copies = [card, ...state.round.draw_pile, ...state.round.spent_pile];
  copies.forEach((copy) => {
    if (copy?.uuid === card.uuid) copy[stat] = next;
  });
  if (next !== before) state.round.grown_count = (state.round.grown_count ?? 0) + 1;
  return next - before;
}

function resetPermanentCardPoints(state, permanentCard) {
  const eat = permanentCard.base_eat_points ?? permanentCard.eat_points ?? 0;
  const discard = permanentCard.base_discard_points ?? permanentCard.discard_points ?? 0;
  permanentCard.eat_points = eat;
  permanentCard.discard_points = discard;
  [...state.round.draw_pile, ...state.round.spent_pile].forEach((copy) => {
    if (copy.uuid !== permanentCard.uuid) return;
    copy.eat_points = eat;
    copy.discard_points = discard;
  });
}

function restoreReducedPermanentCardPoints(state, permanentCard) {
  const baseEat = permanentCard.base_eat_points ?? permanentCard.eat_points ?? 0;
  const baseDiscard = permanentCard.base_discard_points ?? permanentCard.discard_points ?? 0;
  const eat = Math.max(permanentCard.eat_points ?? 0, baseEat);
  const discard = Math.max(permanentCard.discard_points ?? 0, baseDiscard);
  const restored = (eat - (permanentCard.eat_points ?? 0)) + (discard - (permanentCard.discard_points ?? 0));
  permanentCard.eat_points = eat;
  permanentCard.discard_points = discard;
  [...state.round.draw_pile, ...state.round.spent_pile].forEach((copy) => {
    if (copy.uuid !== permanentCard.uuid) return;
    copy.eat_points = eat;
    copy.discard_points = discard;
  });
  return restored;
}

function createGeneratedCard(state, sourceCard, template, options = {}) {
  if (!template || state.deck.length >= GAME_CONFIG.max_deck_size) return null;
  state.round.generated_count = (state.round.generated_count ?? 0) + 1;
  const uuid = `${template.id}-generated-${sourceCard.uuid}-${state.current_round}-${state.round.generated_count}`;
  const generated = {
    ...template,
    synergy_tags: [...(template.synergy_tags ?? [])],
    effect: template.effect ? { ...template.effect, keywords: [...(template.effect.keywords ?? [])] } : null,
    generated_from: sourceCard.id,
    generated_label: sourceCard.name,
    weakened: Boolean(options.weakened),
    status_keywords: options.weakened ? ["弱化"] : [],
    uuid,
  };
  state.deck.push(generated);
  return generated;
}

function prepareImmediateEffect(state, action, card) {
  const effect = card.effect;
  if (!effect || action !== (effect.trigger_action ?? ACTIONS.EAT)) return { bonus: 0, detail: null };
  if (effect.kind === "absorb_debuff") {
    const negative = state.round.buffs.filter((buff) => buff.kind === "flat" && buff.value < 0);
    const raw = negative.reduce((total, buff) => safeAdd(total, Math.abs(buff.value) * buff.remaining), 0);
    const bonus = Math.min(effect.max_bonus ?? raw, raw);
    state.round.buffs = state.round.buffs.filter((buff) => !(buff.kind === "flat" && buff.value < 0));
    return { bonus, detail: bonus > 0 ? `${card.name}：净化并转化 +${bonus}` : `${card.name}：没有待净化负面蓄势` };
  }
  if (effect.kind === "reset_buffs_bonus") {
    const removed = state.round.buffs.length;
    const bonus = Math.min(effect.max_bonus ?? GAME_CONFIG.max_score, removed * (effect.bonus_per_buff ?? 0));
    state.round.buffs = [];
    return { bonus, detail: removed > 0 ? `${card.name}：净化 ${removed} 个蓄势，+${bonus}` : `${card.name}：没有待净化蓄势` };
  }
  return { bonus: 0, detail: null };
}

function markEffect(entry, card, detail = card.effect?.description) {
  entry.effect_triggered = detail ?? card.name;
}

function applyCardEffect(state, action, card, entry, random = Math.random) {
  const effect = card.effect;
  if (!effect) return;

  if (effect.kind === "wrong_edibility_bonus" && entry.wrong_edibility) {
    const bonus = effect.bonus ?? 0;
    entry.effect_bonus = safeAdd(entry.effect_bonus, bonus);
    markEffect(entry, card, `${card.name}：硬吃成功，额外 +${bonus}`);
  }

  if (effect.kind === "wrong_edibility_streak" && entry.wrong_edibility) {
    const bonus = Math.min(effect.max_bonus ?? GAME_CONFIG.max_score,
      (state.round.wrong_edibility_streak ?? 0) * (effect.bonus_per_streak ?? 0));
    entry.effect_bonus = safeAdd(entry.effect_bonus, bonus);
    markEffect(entry, card, `${card.name}：硬吃连击 ×${state.round.wrong_edibility_streak}，额外 +${bonus}`);
  }

  if (effect.kind === "wrong_history_scale" && entry.wrong_edibility) {
    const previousWrong = Math.max(0, (state.round.wrong_edibility_count ?? 0) - 1);
    const bonus = Math.min(effect.max_bonus ?? GAME_CONFIG.max_score, previousWrong * (effect.multiplier ?? 1));
    entry.effect_bonus = safeAdd(entry.effect_bonus, bonus);
    markEffect(entry, card, `${card.name}：吞入 ${previousWrong} 次硬吃记录，额外 +${bonus}`);
  }

  if (effect.kind === "wrong_edibility_setup_destroy" && action === effect.trigger_action && entry.wrong_edibility) {
    addBuff(state, { kind: "wrong_edibility_flat", action: "*", remaining: 1, value: effect.bonus ?? 0, source: card.name });
    const removed = state.deck.length > 1 ? removePermanentCard(state, card.uuid) : null;
    if (removed) entry.destroyed_self = true;
    markEffect(entry, card, `${card.name}：下一次硬吃 +${effect.bonus ?? 0}${removed ? "，摧毁自身" : ""}`);
  }

  if (effect.kind === "fruit_combo" && action === ACTIONS.EAT) {
    const comboBefore = state.round.fruit_combo ?? 0;
    const combo = comboBefore + Math.max(1, effect.combo_gain ?? 1);
    state.round.fruit_combo = combo;
    state.round.best_fruit_combo = Math.max(state.round.best_fruit_combo ?? 0, combo);
    let bonus = Math.min(effect.max_bonus ?? GAME_CONFIG.max_score, combo * (effect.bonus_per_combo ?? 1));
    if (comboBefore === 0) bonus = safeAdd(bonus, effect.opener_bonus ?? 0);
    if (combo >= (effect.threshold ?? Number.POSITIVE_INFINITY)) bonus = safeAdd(bonus, effect.threshold_bonus ?? 0);
    if (combo >= (effect.double_at ?? Number.POSITIVE_INFINITY)) bonus = safeMultiply(bonus, 2);
    entry.effect_bonus = safeAdd(entry.effect_bonus, bonus);
    entry.fruit_combo = combo;
    entry.effect_log = `${card.name}：水果连击 ×${combo}`;

    const generationReady = combo >= (effect.generate_at ?? Number.POSITIVE_INFINITY);
    if (generationReady && consumeOncePerRound(state, card, effect)) {
      let template = effect.generate_card_id ? getCardById(effect.generate_card_id) : null;
      if (!template && effect.generate_random_type) {
        const candidates = createShopCardPool().filter((candidate) => candidate.type === effect.generate_random_type);
        template = candidates[Math.floor(random() * candidates.length)] ?? null;
      }
      const generated = createGeneratedCard(state, card, template, { weakened: effect.generate_weakened });
      if (generated) entry.generated_card = generated.name;
    }
    if (combo >= (effect.grow_at ?? Number.POSITIVE_INFINITY)) {
      const growth = changePermanentCard(state, card, "eat_points", effect.grow_amount ?? 0);
      if (growth) entry.permanent_change = { stat: "eat_points", amount: growth };
    }
    markEffect(entry, card, `${card.name}：水果连击 ×${combo}，额外 +${bonus}${entry.generated_card ? `，生成「${entry.generated_card}」` : ""}`);
  }

  if (effect.kind === "anorexia") {
    if (action === ACTIONS.EAT) {
      const requestedGold = Math.max(0, effect.eat_gold_cost ?? 0);
      const paidGold = Math.min(state.gold, requestedGold);
      const unpaidGold = requestedGold - paidGold;
      if (paidGold > 0) state.gold = safeAdd(state.gold, -paidGold);
      if (requestedGold > 0) {
        const penalty = unpaidGold * Math.max(0, effect.unpaid_score_penalty ?? 0);
        entry.effect_bonus = safeAdd(entry.effect_bonus, -penalty);
        entry.gold_change = -paidGold;
        entry.payment = { requested: requestedGold, paid: paidGold, penalty };
      }
      if (effect.extreme) {
        const removed = state.deck.length > 1 ? removePermanentCard(state, card.uuid) : null;
        markEffect(entry, card, removed ? `${card.name}：极端厌食，摧毁自身` : `${card.name}：最后一张牌不会摧毁`);
      } else {
        const eatChange = changePermanentCard(state, card, "eat_points", -(effect.eat_loss ?? 1), { min: -5 });
        const discardChange = changePermanentCard(state, card, "discard_points", effect.discard_gain ?? 1, { max: 12 });
        entry.permanent_change = { eat: eatChange, discard: discardChange };
        if (effect.buff_target_type) addBuff(state, {
          kind: "flat", action: ACTIONS.EAT, target_type: effect.buff_target_type,
          remaining: 1, value: effect.buff_add ?? 0, source: card.name,
        });
        const payment = requestedGold > 0
          ? `，支付 ${paidGold}/${requestedGold} 金币${unpaidGold > 0 ? `，缺额罚分 -${unpaidGold * (effect.unpaid_score_penalty ?? 0)}` : ""}`
          : "";
        markEffect(entry, card, `${card.name}：厌食，吃分 ${eatChange} / 弃分 +${discardChange}${payment}`);
      }
    }
    if (action === ACTIONS.DISCARD) {
      const lost = Math.max(0, (card.base_eat_points ?? card.eat_points ?? 0) - (card.eat_points ?? 0));
      const bonus = Math.floor(lost / Math.max(1, effect.discard_conversion_divisor ?? Number.POSITIVE_INFINITY));
      entry.effect_bonus = safeAdd(entry.effect_bonus, Number.isFinite(bonus) ? bonus : 0);
      if ((card.discard_points ?? 0) >= (effect.discard_gold_threshold ?? Number.POSITIVE_INFINITY)) {
        state.round.pending_gold_bonus = safeAdd(state.round.pending_gold_bonus, effect.discard_gold ?? 0);
      }
      if (bonus > 0 || effect.discard_gold) markEffect(entry, card, `${card.name}：厌食转化 +${bonus}`);
    }
  }

  if (effect.kind === "retention") {
    if (action === ACTIONS.DISCARD) {
      const previous = state.round.actions.at(-1);
      let amount = safeAdd(effect.retain ?? 0, state.items
        .filter((item) => item.effect?.kind === "retention_growth_bonus")
        .reduce((sum, item) => safeAdd(sum, item.effect.amount ?? 0), 0));
      if (previous?.type === effect.previous_type) amount = safeAdd(amount, effect.previous_retain_bonus ?? 0);
      if (state.round.postponed_uuids?.includes(card.uuid)) amount = safeAdd(amount, effect.postponed_retain_bonus ?? 0);
      const change = changePermanentCard(state, card, "eat_points", amount, { max: effect.max_eat_points ?? 30 });
      entry.permanent_change = { stat: "eat_points", amount: change };
      markEffect(entry, card, `${card.name}：留存，吃分永久 +${change}`);
    }
    if (action === ACTIONS.EAT && entry.printed_points >= (effect.burst_threshold ?? Number.POSITIVE_INFINITY)) {
      const multiplier = Math.max(1, effect.burst_multiplier ?? 1);
      const burst = safeMultiply(entry.printed_points, multiplier - 1);
      entry.effect_bonus = safeAdd(entry.effect_bonus, burst);
      state.round.pending_gold_bonus = safeAdd(state.round.pending_gold_bonus, effect.burst_gold ?? 0);
      state.round.shop_discount = safeAdd(state.round.shop_discount, effect.burst_discount ?? 0);
      if (effect.reset_after_eat) {
        const permanentCard = state.deck.find((item) => item.uuid === card.uuid);
        if (permanentCard) resetPermanentCardPoints(state, permanentCard);
      }
      markEffect(entry, card, `${card.name}：留存爆发 ×${multiplier}${effect.reset_after_eat ? "，牌面重置" : ""}`);
    }
  }

  if (effect.kind === "drink_consume" && action === ACTIONS.EAT) {
    if (effect.cleanse_deck) state.deck.forEach((owned) => restoreReducedPermanentCardPoints(state, owned));
    state.round.pending_gold_bonus = safeAdd(state.round.pending_gold_bonus, effect.gold ?? 0);
    for (const item of state.items.filter((owned) => owned.effect?.kind === "drink_first_gold")) {
      const key = `item:${item.id}:drink-gold`;
      if (state.round.effect_trigger_counts[key]) continue;
      state.round.effect_trigger_counts[key] = 1;
      state.round.pending_gold_bonus = safeAdd(state.round.pending_gold_bonus, item.effect.gold ?? 0);
    }
    state.round.reshuffle_charges = safeAdd(state.round.reshuffle_charges, effect.reshuffle_charges ?? 0);
    if (effect.buff_add || effect.buff_multiplier) addBuff(state, {
      kind: effect.buff_multiplier ? "multiplier" : "flat",
      action: effect.buff_action ?? "*",
      target_type: effect.buff_target_type,
      remaining: 1,
      value: effect.buff_multiplier ?? effect.buff_add,
      source: card.name,
    });
    if (effect.generate_random_type) {
      const candidates = createShopCardPool().filter((candidate) => candidate.type === effect.generate_random_type);
      const template = candidates[Math.floor(random() * candidates.length)] ?? null;
      const generated = createGeneratedCard(state, card, template, { weakened: effect.generate_weakened });
      if (generated) entry.generated_card = generated.name;
    }
    const removed = state.deck.length > 1 ? removePermanentCard(state, card.uuid) : null;
    markEffect(entry, card, `${card.name}：${removed ? "摧毁自身" : "最后一张牌不会摧毁"}${effect.gold ? `，金币 +${effect.gold}` : ""}${entry.generated_card ? `，生成${effect.generate_weakened ? "【弱化】" : ""}「${entry.generated_card}」` : ""}`);
  }

  if (effect.kind === "generate_random" && action === effect.trigger_action && consumeOncePerRound(state, card, effect)) {
    const candidates = createShopCardPool().filter((candidate) => !effect.target_type || candidate.type === effect.target_type);
    const template = candidates[Math.floor(random() * candidates.length)] ?? null;
    const generated = createGeneratedCard(state, card, template, { weakened: effect.generate_weakened });
    markEffect(entry, card, generated ? `${card.name}：生成${effect.generate_weakened ? "【弱化】" : ""}「${generated.name}」` : `${card.name}：牌组已满`);
  }

  if (effect.kind === "discard_for_gold" && action === effect.trigger_action && consumeOncePerRound(state, card, effect)) {
    const gold = Math.max(0, effect.gold ?? 0);
    state.gold = safeAdd(state.gold, gold);
    entry.gold_change = safeAdd(entry.gold_change ?? 0, gold);
    markEffect(entry, card, `${card.name}：牺牲分数，金币立即 +${gold}`);
  }

  if (effect.kind === "generate_by_decay" && action === effect.trigger_action && consumeOncePerRound(state, card, effect)) {
    const template = getCardById(effect.card_id);
    const generated = createGeneratedCard(state, card, template, { weakened: true });
    const decay = changePermanentCard(state, card, effect.decay_stat ?? "discard_points", -(effect.decay ?? 1));
    const permanent = state.deck.find((owned) => owned.uuid === card.uuid);
    const shouldDestroy = permanent && (permanent[effect.decay_stat ?? "discard_points"] ?? 0) <= (effect.destroy_at ?? 0);
    const removed = shouldDestroy && state.deck.length > 1 ? removePermanentCard(state, card.uuid) : null;
    entry.permanent_change = { stat: effect.decay_stat ?? "discard_points", amount: decay };
    if (generated) entry.generated_card = generated.name;
    markEffect(entry, card, `${card.name}：生成【弱化】「${generated?.name ?? "失败"}」，自身弃分 ${decay}${removed ? "，降到 0 并摧毁自身" : ""}`);
  }

  if (effect.kind === "drain_random_to_self" && action === effect.trigger_action && consumeOncePerRound(state, card, effect)) {
    const candidates = state.deck.filter((owned) => owned.uuid !== card.uuid && matchesTarget(effect, owned)
      && (owned[effect.target_stat] ?? 0) > (effect.target_min ?? -GAME_CONFIG.max_score));
    const target = candidates[Math.floor(random() * candidates.length)] ?? null;
    if (target) {
      const drained = -changePermanentCard(state, target, effect.target_stat, -(effect.target_loss ?? 1), { min: effect.target_min });
      const gained = changePermanentCard(state, card, effect.self_stat ?? "discard_points", Math.min(drained, effect.self_gain ?? drained));
      entry.point_changes = [
        { card_name: target.name, stat: effect.target_stat, amount: -drained },
        { card_name: card.name, stat: effect.self_stat ?? "discard_points", amount: gained },
      ];
      entry.permanent_change = { stat: effect.self_stat ?? "discard_points", amount: gained };
      markEffect(entry, card, `${card.name}：${target.name} 吃分 -${drained} → 自身弃分 +${gained}`);
    } else {
      markEffect(entry, card, `${card.name}：没有可降低的可食用牌`);
    }
  }

  if (effect.kind === "drain_type_to_self" && action === effect.trigger_action && consumeOncePerRound(state, card, effect)) {
    let drainedTotal = 0;
    const pointChanges = [];
    state.deck.filter((owned) => owned.uuid !== card.uuid && matchesTarget(effect, owned)).forEach((owned) => {
      const drained = -changePermanentCard(state, owned, effect.target_stat, -(effect.target_loss ?? 1), { min: effect.target_min });
      if (drained <= 0) return;
      drainedTotal = safeAdd(drainedTotal, drained);
      pointChanges.push({ card_name: owned.name, stat: effect.target_stat, amount: -drained });
    });
    const gained = changePermanentCard(state, card, effect.self_stat ?? "discard_points", Math.min(effect.max_self_gain ?? drainedTotal, drainedTotal));
    if (gained) pointChanges.push({ card_name: card.name, stat: effect.self_stat ?? "discard_points", amount: gained });
    entry.point_changes = pointChanges;
    entry.permanent_change = { stat: effect.self_stat ?? "discard_points", amount: gained };
    markEffect(entry, card, `${card.name}：水果共降低 ${drainedTotal} 点，自身弃分 +${gained}`);
  }

  if (effect.kind === "swap_remaining_sides" && action === effect.trigger_action) {
    state.round.draw_pile.slice(0, -1).forEach((remaining) => {
      const eat = remaining.eat_points;
      remaining.eat_points = remaining.discard_points;
      remaining.discard_points = eat;
    });
    markEffect(entry, card, `${card.name}：剩余餐盘吃点与弃点互换`);
  }

  if (effect.kind === "celestial_sun" && action === effect.trigger_action) {
    state.round.reshuffle_charges = safeAdd(state.round.reshuffle_charges, effect.charges ?? 1);
    const removed = state.deck.length > 1 ? removePermanentCard(state, card.uuid) : null;
    markEffect(entry, card, `${card.name}：自动重洗 +${effect.charges ?? 1}${removed ? "，摧毁自身" : ""}`);
  }

  if (effect.kind === "bonus_if_postponed" && action === effect.trigger_action && state.round.postponed_uuids?.includes(card.uuid)) {
    entry.effect_bonus = safeAdd(entry.effect_bonus, effect.bonus ?? 0);
    markEffect(entry, card, `${card.name}：后置兑现 +${effect.bonus ?? 0}`);
  }

  if (effect.kind === "pause_timer" && action === effect.trigger_action) {
    state.round.timer_paused = true;
    markEffect(entry, card, `${card.name}：本轮计时冻结`);
  }

  if (effect.kind === "bank_interest" && action === effect.trigger_action && consumeOncePerRound(state, card, effect)) {
    const gold = Math.min(effect.max_gold ?? GAME_CONFIG.max_score, Math.floor(state.gold / Math.max(1, effect.divisor ?? 10)));
    state.round.pending_gold_bonus = safeAdd(state.round.pending_gold_bonus, gold);
    markEffect(entry, card, `${card.name}：存款利息 +${gold} 金币`);
  }

  if (effect.kind === "purify_deck" && action === effect.trigger_action) {
    const restored = state.deck.reduce((sum, owned) => safeAdd(sum, restoreReducedPermanentCardPoints(state, owned)), 0);
    markEffect(entry, card, `${card.name}：恢复 ${restored} 点红色降幅，绿色成长保留`);
  }

  if (effect.kind === "buff_deck_points" && action === effect.trigger_action && consumeOncePerRound(state, card, effect)) {
    let changed = 0;
    state.deck.filter((owned) => matchesTarget(effect, owned)).forEach((owned) => {
      changed += changePermanentCard(state, owned, effect.stat ?? "eat_points", effect.amount ?? 0) !== 0 ? 1 : 0;
    });
    markEffect(entry, card, `${card.name}：${changed} 张牌永久 +${effect.amount ?? 0}`);
  }

  if (effect.kind === "buff_next_action" && (effect.trigger_action === "*" || effect.trigger_action === action)) {
    const previous = state.round.actions.at(-1);
    const required = effect.requires_previous;
    if (required && (!previous || !matchesTarget(required, previous) || (required.action && previous.action !== required.action))) return;
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

  if (effect.kind === "buff_next_unique_types" && action === effect.trigger_action) {
    addBuff(state, {
      kind: "unique_flat",
      action: effect.action ?? "*",
      target_edibility: effect.target_edibility,
      remaining: effect.count ?? 1,
      seen_types: [],
      value: effect.add ?? 0,
      source: card.name,
    });
    markEffect(entry, card, `${card.name}：多类别蓄势已启动`);
  }

  if (effect.kind === "grant_best_side_next" && action === effect.trigger_action) {
    addBuff(state, { kind: "best_side", action: "*", remaining: 1, source: card.name });
    markEffect(entry, card, `${card.name}：后一张改用较高牌面分`);
  }

  if (effect.kind === "grant_opposite_side_next" && action === effect.trigger_action) {
    addBuff(state, { kind: "opposite_side", action: "*", remaining: 1, source: card.name });
    markEffect(entry, card, `${card.name}：后一张改用另一侧牌面分`);
  }

  if (effect.kind === "wager_next_action" && action === effect.trigger_action) {
    addBuff(state, {
      kind: "wager",
      action: "*",
      remaining: 1,
      multiplier: effect.multiplier ?? 1,
      failure_penalty: effect.failure_penalty ?? 0,
      source: card.name,
    });
    markEffect(entry, card, `${card.name}：后一张赌注已启动`);
  }

  if (effect.kind === "force_next_action_reward" && action === effect.trigger_action) {
    addBuff(state, {
      kind: "choice",
      action: "*",
      remaining: 1,
      good_action: effect.good_action,
      good_bonus: effect.good_bonus,
      bad_action: effect.bad_action,
      bad_penalty: effect.bad_penalty,
      source: card.name,
    });
    markEffect(entry, card, `${card.name}：后一张抉择已启动`);
  }

  if (effect.kind === "store_or_cashout") {
    const permanentCard = state.deck.find((item) => item.uuid === card.uuid);
    if (action === effect.store_action && permanentCard) {
      permanentCard.stored_score = Math.min(effect.max_stored ?? GAME_CONFIG.max_score, (permanentCard.stored_score ?? 0) + (effect.amount ?? 0));
      card.stored_score = permanentCard.stored_score;
      markEffect(entry, card, `${card.name}：储存 ${permanentCard.stored_score}/${effect.max_stored}`);
    }
    if (action === effect.cashout_action && permanentCard) {
      const stored = permanentCard.stored_score ?? 0;
      entry.effect_bonus = safeAdd(entry.effect_bonus, stored);
      permanentCard.stored_score = 0;
      card.stored_score = 0;
      if (stored > 0) {
        entry.effect_log = `${card.name}：储存兑现`;
        markEffect(entry, card, `${card.name}：兑现 +${stored}`);
      }
    }
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

  if (effect.kind === "debuff_until_action" && action === effect.trigger_action) {
    addBuff(state, {
      kind: "until_action",
      action: effect.action ?? "*",
      target_type: effect.target_type,
      target_edibility: effect.target_edibility,
      stop_action: effect.stop_action,
      remaining: 1,
      value: effect.amount ?? 0,
      source: card.name,
    });
    markEffect(entry, card, `${card.name}：持续负面蓄势已启动`);
  }

  if (effect.kind === "clear_debuff" && action === ACTIONS.EAT) {
    state.round.buffs = state.round.buffs.filter((buff) => buff.kind !== "flat" || buff.value >= 0);
    markEffect(entry, card);
  }

  if (effect.kind === "permanent_growth_eat" && action === ACTIONS.EAT) {
    growPermanentCard(state, card, "eat_points", effect.amount ?? 0);
    markEffect(entry, card, `${card.name} 永久成长 +${effect.amount ?? 0}`);
  }

  if (effect.kind === "permanent_growth_condition" && action === effect.trigger_action) {
    const permanentCard = state.deck.find((item) => item.uuid === card.uuid);
    let qualifies = false;
    if (effect.condition === "reshuffled") qualifies = state.round.reshuffle_count > 0;
    if (effect.condition === "position") qualifies = matchesPosition(state, effect.position);
    if (effect.condition === "every_n_uses" && permanentCard) {
      permanentCard.growth_uses = (permanentCard.growth_uses ?? 0) + 1;
      card.growth_uses = permanentCard.growth_uses;
      qualifies = permanentCard.growth_uses % Math.max(1, effect.every ?? 1) === 0;
    }
    if (qualifies) {
      const stat = effect.grow_stat ?? "eat_points";
      const growth = growPermanentCard(state, card, stat, effect.amount ?? 0);
      markEffect(entry, card, `${card.name}：${stat === "eat_points" ? "吃分" : "弃分"}成长 +${growth}`);
    } else if (effect.condition === "every_n_uses") {
      markEffect(entry, card, `${card.name}：成长进度 ${permanentCard?.growth_uses ?? 0}/${effect.every}`);
    }
  }

  if (effect.kind === "gold_economy") {
    if (action === ACTIONS.DISCARD && consumeOncePerRound(state, card, effect)) {
      state.round.pending_gold_bonus = safeAdd(state.round.pending_gold_bonus, effect.discard_add_gold ?? 0);
      markEffect(entry, card, `${card.name}：结算金币 +${effect.discard_add_gold ?? 0}`);
    }
    if (action === ACTIONS.EAT) {
      state.gold = safeAdd(state.gold, effect.eat_destroy_add_gold ?? 0);
      removePermanentCard(state, card.uuid);
      markEffect(entry, card, `${card.name}：金币 +${effect.eat_destroy_add_gold ?? 0}，摧毁自身`);
    }
  }

  if (effect.kind === "shop_discount"
    && action === (effect.trigger_action ?? ACTIONS.DISCARD)
    && consumeOncePerRound(state, card, effect)) {
    state.round.shop_discount = safeAdd(state.round.shop_discount, effect.discount ?? 0);
    markEffect(entry, card, `${card.name}：商店价格 -${effect.discount ?? 0}`);
  }

  if (effect.kind === "buff_remaining_type"
    && action === effect.trigger_action
    && consumeOncePerRound(state, card, effect)) {
    addBuff(state, {
      kind: "flat",
      action: effect.action,
      target_type: effect.target_type,
      value: effect.add ?? 0,
      remaining: GAME_CONFIG.max_actions_per_round,
    });
    markEffect(entry, card, `${card.name}：本轮后续${effect.target_type}吃分 +${effect.add ?? 0}`);
  }

  if (effect.kind === "gold_from_deck_type"
    && action === effect.trigger_action
    && consumeOncePerRound(state, card, effect)) {
    const count = state.deck.filter((owned) => owned.type === effect.target_type).length;
    const gold = Math.min(effect.max_gold ?? GAME_CONFIG.max_score, Math.floor(count / effect.divisor) * (effect.gold ?? 0));
    state.round.pending_gold_bonus = safeAdd(state.round.pending_gold_bonus, gold);
    markEffect(entry, card, `${card.name}：${count} 张${effect.target_type}，结算金币 +${gold}`);
  }

  if (effect.kind === "gold_from_reserve"
    && action === effect.trigger_action
    && consumeOncePerRound(state, card, effect)) {
    const reserve = state.round.reserve_count ?? 0;
    const gold = reserve > 0 ? Math.min(effect.max_gold ?? 1, 1 + Math.floor((reserve - 1) / (effect.step ?? 4))) : 0;
    state.round.pending_gold_bonus = safeAdd(state.round.pending_gold_bonus, gold);
    markEffect(entry, card, reserve > 0 ? `${card.name}：${reserve} 张未登场牌，结算金币 +${gold}` : `${card.name}：没有未登场牌`);
  }

  if (effect.kind === "dynamic_shop_discount"
    && action === effect.trigger_action
    && consumeOncePerRound(state, card, effect)) {
    const processedTypes = new Set([...state.round.actions.map((item) => item.type), card.type]);
    const discount = Math.min(
      effect.max_discount ?? GAME_CONFIG.max_shop_discount ?? GAME_CONFIG.max_score,
      Math.floor(processedTypes.size / Math.max(1, effect.divisor ?? 1)),
    );
    state.round.shop_discount = safeAdd(state.round.shop_discount, discount);
    markEffect(entry, card, `${card.name}：${processedTypes.size} 类，商店价格 -${discount}`);
  }

  if (effect.kind === "scale_by_history" && action === effect.trigger_action) {
    const history = sequenceFor(state, effect.history_action);
    const count = history.filter((item) => {
      const typeMatches = !effect.target_type || item.type === effect.target_type;
      const edibilityMatches = !effect.target_edibility || item.edibility === effect.target_edibility;
      return typeMatches && edibilityMatches;
    }).length;
    entry.effect_bonus = safeAdd(entry.effect_bonus, safeMultiply(count, effect.multiplier ?? 0));
    if (count > 0) {
      entry.effect_log = `${card.name}：历史加成`;
      markEffect(entry, card, `${card.name}：历史加成 +${count * (effect.multiplier ?? 0)}`);
    }
  }

  if (effect.kind === "scale_by_unique_history" && action === effect.trigger_action) {
    const history = sequenceFor(state, effect.history_action);
    const uniqueCards = new Set(history.filter((item) => matchesTarget(effect, item)).map((item) => item.card_id));
    const bonus = Math.min(effect.max_bonus ?? GAME_CONFIG.max_score, uniqueCards.size * (effect.multiplier ?? 0));
    entry.effect_bonus = safeAdd(entry.effect_bonus, bonus);
    if (bonus > 0) {
      entry.effect_log = `${card.name}：不同卡名追溯`;
      markEffect(entry, card, `${card.name}：追溯 ${uniqueCards.size} 种，+${bonus}`);
    }
  }

  if (effect.kind === "scale_by_negative_history" && action === effect.trigger_action) {
    const history = sequenceFor(state, effect.history_action);
    const count = history.filter((item) => item.points < 0).length;
    const bonus = Math.min(effect.max_bonus ?? GAME_CONFIG.max_score, count * (effect.multiplier ?? 0));
    entry.effect_bonus = safeAdd(entry.effect_bonus, bonus);
    if (bonus > 0) {
      entry.effect_log = `${card.name}：负分行动追溯`;
      markEffect(entry, card, `${card.name}：追溯 ${count} 张负分牌，+${bonus}`);
    }
  }

  if (effect.kind === "gold_from_history"
    && action === effect.trigger_action
    && consumeOncePerRound(state, card, effect)) {
    const history = sequenceFor(state, effect.history_action);
    const count = history.filter((item) => matchesTarget(effect, item)).length;
    const gold = Math.min(
      effect.max_gold ?? GAME_CONFIG.max_score,
      Math.floor(count / Math.max(1, effect.divisor ?? 1)) * (effect.gold ?? 0),
    );
    state.round.pending_gold_bonus = safeAdd(state.round.pending_gold_bonus, gold);
    markEffect(entry, card, `${card.name}：追溯 ${count} 张，结算金币 +${gold}`);
  }

  if (effect.kind === "streak_scale" && action === effect.trigger_action) {
    let streak = 0;
    for (let index = state.round.actions.length - 1; index >= 0; index -= 1) {
      const previous = state.round.actions[index];
      if (previous.action !== effect.history_action || !matchesTarget(effect, previous)) break;
      streak += 1;
    }
    const bonus = Math.min(effect.max_bonus ?? GAME_CONFIG.max_score, streak * (effect.multiplier ?? 0));
    entry.effect_bonus = safeAdd(entry.effect_bonus, bonus);
    if (bonus > 0) {
      entry.effect_log = `${card.name}：连续行动追溯`;
      markEffect(entry, card, `${card.name}：连续 ${streak} 张，+${bonus}`);
    }
  }

  if (effect.kind === "retro_multiplier_eaten_tag" && action === (effect.trigger_action ?? ACTIONS.EAT)) {
    const priorScore = state.round.eat_sequence
      .filter((item) => !effect.target_type || item.type === effect.target_type)
      .reduce((sum, item) => sum + item.points, 0);
    entry.effect_bonus = safeAdd(entry.effect_bonus, safeMultiply(priorScore, (effect.multiplier ?? 1) - 1));
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
      && matchesTarget(effect, previous)
      && (!effect.previous_action || previous.action === effect.previous_action)
      && (!effect.previous_negative || previous.points < 0)
      && (!effect.previous_positive || previous.points > 0);
    if (matches) {
      entry.effect_bonus = safeAdd(entry.effect_bonus, effect.bonus ?? 0);
      entry.effect_log = `${card.name}：顺序加成`;
      markEffect(entry, card, `${card.name}：顺序正确 +${effect.bonus ?? 0}`);
    }
  }

  if (effect.kind === "bonus_if_action_streak" && action === effect.trigger_action) {
    let streak = 0;
    for (let index = state.round.actions.length - 1; index >= 0; index -= 1) {
      if (state.round.actions[index].action !== effect.history_action) break;
      streak += 1;
    }
    if (streak >= (effect.count ?? 1)) {
      entry.effect_bonus = safeAdd(entry.effect_bonus, effect.bonus ?? 0);
      entry.effect_log = `${card.name}：行动节奏`;
      markEffect(entry, card, `${card.name}：连续 ${streak} 次${effect.history_action === ACTIONS.EAT ? "吃" : "弃"}，+${effect.bonus ?? 0}`);
    }
  }

  if (effect.kind === "bonus_if_position" && action === effect.trigger_action) {
    const positioned = matchesPosition(state, effect.position);
    if (positioned) {
      entry.effect_bonus = safeAdd(entry.effect_bonus, effect.bonus ?? 0);
      entry.effect_log = `${card.name}：位置加成`;
      markEffect(entry, card, `${card.name}：位置正确 +${effect.bonus ?? 0}`);
    }
  }

  if (effect.kind === "bonus_if_action_number" && action === effect.trigger_action) {
    const actionNumber = state.round.actions.length + 1;
    const positioned = effect.number !== undefined
      ? actionNumber === effect.number
      : effect.parity === "even"
        ? actionNumber % 2 === 0
        : actionNumber % 2 === 1;
    if (positioned) {
      entry.effect_bonus = safeAdd(entry.effect_bonus, effect.bonus ?? 0);
      entry.effect_log = `${card.name}：行动位次`;
      markEffect(entry, card, `${card.name}：第 ${actionNumber} 位 +${effect.bonus ?? 0}`);
    }
  }

  if (effect.kind === "bonus_if_position_previous" && action === effect.trigger_action) {
    const previous = state.round.actions.at(-1);
    if (matchesPosition(state, effect.position) && previous && matchesTarget(effect, previous)) {
      entry.effect_bonus = safeAdd(entry.effect_bonus, effect.bonus ?? 0);
      entry.effect_log = `${card.name}：位置与相邻`;
      markEffect(entry, card, `${card.name}：位置与前位同时满足 +${effect.bonus ?? 0}`);
    }
  }

  if (effect.kind === "position_tradeoff" && action === effect.trigger_action) {
    const positioned = matchesPosition(state, effect.position);
    const adjustment = positioned ? (effect.bonus ?? 0) : (effect.penalty ?? 0);
    entry.effect_bonus = safeAdd(entry.effect_bonus, adjustment);
    entry.effect_log = `${card.name}：位置${positioned ? "奖励" : "惩罚"}`;
    markEffect(entry, card, `${card.name}：位置${positioned ? "正确" : "错误"} ${adjustment >= 0 ? "+" : ""}${adjustment}`);
  }

  if (effect.kind === "bonus_if_next" && action === effect.trigger_action) {
    const next = state.round.draw_pile.at(-2);
    if (next && matchesTarget(effect, next)) {
      entry.effect_bonus = safeAdd(entry.effect_bonus, effect.bonus ?? 0);
      entry.effect_log = `${card.name}：下一张加成`;
      markEffect(entry, card, `${card.name}：下一张位置正确 +${effect.bonus ?? 0}`);
    }
  }

  if (effect.kind === "bonus_if_different_previous" && action === effect.trigger_action) {
    const previous = state.round.actions.at(-1);
    if (previous && previous.type !== card.type) {
      entry.effect_bonus = safeAdd(entry.effect_bonus, effect.bonus ?? 0);
      entry.effect_log = `${card.name}：异类前位`;
      markEffect(entry, card, `${card.name}：前位类别不同 +${effect.bonus ?? 0}`);
    }
  }

  if (effect.kind === "bonus_if_previous_score" && action === effect.trigger_action) {
    const previous = state.round.actions.at(-1);
    if (previous && matchesTarget(effect, previous) && previous.points >= (effect.minimum_score ?? 0)) {
      entry.effect_bonus = safeAdd(entry.effect_bonus, effect.bonus ?? 0);
      entry.effect_log = `${card.name}：前位高分`;
      markEffect(entry, card, `${card.name}：前位 ${previous.points} 分，+${effect.bonus ?? 0}`);
    }
  }

  if (effect.kind === "bonus_from_next_base" && action === effect.trigger_action) {
    const next = state.round.draw_pile.at(-2);
    if (next) {
      const copied = Math.min(effect.max_bonus ?? GAME_CONFIG.max_score, Math.max(0, next.eat_points ?? 0, next.discard_points ?? 0));
      entry.effect_bonus = safeAdd(entry.effect_bonus, copied);
      if (copied > 0) {
        entry.effect_log = `${card.name}：复制后位牌面`;
        markEffect(entry, card, `${card.name}：复制后一张牌面 +${copied}`);
      }
    }
  }

  if (effect.kind === "copy_previous_score" && action === effect.trigger_action) {
    const copiedScore = Math.max(0, state.round.actions.at(-1)?.points ?? 0);
    if (copiedScore > 0) {
      entry.effect_bonus = safeAdd(entry.effect_bonus, copiedScore);
      entry.effect_log = `${card.name}：复制得分`;
      markEffect(entry, card, `${card.name}：复制 +${copiedScore}`);
    }
  }

  if (effect.kind === "copy_previous_score_capped" && action === effect.trigger_action) {
    const previous = state.round.actions.at(-1);
    if (previous && matchesTarget(effect, previous)) {
      const copiedScore = Math.min(effect.max_bonus ?? GAME_CONFIG.max_score, Math.max(0, previous.points ?? 0));
      entry.effect_bonus = safeAdd(entry.effect_bonus, copiedScore);
      if (copiedScore > 0) {
        entry.effect_log = `${card.name}：复制前位得分`;
        markEffect(entry, card, `${card.name}：复制「${previous.name}」+${copiedScore}`);
      }
    }
  }

  if (effect.kind === "bonus_if_generated" && action === effect.trigger_action && card.generated_from === effect.generated_from) {
    entry.effect_bonus = safeAdd(entry.effect_bonus, effect.bonus ?? 0);
    entry.effect_log = `${card.name}：生成来源加成`;
    markEffect(entry, card, `${card.name}：由指定来源生成 +${effect.bonus ?? 0}`);
  }

  if (effect.kind === "discard_all_remaining" && action === effect.trigger_action) {
    state.round.force_discard_remaining = true;
    if (effect.final_multiplier) {
      state.round.final_multipliers.push({ name: card.name, multiplier: effect.final_multiplier });
    }
    markEffect(entry, card);
  }

  if (effect.kind === "bonus_if_neighbors" && action === effect.trigger_action) {
    const previous = state.round.actions.at(-1);
    const next = state.round.draw_pile.at(-2);
    const previousMatches = previous && matchesTarget(effect, previous);
    const nextMatches = next && matchesTarget(effect, next);
    if (previousMatches && nextMatches) {
      entry.effect_bonus = safeAdd(entry.effect_bonus, effect.bonus ?? 0);
      entry.effect_log = `${card.name}：相邻加成`;
      markEffect(entry, card, `${card.name}：前后相邻 +${effect.bonus ?? 0}`);
    }
  }

  if (effect.kind === "bonus_if_exactly_one_neighbor" && action === effect.trigger_action) {
    const previous = state.round.actions.at(-1);
    const next = state.round.draw_pile.at(-2);
    const matches = Number(Boolean(previous && matchesTarget(effect, previous)))
      + Number(Boolean(next && matchesTarget(effect, next)));
    if (matches === 1) {
      entry.effect_bonus = safeAdd(entry.effect_bonus, effect.bonus ?? 0);
      entry.effect_log = `${card.name}：单侧相邻`;
      markEffect(entry, card, `${card.name}：恰好一侧满足 +${effect.bonus ?? 0}`);
    }
  }

  if (effect.kind === "bonus_if_neighbor_pair" && action === effect.trigger_action) {
    const previous = state.round.actions.at(-1);
    const next = state.round.draw_pile.at(-2);
    const ordered = previous?.type === effect.left_type && next?.type === effect.right_type;
    const reversed = effect.unordered && previous?.type === effect.right_type && next?.type === effect.left_type;
    if (ordered || reversed) {
      entry.effect_bonus = safeAdd(entry.effect_bonus, effect.bonus ?? 0);
      entry.effect_log = `${card.name}：异类夹心`;
      markEffect(entry, card, `${card.name}：相邻组合成立 +${effect.bonus ?? 0}`);
    }
  }

  if (effect.kind === "bonus_if_matching_neighbors" && action === effect.trigger_action) {
    const previous = state.round.actions.at(-1);
    const next = state.round.draw_pile.at(-2);
    if (previous && next && previous.type === next.type) {
      entry.effect_bonus = safeAdd(entry.effect_bonus, effect.bonus ?? 0);
      entry.effect_log = `${card.name}：同类夹心`;
      markEffect(entry, card, `${card.name}：前后同类 +${effect.bonus ?? 0}`);
    }
  }

  if (effect.kind === "bonus_if_neighbor_types_different" && action === effect.trigger_action) {
    const previous = state.round.actions.at(-1);
    const next = state.round.draw_pile.at(-2);
    if (previous && next && previous.type !== next.type) {
      entry.effect_bonus = safeAdd(entry.effect_bonus, effect.bonus ?? 0);
      entry.effect_log = `${card.name}：异类夹心`;
      markEffect(entry, card, `${card.name}：前后类别不同 +${effect.bonus ?? 0}`);
    }
  }

  if (effect.kind === "bonus_if_mixed_neighbors" && action === effect.trigger_action) {
    const previous = state.round.actions.at(-1);
    const next = state.round.draw_pile.at(-2);
    const matches = Number(Boolean(previous && matchesTarget(effect, previous)))
      + Number(Boolean(next && matchesTarget(effect, next)));
    if (previous && next && matches === 1) {
      entry.effect_bonus = safeAdd(entry.effect_bonus, effect.bonus ?? 0);
      entry.effect_log = `${card.name}：混合夹心`;
      markEffect(entry, card, `${card.name}：恰好一侧为目标类别 +${effect.bonus ?? 0}`);
    }
  }

  if (effect.kind === "scale_by_deck" && action === effect.trigger_action) {
    const count = state.deck.filter((owned) => matchesTarget(effect, owned)).length;
    const rawBonus = safeMultiply(Math.floor(count / Math.max(1, effect.divisor ?? 1)), effect.multiplier ?? 1);
    const bonus = Math.min(effect.max_bonus ?? GAME_CONFIG.max_score, rawBonus);
    entry.effect_bonus = safeAdd(entry.effect_bonus, bonus);
    if (bonus !== 0) {
      entry.effect_log = `${card.name}：牌组规模加成`;
      markEffect(entry, card, `${card.name}：牌组规模 +${bonus}`);
    }
  }

  if (effect.kind === "bonus_if_type_majority" && action === effect.trigger_action) {
    const count = state.deck.filter((owned) => matchesTarget(effect, owned)).length;
    const required = Math.ceil(state.deck.length * (effect.ratio ?? 0.5));
    if (count >= required) {
      entry.effect_bonus = safeAdd(entry.effect_bonus, effect.bonus ?? 0);
      entry.effect_log = `${card.name}：牌组类别占比`;
      markEffect(entry, card, `${card.name}：${count}/${state.deck.length} 张满足，+${effect.bonus ?? 0}`);
    }
  }

  if (effect.kind === "rabbit_formation" && action === effect.trigger_action) {
    const rabbits = state.deck.filter((item) => item.id === effect.rabbit_id).length;
    const pairs = Math.floor(rabbits / 2);
    const bonus = Math.min(effect.max_bonus ?? GAME_CONFIG.max_score, pairs * (effect.pair_bonus ?? 0));
    entry.effect_bonus = safeAdd(entry.effect_bonus, bonus);
    markEffect(entry, card, `${card.name}：${rabbits} 只兔子组成 ${pairs} 对，+${bonus}`);
  }

  if (effect.kind === "scale_by_unique_deck" && action === effect.trigger_action) {
    const uniqueCards = new Set(state.deck.filter((owned) => matchesTarget(effect, owned)).map((owned) => owned.id));
    const bonus = Math.min(effect.max_bonus ?? GAME_CONFIG.max_score, uniqueCards.size * (effect.multiplier ?? 1));
    entry.effect_bonus = safeAdd(entry.effect_bonus, bonus);
    if (bonus > 0) {
      entry.effect_log = `${card.name}：牌组多样性`;
      markEffect(entry, card, `${card.name}：${uniqueCards.size} 种不同卡名 +${bonus}`);
    }
  }

  if (effect.kind === "scale_by_remaining" && action === effect.trigger_action) {
    const remaining = state.round.draw_pile.slice(0, -1).filter((owned) => matchesTarget(effect, owned)).length;
    const bonus = Math.min(effect.max_bonus ?? GAME_CONFIG.max_score, remaining * (effect.multiplier ?? 1));
    entry.effect_bonus = safeAdd(entry.effect_bonus, bonus);
    if (bonus > 0) {
      entry.effect_log = `${card.name}：未处理牌预判`;
      markEffect(entry, card, `${card.name}：预判 ${remaining} 张，+${bonus}`);
    }
  }

  if (effect.kind === "generate_card" && action === effect.trigger_action) {
    const previous = state.round.actions.at(-1);
    const next = state.round.draw_pile.at(-2);
    const previousMatches = !effect.requires_previous || (
      previous
      && matchesTarget(effect.requires_previous, previous)
      && (!effect.requires_previous.action || previous.action === effect.requires_previous.action)
    );
    const nextMatches = !effect.requires_next || (next && matchesTarget(effect.requires_next, next));
    const positionMatches = !effect.condition_position || matchesPosition(state, effect.condition_position);
    if (previousMatches && nextMatches && positionMatches && consumeOncePerRound(state, card, effect)) {
      const generated = getCardById(effect.card_id);
      let generatedCount = 0;
      while (generated
        && generatedCount < (effect.count ?? 1)
        && state.deck.filter((owned) => owned.id === effect.card_id).length < (effect.max_generated_copies ?? GAME_CONFIG.max_deck_size)
        && state.deck.length < GAME_CONFIG.max_deck_size) {
        createGeneratedCard(state, card, generated, { weakened: effect.generate_weakened });
        generatedCount += 1;
      }
      if (generatedCount > 0 && effect.destroy_self) removePermanentCard(state, card.uuid);
      markEffect(entry, card, generatedCount > 0
        ? `${card.name}：生成${effect.generate_weakened ? "【弱化】" : ""}「${generated?.name}」×${generatedCount}${effect.destroy_self ? "，摧毁自身" : ""}`
        : `${card.name}：生成上限已满`);
    }
  }

  if (effect.kind === "destroy_previous_generate" && action === effect.trigger_action && state.deck.length > 1) {
    const previous = state.round.actions.at(-1);
    if (previous && previous.card_uuid !== card.uuid && matchesTarget(effect, previous)) {
      const removed = removePermanentCard(state, previous.card_uuid);
      const generated = getCardById(effect.card_id);
      let generatedCount = 0;
      while (removed && generated && generatedCount < (effect.count ?? 1) && state.deck.length < GAME_CONFIG.max_deck_size) {
        state.round.generated_count = (state.round.generated_count ?? 0) + 1;
        state.deck.push({
          ...generated,
          synergy_tags: [...generated.synergy_tags],
          effect: generated.effect ? { ...generated.effect, keywords: [...(generated.effect.keywords ?? [])] } : null,
          generated_from: card.id,
          uuid: `${generated.id}-converted-${card.uuid}-${state.current_round}-${state.round.generated_count}`,
        });
        generatedCount += 1;
      }
      if (removed) markEffect(entry, card, `${card.name} 摧毁「${removed.name}」，生成「${generated?.name ?? "未知卡"}」×${generatedCount}`);
    }
  }

  if (effect.kind === "destroy_self_buff" && action === effect.trigger_action) {
    addBuff(state, {
      kind: effect.modifier === "flat" ? "flat" : "multiplier",
      action: effect.action ?? "*",
      target_type: effect.target_type,
      target_edibility: effect.target_edibility,
      remaining: effect.count ?? 1,
      value: effect.modifier === "flat" ? effect.add : effect.multiplier,
      source: card.name,
    });
    const removed = state.deck.length > 1 ? removePermanentCard(state, card.uuid) : null;
    markEffect(entry, card, removed
      ? `${card.name}：摧毁自身，蓄势已启动`
      : `${card.name}：最后一张牌不会摧毁，蓄势已启动`);
  }

  if (effect.kind === "destroy_previous_for_gold" && action === effect.trigger_action && state.deck.length > 1) {
    const previous = state.round.actions.at(-1);
    if (previous && previous.card_uuid !== card.uuid && matchesTarget(effect, previous)) {
      const removed = removePermanentCard(state, previous.card_uuid);
      if (removed) {
        const gold = effect.rarity_gold?.[removed.rarity] ?? 0;
        state.round.pending_gold_bonus = safeAdd(state.round.pending_gold_bonus, gold);
        markEffect(entry, card, `${card.name} 摧毁「${removed.name}」，结算金币 +${gold}`);
      }
    }
  }

  if (effect.kind === "destroy_previous_discount" && action === effect.trigger_action && state.deck.length > 1) {
    const previous = state.round.actions.at(-1);
    if (previous && previous.card_uuid !== card.uuid && matchesTarget(effect, previous)) {
      const removed = removePermanentCard(state, previous.card_uuid);
      if (removed) {
        const discount = effect.rarity_discount?.[removed.rarity] ?? 0;
        state.round.shop_discount = safeAdd(state.round.shop_discount, discount);
        markEffect(entry, card, `${card.name} 摧毁「${removed.name}」，商店价格 -${discount}`);
      }
    }
  }

  if (effect.kind === "consume_previous_card" && action === effect.trigger_action && state.deck.length > 1) {
    const previous = state.round.actions.at(-1);
    if (previous && matchesTarget(effect, previous) && previous.card_uuid !== card.uuid) {
      const removed = removePermanentCard(state, previous.card_uuid);
      if (removed) {
        const preyValue = Math.max(Math.abs(removed.eat_points ?? 0), Math.abs(removed.discard_points ?? 0));
        const itemGrowth = state.items
          .filter((item) => item.effect?.kind === "devour_growth_bonus")
          .reduce((sum, item) => safeAdd(sum, item.effect.amount ?? 0), 0);
        const growth = safeAdd(Math.max(1, Math.min(effect.max_growth ?? 4, preyValue)), itemGrowth);
        const stat = effect.grow_stat === "eat_points" ? "eat_points" : "discard_points";
        growPermanentCard(state, card, stat, growth);
        markEffect(entry, card, `${card.name} 摧毁「${removed.name}」，${stat === "eat_points" ? "吃分" : "弃分"}成长 +${growth}`);
      }
    }
  }

  if (effect.kind === "gain_gold"
    && action === effect.trigger_action
    && consumeOncePerRound(state, card, effect)) {
    state.round.pending_gold_bonus = safeAdd(state.round.pending_gold_bonus, effect.gold ?? 0);
    markEffect(entry, card, `${card.name}：结算金币 +${effect.gold ?? 0}`);
  }

  if (effect.kind === "consume_next_card" && action === effect.trigger_action && state.deck.length > 1) {
    const prey = state.round.draw_pile.at(-2);
    if (prey && prey.uuid !== card.uuid && matchesTarget(effect, prey)) {
      const removed = removePermanentCard(state, prey.uuid);
      if (removed) {
        const rarityGrowth = { "普通": 1, "罕见": 2, "稀有": 3, "传奇": 5, "诅咒": 0 };
        const preyValue = effect.growth_source === "rarity"
          ? rarityGrowth[removed.rarity] ?? 1
          : effect.growth_source === "eat_points"
            ? Math.abs(removed.eat_points ?? 0)
            : Math.max(Math.abs(removed.eat_points ?? 0), Math.abs(removed.discard_points ?? 0));
        const growth = Math.max(1, Math.min(effect.max_growth ?? 6, preyValue));
        const stat = effect.grow_stat ?? "discard_points";
        growPermanentCard(state, card, stat, growth);
        state.round.consume_next_uuid = prey.uuid;
        markEffect(entry, card, `${card.name} 摧毁「${prey.name}」，${stat === "eat_points" ? "吃分" : "弃分"}成长 +${growth}`);
      }
    }
  }

  if (effect.kind === "destroy_next_for_gold" && action === effect.trigger_action && state.deck.length > 1) {
    const prey = state.round.draw_pile.at(-2);
    if (prey && prey.uuid !== card.uuid) {
      const removed = removePermanentCard(state, prey.uuid);
      if (removed) {
        const gold = effect.rarity_gold?.[removed.rarity] ?? 0;
        state.round.pending_gold_bonus = safeAdd(state.round.pending_gold_bonus, gold);
        state.round.consume_next_uuid = prey.uuid;
        markEffect(entry, card, `${card.name} 摧毁「${removed.name}」，结算金币 +${gold}`);
      }
    }
  }

  if (effect.kind === "shop_free_reroll_destroy" && action === effect.trigger_action) {
    state.round.shop_free_rerolls = safeAdd(state.round.shop_free_rerolls, effect.count ?? 1);
    removePermanentCard(state, card.uuid);
    markEffect(entry, card, `${card.name}：免费刷新 +${effect.count ?? 1}，摧毁自身`);
  }

  if (effect.kind === "gold_on_discard_count" && action === effect.trigger_action) {
    const discardCount = state.round.discard_sequence.length + 1;
    const key = `card:${card.uuid}:${effect.kind}`;
    if (!state.round.effect_trigger_counts[key]) {
      const triggers = Math.min(effect.max_triggers, Math.floor(discardCount / effect.count));
      const gold = safeMultiply(triggers, effect.gold ?? 0);
      state.round.effect_trigger_counts[key] = 1;
      state.round.pending_gold_bonus = safeAdd(state.round.pending_gold_bonus, gold);
      if (gold > 0) markEffect(entry, card, `${card.name}：回收 ${discardCount} 张，金币 +${gold}`);
    }
  }

  if (effect.kind === "gain_reshuffle_charge_destroy" && action === effect.trigger_action) {
    const effectiveDeckSize = state.deck.some((owned) => owned.uuid === card.uuid)
      ? state.deck.length - 1
      : state.deck.length;
    if (effectiveDeckSize <= effect.max_deck_size) {
      state.round.reshuffle_charges = safeAdd(state.round.reshuffle_charges, effect.count ?? 1);
      removePermanentCard(state, card.uuid);
      markEffect(entry, card, `${card.name}：重洗 +${effect.count ?? 1}，摧毁自身`);
    } else {
      markEffect(entry, card, `${card.name}：摧毁后牌组仍超过 ${effect.max_deck_size} 张，未启动`);
    }
  }

  if (effect.kind === "gain_reshuffle_charge" && action === effect.trigger_action) {
    if (state.deck.length <= effect.max_deck_size && consumeOncePerRound(state, card, effect)) {
      state.round.reshuffle_charges = safeAdd(state.round.reshuffle_charges, effect.count ?? 1);
      markEffect(entry, card, `${card.name}：重洗 +${effect.count ?? 1}，本轮可叠加`);
    } else if (state.deck.length > effect.max_deck_size) {
      markEffect(entry, card, `${card.name}：牌组超过 ${effect.max_deck_size} 张，未启动`);
    }
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
    case "round_card_score": return actions.reduce((sum, item) => safeAdd(sum, item.points), 0) >= rule.score;
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
    case "min_reshuffles": return state.round.reshuffle_count >= rule.count;
    case "post_reshuffle_actions": return actions.filter((item) => item.reshuffle_index > 0).length >= rule.count;
    case "post_reshuffle_score": return actions
      .filter((item) => item.reshuffle_index > 0)
      .reduce((sum, item) => safeAdd(sum, item.points), 0) >= rule.score;
    case "repeat_card_actions": {
      const counts = actions.reduce((result, item) => {
        result[item.card_uuid] = (result[item.card_uuid] ?? 0) + 1;
        return result;
      }, {});
      return Math.max(0, ...Object.values(counts)) >= rule.count;
    }
    case "discard_ratio": return discard.length >= Math.max(rule.minimum ?? 0, eat.length * rule.ratio);
    case "no_eat": return eat.length === 0 && discard.length > 0;
    case "max_eat": return eat.length <= rule.count;
    case "min_discard_food": return discard.filter((item) => item.edibility === "edible").length >= rule.count;
    case "min_wrong_edibility": return (state.round.wrong_edibility_count ?? 0) >= rule.count;
    case "last_action": return matchesTarget(rule, actions.at(-1) ?? {}) && actions.at(-1)?.action === rule.action;
    case "first_last_actions": return actions.length >= 2
      && actions[0].action === rule.first_action
      && actions.at(-1).action === rule.last_action;
    case "perfect_sort": return actions.length > 0 && actions.every((item) => (
      (item.edibility === "edible" && item.action === ACTIONS.EAT)
      || (item.edibility === "inedible" && item.action === ACTIONS.DISCARD)
    ));
    case "min_destroyed": return state.round.destroyed_count >= rule.count;
    case "min_generated": return state.round.generated_count >= rule.count;
    case "min_grown": return state.round.grown_count >= rule.count;
    case "min_fruit_combo": return (state.round.best_fruit_combo ?? 0) >= rule.count;
    case "min_postpone": return (state.round.postpone_count ?? 0) >= rule.count;
    case "min_unique_action_types": return new Set(actions.map((item) => item.type)).size >= rule.count;
    case "no_consecutive_type": return actions.length >= 2
      && actions.every((item, index) => index === 0 || item.type !== actions[index - 1].type);
    case "exact_unique_action_types": return new Set(actions.map((item) => item.type)).size === rule.count;
    case "min_keyword_actions": return actions.filter((item) => item.keywords?.includes(rule.keyword)).length >= rule.count;
    case "first_action_negative": return (actions[0]?.points ?? 0) < 0;
    case "last_action_positive": return (actions.at(-1)?.points ?? 0) > 0;
    default: return false;
  }
}

export function createRoundEngine(options = {}) {
  const random = options.random ?? Math.random;

  function recordAction(state, action, card) {
    if (action !== ACTIONS.EAT && action !== ACTIONS.DISCARD) {
      throw new Error(`Unknown card action: ${action}`);
    }

    if (action !== ACTIONS.EAT || card.type !== "水果") state.round.fruit_combo = 0;
    const immediateEffect = prepareImmediateEffect(state, action, card);
    if (card.effect?.kind === "clear_debuff" && action === ACTIONS.EAT) {
      state.round.buffs = state.round.buffs.filter((buff) => buff.kind !== "flat" || buff.value >= 0);
    }

    const ruleBonus = getRuleFlatBonus(state, action, card);
    const buffs = consumeActionBuffs(state, action, card);
    const actionPrintedPoints = action === ACTIONS.EAT ? card.eat_points ?? 0 : card.discard_points ?? 0;
    let printedPoints = buffs.use_opposite_side
      ? (action === ACTIONS.EAT ? card.discard_points ?? 0 : card.eat_points ?? 0)
      : actionPrintedPoints;
    if (buffs.use_best_side) printedPoints = Math.max(card.eat_points ?? 0, card.discard_points ?? 0);
    const itemEffects = resolveItemActionEffects(state, action, card);
    const questModifier = [
      state.round.quest_flat_modifier ?? 0,
      state.round.quest_action_modifiers?.[action] ?? 0,
      state.round.actions.length === 0 ? state.round.quest_first_action_modifier ?? 0 : 0,
      state.round.draw_pile.length === 1 ? state.round.quest_last_action_modifier ?? 0 : 0,
    ].reduce((sum, value) => safeAdd(sum, value), 0);
    const entry = {
      card_id: card.id,
      card_uuid: card.uuid,
      name: card.name,
      type: card.type,
      edibility: card.edibility,
      rarity: card.rarity,
      keywords: [...new Set([...(card.effect?.keywords ?? []), ...(card.status_keywords ?? [])])],
      action,
      printed_points: printedPoints,
      rule_bonus: ruleBonus,
      buff_flat_bonus: buffs.flat_bonus,
      buff_multiplier: buffs.multiplier,
      item_bonus: itemEffects.flat_bonus,
      quest_modifier: questModifier,
      effect_bonus: immediateEffect.bonus,
      reshuffle_index: state.round.reshuffle_count,
      effect_log: null,
      effect_triggered: immediateEffect.detail,
      points: 0,
    };
    entry.wrong_edibility = isWrongEdibilityAction(action, card);
    if (entry.wrong_edibility) {
      state.round.wrong_edibility_count = safeAdd(state.round.wrong_edibility_count ?? 0, 1);
      state.round.wrong_edibility_streak = safeAdd(state.round.wrong_edibility_streak ?? 0, 1);
    } else {
      state.round.wrong_edibility_streak = 0;
    }
    entry.wrong_edibility_streak = state.round.wrong_edibility_streak;
    if (immediateEffect.bonus !== 0) entry.effect_log = `${card.name}：净化转化`;

    // Effects are applied after consuming existing buffs, so newly created buffs affect future cards only.
    applyCardEffect(state, action, card, entry, random);
    if (card.weakened && state.deck.some((owned) => owned.uuid === card.uuid)) {
      const removed = state.deck.length > 1 ? removePermanentCard(state, card.uuid) : null;
      if (removed) {
        entry.destroyed_self = true;
        entry.effect_triggered = entry.effect_triggered
          ? `${entry.effect_triggered} · 【弱化】结算后摧毁自身`
          : `${card.name}：【弱化】结算后摧毁自身`;
      }
    }
    const flatValue = [printedPoints, ruleBonus, buffs.flat_bonus, itemEffects.flat_bonus, entry.quest_modifier]
      .reduce((sum, value) => safeAdd(sum, value), 0);
    entry.points = safeAdd(safeMultiply(flatValue, buffs.multiplier), entry.effect_bonus);
    if (itemEffects.messages.length > 0) {
      const itemMessage = itemEffects.messages.join(" · ");
      entry.effect_triggered = entry.effect_triggered ? `${entry.effect_triggered} · ${itemMessage}` : itemMessage;
    }

    state.round.actions.push(entry);
    sequenceFor(state, action).push(entry);
    return entry;
  }

  function getRuleResults(state) {
    return state.active_rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      selected_round: rule.selected_round ?? state.current_round,
      achieved: evaluateRule(state, rule),
      gold_reward: rule.gold_reward ?? 0,
    }));
  }

  function finalizeRound(state) {
    const cardScore = state.round.actions.reduce((sum, item) => safeAdd(sum, item.points), 0);
    const ruleResults = getRuleResults(state);
    const multipliers = [
      ...state.round.final_multipliers,
      ...getItemFinalMultipliers(state),
      ...(state.permanent_multipliers ?? []).map((reward) => ({ name: reward.name, multiplier: reward.multiplier, source: "quest" })),
    ];
    const totalMultiplier = multipliers.reduce((value, item) => safeProduct(value, item.multiplier), 1);
    const roundScore = safeMultiply(cardScore, totalMultiplier);

    const breakdown = [{ label: "牌面与效果", text: `${formatScore(cardScore)} 分` }];
    const byType = state.round.actions.reduce((result, item) => {
      result[item.type] = safeAdd(result[item.type] ?? 0, item.points);
      return result;
    }, {});
    Object.entries(byType)
      .sort(([, a], [, b]) => b - a)
      .forEach(([type, score]) => breakdown.push({ label: `↳ ${type}`, text: `${formatScore(score)} 分`, kind: "detail" }));

    state.round.actions
      .filter((item) => item.effect_bonus !== 0 && item.effect_log)
      .forEach((item) => breakdown.push({ label: item.effect_log, text: `${item.effect_bonus > 0 ? "+" : ""}${formatScore(item.effect_bonus)}`, kind: "bonus" }));

    if (multipliers.length > 0) {
      multipliers.forEach((item) => {
        const sourceLabel = item.source === "item"
          ? "道具"
          : item.source === "quest"
            ? "任务"
            : "规则";
        breakdown.push({ label: `${sourceLabel} · ${item.name}`, text: `×${item.multiplier}`, kind: "rule" });
      });
    }

    const contractGold = ruleResults
      .filter((result) => result.achieved)
      .reduce((sum, result) => safeAdd(sum, result.gold_reward), 0);
    const speedGold = (state.round.elapsed_ms <= 12000 ? 1 : 0) + (state.round.elapsed_ms <= 8000 ? 1 : 0);
    state.round.contract_gold_reward = contractGold;
    state.round.speed_gold_reward = speedGold;
    state.round.pending_gold_bonus = safeAdd(safeAdd(state.round.pending_gold_bonus, contractGold), speedGold);
    ruleResults.forEach((result) => breakdown.push({
      label: `持续合约 · ${result.name}`,
      text: result.achieved ? `完成并移除 · +${result.gold_reward} 金币` : "未完成 · 下轮继续",
      kind: result.achieved ? "bonus" : "detail",
    }));
    breakdown.push({
      label: "限时经济",
      text: speedGold > 0 ? `${state.round.elapsed_ms <= 8000 ? "8 秒内" : "12 秒内"} · +${speedGold} 金币` : "超过 12 秒 · +0",
      kind: speedGold > 0 ? "bonus" : "detail",
    });
    breakdown.push({ label: "本轮得分", text: `${roundScore >= 0 ? "+" : ""}${formatScore(roundScore)}`, kind: "total" });

    state.total_score = safeAdd(state.total_score, roundScore);
    state.gold = safeAdd(state.gold, state.round.pending_gold_bonus);
    state.round.pending_gold_bonus = 0;

    const completedRuleIds = new Set(ruleResults.filter((result) => result.achieved).map((result) => result.id));
    if (completedRuleIds.size > 0) {
      state.active_rules = state.active_rules.filter((rule) => !completedRuleIds.has(rule.id));
      for (const history of state.rule_history) {
        if (completedRuleIds.has(history.id) && !history.completed_round) {
          history.completed = true;
          history.completed_round = state.current_round;
        }
      }
    }

    return {
      card_score: cardScore,
      total_multiplier: totalMultiplier,
      round_score: roundScore,
      rule_results: ruleResults,
      completed_rule_ids: [...completedRuleIds],
      breakdown,
    };
  }

  function levelProgressCheck(state) {
    const target = GAME_CONFIG.milestone_targets[state.current_round] ?? 0;
    return { passed: target === 0 || state.total_score >= target, target };
  }

  function getGoldReward(state) {
    return new Set(state.round.eat_sequence.map((entry) => entry.card_uuid)).size;
  }

  return {
    recordAction,
    finalizeRound,
    getGoldReward,
    levelProgressCheck,
    getNextTargetInfo: getNextMilestone,
  };
}
