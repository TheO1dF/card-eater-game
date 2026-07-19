import { CARD_ROLES } from "./balance.js";
import { normalizeEffect } from "./keywords.js";

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
  F009: [6, 0, 0], C007: [6, 1, 0], A006: [6, 2, 0], U007: [6, 3, 0], P006: [6, 4, 0],
  U008: [6, 0, 1], D007: [6, 1, 1], C008: [6, 2, 1], U009: [6, 3, 1], Q001: [6, 4, 1],
  F010: [7, 0, 0], F011: [7, 1, 0], F012: [7, 2, 0], F013: [7, 3, 0], F014: [7, 4, 0],
  F015: [7, 0, 1], K006: [7, 1, 1], K007: [7, 2, 1], K008: [7, 3, 1], K009: [7, 4, 1],
  K010: [8, 0, 0], D008: [8, 1, 0], D009: [8, 2, 0], D010: [8, 3, 0], D011: [8, 4, 0],
  D012: [8, 0, 1], B006: [8, 1, 1], B007: [8, 2, 1], B008: [8, 3, 1], B009: [8, 4, 1],
  B010: [9, 0, 0], V005: [9, 1, 0], V006: [9, 2, 0], V007: [9, 3, 0], V008: [9, 4, 0],
  V009: [9, 0, 1], C009: [9, 1, 1], C010: [9, 2, 1], C011: [9, 3, 1], C012: [9, 4, 1],
  C013: [10, 0, 0], A007: [10, 1, 0], A008: [10, 2, 0], A009: [10, 3, 0], A010: [10, 4, 0],
  A011: [10, 0, 1], A012: [10, 1, 1], P007: [10, 2, 1], P008: [10, 3, 1], P009: [10, 4, 1],
  P010: [11, 0, 0], P011: [11, 1, 0], P012: [11, 2, 0], U010: [11, 3, 0], U011: [11, 4, 0],
  U012: [11, 0, 1], U013: [11, 1, 1], U014: [11, 2, 1], U015: [11, 3, 1], U016: [11, 4, 1],
});

let runtimeArtIndex = 0;
const card = (definition) => {
  const [sheet, spriteX, spriteY] = SPRITE_MAP[definition.id] ?? [null, definition.sprite_x ?? 0, definition.sprite_y ?? 0];
  const artIndex = runtimeArtIndex;
  runtimeArtIndex += 1;
  return {
    sprite_hue: 0,
    sprite_scale: 1,
    synergy_tags: [],
    max_copies: definition.rarity === "传奇" ? 1 : definition.rarity === "普通" ? 3 : 2,
    ...definition,
    effect: normalizeEffect(definition.effect),
    art_file: `cards/${definition.id.toLowerCase()}.webp`,
    runtime_art_mode: artIndex < 7 ? "individual" : "atlas",
    runtime_atlas: "cards-atlas.webp",
    runtime_columns: 10,
    runtime_rows: 11,
    runtime_x: artIndex % 10,
    runtime_y: Math.floor(artIndex / 10),
    sprite_sheet: sheet ? `card-sprites-set-${sheet}.webp` : "card-sprites.webp",
    sprite_columns: 5,
    sprite_rows: sheet ? 2 : 4,
    sprite_x: spriteX,
    sprite_y: spriteY,
    sprite_hue: definition.sprite_hue ?? 0,
    sprite_scale: definition.sprite_scale ?? 1,
  };
};

// Beginner deck: readable direction, one mild downside, no build knowledge required.
const BASE_CARD_DEFS = [
  card({ id: "F001", sprite_x: 0, sprite_y: 0, name: "苹果", rarity: "普通", type: "水果", edibility: EDIBLE, eat_points: 1, discard_points: 0, role: PAYOFF, synergy_tags: ["水果", "首位", "位置"], effect: { kind: "bonus_if_position", description: "作为本轮第一张牌吃掉时额外 +1", trigger_action: "eat", position: "first", bonus: 1 } }),
  card({ id: "F002", sprite_x: 1, sprite_y: 0, name: "香蕉", rarity: "普通", type: "水果", edibility: EDIBLE, eat_points: 1, discard_points: 0, role: PAYOFF, synergy_tags: ["水果", "相邻", "位置"], effect: { kind: "bonus_if_previous", description: "紧接一张吃掉的可食用牌后吃，额外 +1", trigger_action: "eat", sequence: "actions", previous_action: "eat", target_edibility: EDIBLE, bonus: 1 } }),
  card({ id: "K001", sprite_x: 4, sprite_y: 0, name: "汉堡", rarity: "普通", type: "快餐", edibility: EDIBLE, eat_points: 2, discard_points: 0, role: SETUP, synergy_tags: ["快餐", "负面"], effect: { kind: "debuff_next_action", description: "吃后，下一张可食用牌吃分 -1", action: "eat", target_edibility: EDIBLE, amount: -1, count: 1 } }),
  card({ id: "D001", sprite_x: 0, sprite_y: 1, name: "甜甜圈", rarity: "普通", type: "甜点", edibility: EDIBLE, eat_points: 2, discard_points: 0, role: PAYOFF, synergy_tags: ["甜点", "相邻", "位置"], effect: { kind: "bonus_if_neighbors", description: "前后相邻牌都可食用时，吃下额外 +2", trigger_action: "eat", target_edibility: EDIBLE, bonus: 2 } }),
  card({ id: "C001", sprite_x: 0, sprite_y: 2, name: "星星", rarity: "普通", type: "星体", edibility: INEDIBLE, eat_points: -2, discard_points: 1, role: PAYOFF, synergy_tags: ["星体", "末位", "位置"], effect: { kind: "bonus_if_position", description: "作为当前牌堆最后一张弃掉时额外 +2", trigger_action: "discard", position: "last", bonus: 2 } }),
  card({ id: "A001", sprite_x: 4, sprite_y: 2, name: "橘猫", rarity: "普通", type: "动物", edibility: INEDIBLE, eat_points: -2, discard_points: 1, role: PAYOFF, synergy_tags: ["动物", "相邻", "连弃"], effect: { kind: "bonus_if_previous", description: "紧接另一张弃牌后弃掉，额外 +1", trigger_action: "discard", sequence: "actions", previous_action: "discard", bonus: 1 } }),
  card({ id: "U001", sprite_x: 3, sprite_y: 3, name: "打折券", rarity: "普通", type: "通用", edibility: INEDIBLE, eat_points: -1, discard_points: 1, role: ECONOMY, synergy_tags: ["通用", "经济"], effect: { kind: "shop_discount", description: "每轮首次弃掉后，随后商店价格 -1", trigger_action: "discard", discount: 1, once_per_round: true } }),
];

