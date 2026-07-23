import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { GAME_CONFIG, isQuestRound } from "../js/config.js";
import { CARD_LIBRARY, createInitialDeck, createShopCardPool, getCardById } from "../js/data.js";
import { createRoundEngine, evaluateRule } from "../js/engine.js";
import { addItem, applyRoundItemSetup, createShopItemPool } from "../js/items.js";
import { KEYWORD_LIBRARY } from "../js/keywords.js";
import { postponeCurrentCard, takeRoundDrawPile } from "../js/plate.js";
import { activateReshuffle, getReshuffleStatus } from "../js/reshuffle.js";
import { RULE_LIBRARY, isRuleEligible, randomDraftRules } from "../js/rules.js";
import { createShopService } from "../js/shop.js";
import { GAME_PHASES, createInitialPlayerState, resetRoundState, transitionPhase } from "../js/state.js";

let uuidCounter = 0;
const nextId = (card) => `${card.id}-test-${uuidCounter += 1}`;

function owned(id, suffix = "owned") {
  const card = getCardById(id);
  return { ...card, synergy_tags: [...card.synergy_tags], effect: card.effect ? { ...card.effect } : null, uuid: `${id}-${suffix}-${uuidCounter += 1}` };
}

function stateWith(ids) {
  const state = createInitialPlayerState({ create_id: nextId });
  state.deck = ids.map((id, index) => owned(id, index));
  resetRoundState(state);
  state.round.draw_pile = state.deck.map((card) => ({ ...card, effect: card.effect ? { ...card.effect } : null }));
  state.round.action_budget = state.round.draw_pile.length;
  return state;
}

test("当前卡池为 89 张并保持可继续扩展的八类结构", () => {
  const cards = createShopCardPool();
  assert.equal(cards.length, 89);
  assert.deepEqual(Object.fromEntries([...new Set(cards.map((card) => card.type))].map((type) => [type, cards.filter((card) => card.type === type).length])), {
    水果: 13, 快餐: 12, 甜点: 11, 饮料: 12, 动物: 12, 星体: 11, 人物: 10, 通用: 8,
  });
  assert.equal(new Set(cards.map((card) => card.id)).size, 89);
});

test("89 张卡都有唯一、可加载的版本化美术引用，基础白板仍保留", async () => {
  const blankIds = [];
  const cards = createShopCardPool();
  for (const card of cards) {
    if (!card.effect) blankIds.push(card.id);
    else {
      assert.ok(card.effect.kind, card.id);
      assert.ok(card.effect.description.length > 0, card.id);
    }
    assert.equal(card.runtime_art_mode, "individual");
    assert.equal(card.base_eat_points, card.eat_points);
    assert.equal(card.base_discard_points, card.discard_points);
    await assert.doesNotReject(() => readFile(new URL(`../assets/${card.art_file}`, import.meta.url)));
  }
  assert.equal(new Set(cards.map((card) => card.art_file)).size, 89);
  assert.equal(cards.filter((card) => card.art_file.startsWith("cards/v017/")).length, 89);
  assert.equal(cards.filter((card) => card.art_file.startsWith("cards/legacy-v016/")).length, 0);
  assert.deepEqual(blankIds, ["F001", "K001", "A001"]);
});

test("初始牌组为七张不同教学牌，四张可食用、三张不可食用", () => {
  const deck = createInitialDeck({ create_id: nextId });
  assert.equal(deck.length, 7);
  assert.deepEqual([...new Set(deck.map((card) => card.type))], ["水果", "快餐", "甜点", "动物"]);
  assert.equal(deck.filter((card) => card.edibility === "edible").length, 4);
  assert.equal(deck.filter((card) => card.edibility === "inedible").length, 3);
  assert.equal(deck.filter((card) => !card.effect).length, 2);
  assert.equal(new Set(deck.map((card) => card.id)).size, 7);
  assert.equal(new Set(deck.map((card) => card.uuid)).size, 7);
  const fruits = deck.filter((card) => card.type === "水果");
  assert.equal(fruits.length, 2);
  assert.ok(fruits.every((card) => card.effect?.kind === "fruit_combo"));
});

test("橘猫符合不可食用基础模型，普通快餐吃点不超过二", () => {
  const cat = getCardById("A001");
  assert.equal(cat.eat_points, -1);
  assert.equal(cat.discard_points, 2);
  const fastFoods = createShopCardPool().filter((card) => card.type === "快餐");
  assert.ok(fastFoods.filter((card) => card.rarity === "普通").every((card) => card.eat_points <= 2));
  assert.ok(fastFoods.filter((card) => card.eat_points > 2).every((card) => card.rarity !== "普通" && card.effect));
});

test("关键字覆盖水果连击、厌食、硬吃、留存、弱化、后置与机制且移除消耗", () => {
  for (const keyword of ["水果连击", "厌食", "硬吃", "留存", "弱化", "后置", "机制", "摧毁", "生成", "净化"]) {
    assert.ok(KEYWORD_LIBRARY[keyword], keyword);
  }
  assert.equal(KEYWORD_LIBRARY["消耗"], undefined);
  assert.ok(Object.values(CARD_LIBRARY).filter((card) => card.effect).every((card) => card.effect.keywords.length > 0));
});

