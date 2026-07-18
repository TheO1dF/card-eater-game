# 吃牌肉鸽 · CardEater

一个无依赖、移动端优先的原生 H5 构筑肉鸽 Demo。向下吃、向上弃；50 张卡牌通过顺序、类别、牺牲、回溯、永久成长与经济效果形成构筑，48 条不重复规则会在一局中永久叠加。

## 本地运行

ES Modules 需要通过 HTTP 打开，不能直接双击 `index.html`：

```powershell
npm start
```

然后访问 `http://localhost:8080`。常用验证命令：

```powershell
npm test
npm run check
npm run build
```

`npm run build` 会生成可直接部署到 Cloudflare Pages 的 `dist/`。

## 当前玩法

- 初始 7 张牌保持 4 张可食用、3 张不可食用，让新玩家先掌握吃弃方向。
- 中后期通过商店构筑水果、快餐、甜点、饮料、蔬菜、星体、人物、动物和通用九类牌。
- “可食用”不等于永远正分：腐烂苹果、黑咖啡、能量饮料等需要先承受负分，再把收益兑现到后续牌。
- 每轮规则三选一，选中后永久保留；本局不会出现已选择规则，最终形成多层加分与倍率引擎。
- 每轮基础金币仍严格等于本轮吃牌数，卡牌经济效果另算。
- 阶段累计目标为第 5 轮 150、第 10 轮 1500、第 15 轮 12000。

## 代码边界

- `js/config.js`：15 轮、阶段目标等平衡参数。
- `js/balance.js`：稀有度价格、商店权重和价值预算。
- `js/data.js` / `js/rules.js`：可序列化内容数据。
- `js/state.js`：严格状态机和存档形状。
- `js/engine.js`：不依赖 DOM 的行为、效果和计分核心。
- `js/gesture.js`：浏览器 Pointer Events 输入层。
- `js/platform.js`：时间、随机数、ID、震动、本地记录适配层。
- `js/ui.js`：DOM 渲染；`js/main.js`：流程编排。
- `assets/cards/*.webp` 与 `cards-atlas.webp`：导出器按 alpha 主体自动去除跨格碎片、缩放到统一安全区并居中；H5 开局预载 7 张独立卡图，游玩期间低优先级加载中后期紧凑图集，原始图集继续保留给美术修改和 Godot 导入。

平衡模型见 [`docs/GAME_BALANCE.md`](./docs/GAME_BALANCE.md)，Godot 迁移契约见 [`docs/GODOT_MIGRATION.md`](./docs/GODOT_MIGRATION.md)，Cloudflare 步骤见 [`docs/CLOUDFLARE_DEPLOY.md`](./docs/CLOUDFLARE_DEPLOY.md)。
