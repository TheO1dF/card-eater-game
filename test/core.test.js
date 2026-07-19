import test from "node:test";
import assert from "node:assert/strict";
import { statSync } from "node:fs";

import { CARD_ROLES, getShopWeight, RARITY_MODEL } from "../js/balance.js";
import { GAME_CONFIG, isQuestRound } from "../js/config.js";
import { CARD_LIBRARY, createShopCardPool, getCardById } from "../js/data.js";
import { createRoundEngine } from "../js/engine.js";
import { addItem, applyRoundItemSetup, ITEM_LIBRARY } from "../js/items.js";
import { formatScore } from "../js/numbers.js";
import { applyQuestRoundPenalty, finalizeQuest, QUEST_LIBRARY, randomDraftQuests, selectQuest } from "../js/quests.js";
import { isRuleEligible, randomDraftRules, RULE_LIBRARY } from "../js/rules.js";
import { createShopService, RARITY_PRICE } from "../js/shop.js";
import {
  GAME_PHASES,
  createInitialPlayerState,
  resetRoundState,
  transitionPhase,
} from "../js/state.js";

const ids = (card, index) => `${card.id}-${index}`;

function readyState() {
  const state = createInitialPlayerState({ create_id: ids });
  resetRoundState(state);
  return state;
}

function instance(id, suffix = "test") {
  return { ...getCardById(id), uuid: `${id}-${suffix}` };
}

test("初始牌组严格为 7 张：4 张可食用、3 张不可食用", () => {
  const state = readyState();
  assert.equal(state.deck.length, 7);
  assert.equal(state.deck.filter((card) => card.edibility === "edible").length, 4);
  assert.equal(state.deck.filter((card) => card.edibility === "inedible").length, 3);
});

test("完整卡池提供 60 张、10 类卡牌与任务诅咒稀有度", () => {
  const cards = Object.values(CARD_LIBRARY);
  assert.equal(cards.length, 60);
  assert.equal(new Set(cards.map((card) => card.id)).size, 60);
  assert.deepEqual(new Set(cards.map((card) => card.rarity)), new Set(["普通", "罕见", "稀有", "传奇", "诅咒"]));
  assert.deepEqual(new Set(cards.map((card) => card.type)), new Set(["水果", "快餐", "甜点", "饮料", "蔬菜", "星体", "人物", "动物", "通用", "虚空"]));
});

test("60 张卡牌全部使用独立卡图坐标，商店卡不再借图换色", () => {
  const cards = Object.values(CARD_LIBRARY);
  const spriteKeys = cards.map((card) => `${card.sprite_sheet}:${card.sprite_x}:${card.sprite_y}`);
  assert.equal(new Set(spriteKeys).size, 60);
  assert.equal(cards.filter((card) => card.sprite_rows === 4).length, 7);
  assert.equal(cards.filter((card) => card.sprite_rows === 2).length, 53);
});

test("H5 开局使用独立小图，中后期卡池共用单请求图集", () => {
  const cards = Object.values(CARD_LIBRARY);
  const runtimeKeys = cards.map((card) => `${card.runtime_x}:${card.runtime_y}`);
  assert.equal(new Set(runtimeKeys).size, 60);
  assert.equal(cards.filter((card) => card.runtime_art_mode === "individual").length, 7);
  assert.equal(cards.filter((card) => card.runtime_art_mode === "atlas").length, 53);

  const artFiles = cards.map((card) => card.art_file);
  assert.equal(new Set(artFiles).size, 60);
  assert.ok(artFiles.every((file) => file.endsWith(".webp")));
  const sizes = artFiles.map((file) => statSync(new URL(`../assets/${file}`, import.meta.url)).size);
  assert.ok(Math.max(...sizes) < 30_000, `最大单图体积为 ${Math.max(...sizes)} bytes`);
  const totalBytes = sizes.reduce((sum, size) => sum + size, 0);
  assert.ok(totalBytes < 850_000, `全部卡图体积为 ${totalBytes} bytes`);

  const starterBytes = cards.slice(0, 7).reduce((sum, card) => (
    sum + statSync(new URL(`../assets/${card.art_file}`, import.meta.url)).size
  ), 0);
  assert.ok(starterBytes < 70_000, `开局卡图体积为 ${starterBytes} bytes`);
  const atlasBytes = statSync(new URL("../assets/cards-atlas.webp", import.meta.url)).size;
  assert.ok(atlasBytes < 600_000, `中后期图集体积为 ${atlasBytes} bytes`);
  const metaAtlasBytes = statSync(new URL("../assets/meta-atlas.webp", import.meta.url)).size;
  assert.ok(metaAtlasBytes < 80_000, `任务道具图集体积为 ${metaAtlasBytes} bytes`);
});

