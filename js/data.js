import { CARD_ROLES } from "./balance.js";
import { normalizeEffect } from "./keywords.js";

const EDIBLE = "edible";
const INEDIBLE = "inedible";
const { BASELINE, SETUP, PAYOFF, SACRIFICE, ENGINE, ECONOMY } = CARD_ROLES;

function card(definition) {
  const eatPoints = definition.eat_points;
  const discardPoints = definition.discard_points;
  return {
    synergy_tags: [],
    max_copies: definition.rarity === "传奇" ? 1 : definition.rarity === "稀有" ? 2 : 3,
    min_shop_round: definition.rarity === "传奇" ? 7 : definition.rarity === "稀有" ? 3 : 1,
    ...definition,
    base_eat_points: eatPoints,
    base_discard_points: discardPoints,
    effect: normalizeEffect(definition.effect),
    art_file: definition.art_file ?? `cards/${definition.id.toLowerCase()}.webp`,
    runtime_art_mode: "individual",
    runtime_atlas: null,
    runtime_columns: 1,
    runtime_rows: 1,
    runtime_x: 0,
    runtime_y: 0,
    sprite_hue: definition.sprite_hue ?? 0,
    sprite_scale: definition.sprite_scale ?? 1,
  };
}

// Expandable card pool. A few intentionally simple cards teach the base
// eat/discard model; build-facing effects enter gradually through the shop.
const CARD_DEFS = [
  // 水果 ×9：基础水果负责教学，其余水果围绕【水果连击】。
  card({ id: "F001", name: "苹果", flavor: "一颗普通的苹果。", rarity: "普通", type: "水果", edibility: EDIBLE, eat_points: 1, discard_points: -1, role: BASELINE, shop_price_adjustment: -2, synergy_tags: ["水果", "基础"], effect: null }),
  card({ id: "F002", name: "香蕉", rarity: "普通", type: "水果", edibility: EDIBLE, eat_points: 1, discard_points: -1, role: ENGINE, synergy_tags: ["水果", "连击", "生成"], effect: { kind: "fruit_combo", description: "吃：水果连击 +1；连击达到 3 时，本轮首次生成 1 张苹果", trigger_action: "eat", combo_gain: 1, bonus_per_combo: 1, max_bonus: 6, generate_at: 3, generate_card_id: "F001", once_per_round: true } }),
  card({ id: "F003", name: "西瓜", rarity: "普通", type: "水果", edibility: EDIBLE, eat_points: 2, discard_points: -1, role: PAYOFF, synergy_tags: ["水果", "连击", "收割"], effect: { kind: "fruit_combo", description: "吃：水果连击 +1；连击达到 3 时再额外 +3", trigger_action: "eat", combo_gain: 1, bonus_per_combo: 1, max_bonus: 6, threshold: 3, threshold_bonus: 3 } }),
  card({ id: "F004", name: "草莓", rarity: "罕见", type: "水果", edibility: EDIBLE, eat_points: 1, discard_points: -1, role: SETUP, synergy_tags: ["水果", "连击", "加速"], effect: { kind: "fruit_combo", description: "吃：水果连击 +2；本牌额外获得当前连击数的分数（最多 +8）", trigger_action: "eat", combo_gain: 2, bonus_per_combo: 1, max_bonus: 8 } }),
  card({ id: "F005", name: "金苹果", rarity: "稀有", type: "水果", edibility: EDIBLE, eat_points: 2, discard_points: -1, role: ENGINE, synergy_tags: ["水果", "连击", "成长"], effect: { kind: "fruit_combo", description: "吃：水果连击 +1；连击达到 4 时，自身吃分永久 +1", trigger_action: "eat", combo_gain: 1, bonus_per_combo: 1, max_bonus: 8, grow_at: 4, grow_amount: 1 } }),
  card({ id: "F006", name: "腐烂苹果", rarity: "罕见", type: "水果", edibility: EDIBLE, eat_points: -1, discard_points: -2, role: SACRIFICE, synergy_tags: ["水果", "连击", "牺牲"], effect: { kind: "fruit_combo", description: "吃：水果连击 +1；若连击前为 0，本牌额外 +4，否则按连击正常加分", trigger_action: "eat", combo_gain: 1, bonus_per_combo: 1, max_bonus: 6, opener_bonus: 4 } }),
  card({ id: "F007", name: "水果拼盘", rarity: "稀有", type: "水果", edibility: EDIBLE, eat_points: 2, discard_points: -1, role: ENGINE, synergy_tags: ["水果", "连击", "生成", "弱化"], effect: { kind: "fruit_combo", description: "吃：水果连击 +2；连击达到 4 时，本轮首次随机生成 1 张【弱化】水果", trigger_action: "eat", combo_gain: 2, bonus_per_combo: 1, max_bonus: 10, generate_at: 4, generate_random_type: "水果", generate_weakened: true, once_per_round: true } }),
  card({ id: "F008", name: "火龙果", rarity: "传奇", type: "水果", edibility: EDIBLE, eat_points: 3, discard_points: -2, role: PAYOFF, synergy_tags: ["水果", "连击", "爆发"], effect: { kind: "fruit_combo", description: "吃：水果连击 +1；连击达到 5 时，水果连击加分翻倍", trigger_action: "eat", combo_gain: 1, bonus_per_combo: 1, max_bonus: 12, double_at: 5 } }),
  card({ id: "F009", name: "梨", art_file: "cards/f009-v2.png", flavor: "清甜多汁，适合第一次下口。", rarity: "普通", type: "水果", edibility: EDIBLE, eat_points: 1, discard_points: -1, role: BASELINE, shop_price_adjustment: -2, synergy_tags: ["水果", "基础"], effect: null }),

  // 快餐 ×8：普通牌不超过吃 +2；更高点数必须附带稀有度或负面代价。
  card({ id: "K001", name: "汉堡", flavor: "最普通的汉堡，也比水果更顶饱。", rarity: "普通", type: "快餐", edibility: EDIBLE, eat_points: 2, discard_points: -1, role: BASELINE, shop_price_adjustment: -1, synergy_tags: ["快餐", "基础"], effect: null }),
  card({ id: "K002", name: "拉面", rarity: "普通", type: "快餐", edibility: EDIBLE, eat_points: 2, discard_points: -1, role: ENGINE, synergy_tags: ["快餐", "厌食", "转化"], effect: { kind: "anorexia", description: "吃后自身吃分永久 -1、弃分永久 +1", trigger_action: "eat", eat_loss: 1, discard_gain: 1 } }),
  card({ id: "K003", name: "薯条", rarity: "罕见", type: "快餐", edibility: EDIBLE, eat_points: 3, discard_points: -1, role: SACRIFICE, shop_price_adjustment: -1, synergy_tags: ["快餐", "厌食", "付费"], effect: { kind: "anorexia", description: "吃：支付 1 金币（不足时本次 -3 分）；随后吃分永久 -1、弃分永久 +1", trigger_action: "eat", eat_loss: 1, discard_gain: 1, eat_gold_cost: 1, unpaid_score_penalty: 3 } }),
  card({ id: "K004", name: "巨无霸", rarity: "稀有", type: "快餐", edibility: EDIBLE, eat_points: 4, discard_points: -2, role: SACRIFICE, synergy_tags: ["快餐", "厌食", "大牌"], effect: { kind: "anorexia", description: "吃后自身吃分永久 -2、弃分永久 +2", trigger_action: "eat", eat_loss: 2, discard_gain: 2 } }),
  card({ id: "K005", name: "发馊外卖", rarity: "罕见", type: "快餐", edibility: EDIBLE, eat_points: 3, discard_points: -2, role: SACRIFICE, shop_price_adjustment: -1, synergy_tags: ["快餐", "厌食", "摧毁"], effect: { kind: "anorexia", description: "吃下取得 3 分后摧毁自身", trigger_action: "eat", extreme: true } }),
  card({ id: "K006", name: "收费炸鸡桶", art_file: "cards/k006-v2.png", rarity: "罕见", type: "快餐", edibility: EDIBLE, eat_points: 4, discard_points: -2, role: SACRIFICE, shop_price_adjustment: -1, synergy_tags: ["快餐", "厌食", "付费"], effect: { kind: "anorexia", description: "吃：支付 2 金币（不足时每少 1 金币，本次 -3 分）；随后吃分永久 -1、弃分永久 +2", trigger_action: "eat", eat_loss: 1, discard_gain: 2, eat_gold_cost: 2, unpaid_score_penalty: 3 } }),
  card({ id: "K007", name: "辣鸡翅", rarity: "稀有", type: "快餐", edibility: EDIBLE, eat_points: 3, discard_points: -1, role: SETUP, synergy_tags: ["快餐", "厌食", "饮料"], effect: { kind: "anorexia", description: "吃后厌食 -1/+1；下一张饮料吃分额外 +2，不符合条件的牌不会移除蓄势", trigger_action: "eat", eat_loss: 1, discard_gain: 1, buff_target_type: "饮料", buff_add: 2 } }),
  card({ id: "K008", name: "三明治", art_file: "cards/k008-v2.png", flavor: "两片面包夹着刚好的分量。", rarity: "普通", type: "快餐", edibility: EDIBLE, eat_points: 2, discard_points: -1, role: BASELINE, shop_price_adjustment: -1, synergy_tags: ["快餐", "基础"], effect: null }),

  // 甜点 ×7：弃置【留存】吃分，达到阈值后一次爆发并重置。
  card({ id: "D001", name: "甜甜圈", rarity: "普通", type: "甜点", edibility: EDIBLE, eat_points: 2, discard_points: -1, role: ENGINE, synergy_tags: ["甜点", "留存"], effect: { kind: "retention", description: "弃：自身吃分永久 +2；吃分达到 10 时吃下，本次得分翻倍并重置", retain: 2, burst_threshold: 10, burst_multiplier: 2, reset_after_eat: true } }),
  card({ id: "D002", name: "草莓蛋糕", rarity: "罕见", type: "甜点", edibility: EDIBLE, eat_points: 3, discard_points: -1, role: ENGINE, synergy_tags: ["甜点", "留存", "水果"], effect: { kind: "retention", description: "弃：吃分永久 +3；若上一张行动牌是水果，再 +2；10+ 吃下翻倍并重置", retain: 3, previous_type: "水果", previous_retain_bonus: 2, burst_threshold: 10, burst_multiplier: 2, reset_after_eat: true } }),
  card({ id: "D003", name: "焦糖布丁", rarity: "普通", type: "甜点", edibility: EDIBLE, eat_points: 2, discard_points: -1, role: ENGINE, synergy_tags: ["甜点", "留存", "后置"], effect: { kind: "retention", description: "弃：吃分永久 +1；本轮曾被【后置】时改为 +3；10+ 吃下翻倍并重置", retain: 1, postponed_retain_bonus: 2, burst_threshold: 10, burst_multiplier: 2, reset_after_eat: true } }),
  card({ id: "D004", name: "冰淇淋", rarity: "罕见", type: "甜点", edibility: EDIBLE, eat_points: 1, discard_points: -1, role: SACRIFICE, synergy_tags: ["甜点", "留存", "大幅成长"], effect: { kind: "retention", description: "弃：吃分永久 +4（最高留存至 12）；10+ 吃下翻倍并重置", retain: 4, max_eat_points: 12, burst_threshold: 10, burst_multiplier: 2, reset_after_eat: true } }),
  card({ id: "D005", name: "糖果", rarity: "普通", type: "甜点", edibility: EDIBLE, eat_points: 1, discard_points: -1, role: ECONOMY, synergy_tags: ["甜点", "留存", "经济"], effect: { kind: "retention", description: "弃：吃分永久 +2；8+ 吃下翻倍、结算金币 +1，并重置", retain: 2, burst_threshold: 8, burst_multiplier: 2, burst_gold: 1, reset_after_eat: true } }),
  card({ id: "D006", name: "婚礼蛋糕", rarity: "传奇", type: "甜点", edibility: EDIBLE, eat_points: 2, discard_points: -2, role: PAYOFF, synergy_tags: ["甜点", "留存", "爆发"], effect: { kind: "retention", description: "弃：吃分永久 +5；12+ 吃下时本次得分 ×3，并重置", retain: 5, burst_threshold: 12, burst_multiplier: 3, reset_after_eat: true } }),
  card({ id: "D007", name: "夹心饼干", rarity: "稀有", type: "甜点", edibility: EDIBLE, eat_points: 2, discard_points: -1, role: ECONOMY, synergy_tags: ["甜点", "留存", "商店"], effect: { kind: "retention", description: "弃：吃分永久 +2；10+ 吃下翻倍、随后商店卡价 -1，并重置", retain: 2, burst_threshold: 10, burst_multiplier: 2, burst_discount: 1, reset_after_eat: true } }),

  // 饮料 ×8：多数在触发后摧毁，换取直接资源或延迟到指定类别的蓄势。
  card({ id: "B001", name: "清水", rarity: "普通", type: "饮料", edibility: EDIBLE, eat_points: 1, discard_points: -1, role: SETUP, synergy_tags: ["饮料", "摧毁", "净化"], effect: { kind: "drink_consume", description: "吃后摧毁自身；只将牌组中低于原值的红色点数恢复，绿色成长保留", trigger_action: "eat", cleanse_deck: true } }),
  card({ id: "B002", name: "汽水", rarity: "普通", type: "饮料", edibility: EDIBLE, eat_points: 1, discard_points: -1, role: SETUP, synergy_tags: ["饮料", "摧毁", "快餐"], effect: { kind: "drink_consume", description: "吃后摧毁自身；下一张快餐吃牌得分 ×2，不符合条件的牌不会消除蓄势", trigger_action: "eat", buff_action: "eat", buff_target_type: "快餐", buff_multiplier: 2 } }),
  card({ id: "B003", name: "黑咖啡", rarity: "罕见", type: "饮料", edibility: EDIBLE, eat_points: 1, discard_points: -1, role: SETUP, synergy_tags: ["饮料", "摧毁", "蓄势"], effect: { kind: "drink_consume", description: "吃后摧毁自身；下一张牌额外 +4 分", trigger_action: "eat", buff_action: "*", buff_add: 4 } }),
  card({ id: "B004", name: "鲜榨果汁", rarity: "罕见", type: "饮料", edibility: EDIBLE, eat_points: 1, discard_points: -1, role: ENGINE, synergy_tags: ["饮料", "摧毁", "水果", "生成", "弱化"], effect: { kind: "drink_consume", description: "吃后摧毁自身，并随机生成 1 张【弱化】水果", trigger_action: "eat", generate_random_type: "水果", generate_weakened: true } }),
  card({ id: "B005", name: "能量饮料", rarity: "稀有", type: "饮料", edibility: EDIBLE, eat_points: 1, discard_points: -1, role: ENGINE, synergy_tags: ["饮料", "摧毁", "重洗"], effect: { kind: "drink_consume", description: "吃后摧毁自身，本轮自动重洗次数 +1", trigger_action: "eat", reshuffle_charges: 1 } }),
  card({ id: "B006", name: "牛奶", rarity: "普通", type: "饮料", edibility: EDIBLE, eat_points: 1, discard_points: -1, role: SETUP, synergy_tags: ["饮料", "摧毁", "甜点"], effect: { kind: "drink_consume", description: "吃后摧毁自身；下一张甜点得分 ×2，不符合条件的牌不会消除蓄势", trigger_action: "eat", buff_action: "*", buff_target_type: "甜点", buff_multiplier: 2 } }),
  card({ id: "B007", name: "押金瓶", art_file: "cards/b007-v2.png", rarity: "普通", type: "饮料", edibility: INEDIBLE, eat_points: -2, discard_points: -2, role: ECONOMY, shop_price_adjustment: -1, synergy_tags: ["饮料", "经济", "牺牲"], effect: { kind: "discard_for_gold", description: "每轮首次弃：承受 -2 分，立即获得 2 金币", trigger_action: "discard", gold: 2, once_per_round: true } }),
  card({ id: "B008", name: "苦味补剂", art_file: "cards/b008-v2.png", rarity: "罕见", type: "饮料", edibility: EDIBLE, eat_points: 1, discard_points: -2, role: SETUP, synergy_tags: ["饮料", "硬吃", "蓄势", "摧毁"], effect: { kind: "wrong_edibility_setup_destroy", description: "错误食性弃掉后摧毁自身；下一次错误食性处理额外 +4 分", trigger_action: "discard", bonus: 4 } }),

  // 动物 ×8：基础动物负责教学，其余动物摧毁、成长或生成生态。
  card({ id: "A001", name: "橘猫", flavor: "是一只可爱的猫。", rarity: "普通", type: "动物", edibility: INEDIBLE, eat_points: -1, discard_points: 2, role: BASELINE, shop_price_adjustment: -2, synergy_tags: ["动物", "基础"], effect: null }),
  card({ id: "A002", name: "贪吃狗", rarity: "普通", type: "动物", edibility: INEDIBLE, eat_points: -2, discard_points: 2, role: ENGINE, synergy_tags: ["动物", "吞食", "可食用"], effect: { kind: "consume_previous_card", description: "弃：摧毁上一张可食用牌，自身弃分永久成长 1～2", trigger_action: "discard", target_edibility: EDIBLE, grow_stat: "discard_points", max_growth: 2 } }),
  card({ id: "A003", name: "疲惫猴子", art_file: "cards/a003-v2.png", rarity: "罕见", type: "动物", edibility: INEDIBLE, eat_points: -2, discard_points: 3, role: ENGINE, synergy_tags: ["动物", "生成", "水果", "弱化", "衰减"], effect: { kind: "generate_by_decay", description: "每轮首次弃：生成 1 张【弱化】香蕉，自身弃分永久 -1；降到 0 时摧毁自身", trigger_action: "discard", card_id: "F002", decay_stat: "discard_points", decay: 1, destroy_at: 0, once_per_round: true } }),
  card({ id: "A004", name: "兔子", rarity: "普通", type: "动物", edibility: INEDIBLE, eat_points: -1, discard_points: 1, role: PAYOFF, synergy_tags: ["动物", "兔子", "规模"], effect: { kind: "scale_by_deck", description: "弃：牌组中每有 1 张兔子，额外 +1（无上限）", trigger_action: "discard", target_id: "A004", divisor: 1, multiplier: 1 } }),
  card({ id: "A005", name: "饕餮", rarity: "传奇", type: "动物", edibility: INEDIBLE, eat_points: -3, discard_points: 3, role: ENGINE, synergy_tags: ["动物", "吞食", "成长"], effect: { kind: "consume_previous_card", description: "弃：摧毁上一张任意牌，自身弃分按其较高绝对牌面永久成长 1～4", trigger_action: "discard", grow_stat: "discard_points", max_growth: 4 } }),
  card({ id: "A006", name: "蜕皮蛇", art_file: "cards/a006-v2.png", rarity: "稀有", type: "动物", edibility: INEDIBLE, eat_points: -2, discard_points: 2, role: ENGINE, synergy_tags: ["动物", "转移", "成长"], effect: { kind: "drain_random_to_self", description: "每轮首次弃：随机另一张可食用牌吃分永久 -1，自身弃分永久 +1", trigger_action: "discard", target_edibility: EDIBLE, target_stat: "eat_points", target_loss: 1, target_min: 0, self_stat: "discard_points", self_gain: 1, once_per_round: true } }),
  card({ id: "A007", name: "狐狸", rarity: "罕见", type: "动物", edibility: INEDIBLE, eat_points: -2, discard_points: 2, role: ENGINE, synergy_tags: ["动物", "生成", "水果", "弱化"], effect: { kind: "generate_random", description: "每轮首次弃：随机生成 1 张【弱化】水果", trigger_action: "discard", target_type: "水果", generate_weakened: true, once_per_round: true } }),
  card({ id: "A008", name: "乌龟", art_file: "cards/a008-v2.png", flavor: "它只是慢慢爬过餐盘。", rarity: "普通", type: "动物", edibility: INEDIBLE, eat_points: -1, discard_points: 2, role: BASELINE, shop_price_adjustment: -2, synergy_tags: ["动物", "基础"], effect: null }),

  // 星体 ×7：直接改写牌序、计时、重洗、硬吃与剩余牌面。
  card({ id: "C001", name: "星星", rarity: "普通", type: "星体", edibility: INEDIBLE, eat_points: -2, discard_points: 2, role: ENGINE, synergy_tags: ["星体", "生成", "弱化", "机制"], effect: { kind: "generate_random", description: "每轮首次弃：随机生成 1 张【弱化】卡牌", trigger_action: "discard", generate_weakened: true, once_per_round: true } }),
  card({ id: "C002", name: "月亮", rarity: "罕见", type: "星体", edibility: INEDIBLE, eat_points: -2, discard_points: 2, role: ENGINE, synergy_tags: ["星体", "机制", "牌面互换"], effect: { kind: "swap_remaining_sides", description: "弃：剩余餐盘所有卡牌的吃点与弃点互换，仅持续本轮", trigger_action: "discard" } }),
  card({ id: "C003", name: "太阳", rarity: "稀有", type: "星体", edibility: INEDIBLE, eat_points: -2, discard_points: 2, role: ENGINE, synergy_tags: ["星体", "重洗", "摧毁"], effect: { kind: "celestial_sun", description: "弃后摧毁自身，本轮自动重洗次数 +1", trigger_action: "discard", charges: 1 } }),
  card({ id: "C004", name: "彗星", rarity: "普通", type: "星体", edibility: INEDIBLE, eat_points: -2, discard_points: 2, role: PAYOFF, synergy_tags: ["星体", "后置", "位置"], effect: { kind: "bonus_if_postponed", description: "本轮曾被【后置】后再弃掉，额外 +6", trigger_action: "discard", bonus: 6 } }),
  card({ id: "C005", name: "陨石", rarity: "稀有", type: "星体", edibility: INEDIBLE, eat_points: -3, discard_points: 4, role: PAYOFF, synergy_tags: ["星体", "清场", "机制"], effect: { kind: "discard_all_remaining", description: "弃：立即弃掉并结算餐盘中所有剩余牌", trigger_action: "discard" } }),
  card({ id: "C006", name: "冥王星", rarity: "传奇", type: "星体", edibility: INEDIBLE, eat_points: -2, discard_points: 2, role: ECONOMY, synergy_tags: ["星体", "计时", "机制"], effect: { kind: "pause_timer", description: "弃：暂停本轮计时直到结束；仍可获得 12 秒与 8 秒奖励", trigger_action: "discard" } }),
  card({ id: "C007", name: "黑洞胃", art_file: "cards/c007-v2.png", rarity: "稀有", type: "星体", edibility: INEDIBLE, eat_points: -3, discard_points: 2, role: PAYOFF, synergy_tags: ["星体", "硬吃", "爆发"], effect: { kind: "wrong_history_scale", description: "错误食性吃：本轮此前每次错误食性处理使本牌额外 +2 分", trigger_action: "eat", multiplier: 2, max_bonus: 12 } }),

  // 人物 ×6：连接其余类别，提供跨体系的生成、追溯、硬吃与经济收益。
  card({ id: "P001", name: "水果商人", art_file: "cards/p001-v2.png", rarity: "普通", type: "人物", edibility: INEDIBLE, eat_points: -2, discard_points: 2, role: ECONOMY, synergy_tags: ["人物", "水果", "经济"], effect: { kind: "gold_from_history", description: "每轮首次弃：本轮此前每吃 1 张水果，结算金币 +1（最多 +8）", trigger_action: "discard", history_action: "eat", target_type: "水果", divisor: 1, gold: 1, max_gold: 8, once_per_round: true } }),
  card({ id: "P002", name: "债务经纪人", art_file: "cards/p002-v2.png", rarity: "罕见", type: "人物", edibility: INEDIBLE, eat_points: -2, discard_points: -3, role: ECONOMY, shop_price_adjustment: -2, synergy_tags: ["人物", "经济", "牺牲"], effect: { kind: "discard_for_gold", description: "每轮首次弃：承受 -3 分，立即获得 3 金币", trigger_action: "discard", gold: 3, once_per_round: true } }),
  card({ id: "P003", name: "动物管理员", art_file: "cards/p003-v2.png", rarity: "罕见", type: "人物", edibility: INEDIBLE, eat_points: -2, discard_points: 2, role: PAYOFF, synergy_tags: ["人物", "动物", "追溯"], effect: { kind: "scale_by_history", description: "弃：本轮此前每弃 1 张动物，额外 +2", trigger_action: "discard", history_action: "discard", target_type: "动物", multiplier: 2 } }),
  card({ id: "P004", name: "天文学家", art_file: "cards/p004-v2.png", rarity: "稀有", type: "人物", edibility: INEDIBLE, eat_points: -2, discard_points: 2, role: ENGINE, synergy_tags: ["人物", "星体", "生成", "弱化"], effect: { kind: "generate_random", description: "每轮首次弃：随机生成 1 张【弱化】星体", trigger_action: "discard", target_type: "星体", generate_weakened: true, once_per_round: true } }),
  card({ id: "P005", name: "魔术师", art_file: "cards/p005-v2.png", rarity: "稀有", type: "人物", edibility: INEDIBLE, eat_points: -2, discard_points: 2, role: ENGINE, synergy_tags: ["人物", "动物", "兔子", "生成", "弱化"], effect: { kind: "generate_card", description: "每轮首次弃：生成 1 张【弱化】兔子", trigger_action: "discard", card_id: "A004", generate_weakened: true, once_per_round: true } }),
  card({ id: "P006", name: "美食挑战者", art_file: "cards/p006-v2.png", rarity: "罕见", type: "人物", edibility: INEDIBLE, eat_points: -2, discard_points: 2, role: ENGINE, synergy_tags: ["人物", "硬吃", "连击"], effect: { kind: "wrong_edibility_streak", description: "错误食性吃：本轮连续错误食性次数 ×2 分（最多 +8）；正确食性会中断连击", trigger_action: "eat", bonus_per_streak: 2, max_bonus: 8 } }),

  // 通用 ×4：净化、永久增益、硬吃与商店经济。
  card({ id: "U001", name: "净化器", art_file: "cards/u001-v2.png", rarity: "普通", type: "通用", edibility: INEDIBLE, eat_points: -2, discard_points: 2, role: SETUP, synergy_tags: ["通用", "净化"], effect: { kind: "purify_deck", description: "弃：只将整副牌组中低于原值的红色点数恢复；绿色成长保留", trigger_action: "discard" } }),
  card({ id: "U002", name: "榨分机", art_file: "cards/u002-v2.png", rarity: "稀有", type: "通用", edibility: INEDIBLE, eat_points: -2, discard_points: 2, role: ENGINE, synergy_tags: ["通用", "转移", "成长", "水果"], effect: { kind: "drain_type_to_self", description: "每轮首次弃：每张水果吃分永久 -1；实际降低几点，自身弃分就永久增加几点（最多 +4）", trigger_action: "discard", target_type: "水果", target_stat: "eat_points", target_loss: 1, target_min: 0, self_stat: "discard_points", max_self_gain: 4, once_per_round: true } }),
  card({ id: "U003", name: "打折券", rarity: "普通", type: "通用", edibility: INEDIBLE, eat_points: -2, discard_points: 2, role: ECONOMY, synergy_tags: ["通用", "经济", "商店"], effect: { kind: "shop_discount", description: "每轮首次弃：随后商店所有卡牌价格 -1（最低 1）", trigger_action: "discard", discount: 1, once_per_round: true } }),
  card({ id: "U004", name: "铁胃徽章", art_file: "cards/u004-v2.png", rarity: "普通", type: "通用", edibility: INEDIBLE, eat_points: -1, discard_points: 2, role: BASELINE, synergy_tags: ["通用", "硬吃"], effect: { kind: "wrong_edibility_bonus", description: "以错误食性吃下本牌时额外 +3 分", trigger_action: "eat", bonus: 3 } }),
];

