# SkyShards 本地开发与维护手册（含套利扩展）

> 本文件是 **SkyShards（d:/Code/SkyShards）** 的"无上下文恢复入口"。任何一轮开发开始前先读本文件；**每一轮开发结束时必须把本文件同步更新到位**（§0 状态行 + 改到的相关小节 + §11 纪律）。

---

## 0. 状态行（每次改动后必须同步）

- 基线：官方开源项目 `github.com/Campionnn/SkyShards`（Hypixel SkyBlock attribute 融合计算器），通过 zip 方式下载解压到本地 `d:/Code/SkyShards`。**不是 git 仓库**（无 `.git`），无法与上游 diff，本地改动以本文件清单为准。
- 已完成：
  1. 套利功能（/arbitrage）：Bazaar 价扫描 → 127 个可融合成品按利润排名 → 点击行展开收支明细（Income/Materials/Fusion fees/Total cost/Profit/ROI 六卡 + Fusion path 树 + Materials to buy 原料清单）。真实浏览器验证通过（见 §8）。
  2. 移除 Greenhouse 公告弹窗（原上游首次访问自动弹 `GreenhouseModal` 宣传外挂站 greenhouse.skyshards.com），原因是外挂站功能不需要在主站弹窗打扰，且曾遮挡套利页点击验证。删了 3 处引用 + 组件文件（见 §7）。
  3. 价格体系：DataService 单例缓存 `/bazaar` 响应，跨页面共享；套利页可用 forceRefresh 拉新。
- 当前进度/下一步：套利主链路已验证通过，暂无阻塞项；待办见 §10。
- 最近一次验证（2026-09-06）：`d:/Code/.playwright-cli/pwcheck.cjs` 真机点击 Molthorn 行，展开断言 `income/fusionPath/materials` 全 true，截图 `arb-detail.png` 已存。
- **2026-09-06 已发布**：代码推送至 `github.com/MeowMahoro/SkyShards`（master，本地 git 仓库，首个提交 a9fef01）；GitHub Pages 已上线 `https://meowmahoro.github.io/SkyShards/`（Actions workflow 部署，验证 200 + /SkyShards/ 资源前缀 + 深链兜底正常）。详见附录。

---

## 1. 这是什么

Hypixel SkyBlock「融合碎块(shard)/属性融合」相关的前端计算网站（Vite + React 19 + TypeScript + Tailwind CSS 4）。
功能：融合路径与成本计算、配方浏览、碎块图鉴、融合图、设置；**本地扩展：Bazaar 套利扫描页**。

### 1.1 运行环境事实（本机）
- 本机 `pnpm` **不在 PATH**，需 `corepack pnpm`（官方 scripts 里的 `pnpm run dev` 等照常写，但手动执行时用 `corepack pnpm ...`）。
- 类型编译可绕过 pnpm：`cd d:\Code\SkyShards && node_modules\.bin\tsc.cmd -b --pretty false`。
- 命令一律走 cmd：`cmd /c "..."`。
- dev server 由 `start-dev.vbs` 静默启动，日志写到 `d:/Code/SkyShards/dev.log`；端口 5173。
- 网络：bazaar 直连 `https://api.hypixel.net/v2/skyblock/bazaar`（无需 API-Key）；GitHub 需代理，见 §6 注。

### 1.2 目录要点
```
d:/Code/SkyShards/
├─ public/            # 静态资源：fusion-data.json(~6.5MB 全碎块数据)、rates.json、碎块图标 png、404.html 等
├─ src/
│  ├─ App.tsx         # 路由注册（react-router 7，lazy 页面）
│  ├─ main.tsx        # 入口 + localStorage 白名单清理（VALID_KEYS，改新增 key 必须同步这里）
│  ├─ components/     # UI 组件（layout/、modals/、results/(FusionTreeView) 等）
│  ├─ context/        # CalculatorStateProvider / RecipeStateProvider（仅计算器/配方用，套利页不用）
│  ├─ pages/          # 页面（Calculator/Recipe/Shards/…/Arbitrage 等）
│  ├─ services/       # 数据与计算（见 §3）
│  ├─ workers/        # calculationWorker（计算器离线 worker；套利不走 worker）
│  ├─ types/          # hypixelApiTypes.ts、types.ts（核心类型）
│  ├─ hooks/ utilities/ constants/ schemas/ data/ test/
└─ vite.config.ts     # dev 时 /api 代理 → VITE_API_TARGET 或 https://api.skyshards.com
```

