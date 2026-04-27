function ensureArray(value) { return Array.isArray(value) ? value : []; }

export function createRoundEngine() {
  function applyEffect(state, action, card, entry) {
    const effect = card.effect;
    if (!effect) return;

    // 榨汁机：给接下来的同类型牌上 Buff
    if (effect.kind === "buff_next_tag" && action === "discard") {
      state.turnBuffs.push({ type: "mult", tag: effect.tag, remaining: effect.count, value: effect.mult });
    }

    // 金苹果：永久成长
    if (effect.kind === "permanent_growth_eat" && action === "eat") {
      // 在永久牌库中寻找这张卡并加分
      const targetCard = state.deck.find((item) => item.uuid === card.uuid);
      if (targetCard) targetCard.eat_points = (targetCard.eat_points || 0) + (effect.amount || 0);
    }

    // 汉堡：上油腻 Debuff
    if (effect.kind === "debuff_next_action" && action === "eat") {
      state.turnBuffs.push({ type: "flat", tag: "*", remaining: effect.count, value: effect.amount });
    }

    // 冰可乐：清空 Debuff 并加 Buff
    if (effect.kind === "clear_debuff_and_buff_next_tag" && action === "eat") {
      state.turnBuffs = state.turnBuffs.filter(b => b.type !== "flat" || b.value > 0); // 清除负面
      state.turnBuffs.push({ type: "flat", tag: effect.tag, remaining: effect.count, value: effect.add });
    }

    // 储钱罐：局外经济与永久销毁
    if (effect.kind === "gold_economy") {
      if (action === "discard") state.pendingGoldBonus += effect.discard_add_gold;
      if (action === "eat") {
        state.gold += effect.eat_destroy_add_gold;
        // 彻底从永久卡组中删除
        const targetIndex = state.deck.findIndex(c => c.uuid === card.uuid);
        if (targetIndex > -1) state.deck.splice(targetIndex, 1);
      }
    }

    // 优惠券：商店打折
    if (effect.kind === "shop_discount" && action === "discard") {
      state.shopDiscount = (state.shopDiscount || 0) + effect.discount;
    }

    // 猴子/狗/堆肥箱：根据历史记录加分 (支持 "*" 任意类型)
    if (effect.kind === "scale_by_history" && action === effect.action) {
      const historyArr = effect.action === "eat" ? state.eatHistory : state.discardHistory;
      // 如果 tag 是 "*"，则统计所有历史牌，否则只统计对应标签
      const count = effect.tag === "*" ? historyArr.length : historyArr.filter(item => item.type === effect.tag).length;
      entry.extraBonus = count * effect.mult;
    }

    // 【新增】发馊的外卖：回溯翻倍历史分数
    if (effect.kind === "retro_multiplier_eaten_tag" && action === "eat") {
      // 1. 筛选出本轮已经吃过的所有同类型牌
      const relevantHistory = state.eatHistory.filter(item => item.type === effect.tag);
      // 2. 计算它们的原始得分总和
      const sumOfTag = relevantHistory.reduce((sum, item) => sum + (item.points || 0), 0);
      // 3. 计算翻倍奖励（乘以倍率-1，因为它们本身的分数已经加过了）
      const bonus = sumOfTag * (effect.mult - 1);
      
      if (bonus > 0) {
        entry.extraBonus = (entry.extraBonus || 0) + bonus;
        // 在账单里明确写出来源
        entry.log = `↳ ${card.name}效果`; 
      }
    }

    // 陨石/黑洞：触发全弃标识，并支持全局临时倍率
    if (effect.kind === "discard_all_remaining" && action === "discard") {
      state.forceDiscardRemaining = true;
      if (effect.applyGlobalMult) {
        state.turnBuffs.push({ type: "global_mult", value: effect.applyGlobalMult, remaining: 1 });
      }
    }
  }

  function consumeTurnBuffs(state, card, action) {
    let multiplier = 1;
    let flatAdd = 0;
    for (const buff of state.turnBuffs) {
      if (buff.remaining > 0 && (buff.tag === "*" || buff.tag === card.type)) {
        if (buff.type === "mult" && action === "eat") multiplier *= buff.value;
        if (buff.type === "flat") flatAdd += buff.value;
        buff.remaining -= 1;
      }
    }
    state.turnBuffs = state.turnBuffs.filter((b) => b.remaining > 0);
    return { multiplier, flatAdd };
  }

  function recordAction(state, action, card) {
    const entry = { ...card, action, extraBonus: 0, points: 0 };
    const buffs = consumeTurnBuffs(state, card, action);

    let basePoints = action === "eat" ? (card.eat_points || 0) : (card.discard_points || 0);

    // 处理全局基础加分规则 (如：所有水果+1)
    ensureArray(state.active_rules).forEach(rule => {
      if (rule.scope === "flat_bonus" && rule.targetType === card.type && action === "eat") {
        basePoints += rule.bonus;
      }
    });

    // 触发猴子/狗等卡牌自身效果
    applyEffect(state, action, card, entry);

    // 计算这单张牌的最终分：(基础分 + 规则加分 + Debuff影响) * 临时倍率 + 额外历史加成
    entry.points = Math.round((basePoints + buffs.flatAdd) * buffs.multiplier) + entry.extraBonus;

    if (action === "eat") state.eatHistory.push(entry);
    else if (action === "discard") state.discardHistory.push(entry);

    state.roundHistory.push(entry);
    return entry;
  }

  // 【新增核心功能】：统一检查所有已选中的倍率规则
  function checkRuleMultipliers(state) {
    let totalMult = 1;
    const logs =[];

    // 先检查卡牌自带的临时全局倍率 (如黑洞)
    state.turnBuffs.forEach(buff => {
      if (buff.type === "global_mult" && buff.remaining > 0) {
        totalMult *= buff.value;
        logs.push({ name: "黑洞弃牌", mult: buff.value });
        buff.remaining -= 1;
      }
    });

    ensureArray(state.active_rules).forEach(rule => {
      let achieved = false;

      // 连击类
      if (rule.scope === "sequence_eat") {
        let currentStreak = 0;
        for (const item of state.eatHistory) {
          if (item.type === rule.targetType) {
            currentStreak++;
            if (currentStreak >= rule.count) achieved = true;
          } else currentStreak = 0;
        }
      } 
      // 时限类
      else if (rule.scope === "time_limit") {
        achieved = (state.roundElapsedMs > 0 && state.roundElapsedMs <= rule.timeLimitMs);
      } 
      // 禁忌类
      else if (rule.scope === "no_eat_type") {
        achieved = !state.eatHistory.some(item => item.type === rule.targetType);
      } 
      // 最小数量类
      else if (rule.scope === "min_discard") {
        achieved = state.discardHistory.length >= rule.count;
      }
      // 【新增】精准数量类
      else if (rule.scope === "exact_eat_count") {
        achieved = state.eatHistory.length === rule.count;
      }
      // 【新增】均分类
      else if (rule.scope === "equal_eat_discard") {
        achieved = (state.eatHistory.length > 0 && state.eatHistory.length === state.discardHistory.length);
      }
      // 【新增】卡组规模类
      else if (rule.scope === "max_deck_size") {
        achieved = state.deck.length <= rule.count;
      }

      if (achieved && rule.multiplier) {
        totalMult *= rule.multiplier;
        logs.push({ name: rule.name, mult: rule.multiplier });
      }
    });

    return { multiplier: totalMult, logs: logs };
  }

  function finalizeRound(state) {
    const baseScore = state.roundHistory.reduce((sum, item) => sum + item.points, 0);
    const rulesResult = checkRuleMultipliers(state);
    
    // 【注意】这里要把牌面效果产生的 extraBonus 也加进来
    const extraBonuses = state.roundHistory.reduce((sum, item) => sum + (item.extraBonus || 0), 0);
    const totalBase = baseScore + extraBonuses;

    const roundScore = Math.round(totalBase * rulesResult.multiplier);
    
    // 【升级版账单流水】
    const breakdown =[];
    breakdown.push({ label: "🧮 牌面基础总计", text: `${baseScore} 分` });

    const typeScores = {};
    state.roundHistory.forEach(item => {
      if (!typeScores[item.type]) typeScores[item.type] = 0;
      typeScores[item.type] += item.points;
    });
    const sortedTypes = Object.keys(typeScores).sort((a,b) => typeScores[b] - typeScores[a]);
    sortedTypes.forEach(type => {
      if (typeScores[type] !== 0) {
        breakdown.push({ label: `↳ ${type}卡牌提供`, text: `${typeScores[type]} 分`, isSubItem: true });
      }
    });

    // 单独把“发馊的外卖”这种大额奖励列出来
    state.roundHistory.forEach(item => {
      if (item.extraBonus > 0 && item.log) {
        breakdown.push({ label: item.log, text: `+${item.extraBonus} 分`, isBonus: true });
      }
    });

    if (rulesResult.logs.length > 0) {
      rulesResult.logs.forEach(log => breakdown.push({ label: `✨ 规则: ${log.name}`, text: `x${log.mult}` }));
    } else {
      breakdown.push({ label: `✨ 规则附加倍率`, text: `x1` });
    }

    breakdown.push({ label: "本轮最终得分", text: `+${roundScore}`, isTotal: true });

    state.total_score += roundScore;
    state.gold += (state.pendingGoldBonus || 0);
    state.pendingGoldBonus = 0;

    return { roundScore, breakdown };
  }


  function resetRoundHistory(state) {
    state.eatHistory = []; state.discardHistory = []; state.roundHistory = [];
    state.turnBuffs = []; state.forceDiscardRemaining = false; state.shopDiscount = 0;
    state.roundTimerStartedAt = null; state.roundElapsedMs = 0;
  }

  // 获取下一个目标信息的辅助函数
  function getNextTargetInfo(currentRound) {
    if (currentRound <= 5) return { round: 5, target: 100 };
    if (currentRound <= 10) return { round: 10, target: 500 };
    if (currentRound <= 15) return { round: 15, target: 1000 };
    return { round: '-', target: '-' };
  }

  function levelProgressCheck(state) {
    const thresholds = { 5: 100, 10: 500, 15: 1000 }; // 门槛更新为 100/500/1000
    const target = thresholds[state.current_round];
    return { passed: !target || state.total_score >= target, target: target || 0 };
  }

  return { recordAction, finalizeRound, resetRoundHistory, levelProgressCheck, getNextTargetInfo };
}