test("卡牌均带构筑角色、联动标签与可移植的效果数据", () => {
  const cards = Object.values(CARD_LIBRARY);
  const roles = new Set(Object.values(CARD_ROLES));
  assert.ok(cards.every((card) => roles.has(card.role)));
  assert.ok(cards.every((card) => Array.isArray(card.synergy_tags) && card.synergy_tags.length > 0));
  assert.ok(cards.every((card) => Number.isFinite(card.eat_points) && Number.isFinite(card.discard_points)));
});

test("价值模型允许牺牲牌与弃食惩罚，不再把正负等同于食物类别", () => {
  const cards = Object.values(CARD_LIBRARY);
  assert.ok(cards.some((card) => card.edibility === "edible" && card.eat_points < 0 && card.role === "sacrifice"));
  assert.ok(cards.some((card) => card.edibility === "edible" && card.discard_points < 0));
  assert.ok(cards.some((card) => card.edibility === "inedible" && card.eat_points <= -10));
});

test("吃与弃使用独立序列：中间弃牌不会打断连续吃食物", () => {
  const state = readyState();
  const engine = createRoundEngine();
  state.active_rules = [{ id: "meal", name: "三口正餐", description: "", scope: "sequence_eat", target_edibility: "edible", count: 3, multiplier: 1.5 }];

  engine.recordAction(state, "eat", instance("F001", "a"));
  engine.recordAction(state, "discard", instance("A001", "b"));
  engine.recordAction(state, "eat", instance("F002", "c"));
  engine.recordAction(state, "eat", instance("D001", "d"));
  state.round.elapsed_ms = 1000;

  assert.equal(engine.finalizeRound(state).rule_results[0].achieved, true);
  assert.equal(state.round.eat_sequence.length, 3);
  assert.equal(state.round.discard_sequence.length, 1);
});

test("吃下不可食用牌会打断可食用吃牌连击", () => {
  const state = readyState();
  const engine = createRoundEngine();
  state.active_rules = [{ id: "meal", name: "三口正餐", description: "", scope: "sequence_eat", target_edibility: "edible", count: 3, multiplier: 1.5 }];

  engine.recordAction(state, "eat", instance("F001", "a"));
  engine.recordAction(state, "eat", instance("F002", "b"));
  engine.recordAction(state, "eat", instance("A001", "c"));
  engine.recordAction(state, "eat", instance("D001", "d"));
  state.round.elapsed_ms = 1000;

  assert.equal(engine.finalizeRound(state).rule_results[0].achieved, false);
});

test("腐烂苹果用当前 -2 换接下来三张水果各 +2", () => {
  const state = readyState();
  const engine = createRoundEngine();
  assert.equal(engine.recordAction(state, "eat", instance("F006", "rot")).points, -2);
  assert.equal(engine.recordAction(state, "eat", instance("F001", "apple")).points, 3);
  assert.equal(engine.recordAction(state, "eat", instance("F002", "banana")).points, 3);
  assert.equal(engine.recordAction(state, "eat", instance("F003", "melon")).points, 4);
  assert.equal(engine.recordAction(state, "eat", instance("F001", "after")).points, 1);
});

