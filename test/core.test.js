import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

import { CARD_ROLES, getShopWeight, RARITY_MODEL } from "../js/balance.js";
import { GAME_CONFIG, isQuestRound } from "../js/config.js";
import { CARD_LIBRARY, createShopCardPool, getCardById } from "../js/data.js";
import { createRoundEngine } from "../js/engine.js";
import { addItem, applyRoundEndItems, applyRoundItemSetup, createShopItemPool, ITEM_LIBRARY } from "../js/items.js";
import { formatScore } from "../js/numbers.js";
import {
  getPlateDrawBudget,
  getPlateSummary,
  getPlateUpgradeBaseCost,
  getPlateUpgradeCost,
  takeRoundDrawPile,
} from "../js/plate.js";
import { activatePendingQuestRewards, applyQuestRoundPenalty, finalizeQuest, QUEST_LIBRARY, randomDraftQuests, selectQuest } from "../js/quests.js";
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
  assert.equal(state.plate_capacity, 10);
  assert.equal(state.plate_upgrade_count, 0);
  assert.equal(state.deck.filter((card) => card.edibility === "edible").length, 4);
  assert.equal(state.deck.filter((card) => card.edibility === "inedible").length, 3);
});

test("永久餐盘默认限制每轮最多登场 10 张牌", () => {
  assert.deepEqual(
    [7, 10, 11, 30, 100].map((size) => getPlateDrawBudget(size, 10)),
    [7, 10, 10, 10, 10],
  );
  const cards = Array.from({ length: 30 }, (_, index) => ({ id: `card-${index}` }));
  const selected = takeRoundDrawPile(cards, 10);
  assert.equal(selected.draw_pile.length, 10);
  assert.equal(selected.reserve_count, 20);
  assert.deepEqual(getPlateSummary(30, 12), { deck_size: 30, capacity: 12, action_budget: 12, reserve_count: 18 });
});

test("餐盘扩容前期便宜、后期昂贵且量尺只提供固定优惠", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(getPlateUpgradeBaseCost), [3, 5, 8, 12, 17, 23]);
  assert.equal(getPlateUpgradeCost(3, 1), 11);
  assert.equal(getPlateUpgradeCost(0, 99), 1);
});

test("完整卡池提供 110 张、10 类卡牌与任务诅咒稀有度", () => {
  const cards = Object.values(CARD_LIBRARY);
  assert.equal(cards.length, 110);
  assert.equal(new Set(cards.map((card) => card.id)).size, 110);
  assert.deepEqual(new Set(cards.map((card) => card.rarity)), new Set(["普通", "罕见", "稀有", "传奇", "诅咒"]));
  assert.deepEqual(new Set(cards.map((card) => card.type)), new Set(["水果", "快餐", "甜点", "饮料", "蔬菜", "星体", "人物", "动物", "通用", "无类别"]));
});

test("110 张卡牌全部使用独立卡图坐标，商店卡不再借图换色", () => {
  const cards = Object.values(CARD_LIBRARY);
  const spriteKeys = cards.map((card) => `${card.sprite_sheet}:${card.sprite_x}:${card.sprite_y}`);
  assert.equal(new Set(spriteKeys).size, 110);
  assert.equal(cards.filter((card) => card.sprite_rows === 4).length, 7);
  assert.equal(cards.filter((card) => card.sprite_rows === 2).length, 103);
});

