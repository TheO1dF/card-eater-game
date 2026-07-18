# Godot 迁移设计

当前 Demo 的核心约束是：游戏状态、卡牌、规则与结算结果都可被 `JSON.stringify`，核心计分不得访问 DOM、Web Audio、LocalStorage 或浏览器时间。H5 只是一层表现与平台适配，Godot 可以复刻同一数据契约与测试向量。

## 模块映射

| H5 模块 | Godot 建议实现 | 职责 |
| --- | --- | --- |
| `config.js`, `balance.js` | `GameConfig.gd` / `.tres` | 轮数、门槛、价格、商店权重 |
| `data.js`, `rules.js` | JSON / Godot Resource | 卡牌与永久规则内容库 |
| `state.js` | `GameState.gd`（Resource） | 可存档状态与阶段流转 |
| `engine.js` | `RoundEngine.gd`（RefCounted） | 行为记录、序列、效果、结算 |
| `platform.js` | Autoload `Platform.gd` | 时间、随机种子、UUID、震动、存档 |
| `gesture.js` | `CardDragController.gd` | 触摸/鼠标输入和甩动判定 |
| `ui.js`, `main.js` | Control 场景 + `GameController.gd` | 展示和流程编排 |

## 稳定的数据契约

字段统一使用 `snake_case`，阶段枚举保持 `Init / RuleDraft / Playing / Scoring / Shop / NextRound / GameOver`：

```json
{
  "schema_version": 2,
  "phase": "Playing",
  "current_round": 6,
  "total_score": 220,
  "gold": 9,
  "deck": [],
  "active_rules": [],
  "rule_history": [],
  "round": {
    "draw_pile": [],
    "actions": [],
    "eat_sequence": [],
    "discard_sequence": [],
    "buffs": [],
    "final_multipliers": [],
    "pending_gold_bonus": 0,
    "shop_discount": 0,
    "elapsed_ms": 0
  }
}
```

`active_rules` 是本局永久规则集合，每轮只追加、不替换；`rule_history` 用于回放与分析。卡牌稳定字段包括 `id/name/rarity/type/edibility/eat_points/discard_points/role/synergy_tags/effect`。像素资源由原始 5×4 初始牌图集和 5 张新生成的 5×2 透明图集组成，每张卡保存 `sprite_sheet/sprite_columns/sprite_rows/sprite_x/sprite_y`；H5 默认读取轻量 WebP，仓库保留同名 PNG 源图，Godot 可任选其一建立 `AtlasTexture`，无需再依赖同图换色。

`effect.kind` 使用数据驱动分派，当前类型包括：`buff_next_action`、`debuff_next_action`、`clear_debuff`、`permanent_growth_eat`、`gold_economy`、`shop_discount`、`scale_by_history`、`retro_multiplier_eaten_tag`、`bonus_if_previous`、`bonus_if_position`、`copy_previous_score`、`discard_all_remaining`。移植时按 `kind` 建立 Effect Resolver，不要为具体卡牌 ID 写分支。

`actions` 保存全局顺序；`eat_sequence` 与 `discard_sequence` 只接收对应行为。新 Buff 在当前牌结算后加入，所以只影响未来牌；永久成长写回 `deck` 中 UUID 相同的牌，不写入当轮复制的 `draw_pile`。

## Godot 输入手感复刻

使用单个 `Control` 卡牌节点处理 `_gui_input`，兼容 `InputEventScreenTouch`、`InputEventScreenDrag` 和鼠标：

1. 按下时记录位置与时间，并调用 `accept_event()`。
2. 拖动时只更新视觉 Transform，规则核心不接收未提交动作。
3. 保存指数平滑后的纵向速度，松手时计算 `projected_y = drag_y + velocity_y * 120ms`。
4. 阈值使用卡牌高度的 22%，限制在 72–116 逻辑像素；短甩动至少 24 像素且速度达到 0.62 px/ms。
5. 达标后先播放约 170ms 离场 Tween，再发出 `card_committed(action, uuid)`；未达标播放带轻微过冲的回弹。

视觉、音频、震动应订阅 `card_committed`、`effect_triggered` 与结算事件，不能反向修改核心分数。连击音高由表现层根据连续相同行动数计算，可直接替换为 Godot `AudioStreamPlayer.pitch_scale`。

## 推荐场景树

```text
Game (Control)
├── HUD (Control)
├── Playfield (Control)
│   ├── DiscardZone
│   ├── CardStack
│   └── EatZone
├── Controls
└── OverlayLayer (CanvasLayer)
    ├── RuleDraft
    ├── RoundSummary
    ├── Shop
    └── GameOver
```

移动端建议使用竖屏基准 720×1280、`canvas_items` 拉伸与安全区容器；桌面端在同一场景限制最大桌面宽度。像素素材关闭 Filter 与 Mipmaps，UI 位移尽量落在整数像素。

## 迁移顺序

1. 将 `config/balance/data/rules` 导出为 JSON 或 Resource，并校验卡牌、规则 ID 唯一。
2. 按 `test/core.test.js` 的输入输出移植 `GameState` 与 `RoundEngine`。
3. 复刻状态迁移表、永久规则追加与全局去重抽取。
4. 接入卡牌场景、Tween、触摸手势和像素图集。
5. 最后接商店、音频、震动和平台存档；保持 `RoundEngine` 无平台依赖。
