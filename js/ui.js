const fmt = (val) => val > 0 ? `+${val}` : val;

// 主界面卡牌
function createCardElement(card, isActive = false) {
  const el = document.createElement("article");
  el.className = `card${isActive ? " is-active" : ""}`;
  el.dataset.cardId = card.id;
  el.innerHTML = `
    <div class="card-ambient"></div>
    <div class="card-topline">
      <span class="card-badge">${card.type}</span>
      <span class="card-badge">${card.id.toUpperCase()}</span>
    </div>
    <div><div class="card-name">${card.name}</div></div>
    <div class="card-meta">
      <span>进食 ${fmt(card.eat_points)}</span>
      <span>丢弃 ${fmt(card.discard_points)}</span>
    </div>
    <div class="card-stamp">${card.effect ? card.effect.description : "基础牌"}</div>
  `;
  return el;
}

// 商店售卖区卡牌 (展示详情和价格)
function createShopCardElement(card, onBuy) {
  const button = document.createElement("button");
  button.className = "shop-card";
  button.type = "button";
  const effectText = card.effect ? card.effect.description : "基础牌/无特殊效果";
  button.innerHTML = `
    <div class="shop-card-name">${card.name} <span style="font-size:12px;color:var(--muted);">${card.type}</span></div>
    <div class="shop-card-meta">吃 ${fmt(card.eat_points)} / 弃 ${fmt(card.discard_points)}</div>
    <div style="font-size:12px; margin-top:8px; color:#a78bfa; line-height:1.4;">✨ ${effectText}</div>
    <div class="shop-card-price" style="margin-top:8px; font-weight:bold; color:var(--color-gold);">🪙 购买价格: ${card.shopPrice}</div>
  `;
  button.addEventListener("click", () => onBuy(card));
  return button;
}

// 玩家卡组展示区卡牌 (展示详情和删除)
function createDeckCardElement(card, onRemove) {
  const button = document.createElement("button");
  button.className = "shop-card";
  button.type = "button";
  const effectText = card.effect ? card.effect.description : "基础牌/无特殊效果";
  button.innerHTML = `
    <div class="shop-card-name">${card.name} <span style="font-size:12px;color:var(--muted);">${card.type}</span></div>
    <div class="shop-card-meta">吃 ${fmt(card.eat_points)} / 弃 ${fmt(card.discard_points)}</div>
    <div style="font-size:12px; margin-top:8px; color:#a78bfa; line-height:1.4;">✨ ${effectText}</div>
    <div style="color: #f87171; font-weight: bold; margin-top: 8px;">🗑️ 点击精简删除</div>
  `;
  // 必须绑定 card.uuid
  button.addEventListener("click", () => onRemove(card.uuid));
  return button;
}

function createRuleDraftElement(rule, onChoose) {
  const button = document.createElement("button");
  button.className = "rule-draft-card";
  button.type = "button";
  button.innerHTML = `
    <div class="rule-draft-name">${rule.name}</div>
    <div class="rule-draft-desc">${rule.description}</div>
    <div class="rule-draft-meta">倍率 x${rule.multiplier}</div>
  `;
  button.addEventListener("click", () => onChoose(rule));
  return button;
}