test("基础苹果不启动连击，连击水果会推进且非水果行动会中断", () => {
  const engine = createRoundEngine({ random: () => 0 });
  const state = stateWith(["F001", "F002", "F003", "A004"]);
  const blank = engine.recordAction(state, "eat", state.deck[0]);
  const first = engine.recordAction(state, "eat", state.deck[1]);
  const second = engine.recordAction(state, "eat", state.deck[2]);
  assert.equal(blank.fruit_combo, undefined);
  assert.equal(first.fruit_combo, 1);
  assert.equal(second.fruit_combo, 2);
  assert.ok(second.points > first.points);
  engine.recordAction(state, "discard", state.deck[3]);
  assert.equal(state.round.fruit_combo, 0);
  assert.equal(state.round.best_fruit_combo, 2);
});

test("草莓一次增加两层连击，水果生成牌会写入永久牌组", () => {
  const engine = createRoundEngine({ random: () => 0 });
  const state = stateWith(["F002", "F004", "F007"]);
  engine.recordAction(state, "eat", state.deck[0]);
  const strawberry = engine.recordAction(state, "eat", state.deck[1]);
  assert.equal(strawberry.fruit_combo, 3);
  const before = state.deck.length;
  const platter = engine.recordAction(state, "eat", state.deck[2]);
  assert.equal(state.deck.length, before + 1);
  assert.ok(platter.generated_card);
  assert.equal(state.deck.at(-1).weakened, true);
});

test("厌食在计分后永久降低吃分并提高弃分", () => {
  const engine = createRoundEngine();
  const state = stateWith(["K002", "F001"]);
  const fastFood = state.round.draw_pile[0];
  const entry = engine.recordAction(state, "eat", fastFood);
  assert.equal(entry.printed_points, 2);
  const permanent = state.deck.find((card) => card.uuid === fastFood.uuid);
  assert.equal(permanent.eat_points, 1);
  assert.equal(permanent.discard_points, 0);
});

test("发馊外卖保留厌食并在弃置时换取两金币", () => {
  const engine = createRoundEngine();
  const state = stateWith(["K005", "F001"]);
  const entry = engine.recordAction(state, "discard", state.round.draw_pile[0]);
  assert.equal(entry.points, -2);
  assert.equal(state.gold, 2);
  assert.equal(state.deck.some((card) => card.id === "K005"), true);
});

test("甜点弃置留存，达到阈值吃下翻倍并摧毁自身", () => {
  const engine = createRoundEngine();
  const state = stateWith(["D001", "F001"]);
  const dessert = state.round.draw_pile[0];
  engine.recordAction(state, "discard", dessert);
  assert.equal(state.deck[0].eat_points, 4);
  state.deck[0].eat_points = 10;
  dessert.eat_points = 10;
  const burst = engine.recordAction(state, "eat", dessert);
  assert.equal(burst.points, 20);
  assert.equal(state.deck.some((card) => card.uuid === dessert.uuid), false);
});

test("押金瓶以后置换取即时金币，饮料摧毁自身并创建条件蓄势", () => {
  const engine = createRoundEngine();
  const economy = stateWith(["B007", "F001"]);
  economy.round.draw_pile.reverse();
  const bottle = economy.round.draw_pile.at(-1);
  postponeCurrentCard(economy);
  engine.recordPostpone(economy, bottle);
  assert.equal(economy.gold, 2);
  assert.equal(economy.deck.find((card) => card.uuid === bottle.uuid).eat_points, -1);
  assert.equal(economy.deck.some((card) => card.id === "B007"), true);

  const delayed = stateWith(["B002", "F001", "K001"]);
  const soda = delayed.deck[0];
  const fruit = delayed.deck[1];
  const fastFoodCard = delayed.deck[2];
  engine.recordAction(delayed, "eat", soda);
  engine.recordAction(delayed, "eat", fruit);
  assert.equal(delayed.round.buffs.length, 1, "非快餐不会移除延迟效果");
  const fastFood = engine.recordAction(delayed, "eat", fastFoodCard);
  assert.equal(fastFood.points, 4);
  assert.equal(delayed.round.buffs.length, 0);
});

test("硬吃牌把错误食性从纯惩罚变为可规划收益", () => {
  const engine = createRoundEngine();
  const state = stateWith(["A001", "P006", "F001"]);
  const first = engine.recordAction(state, "eat", state.deck[0]);
  assert.equal(first.wrong_edibility, true);
  assert.equal(first.wrong_edibility_streak, 1);
  const challenger = engine.recordAction(state, "eat", state.deck[1]);
  assert.equal(challenger.wrong_edibility_streak, 2);
  assert.equal(challenger.points, 2);
  engine.recordAction(state, "eat", state.deck[2]);
  assert.equal(state.round.wrong_edibility_streak, 0);
  assert.equal(state.round.wrong_edibility_count, 2);
});

test("苦味补剂摧毁自身并把加成保留到下一次错误食性处理", () => {
  const engine = createRoundEngine();
  const state = stateWith(["B008", "A001", "F001"]);
  const setup = engine.recordAction(state, "discard", state.deck[0]);
  assert.equal(setup.destroyed_self, true);
  assert.equal(state.round.buffs.some((buff) => buff.kind === "wrong_edibility_flat"), true);
  const payoff = engine.recordAction(state, "eat", state.deck.find((card) => card.id === "A001"));
  assert.equal(payoff.points, 3);
  assert.equal(state.round.buffs.length, 0);
});

test("铁胃糖每轮只强化第一次错误食性处理", () => {
  const engine = createRoundEngine();
  const state = stateWith(["A001", "A008", "F001"]);
  assert.equal(addItem(state, "IT120"), true);
  const first = engine.recordAction(state, "eat", state.deck[0]);
  const second = engine.recordAction(state, "eat", state.deck[1]);
  assert.equal(first.item_bonus, 2);
  assert.equal(second.item_bonus, 0);
});