---

## 2. 运行命令

| 动作 | 命令（cmd） |
|---|---|
| 启动 dev（后台静默） | `cscript //nologo d:\Code\SkyShards\start-dev.vbs`（等价 `corepack pnpm run dev`，日志 dev.log） |
| 确认在跑 | `curl -s -m 5 -o nul -w "%{http_code}" http://localhost:5173/arbitrage` → 200 |
| 类型检查 | `node_modules\.bin\tsc.cmd -b --pretty false` |
| build | `corepack pnpm run build`（= `tsc -b && vite build`，产出 dist/） |
| lint / test | `corepack pnpm run lint` / `corepack pnpm run test`（vitest） |
| 页面 | Calculator `/`、Recipes `/recipes`、Shards `/shards`、Fusion Lines `/fusion-lines`、**Arbitrage `/arbitrage`**、Guide/About/Contact/Privacy |

### 2.1 路由（src/App.tsx）
- 顶层 `ProtectedLayout`：`CalculatorStateProvider` + `RecipeStateProvider` → `ToastProvider` → `Layout`（Navigation + ErrorBoundary + `Outlet key=pathname`）。
- 所有页面 lazy 加载 + Suspense。
- basename：GitHub Pages 部署(`/SkyShards/`)时带前缀；本地 dev 为空。
- 导航入口在 `src/components/layout/Navigation.tsx` L51-55（Arbitrage 用 TrendingUp/amber 图标）。

---

## 3. 核心服务（src/services）

### 3.1 DataService（dataService.ts）— 全局单例 `getInstance()`
- `loadShards()`：读 `public/fusion-data.json` + `rates.json` → `Shard[]`（内存缓存）。
- `loadFusionJson()` / `loadDefaultRates()`：Promise 缓存 in-flight 请求，失败清缓存可重试（大文件避免并发双拉）。
- `loadBazaarQuotes(forceRefresh?)`：一次 `GET https://api.hypixel.net/v2/skyblock/bazaar` 拉全量，解析成 `{quotes: Record<shardId, ShardMarketQuote>, fetchedAt: Date.now()}`；**默认共享缓存**（所有消费者复用同一份 bazaar 快照），`forceRefresh=true` 强制重拉。返回对象传给调用方自行展示 snapshot 时效（fetchedAt）。
  - quote 解析：`buyPrice = buy_summary[0].pricePerUnit`、`sellPrice = sell_summary[0].pricePerUnit`、`buyVolume/sellVolume` 为该侧所有档 amount 求和。碎块在盘口单边为空时该侧为 `undefined`。
- `loadShardCosts(useInstantBuyPrices)`：计算器「即时价」口径的单价表（取 buyPrice 或 sellPrice），供普通成本模式用。
- `searchShards` / `searchShardsByNameOnly`：下拉搜索（支持 fallback 搜 title/description）。
- fetch 实现：`fetchJson`（BASE_URL 相对路径）、`fetchApi`（拼 `https://api.hypixel.net/v2/skyblock{endpoint}`）。

### 3.2 hypixelApiTypes.ts（关键类型）
```ts
interface ShardMarketQuote { buyPrice?; sellPrice?; buyVolume: number; sellVolume: number }
```
> **本项目内字段语义（易混，务必先读）**：见该文件头注释——`buyPrice = buy_summary[0]`（买盘最高出价，视为"立即买入/乐观卖单"参考），`sellPrice = sell_summary[0]`（卖盘最低报价，视为"立即卖出/便宜买单"参考）。**这套命名与社区 quick_status 的 buyPrice/sellPrice 直觉相反**（Hypixel quick_status.buyPrice = instant-sell 参考）。一切以本仓库注释与代码为准，不要外推。