test("H5 开局使用独立小图，中后期卡池共用单请求图集", () => {
  const cards = Object.values(CARD_LIBRARY);
  const runtimeKeys = cards.map((card) => `${card.runtime_x}:${card.runtime_y}`);
  assert.equal(new Set(runtimeKeys).size, 110);
  assert.equal(cards.filter((card) => card.runtime_art_mode === "individual").length, 7);
  assert.equal(cards.filter((card) => card.runtime_art_mode === "atlas").length, 103);

  const artFiles = cards.map((card) => card.art_file);
  assert.equal(new Set(artFiles).size, 110);
  assert.ok(artFiles.every((file) => file.endsWith(".webp")));
  const sizes = artFiles.map((file) => statSync(new URL(`../assets/${file}`, import.meta.url)).size);
  assert.ok(Math.max(...sizes) < 30_000, `最大单图体积为 ${Math.max(...sizes)} bytes`);
  const totalBytes = sizes.reduce((sum, size) => sum + size, 0);
  assert.ok(totalBytes < 1_600_000, `全部卡图体积为 ${totalBytes} bytes`);

  const starterBytes = cards.slice(0, 7).reduce((sum, card) => (
    sum + statSync(new URL(`../assets/${card.art_file}`, import.meta.url)).size
  ), 0);
  assert.ok(starterBytes < 70_000, `开局卡图体积为 ${starterBytes} bytes`);
  const atlasBytes = statSync(new URL("../assets/cards-atlas.webp", import.meta.url)).size;
  assert.ok(atlasBytes < 1_200_000, `中后期图集体积为 ${atlasBytes} bytes`);
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

test("复杂效果统一显示关键字，所有摧毁语义不再混用近义词", () => {
  const effectCards = Object.values(CARD_LIBRARY).filter((card) => card.effect);
  assert.ok(effectCards.every((card) => card.effect.keywords.length > 0));
  assert.ok(effectCards.every((card) => card.effect.description.startsWith("【")));
  assert.equal(
    effectCards.filter((card) => /销毁|吞掉|藏走|烹掉|清走|吞噬/.test(card.effect.description)).length,
    0,
  );
  const destroyCards = effectCards.filter((card) => card.effect.keywords.includes("摧毁"));
  assert.ok(destroyCards.length >= 10);
  assert.ok(destroyCards.every((card) => card.effect.description.includes("摧毁")));
});

test("效果类型不再被单一模板淹没，最大机制组不超过 7 张", () => {
  const counts = Object.values(CARD_LIBRARY).reduce((result, card) => {
    if (card.effect) result[card.effect.kind] = (result[card.effect.kind] ?? 0) + 1;
    return result;
  }, {});
  assert.ok(Math.max(...Object.values(counts)) <= 7, JSON.stringify(counts));
  assert.ok(Object.keys(counts).length >= 60);
});

test("所有卡牌效果类型都存在引擎解析器，不允许只写描述不执行", () => {
  const engineSource = readFileSync(new URL("../js/engine.js", import.meta.url), "utf8");
  const handledKinds = new Set([...engineSource.matchAll(/effect\.kind === "([^"]+)"/g)].map((match) => match[1]));
  const usedKinds = new Set(Object.values(CARD_LIBRARY).flatMap((card) => (card.effect ? [card.effect.kind] : [])));
  assert.deepEqual([...usedKinds].filter((kind) => !handledKinds.has(kind)), []);
});

test("除无类别虚空诅咒外，所有卡牌都有可执行效果", () => {
  const cards = Object.values(CARD_LIBRARY);
  assert.deepEqual(cards.filter((card) => card.effect === null).map((card) => card.id), ["Q001"]);
  const voidCard = getCardById("Q001");
  assert.deepEqual([voidCard.type, voidCard.eat_points, voidCard.discard_points], ["无类别", -1, -1]);
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
  assert.equal(engine.recordAction(state, "eat", instance("F002", "banana")).points, 4);
  assert.equal(engine.recordAction(state, "eat", instance("F003", "melon")).points, 4);
  assert.equal(engine.recordAction(state, "eat", instance("F001", "after")).points, 1);
});

test("顺序、回溯和复制效果读取真实行动历史", () => {
  const state = readyState();
  const engine = createRoundEngine();
  engine.recordAction(state, "eat", instance("F001", "apple"));
  assert.equal(engine.recordAction(state, "eat", instance("F004", "strawberry")).points, 3);
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
  state.round.reshuffle_count = 1;
  assert.equal(engine.recordAction(state, "eat", seed).points, 0);
  assert.equal(engine.recordAction(state, "eat", seed).points, 2);
  assert.equal(state.deck.find((card) => card.uuid === seed.uuid).eat_points, 4);
});

test("位置构筑支持末位冥王星、前后夹心与噬牌虎摧毁成长", () => {
  const engine = createRoundEngine();

  const plutoState = readyState();
  const pluto = instance("C007", "last");
  engine.recordAction(plutoState, "discard", instance("C002", "previous-star"));
  plutoState.round.draw_pile = [pluto];
  assert.equal(engine.recordAction(plutoState, "discard", pluto).points, 12);

  const sandwichState = readyState();
  engine.recordAction(sandwichState, "eat", instance("F001", "before"));
  const sandwich = instance("D007", "middle");
  sandwichState.round.draw_pile = [instance("C002", "after"), sandwich];
  assert.equal(engine.recordAction(sandwichState, "eat", sandwich).points, 9);

  const tigerState = readyState();
  const tiger = instance("A006", "hunter");
  const prey = instance("K004", "prey");
  tigerState.deck.push(tiger, prey);
  tigerState.round.draw_pile = [prey, tiger];
  engine.recordAction(tigerState, "discard", tiger);
  assert.equal(tigerState.deck.some((card) => card.uuid === prey.uuid), false);
  assert.equal(tigerState.deck.find((card) => card.uuid === tiger.uuid).discard_points, 5);
  assert.equal(tigerState.round.destroyed_count, 1);
  assert.equal(tigerState.round.consume_next_uuid, prey.uuid);
});

test("新增位置牌同时提供奖励和惩罚，兔子按牌组数量成长", () => {
  const engine = createRoundEngine();
  const firstState = readyState();
  const durian = instance("F013", "first");
  firstState.round.draw_pile = [durian];
  assert.equal(engine.recordAction(firstState, "eat", durian).points, 8);

  const wrongState = readyState();
  engine.recordAction(wrongState, "discard", instance("A001", "before"));
  assert.equal(engine.recordAction(wrongState, "eat", instance("F013", "late")).points, 1);

  const rabbitState = readyState();
  const rabbits = Array.from({ length: 3 }, (_, index) => instance("A004", `rabbit-${index}`));
  rabbitState.deck.push(...rabbits);
  assert.equal(engine.recordAction(rabbitState, "discard", rabbits[0]).points, 4);
});

test("汽水反转牌面、巨无霸持续负面与国王赌注属于三种独立蓄势", () => {
  const engine = createRoundEngine();

  const sodaState = readyState();
  engine.recordAction(sodaState, "eat", instance("B002", "soda"));
  assert.equal(engine.recordAction(sodaState, "discard", instance("F001", "opposite")).points, 1);

  const burgerState = readyState();
  engine.recordAction(burgerState, "eat", instance("K004", "giant"));
  assert.equal(engine.recordAction(burgerState, "eat", instance("F001", "debuff-a")).points, -1);
  assert.equal(engine.recordAction(burgerState, "eat", instance("F002", "debuff-b")).points, 0);
  engine.recordAction(burgerState, "discard", instance("A001", "stop"));
  assert.equal(engine.recordAction(burgerState, "eat", instance("F001", "after-stop")).points, 1);

  const kingState = readyState();
  engine.recordAction(kingState, "eat", instance("P005", "king"));
  assert.equal(engine.recordAction(kingState, "discard", instance("A001", "win")).points, 5);
  const failedKingState = readyState();
  engine.recordAction(failedKingState, "eat", instance("P005", "king-fail"));
  assert.equal(engine.recordAction(failedKingState, "discard", instance("F001", "lose")).points, -5);
});

test("糖果储存精确兑现、商人按类别动态折扣、兔群头领按对子计分", () => {
  const engine = createRoundEngine();

  const candyState = readyState();
  const candy = instance("D005", "bank");
  candyState.deck.push(candy);
  assert.equal(engine.recordAction(candyState, "eat", candy).points, 1);
  assert.equal(engine.recordAction(candyState, "eat", candy).points, 1);
  assert.equal(engine.recordAction(candyState, "discard", candy).points, 4);
  assert.equal(candyState.deck.find((card) => card.uuid === candy.uuid).stored_score, 0);

  const merchantState = readyState();
  ["F001", "K001", "D001", "B001", "V001"].forEach((id, index) => {
    engine.recordAction(merchantState, "discard", instance(id, `type-${index}`));
  });
  engine.recordAction(merchantState, "discard", instance("P003", "merchant"));
  assert.equal(merchantState.round.shop_discount, 2);

  const rabbitState = readyState();
  const leader = instance("A012", "leader");
  rabbitState.deck.push(leader, ...Array.from({ length: 5 }, (_, index) => instance("A004", `pair-${index}`)));
  assert.equal(engine.recordAction(rabbitState, "discard", leader).points, 8);
});

test("历史牌分别读取不同卡名、连续行动、负分牺牲与弃食经济", () => {
  const engine = createRoundEngine();

  const dogState = readyState();
  engine.recordAction(dogState, "eat", instance("F001", "apple-a"));
  engine.recordAction(dogState, "eat", instance("F001", "apple-b"));
  engine.recordAction(dogState, "eat", instance("F002", "banana"));
  assert.equal(engine.recordAction(dogState, "discard", instance("A002", "dog")).points, 4);

  const monkeyState = readyState();
  engine.recordAction(monkeyState, "eat", instance("F001", "fruit-a"));
  engine.recordAction(monkeyState, "eat", instance("F002", "fruit-b"));
  assert.equal(engine.recordAction(monkeyState, "discard", instance("A003", "monkey")).points, 5);

  const gluttonState = readyState();
  engine.recordAction(gluttonState, "eat", instance("F006", "negative-a"));
  engine.recordAction(gluttonState, "eat", instance("B003", "negative-b"));
  assert.equal(engine.recordAction(gluttonState, "discard", instance("A005", "glutton")).points, 9);

  const compostState = readyState();
  ["F001", "F002", "K001", "D001"].forEach((id, index) => {
    engine.recordAction(compostState, "discard", instance(id, `food-${index}`));
  });
  engine.recordAction(compostState, "discard", instance("U004", "compost"));
  assert.equal(compostState.round.pending_gold_bonus, 2);
});

test("生成器具有不同触发维度，生成来源会改变鸡蛋效果", () => {
  const engine = createRoundEngine();

  const bagState = readyState();
  const bag = instance("K009", "bag");
  bagState.deck.push(bag);
  bagState.round.draw_pile = [bag];
  engine.recordAction(bagState, "discard", bag);
  assert.equal(bagState.deck.filter((card) => card.id === "K006").length, 2);

  const bottleState = readyState();
  const bottle = instance("B009", "bottle");
  bottleState.deck.push(bottle);
  engine.recordAction(bottleState, "discard", bottle);
  assert.equal(bottleState.deck.some((card) => card.uuid === bottle.uuid), false);
  assert.equal(bottleState.deck.filter((card) => card.id === "B006").length, 1);

  const henState = readyState();
  const hen = instance("A009", "hen");
  henState.deck.push(hen);
  engine.recordAction(henState, "discard", instance("A001", "animal-before"));
  engine.recordAction(henState, "discard", hen);
  const egg = henState.deck.find((card) => card.generated_from === "A009");
  assert.ok(egg);
  assert.equal(engine.recordAction(henState, "eat", egg).points, 5);
  assert.equal(engine.recordAction(henState, "eat", instance("A010", "shop-egg")).points, 1);
});

test("摧毁上一张牌可走金币、商店折扣或永久成长三条不同路线", () => {
  const engine = createRoundEngine();

  const squirrelState = readyState();
  const food = instance("F003", "food");
  const squirrel = instance("A008", "squirrel");
  squirrelState.deck.push(food, squirrel);
  engine.recordAction(squirrelState, "eat", food);
  engine.recordAction(squirrelState, "discard", squirrel);
  assert.equal(squirrelState.round.pending_gold_bonus, 1);
  assert.equal(squirrelState.deck.some((card) => card.uuid === food.uuid), false);

  const cleanerState = readyState();
  const legendary = instance("C006", "legendary");
  const cleaner = instance("P010", "cleaner");
  cleanerState.deck.push(legendary, cleaner);
  engine.recordAction(cleanerState, "discard", legendary);
  engine.recordAction(cleanerState, "discard", cleaner);
  assert.equal(cleanerState.round.shop_discount, 4);
  assert.equal(cleanerState.deck.some((card) => card.uuid === legendary.uuid), false);
});

test("生成、一次性摧毁与摧毁上一张牌构成可控的牌组变化", () => {
  const engine = createRoundEngine();

  const generateState = readyState();
  const pit = instance("F014", "pit");
  generateState.deck.push(pit);
  engine.recordAction(generateState, "eat", pit);
  engine.recordAction(generateState, "eat", pit);
  assert.equal(generateState.deck.filter((card) => card.id === "F009").length, 1);

  const exhaustState = readyState();
  const candy = instance("D009", "exhaust");
  exhaustState.deck.push(candy);
  engine.recordAction(exhaustState, "eat", candy);
  assert.equal(exhaustState.deck.some((card) => card.uuid === candy.uuid), false);
  assert.equal(engine.recordAction(exhaustState, "eat", instance("F001", "boosted")).points, 2);

  const soupState = readyState();
  const carrot = instance("V001", "ingredient");
  const soup = instance("V009", "soup");
  soupState.deck.push(carrot, soup);
  engine.recordAction(soupState, "eat", carrot);
  engine.recordAction(soupState, "eat", soup);
  assert.equal(soupState.deck.some((card) => card.uuid === carrot.uuid), false);
  assert.equal(soupState.deck.find((card) => card.uuid === soup.uuid).eat_points, 3);
});

test("厨师弃牌后只强化接下来两张可食用牌", () => {
  const state = readyState();
  const engine = createRoundEngine();
  assert.equal(engine.recordAction(state, "discard", instance("P002", "chef")).points, 3);
  assert.equal(engine.recordAction(state, "eat", instance("F001", "apple")).points, 2);
  assert.equal(engine.recordAction(state, "eat", instance("F002", "banana")).points, 3);
  assert.equal(engine.recordAction(state, "eat", instance("F003", "watermelon")).points, 2);
  assert.equal(state.round.buffs.length, 0);
});

test("冰淇淋在计分前净化汉堡留下的负面效果", () => {
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

test("基础金币重新等于餐盘内实际吃牌次数，不再有饱腹或携带费", () => {
  const state = readyState();
  const engine = createRoundEngine();
  for (let index = 0; index < 9; index += 1) engine.recordAction(state, "eat", instance("F001", `gold-${index}`));
  assert.equal(engine.getGoldReward(state), 9);
});

test("牌组尺寸不再自带构筑密度倍率", () => {
  const engine = createRoundEngine();
  const compactState = readyState();
  for (let index = 0; index < 5; index += 1) engine.recordAction(compactState, "eat", instance("F001", `compact-${index}`));
  const compactResult = engine.finalizeRound(compactState);
  assert.equal(compactResult.total_multiplier, 1);
  assert.equal(compactResult.card_score, 6);
  assert.equal(compactResult.round_score, 6);
  assert.ok(compactResult.breakdown.every((entry) => !entry.label.includes("构筑密度")));
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
  assert.equal(result.card_score, 6);
  assert.equal(result.total_multiplier, 2);
  assert.equal(result.round_score, 12);
  assert.equal(result.rule_results.length, 2);
});

test("阶段目标使用此前各轮累计总分，而不是只看目标轮得分", () => {
  const state = readyState();
  const engine = createRoundEngine();
  state.current_round = 5;
  state.total_score = 149;
  engine.recordAction(state, "eat", instance("F001", "milestone"));
  const result = engine.finalizeRound(state);
  assert.equal(result.round_score, 2);
  assert.equal(state.total_score, 151);
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
  assert.equal(shop.getBuyCardStatus(state, { ...merchant, shop_price: 1 }).reason, "copy_limit");
  assert.equal(state.deck.filter((card) => card.id === merchant.id).length, 1);
});

test("商店优惠按统一稀有度价格结算", () => {
  const state = readyState();
  state.round.shop_discount = 2;
  const shop = createShopService({ random: () => 0.5, create_id: ids });
  const offers = shop.getShopCards(state);
  assert.ok(offers.every((card) => card.shop_price === Math.max(1, RARITY_PRICE[card.rarity] - 2)));
  assert.equal(createShopCardPool().length, 102);
});

test("牌组大小不再改变卡牌价格，餐盘扩容是独立的永久投资", () => {
  const state = readyState();
  while (state.deck.length < 30) state.deck.push(instance("F001", `large-${state.deck.length}`));
  state.gold = 100;
  const shop = createShopService({ random: () => 0.37, create_id: ids });
  let offers = shop.getShopCards(state);
  assert.ok(offers.every((card) => card.shop_price === RARITY_PRICE[card.rarity] && !("shop_size_surcharge" in card)));
  assert.deepEqual(shop.getPlateUpgradeStatus(state), { ok: true, reason: null, cost: 3, base_cost: 3, discount: 0 });
  assert.equal(shop.buyPlateUpgrade(state).success, true);
  assert.equal(state.plate_capacity, 11);
  assert.equal(state.gold, 97);
  assert.equal(shop.getPlateUpgradeStatus(state).cost, 5);
  assert.equal(shop.buyPlateUpgrade(state).success, true);
  assert.equal(state.plate_capacity, 12);
  assert.equal(state.gold, 92);
  assert.equal(shop.buyCard(state, offers[0]), true);
  offers = shop.repriceShopCards(state, offers.slice(1));
  assert.ok(offers.every((card) => card.shop_price === RARITY_PRICE[card.rarity]));
  state.plate_capacity = GAME_CONFIG.max_plate_capacity;
  assert.equal(shop.getPlateUpgradeStatus(state).reason, "max_capacity");
});

test("商店刷新收费 1 / 2 / 3 递增，免费机会也会推进价格", () => {
  const state = readyState();
  state.gold = 20;
  const shop = createShopService({ random: () => 0.5, create_id: ids });
  assert.equal(shop.getRerollCost(state), 1);
  const first = shop.rerollShop(state);
  assert.equal(first.success, true);
  assert.equal(first.cost, 1);
  assert.equal(first.free, false);
  assert.equal(first.cards.length, 3);
  assert.equal(state.gold, 19);
  assert.equal(shop.getRerollCost(state), 2);

  state.round.shop_free_rerolls = 1;
  const free = shop.rerollShop(state);
  assert.equal(free.success, true);
  assert.equal(free.cost, 0);
  assert.equal(free.free, true);
  assert.equal(state.gold, 19);
  assert.equal(shop.getRerollCost(state), 3);

  const third = shop.rerollShop(state);
  assert.equal(third.success, true);
  assert.equal(third.cost, 3);
  assert.equal(state.gold, 16);
  assert.equal(shop.getRerollCost(state), 4);
});

test("免费刷新后的商品可正常购买，失败原因不会再误报为金币不足", () => {
  const state = readyState();
  state.gold = 50;
  state.round.shop_free_rerolls = 1;
  const shop = createShopService({ random: () => 0.41, create_id: ids });
  const reroll = shop.rerollShop(state);
  assert.equal(reroll.success, true);
  assert.equal(reroll.free, true);
  const offer = reroll.cards[0];
  const beforeGold = state.gold;
  assert.equal(shop.getBuyCardStatus(state, offer).ok, true);
  assert.equal(shop.buyCard(state, offer), true);
  assert.equal(state.gold, beforeGold - offer.shop_price);

  while (state.deck.length < GAME_CONFIG.max_deck_size) state.deck.push(instance("F001", `full-${state.deck.length}`));
  assert.equal(shop.getBuyCardStatus(state, { ...getCardById("F010"), shop_price: 1 }).reason, "deck_full");
});

test("第 10 轮大牌组仍能购买，商店不会给出已达持有上限的卡", () => {
  const state = readyState();
  state.current_round = 10;
  state.gold = 100;
  while (state.deck.length < 100) state.deck.push(instance("F001", `round10-${state.deck.length}`));
  const shop = createShopService({ random: () => 0.43, create_id: ids });
  const offers = shop.getShopCards(state);
  assert.equal(GAME_CONFIG.max_deck_size, 160);
  assert.equal(offers.length, GAME_CONFIG.shop_offer_count);
  assert.ok(offers.every((offer) => (
    state.deck.filter((owned) => owned.id === offer.id).length < offer.max_copies
  )));
  const before = state.deck.length;
  assert.equal(shop.getBuyCardStatus(state, offers[0]).ok, true);
  assert.equal(shop.buyCard(state, offers[0]), true);
  assert.equal(state.deck.length, before + 1);
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
  assert.equal(state.gold, 100);
  assert.equal("salvage" in state.last_shop_transaction, false);
  assert.equal(state.remove_card_cost, 5);
  assert.equal(shop.removeCard(state, state.deck[0].uuid), true);
  assert.equal(state.gold, 95);
  assert.equal(state.remove_card_cost, 10);
});

test("任何牌组尺寸和道具都不会让删牌返还金币", () => {
  const state = readyState();
  while (state.deck.length < 20) state.deck.push(instance("F001", `overload-${state.deck.length}`));
  state.gold = 10;
  addItem(state, "IT106");
  const shop = createShopService({ random: () => 0.5, create_id: ids });
  const target = state.deck.find((card) => card.rarity === "普通");
  assert.equal(shop.removeCard(state, target.uuid), true);
  assert.equal(state.deck.length, 19);
  assert.equal(state.gold, 10);
  assert.equal("salvage" in state.last_shop_transaction, false);
  assert.equal(shop.getPlateUpgradeStatus(state).cost, 2);
});

test("商店出售低级道具，魔法帽在轮末把非兔子变为兔子", () => {
  const state = readyState();
  state.current_round = 3;
  state.gold = 20;
  const shop = createShopService({ random: () => 0, create_id: ids });
  const hat = { ...createShopItemPool().find((entry) => entry.id === "IT101") };
  assert.equal(shop.buyItem(state, hat), true);
  const firstUuid = state.deck[0].uuid;
  const messages = applyRoundEndItems(state, { random: () => 0 });
  assert.equal(state.deck[0].id, "A004");
  assert.equal(state.deck[0].uuid, firstUuid);
  assert.match(messages[0], /魔法帽/);
});

test("新增关键字、负牌面与商店折扣道具按不同资源轴生效", () => {
  const state = readyState();
  const engine = createRoundEngine();
  addItem(state, "IT107");
  addItem(state, "IT112");
  addItem(state, "IT113");
  assert.equal(engine.recordAction(state, "eat", instance("D001", "adjacent-keyword")).points, 3);
  engine.recordAction(state, "eat", instance("F006", "negative-side"));
  assert.equal(state.round.pending_gold_bonus, 1);
  const shop = createShopService({ random: () => 0.5, create_id: ids });
  assert.ok(shop.getShopCards(state).every((card) => card.shop_price === Math.max(1, RARITY_PRICE[card.rarity] - 1)));
});

test("规则池至少 40 条且同一局抽取绝不重复", () => {
  const state = readyState();
  assert.equal(RULE_LIBRARY.length, 74);
  assert.equal(new Set(RULE_LIBRARY.map((rule) => rule.id)).size, RULE_LIBRARY.length);
  const owned = RULE_LIBRARY.slice(0, 15);
  const draft = randomDraftRules(3, owned, () => 0, state.deck);
  assert.equal(draft.length, 3);
  assert.ok(draft.every((rule) => !owned.some((item) => item.id === rule.id)));
});

test("新增摧毁、生成、成长、类别和关键字规则均可独立判定", () => {
  const state = readyState();
  const engine = createRoundEngine();
  state.round.destroyed_count = 1;
  state.round.generated_count = 1;
  state.round.grown_count = 1;
  state.round.actions = [
    { type: "水果", points: -1, keywords: ["生成"] },
    { type: "动物", points: 2, keywords: ["摧毁"] },
    { type: "星体", points: 3, keywords: ["相邻"] },
  ];
  state.active_rules = [
    { id: "destroy", name: "", description: "", scope: "min_destroyed", count: 1 },
    { id: "generate", name: "", description: "", scope: "min_generated", count: 1 },
    { id: "grow", name: "", description: "", scope: "min_grown", count: 1 },
    { id: "types", name: "", description: "", scope: "exact_unique_action_types", count: 3 },
    { id: "sequence", name: "", description: "", scope: "no_consecutive_type" },
    { id: "keyword", name: "", description: "", scope: "min_keyword_actions", keyword: "摧毁", count: 1 },
    { id: "opening", name: "", description: "", scope: "first_action_negative" },
    { id: "ending", name: "", description: "", scope: "last_action_positive" },
  ];
  assert.ok(engine.finalizeRound(state).rule_results.every((entry) => entry.achieved));
});

test("初始牌组不会抽到当前无法完成的类别连击", () => {
  const state = readyState();
  const fastfoodRhythm = RULE_LIBRARY.find((rule) => rule.id === "fastfood-rhythm");
  const dessertRhythm = RULE_LIBRARY.find((rule) => rule.id === "dessert-rhythm");
  assert.equal(isRuleEligible(fastfoodRhythm, state.deck), false);
  assert.equal(isRuleEligible(dessertRhythm, state.deck), false);
});

test("任务仅在第 3 / 6 / 9 / 12 轮出现，三选一且不会重复", () => {
  assert.equal(QUEST_LIBRARY.length, 12);
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

test("任务风险即时生效，达成后奖励在下一轮开始时生效且不可重复领取", () => {
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
  assert.equal(state.items.some((entry) => entry.id === "IT002"), false);
  assert.equal(state.pending_rewards.some((entry) => entry.item_id === "IT002" && entry.effective_round === 4), true);
  assert.equal(finalizeQuest(state, result), null);
  assert.equal(state.quest_history.length, 1);
  state.current_round = 4;
  assert.deepEqual(activatePendingQuestRewards(state), ["回收钱包"]);
  assert.equal(state.items.some((entry) => entry.id === "IT002"), true);
});

test("摧毁任务完成后将拆解徽记排入下一轮奖励", () => {
  const state = readyState();
  state.current_round = 6;
  selectQuest(state, QUEST_LIBRARY.find((entry) => entry.id === "QST09"), ids);
  state.round.destroyed_count = 2;
  const result = { round_score: 0 };
  const questResult = finalizeQuest(state, result);
  assert.equal(questResult.completed, true);
  assert.ok(state.pending_rewards.some((entry) => entry.item_id === "IT009" && entry.effective_round === 7));
});

test("任务按行动施加明确惩罚，永久虚空牌吃弃都为负分", () => {
  const state = readyState();
  const engine = createRoundEngine();
  state.current_round = 3;
  const discardQuest = QUEST_LIBRARY.find((entry) => entry.id === "QST02");
  selectQuest(state, discardQuest, ids);
  applyQuestRoundPenalty(state);
  assert.equal(engine.recordAction(state, "discard", instance("A001", "taxed")).points, 0);

  const voidState = readyState();
  voidState.current_round = 3;
  const voidQuest = QUEST_LIBRARY.find((entry) => entry.id === "QST03");
  selectQuest(voidState, voidQuest, ids);
  const voidCard = voidState.deck.find((card) => card.id === "Q001");
  assert.equal(engine.recordAction(voidState, "eat", voidCard).points, -1);
  assert.equal(engine.recordAction(voidState, "discard", { ...voidCard, uuid: `${voidCard.uuid}-discard` }).points, -1);
});

test("重启按钮与优惠打印机在每轮初始化为小牌组重洗和免费刷新", () => {
  const state = readyState();
  assert.equal(ITEM_LIBRARY.length, 26);
  assert.equal(createShopItemPool().length, 14);
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
    Object.assign(state.round, takeRoundDrawPile(
      state.deck.map((card) => ({ ...card, effect: card.effect ? { ...card.effect } : null })),
      state.plate_capacity,
    ));
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