test("动物吞食上一张匹配卡，摧毁猎物并永久成长", () => {
  const engine = createRoundEngine();
  const state = stateWith(["F001", "A002", "U003"]);
  const fruit = state.deck[0];
  const animal = state.deck[1];
  engine.recordAction(state, "eat", fruit);
  engine.recordAction(state, "discard", animal);
  assert.equal(state.deck.some((card) => card.uuid === fruit.uuid), false);
  assert.equal(state.deck.find((card) => card.uuid === animal.uuid).discard_points, 3);
});

test("兔子按永久牌组中的兔子数量计算弃分奖励", () => {
  const engine = createRoundEngine();
  const state = stateWith(["A004", "A004", "A004"]);
  const entry = engine.recordAction(state, "discard", state.deck[0]);
  assert.equal(entry.points, 4);
});

test("星体直接改变剩余牌面、自动重洗和计时", () => {
  const engine = createRoundEngine();
  const moonState = stateWith(["F001", "A004", "C002"]);
  engine.recordAction(moonState, "discard", moonState.round.draw_pile.at(-1));
  assert.equal(moonState.round.draw_pile[0].eat_points, -1);
  assert.equal(moonState.round.draw_pile[0].discard_points, 1);

  const sunState = stateWith(["C003", "F001"]);
  engine.recordAction(sunState, "discard", sunState.deck[0]);
  assert.equal(sunState.round.reshuffle_charges, 1);
  assert.equal(sunState.deck.some((card) => card.id === "C003"), false);

  const plutoState = stateWith(["C006"]);
  engine.recordAction(plutoState, "discard", plutoState.deck[0]);
  assert.equal(plutoState.round.timer_paused, true);
});

test("净化只恢复红色降点并保留绿色成长", () => {
  const engine = createRoundEngine();
  const state = stateWith(["K002", "U001"]);
  state.deck[0].eat_points = 1;
  state.deck[0].discard_points = 3;
  engine.recordAction(state, "discard", state.deck[1]);
  assert.equal(state.deck[0].eat_points, state.deck[0].base_eat_points);
  assert.equal(state.deck[0].discard_points, 3);
});

test("弱化生成牌无论吃弃都会在结算后摧毁", () => {
  const engine = createRoundEngine({ random: () => 0 });
  const state = stateWith(["C001", "F001"]);
  engine.recordAction(state, "discard", state.deck[0]);
  const generated = state.deck.at(-1);
  assert.equal(generated.weakened, true);
  const entry = engine.recordAction(state, "eat", generated);
  assert.equal(entry.destroyed_self, true);
  assert.equal(state.deck.some((card) => card.uuid === generated.uuid), false);
});

test("收费炸鸡桶在吃弃之间转化吃分与金币", () => {
  const engine = createRoundEngine();
  const paid = stateWith(["K006", "F001"]);
  paid.gold = 2;
  const full = engine.recordAction(paid, "eat", paid.deck[0]);
  assert.equal(paid.gold, 1);
  assert.equal(full.points, 2);
  assert.equal(paid.deck[0].eat_points, 4);

  const short = stateWith(["K006", "F001"]);
  const discard = engine.recordAction(short, "discard", short.deck[0]);
  assert.equal(short.gold, 1);
  assert.equal(discard.points, -2);
  assert.equal(short.deck[0].eat_points, 0);
});

test("降点转移会制造红点并把实际降低值成长到自身", () => {
  const engine = createRoundEngine({ random: () => 0 });
  const state = stateWith(["F001", "F002", "U002"]);
  const juicer = state.deck[2];
  engine.recordAction(state, "discard", juicer);
  assert.equal(state.deck[0].eat_points, 0);
  assert.equal(state.deck[1].eat_points, 0);
  assert.equal(state.deck[2].discard_points, 4);
});

test("后置把当前牌移动到餐盘最后且不产生行动", () => {
  const state = stateWith(["F001", "K001", "C004"]);
  const current = state.round.draw_pile.at(-1);
  const result = postponeCurrentCard(state);
  assert.equal(result.success, true);
  assert.equal(state.round.draw_pile[0].uuid, current.uuid);
  assert.equal(state.round.actions.length, 0);
  assert.deepEqual(state.round.postponed_uuids, [current.uuid]);
  assert.equal(state.round.postpone_count, 1);
});

test("每张实体牌每轮只能后置一次且自动重洗不会清除标记", () => {
  const state = stateWith(["F001", "K001", "C004"]);
  const current = state.round.draw_pile.at(-1);
  assert.equal(postponeCurrentCard(state).success, true);
  state.round.draw_pile = [state.round.draw_pile[1], current];
  const second = postponeCurrentCard(state);
  assert.equal(second.success, false);
  assert.equal(second.reason, "already_postponed");
  assert.equal(state.round.postpone_count, 1);
});

test("送餐员后置时降低自身弃分并生成可食用弱化牌", () => {
  const engine = createRoundEngine({ random: () => 0 });
  const state = stateWith(["F001", "P007"]);
  const courier = state.round.draw_pile.at(-1);
  assert.equal(postponeCurrentCard(state).success, true);
  const result = engine.recordPostpone(state, courier);
  assert.equal(result.triggered, true);
  assert.equal(state.deck.find((card) => card.uuid === courier.uuid).discard_points, 0);
  const generated = state.deck.find((card) => card.generated_from === "P007");
  assert.equal(generated.edibility, "edible");
  assert.equal(generated.weakened, true);
});