test("顺序、回溯和复制效果读取真实行动历史", () => {
  const state = readyState();
  const engine = createRoundEngine();
  engine.recordAction(state, "eat", instance("F001", "apple"));
  assert.equal(engine.recordAction(state, "eat", instance("F004", "strawberry")).points, 4);
  engine.recordAction(state, "eat", instance("K001", "burger"));
  engine.recordAction(state, "eat", instance("K002", "noodle"));
  // 汉堡的 -1 会先压低拉面，因此回溯结果也随真实历史变化。
  assert.equal(engine.recordAction(state, "eat", instance("K005", "spoiled")).points, 1);
  assert.equal(engine.recordAction(state, "discard", instance("U005", "copy")).points, 2);
});

test("火龙果末位与彗星首位奖励要求玩家记住牌序", () => {
  const engine = createRoundEngine();
  const lastState = readyState();
  const dragonfruit = instance("F008", "last");
  lastState.round.draw_pile = [dragonfruit];
  assert.equal(engine.recordAction(lastState, "eat", dragonfruit).points, 11);

  const firstState = readyState();
  const comet = instance("C004", "first");
  firstState.round.draw_pile = [instance("F001", "under"), comet];
  assert.equal(engine.recordAction(firstState, "discard", comet).points, 6);
});

test("金苹果每次吃掉会永久成长", () => {
  const state = readyState();
  const engine = createRoundEngine();
  const golden = instance("F005", "grow");
  state.deck.push(golden);
  assert.equal(engine.recordAction(state, "eat", golden).points, 2);
  assert.equal(state.deck.find((card) => card.uuid === golden.uuid).eat_points, 3);
});

test("小牌组成长牌可在重洗后重复成长", () => {
  const state = readyState();
  const engine = createRoundEngine();
  const seed = instance("F009", "cycle");
  state.deck.push(seed);
  assert.equal(engine.recordAction(state, "eat", seed).points, 0);
  assert.equal(engine.recordAction(state, "eat", seed).points, 1);
  assert.equal(state.deck.find((card) => card.uuid === seed.uuid).eat_points, 2);
});

test("位置构筑支持末位冥王星、前后夹心与噬牌虎永久吞噬", () => {
  const engine = createRoundEngine();

  const plutoState = readyState();
  const pluto = instance("C007", "last");
  plutoState.round.draw_pile = [pluto];
  assert.equal(engine.recordAction(plutoState, "discard", pluto).points, 10);

  const sandwichState = readyState();
  engine.recordAction(sandwichState, "eat", instance("D001", "before"));
  const sandwich = instance("D007", "middle");
  sandwichState.round.draw_pile = [instance("D002", "after"), sandwich];
  assert.equal(engine.recordAction(sandwichState, "eat", sandwich).points, 9);

  const tigerState = readyState();
  const tiger = instance("A006", "hunter");
  const prey = instance("P005", "prey");
  tigerState.deck.push(tiger, prey);
  tigerState.round.draw_pile = [prey, tiger];
  engine.recordAction(tigerState, "discard", tiger);
  assert.equal(tigerState.deck.some((card) => card.uuid === prey.uuid), false);
  assert.equal(tigerState.deck.find((card) => card.uuid === tiger.uuid).discard_points, 7);
  assert.equal(tigerState.round.consume_next_uuid, prey.uuid);
});

test("厨师弃牌后只强化接下来两张可食用牌", () => {
  const state = readyState();
  const engine = createRoundEngine();
  assert.equal(engine.recordAction(state, "discard", instance("P002", "chef")).points, 3);
  assert.equal(engine.recordAction(state, "eat", instance("F001", "apple")).points, 2);
  assert.equal(engine.recordAction(state, "eat", instance("F002", "banana")).points, 2);
  assert.equal(engine.recordAction(state, "eat", instance("F003", "watermelon")).points, 2);
  assert.equal(state.round.buffs.length, 0);
});