export function createUI(root) {
  const stack = root.querySelector("#cardStack");
  const roundValue = root.querySelector("#roundValue");
  const scoreValue = root.querySelector("#scoreValue");
  const goldValue = root.querySelector("#goldValue");
  const remainingValue = root.querySelector("#remainingValue");
  const eatHint = root.querySelector("#eatHint");
  const discardHint = root.querySelector("#discardHint");
  const summary = root.querySelector("#roundSummary");
  const summaryBase = root.querySelector("#summaryBaseScore");
  const summaryCombo = root.querySelector("#summaryComboBonus");
  const summaryTotal = root.querySelector("#summaryRoundScore");
  const summaryTime = root.querySelector("#summaryTimeBonus");
  const ruleDraft = root.querySelector("#ruleDraft");
  const ruleDraftList = root.querySelector("#ruleDraftList");
  const ruleDraftTitle = root.querySelector("#ruleDraftTitle");
  const ruleDraftTip = root.querySelector("#ruleDraftTip");
  const shop = root.querySelector("#shopPanel");
  const shopList = root.querySelector("#shopList");
  const shopGold = root.querySelector("#shopGold");
  const shopDeleteCost = root.querySelector("#shopDeleteCost");
  const shopRemoveCount = root.querySelector("#shopRemoveCount");

  const timerMap = new WeakMap();

  function setHintVisible(node, visible) {
    if (!node) return;
    node.classList.toggle("show", visible);
  }

  return {
    renderHud(state, remaining, engineInfo) {
      if (roundValue && engineInfo) {
        const nextTarget = engineInfo.getNextTargetInfo(state.current_round);
        roundValue.innerHTML = `${state.current_round} / 15 <span style="font-size:12px; color:var(--muted); display:block;">(目标: ${nextTarget.target}分)</span>`;
      }
      if (scoreValue) scoreValue.textContent = String(state.total_score);
      if (goldValue) goldValue.textContent = String(state.gold);
      if (remainingValue) remainingValue.textContent = String(remaining);
      if (shopGold) shopGold.textContent = String(state.gold);
      if (shopDeleteCost) shopDeleteCost.textContent = String(state.remove_card_cost);
    },
    renderStack(cards, activeCard, gesture) {
      if (!stack) return;
      stack.innerHTML = "";
      const visibleCards = cards.slice(-3);
      visibleCards.forEach((card, index) => {
        const el = createCardElement(card, index === visibleCards.length - 1 && card.id === activeCard?.id);
        stack.appendChild(el);
      });
      const topCard = stack.querySelector(".card.is-active");
      if (topCard && activeCard) {
        gesture.bind(topCard, activeCard);
      }
    },
    flashHint(type) {
      const node = type === "eat" ? eatHint : discardHint;
      if (!node) return;
      setHintVisible(node, true);
      const previous = timerMap.get(node);
      if (previous) clearTimeout(previous);
      const next = setTimeout(() => setHintVisible(node, false), 700);
      timerMap.set(node, next);
    },
    showFloatingScore(points, action, streak) {
      const stage = root.querySelector(".deck-stage");
      if (!stage) return;

      const floater = document.createElement("div");
      floater.className = "floater";
      
      // 颜色判定：吃是绿色，弃是黄色，负分是红色
      let color = points >= 0 ? (action === "eat" ? "var(--accent-eat)" : "var(--color-gold)") : "#f87171";
      if (points < 0) color = "#f87171"; 
      floater.style.color = color;
      
      // 文字内容：展示分数，如果是高连击追加 🔥
      let text = points > 0 ? `+${points}` : `${points}`;
      if (streak >= 3) text += ` 🔥x${streak}`; 
      floater.textContent = text;
      
      // 随着连击数变大，文字物理放大 (最大放大 2.5 倍)
      const scale = Math.min(1 + (streak - 1) * 0.25, 2.5);
      floater.style.setProperty("--target-scale", scale);
      
      stage.appendChild(floater);
      
      // 动画结束后自我销毁
      setTimeout(() => floater.remove(), 800);
    },

    // 【新增】屏幕震动
    triggerShake() {
      const table = root.querySelector(".table");
      if (!table) return;
      table.classList.remove("shake");
      void table.offsetWidth; // 触发浏览器重绘重置动画
      table.classList.add("shake");
    },
    showRoundSummary(result, state, isGameOver, onConfirm) {
      if (summaryBase) summaryBase.textContent = String(result.baseScore);
      if (summaryCombo) summaryCombo.textContent = `x${result.comboMultiplier} ${result.comboLogs.length > 0 ? '('+result.comboLogs.join(', ')+')' : ''}`;
      if (summaryTotal) summaryTotal.textContent = String(result.roundScore);
      
      const timeElapsedText = root.querySelector("#summaryTimeElapsed");
      if (timeElapsedText) timeElapsedText.textContent = `${(state.roundElapsedMs / 1000).toFixed(1)} 秒`;
      
      const btn = root.querySelector("#summaryContinueBtn");
      const title = root.querySelector("#summaryTitle");
      const tip = root.querySelector("#summaryTip");

      if (isGameOver) {
        title.textContent = "游戏结束"; title.style.color = "#f87171";
        tip.textContent = "未达到阶段目标分数，挑战失败！";
        btn.textContent = "重新开始游戏"; btn.style.background = "#f87171";
        btn.onclick = () => location.reload();
      } else {
        title.textContent = "本轮结算"; title.style.color = "#e5e7eb";
        btn.textContent = "确认结算，进入商店"; btn.style.background = "var(--accent-eat)";
        btn.onclick = onConfirm;
      }
      
      // 【查看规则按钮逻辑】
      const rulesBtn = root.querySelector("#viewRulesBtn");
      const rulesContainer = root.querySelector("#activeRulesContainer");
      const rulesList = root.querySelector("#activeRulesList");
      if (rulesBtn && rulesContainer && rulesList) {
        rulesContainer.style.display = "none";
        rulesList.innerHTML = state.active_rules.map(r => `<li><b>${r.name}</b>: ${r.description}</li>`).join("");
        rulesBtn.onclick = () => {
          rulesContainer.style.display = rulesContainer.style.display === "none" ? "block" : "none";
        };
      }
      
      summary.classList.add("show");
    },
    hideRoundSummary() {
      if (!summary) return;
      summary.classList.remove("show");
      summary.classList.remove("waiting-confirm");
    },

    openRuleDraft(options, state, engineInfo, onChoose) {
      if (!ruleDraft || !ruleDraftList) return;
      ruleDraftList.innerHTML = "";
      options.forEach((rule) => ruleDraftList.appendChild(createRuleDraftElement(rule, onChoose)));
      
      const targetText = root.querySelector("#draftTargetText");
      if (targetText && engineInfo) {
        const nextTarget = engineInfo.getNextTargetInfo(state.current_round);
        targetText.textContent = `🎯 下个目标：第 ${nextTarget.round} 轮需达到 ${nextTarget.target} 分`;
      }
      
      ruleDraft.classList.add("show");
    },
    closeRuleDraft() {
      if (!ruleDraft) return;
      ruleDraft.classList.remove("show");
    },
    openShop(state, cards, onBuy, onRemove, onContinue) {
      if (!shop || !shopList) return;
      shopList.innerHTML = "";
      
      // === 购买区 ===
      const buyHeader = document.createElement("div");
      buyHeader.style.cssText = "grid-column: 1 / -1; font-weight: bold; color: var(--color-gold); margin-top: 10px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;";
      buyHeader.textContent = "🛒 商店售卖区 (点击购买)";
      shopList.appendChild(buyHeader);

      if (cards.length === 0) {
        const emptyTip = document.createElement("div");
        emptyTip.style.cssText = "grid-column: 1 / -1; color: var(--muted); font-size: 14px; text-align:center; padding: 20px;";
        emptyTip.textContent = "商品已被买空啦~";
        shopList.appendChild(emptyTip);
      } else {
        cards.forEach((card) => shopList.appendChild(createShopCardElement(card, onBuy)));
      }

      // === 删牌/卡组总览区 ===
      const removeHeader = document.createElement("div");
      removeHeader.style.cssText = "grid-column: 1 / -1; font-weight: bold; color: var(--color-discard); margin-top: 24px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;";
      removeHeader.textContent = `🗑️ 我的当前卡组 (点击可精简，当前费用: ${state.remove_card_cost} 金币)`;
      shopList.appendChild(removeHeader);

      // 将玩家当前的永久卡组遍历渲染
      state.deck.forEach((card) => {
        shopList.appendChild(createDeckCardElement(card, onRemove));
      });

      const continueButton = root.querySelector("#shopContinue");
      continueButton?.addEventListener("click", onContinue, { once: true });
      shop.classList.add("show");
      this.renderHud(state, state.deck?.length ?? 0);
    },
    closeShop() {
      if (!shop) return;
      shop.classList.remove("show");
    },
    setShopMessage(message) {
      const node = root.querySelector("#shopMessage");
      if (node) node.textContent = message;
    },
    showCountdown(onComplete) {
      const overlay = root.querySelector("#countdownOverlay");
      const text = root.querySelector("#countdownText");
      if (!overlay || !text) { onComplete(); return; }
      
      overlay.classList.add("show");
      text.textContent = "开始 !";
      text.style.transform = "scale(1.2)";
      text.style.color = "#4ade80";
      
      setTimeout(() => {
        overlay.classList.remove("show");
        onComplete();
      }, 600); // 仅仅停留 0.6 秒
    },

    showRoundSummary(result, state, isGameOver, onConfirm) {
      const summary = root.querySelector("#roundSummary");
      const list = root.querySelector("#summaryBreakdownList");
      
      // 动态生成账单（为动画做准备，目前直接显示）
      if (list) {
        list.innerHTML = result.breakdown.map(b => {
          // 默认样式
          let style = 'font-size: 15px; color: var(--text); border-bottom: 1px dashed rgba(255,255,255,0.1); padding-bottom: 8px;';
          
          if (b.isTotal) {
            // 底部总计样式（大字号、绿色、顶边框）
            style = 'margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.2); font-size: 24px; font-weight: bold; color: var(--accent-eat);';
          } else if (b.isSubItem) {
            // 子条目细分样式（小字号、灰色、缩进缩进、无下边框）
            style = 'font-size: 13px; color: var(--muted); padding-left: 20px; border-bottom: none; padding-bottom: 0px; margin-top: -6px;';
          }else if (b.isBonus) { // 【新增】
            // 额外奖励样式（紫色、醒目）
            style = 'font-size: 16px; font-weight: bold; color: #c4b5fd; border-bottom: 1px dashed rgba(196, 181, 253, 0.3); padding-bottom: 8px;';
          }

          return `
            <div style="display: flex; justify-content: space-between; align-items: center; ${style}">
              <span>${b.label}</span>
              <span>${b.text}</span>
            </div>
          `;
        }).join("");
      }

      const btn = root.querySelector("#summaryContinueBtn");
      const title = root.querySelector("#summaryTitle");
      const tip = root.querySelector("#summaryTip");

      if (isGameOver) {
        title.textContent = "游戏结束"; title.style.color = "#f87171";
        tip.textContent = "未达到阶段目标分数，挑战失败！";
        btn.textContent = "重新开始游戏"; btn.style.background = "#f87171";
        btn.onclick = () => location.reload();
      } else {
        title.textContent = "本轮结算"; title.style.color = "#e5e7eb";
        btn.textContent = "确认结算，进入商店"; btn.style.background = "var(--accent-eat)";
        btn.onclick = onConfirm;
      }
      
      // 规则查看逻辑保持不变
      let rulesBtn = root.querySelector("#viewRulesBtn");
      const rulesContainer = root.querySelector("#activeRulesContainer");
      const rulesList = root.querySelector("#activeRulesList");
      if (rulesBtn && rulesContainer && rulesList && state) {
        rulesContainer.style.display = "none";
        rulesList.innerHTML = state.active_rules.map(r => `<li><b>${r.name}</b>: ${r.description}</li>`).join("");
        const newBtn = rulesBtn.cloneNode(true);
        rulesBtn.parentNode.replaceChild(newBtn, rulesBtn);
        rulesBtn = newBtn;
        rulesBtn.addEventListener("click", (e) => {
          e.preventDefault(); e.stopPropagation();
          rulesContainer.style.display = rulesContainer.style.display === "none" ? "block" : "none";
        });
      }
      
      if(summary) summary.classList.add("show");
    },
    hideRoundSummary() { if (summary) summary.classList.remove("show"); },
  };
}