test("理牌托盘让牌堆中两张已后置牌结算额外加一", () => {
  const engine = createRoundEngine();
  const state = stateWith(["F001", "A001", "U005"]);
  state.round.postponed_uuids = [state.deck[0].uuid, state.deck[1].uuid];
  engine.recordAction(state, "discard", state.deck[2]);
  assert.equal(engine.recordAction(state, "eat", state.deck[0]).effect_bonus, 1);
  assert.equal(engine.recordAction(state, "discard", state.deck[1]).effect_bonus, 1);
});

test("理毛猫弃置后摧毁自身并永久提高稀有牌商店权重", () => {
  const engine = createRoundEngine();
  const state = stateWith(["F001", "A009"]);
  const entry = engine.recordAction(state, "discard", state.deck[1]);
  assert.equal(entry.destroyed_self, true);
  assert.equal(state.rare_shop_weight_bonus, 0.25);
});

test("糖渍梅每轮一次从已中断的最高水果连击恢复", () => {
  const engine = createRoundEngine();
  const state = stateWith(["F002", "A001", "F010"]);
  engine.recordAction(state, "eat", state.deck[0]);
  engine.recordAction(state, "discard", state.deck[1]);
  const plum = engine.recordAction(state, "eat", state.deck[2]);
  assert.equal(plum.fruit_combo, 2);
  assert.match(plum.effect_triggered, /恢复/);
});

test("药草茶让本轮所有行动都不再打断水果连击", () => {
  const engine = createRoundEngine();
  const state = stateWith(["F002", "B009", "A001", "K001"]);
  engine.recordAction(state, "eat", state.deck[0]);
  engine.recordAction(state, "eat", state.deck[1]);
  assert.equal(state.deck.some((card) => card.id === "B009"), false);
  state.round.fruit_combo = 2;
  engine.recordAction(state, "discard", state.deck.find((card) => card.id === "A001"));
  assert.equal(state.round.fruit_combo, 2);
  engine.recordAction(state, "eat", state.deck.find((card) => card.id === "K001"));
  assert.equal(state.round.fruit_combo, 2);
});

test("风干柿子追溯已吃水果，融化圣代后置时摧毁并强化下一张", () => {
  const engine = createRoundEngine();
  const history = stateWith(["F002", "F003", "F011"]);
  engine.recordAction(history, "eat", history.deck[0]);
  engine.recordAction(history, "eat", history.deck[1]);
  assert.equal(engine.recordAction(history, "eat", history.deck[2]).effect_bonus, 2);

  const sundae = stateWith(["F001", "D008"]);
  const card = sundae.round.draw_pile.at(-1);
  postponeCurrentCard(sundae);
  engine.recordPostpone(sundae, card);
  assert.equal(sundae.deck.some((ownedCard) => ownedCard.uuid === card.uuid), false);
  assert.equal(sundae.deck[0].eat_points, 3);
});

test("石榴生成两张无效果弱化苹果，灯笼果直接获得金币", () => {
  const engine = createRoundEngine({ random: () => 0 });
  const state = stateWith(["F001", "A001", "F013", "F012"]);
  const pomegranate = engine.recordAction(state, "eat", state.deck[3]);
  assert.equal(state.deck.some((card) => card.id === "F012"), false);
  const generated = state.deck.filter((card) => card.generated_from === "F012");
  assert.equal(generated.length, 2);
  assert.ok(generated.every((card) => card.weakened && !card.effect));
  assert.match(pomegranate.effect_triggered, /生成 2 张/);

  engine.recordAction(state, "eat", state.deck.find((card) => card.id === "F013"));
  assert.equal(state.gold, 1);
});

test("双倍厌食、隔夜餐盒和打包袋读取新的后置与降点规则", () => {
  const engine = createRoundEngine();
  const doubled = stateWith(["K002", "K008"]);
  engine.recordAction(doubled, "eat", doubled.deck[1]);
  engine.recordAction(doubled, "eat", doubled.deck[0]);
  assert.equal(doubled.deck[0].eat_points, 0);
  assert.equal(doubled.deck[0].discard_points, 1);

  const boxState = stateWith(["K002", "K012", "K011"]);
  const box = boxState.round.draw_pile.at(-1);
  postponeCurrentCard(boxState);
  engine.recordPostpone(boxState, box);
  assert.equal(boxState.deck.find((card) => card.uuid === box.uuid).eat_points, -1);
  assert.equal(boxState.round.postponed_uuids.length, 3);
  engine.recordAction(boxState, "eat", boxState.deck[0]);
  assert.equal(engine.recordAction(boxState, "discard", boxState.deck[1]).effect_bonus, 3);
});

test("保温灯餐台用牌堆快餐触发全局厌食，弃置按双正牌数量计分", () => {
  const engine = createRoundEngine({ random: () => 0 });
  const eatState = stateWith(["K002", "K003", "P001", "K010"]);
  const lamp = eatState.round.draw_pile.at(-1);
  const result = engine.recordAction(eatState, "eat", lamp);
  assert.equal(result.points, 0);
  assert.deepEqual(
    eatState.deck.filter((card) => card.type === "快餐").map((card) => [card.id, card.eat_points, card.discard_points]),
    [["K002", 1, 0], ["K003", 4, 0], ["K010", -1, 1]],
  );

  const discardState = stateWith(["F001", "A004", "K001", "K010"]);
  Object.assign(discardState.round.draw_pile[0], { eat_points: 2, discard_points: 1 });
  Object.assign(discardState.round.draw_pile[1], { eat_points: 3, discard_points: 2 });
  Object.assign(discardState.round.draw_pile[2], { eat_points: 2, discard_points: -1 });
  const discard = engine.recordAction(discardState, "discard", discardState.round.draw_pile.at(-1));
  assert.equal(discard.printed_points, 0);
  assert.equal(discard.effect_bonus, 2);
  assert.equal(discard.points, 2);
});

