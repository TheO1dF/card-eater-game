import { CARD_ROLES } from "./balance.js";

const EDIBLE = "edible";
const INEDIBLE = "inedible";
const { BASELINE, SETUP, PAYOFF, SACRIFICE, ENGINE, ECONOMY } = CARD_ROLES;

// The original starter atlas plus five generated 5x2 sheets give every card a
// unique silhouette. Runtime WebP atlases keep H5 downloads small, while the
// matching source PNG files remain available for future art and Godot work.
const SPRITE_MAP = Object.freeze({
  F001: [0, 0, 0], F002: [0, 1, 0], F003: [1, 2, 0], F004: [1, 3, 0], F005: [1, 4, 0],
  F006: [1, 0, 1], F007: [1, 1, 1], F008: [1, 2, 1], V001: [1, 3, 1], V002: [1, 4, 1],
  K001: [0, 4, 0], K002: [2, 1, 0], K003: [2, 2, 0], K004: [2, 3, 0], K005: [2, 4, 0],
  D001: [0, 0, 1], D002: [2, 1, 1], D003: [2, 2, 1], D004: [2, 3, 1], D005: [2, 4, 1],
  D006: [3, 0, 0], B001: [3, 1, 0], B002: [3, 2, 0], B003: [3, 3, 0], B004: [3, 4, 0],
  B005: [3, 0, 1], V003: [3, 1, 1], V004: [3, 2, 1], C001: [0, 0, 2], C002: [3, 4, 1],
  C003: [4, 0, 0], C004: [4, 1, 0], C005: [4, 2, 0], C006: [4, 3, 0], A001: [0, 4, 2],
  A002: [4, 0, 1], A003: [4, 1, 1], A004: [4, 2, 1], A005: [4, 3, 1], P001: [4, 4, 1],
  P002: [5, 0, 0], P003: [5, 1, 0], P004: [5, 2, 0], P005: [5, 3, 0], U001: [0, 3, 3],
  U002: [5, 0, 1], U003: [5, 1, 1], U004: [5, 2, 1], U005: [5, 3, 1], U006: [5, 4, 1],
});

const card = (definition) => {
  const [sheet, spriteX, spriteY] = SPRITE_MAP[definition.id] ?? [null, definition.sprite_x ?? 0, definition.sprite_y ?? 0];
  return {
    sprite_hue: 0,
    sprite_scale: 1,
    synergy_tags: [],
    ...definition,
    art_file: `cards/${definition.id.toLowerCase()}.webp`,
    sprite_sheet: sheet ? `card-sprites-set-${sheet}.webp` : "card-sprites.webp",
    sprite_columns: 5,
    sprite_rows: sheet ? 2 : 4,
    sprite_x: spriteX,
    sprite_y: spriteY,
    sprite_hue: 0,
    sprite_scale: 1,
  };
};

// Beginner deck: readable direction, one mild downside, no build knowledge required.
const BASE_CARD_DEFS = [
  card({ id: "F001", sprite_x: 0, sprite_y: 0, name: "苹果", rarity: "普通", type: "水果", edibility: EDIBLE, eat_points: 1, discard_points: 0, role: BASELINE, synergy_tags: ["水果", "连吃"], effect: null }),
  card({ id: "F002", sprite_x: 1, sprite_y: 0, name: "香蕉", rarity: "普通", type: "水果", edibility: EDIBLE, eat_points: 1, discard_points: 0, role: BASELINE, synergy_tags: ["水果", "连吃"], effect: null }),
  card({ id: "K001", sprite_x: 4, sprite_y: 0, name: "汉堡", rarity: "普通", type: "快餐", edibility: EDIBLE, eat_points: 2, discard_points: 0, role: SETUP, synergy_tags: ["快餐", "负面"], effect: { kind: "debuff_next_action", description: "吃后，下一张可食用牌吃分 -1", action: "eat", target_edibility: EDIBLE, amount: -1, count: 1 } }),
  card({ id: "D001", sprite_x: 0, sprite_y: 1, name: "甜甜圈", rarity: "普通", type: "甜点", edibility: EDIBLE, eat_points: 2, discard_points: 0, role: BASELINE, synergy_tags: ["甜点", "连吃"], effect: null }),
  card({ id: "C001", sprite_x: 0, sprite_y: 2, name: "星星", rarity: "普通", type: "星体", edibility: INEDIBLE, eat_points: -2, discard_points: 1, role: BASELINE, synergy_tags: ["星体", "连弃"], effect: null }),
  card({ id: "A001", sprite_x: 4, sprite_y: 2, name: "橘猫", rarity: "普通", type: "动物", edibility: INEDIBLE, eat_points: -2, discard_points: 1, role: BASELINE, synergy_tags: ["动物", "连弃"], effect: null }),
  card({ id: "U001", sprite_x: 3, sprite_y: 3, name: "打折券", rarity: "普通", type: "通用", edibility: INEDIBLE, eat_points: -1, discard_points: 1, role: ECONOMY, synergy_tags: ["通用", "经济"], effect: { kind: "shop_discount", description: "弃掉后，随后商店价格 -1", trigger_action: "discard", discount: 1 } }),
];