### 3.3 CalculationService（calculationService.ts，套利复用的核心引擎）
单例。公开方法（从套利代码可见）：`parseData(params)`、`computeMinCosts(data, params)` → `{minCosts, choices}`、`buildRecipeTree(...)`、`assignQuantities(...)`、`collectTreeStats(...)`、`calculateShardProductionStats(...)`、`calculateTotalTimeFromQuantities(...)`、`getDirectCost(...)`。
- 输入 `CalculationParams`（在 types）：`customRates`（每碎块单价）、`craftPenalty`（每次融合手续费）、hunterFortune、各 Pet/龙王加成开关、`kuudraTier` 等。
- 计算器页面（CalculatorPage/RecipePage）用 `workerCalculationService.calculateOptimalPathWithWorker()` 跑 worker（有进度回调）；**套利页不走 worker**，主线程同步复用引擎（单目标展开很快）。
- 数据/选择结果用 `Map`/对象传递；套利页把扫到的解析结果存进 `ArbitrageContext` 供逐行懒展开复用，避免每行重复 parse。

---

## 4. Bazaar 价格语义（最易出错，套利核心）

Hypixel `/bazaar` 每个 product 返回两侧订单簿：
- `buy_summary`：求购订单（最高出价在前，即社区说的 "instant sell" 成交参考 / quick_status.buyPrice）。
- `sell_summary`：出售订单（最低要价在前，即社区说的 "instant buy" 成交参考 / quick_status.sellPrice）。

本仓库 ShardMarketQuote：`buyPrice←buy_summary[0]`、`sellPrice←sell_summary[0]`，并给到四种执行模式（arbitrageService.ts 头注释 + `toPrices()`）：
| 模式 | 取的字段 | 含义 |
|---|---|---|
| Instant buy（立即买入） | `quote.buyPrice`（buy_summary[0]） | 买现价成交 |
| Buy order（挂求购单） | `quote.sellPrice`（sell_summary[0]） | 挂单等供给 |
| Instant sell（立即卖出） | `quote.sellPrice`（sell_summary[0]） | 立刻兑现 |
| Sell order（挂出售单） | `quote.buyPrice`（buy_summary[0]） | 挂单等更高价 |

> ⚠️ 曾有讨论：若对照 Hypixel「真实撮合语义」，立即买/卖方向与上表相反，可能导致利润虚高；当前实现按原计算器「即时价」同一套字段延续（全站统一、数值与主计算器一致）。**若未来要改口径，需联动 dataService.loadShardCosts、CalculatorForm 的 Use Instant Buy Prices 开关与 arbitrageService，并回归验证。**（见 §10）

---

## 5. 套利功能设计（本仓库最重要扩展）

### 5.1 入口与文件
- 页面：`src/pages/ArbitragePage.tsx`（路由 `/arbitrage`，App.tsx L88-95；导航 Navigation.tsx L54）
- 引擎：`src/services/arbitrageService.ts`
- 树视图复用：`src/components/results/FusionTreeView.tsx`

### 5.2 概念与类型（arbitrageService.ts）
- `BuyMode = "instant" | "order"`，`SellMode = "instant" | "order"`（各有 label 常量）。
- `ArbitragePrices`：四价 + buy/sellVolume。
- `ArbitrageRow`：某碎块一行——quote、`productionCost`（当前 buy mode 下最优生产单价=minCosts）、`directCost`（直接买市场价，Infinity 表示无市价）、profit/margin 的 instant/order 两套。
- `ArbitrageContext`：整轮扫描的共享上下文（data/choices/minCosts/params/prices/buyCosts/fetchedAt），供行展开复用。
- `ArbitrageScanResult = { rows, context }`。
- `ArbitrageDetail`：单目标展开详情——`tree`(RecipeTree)、craftsNeeded、craftCost(总融合费)、produced、materials[]（shardId/name/quantity/unitCost/totalCost，按 totalCost 降序）、materialsTotalCost、totalCost。
- 金额显示 `signedCoins()`（ArbitragePage.tsx L38）：用 `formatLargeNumber`，正负号 + 缩写（如 90M、2.42M）。

