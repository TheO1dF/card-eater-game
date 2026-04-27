# 游戏名称：吃牌肉鸽 (Eat & Discard Roguelike)
# 项目类型：移动端/网页端适配的纯前端静态 Web 游戏 (HTML/CSS/Vanilla JS)

## 1. 游戏概述
这是一款结合了左右/上下滑动机制（类似 Reigns/Tinder）、卡牌构筑（DBG）和倍率结算（类似 Balatro）的肉鸽游戏。
核心交互：玩家对居中的卡牌向上滑动（弃牌）或向下滑动（吃牌）。
核心循环：15轮游戏，每轮包含：三选一规则奖励 -> 吃弃牌消耗牌库 -> 结算倍率/加分 -> 进入商店 -> 下一轮。每5轮有目标分数门槛。

## 2. 核心数据结构 (Data Models)
### 2.1 卡牌 (Card)
- `id`: String (唯一标识)
- `name`: String (卡牌名称，如：苹果)
- `type`: String (类型：水果/星体/动物/特殊)
- `eat_points`: Number (吃牌基础分)
- `discard_points`: Number (弃牌基础分)
- `effect`: Object/Null (特殊效果，如：下一次吃牌翻倍)

### 2.2 规则/遗物 (Rule/Reward)
- `id`: String
- `name`: String
- `description`: String
- `trigger_type`: String (触发类型：如 sequence_eat 连续吃, time_limit 时间限制)
- `condition`: Object (触发条件：如 target_type: 水果, count: 3)
- `multiplier`: Number (倍率奖励)

### 2.3 玩家状态 (Player State)
- `current_round`: Number (1~15)
- `total_score`: Number (累计总分)
- `target_score`: Number (当前阶段目标分，第5/10/15轮检查)
- `gold`: Number (金币，每回合获得=牌库总数)
- `deck`: Array<Card> (当前牌库)
- `active_rules`: Array<Rule> (本轮激活的规则倍率卡)
- `remove_card_cost`: Number (商店删牌费用：0, 5, 10...)

## 3. 核心机制设计要求
1. **滑动交互**：引入轻量级手势库或原生 Touch 事件，支持上下滑动物理反馈。
2. **独立序列监听**：“吃”和“弃”的序列必须相互独立。在“吃苹果->弃汽车->吃西瓜”中，“吃”的序列仍视为连续吃水果。只有“吃”了非水果牌，水果连击才中断。
3. **限时机制**：游戏进入滑动阶段开始计时（Timer），直到牌库空停止，用于判定限时规则。
4. **状态机 (State Machine)**：游戏需严格按照状态流转：`Init` -> `RuleDraft` -> `Playing` -> `Scoring` -> `Shop` -> `NextRound` / `GameOver`。

## 4. 目录结构规划
/
├── index.html       # 游戏主入口及 UI 骨架
├── css/
│   └── style.css    # 响应式样式与动画 (Mobile-first)
├── js/
│   ├── main.js      # 游戏初始化与主控逻辑
│   ├── data.js      # 基础牌库与规则库的数据字典
│   ├── state.js     # 玩家状态与存档管理
│   ├── gesture.js   # 滑动交互与物理效果逻辑
│   ├── engine.js    # 计分算法与序列监听逻辑
│   └── ui.js        # DOM 渲染与弹窗控制
└── assets/          # 图标与音效 (可选)