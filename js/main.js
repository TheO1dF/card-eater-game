import { createInitialDeck } from "./data.js";
import { createInitialPlayerState } from "./state.js";
import { createGestureController } from "./gesture.js";
import { createRoundEngine } from "./engine.js";
import { createShopService } from "./shop.js";
import { randomDraftRules } from "./rules.js";
import { createUI } from "./ui.js";
import { initAudio, playSound, toggleBGM } from "./audio.js";

// --- 1. 初始化核心对象 ---
const state = createInitialPlayerState();
state.deck = createInitialDeck(); // 永久卡组

const engine = createRoundEngine();
const shopService = createShopService();
const ui = createUI(document);

let playDeck = [];        // 本轮临时消耗的牌
let shopBuffer = [];      // 商店商品缓存
let isBusy = true;        // 流程锁

let currentActionStreak = { type: null, count: 0 };
let bgmStarted = false;

// --- 2. 核心手势监听 ---
const gesture = createGestureController({
  onEat: (card) => handleAction("eat", card),
  onDiscard: (card) => handleAction("discard", card),
});

// --- 3. 辅助函数 ---
const sync = () => ui.renderHud(state, playDeck.length, engine); // 传入 engine 获取下个目标
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

let timerRafId = null;
function updateRealtimeTimer() {
  const timerEl = document.getElementById("timerValue");
  if (!isBusy && state.roundTimerStartedAt && timerEl) {
    const ms = Date.now() - state.roundTimerStartedAt;
    timerEl.textContent = (ms / 1000).toFixed(1) + "s";
  }
  timerRafId = requestAnimationFrame(updateRealtimeTimer);
}
// 启动循环时钟
requestAnimationFrame(updateRealtimeTimer);

function refreshTable() {
  const topCard = playDeck[playDeck.length - 1] || null;
  ui.renderStack(playDeck, topCard, gesture);
  sync();
}

// --- 4. 流程控制器 ---
function startNewRoundFlow() {
  isBusy = true;
  initAudio();
  // 传 state 和 engine 给 RuleDraft 界面显示下个目标
  ui.openRuleDraft(randomDraftRules(3, state.active_rules), state, engine, (rule) => {
    // 【完美启动时机】：玩家点击了规则牌，此时浏览器允许播放声音了！
    initAudio();
    if (!bgmStarted) {
      toggleBGM(true);
      bgmStarted = true;
    }
    
    state.active_rules.push(rule);
    ui.closeRuleDraft();
    prepareDeckForRound();
  });
}

function prepareDeckForRound() {
  engine.resetRoundHistory(state);
  playDeck = shuffle(state.deck); // 从永久库拷贝
  shopBuffer =[]; 
  currentActionStreak = { type: null, count: 0 }; // 【新增】重置连击
  
  refreshTable();
  ui.showCountdown(() => {
    isBusy = false;
    state.roundTimerStartedAt = Date.now();
  });
}

function handleAction(type, card) {
  if (isBusy) return;
  
  // 首次操作时，初始化音频（需要用户交互才能激活）

  // 【新增】如果BGM没启动过，则启动它

  
  // 1. 更新连击计数
  if (currentActionStreak.type === type) {
    currentActionStreak.count++;
  } else {
    currentActionStreak.type = type;
    currentActionStreak.count = 1;
  }
  
  // 2. 记录卡牌行为并获取本张牌的最终得分
  const entry = engine.recordAction(state, type, card);
  const points = entry.points; // 这张牌结算后的实际分数
  
  // 3. 触发音效和UI特效
  ui.flashHint(type);
  ui.showFloatingScore(points, type, currentActionStreak.count);
  playSound(type, currentActionStreak.count);
  
  // 如果是负分牌，增加屏幕震动
  if (points < 0) {
    ui.triggerShake();
    playSound('error', 1);
  }

  // 4. 移除堆栈顶部的牌
  playDeck.pop();

  // 5. 处理特殊效果：如陨石全弃
  if (state.forceDiscardRemaining) {
    state.forceDiscardRemaining = false;
    while(playDeck.length > 0) {
      engine.recordAction(state, "discard", playDeck.pop());
    }
  }

  // 6. 判定轮次是否结束
  if (playDeck.length <= 0) {
    completeRound();
  } else {
    refreshTable();
  }
}

function completeRound() {
  isBusy = true;
  state.roundElapsedMs = Date.now() - state.roundTimerStartedAt;
  
  // 轮次结束，时钟会因为 isBusy = true 而在屏幕上暂停
  
  const summary = engine.finalizeRound(state);
  state.gold += state.deck.length; 
  
  sync();

  const progress = engine.levelProgressCheck(state);
  const failed = ([5, 10, 15].includes(state.current_round) && !progress.passed);

  ui.showRoundSummary(summary, state, failed, () => {
    ui.hideRoundSummary();
    enterShopFlow();
  });
}

function enterShopFlow() {
  if (shopBuffer.length === 0) shopBuffer = shopService.getShopCards(state);
  
  ui.openShop(
    state, 
    shopBuffer, 
    (item) => {
      if (shopService.buyCard(state, item)) {
        // 【修复1：买过的牌从商店展示区直接剔除】
        shopBuffer = shopBuffer.filter(c => c !== item); 
        ui.setShopMessage(`购入 ${item.name}！金币:${state.gold}`);
        enterShopFlow(); 
      }
    },
    (uuid) => {
      if (shopService.removeCard(state, uuid)) {
        ui.setShopMessage(`已移除卡牌！金币:${state.gold}`);
        enterShopFlow(); 
      }
    },
    () => {
      ui.closeShop();
      state.current_round++;
      startNewRoundFlow();
    }
  );
}

// 启动游戏
startNewRoundFlow();