### 5.3 扫描算法（scanArbitrage）
1. `loadShards()` + `loadBazaarQuotes()` 并行 → 全碎块 `prices`。
2. 按 buyMode 把成本建成 `buyCosts`（instant→instantBuy，order→orderBuy）。
3. `buildParams(buyCosts, coinsPerCraft)`：customRates=buyCosts、`craftPenalty=coinsPerCraft`、rateAsCoinValue=true。
4. `parseData` → `computeMinCosts` 得到每碎块最优成本与最优选择(choice)。
5. 逐行过滤：无任何卖出价(`instantSell/orderSell` 皆 undefined) → 跳过；最优选择不是 fusion 配方(被直接买更便宜) → 跳过；minCost 非有限 → 跳过。
6. 输出 rows（profit 分 instant/order 两档都算）。
> 关键点：**sellMode 不参与扫描**，只影响前端排序/筛选/展开收入计算（因为卖出价很好重算，切换无需重扫）。扫描按钮/参数 = buyMode + coinsPerCraft + 搜索/排序。

### 5.4 单目标展开（getArbitrageDetail）
- 同步主线程：基于 context 里已 parse 的 data，`buildRecipeTree` + `assignQuantities(quantity)` + collect 统计 → 输出 Detail。
- UI：点击行 `setExpandedId(row.shard.id)`（互斥展开，同一时间只展开一行，ArbitragePage.tsx L507-556）；展开时 `RowDetail` 组件 mount 后用 `setTimeout 0` 把建树推迟一帧，让展开"即时感"。
- RowDetail 顶栏有 `Make [quantity]` 输入、Sell mode 单价提示、Produces N × output。
- 六张度量卡：Income（=sellUnit×produced）、Materials（materialsTotalCost）、Fusion fees（craftsNeeded×coinsPerCraft = craftCost）、Total cost、Profit、ROI。
- 下两栏：**Fusion path**（FusionTreeView 递归树）+ **Materials to buy**（原料明细清单）。

### 5.5 页面其余
- 顶部：说明文案、"Refresh prices"（`loadBazaarQuotes(true)` 后重扫）、Buy mode 切换（重扫）、Sell mode 切换（前端即时改排序）、Coins per fusion、Sort(Profit/ROI)、搜索。
- 状态行：Price snapshot: Ns ago（`fetchedAt` 与当前时间差）、`127 fusion outputs shown · 127 profitable at current prices` 之类统计。
- 行内列：OUTPUT SHARD(图标+名字+L42·family)、FUSED COST（productionCost）、SELL PRICE（按当前 sellMode 的单价）、PROFIT、ROI，右侧箭头/`Make` 按钮。

---

## 6. 验证资产（本机，d:/Code/.playwright-cli/）

- `pwcheck.cjs`：**playwright-core 直连脚本**（require 全局包 `D:/Program/npm/global/node_modules/@playwright/cli/node_modules/playwright-core`），msedge(channel) + headless 打开 `/arbitrage` → 等 Molthorn 行 → 点击首行 → 断言展开区出现 Income / Fusion path / Materials to buy → 打 body 片段 → 截图 `arb-detail.png`。运行：`node d:/Code/.playwright-cli/pwcheck.cjs`。
- 快照 yaml：`d:/Code/arbitrage-main.yaml`、`arb2.yaml`、`arb-state.yaml`、`d:/Code/.playwright-cli/page-*.yml`（playwright-cli open/snapshot 产物，看 DOM 结构用）。
- `tap.cmd`（历史遗留）：`.playwright-cli` 命令行 click 包装，实测该环境 CLI 交互命令系统性不可用，别再依赖（用 pwcheck.cjs 直接驱动库）。
- 已知无害噪音：控制台两条广告脚本 403（pubnation）不是页面问题。
- 截图：`.playwright-cli/arb-detail.png`（套利展开详情的视觉证据）。
- **2026-09-06 验证结论**：rows loaded → 点击 Molthorn → `income:true fusionPath:true materials:true`，无页面 JS 错误。套利行展开与收支明细工作正常。