test("冰淇淋在计分前清除汉堡留下的负面效果", () => {
  const state = readyState();
  const engine = createRoundEngine();
  engine.recordAction(state, "eat", instance("K001", "burger"));
  assert.equal(engine.recordAction(state, "eat", instance("D004", "icecream")).points, 2);
  assert.equal(state.round.buffs.length, 0);
});

test("黄金门票允许硬吃负分来换商店大额折扣", () => {
  const state = readyState();
  const engine = createRoundEngine();
  assert.equal(engine.recordAction(state, "eat", instance("U006", "ticket")).points, -5);
  assert.equal(state.round.shop_discount, 5);
});

test("基础金币奖励严格等于本轮吃牌数量", () => {
  const state = readyState();
  const engine = createRoundEngine();
  engine.recordAction(state, "eat", instance("F001", "a"));
  engine.recordAction(state, "discard", instance("A001", "b"));
  engine.recordAction(state, "eat", instance("F002", "c"));
  assert.equal(engine.getGoldReward(state), 2);
});

test("永久规则同时参与计分并叠加倍率", () => {
  const state = readyState();
  const engine = createRoundEngine();
  state.active_rules = [
    { id: "food", name: "食物+1", description: "", scope: "flat_bonus", target_edibility: "edible", action: "eat", bonus: 1, multiplier: 1 },
    { id: "two", name: "吃二张", description: "", scope: "min_eat", count: 2, multiplier: 2 },
  ];
  engine.recordAction(state, "eat", instance("F001", "a"));
  engine.recordAction(state, "eat", instance("F002", "b"));
  state.round.elapsed_ms = 1000;
  const result = engine.finalizeRound(state);
  assert.equal(result.card_score, 4);
  assert.equal(result.total_multiplier, 2);
  assert.equal(result.round_score, 8);
  assert.equal(result.rule_results.length, 2);
});

test("阶段目标使用此前各轮累计总分，而不是只看目标轮得分", () => {
  const state = readyState();
  const engine = createRoundEngine();
  state.current_round = 5;
  state.total_score = 149;
  engine.recordAction(state, "eat", instance("F001", "milestone"));
  const result = engine.finalizeRound(state);
  assert.equal(result.round_score, 1);
  assert.equal(state.total_score, 150);
  assert.deepEqual(engine.levelProgressCheck(state), { passed: true, target: 150 });
});

test("牺牲后爆发与吃弃交替规则能识别节奏", () => {
  const state = readyState();
  const engine = createRoundEngine();
  state.active_rules = [
    { id: "sac", name: "先苦后甜", description: "", scope: "sacrifice_then_score", score: 8, multiplier: 1.8 },
    { id: "rhythm", name: "吃弃四拍", description: "", scope: "alternating_actions", count: 4, multiplier: 1.45 },
  ];
  engine.recordAction(state, "eat", instance("P005", "king"));
  engine.recordAction(state, "discard", instance("C005", "meteor"));
  engine.recordAction(state, "eat", instance("K004", "burger"));
  engine.recordAction(state, "discard", instance("A001", "cat"));
  state.round.elapsed_ms = 1000;
  assert.ok(engine.finalizeRound(state).rule_results.every((rule) => rule.achieved));
});

test("状态机拒绝越级流转", () => {
  const state = readyState();
  assert.throws(() => transitionPhase(state, GAME_PHASES.PLAYING), /Invalid phase transition/);
  transitionPhase(state, GAME_PHASES.RULE_DRAFT);
  transitionPhase(state, GAME_PHASES.PLAYING);
  assert.equal(state.phase, GAME_PHASES.PLAYING);
});

test("稀有度价值模型统一决定价格与基础权重", () => {
  assert.deepEqual(RARITY_PRICE, { "普通": 3, "罕见": 6, "稀有": 10, "传奇": 16 });
  assert.ok(RARITY_MODEL["普通"].expected_base < RARITY_MODEL["稀有"].expected_base);
  assert.ok(RARITY_MODEL["传奇"].synergy_ceiling > RARITY_MODEL["稀有"].synergy_ceiling);
});