const SHOP_CARD_DEFS = [
  // Fruits: sequence, growth, sacrifice, and memory payoffs.
  card({ id: "F003", sprite_x: 2, sprite_y: 0, name: "西瓜", rarity: "普通", type: "水果", edibility: EDIBLE, eat_points: 2, discard_points: 0, role: BASELINE, synergy_tags: ["水果", "大牌组", "保底"], effect: { kind: "scale_by_deck", description: "牌组中每有 4 张水果，吃下额外 +1（最多 +3）", trigger_action: "eat", target_type: "水果", divisor: 4, multiplier: 1, max_bonus: 3 } }),
  card({ id: "F004", sprite_x: 3, sprite_y: 0, sprite_hue: -18, name: "草莓", rarity: "罕见", type: "水果", edibility: EDIBLE, eat_points: 2, discard_points: 0, role: PAYOFF, synergy_tags: ["水果", "连锁", "追溯"], effect: { kind: "streak_scale", description: "吃下时，当前连续吃水果中的每张前置水果使本牌额外 +1（最多 +4）", trigger_action: "eat", history_action: "eat", target_type: "水果", multiplier: 1, max_bonus: 4 } }),
  card({ id: "F005", sprite_x: 0, sprite_y: 0, sprite_hue: 55, name: "金苹果", rarity: "稀有", type: "水果", edibility: EDIBLE, eat_points: 2, discard_points: 0, role: ENGINE, synergy_tags: ["水果", "成长"], effect: { kind: "permanent_growth_eat", description: "每次吃掉，自身吃分永久 +1", amount: 1 } }),
  card({ id: "F006", sprite_x: 0, sprite_y: 0, sprite_hue: 110, name: "腐烂苹果", rarity: "罕见", type: "水果", edibility: EDIBLE, eat_points: -2, discard_points: 0, role: SACRIFICE, synergy_tags: ["水果", "牺牲"], effect: { kind: "buff_next_action", description: "硬吃 -2；接下来 3 张水果吃分 +2", trigger_action: "eat", action: "eat", target_type: "水果", count: 3, modifier: "flat", add: 2 } }),
  card({ id: "F007", sprite_x: 2, sprite_y: 0, sprite_hue: -35, name: "水果拼盘", rarity: "稀有", type: "水果", edibility: EDIBLE, eat_points: 1, discard_points: 0, role: PAYOFF, synergy_tags: ["水果", "多样性", "追溯"], effect: { kind: "scale_by_unique_history", description: "吃下时，此前每吃过 1 种不同名称的水果，额外 +2（最多 +10）", trigger_action: "eat", history_action: "eat", target_type: "水果", multiplier: 2, max_bonus: 10 } }),
  card({ id: "F008", sprite_x: 4, sprite_y: 1, sprite_hue: 285, name: "火龙果", rarity: "稀有", type: "水果", edibility: EDIBLE, eat_points: 3, discard_points: 0, role: PAYOFF, synergy_tags: ["水果", "末位", "记牌"], effect: { kind: "bonus_if_position", description: "作为最后一张牌吃掉时额外 +8", trigger_action: "eat", position: "last", bonus: 8 } }),

  // Fast food: high printed value with aftertaste, chains, and retrospective scoring.
  card({ id: "K002", sprite_x: 3, sprite_y: 1, name: "拉面", rarity: "罕见", type: "快餐", edibility: EDIBLE, eat_points: 3, discard_points: 0, role: PAYOFF, synergy_tags: ["快餐", "饮料", "复制"], effect: { kind: "copy_previous_score_capped", description: "前一张行动牌为饮料时，吃下并复制其正得分（最多 +4）", trigger_action: "eat", target_type: "饮料", max_bonus: 4 } }),
  card({ id: "K003", sprite_x: 4, sprite_y: 0, sprite_hue: 28, name: "薯条", rarity: "普通", type: "快餐", edibility: EDIBLE, eat_points: 1, discard_points: 0, role: PAYOFF, synergy_tags: ["快餐", "相邻", "单侧"], effect: { kind: "bonus_if_exactly_one_neighbor", description: "前后两侧恰好只有 1 张快餐时，吃下额外 +3", trigger_action: "eat", target_type: "快餐", bonus: 3 } }),
  card({ id: "K004", sprite_x: 4, sprite_y: 0, sprite_scale: 1.12, name: "巨无霸", rarity: "稀有", type: "快餐", edibility: EDIBLE, eat_points: 4, discard_points: 0, role: SETUP, synergy_tags: ["快餐", "负面", "吃弃"], effect: { kind: "debuff_until_action", description: "吃下后，之后每张可食用牌吃分 -2，直到你弃掉任意 1 张牌为止", trigger_action: "eat", action: "eat", target_edibility: EDIBLE, amount: -2, stop_action: "discard" } }),
  card({ id: "K005", sprite_x: 3, sprite_y: 1, sprite_hue: 75, name: "发馊外卖", rarity: "稀有", type: "快餐", edibility: EDIBLE, eat_points: -3, discard_points: -3, role: SACRIFICE, synergy_tags: ["快餐", "回溯", "牺牲"], effect: { kind: "retro_multiplier_eaten_tag", description: "硬吃 -3；把此前快餐得分总和再加一份", trigger_action: "eat", target_type: "快餐", multiplier: 2 } }),

  // Desserts: reliable pairs and history engines.
  card({ id: "D002", sprite_x: 3, sprite_y: 0, name: "草莓蛋糕", rarity: "罕见", type: "甜点", edibility: EDIBLE, eat_points: 3, discard_points: 0, role: PAYOFF, synergy_tags: ["甜点", "水果", "相邻"], effect: { kind: "bonus_if_neighbor_pair", description: "前后两侧分别为水果与甜点（顺序不限）时，吃下额外 +4", trigger_action: "eat", left_type: "水果", right_type: "甜点", unordered: true, bonus: 4 } }),
  card({ id: "D003", sprite_x: 1, sprite_y: 1, name: "焦糖布丁", rarity: "普通", type: "甜点", edibility: EDIBLE, eat_points: 2, discard_points: 0, role: PAYOFF, synergy_tags: ["甜点", "弃食", "相邻"], effect: { kind: "bonus_if_previous", description: "前一张可食用牌被弃掉时，吃下额外 +3", trigger_action: "eat", sequence: "actions", previous_action: "discard", target_edibility: EDIBLE, bonus: 3 } }),
  card({ id: "D004", sprite_x: 2, sprite_y: 1, name: "冰淇淋", rarity: "罕见", type: "甜点", edibility: EDIBLE, eat_points: 2, discard_points: 0, role: SETUP, synergy_tags: ["甜点", "净化"], effect: { kind: "clear_debuff", description: "吃掉前，净化尚未触发的负面蓄势" } }),
  card({ id: "D005", sprite_x: 0, sprite_y: 1, sprite_hue: 28, name: "糖果", rarity: "普通", type: "甜点", edibility: EDIBLE, eat_points: 1, discard_points: 0, role: ENGINE, synergy_tags: ["甜点", "储存", "重洗"], effect: { kind: "store_or_cashout", description: "吃掉：这张实体牌储存 +2 分（最多 6）；弃掉：获得已储存分数并清空储存", store_action: "eat", cashout_action: "discard", amount: 2, max_stored: 6 } }),
  card({ id: "D006", sprite_x: 3, sprite_y: 0, sprite_scale: 1.1, name: "婚礼蛋糕", rarity: "稀有", type: "甜点", edibility: EDIBLE, eat_points: 2, discard_points: 0, role: PAYOFF, synergy_tags: ["甜点", "偶数位", "位置"], effect: { kind: "bonus_if_action_number", description: "在本轮偶数位行动中吃下时，额外 +5", trigger_action: "eat", parity: "even", bonus: 5 } }),

  // Drinks: tempo control and deliberate negative-eat burst turns.
  card({ id: "B001", sprite_x: 2, sprite_y: 1, sprite_hue: 150, name: "清水", rarity: "普通", type: "饮料", edibility: EDIBLE, eat_points: 1, discard_points: 0, role: SETUP, synergy_tags: ["饮料", "净化", "转化"], effect: { kind: "absorb_debuff", description: "吃下前净化全部待结算负面蓄势，并按其剩余负分绝对值获得加分（最多 +8）", trigger_action: "eat", max_bonus: 8 } }),
  card({ id: "B002", sprite_x: 2, sprite_y: 1, sprite_hue: 210, name: "汽水", rarity: "普通", type: "饮料", edibility: EDIBLE, eat_points: 2, discard_points: 0, role: SETUP, synergy_tags: ["饮料", "反转", "蓄势"], effect: { kind: "grant_opposite_side_next", description: "吃下后，后一张牌选择吃时改用其弃分，选择弃时改用其吃分", trigger_action: "eat" } }),
  card({ id: "B003", sprite_x: 1, sprite_y: 1, sprite_hue: 315, name: "黑咖啡", rarity: "罕见", type: "饮料", edibility: EDIBLE, eat_points: -2, discard_points: 0, role: SACRIFICE, synergy_tags: ["饮料", "牺牲", "爆发"], effect: { kind: "buff_next_action", description: "硬喝 -2；接下来 3 张可食用牌吃分 ×1.5", trigger_action: "eat", action: "eat", target_edibility: EDIBLE, count: 3, multiplier: 1.5 } }),
  card({ id: "B004", sprite_x: 2, sprite_y: 1, sprite_hue: 55, name: "鲜榨果汁", rarity: "罕见", type: "饮料", edibility: EDIBLE, eat_points: 2, discard_points: -1, role: PAYOFF, synergy_tags: ["饮料", "水果", "弃食", "相邻"], effect: { kind: "bonus_if_previous_score", description: "前一张行动牌是水果且得分至少为 2 时，弃掉额外 +4", trigger_action: "discard", target_type: "水果", minimum_score: 2, bonus: 4 } }),
  card({ id: "B005", sprite_x: 2, sprite_y: 1, sprite_hue: 275, name: "能量饮料", rarity: "稀有", type: "饮料", edibility: EDIBLE, eat_points: -4, discard_points: 0, role: SACRIFICE, synergy_tags: ["饮料", "牺牲", "爆发"], effect: { kind: "buff_next_action", description: "硬喝 -4；接下来 4 张牌得分 ×2", trigger_action: "eat", action: "*", count: 4, multiplier: 2 } }),

  // Vegetables: modest base, strong sequencing and permanent scaling.
  card({ id: "V001", sprite_x: 4, sprite_y: 1, sprite_hue: 45, name: "胡萝卜", rarity: "普通", type: "蔬菜", edibility: EDIBLE, eat_points: 1, discard_points: 0, role: PAYOFF, synergy_tags: ["蔬菜", "下一张", "位置"], effect: { kind: "bonus_if_next", description: "下一张牌是蔬菜时，吃下额外 +2", trigger_action: "eat", target_type: "蔬菜", bonus: 2 } }),
  card({ id: "V002", sprite_x: 4, sprite_y: 1, sprite_hue: 105, name: "西兰花", rarity: "普通", type: "蔬菜", edibility: EDIBLE, eat_points: 2, discard_points: 0, role: PAYOFF, synergy_tags: ["蔬菜", "弃食", "追溯"], effect: { kind: "scale_by_history", description: "吃下时，此前每弃掉 1 张蔬菜，额外 +2", trigger_action: "eat", history_action: "discard", target_type: "蔬菜", multiplier: 2 } }),
  card({ id: "V003", sprite_x: 3, sprite_y: 1, sprite_hue: 90, name: "蔬菜沙拉", rarity: "罕见", type: "蔬菜", edibility: EDIBLE, eat_points: 1, discard_points: 0, role: PAYOFF, synergy_tags: ["蔬菜", "多样性", "相邻"], effect: { kind: "bonus_if_different_previous", description: "前一张行动牌与本牌类别不同时，吃下额外 +3", trigger_action: "eat", bonus: 3 } }),
  card({ id: "V004", sprite_x: 4, sprite_y: 1, sprite_hue: 60, name: "黄金胡萝卜", rarity: "稀有", type: "蔬菜", edibility: EDIBLE, eat_points: 2, discard_points: 0, role: ENGINE, synergy_tags: ["蔬菜", "成长", "首位"], effect: { kind: "permanent_growth_condition", description: "作为本轮首张行动牌吃掉时，自身吃分成长 +2", trigger_action: "eat", condition: "position", position: "first", grow_stat: "eat_points", amount: 2, keywords: ["位置"] } }),

  // Celestials: discard chains, position memory, and screen-clearing capstones.
  card({ id: "C002", sprite_x: 1, sprite_y: 2, name: "月亮", rarity: "普通", type: "星体", edibility: INEDIBLE, eat_points: -3, discard_points: 2, role: PAYOFF, synergy_tags: ["星体", "相邻", "位置"], effect: { kind: "bonus_if_previous", description: "上一张弃牌是星体时额外 +2", trigger_action: "discard", sequence: "discard", target_type: "星体", bonus: 2 } }),
  card({ id: "C003", sprite_x: 0, sprite_y: 2, sprite_hue: 35, name: "太阳", rarity: "罕见", type: "星体", edibility: INEDIBLE, eat_points: -4, discard_points: 2, role: PAYOFF, synergy_tags: ["星体", "预判", "大牌组"], effect: { kind: "scale_by_remaining", description: "弃掉时，尚未处理的牌中每有 1 张星体，额外 +1（最多 +6）", trigger_action: "discard", target_type: "星体", multiplier: 1, max_bonus: 6 } }),
  card({ id: "C004", sprite_x: 2, sprite_y: 2, sprite_hue: 25, name: "彗星", rarity: "罕见", type: "星体", edibility: INEDIBLE, eat_points: -3, discard_points: 2, role: PAYOFF, synergy_tags: ["星体", "首位", "记牌"], effect: { kind: "bonus_if_position", description: "作为本轮第一张牌弃掉时额外 +4", trigger_action: "discard", position: "first", bonus: 4 } }),
  card({ id: "C005", sprite_x: 2, sprite_y: 2, name: "陨石", rarity: "稀有", type: "星体", edibility: INEDIBLE, eat_points: -6, discard_points: 4, role: PAYOFF, synergy_tags: ["星体", "清场"], effect: { kind: "discard_all_remaining", description: "弃掉时立即弃掉并结算所有剩余牌", trigger_action: "discard" } }),
  card({ id: "C006", sprite_x: 3, sprite_y: 2, name: "黑洞", rarity: "传奇", type: "星体", edibility: INEDIBLE, eat_points: -10, discard_points: 2, role: ENGINE, synergy_tags: ["星体", "清场", "倍率"], effect: { kind: "discard_all_remaining", description: "弃掉时全弃剩余牌，本轮最终得分 ×1.5", trigger_action: "discard", final_multiplier: 1.5 } }),

  // Animals: remember earlier actions, then cash out on discard.
  card({ id: "A002", sprite_x: 0, sprite_y: 3, name: "贪吃狗", rarity: "罕见", type: "动物", edibility: INEDIBLE, eat_points: -3, discard_points: 2, role: PAYOFF, synergy_tags: ["动物", "多样性", "食物"], effect: { kind: "scale_by_unique_history", description: "弃掉时，此前每吃过 1 种不同名称的可食用牌，额外 +1（最多 +6）", trigger_action: "discard", history_action: "eat", target_edibility: EDIBLE, multiplier: 1, max_bonus: 6 } }),
  card({ id: "A003", sprite_x: 4, sprite_y: 2, sprite_hue: 45, name: "猴子", rarity: "罕见", type: "动物", edibility: INEDIBLE, eat_points: -3, discard_points: 1, role: PAYOFF, synergy_tags: ["动物", "连锁", "水果"], effect: { kind: "streak_scale", description: "紧接连续吃水果后弃掉，每张连续水果额外 +2（最多 +8）", trigger_action: "discard", history_action: "eat", target_type: "水果", multiplier: 2, max_bonus: 8 } }),
  card({ id: "A004", sprite_x: 4, sprite_y: 2, sprite_hue: 300, name: "兔子", rarity: "普通", max_copies: 12, type: "动物", edibility: INEDIBLE, eat_points: -1, discard_points: 1, role: ENGINE, synergy_tags: ["动物", "兔子", "大牌组"], effect: { kind: "scale_by_deck", description: "弃掉时，牌组中每有 1 张兔子额外 +1（最多 +20）", trigger_action: "discard", target_id: "A004", divisor: 1, multiplier: 1, max_bonus: 20 } }),
  card({ id: "A005", sprite_x: 0, sprite_y: 3, sprite_hue: 305, sprite_scale: 1.1, name: "饕餮", rarity: "传奇", type: "动物", edibility: INEDIBLE, eat_points: -10, discard_points: 3, role: PAYOFF, synergy_tags: ["动物", "牺牲", "终结"], effect: { kind: "scale_by_negative_history", description: "弃掉时，此前每主动吃过 1 张负分牌，额外 +3（最多 +18）", trigger_action: "discard", history_action: "eat", multiplier: 3, max_bonus: 18 } }),

  // People: directional setup and one extreme sacrifice capstone.
  card({ id: "P001", sprite_x: 1, sprite_y: 3, name: "宇航员", rarity: "罕见", type: "人物", edibility: INEDIBLE, eat_points: -4, discard_points: 2, role: SETUP, synergy_tags: ["人物", "星体", "相邻"], effect: { kind: "buff_next_action", description: "仅当前一张行动牌是弃掉的星体时启动：接下来 2 张星体弃分 ×2", trigger_action: "discard", action: "discard", target_type: "星体", count: 2, multiplier: 2, requires_previous: { target_type: "星体", action: "discard" } } }),
  card({ id: "P002", sprite_x: 2, sprite_y: 3, name: "厨师", rarity: "稀有", type: "人物", edibility: INEDIBLE, eat_points: -4, discard_points: 3, role: SETUP, synergy_tags: ["人物", "食物"], effect: { kind: "buff_next_action", description: "接下来 2 张可食用牌吃分 ×1.5", trigger_action: "discard", action: "eat", target_edibility: EDIBLE, count: 2, multiplier: 1.5 } }),
  card({ id: "P003", sprite_x: 2, sprite_y: 3, sprite_hue: 70, name: "商人", rarity: "稀有", min_shop_round: 5, max_copies: 1, type: "人物", edibility: INEDIBLE, eat_points: -2, discard_points: 1, role: ECONOMY, synergy_tags: ["人物", "经济", "多样性", "唯一"], effect: { kind: "dynamic_shop_discount", description: "每轮首次弃掉时，本轮每处理过 3 种不同类别，随后商店卡牌价格 -1（最多 -3）", trigger_action: "discard", divisor: 3, max_discount: 3, once_per_round: true } }),
  card({ id: "P004", sprite_x: 2, sprite_y: 3, sprite_hue: 120, name: "营养师", rarity: "罕见", type: "人物", edibility: INEDIBLE, eat_points: -3, discard_points: 2, role: SETUP, synergy_tags: ["人物", "食物", "多样性"], effect: { kind: "buff_next_unique_types", description: "弃掉后，接下来 4 种不同类别的可食用牌各吃分 +2；重复类别不加分也不消耗名额", trigger_action: "discard", action: "eat", target_edibility: EDIBLE, count: 4, add: 2 } }),
  card({ id: "P005", sprite_x: 2, sprite_y: 3, sprite_hue: 45, sprite_scale: 1.12, name: "国王", rarity: "传奇", type: "人物", edibility: INEDIBLE, eat_points: -10, discard_points: 0, role: SACRIFICE, synergy_tags: ["人物", "牺牲", "赌注"], effect: { kind: "wager_next_action", description: "吃下 -10 后，后一张牌所选一侧牌面为正则得分 ×5；牌面不为正则额外 -5", trigger_action: "eat", multiplier: 5, failure_penalty: -5 } }),

  // Utilities: economy, targeted engines, discarded-food payoffs, and score copying.
  card({ id: "U002", sprite_x: 4, sprite_y: 3, name: "储钱罐", rarity: "稀有", min_shop_round: 4, max_copies: 1, type: "通用", edibility: INEDIBLE, eat_points: -2, discard_points: 0, role: ECONOMY, synergy_tags: ["通用", "经济", "摧毁", "唯一"], effect: { kind: "gold_economy", description: "每轮首次弃掉：结算金币 +3；吃掉：立即获得 10 金币并摧毁自身", discard_add_gold: 3, eat_destroy_add_gold: 10, once_per_round: true } }),
  card({ id: "U003", sprite_x: 2, sprite_y: 1, sprite_hue: 90, name: "榨汁机", rarity: "罕见", type: "通用", edibility: INEDIBLE, eat_points: -2, discard_points: 1, role: ENGINE, synergy_tags: ["通用", "水果", "摧毁", "生成"], effect: { kind: "destroy_previous_generate", description: "弃掉时，若前一张行动牌是水果，则摧毁它并生成 1 张鲜榨果汁", trigger_action: "discard", target_type: "水果", card_id: "B004", count: 1 } }),
  card({ id: "U004", sprite_x: 1, sprite_y: 1, sprite_hue: 105, name: "堆肥箱", rarity: "稀有", type: "通用", edibility: INEDIBLE, eat_points: -3, discard_points: 1, role: ECONOMY, synergy_tags: ["通用", "弃食", "经济"], effect: { kind: "gold_from_history", description: "每轮首次弃掉时，此前每弃掉 2 张可食用牌，结算金币 +1（最多 +4）", trigger_action: "discard", history_action: "discard", target_edibility: EDIBLE, divisor: 2, gold: 1, max_gold: 4, once_per_round: true } }),
  card({ id: "U005", sprite_x: 3, sprite_y: 2, sprite_hue: 170, name: "磁带复制机", rarity: "稀有", type: "通用", edibility: INEDIBLE, eat_points: -4, discard_points: 1, role: PAYOFF, synergy_tags: ["通用", "复制", "顺序"], effect: { kind: "copy_previous_score", description: "弃掉时，复制上一张牌的正得分", trigger_action: "discard" } }),
  card({ id: "U006", sprite_x: 3, sprite_y: 3, sprite_hue: 280, name: "黄金门票", rarity: "传奇", min_shop_round: 8, max_copies: 1, type: "通用", edibility: INEDIBLE, eat_points: -5, discard_points: 0, role: SACRIFICE, synergy_tags: ["通用", "牺牲", "经济", "唯一"], effect: { kind: "shop_discount", description: "每轮首次硬吃 -5；随后商店价格 -5", trigger_action: "eat", discount: 5, once_per_round: true } }),

  // Expansion: discard economy, small-deck loops, and positional engines.
  card({ id: "F009", name: "发芽种子", rarity: "罕见", max_copies: 3, type: "水果", edibility: EDIBLE, eat_points: 0, discard_points: -1, role: ENGINE, synergy_tags: ["水果", "成长", "重洗"], effect: { kind: "permanent_growth_condition", description: "本轮至少重洗 1 次后吃掉，自身吃分成长 +2；每次满足都可触发", trigger_action: "eat", condition: "reshuffled", grow_stat: "eat_points", amount: 2, keywords: ["重洗"] } }),
  card({ id: "C007", name: "冥王星", rarity: "罕见", type: "星体", edibility: INEDIBLE, eat_points: -5, discard_points: 2, role: PAYOFF, synergy_tags: ["星体", "末位", "相邻"], effect: { kind: "bonus_if_position_previous", description: "作为末位弃掉且前一张行动牌为星体时，额外 +10", trigger_action: "discard", position: "last", target_type: "星体", bonus: 10 } }),
  card({ id: "A006", name: "噬牌虎", rarity: "稀有", min_shop_round: 5, max_copies: 1, type: "动物", edibility: INEDIBLE, eat_points: -7, discard_points: 1, role: ENGINE, synergy_tags: ["动物", "摧毁", "位置", "成长"], effect: { kind: "consume_next_card", description: "弃掉时摧毁后一张可食用牌；自身弃分成长 +X，X 为其吃分绝对值（1～4）", trigger_action: "discard", target_edibility: EDIBLE, grow_stat: "discard_points", growth_source: "eat_points", max_growth: 4 } }),
  card({ id: "U007", name: "收银台", rarity: "普通", max_copies: 2, type: "通用", edibility: INEDIBLE, eat_points: -1, discard_points: -2, role: ECONOMY, synergy_tags: ["通用", "经济", "摧毁"], effect: { kind: "shop_free_reroll_destroy", description: "弃掉 -2；摧毁自身，使随后商店获得 1 次免费刷新", trigger_action: "discard", count: 1 } }),
  card({ id: "P006", name: "拾荒者", rarity: "罕见", min_shop_round: 3, max_copies: 1, type: "人物", edibility: INEDIBLE, eat_points: -4, discard_points: 1, role: ECONOMY, synergy_tags: ["人物", "弃牌", "经济", "唯一"], effect: { kind: "gold_on_discard_count", description: "弃掉时，此前每弃 3 张牌结算金币 +2，最多 +6", trigger_action: "discard", count: 3, gold: 2, max_triggers: 3 } }),
  card({ id: "U008", name: "袖珍洗牌机", rarity: "罕见", max_copies: 2, type: "通用", edibility: INEDIBLE, eat_points: -3, discard_points: 0, role: ENGINE, synergy_tags: ["通用", "重洗", "摧毁"], effect: { kind: "gain_reshuffle_charge_destroy", description: "牌组不超过 10 张时弃掉：摧毁自身，本轮重洗次数 +1", trigger_action: "discard", max_deck_size: 10, count: 1 } }),
  card({ id: "D007", name: "夹心饼干", rarity: "稀有", min_shop_round: 4, type: "甜点", edibility: EDIBLE, eat_points: 2, discard_points: -1, role: PAYOFF, synergy_tags: ["甜点", "相邻", "多样性"], effect: { kind: "bonus_if_neighbor_types_different", description: "前后相邻牌都存在且类别互不相同时，吃下额外 +7", trigger_action: "eat", bonus: 7 } }),
  card({ id: "C008", name: "双子星", rarity: "稀有", min_shop_round: 4, type: "星体", edibility: INEDIBLE, eat_points: -6, discard_points: 2, role: PAYOFF, synergy_tags: ["星体", "相邻", "位置"], effect: { kind: "bonus_if_neighbors", description: "前后相邻牌都是星体时，弃掉额外 +8", trigger_action: "discard", target_type: "星体", bonus: 8 } }),
  card({ id: "U009", name: "节拍器", rarity: "罕见", type: "通用", edibility: INEDIBLE, eat_points: -3, discard_points: 1, role: PAYOFF, synergy_tags: ["通用", "交替", "节奏"], effect: { kind: "bonus_if_previous", description: "紧接吃牌后弃掉时额外 +3", trigger_action: "discard", sequence: "actions", previous_action: "eat", bonus: 3 } }),

  // v0.7 expansion: positional payoffs, large-deck floors, generation and exhaust-style cards.
  card({ id: "F010", name: "橙子", rarity: "普通", type: "水果", edibility: EDIBLE, eat_points: 1, discard_points: 0, role: PAYOFF, synergy_tags: ["水果", "相邻", "预判"], effect: { kind: "bonus_if_next", description: "后一张牌是水果时，吃下额外 +2", trigger_action: "eat", target_type: "水果", bonus: 2 } }),
  card({ id: "F011", name: "柠檬", rarity: "罕见", type: "水果", edibility: EDIBLE, eat_points: -1, discard_points: 0, role: PAYOFF, synergy_tags: ["水果", "吃弃", "节奏"], effect: { kind: "bonus_if_action_streak", description: "紧接连续 2 次弃牌后吃下，额外 +5", trigger_action: "eat", history_action: "discard", count: 2, bonus: 5 } }),
  card({ id: "F012", name: "葡萄串", rarity: "罕见", type: "水果", edibility: EDIBLE, eat_points: 1, discard_points: -1, role: PAYOFF, synergy_tags: ["水果", "相邻", "位置"], effect: { kind: "bonus_if_neighbors", description: "前后相邻牌都是水果时，吃下额外 +5", trigger_action: "eat", target_type: "水果", bonus: 5 } }),
  card({ id: "F013", name: "榴莲", rarity: "稀有", min_shop_round: 3, type: "水果", edibility: EDIBLE, eat_points: 4, discard_points: -2, role: SACRIFICE, synergy_tags: ["水果", "首位", "奖惩"], effect: { kind: "position_tradeoff", description: "本轮首张吃：额外 +4；否则额外 -3", trigger_action: "eat", position: "first", bonus: 4, penalty: -3 } }),
  card({ id: "F014", name: "果核", rarity: "普通", max_copies: 2, type: "水果", edibility: EDIBLE, eat_points: 0, discard_points: -1, role: ENGINE, synergy_tags: ["水果", "生成", "成长"], effect: { kind: "generate_card", description: "每轮首次吃掉后，向牌组生成 1 张发芽种子（最多 3 张）", trigger_action: "eat", card_id: "F009", max_generated_copies: 3, once_per_round: true } }),
  card({ id: "F015", name: "丰收篮", rarity: "传奇", min_shop_round: 8, max_copies: 1, type: "水果", edibility: EDIBLE, eat_points: 1, discard_points: -3, role: PAYOFF, synergy_tags: ["水果", "多样性", "大牌组"], effect: { kind: "scale_by_unique_deck", description: "牌组中每有 1 种不同名称的水果，吃下额外 +1（最多 +15）", trigger_action: "eat", target_type: "水果", multiplier: 1, max_bonus: 15 } }),

  card({ id: "K006", name: "热狗", rarity: "普通", type: "快餐", edibility: EDIBLE, eat_points: 2, discard_points: 0, role: PAYOFF, synergy_tags: ["快餐", "次序", "位置"], effect: { kind: "bonus_if_action_number", description: "作为本轮第 3 张行动牌吃下时，额外 +4", trigger_action: "eat", number: 3, bonus: 4 } }),
  card({ id: "K007", name: "辣鸡翅", rarity: "罕见", type: "快餐", edibility: EDIBLE, eat_points: 3, discard_points: -1, role: SETUP, synergy_tags: ["快餐", "吃弃", "蓄势"], effect: { kind: "buff_next_action", description: "吃下后，接下来 2 张弃牌各额外 +2", trigger_action: "eat", action: "discard", count: 2, modifier: "flat", add: 2 } }),
  card({ id: "K008", name: "披萨", rarity: "稀有", min_shop_round: 3, type: "快餐", edibility: EDIBLE, eat_points: 2, discard_points: 0, role: PAYOFF, synergy_tags: ["快餐", "大牌组", "保底"], effect: { kind: "scale_by_deck", description: "牌组中每有 5 张可食用牌，吃下额外 +2（最多 +12）", trigger_action: "eat", target_edibility: EDIBLE, divisor: 5, multiplier: 2, max_bonus: 12 } }),
  card({ id: "K009", name: "外卖袋", rarity: "普通", max_copies: 2, type: "快餐", edibility: INEDIBLE, eat_points: -2, discard_points: 0, role: ENGINE, synergy_tags: ["快餐", "生成", "末位"], effect: { kind: "generate_card", description: "每轮首次作为末位弃掉时，向牌组生成 2 张热狗（热狗最多 4 张）", trigger_action: "discard", condition_position: "last", card_id: "K006", count: 2, max_generated_copies: 4, once_per_round: true } }),
  card({ id: "K010", name: "深夜套餐", rarity: "传奇", min_shop_round: 8, max_copies: 1, type: "快餐", edibility: EDIBLE, eat_points: 5, discard_points: -4, role: SACRIFICE, synergy_tags: ["快餐", "末位", "奖惩"], effect: { kind: "position_tradeoff", description: "末位吃：额外 +15；提前吃：额外 -5", trigger_action: "eat", position: "last", bonus: 15, penalty: -5 } }),

  card({ id: "D008", name: "马卡龙", rarity: "普通", type: "甜点", edibility: EDIBLE, eat_points: 1, discard_points: 0, role: PAYOFF, synergy_tags: ["甜点", "相邻", "预判"], effect: { kind: "bonus_if_next", description: "后一张牌为普通牌时，吃下额外 +3", trigger_action: "eat", target_rarity: "普通", bonus: 3 } }),
  card({ id: "D009", name: "棉花糖", rarity: "罕见", max_copies: 2, type: "甜点", edibility: EDIBLE, eat_points: 0, discard_points: -1, role: SACRIFICE, synergy_tags: ["甜点", "摧毁", "启动"], effect: { kind: "destroy_self_buff", description: "吃掉后摧毁自身；接下来 3 张可食用牌吃分 +1", trigger_action: "eat", action: "eat", target_edibility: EDIBLE, count: 3, modifier: "flat", add: 1 } }),
  card({ id: "D010", name: "生日蜡烛", rarity: "罕见", type: "甜点", edibility: INEDIBLE, eat_points: -3, discard_points: 1, role: SACRIFICE, synergy_tags: ["甜点", "首位", "奖惩"], effect: { kind: "position_tradeoff", description: "本轮首张弃：额外 +5；否则额外 -2", trigger_action: "discard", position: "first", bonus: 5, penalty: -2 } }),
  card({ id: "D011", name: "千层蛋糕", rarity: "稀有", min_shop_round: 3, type: "甜点", edibility: EDIBLE, eat_points: 2, discard_points: 0, role: PAYOFF, synergy_tags: ["甜点", "弃食", "多样性"], effect: { kind: "scale_by_unique_history", description: "吃下时，此前每弃过 1 种不同名称的甜点，额外 +3（最多 +12）", trigger_action: "eat", history_action: "discard", target_type: "甜点", multiplier: 3, max_bonus: 12 } }),
  card({ id: "D012", name: "时间布丁", rarity: "传奇", min_shop_round: 8, max_copies: 1, type: "甜点", edibility: EDIBLE, eat_points: 1, discard_points: -3, role: PAYOFF, synergy_tags: ["甜点", "复制", "位置"], effect: { kind: "copy_previous_score", description: "吃下时，复制紧邻上一张牌的正得分", trigger_action: "eat" } }),

  card({ id: "B006", name: "牛奶", rarity: "普通", type: "饮料", edibility: EDIBLE, eat_points: 1, discard_points: 0, role: SETUP, synergy_tags: ["饮料", "净化", "重置"], effect: { kind: "reset_buffs_bonus", description: "吃下前净化全部正负蓄势；每移除 1 个蓄势，本牌额外 +2（最多 +6）", trigger_action: "eat", bonus_per_buff: 2, max_bonus: 6 } }),
  card({ id: "B007", name: "苦茶", rarity: "罕见", type: "饮料", edibility: EDIBLE, eat_points: -1, discard_points: 0, role: PAYOFF, synergy_tags: ["饮料", "负分", "相邻"], effect: { kind: "bonus_if_previous", description: "紧接一张负分牌后喝下，额外 +5", trigger_action: "eat", sequence: "actions", previous_negative: true, bonus: 5 } }),
  card({ id: "B008", name: "奶昔", rarity: "罕见", type: "饮料", edibility: EDIBLE, eat_points: 2, discard_points: -1, role: PAYOFF, synergy_tags: ["饮料", "水果", "相邻"], effect: { kind: "bonus_if_exactly_one_neighbor", description: "前后两侧恰好只有 1 张水果时，吃下额外 +4", trigger_action: "eat", target_type: "水果", bonus: 4 } }),
  card({ id: "B009", name: "空瓶", rarity: "普通", max_copies: 2, type: "饮料", edibility: INEDIBLE, eat_points: -2, discard_points: 1, role: ENGINE, synergy_tags: ["饮料", "生成", "摧毁"], effect: { kind: "generate_card", description: "弃掉后摧毁自身，并向牌组生成 1 张牛奶（牛奶最多 2 张）", trigger_action: "discard", card_id: "B006", max_generated_copies: 2, destroy_self: true } }),
  card({ id: "B010", name: "狂饮壶", rarity: "传奇", min_shop_round: 8, max_copies: 1, type: "饮料", edibility: EDIBLE, eat_points: -5, discard_points: -2, role: SACRIFICE, synergy_tags: ["饮料", "牺牲", "爆发"], effect: { kind: "buff_next_action", description: "吃下后，接下来 5 张饮料的吃分 ×2；其他类别不消耗次数", trigger_action: "eat", action: "eat", target_type: "饮料", count: 5, multiplier: 2 } }),

  card({ id: "V005", name: "菠菜", rarity: "普通", type: "蔬菜", edibility: EDIBLE, eat_points: 1, discard_points: 0, role: PAYOFF, synergy_tags: ["蔬菜", "次位", "位置"], effect: { kind: "bonus_if_position", description: "作为本轮第 2 张行动牌吃下时，额外 +4", trigger_action: "eat", position: "second", bonus: 4 } }),
  card({ id: "V006", name: "洋葱", rarity: "罕见", type: "蔬菜", edibility: EDIBLE, eat_points: 1, discard_points: -1, role: SETUP, synergy_tags: ["蔬菜", "吃弃", "抉择"], effect: { kind: "force_next_action_reward", description: "吃下后，后一张牌若弃掉则额外 +4；若吃掉则额外 -2", trigger_action: "eat", good_action: "discard", good_bonus: 4, bad_action: "eat", bad_penalty: -2 } }),
  card({ id: "V007", name: "南瓜", rarity: "稀有", min_shop_round: 3, type: "蔬菜", edibility: EDIBLE, eat_points: 3, discard_points: 0, role: PAYOFF, synergy_tags: ["蔬菜", "专精", "保底"], effect: { kind: "bonus_if_type_majority", description: "牌组中蔬菜数量不低于全部牌的一半时，吃下额外 +8", trigger_action: "eat", target_type: "蔬菜", ratio: 0.5, bonus: 8 } }),
  card({ id: "V008", name: "豆芽", rarity: "普通", max_copies: 2, type: "蔬菜", edibility: EDIBLE, eat_points: 0, discard_points: -1, role: ENGINE, synergy_tags: ["蔬菜", "成长", "累计"], effect: { kind: "permanent_growth_condition", description: "这张实体牌累计每吃 3 次，自身吃分成长 +2；进度跨轮保留", trigger_action: "eat", condition: "every_n_uses", every: 3, grow_stat: "eat_points", amount: 2 } }),
  card({ id: "V009", name: "蔬菜汤", rarity: "传奇", min_shop_round: 8, max_copies: 1, type: "蔬菜", edibility: EDIBLE, eat_points: 2, discard_points: -3, role: ENGINE, synergy_tags: ["蔬菜", "摧毁", "成长", "位置"], effect: { kind: "consume_previous_card", description: "吃下时摧毁前一张蔬菜；自身吃分成长 +X，X 为该牌吃/弃分绝对值较高者（1～5）", trigger_action: "eat", target_type: "蔬菜", grow_stat: "eat_points", max_growth: 5 } }),

  card({ id: "C009", name: "卫星", rarity: "普通", type: "星体", edibility: INEDIBLE, eat_points: -2, discard_points: 1, role: PAYOFF, synergy_tags: ["星体", "相邻", "预判"], effect: { kind: "bonus_if_next", description: "后一张牌是星体时，弃掉额外 +3", trigger_action: "discard", target_type: "星体", bonus: 3 } }),
  card({ id: "C010", name: "新月", rarity: "罕见", type: "星体", edibility: INEDIBLE, eat_points: -4, discard_points: 1, role: SACRIFICE, synergy_tags: ["星体", "第二位", "奖惩"], effect: { kind: "position_tradeoff", description: "作为本轮第 2 张牌弃掉：额外 +5；否则 -1", trigger_action: "discard", position: "second", bonus: 5, penalty: -1 } }),
  card({ id: "C011", name: "日食", rarity: "稀有", min_shop_round: 4, type: "星体", edibility: INEDIBLE, eat_points: -7, discard_points: 0, role: PAYOFF, synergy_tags: ["星体", "相邻", "混合"], effect: { kind: "bonus_if_mixed_neighbors", description: "前后相邻牌都存在，且恰好一张为星体时，弃掉额外 +8", trigger_action: "discard", target_type: "星体", bonus: 8 } }),
  card({ id: "C012", name: "星图", rarity: "罕见", type: "星体", edibility: INEDIBLE, eat_points: -3, discard_points: 1, role: PAYOFF, synergy_tags: ["星体", "多样性", "保底"], effect: { kind: "scale_by_unique_deck", description: "牌组中每有 1 种不同名称的星体，弃掉额外 +2（最多 +12）", trigger_action: "discard", target_type: "星体", multiplier: 2, max_bonus: 12 } }),
  card({ id: "C013", name: "超新星", rarity: "传奇", min_shop_round: 8, max_copies: 1, type: "星体", edibility: INEDIBLE, eat_points: -9, discard_points: -3, role: SACRIFICE, synergy_tags: ["星体", "摧毁", "爆发"], effect: { kind: "destroy_self_buff", description: "弃掉后摧毁自身；接下来 4 张不可食用牌弃分 ×2", trigger_action: "discard", action: "discard", target_edibility: INEDIBLE, count: 4, multiplier: 2 } }),

  card({ id: "A007", name: "狐狸", rarity: "普通", type: "动物", edibility: INEDIBLE, eat_points: -2, discard_points: 1, role: PAYOFF, synergy_tags: ["动物", "高分", "相邻"], effect: { kind: "bonus_if_previous_score", description: "前一张行动牌得分至少为 3 时，弃掉额外 +3", trigger_action: "discard", minimum_score: 3, bonus: 3 } }),
  card({ id: "A008", name: "松鼠", rarity: "罕见", max_copies: 1, type: "动物", edibility: INEDIBLE, eat_points: -3, discard_points: 0, role: ECONOMY, synergy_tags: ["动物", "摧毁", "经济"], effect: { kind: "destroy_previous_for_gold", description: "弃掉时摧毁前一张可食用牌，并按其稀有度获得结算金币：普通 +1、罕见 +2、稀有 +4、传奇 +7", trigger_action: "discard", target_edibility: EDIBLE, rarity_gold: { "普通": 1, "罕见": 2, "稀有": 4, "传奇": 7, "诅咒": 0 } } }),
  card({ id: "A009", name: "母鸡", rarity: "罕见", max_copies: 2, type: "动物", edibility: INEDIBLE, eat_points: -3, discard_points: 1, role: ENGINE, synergy_tags: ["动物", "生成", "相邻"], effect: { kind: "generate_card", description: "每轮首次紧接动物牌后弃掉时，向牌组生成 1 张鸡蛋（鸡蛋最多 4 张）", trigger_action: "discard", requires_previous: { target_type: "动物" }, card_id: "A010", max_generated_copies: 4, once_per_round: true } }),
  card({ id: "A010", name: "鸡蛋", rarity: "普通", type: "动物", edibility: EDIBLE, eat_points: 1, discard_points: 0, role: PAYOFF, synergy_tags: ["动物", "生成", "孵化"], effect: { kind: "bonus_if_generated", description: "若这张鸡蛋由母鸡【生成】，吃下额外 +4；商店购买的鸡蛋不触发", trigger_action: "eat", generated_from: "A009", bonus: 4 } }),
  card({ id: "A011", name: "狼", rarity: "稀有", min_shop_round: 4, max_copies: 1, type: "动物", edibility: INEDIBLE, eat_points: -6, discard_points: 1, role: ENGINE, synergy_tags: ["动物", "摧毁", "成长", "位置"], effect: { kind: "consume_next_card", description: "弃掉时摧毁后一张动物牌；自身弃分按其稀有度成长：普通 +1、罕见 +2、稀有 +3、传奇 +5", trigger_action: "discard", target_type: "动物", grow_stat: "discard_points", growth_source: "rarity", max_growth: 5 } }),
  card({ id: "A012", name: "兔群头领", rarity: "传奇", min_shop_round: 8, max_copies: 1, type: "动物", edibility: INEDIBLE, eat_points: -8, discard_points: 2, role: PAYOFF, synergy_tags: ["动物", "兔子", "编队"], effect: { kind: "rabbit_formation", description: "弃掉时，牌组中每组成 1 对兔子额外 +3（最多 +18）；落单兔子不计分", trigger_action: "discard", rabbit_id: "A004", pair_bonus: 3, max_bonus: 18 } }),

  card({ id: "P007", name: "园丁", rarity: "普通", max_copies: 2, type: "人物", edibility: INEDIBLE, eat_points: -2, discard_points: 1, role: ENGINE, synergy_tags: ["人物", "生成", "成长"], effect: { kind: "generate_card", description: "每轮首次紧接弃掉的蔬菜后弃掉时，向牌组生成 1 张豆芽（豆芽最多 3 张）", trigger_action: "discard", requires_previous: { target_type: "蔬菜", action: "discard" }, card_id: "V008", max_generated_copies: 3, once_per_round: true } }),
  card({ id: "P008", name: "魔术师", rarity: "罕见", type: "人物", edibility: INEDIBLE, eat_points: -3, discard_points: 1, role: PAYOFF, synergy_tags: ["人物", "下一张", "复制"], effect: { kind: "bonus_from_next_base", description: "弃掉时，复制后一张牌吃/弃分中较高的正牌面分（最多 +6）", trigger_action: "discard", max_bonus: 6 } }),
  card({ id: "P009", name: "牌序师", rarity: "稀有", min_shop_round: 4, type: "人物", edibility: INEDIBLE, eat_points: -5, discard_points: 1, role: SACRIFICE, synergy_tags: ["人物", "中位", "奖惩"], effect: { kind: "position_tradeoff", description: "既非首位也非末位时弃掉：额外 +8；否则 -1", trigger_action: "discard", position: "middle", bonus: 8, penalty: -1 } }),
  card({ id: "P010", name: "清道夫", rarity: "罕见", max_copies: 1, type: "人物", edibility: INEDIBLE, eat_points: -4, discard_points: 0, role: ECONOMY, synergy_tags: ["人物", "摧毁", "精简", "经济"], effect: { kind: "destroy_previous_discount", description: "弃掉时摧毁前一张牌，并按其稀有度降低随后商店卡价：普通/罕见 -1、稀有 -2、传奇 -4", trigger_action: "discard", rarity_discount: { "普通": 1, "罕见": 1, "稀有": 2, "传奇": 4, "诅咒": 0 } } }),
  card({ id: "P011", name: "赌徒", rarity: "稀有", min_shop_round: 4, max_copies: 2, type: "人物", edibility: INEDIBLE, eat_points: -5, discard_points: -2, role: SACRIFICE, synergy_tags: ["人物", "摧毁", "爆发"], effect: { kind: "destroy_self_buff", description: "弃掉后摧毁自身；后一张牌得分 ×3", trigger_action: "discard", action: "*", count: 1, multiplier: 3 } }),
  card({ id: "P012", name: "队长", rarity: "传奇", min_shop_round: 8, max_copies: 1, type: "人物", edibility: INEDIBLE, eat_points: -8, discard_points: 2, role: PAYOFF, synergy_tags: ["人物", "大牌组", "保底"], effect: { kind: "scale_by_deck", description: "牌组每有 5 张牌，弃掉额外 +2（最多 +20）", trigger_action: "discard", divisor: 5, multiplier: 2, max_bonus: 20 } }),

  card({ id: "U010", name: "路标", rarity: "普通", type: "通用", edibility: INEDIBLE, eat_points: -2, discard_points: 1, role: SETUP, synergy_tags: ["通用", "下一张", "选择"], effect: { kind: "grant_best_side_next", description: "弃掉后，后一张牌无论吃或弃，都改用其两项牌面分中较高的一项", trigger_action: "discard" } }),
  card({ id: "U011", name: "订书机", rarity: "罕见", type: "通用", edibility: INEDIBLE, eat_points: -3, discard_points: 0, role: PAYOFF, synergy_tags: ["通用", "相邻", "位置"], effect: { kind: "bonus_if_matching_neighbors", description: "前后相邻牌类别相同时，弃掉额外 +6", trigger_action: "discard", bonus: 6 } }),
  card({ id: "U012", name: "垃圾桶", rarity: "稀有", min_shop_round: 4, max_copies: 1, type: "通用", edibility: INEDIBLE, eat_points: -5, discard_points: 1, role: ECONOMY, synergy_tags: ["通用", "摧毁", "精简", "经济"], effect: { kind: "destroy_next_for_gold", description: "弃掉时摧毁后一张牌并获得金币：普通 +1、罕见 +2、稀有 +4、传奇 +7、诅咒 +0", trigger_action: "discard", rarity_gold: { "普通": 1, "罕见": 2, "稀有": 4, "传奇": 7, "诅咒": 0 } } }),
  card({ id: "U013", name: "复印纸", rarity: "普通", max_copies: 2, type: "通用", edibility: INEDIBLE, eat_points: -2, discard_points: 0, role: ENGINE, synergy_tags: ["通用", "生成", "预判"], effect: { kind: "generate_card", description: "每轮首次在后一张为不可食用牌时弃掉，向牌组生成 1 张路标（路标最多 3 张）", trigger_action: "discard", requires_next: { target_edibility: INEDIBLE }, card_id: "U010", max_generated_copies: 3, once_per_round: true } }),
  card({ id: "U014", name: "秒表", rarity: "罕见", type: "通用", edibility: INEDIBLE, eat_points: -3, discard_points: 1, role: PAYOFF, synergy_tags: ["通用", "偶数位", "位置"], effect: { kind: "bonus_if_action_number", description: "在本轮偶数位行动中弃掉时，额外 +3", trigger_action: "discard", parity: "even", bonus: 3 } }),
  card({ id: "U015", name: "小钱包", rarity: "稀有", min_shop_round: 4, max_copies: 1, type: "通用", edibility: INEDIBLE, eat_points: -4, discard_points: 0, role: ECONOMY, synergy_tags: ["通用", "弃牌", "经济"], effect: { kind: "gain_gold", description: "每轮首次弃掉时，结算金币 +2", trigger_action: "discard", gold: 2, once_per_round: true } }),
  card({ id: "U016", name: "压缩器", rarity: "传奇", min_shop_round: 8, max_copies: 1, type: "通用", edibility: INEDIBLE, eat_points: -8, discard_points: -3, role: SACRIFICE, synergy_tags: ["通用", "摧毁", "爆发"], effect: { kind: "destroy_self_buff", description: "弃掉后摧毁自身；接下来 3 张牌各额外 +4", trigger_action: "discard", action: "*", count: 3, modifier: "flat", add: 4 } }),
];

const QUEST_CARD_DEFS = [
  card({ id: "Q001", name: "虚空牌", rarity: "诅咒", type: "无类别", edibility: INEDIBLE, eat_points: -1, discard_points: -1, role: SACRIFICE, synergy_tags: ["诅咒", "任务", "负面"], effect: null }),
];

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
  FRUIT: "水果", FASTFOOD: "快餐", DESSERT: "甜点", DRINK: "饮料", VEGETABLE: "蔬菜",
  CELESTIAL: "星体", PERSON: "人物", ANIMAL: "动物", UTILITY: "通用",
});

export const CARD_LIBRARY = Object.freeze([...BASE_CARD_DEFS, ...SHOP_CARD_DEFS, ...QUEST_CARD_DEFS].reduce((library, source) => {
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