---

## 7. 相对上游的本地改动清单（无法 diff，凭证据推断/记录）

已确认改动：
1. **移除 GreenhouseModal 公告弹窗**：`src/components/layout/Layout.tsx`（删 import/useEffect/state/handler/JSX）、`src/components/modals/index.ts`（删导出）、删除 `src/components/modals/GreenhouseModal.tsx`、`src/main.tsx`（VALID_KEYS 删 `greenhouse_modal_seen`）。导航栏 Greenhouses 外链按钮保留。
2. 新增套利功能（推断为本地新增，上游无 arbitrage 痕迹）：`src/pages/ArbitragePage.tsx`、`src/services/arbitrageService.ts`；改动 `App.tsx`(+路由)、`Navigation.tsx`(+入口)、`usePageTitle`(/arbitrage 标题)、`types/`、可能涉及 `dataService.ts`/`hypixelApiTypes.ts` 的 bazaar quote 扩展。
3. dev 辅助文件：`start-dev.vbs`、`run-dev.cmd`（如存在）、`dev.log`。
4. **部署适配（2026-09-06，为发布到 MeowMahoro/SkyShards 的 GitHub Pages 子路径）**：
   - 删除 `public/CNAME`（原为官方 `skyshards.com`，绑定他人域名会导致 Pages 失败）；
   - `public/404.html` 的 SPA 回跳由 `replace("/")` 改为 `replace("./")`（相对路径，根域/子路径通用）。
   - 新增 `.github/workflows/pages.yml`（GitHub Actions Pages：`GITHUB_PAGES=true` 构建 + upload/deploy）。

> 本目录还有非项目文件别误删：`d:/Code/arbitrage-main.yaml`、`arb2.yaml`、`arb-state.yaml`、`d:/Code/.playwright-cli/`、以及根目录若干误存日志（`console.log('DIRECT_FAIL'`、`debug.log`、`hs_err_*.log`、`SkyShards.zip` 等，属工作区垃圾，可清理但勿当源码）。

---

## 8. 关键决策记录（决策 → 理由）
- 套利做成独立页 `/arbitrage` 而非改计算器结果卡：因为要全量扫 300+ 碎块按利润排序，独立页承载更好（历史取舍，用户选定）。
- 套利只统计「最优路径是融合配方」的成品（直接买更便宜的不算套利机会）。
- Sell mode 不触发重扫（见 §5.3 注释），Buy mode 与 Coins per fusion 变更才重扫。
- 移除 Greenhouse 弹窗（2026-09-06，用户拍板）：外挂独立站不需要在主站自动弹公告，且弹窗曾遮挡点击验证。
- 本地无 git、以 zip 部署 → 改动用本文件跟踪；上游若有更新需重新核对（升级时注意本文件 §7 清单的代码位置会变）。

---