test("传奇牌前期锁定，后期显著提高出现权重", () => {
  const legendary = getCardById("C006");
  assert.equal(getShopWeight(legendary, 1), 0);
  assert.ok(getShopWeight(legendary, 11) > getShopWeight(legendary, 6));

  const state = readyState();
  state.current_round = 1;
  const shop = createShopService({ random: () => 0.999999, create_id: ids });
  assert.ok(shop.getShopCards(state).every((card) => card.rarity !== "传奇"));
});

test("商人与黄金门票前期锁定且强力经济效果不可叠加", () => {
  const merchant = getCardById("P003");
  const ticket = getCardById("U006");
  assert.deepEqual(
    [merchant.min_shop_round, merchant.max_copies, ticket.min_shop_round, ticket.max_copies],
    [5, 1, 8, 1],
  );

  const state = readyState();
  state.current_round = 8;
  state.gold = 100;
  state.deck.push({ ...merchant, uuid: "owned-merchant" });
  const shop = createShopService({ random: () => 0, create_id: ids });
  assert.equal(shop.buyCard(state, { ...merchant, shop_price: 1 }), false);
  assert.equal(state.deck.filter((card) => card.id === merchant.id).length, 1);
});

test("商店优惠按统一稀有度价格结算", () => {
  const state = readyState();
  state.round.shop_discount = 2;
  const shop = createShopService({ random: () => 0.5, create_id: ids });
  const offers = shop.getShopCards(state);
  assert.ok(offers.every((card) => card.shop_price === Math.max(1, RARITY_PRICE[card.rarity] - 2)));
  assert.equal(createShopCardPool().length, 52);
});

test("商店刷新收费 3 / 5 / 7 递增，免费机会也会推进价格", () => {
  const state = readyState();
  state.gold = 20;
  const shop = createShopService({ random: () => 0.5, create_id: ids });
  assert.equal(shop.getRerollCost(state), 3);
  const first = shop.rerollShop(state);
  assert.equal(first.success, true);
  assert.equal(first.cost, 3);
  assert.equal(first.free, false);
  assert.equal(first.cards.length, 3);
  assert.equal(state.gold, 17);
  assert.equal(shop.getRerollCost(state), 5);

  state.round.shop_free_rerolls = 1;
  const free = shop.rerollShop(state);
  assert.equal(free.success, true);
  assert.equal(free.cost, 0);
  assert.equal(free.free, true);
  assert.equal(state.gold, 17);
  assert.equal(shop.getRerollCost(state), 7);

  const third = shop.rerollShop(state);
  assert.equal(third.success, true);
  assert.equal(third.cost, 7);
  assert.equal(state.gold, 10);
  assert.equal(shop.getRerollCost(state), 9);
});

test("弃牌经济需要先完成弃牌节奏，不再由吃牌滚雪球", () => {
  const state = readyState();
  const engine = createRoundEngine();
  for (let index = 0; index < 6; index += 1) {
    engine.recordAction(state, "discard", instance("A001", `recycle-${index}`));
  }
  const scavenger = instance("P006", "payoff");
  assert.equal(engine.recordAction(state, "discard", scavenger).points, 1);
  assert.equal(state.round.pending_gold_bonus, 4);
  assert.equal(engine.getGoldReward(state), 0);
  engine.finalizeRound(state);
  assert.equal(state.gold, 4);
});

test("删牌费用按 0、5、10 递增", () => {
  const state = readyState();
  state.gold = 100;
  const shop = createShopService({ random: () => 0.5, create_id: ids });
  assert.equal(shop.removeCard(state, state.deck[0].uuid), true);
  assert.equal(state.remove_card_cost, 5);
  assert.equal(shop.removeCard(state, state.deck[0].uuid), true);
  assert.equal(state.remove_card_cost, 10);
});