const SHOP_CARD_DEFS = [
  // Fruits: sequence, growth, sacrifice, and memory payoffs.
  card({ id: "F003", sprite_x: 2, sprite_y: 0, name: "西瓜", rarity: "普通", type: "水果", edibility: EDIBLE, eat_points: 2, discard_points: 0, role: BASELINE, synergy_tags: ["水果", "连吃"], effect: null }),
  card({ id: "F004", sprite_x: 3, sprite_y: 0, sprite_hue: -18, name: "草莓", rarity: "罕见", type: "水果", edibility: EDIBLE, eat_points: 2, discard_points: 0, role: PAYOFF, synergy_tags: ["水果", "顺序"], effect: { kind: "bonus_if_previous", description: "上一张吃牌是水果时额外 +2", sequence: "eat", target_type: "水果", bonus: 2 } }),
  card({ id: "F005", sprite_x: 0, sprite_y: 0, sprite_hue: 55, name: "金苹果", rarity: "稀有", type: "水果", edibility: EDIBLE, eat_points: 2, discard_points: 0, role: ENGINE, synergy_tags: ["水果", "成长"], effect: { kind: "permanent_growth_eat", description: "每次吃掉，自身吃分永久 +1", amount: 1 } }),
  card({ id: "F006", sprite_x: 0, sprite_y: 0, sprite_hue: 110, name: "腐烂苹果", rarity: "罕见", type: "水果", edibility: EDIBLE, eat_points: -2, discard_points: 0, role: SACRIFICE, synergy_tags: ["水果", "牺牲"], effect: { kind: "buff_next_action", description: "硬吃 -2；接下来 3 张水果吃分 +2", trigger_action: "eat", action: "eat", target_type: "水果", count: 3, modifier: "flat", add: 2 } }),
  card({ id: "F007", sprite_x: 2, sprite_y: 0, sprite_hue: -35, name: "水果拼盘", rarity: "稀有", type: "水果", edibility: EDIBLE, eat_points: 1, discard_points: 0, role: PAYOFF, synergy_tags: ["水果", "历史"], effect: { kind: "scale_by_history", description: "吃下时，此前每吃一张水果 +1", trigger_action: "eat", history_action: "eat", target_type: "水果", multiplier: 1 } }),
  card({ id: "F008", sprite_x: 4, sprite_y: 1, sprite_hue: 285, name: "火龙果", rarity: "稀有", type: "水果", edibility: EDIBLE, eat_points: 3, discard_points: 0, role: PAYOFF, synergy_tags: ["水果", "末位", "记牌"], effect: { kind: "bonus_if_position", description: "作为最后一张牌吃掉时额外 +8", trigger_action: "eat", position: "last", bonus: 8 } }),

  // Fast food: high printed value with aftertaste, chains, and retrospective scoring.
  card({ id: "K002", sprite_x: 3, sprite_y: 1, name: "拉面", rarity: "罕见", type: "快餐", edibility: EDIBLE, eat_points: 3, discard_points: 0, role: BASELINE, synergy_tags: ["快餐", "连吃"], effect: null }),
  card({ id: "K003", sprite_x: 4, sprite_y: 0, sprite_hue: 28, name: "薯条", rarity: "普通", type: "快餐", edibility: EDIBLE, eat_points: 1, discard_points: 0, role: PAYOFF, synergy_tags: ["快餐", "顺序"], effect: { kind: "bonus_if_previous", description: "上一张吃牌是快餐时额外 +2", sequence: "eat", target_type: "快餐", bonus: 2 } }),
  card({ id: "K004", sprite_x: 4, sprite_y: 0, sprite_scale: 1.12, name: "巨无霸", rarity: "稀有", type: "快餐", edibility: EDIBLE, eat_points: 4, discard_points: 0, role: SETUP, synergy_tags: ["快餐", "负面"], effect: { kind: "debuff_next_action", description: "吃分 +4；接下来 2 张可食用牌吃分 -2", action: "eat", target_edibility: EDIBLE, amount: -2, count: 2 } }),
  card({ id: "K005", sprite_x: 3, sprite_y: 1, sprite_hue: 75, name: "发馊外卖", rarity: "稀有", type: "快餐", edibility: EDIBLE, eat_points: -3, discard_points: -3, role: SACRIFICE, synergy_tags: ["快餐", "回溯", "牺牲"], effect: { kind: "retro_multiplier_eaten_tag", description: "硬吃 -3；把此前快餐得分总和再加一份", trigger_action: "eat", target_type: "快餐", multiplier: 2 } }),

  // Desserts: reliable pairs and history engines.
  card({ id: "D002", sprite_x: 3, sprite_y: 0, name: "草莓蛋糕", rarity: "罕见", type: "甜点", edibility: EDIBLE, eat_points: 3, discard_points: 0, role: BASELINE, synergy_tags: ["甜点", "连吃"], effect: null }),
  card({ id: "D003", sprite_x: 1, sprite_y: 1, name: "焦糖布丁", rarity: "普通", type: "甜点", edibility: EDIBLE, eat_points: 2, discard_points: 0, role: BASELINE, synergy_tags: ["甜点", "连吃"], effect: null }),
  card({ id: "D004", sprite_x: 2, sprite_y: 1, name: "冰淇淋", rarity: "罕见", type: "甜点", edibility: EDIBLE, eat_points: 2, discard_points: 0, role: SETUP, synergy_tags: ["甜点", "净化"], effect: { kind: "clear_debuff", description: "吃掉前，清除尚未触发的负面效果" } }),
  card({ id: "D005", sprite_x: 0, sprite_y: 1, sprite_hue: 28, name: "糖果", rarity: "普通", type: "甜点", edibility: EDIBLE, eat_points: 1, discard_points: 0, role: SETUP, synergy_tags: ["甜点", "增益"], effect: { kind: "buff_next_action", description: "接下来 2 张甜点吃分 +1", trigger_action: "eat", action: "eat", target_type: "甜点", count: 2, modifier: "flat", add: 1 } }),
  card({ id: "D006", sprite_x: 3, sprite_y: 0, sprite_scale: 1.1, name: "婚礼蛋糕", rarity: "稀有", type: "甜点", edibility: EDIBLE, eat_points: 2, discard_points: 0, role: PAYOFF, synergy_tags: ["甜点", "历史"], effect: { kind: "scale_by_history", description: "吃下时，此前每吃一张甜点 +1", trigger_action: "eat", history_action: "eat", target_type: "甜点", multiplier: 1 } }),

  // Drinks: tempo control and deliberate negative-eat burst turns.
  card({ id: "B001", sprite_x: 2, sprite_y: 1, sprite_hue: 150, name: "清水", rarity: "普通", type: "饮料", edibility: EDIBLE, eat_points: 1, discard_points: 0, role: SETUP, synergy_tags: ["饮料", "净化"], effect: { kind: "clear_debuff", description: "喝下前清除尚未触发的负面效果" } }),
  card({ id: "B002", sprite_x: 2, sprite_y: 1, sprite_hue: 210, name: "汽水", rarity: "普通", type: "饮料", edibility: EDIBLE, eat_points: 2, discard_points: 0, role: SETUP, synergy_tags: ["饮料", "负面"], effect: { kind: "debuff_next_action", description: "喝下 +2；下一张可食用牌吃分 -1", action: "eat", target_edibility: EDIBLE, amount: -1, count: 1 } }),
  card({ id: "B003", sprite_x: 1, sprite_y: 1, sprite_hue: 315, name: "黑咖啡", rarity: "罕见", type: "饮料", edibility: EDIBLE, eat_points: -2, discard_points: 0, role: SACRIFICE, synergy_tags: ["饮料", "牺牲", "爆发"], effect: { kind: "buff_next_action", description: "硬喝 -2；接下来 3 张可食用牌吃分 ×1.5", trigger_action: "eat", action: "eat", target_edibility: EDIBLE, count: 3, multiplier: 1.5 } }),
  card({ id: "B004", sprite_x: 2, sprite_y: 1, sprite_hue: 55, name: "鲜榨果汁", rarity: "罕见", type: "饮料", edibility: EDIBLE, eat_points: 2, discard_points: -1, role: SETUP, synergy_tags: ["饮料", "水果", "弃食"], effect: { kind: "buff_next_action", description: "弃掉 -1；接下来 3 张水果吃分 ×2", trigger_action: "discard", action: "eat", target_type: "水果", count: 3, multiplier: 2 } }),
  card({ id: "B005", sprite_x: 2, sprite_y: 1, sprite_hue: 275, name: "能量饮料", rarity: "稀有", type: "饮料", edibility: EDIBLE, eat_points: -4, discard_points: 0, role: SACRIFICE, synergy_tags: ["饮料", "牺牲", "爆发"], effect: { kind: "buff_next_action", description: "硬喝 -4；接下来 4 张牌得分 ×2", trigger_action: "eat", action: "*", count: 4, multiplier: 2 } }),

  // Vegetables: modest base, strong sequencing and permanent scaling.
  card({ id: "V001", sprite_x: 4, sprite_y: 1, sprite_hue: 45, name: "胡萝卜", rarity: "普通", type: "蔬菜", edibility: EDIBLE, eat_points: 1, discard_points: 0, role: BASELINE, synergy_tags: ["蔬菜", "连吃"], effect: null }),
  card({ id: "V002", sprite_x: 4, sprite_y: 1, sprite_hue: 105, name: "西兰花", rarity: "普通", type: "蔬菜", edibility: EDIBLE, eat_points: 2, discard_points: 0, role: BASELINE, synergy_tags: ["蔬菜", "连吃"], effect: null }),
  card({ id: "V003", sprite_x: 3, sprite_y: 1, sprite_hue: 90, name: "蔬菜沙拉", rarity: "罕见", type: "蔬菜", edibility: EDIBLE, eat_points: 1, discard_points: 0, role: PAYOFF, synergy_tags: ["蔬菜", "顺序"], effect: { kind: "bonus_if_previous", description: "上一张吃牌是蔬菜时额外 +3", sequence: "eat", target_type: "蔬菜", bonus: 3 } }),
  card({ id: "V004", sprite_x: 4, sprite_y: 1, sprite_hue: 60, name: "黄金胡萝卜", rarity: "稀有", type: "蔬菜", edibility: EDIBLE, eat_points: 2, discard_points: 0, role: ENGINE, synergy_tags: ["蔬菜", "成长"], effect: { kind: "permanent_growth_eat", description: "每次吃掉，自身吃分永久 +1", amount: 1 } }),

  // Celestials: discard chains, position memory, and screen-clearing capstones.
  card({ id: "C002", sprite_x: 1, sprite_y: 2, name: "月亮", rarity: "普通", type: "星体", edibility: INEDIBLE, eat_points: -3, discard_points: 2, role: BASELINE, synergy_tags: ["星体", "连弃"], effect: null }),
  card({ id: "C003", sprite_x: 0, sprite_y: 2, sprite_hue: 35, name: "太阳", rarity: "罕见", type: "星体", edibility: INEDIBLE, eat_points: -4, discard_points: 2, role: SETUP, synergy_tags: ["星体", "增益"], effect: { kind: "buff_next_action", description: "接下来 3 张星体弃分 ×1.5", trigger_action: "discard", action: "discard", target_type: "星体", count: 3, multiplier: 1.5 } }),
  card({ id: "C004", sprite_x: 2, sprite_y: 2, sprite_hue: 25, name: "彗星", rarity: "罕见", type: "星体", edibility: INEDIBLE, eat_points: -3, discard_points: 2, role: PAYOFF, synergy_tags: ["星体", "首位", "记牌"], effect: { kind: "bonus_if_position", description: "作为本轮第一张牌弃掉时额外 +4", trigger_action: "discard", position: "first", bonus: 4 } }),
  card({ id: "C005", sprite_x: 2, sprite_y: 2, name: "陨石", rarity: "稀有", type: "星体", edibility: INEDIBLE, eat_points: -6, discard_points: 4, role: PAYOFF, synergy_tags: ["星体", "清场"], effect: { kind: "discard_all_remaining", description: "弃掉时立即弃掉并结算所有剩余牌", trigger_action: "discard" } }),
  card({ id: "C006", sprite_x: 3, sprite_y: 2, name: "黑洞", rarity: "传奇", type: "星体", edibility: INEDIBLE, eat_points: -10, discard_points: 2, role: ENGINE, synergy_tags: ["星体", "清场", "倍率"], effect: { kind: "discard_all_remaining", description: "弃掉时全弃剩余牌，本轮最终得分 ×1.5", trigger_action: "discard", final_multiplier: 1.5 } }),

  // Animals: remember earlier actions, then cash out on discard.
  card({ id: "A002", sprite_x: 0, sprite_y: 3, name: "贪吃狗", rarity: "罕见", type: "动物", edibility: INEDIBLE, eat_points: -3, discard_points: 2, role: PAYOFF, synergy_tags: ["动物", "历史", "食物"], effect: { kind: "scale_by_history", description: "弃掉时，此前每吃一张可食用牌 +1", trigger_action: "discard", history_action: "eat", target_edibility: EDIBLE, multiplier: 1 } }),
  card({ id: "A003", sprite_x: 4, sprite_y: 2, sprite_hue: 45, name: "猴子", rarity: "罕见", type: "动物", edibility: INEDIBLE, eat_points: -3, discard_points: 1, role: PAYOFF, synergy_tags: ["动物", "历史", "水果"], effect: { kind: "scale_by_history", description: "弃掉时，此前每吃一张水果 +2", trigger_action: "discard", history_action: "eat", target_type: "水果", multiplier: 2 } }),
  card({ id: "A004", sprite_x: 4, sprite_y: 2, sprite_hue: 300, name: "兔子", rarity: "普通", type: "动物", edibility: INEDIBLE, eat_points: -2, discard_points: 1, role: SETUP, synergy_tags: ["动物", "甜点"], effect: { kind: "buff_next_action", description: "接下来 2 张甜点吃分 +2", trigger_action: "discard", action: "eat", target_type: "甜点", count: 2, modifier: "flat", add: 2 } }),
  card({ id: "A005", sprite_x: 0, sprite_y: 3, sprite_hue: 305, sprite_scale: 1.1, name: "饕餮", rarity: "传奇", type: "动物", edibility: INEDIBLE, eat_points: -10, discard_points: 3, role: PAYOFF, synergy_tags: ["动物", "历史", "终结"], effect: { kind: "scale_by_history", description: "弃掉时，此前每吃一张牌 +2", trigger_action: "discard", history_action: "eat", multiplier: 2 } }),

  // People: directional setup and one extreme sacrifice capstone.
  card({ id: "P001", sprite_x: 1, sprite_y: 3, name: "宇航员", rarity: "罕见", type: "人物", edibility: INEDIBLE, eat_points: -4, discard_points: 2, role: SETUP, synergy_tags: ["人物", "星体"], effect: { kind: "buff_next_action", description: "接下来 2 张星体弃分 ×2", trigger_action: "discard", action: "discard", target_type: "星体", count: 2, multiplier: 2 } }),
  card({ id: "P002", sprite_x: 2, sprite_y: 3, name: "厨师", rarity: "稀有", type: "人物", edibility: INEDIBLE, eat_points: -4, discard_points: 3, role: SETUP, synergy_tags: ["人物", "食物"], effect: { kind: "buff_next_action", description: "接下来 2 张可食用牌吃分 ×1.5", trigger_action: "discard", action: "eat", target_edibility: EDIBLE, count: 2, multiplier: 1.5 } }),
  card({ id: "P003", sprite_x: 2, sprite_y: 3, sprite_hue: 70, name: "商人", rarity: "普通", type: "人物", edibility: INEDIBLE, eat_points: -2, discard_points: 1, role: ECONOMY, synergy_tags: ["人物", "经济"], effect: { kind: "shop_discount", description: "弃掉后，随后商店价格 -2", trigger_action: "discard", discount: 2 } }),
  card({ id: "P004", sprite_x: 2, sprite_y: 3, sprite_hue: 120, name: "营养师", rarity: "罕见", type: "人物", edibility: INEDIBLE, eat_points: -3, discard_points: 2, role: SETUP, synergy_tags: ["人物", "食物"], effect: { kind: "buff_next_action", description: "接下来 4 张可食用牌吃分 +1", trigger_action: "discard", action: "eat", target_edibility: EDIBLE, count: 4, modifier: "flat", add: 1 } }),
  card({ id: "P005", sprite_x: 2, sprite_y: 3, sprite_hue: 45, sprite_scale: 1.12, name: "国王", rarity: "传奇", type: "人物", edibility: INEDIBLE, eat_points: -10, discard_points: 0, role: SACRIFICE, synergy_tags: ["人物", "牺牲", "爆发"], effect: { kind: "buff_next_action", description: "硬吃 -10；下一张牌得分 ×5", trigger_action: "eat", action: "*", count: 1, multiplier: 5 } }),

  // Utilities: economy, targeted engines, discarded-food payoffs, and score copying.
  card({ id: "U002", sprite_x: 4, sprite_y: 3, name: "储钱罐", rarity: "稀有", type: "通用", edibility: INEDIBLE, eat_points: -2, discard_points: 0, role: ECONOMY, synergy_tags: ["通用", "经济", "销毁"], effect: { kind: "gold_economy", description: "弃掉结算 +3 金币；吃掉得 10 金币并永久销毁", discard_add_gold: 3, eat_destroy_add_gold: 10 } }),
  card({ id: "U003", sprite_x: 2, sprite_y: 1, sprite_hue: 90, name: "榨汁机", rarity: "罕见", type: "通用", edibility: INEDIBLE, eat_points: -2, discard_points: 1, role: SETUP, synergy_tags: ["通用", "水果"], effect: { kind: "buff_next_action", description: "接下来 3 张水果吃分 ×2", trigger_action: "discard", action: "eat", target_type: "水果", count: 3, multiplier: 2 } }),
  card({ id: "U004", sprite_x: 1, sprite_y: 1, sprite_hue: 105, name: "堆肥箱", rarity: "稀有", type: "通用", edibility: INEDIBLE, eat_points: -3, discard_points: 1, role: PAYOFF, synergy_tags: ["通用", "弃食", "历史"], effect: { kind: "scale_by_history", description: "弃掉时，此前每弃一张可食用牌 +2", trigger_action: "discard", history_action: "discard", target_edibility: EDIBLE, multiplier: 2 } }),
  card({ id: "U005", sprite_x: 3, sprite_y: 2, sprite_hue: 170, name: "磁带复制机", rarity: "稀有", type: "通用", edibility: INEDIBLE, eat_points: -4, discard_points: 1, role: PAYOFF, synergy_tags: ["通用", "复制", "顺序"], effect: { kind: "copy_previous_score", description: "弃掉时，复制上一张牌的正得分", trigger_action: "discard" } }),
  card({ id: "U006", sprite_x: 3, sprite_y: 3, sprite_hue: 280, name: "黄金门票", rarity: "传奇", type: "通用", edibility: INEDIBLE, eat_points: -5, discard_points: 0, role: SACRIFICE, synergy_tags: ["通用", "牺牲", "经济"], effect: { kind: "shop_discount", description: "硬吃 -5；随后商店价格 -5", trigger_action: "eat", discount: 5 } }),
];