## 9. 踩坑清单（遇到过的坑）
- `pnpm` 不在 PATH → 用 corepack pnpm 或直接 `node_modules\.bin\*.cmd`。
- 首次访问 GreenhouseModal 曾遮住页面点击（playwright 定位到元素但点不到）→ 已移除弹窗解决。
- playwright-cli（D:/Program/npm/global）的 click 等**交互命令在该环境不可用**（无明确报错，snapshot/open 正常）；要真实点击必须 `pwcheck.cjs` 直接 require playwright-core。
- PowerShell 转义吞 `$`/引号 → 一律 cmd；复杂引号用 .cmd 文件或单引号包裹。
- fetch bazaar 大 JSON：DataService 用 in-flight promise 缓存，冷启动并发调用只发一次请求。
- localStorage：新增持久 key 必须加进 `main.tsx` 的 `VALID_KEYS`，否则会被 cleanupLocalStorage 清掉。
- `formatNumber`（utilities）会把大数压缩/round；套利金额用 `signedCoins`/`formatLargeNumber` 缩写，UI 全站风格保持一致别混用其他格式。

---

## 10. 已知问题 / 下一步（待办）
- [ ] **价格口径复核**：上表「立即买入= buy_summary[0]」与真实撮合方向相悖的讨论未落地；若要真实化需同步改 3 处并回归（§4 备注）。当前口径 = 与主计算器/Use Instant Buy Prices 一致，数值自洽但可能偏乐观。**决定前不要改，先出结论再动**。
- [ ] dev server 是常驻后台（vbs），若端口被占需先杀掉旧进程再起。
- [ ] 上游仓库若发布新版本，需评估合并（当前无 git，diff 靠人工）。
- [ ] 可选项：验证脚本断言增强（抓 RowDetail 容器断言具体数值）、Sell mode=Instant sell 下展开数值回归、多行互斥展开 UI 测试。
- [ ] 其他页面功能细节（属上游维护）不在本文档承诺范围。

---

## 11. 改动最小流程（持续更新纪律，务必遵守）

1. 开工前：读本文件 §0 状态行 + 对应小节，确定基线；改动前先读目标代码现状（别凭记忆）。
2. 每完成一个功能点/修复/决策：**立即回写本文件** —— 更新 §0 状态行；同步 §5/§7 结构描述、§8 决策、§9 踩坑、§10 待办。
3. 新增/删除文件或改路由/服务 API 时，同步维护 §1.2 目录要点与 §3 服务说明。
4. 价格、验证方式等"跨会话易错事实"改动，必须有明确结论记录在 §4/§8。
5. 验证产物（截图、快照、pwcheck 结论）更新到 §6。
6. 若本轮是上游代码合并/升级，特别核对 §7 清单与新行号，全部核对完才关闭任务。

> 一句话：**代码与文档必须同轮、同步、同版本**，避免"两套说法"。

---

## 附录：GitHub Pages 部署（github.com/MeowMahoro/SkyShards，public）

- 线上 URL：`https://meowmahoro.github.io/SkyShards/`
- 方式：GitHub Actions（`.github/workflows/pages.yml`），每次 push 到 `master` 自动 `lint? no` → `GITHUB_PAGES=true pnpm build` → upload artifact → deploy-pages。仓库 Settings→Pages 需 `Source: GitHub Actions`（由 `gh api ... -f build_type=workflow` 设置）。
- 关键：子路径部署需要 `vite base=/SkyShards/`，由 workflow 环境变量 `GITHUB_PAGES=true` 触发（App.tsx L46-48）。
- 运行时注意：bazaar 直连 `api.hypixel.net`（浏览器侧，无需 Key）；玩家档案导入走 `VITE_API_TARGET || https://api.skyshards.com` 官方后端。
- 数据保鲜：`.github/workflows/update-fusions.yml` 已改造为**定时自动更新**（2026-09-06）——每 6h（cron `0 */6 * * *`）轮询 `Campionnn/SkyShards-Parser` latest release，有新版即下载 `fusion-data.json`/`fusion-properties.json` → commit → push（触发 pages 自动重新部署）；也支持 `workflow_dispatch` 手动触发。需要 `secrets.PAT`（**已配置**，Fine-grained：只授权 MeowMahoro/SkyShards，Contents Read and write）。注意：Actions 不允许在 `jobs.<id>.if` 里引用 secrets（曾致 workflow 无效，勿再写）；无变更时 skip push（勿学官方脚本无条件 push）。
