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

test("当前卡池为 57 张并保持可继续扩展的八类结构", () => {
  const cards = createShopCardPool();
  assert.equal(cards.length, 57);
  assert.deepEqual(Object.fromEntries([...new Set(cards.map((card) => card.type))].map((type) => [type, cards.filter((card) => card.type === type).length])), {
    水果: 9, 快餐: 8, 甜点: 7, 饮料: 8, 动物: 8, 星体: 7, 人物: 6, 通用: 4,
  });
  assert.equal(new Set(cards.map((card) => card.id)).size, 57);
});

test("所有卡牌有独立美术和原始牌面，六张基础教学牌无规则效果", async () => {
  const blankIds = [];
  for (const card of createShopCardPool()) {
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
  assert.deepEqual(blankIds, ["F001", "F009", "K001", "K008", "A001", "A008"]);
});

test("初始牌组为七张不同教学牌，四张可食用、三张不可食用", () => {
  const deck = createInitialDeck({ create_id: nextId });
  assert.equal(deck.length, 7);
  assert.deepEqual([...new Set(deck.map((card) => card.type))], ["水果", "快餐", "甜点", "动物"]);
  assert.equal(deck.filter((card) => card.edibility === "edible").length, 4);
  assert.equal(deck.filter((card) => card.edibility === "inedible").length, 3);
  assert.equal(deck.filter((card) => !card.effect).length, 3);
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

test("极端厌食吃下后摧毁自身", () => {
  const engine = createRoundEngine();
  const state = stateWith(["K005", "F001"]);
  engine.recordAction(state, "eat", state.round.draw_pile[0]);
  assert.equal(state.deck.some((card) => card.id === "K005"), false);
  assert.equal(state.round.destroyed_count, 1);
});

test("甜点弃置留存，达到阈值吃下翻倍并重置原始牌面", () => {
  const engine = createRoundEngine();
  const state = stateWith(["D001", "F001"]);
  const dessert = state.round.draw_pile[0];
  engine.recordAction(state, "discard", dessert);
  assert.equal(state.deck[0].eat_points, 4);
  state.deck[0].eat_points = 10;
  dessert.eat_points = 10;
  const burst = engine.recordAction(state, "eat", dessert);
  assert.equal(burst.points, 20);
  assert.equal(state.deck[0].eat_points, state.deck[0].base_eat_points);
});

test("经济牌用负分换即时金币，饮料摧毁自身并创建条件蓄势", () => {
  const engine = createRoundEngine();
  const economy = stateWith(["B007", "F001"]);
  const cashout = engine.recordAction(economy, "discard", economy.round.draw_pile[0]);
  assert.equal(cashout.points, -2);
  assert.equal(economy.gold, 2);
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

test("付费快餐扣金币，余额不足会将缺额转换成罚分", () => {
  const engine = createRoundEngine();
  const paid = stateWith(["K006", "F001"]);
  paid.gold = 2;
  const full = engine.recordAction(paid, "eat", paid.deck[0]);
  assert.equal(paid.gold, 0);
  assert.equal(full.points, 4);

  const short = stateWith(["K006", "F001"]);
  short.gold = 1;
  const missing = engine.recordAction(short, "eat", short.deck[0]);
  assert.equal(short.gold, 0);
  assert.equal(missing.points, 1);
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

test("后置奖励只在同一实体牌真正结算时触发", () => {
  const engine = createRoundEngine();
  const state = stateWith(["F001", "C004"]);
  const comet = state.round.draw_pile.at(-1);
  postponeCurrentCard(state);
  const entry = engine.recordAction(state, "discard", comet);
  assert.equal(entry.effect_bonus, 6);
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

test("水果连击与后置合约读取真实本轮状态", () => {
  const state = stateWith(["F001"]);
  state.round.best_fruit_combo = 4;
  state.round.postpone_count = 2;
  assert.equal(evaluateRule(state, RULE_LIBRARY.find((rule) => rule.id === "fruit-combo-three")), true);
  assert.equal(evaluateRule(state, RULE_LIBRARY.find((rule) => rule.id === "postpone-two")), true);
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

test("页面提供持续合约、后置、自动重洗、同类专柜和暖色点数样式", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  const main = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  assert.match(html, /id="postponeButton"/);
  assert.match(html, /id="shopThemeOfferList"/);
  assert.match(html, /200 \/ 700 \/ 1500/);
  assert.match(html, /12 秒内清空额外 \+1 金币/);
  assert.match(html, /未完成会跨轮保留/);
  assert.match(css, /\.card-point-wrap\.point-increased/);
  assert.match(css, /\.card-point-wrap\.point-decreased/);
  assert.match(css, /color: #fff8e8/);
  assert.match(css, /background: #b9a184/);
  assert.match(css, /\.game-card\.art-outlined/);
  assert.match(css, /\.effect-feed/);
  assert.match(css, /\.hard-eat-flash/);
  assert.match(main, /showHardEat/);
  assert.match(main, /自动重洗/);
  assert.doesNotMatch(html, /id="reshuffleButton"/);
});