test("规则池至少 40 条且同一局抽取绝不重复", () => {
  const state = readyState();
  assert.ok(RULE_LIBRARY.length >= 40);
  assert.equal(new Set(RULE_LIBRARY.map((rule) => rule.id)).size, RULE_LIBRARY.length);
  const owned = RULE_LIBRARY.slice(0, 15);
  const draft = randomDraftRules(3, owned, () => 0, state.deck);
  assert.equal(draft.length, 3);
  assert.ok(draft.every((rule) => !owned.some((item) => item.id === rule.id)));
});

test("初始牌组不会抽到当前无法完成的类别连击", () => {
  const state = readyState();
  const fastfoodRhythm = RULE_LIBRARY.find((rule) => rule.id === "fastfood-rhythm");
  const dessertRhythm = RULE_LIBRARY.find((rule) => rule.id === "dessert-rhythm");
  assert.equal(isRuleEligible(fastfoodRhythm, state.deck), false);
  assert.equal(isRuleEligible(dessertRhythm, state.deck), false);
});

test("任务仅在第 3 / 6 / 9 / 12 轮出现，三选一且不会重复", () => {
  assert.deepEqual(
    Array.from({ length: 15 }, (_, index) => index + 1).filter(isQuestRound),
    [3, 6, 9, 12],
  );
  const state = readyState();
  state.current_round = 3;
  const draft = randomDraftQuests(3, state, () => 0);
  assert.equal(draft.length, 3);
  assert.equal(new Set(draft.map((entry) => entry.id)).size, 3);
  state.quest_history.push({ id: draft[0].id });
  assert.ok(randomDraftQuests(3, state, () => 0).every((entry) => entry.id !== draft[0].id));
});

test("任务风险即时生效，达成后发放永久道具且不可重复领取", () => {
  const state = readyState();
  const engine = createRoundEngine();
  state.current_round = 3;
  const recycleQuest = QUEST_LIBRARY.find((entry) => entry.id === "QST02");
  selectQuest(state, recycleQuest, ids);
  assert.equal(state.active_quest.round, 3);
  for (let index = 0; index < 5; index += 1) {
    engine.recordAction(state, "discard", instance("A001", `quest-${index}`));
  }
  const result = engine.finalizeRound(state);
  const questResult = finalizeQuest(state, result);
  assert.equal(questResult.completed, true);
  assert.equal(state.items.some((entry) => entry.id === "IT002"), true);
  assert.equal(finalizeQuest(state, result), null);
  assert.equal(state.quest_history.length, 1);
});

test("重启按钮与优惠打印机在每轮初始化为小牌组重洗和免费刷新", () => {
  const state = readyState();
  assert.equal(ITEM_LIBRARY.length, 8);
  assert.equal(addItem(state, "IT001"), true);
  assert.equal(addItem(state, "IT005"), true);
  assert.equal(addItem(state, "IT001"), false);
  resetRoundState(state);
  applyRoundItemSetup(state);
  assert.equal(state.round.reshuffle_charges, 1);
  assert.equal(state.round.shop_free_rerolls, 1);
  state.deck.push(...Array.from({ length: 4 }, (_, index) => instance("F001", `large-${index}`)));
  resetRoundState(state);
  applyRoundItemSetup(state);
  assert.equal(state.round.reshuffle_charges, 0);
  assert.equal(state.round.shop_free_rerolls, 1);
});