function cloneCard(source) {
  return { ...source, synergy_tags: [...source.synergy_tags], effect: source.effect ? { ...source.effect } : null };
}

function fallbackId(source, index) {
  return `${source.id}-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 7)}`;
}

export const CARD_EDIBILITY = Object.freeze({ EDIBLE, INEDIBLE });
export const CARD_TYPES = Object.freeze({
  FRUIT: "水果", FASTFOOD: "快餐", DESSERT: "甜点", DRINK: "饮料", VEGETABLE: "蔬菜",
  CELESTIAL: "星体", PERSON: "人物", ANIMAL: "动物", UTILITY: "通用",
});

export const CARD_LIBRARY = Object.freeze([...BASE_CARD_DEFS, ...SHOP_CARD_DEFS].reduce((library, source) => {
  library[source.id] = Object.freeze(cloneCard(source));
  return library;
}, {}));

export function createInitialDeck(options = {}) {
  const createId = options.create_id ?? fallbackId;
  return BASE_CARD_DEFS.map((source, index) => ({ ...cloneCard(source), uuid: createId(source, index) }));
}

export function createShopCardPool() { return SHOP_CARD_DEFS.map(cloneCard); }

export function getCardById(id) {
  const source = CARD_LIBRARY[id];
  return source ? cloneCard(source) : null;
}