test("裱花袋匹配牌堆最高吃分，展示蛋糕和幸运饼干读取牌堆", () => {
  const engine = createRoundEngine();
  const frosting = stateWith(["K003", "D009"]);
  const bag = frosting.round.draw_pile.at(-1);
  postponeCurrentCard(frosting);
  engine.recordPostpone(frosting, bag);
  assert.equal(frosting.deck.find((card) => card.uuid === bag.uuid).eat_points, 5);

  const state = stateWith(["D001", "D004", "D010"]);
  const display = engine.recordAction(state, "eat", state.deck[2]);
  assert.equal(display.effect_bonus, 2);
  const cookieState = stateWith(["D001", "D011"]);
  const cookie = engine.recordAction(cookieState, "eat", cookieState.deck[1]);
  assert.equal(cookie.effect_bonus, 3);
});

test("续杯马克杯跨轮储存，浓缩咖啡奖励慢速完成，珍珠奶茶复制牌堆甜点", () => {
  const engine = createRoundEngine();
  const mugState = stateWith(["B010"]);
  engine.recordAction(mugState, "eat", mugState.deck[0]);
  engine.recordAction(mugState, "eat", mugState.deck[0]);
  const cashout = engine.recordAction(mugState, "discard", mugState.deck[0]);
  assert.equal(cashout.effect_bonus, 4);
  assert.equal(mugState.deck[0].stored_charges, 0);

  const speedState = stateWith(["F001", "B011"]);
  engine.recordAction(speedState, "eat", speedState.deck[1]);
  speedState.round.elapsed_ms = 31000;
  engine.finalizeRound(speedState);
  assert.equal(speedState.gold, 2);

  const copyState = stateWith(["D001", "A001", "B012"]);
  copyState.deck[0].eat_points = 6;
  copyState.round.draw_pile[0].eat_points = 6;
  engine.recordAction(copyState, "eat", copyState.deck[2]);
  const copy = copyState.deck.find((card) => card.generated_from === "B012");
  assert.equal(copy.eat_points, 6);
  assert.equal(copy.effect, null);
  assert.equal(copy.weakened, true);
});

test("饕餮摧毁下一张，蜕皮蛇降低牌堆食物，牧羊犬与喜鹊提供后置经济", () => {
  const engine = createRoundEngine({ random: () => 0 });
  const devour = stateWith(["F001", "A005"]);
  engine.recordAction(devour, "discard", devour.deck[1]);
  assert.equal(devour.deck.some((card) => card.id === "F001"), false);
  assert.equal(devour.deck[0].discard_points, 4);

  const snake = stateWith(["F001", "K001", "A006"]);
  engine.recordAction(snake, "discard", snake.deck[2]);
  assert.equal(snake.deck[0].eat_points, 0);
  assert.equal(snake.deck[1].eat_points, 1);
  assert.equal(snake.deck[2].discard_points, 4);

  const shepherd = stateWith(["A001", "A010"]);
  const shepherdCard = shepherd.round.draw_pile.at(-1);
  postponeCurrentCard(shepherd);
  engine.recordPostpone(shepherd, shepherdCard);
  assert.equal(shepherd.deck[0].discard_points, 3);
  assert.ok(shepherd.round.postponed_uuids.includes(shepherd.deck[0].uuid));

  const magpie = stateWith(["F001", "A011"]);
  magpie.gold = 1;
  engine.recordAction(magpie, "discard", magpie.deck[1]);
  assert.equal(magpie.gold, 0);
  assert.equal(magpie.round.shop_free_rerolls, 1);
});

test("引力井延缓目标，潮汐月强化已后置牌，超新星摧毁标记牌，星云遮蔽计分", () => {
  const engine = createRoundEngine();
  const gravity = stateWith(["F001", "C008"]);
  gravity.current_round = 4;
  const well = engine.recordAction(gravity, "discard", gravity.deck[1]);
  assert.equal(well.destroyed_self, true);
  assert.equal(gravity.milestone_delays[5], 1);

  const tide = stateWith(["F001", "A001", "C009"]);
  tide.round.postponed_uuids = [tide.deck[0].uuid];
  engine.recordAction(tide, "discard", tide.deck[2]);
  assert.equal(engine.recordAction(tide, "eat", tide.deck[0]).effect_bonus, 2);

  const nova = stateWith(["F001", "A001", "C010"]);
  nova.round.postponed_uuids = [nova.deck[1].uuid];
  engine.recordAction(nova, "discard", nova.deck[2]);
  assert.equal(nova.deck.some((card) => card.id === "A001"), false);

  const nebula = stateWith(["F001", "A001", "C011"]);
  const cloud = nebula.round.draw_pile.at(-1);
  postponeCurrentCard(nebula);
  engine.recordPostpone(nebula, cloud);
  assert.equal(nebula.round.hidden_postponed_uuids.length, 2);
  engine.recordAction(nebula, "discard", nebula.deck[1]);
  engine.recordAction(nebula, "eat", nebula.deck[0]);
  const wager = engine.recordAction(nebula, "discard", nebula.deck[2]);
  assert.equal(wager.effect_bonus, 2);
});

