import test from "node:test";
import assert from "node:assert/strict";
import { statSync } from "node:fs";

import { CARD_ROLES, getShopWeight, RARITY_MODEL } from "../js/balance.js";
import { GAME_CONFIG } from "../js/config.js";
import { CARD_LIBRARY, createShopCardPool, getCardById } from "../js/data.js";
import { createRoundEngine } from "../js/engine.js";
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

test("完整卡池提供 50 张、9 类卡牌与四档稀有度", () => {
  const cards = Object.values(CARD_LIBRARY);
  assert.equal(cards.length, 50);
  assert.equal(new Set(cards.map((card) => card.id)).size, 50);
  assert.deepEqual(new Set(cards.map((card) => card.rarity)), new Set(["普通", "罕见", "稀有", "传奇"]));
  assert.deepEqual(new Set(cards.map((card) => card.type)), new Set(["水果", "快餐", "甜点", "饮料", "蔬菜", "星体", "人物", "动物", "通用"]));
});

test("50 张卡牌全部使用独立卡图坐标，商店卡不再借图换色", () => {
  const cards = Object.values(CARD_LIBRARY);
  const spriteKeys = cards.map((card) => `${card.sprite_sheet}:${card.sprite_x}:${card.sprite_y}`);
  assert.equal(new Set(spriteKeys).size, 50);
  assert.equal(cards.filter((card) => card.sprite_rows === 4).length, 7);
  assert.equal(cards.filter((card) => card.sprite_rows === 2).length, 43);
});

test("H5 使用 50 张按需 WebP 卡图且总预算低于 650KB", () => {
  const artFiles = Object.values(CARD_LIBRARY).map((card) => card.art_file);
  assert.equal(new Set(artFiles).size, 50);
  assert.ok(artFiles.every((file) => file.endsWith(".webp")));
  const sizes = artFiles.map((file) => statSync(new URL(`../assets/${file}`, import.meta.url)).size);
  assert.ok(Math.max(...sizes) < 30_000, `最大单图体积为 ${Math.max(...sizes)} bytes`);
  const totalBytes = sizes.reduce((sum, size) => sum + size, 0);
  assert.ok(totalBytes < 650_000, `全部卡图体积为 ${totalBytes} bytes`);
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

test("商店优惠按统一稀有度价格结算", () => {
  const state = readyState();
  state.round.shop_discount = 2;
  const shop = createShopService({ random: () => 0.5, create_id: ids });
  const offers = shop.getShopCards(state);
  assert.ok(offers.every((card) => card.shop_price === Math.max(1, RARITY_PRICE[card.rarity] - 2)));
  assert.equal(createShopCardPool().length, 43);
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

test("阶段目标提高为 150 / 1500 / 12000 以承接永久倍率成长", () => {
  assert.deepEqual(GAME_CONFIG.milestone_targets, { 5: 150, 10: 1500, 15: 12000 });
});