// Seven unique teaching cards: four edible, three inedible. Both fruits teach
// the combo immediately; three effect-free cards keep the opening readable.
const STARTER_IDS = Object.freeze(["F002", "F003", "K001", "D001", "A001", "A008", "A004"]);

function cloneCard(source) {
  return {
    ...source,
    synergy_tags: [...source.synergy_tags],
    effect: source.effect ? { ...source.effect, keywords: [...(source.effect.keywords ?? [])] } : null,
  };
}

function fallbackId(source, index) {
  return `${source.id}-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 7)}`;
}

export const CARD_EDIBILITY = Object.freeze({ EDIBLE, INEDIBLE });
export const CARD_TYPES = Object.freeze({
  FRUIT: "水果", FASTFOOD: "快餐", DESSERT: "甜点", DRINK: "饮料",
  CELESTIAL: "星体", PERSON: "人物", ANIMAL: "动物", UTILITY: "通用",
});

export const CARD_LIBRARY = Object.freeze(CARD_DEFS.reduce((library, source) => {
  library[source.id] = Object.freeze(cloneCard(source));
  return library;
}, {}));

export function createInitialDeck(options = {}) {
  const createId = options.create_id ?? fallbackId;
  return STARTER_IDS.map((id, index) => {
    const source = CARD_LIBRARY[id];
    return { ...cloneCard(source), uuid: createId(source, index) };
  });
}

export function createShopCardPool() { return CARD_DEFS.map(cloneCard); }

export function getCardById(id) {
  const source = CARD_LIBRARY[id];
  return source ? cloneCard(source) : null;
}