test("拍卖师与策展人读取牌库和牌堆类别，美食评论家点评下一次出牌", () => {
  const engine = createRoundEngine();
  const state = stateWith(["P008", "P009", "P010", "F001", "A001"]);
  assert.equal(engine.recordAction(state, "discard", state.deck[0]).effect_bonus, 3);
  const curator = stateWith(["F001", "A001", "P009"]);
  assert.equal(engine.recordAction(curator, "discard", curator.deck[2]).effect_bonus, 2);
  engine.recordAction(state, "discard", state.deck[2]);
  const correct = engine.recordAction(state, "eat", state.deck[3]);
  assert.equal(correct.effect_bonus, 3);

  const wrongState = stateWith(["F001", "P010"]);
  engine.recordAction(wrongState, "discard", wrongState.deck[1]);
  engine.recordAction(wrongState, "discard", wrongState.deck[0]);
  assert.equal(wrongState.gold, 2);
  assert.equal(wrongState.deck[1].discard_points, 1);
});

test("通用牌支持无限水果转移、后置硬吃、商店定价、免费删除与防降点", () => {
  const engine = createRoundEngine();
  const juicer = stateWith(["F001", "F002", "F003", "F004", "F005", "U002"]);
  engine.recordAction(juicer, "discard", juicer.deck[5]);
  assert.equal(juicer.deck[5].discard_points, 7);

  const badge = stateWith(["A001", "U004"]);
  const badgeCard = badge.round.draw_pile.at(-1);
  postponeCurrentCard(badge);
  engine.recordPostpone(badge, badgeCard);
  const hardEat = engine.recordAction(badge, "eat", badge.deck[0]);
  assert.equal(hardEat.wrong_edibility, true);
  assert.equal(hardEat.effect_bonus, 3);

  const shop = createShopService({ random: () => 0, create_id: (card) => `${card.id}-bought` });
  const tools = stateWith(["F001", "U006"]);
  engine.recordAction(tools, "discard", tools.deck[1]);
  const offers = shop.repriceShopCards(tools, [getCardById("F008"), getCardById("F001")]);
  const forced = shop.applyOpeningPriceOverride(tools, [offers]);
  assert.equal(forced.shop_price, 4);

  const voucher = stateWith(["F001", "K001", "U007"]);
  engine.recordAction(voucher, "discard", voucher.deck[2]);
  assert.equal(voucher.round.shop_free_removals, 1);
  assert.equal(shop.removeCard(voucher, voucher.deck[0].uuid), true);
  assert.equal(voucher.gold, 0);

  const film = stateWith(["K002", "U008"]);
  engine.recordAction(film, "discard", film.deck[1]);
  engine.recordAction(film, "eat", film.deck[0]);
  assert.equal(film.deck[0].eat_points, 2);
  assert.equal(film.deck[0].discard_points, 0);
});

test("彗星后置时标记剩余牌并永久成长自身弃分", () => {
  const engine = createRoundEngine();
  const state = stateWith(["F001", "C004"]);
  const comet = state.round.draw_pile.at(-1);
  postponeCurrentCard(state);
  engine.recordPostpone(state, comet);
  assert.equal(state.deck.find((card) => card.uuid === comet.uuid).discard_points, 3);
  assert.ok(state.round.postponed_uuids.includes(state.deck[0].uuid));
});

test("高风险快餐按新数值支付资源并触发后置成长与限时金币", () => {
  const engine = createRoundEngine();
  assert.equal(getCardById("K003").eat_points, 5);

  const wings = stateWith(["F001", "K007"]);
  const wingCard = wings.round.draw_pile.at(-1);
  postponeCurrentCard(wings);
  engine.recordPostpone(wings, wingCard);
  assert.equal(wings.deck[0].eat_points, 0);
  assert.equal(wings.deck[1].eat_points, 5);

  const meal = stateWith(["F001", "K009"]);
  meal.round.live_elapsed_ms = 7900;
  engine.recordAction(meal, "eat", meal.deck[1]);
  assert.equal(meal.gold, 3);
});

test("甜点的 8/10/12 点爆发分别发放资源并摧毁实体牌", () => {
  const engine = createRoundEngine();
  for (const [id, threshold, expectedPoints] of [["D005", 8, 16], ["D006", 12, 36], ["D007", 10, 20]]) {
    const state = stateWith(["F001", id]);
    state.deck[1].eat_points = threshold;
    state.round.draw_pile[1].eat_points = threshold;
    const entry = engine.recordAction(state, "eat", state.round.draw_pile[1]);
    assert.equal(entry.points, expectedPoints, id);
    assert.equal(state.deck.some((card) => card.id === id), false, id);
    if (id === "D005") assert.equal(state.gold, 3);
    if (id === "D007") assert.equal(state.round.shop_discount, 3);
  }
});

test("乌龟低分反击、预购券双模式与目标延缓都按当前轮状态结算", () => {
  const engine = createRoundEngine();
  const turtle = stateWith(["F001", "A008"]);
  turtle.deck[1].discard_points = -5;
  turtle.round.draw_pile[1].discard_points = -5;
  assert.equal(engine.recordAction(turtle, "discard", turtle.round.draw_pile[1]).points, 15);

  const voucher = stateWith(["F001", "U007"]);
  engine.recordAction(voucher, "eat", voucher.deck[1]);
  assert.equal(voucher.round.shop_free_rerolls, 1);
  assert.equal(voucher.deck.some((card) => card.id === "U007"), true);

  const delayed = stateWith(["F001", "C008"]);
  delayed.current_round = 4;
  engine.recordAction(delayed, "discard", delayed.deck[1]);
  delayed.current_round = 5;
  assert.equal(engine.levelProgressCheck(delayed).target, 0);
  delayed.current_round = 6;
  assert.equal(engine.levelProgressCheck(delayed).target, GAME_CONFIG.milestone_targets[5]);
});