test("极端倍率和超长连击会饱和到安全上限，不产生 Infinity / NaN", () => {
  const state = readyState();
  const engine = createRoundEngine();
  state.active_rules = Array.from({ length: 40 }, (_, index) => ({
    id: `overflow-${index}`,
    name: `极端倍率 ${index}`,
    description: "",
    scope: "flat_bonus",
    action: "eat",
    bonus: GAME_CONFIG.max_score,
    multiplier: Number.MAX_VALUE,
  }));
  engine.recordAction(state, "eat", instance("F001", "overflow"));
  const result = engine.finalizeRound(state);
  assert.equal(Number.isFinite(result.card_score), true);
  assert.equal(Number.isFinite(result.total_multiplier), true);
  assert.equal(Number.isFinite(result.round_score), true);
  assert.ok(Math.abs(result.round_score) <= GAME_CONFIG.max_score);
  assert.equal(formatScore(GAME_CONFIG.max_score), "9.00Q");
});

test("15 轮长局可连续经过规则、任务、重洗、商店和结算且状态始终有限", () => {
  const state = readyState();
  const engine = createRoundEngine();
  const shop = createShopService({ random: () => 0.37, create_id: ids });
  ITEM_LIBRARY.forEach((entry) => addItem(state, entry.id));

  for (let round = 1; round <= GAME_CONFIG.total_rounds; round += 1) {
    state.current_round = round;
    if (isQuestRound(round)) {
      const questOptions = randomDraftQuests(3, state, () => 0);
      assert.ok(questOptions.length > 0);
      selectQuest(state, questOptions[0], ids);
    }

    const ruleOptions = randomDraftRules(3, state.active_rules, () => 0.37, state.deck, round, { can_reshuffle: true });
    assert.ok(ruleOptions.length > 0);
    state.active_rules.push(ruleOptions[0]);

    resetRoundState(state);
    state.round.draw_pile = state.deck.map((card) => ({ ...card, effect: card.effect ? { ...card.effect } : null }));
    applyRoundItemSetup(state);
    applyQuestRoundPenalty(state, () => 0.25);
    let reshuffled = false;
    while (state.round.draw_pile.length > 0 || (!reshuffled && state.round.reshuffle_charges > 0 && state.round.spent_pile.length > 0)) {
      if (state.round.draw_pile.length === 0) {
        state.round.draw_pile = state.round.spent_pile.filter((card) => state.deck.some((owned) => owned.uuid === card.uuid));
        state.round.spent_pile = [];
        state.round.reshuffle_charges -= 1;
        state.round.reshuffle_count += 1;
        reshuffled = true;
      }
      const card = state.round.draw_pile.at(-1);
      const action = card.edibility === "edible" && state.round.actions.length % 3 !== 0 ? "eat" : "discard";
      engine.recordAction(state, action, card);
      state.round.draw_pile.pop();
      if (state.deck.some((owned) => owned.uuid === card.uuid)) state.round.spent_pile.push(card);
      if (state.round.consume_next_uuid) {
        if (state.round.draw_pile.at(-1)?.uuid === state.round.consume_next_uuid) state.round.draw_pile.pop();
        state.round.consume_next_uuid = null;
      }
      assert.ok(state.round.actions.length <= GAME_CONFIG.max_actions_per_round);
    }

    state.round.elapsed_ms = 1000;
    const result = engine.finalizeRound(state);
    state.gold += engine.getGoldReward(state);
    finalizeQuest(state, result);
    assert.equal(Number.isFinite(state.total_score), true);
    assert.equal(Number.isFinite(state.gold), true);
    assert.ok(Math.abs(state.total_score) <= GAME_CONFIG.max_score);
    assert.ok(state.deck.length <= GAME_CONFIG.max_deck_size);

    const reroll = shop.rerollShop(state);
    if (reroll.success && round >= 8) {
      const affordable = reroll.cards.find((card) => card.shop_price <= state.gold);
      if (affordable) shop.buyCard(state, affordable);
    }
  }

  assert.equal(state.current_round, 15);
  assert.equal(state.quest_history.length, 4);
  assert.equal(state.active_rules.length, 15);
});

test("阶段目标提高为 150 / 1500 / 12000 以承接永久倍率成长", () => {
  assert.deepEqual(GAME_CONFIG.milestone_targets, { 5: 150, 10: 1500, 15: 12000 });
});