test("餐盘只抽取容量内卡牌并记录未登场类别", () => {
  const deck = stateWith(["F001", "F002", "K001", "D001", "A001"]).deck;
  const plate = takeRoundDrawPile(deck, 3);
  assert.equal(plate.draw_pile.length, 3);
  assert.equal(plate.reserve_count, 2);
  assert.equal(Object.values(plate.reserve_type_counts).reduce((sum, count) => sum + count, 0), 2);
});

test("重洗次数可叠加且每次把仍存在的已处理牌洗回", () => {
  const state = stateWith(["F001", "F002"]);
  state.round.draw_pile = [];
  state.round.spent_pile = state.deck.map((card) => ({ ...card }));
  state.round.reshuffle_charges = 2;
  assert.equal(getReshuffleStatus(state).can_use, true);
  const first = activateReshuffle(state, (cards) => cards);
  assert.equal(first.success, true);
  assert.equal(first.remaining_charges, 1);
  state.round.spent_pile = state.round.draw_pile.splice(0);
  const second = activateReshuffle(state, (cards) => cards);
  assert.equal(second.success, true);
  assert.equal(second.remaining_charges, 0);
});

test("合约池只有条件与金币奖励，不包含倍率或加点规则", () => {
  assert.equal(RULE_LIBRARY.length, 26);
  for (const rule of RULE_LIBRARY) {
    assert.ok(rule.gold_reward > 0, rule.id);
    assert.equal(rule.multiplier, undefined, rule.id);
    assert.notEqual(rule.scope, "flat_bonus", rule.id);
  }
});

test("合约草案会过滤当前牌组无法完成的类型目标", () => {
  const deck = [owned("A004"), owned("A001")];
  const options = randomDraftRules(3, [], () => 0, deck, 1);
  assert.equal(options.length, 3);
  assert.ok(options.every((rule) => !rule.target_type || deck.some((card) => card.type === rule.target_type)));
});

test("水果连击与后置联动合约读取真实本轮状态", () => {
  const state = stateWith(["F001"]);
  state.round.best_fruit_combo = 4;
  state.round.postpone_effect_triggers = 2;
  assert.equal(evaluateRule(state, RULE_LIBRARY.find((rule) => rule.id === "fruit-combo-three")), true);
  assert.equal(evaluateRule(state, RULE_LIBRARY.find((rule) => rule.id === "postpone-effect-two")), true);
  assert.equal(RULE_LIBRARY.some((rule) => ["postpone-two", "postpone-five"].includes(rule.id)), false);
});

test("兔子与动物管理员的规模收益都存在硬上限", () => {
  const engine = createRoundEngine();
  const rabbits = stateWith(Array.from({ length: 15 }, () => "A004"));
  assert.equal(engine.recordAction(rabbits, "discard", rabbits.deck[0]).effect_bonus, 12);

  const keeper = stateWith(["A001", "A001", "A001", "A001", "A001", "P003"]);
  keeper.deck.slice(0, 5).forEach((card) => engine.recordAction(keeper, "discard", card));
  assert.equal(engine.recordAction(keeper, "discard", keeper.deck[5]).effect_bonus, 8);
});

test("硬吃合约读取本轮错误食性次数", () => {
  const state = stateWith(["A001"]);
  state.round.wrong_edibility_count = 2;
  assert.equal(evaluateRule(state, RULE_LIBRARY.find((rule) => rule.id === "hard-eat-two")), true);
  assert.equal(evaluateRule(state, RULE_LIBRARY.find((rule) => rule.id === "hard-eat-four")), false);
});

test("完成持续合约后奖励金币、标记完成并从当前合约移除", () => {
  const engine = createRoundEngine();
  const state = stateWith(["F001"]);
  state.active_rules = [{ ...RULE_LIBRARY.find((rule) => rule.id === "eat-four"), count: 1 }];
  state.rule_history = [{ id: "eat-four", name: "四口开胃", selected_round: 1, completed: false, completed_round: null }];
  state.round.elapsed_ms = 7000;
  engine.recordAction(state, "eat", state.deck[0]);
  const result = engine.finalizeRound(state);
  assert.equal(result.rule_results[0].achieved, true);
  assert.equal(state.round.contract_gold_reward, 2);
  assert.equal(state.round.speed_gold_reward, 2);
  assert.equal(state.gold, 4);
  assert.equal(result.total_multiplier, 1);
  assert.deepEqual(state.active_rules, []);
  assert.equal(state.rule_history[0].completed, true);
  assert.equal(state.rule_history[0].completed_round, 1);
  assert.deepEqual(result.completed_rule_ids, ["eat-four"]);
});

test("未完成合约不扣款并跨轮保留等待再次尝试", () => {
  const engine = createRoundEngine();
  const state = stateWith(["F001"]);
  state.active_rules = [RULE_LIBRARY.find((rule) => rule.id === "discard-four")];
  state.round.elapsed_ms = 12001;
  engine.recordAction(state, "eat", state.deck[0]);
  engine.finalizeRound(state);
  assert.equal(state.round.speed_gold_reward, 0);
  assert.equal(state.round.contract_gold_reward, 0);
  assert.equal(state.gold, 0);
  assert.equal(state.active_rules.length, 1);
  assert.equal(state.active_rules[0].id, "discard-four");
});

test("第一轮合约池过滤七张牌不可能完成的水果与成长要求", () => {
  const deck = createInitialDeck({ create_id: nextId });
  assert.equal(isRuleEligible(RULE_LIBRARY.find((rule) => rule.id === "fruit-combo-three"), deck, 1), false);
  assert.equal(isRuleEligible(RULE_LIBRARY.find((rule) => rule.id === "grow-two"), deck, 1), false);
});

test("旧危险任务轮已停用", () => {
  assert.equal(GAME_CONFIG.last_quest_round, 0);
  for (let round = 1; round <= GAME_CONFIG.total_rounds; round += 1) assert.equal(isQuestRound(round), false);
});

test("商店同时提供三张随机卡与三张相同类别卡", () => {
  const state = stateWith(["F001", "F002", "K001"]);
  state.current_round = 5;
  const service = createShopService({ random: () => 0.2, create_id: nextId });
  const randomOffers = service.getShopCards(state);
  const themed = service.getThemedShopCards(state);
  assert.equal(randomOffers.length, 3);
  assert.equal(themed.cards.length, 3);
  assert.equal(new Set(themed.cards.map((card) => card.type)).size, 1);
  assert.equal(themed.cards[0].type, themed.type);
});

test("刷新价格按 2、3、4 递增且返回双卡牌货架与两件道具", () => {
  const state = stateWith(["F001"]);
  state.current_round = 5;
  state.gold = 20;
  const service = createShopService({ random: () => 0.1, create_id: nextId });
  assert.equal(service.getRerollCost(state), 2);
  const first = service.rerollShop(state);
  assert.equal(first.success, true);
  assert.equal(first.cards.length, 3);
  assert.equal(first.themed_cards.length, 3);
  assert.equal(first.items.length, 2);
  assert.equal(service.getRerollCost(state), 3);
  service.rerollShop(state);
  assert.equal(service.getRerollCost(state), 4);
});

test("商店道具池为 24 件，弱道具便宜且重洗道具为后期高价投资", () => {
  const items = createShopItemPool();
  assert.equal(items.length, 24);
  for (const kind of [
    "fruit_combo_bonus", "anorexia_discard_bonus", "retention_growth_bonus", "drink_first_gold",
    "devour_growth_bonus", "first_type_bonus", "first_type_gold", "postponed_card_bonus",
    "round_reshuffle_charge", "plate_upgrade_discount", "wrong_edibility_first_bonus",
  ]) assert.ok(items.some((item) => item.effect.kind === kind), kind);
  assert.ok(items.some((item) => item.effect.kind === "round_generate_weakened"));
  assert.ok(items.find((item) => item.effect.kind === "round_reshuffle_charge").shop_price >= 20);
  assert.ok(items.filter((item) => item.shop_price <= 4).length >= 6);
});

test("纸果篮每轮至多维持一张弱化苹果并会进入本轮洗牌", () => {
  const state = stateWith(["F001"]);
  assert.equal(addItem(state, "IT117"), true);
  applyRoundItemSetup(state);
  applyRoundItemSetup(state);
  const generated = state.deck.filter((card) => card.generated_from === "item:IT117");
  assert.equal(generated.length, 1);
  assert.equal(generated[0].weakened, true);
});

test("商店牌价上调，基础白板更便宜且优惠券只减一元", () => {
  const state = stateWith(["F001", "U003"]);
  state.current_round = 5;
  const service = createShopService({ random: () => 0, create_id: nextId });
  const [apple] = service.repriceShopCards(state, [getCardById("F001")]);
  assert.equal(apple.shop_base_price, 3);
  const engine = createRoundEngine();
  engine.recordAction(state, "discard", state.deck[1]);
  const [discounted] = service.repriceShopCards(state, [getCardById("F001")]);
  assert.equal(discounted.shop_discount, 1);
  assert.equal(discounted.shop_price, 2);
});

test("状态机仍拒绝越级流转", () => {
  const state = createInitialPlayerState({ create_id: nextId });
  assert.throws(() => transitionPhase(state, GAME_PHASES.SHOP));
  transitionPhase(state, GAME_PHASES.RULE_DRAFT);
  transitionPhase(state, GAME_PHASES.PLAYING);
  assert.equal(state.phase, GAME_PHASES.PLAYING);
});

test("页面提供持续合约、故事教学、后置、自动重洗、同类专柜和暖色点数样式", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  const main = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const brief = await readFile(new URL("../docs/CARDEATER_ENGLISH_RULES_AND_FABLE5_BRIEF.md", import.meta.url), "utf8");
  assert.match(html, /id="postponeButton"/);
  assert.match(html, /每轮每张牌限一次/);
  assert.match(html, /id="shopThemeOfferList"/);
  assert.match(html, /100 \/ 300 \/ 500/);
  assert.match(html, /12 秒内清空额外 \+1 金币/);
  assert.match(html, /未完成会跨轮保留/);
  assert.match(html, /id="storyGuide"/);
  assert.match(html, /id="tutorialInfoButton"/);
  assert.match(css, /\.card-point-wrap\.point-increased/);
  assert.match(css, /\.card-point-wrap\.point-decreased/);
  assert.match(css, /color: #fff8e8/);
  assert.match(css, /background: #b9a184/);
  assert.match(css, /\.game-card\.art-outlined/);
  assert.match(css, /\.card-postpone-mark/);
  assert.match(css, /\.effect-feed/);
  assert.match(css, /\.hard-eat-flash/);
  assert.match(css, /\.card-art \.game-sprite[\s\S]*height: min\(calc\(100% - 10px\), 150px\)/);
  assert.match(main, /showHardEat/);
  assert.match(main, /自动重洗/);
  assert.match(main, /startTutorial/);
  assert.match(main, /如果暂时不想处理这张牌，可以将它后置/);
  assert.match(main, /每轮每张牌只能后置一次哦/);
  assert.doesNotMatch(html, /id="reshuffleButton"/);
  assert.match(brief, /Prove or disprove that unlimited rotation/);
  assert.match(brief, /Design 32 candidate cards: exactly 4 for each/);
});
