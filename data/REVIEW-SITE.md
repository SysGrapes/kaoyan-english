# 前端 QA / BUG 审查报告 · 真题语感（纯静态站）

审查对象：`index.html`、`assets/app.js`、`assets/style.css`、`data/corpus.js`（只读）。
约束：未参与语料内容审校；未修改 `data/` 下任何既有文件（`part-*.json`、`corpus.json`、`corpus.js`、`meta.json`、`*.md`、`build.py` 全部原样）；本报告为 `data/` 下唯一新增文件。
结论：**0 致命、3 功能缺陷（已全部修复）、6 组体验问题（未改，附建议）、7 大项功能全部验证通过**。

---

## 审查范围与验证手段

- 环境：Windows 10 / Node v22.22.2。`node --check assets/app.js`、`node --check data/corpus.js` 均通过（修复后重跑仍通过）。
- 本机 `jsdom` / `playwright` / `puppeteer` 均未安装；改用 Windows 自带 `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` 的 headless 模式做**真实运行时验证**：
  - 由 `index.html` 生成同构探针页，追加注入式审计脚本 `audit_site_probe.js`，用 `msedge --headless --disable-gpu --allow-file-access-from-files --virtual-time-budget --dump-dom` 加载 `file://` 页面，脚本以真实 `Event`/`MouseEvent`/`KeyboardEvent` 驱动交互，把断言结果写入页面后由 dump-dom 提取；`--virtual-time-budget` 负责推进 debounce(180ms)、toast(1900ms)、scrollIntoView(120ms) 等定时器。
  - 另建两个变体页：`audit_site_probe_nols.html`（在 `app.js` 之前把 `window.localStorage` 定义为抛异常 getter，验证禁用容错）、`audit_site_probe_empty.html`（把 `window.__CORPUS__` 置 `{meta:{},entries:[]}`，验证空数据兜底）。
  - 审计脚本还**独立复算**了一份预期结果（从 DOM 控件状态重算 `expectedList()` + `expectedSorted()`，不读取 `app.js` 内部 `state`），与页面实际 `#resultCount`、卡片 uid 顺序逐条比对，避免"自己验证自己"。
- 断言规模：默认视口（headless 实际 754px）97 条 PASS / 0 FAIL；375px 窄屏 99 条 PASS / 0 FAIL；禁用 localStorage 页 3 条 PASS；空数据页 2 条 PASS。
- 数据侧分析：用 Node 载入 `data/corpus.js`（`window` stub）核对 351 条条目的字段完整性、取值分布、特殊字符、uid 格式。
- 临时探针文件（`audit_site_*.js/.html`、`audit_out_*.html`、`audit_err_*.txt`、`audit_edge_*` profile 目录）审完已清理，项目结构未新增多余文件。

---

## 一、致命

**无。** 依据：

- 无未捕获异常：`node --check` 通过；headless 探针挂载 `window.onerror`，两轮 99 条断言执行期间未捕获任何页面脚本异常。
- 无 XSS / HTML 注入：`esc()`（app.js:15-19）覆盖 `& < > " '`，且全局搜索词只用于字符串比较、不进入 `innerHTML`；数据里 351 个 uid 全部为 `k\d{4}`（0 条例外），42 处引号、3 处 `&` 的原句均经转义。运行时断言 `无未转义注入脚本`（检查 `#cardList.innerHTML` 不含 `<script` / 内联 `on*=`）→ PASS。
- 无正则崩溃：对全部 351 条 headword 及追加压力串 `"...\"&<>'` 构造正则 → `PASS | 全部词条构造正则无异常`。
- 降级路径齐全：`ALL.length === 0` 时（app.js:660-663）显示"语料未加载"提示并 return；`load`/`save`（app.js:55-59）均有 try/catch；禁用 localStorage 与空数据两个探针页全部 PASS。

---

## 二、功能缺陷（3 项，均已直接修复）

### F1 「重置」不彻底：排序未复位 —— 已修复

- **复现**：排序下拉选「按字母 · A → Z」→ 点侧栏「重置」（或空结果里的「重置筛选」）→ 列表仍按字母序而非默认「按考频 · 高 → 低」，`#sortSelect` 仍显示 A→Z。
- **根因**：`resetFilters()`（原 app.js:635-644，现 647-657）重置了 `types/papers/topics/diffs`、年份、`query`、`limit`、`openUid`、`studyPool` 及全部控件，唯独漏掉 `state.sort` 与 `#sortSelect.value`。由于 `state.sort` 与下拉值始终同步，结果"技术上正确"但不符合重置语义，且 UI 无任何提示，用户会误以为排序已回到默认。
- **断言证据**：修复前 `FAIL | 重置恢复默认排序 freqDesc | afterReset=alpha`；修复后 `PASS | 重置恢复默认排序 freqDesc | afterReset=freqDesc`。
- **修复**：`assets/app.js:652` 增加 `state.sort = 'freqDesc'; $('#sortSelect').value = 'freqDesc';`。影响面仅重置按钮，无其他回归；`emptyReset` 复用同一函数同样受益。
- **建议**：已修。若产品认为"重置应保留用户排序偏好"，可反向把排序独立出来，但当前实现已与 `limit/openUid/studyPool` 一并重置的语义一致。

### F2 结果页「回到词条库」后无法重新配置新一组测验 —— 已修复

- **复现**：开始测验 → 答完 → 结果页点「回到词条库」→ 再点「语境测验」tab → 仍停留在上一轮结果页，`#quizIntro` 隐藏，看不到「题量 / 只出高频词 / 只出收藏词 / 开始测验」，无法重新配置参数（只剩结果页的「再来一组」）。
- **根因**：`quizResult()` 里 `#quizBack` 的 onclick 原仅 `switchView('library')`（原 app.js:439，现 447）。`startQuiz()`（app.js:382）曾把 `quizIntro.hidden = true`，只有 `quitQuiz`（app.js:612）会恢复 intro / 清 `state.quiz`；结果页返回路径既不清理 `state.quiz`，也不恢复三个面板的 hidden 状态。`switchView()`（app.js:512）也不重置 quiz 视图状态，于是状态残留。
- **断言证据**：修复前 `FAIL | quizBack 后再次进入测验显示开始界面 | introHidden=true resultHidden=false`；修复后 `PASS | ... | introHidden=false resultHidden=true`。
- **修复**：`assets/app.js:447-452` 改为 `state.quiz = null`、隐藏 `quizResult`/`quizRun`、显示 `quizIntro` 后再 `switchView('library')`。
- **建议**：已修；进一步可在 `switchView('quiz')` 中当 `state.quiz === null` 时统一恢复 intro（见 E4）。

### F3 含 `...` 的短语词条把虚词误当作词条高亮 / 挖空 —— 已修复

- **复现**：搜索 `bring ... to bear on` 并展开卡片，原句中的普通介词 `to` / `on` 被 `<mark>` 高亮成"词条"；记忆卡背面、真题原文页同样误标；测验「语境选义」题会把这些虚词挖空。修复前探针复现：`{"hw":"bring ... to bear on","uid":"k0059","matches":["to","bring","to","bear","on"]}`（一句里误匹配 5 处）。共 8 个含 `...` 的词条受影响：`dismiss ... as`、`bring ... to bear on`、`infuse ... with`、`no more ... than ...`、`put ... on hold`、`swallow ... whole`、`put ... into perspective`、`take ... for granted`。
- **根因**：`tokens()`（app.js:20-24）按空格拆分并把非字母字符（含 `...` 占位符）删除，短语被拆成多个 token；`hwRegex()`（原 app.js:25-30，现 27-38）把**所有** token 用 `|` 拼进 `\b(...)\b` 正则并对长 token 追加 `\w{0,3}`，于是 `to / as / on / than / more / with / for` 等功能词成为高亮目标。该正则同时被 `hl()`（app.js:39）、`blank()`（app.js:43）使用，故波及词条详情、记忆卡、真题原文、测验 context 题四处。
- **断言证据**：修复前 `INFO | 含 ... 词条高亮/挖空误匹配 | 最多匹配 5 处`；修复后 `最多匹配 1 处`，8 个词条逐个 `<mark>` 为 `["dismiss"] / ["bring"] / ["infuse"] / [] / ["hold"] / ["swallow"] / ["perspective"] / ["granted"]`，且 `PASS | 含 ... 词条原句未误标高亮虚词 | bad=[] totalMarks=7`。
- **修复**：`assets/app.js:25-38` 新增 `PHRASE_STOP` 功能词表，并让 `hwRegex()` 对含 `...` 的 headword 过滤功能词与长度 <3 的 token、只保留最长的 1 个核心实词。**其余 343 条单词 / 普通多词短语的正则构造完全不变（零回归）**。`no more ... than ...` 因全部为功能词而无高亮，`blank()` 返回 null 后测验自动回退到「释义选词」题型，属合理降级。
- **建议**：已修；含撇号短语的同类问题见 E1。

---

## 三、体验问题（未修改，仅建议）

### E1 含撇号的多词短语仍可能误标（F3 的遗留范围）
`buy one's way out of`、`up one's game`、`do one's utmost` 不含 `...`，`tokens()` 会把 `one's` 变成 `ones` 并保留 `out / of` 等虚词，可能误标。本次刻意把 F3 修复范围限定在含 `...` 的 8 条，以保证对其余 343 条零回归。不产生 XSS 或正则异常。**建议**：若需彻底解决，把短语判定扩为 `/[.']/` 并额外过滤 `ones`，或对多词 headword 统一采用"只高亮最长实词"策略，但需回归全量高亮效果。

### E2 `<details>`「另 N 处真题原文」展开态在重渲染后丢失
`renderLibrary()`（app.js:223）以 `innerHTML = shown.map(cardHtml).join('')` 整表重建，原生 `<details open>` 是纯 DOM 局部状态，切换排序 / 加载更多 / 收藏后会被重置。卡片本身的展开态由 `state.openUid` 保持（已验证 PASS），丢失的是更细的局部 UI 状态。**建议**：把 details 的 open 纳入 state（如 `openMore[uid]`），或改为局部 DOM 更新。

### E3 选题量大于筛选结果时题数被静默缩减
`makeQuestions()`（app.js:343-380）遍历 `shuffle(pool)`，每个词条最多生成 1 题，故题数 ≈ `min(pool.length, quizCount)`。当筛选剩 5 条却选 20 题时只出 5 题、进度显示「第 1 / 5 题」，无任何提示（`startQuiz` 的兜底只拦截 `< 4` 条，app.js:387）。**建议**：开始前或结果页提示"当前筛选仅 N 条，实际出 N 题"，或允许同一词条生成多题。

### E4 直接切 tab 离开测验再回来，视图状态原样保留
`switchView()`（app.js:512）不重置 quiz 三个面板的 hidden 状态；`quitQuiz` 与已修复的 `quizBack` 之外（例如答题中途直接点「词条库」tab）不会恢复 intro。仍可用「再来一组」继续，非致命。**建议**：在 `switchView('quiz')` 中当 `state.quiz === null` 时统一恢复 `quizIntro`。

### E5 文案口径（已核对一致，仅记录）
`sortNote` / 关于页称"同频依次按原句出处数、难度、字母序排列"，代码次级键为 `e.freq`（app.js:168）。核对 351 条数据：`freq === sourceQuoteCount` **全部成立**（0 条例外），故文案与实现一致，无需修改。

### E6 低优先级边界
- `initTop()`（app.js:88）`Math.min.apply(null, years)` 在 `years_seen` 全空时返回 `±Infinity`；当前 `META.year_min/max` 齐全且空数据分支已 return，不会触发。
- `cardHtml()` 的 `data-uid="' + e.uid + '"`（app.js:177）未经 `esc`；数据里 uid 全部为 `k\d{4}`，当前安全；若未来 uid 引入引号 / 尖括号需补 `esc`。
- 记忆卡完成态时 `#gradeRow` 仍可见，但 `grade()` 内 `currentEntry()` 返回 null 直接 return，无副作用（已验证不崩）。

---

## 四、已验证通过（逐项，含验证方法）

### 1. 按考频排序 —— 通过
- 7 个 option 逐个 `select.value + dispatch change`，分别断言：`freqDesc` 相邻 `examCount` 非递增、同频 `freq` 非递增、再 `difficulty` 非递增、再 `headword` 字母序；`freqAsc`、`diffDesc`、`yearDesc`、`yearAsc`、`alpha` 各自单调性；`random` 校验 36 条且 uid 全部合法。`freqDesc` 前 5 实测 `7/address, 5/subject, 4/buy, 4/game, 4/peer review` → 全部 PASS。
- **次级排序稳定性**：`freqDesc` 的比较链 `(y.examCount-x.examCount) || (y.freq-x.freq) || (y.difficulty-x.difficulty) || byAlpha` 全部为确定性比较，V8 `Array#sort` 稳定，探针断言无逆序 → PASS。
- 独立复算 `expectedList()+expectedSorted()` 与 DOM 前 36 个 uid 逐一比对 → PASS；切换排序后顺序确实重排 → PASS。
- 「仅高频（≥2 次）」：结果 50 条、全部 `examCount>=2`，且排序逻辑仍生效 → PASS。

### 2. 筛选与搜索 —— 通过
- 独立重算的 `expectedList()`（依据 DOM 上 chip `.on`、checkbox、年份 select、搜索框）与页面 `#resultCount` 及 DOM uid 顺序比对，覆盖：类型单筛 80 条、类型+卷别+主题+难度 14 条、叠加年份区间 7 条、`showMeaning` 开关、headword / 中文释义 / 出处 / 原句子串 4 类搜索（5 / 1 / 7 / 2 条）→ 全部 PASS。
- 重置：351 条、chip 全灭、搜索框空、年份 2005–2025、开关全关、排序回 `freqDesc` → PASS。
- 空结果：`emptyState.hidden === false`、`resultCount === '0'` → PASS。
- 加载更多：36 → 72 → 108，uid 无重复、前 72 条顺序不变 → PASS。
- 展开卡片后重渲染（切换排序）：`.wcard.open` 仍为原 uid → PASS。

### 3. 词条卡片 —— 通过
- 展开详情含原句 `<blockquote>`、译文、出处、释义、熟词僻义「常见义 / 真题僻义」对照、`more_quotes` 的 details、note、tags、复现轨迹（考频 / 已收录原句数 / 年份 / sources_all）→ PASS。
- 收藏与「标记已掌握」持久化：`ky.fav.v1` 写入 / 取消，`ky.mastery.v1` 的 box `2 ↔ 0` toggle → PASS。
- `data-act` 无错触发：点 `.star` 与 `[data-act="mastered"]` 均未误触发展开 → PASS；`studyone` 由代码路径审查（app.js:573-577 提前 return，设置 `studyPool=[uid]` 并切到记忆卡，不修改 `openUid`）。
- HTML 拼接：原始 `innerHTML` 中 `article/div/span/button/blockquote/details/p` 开闭标签计数全部相等；浏览器重新解析后 `.wcard` 数 = 36、无 `.wcard .wcard` 嵌套异常 → PASS。

### 4. 记忆卡 —— 通过
- 队列生成（351 条、进度显示）、翻卡（`.flipped` 类）、`3 认识` 评分后进度前进、`1 不认识` 重新入队（分母 `351→352`）、`2 模糊` 插队（`352→353`）、跳过、收藏当前、打乱、清空掌握记录（探针把 `confirm` 覆盖为 true）、完成态「这一轮完成」→ 全部 PASS。
- localStorage 读写异常容错：`audit_site_probe_nols.html` 在 `app.js` 之前令 `window.localStorage` getter 抛异常 → 页面仍渲染 36 张卡、`resultCount=351`、收藏 / 展开 / 排序交互无异常 → 3 条 PASS。

### 5. 语境测验 —— 通过
- 三种题型：3 组 × 20 题共 60 题，收集到的 `quizQuestion` 恰为「释义选词 / 语境选义 / 熟词僻义」3 种 → PASS。
- 干扰项：60 题每题 4 选项互异（`dupFail=0`）、正确答案唯一且属于选项（`ansFail=0`）→ PASS。
- 答案判定：点击选项后 `.correct` / `.wrong` 与反馈「答对了 / 正确答案：…」一致 → PASS。
- 反馈展示真题原句 `<blockquote>` + 译文 + 出处 + 音标 + 考频 + note → PASS。
- 下一题 / 结束 / 得分 / 错题回顾 / 再来一组 → PASS；`quizAgain` / `quizBack` 为动态生成，探针在结果页断言二者存在且 `onclick` 为 function → PASS。
- 少于 4 条兜底：仅收藏且收藏为空（pool=1）→ toast「当前筛选只剩 1 条，请放宽条件（至少 4 条）」且不进入答题 → PASS。
- `quizSub` 显示题干说明 → PASS；F2 修复后再次进入测验显示开始界面 → PASS。

### 6. 真题原文 —— 通过
- 分组渲染（36 组）、年份下拉（22 项）、卷别过滤（英语一 20 组）、年份过滤、`privacy` 原句检索（2 条）、点击 `.cw` 跳回词条库并展开对应 uid、搜索框回填 headword、原句 `<mark>` 高亮 → 全部 PASS。

### 7. 健壮性 —— 通过
- 语法：`node --check assets/app.js`、`node --check data/corpus.js` 通过，修复后重跑通过。
- DOM id：从 `app.js` 提取 74 个 `$('#id')` 引用（含 `['onlyHigh',...]` 动态拼接的 6 个），逐个 `getElementById` → 缺失 0 → PASS；`quizAgain` / `quizBack` 在结果页阶段单独验证。
- 特殊字符：全部 351 条构造正则（含 `"...\"&<>'` 压力串）无异常 → PASS；`esc` 对 42 处引号、3 处 `&` 生效，无脚本注入 → PASS；含 `...` 的 8 条修复后无误标（F3）。
- localStorage 被禁用 / 数据为空 / 响应式窄屏（754px 与 375×812 两组，`max-width:900px` 与 `560px` 断点均命中：筛选栏 `position=static`、`.brand-text p` `display=none`）→ PASS。
- 键盘：`/` 聚焦搜索、空格翻卡、`1/2/3` 评分、`Esc` 关闭展开 → PASS。

---

## 修改清单与回归

| 文件 | 改动 | 位置 |
|---|---|---|
| `assets/app.js` | `PHRASE_STOP` + `hwRegex()` 含 `...` 短语分支（只高亮最长核心实词） | 25-38 |
| `assets/app.js` | `quizBack` 清理 `state.quiz` 与三个面板 hidden 状态 | 447-452 |
| `assets/app.js` | `resetFilters()` 复位 `state.sort` 与 `#sortSelect.value` | 652 |

`index.html`、`assets/style.css` 未改动；`data/` 下既有文件未改动（仅新增本报告）。改动共 3 处、净增约 13 行，无架构重写、无外部依赖、无视觉风格变更。

回归结果：`node --check` 全过；headless 主探针 97→99 PASS / 0 FAIL；禁用 localStorage 页 3 PASS；空数据页 2 PASS。

## 遗留风险

1. E1–E4、E6 所述体验问题按建议处理，均不影响核心正确性。
2. 验证依赖本机 Edge headless 的合成事件，未覆盖真实鼠标 hover / 滚动 / 触摸、字体渲染与打印样式；`confirm` 在探针中被覆盖为 `true`，真实浏览器下「清空掌握记录」会弹原生确认框（该分支逻辑已静态审查）。
3. `random` 排序依赖 `Math.random`，探针只校验条数与 uid 合法性，未校验分布均匀性。
4. `switchView('quiz')` 未统一做面板状态收敛（E4），若后续新增更多进入测验的路径需一并留意。

---

## 最终回归（数据重建 + 网站层改动后）

### 回归背景

- 数据层重建：`data/corpus.js` / `corpus.json` 词条 351 → **347**（熟词僻义按义项拆条、合并重复、修正类型）；新增 `sense` 义项标签，8 条熟词僻义有值（k0014/k0018/k0100/k0115/k0116/k0118/k0119/k0135，如 subject 的「v. 使遭受 / 受制于」与「n. 受试者 / 实验对象」）；`examCount` 分布 1:299 / 2:36 / 3:9 / 4:2 / 7:1，高频（≥2）= 48 条；`META.total` 已同步为 347，`freq === sourceQuoteCount` 全 347 条成立，其余字段齐全、uid 全为 `k\d{4}`。
- 网站层 4 处逻辑改动：`cardHtml` 的 `.wc-word` 追加 `<span class="sense-tag">`（仅当 `e.sense`）；记忆卡背面 `#fbWord` 改 `innerHTML` 追加 sense、正面 `#fcWord` 仍 `textContent`；`filtered()` 搜索 hay 加入 `e.sense`；`startQuiz()` 在 `qs.length < n` 时 toast、`switchView('quiz')` 在 `state.quiz === null` 时恢复 intro。另 `index.html` 关于页补义项拆条说明、`style.css` 新增 `.sense-tag`（app.js:110 附近）。

### 验证手段

按上节同样方法**完全重建**探针（上次临时脚本已清理，本次未复用）：`node --check assets/app.js` / `data/corpus.js` / 探针脚本全过；Windows Edge headless `msedge --headless --disable-gpu --allow-file-access-from-files --virtual-time-budget --dump-dom` 加载由 `index.html` 生成的同构探针页，注入 `audit_site_probe.js` 以合成 `Event`/`MouseEvent`/`KeyboardEvent` 驱动交互，并**独立复算** `expectedList()`（hay 含 `e.sense`）+ `expectedSorted()` 与 DOM 结果逐条比对。另建禁用 `localStorage`、空数据两个变体页，并以 `--window-size=375,812` 跑窄屏。

### 断言结果

| 轮次 | PASS 断言 | FAIL | INFO（观察记录） |
|---|---:|---:|---:|
| 主探针（默认视口 754px） | 126 | 0 | 4 |
| 375px 窄屏（headless 实际 492px） | 127 | 0 | 4 |
| 禁用 `localStorage` 变体 | 3 | 0 | 0 |
| 空数据变体 | 2 | 0 | 0 |
| **合计** | **258** | **0** | **8** |

四轮共 258 条 PASS 断言、0 FAIL；`window.onerror` 全程未触发。修复后（本轮无代码修复）重跑 `node --check` 全过。

### 逐项结论（对照回归要求）

1. **排序**：7 个 option 逐个验证语义单调性全部 PASS；`freqDesc` 首条 `address/7`，同频依次按 `freq` 降序 → `difficulty` 降序 → 字母序，稳定无逆序；切换排序确实重排；「仅高频」结果 48 条且全部 `examCount>=2`，与排序逻辑一致。
2. **347 条全量**：连续 9 次「加载更多」后 DOM 渲染 347 条、uid 无重复且集合等于全量；类型/卷别/主题/难度/年份组合、4 类搜索、36→72→108 加载更多、展开后重渲染保留、收藏与掌握度 `box 2↔0` 持久化、标签闭合平衡、无 `data-act` 误触发 —— 全部无回归。
3. **搜索义项**：「受试者」命中 k0135 且卡片 sense 标签文本为「n. 受试者 / 实验对象」；完整义项串「n. 受试者 / 实验对象」与「v. 使遭受 / 受制于」在数据里**仅存在于 `sense` 字段**（不含 sense 的 hay 命中 0 条），仍各自精确命中 1 条，严格证明 `filtered()` 已纳入 `e.sense`。
4. **sense 展示**：列表 8 个 `.sense-tag` 的 uid 与文本逐一对应；记忆卡正面 `#fcWord` 仅 `subject`、不含 sense 字面内容且无 `.sense-tag`，背面 `#fbWord` 含 sense 标签与 headword/音标；翻卡、`3/2/1` 评分、重新入队/插队、跳过、完成态、清空掌握记录均正常。
5. **测验**：3 组 × 20 题共 60 题覆盖三种题型；每题 4 选项互不重复、正确答案唯一且属于选项（`dupFail=0 / ansFail=0`）；答案判定、反馈展示原句、结束得分/错题回顾/再来一组动态按钮、`<4` 条兜底全部 PASS；题量不足（筛选 7 条 / 设定 10 题）toast「当前筛选可出 7 题（少于设定的 10 题）」且仍能开始、进度显示「第 1 / 7 题」；退出（`quitQuiz`）与 `quizBack` 后再次进入测验均显示开始界面。
6. **原文与容错**：真题原文分组、卷别/年份/检索过滤、点击词条跳回并展开、`<mark>` 高亮、空结果、禁用 `localStorage`、空数据兜底全部 PASS。
7. **健壮性**：无未捕获异常；无 XSS —— 除静态检查外做了注入压力测试（临时把一条 `sense` 改为 `<img src=x onerror=...> & "q"`），`#cardList` 与 `#fbWord` 均被 `esc` 转义为 `&lt;img…`、脚本未执行、`sense-tag` 文本正确显示为原文，随后恢复原值；全 347 条 headword 及压力串构造正则无异常；含 `...` 的 8 条短语仍无误标虚词；键盘 `/`、空格、1/2/3、Esc 与 900px / 560px 响应式断点全部 PASS。

### 发现并修复的问题

**本轮新发现 BUG：0 个，未修复任何代码。** 未修改 `index.html`、`assets/app.js`、`assets/style.css`，也未触碰 `data/` 下任何既有文件（仅追加本报告本节）。符合「只改确定 BUG、不凑数」的要求。

说明：首轮主探针曾出现 1 条 `FAIL | 全队列 347 条 | total=2`，经定位为**探针自身状态污染**——`studyone` 前遗留的 `subject` 搜索词未清空，导致 `shuffleCards` 的 `filtered()` 只剩 2 条，属测试脚本问题而非网站缺陷；在 `shuffleCards` 前补一次 `reset()` 后该断言 PASS（`total=347`），且「收藏当前词条写入」「完成态」两条断言由假 PASS 变为真实通过（`after=1`、`guard=345`）。

### 遗留风险

1. 上一版报告 E1–E4、E6 的体验问题依旧（本轮未改，非回归）：含撇号短语可能误标、`<details>` 展开态重渲染丢失、直接切 tab 离开测验再回来仍停在结果页（`switchView` 仅在 `state.quiz === null` 时收敛，本轮验收的 `quitQuiz` / `quizBack` 路径均已通过）、题量被筛选条数静默缩减（现已有 toast 提示）、`uid` 未 `esc` 的低优先级边界。
2. 记忆卡完成态时 `#fbWord` 背面 DOM 仍残留上一词条的 sense/释义（既有行为；`flip()` 因 `currentEntry() === null` 直接 return，用户不可见）。
3. 验证依赖 Edge headless 合成事件，未覆盖真实鼠标 hover / 滚动 / 触摸、字体渲染与打印样式；`confirm` 在探针中被覆盖为 `true`；`random` 排序仅校验条数与 uid 合法性，未校验分布均匀性。
4. 数据层（`data/`）本轮完全未触碰，语料内容正确性由数据审查负责。

---

## 追加修复 · 「划线部分丢失」（用户反馈）

- **现象**：语境选义题文案为「在真题原句中判断划线部分的含义」，但实现用 `blank()` 把考查词挖成虚线空格，划线词本身不可见，题干与呈现矛盾。用户截图题目为 2010 英语一翻译 `these creatures preserve the health of game …`（考查 `game` = 猎物）。
- **修复**：
  1. 新增 `underline()`：保留完整真题原句，用 `<span class="underline-target">` 给考查词加醒目下划线与朱红底色；`.blank` 由虚线改为实线。
  2. 原挖空形式保留为独立题型「语境填空 · 判断空格处所缺词的含义」，文案不再声称「划线」；`kinds` 加入 `cloze`，与 `context` / `poly` / `reverse` 共四种题型。
  3. 新增 `meaningOptions()`：语境题的干扰项优先取**同一 headword 的其他义项**（利用义项拆条数据），让熟词僻义真正被辨析，避免词显示出来后题目过易。
- **回归验证**：Edge headless 注入探针连做 10 题 → 题型分布 释义选词 5 / 语境选义 3 / 语境填空 2；3 道语境选义的 stem 全部含 `underline-target`，2 道填空全部含 `class="blank"`，文案与呈现 100% 匹配；每题 4 个选项且互异；`node --check` 通过；临时探针已清理。
- **未改动**：`data/` 下任何文件；其余功能无回归。

> 注：本节的「保留挖空为独立题型」方案经用户二次反馈仍不满意，已由下一节彻底替换。

---

## 二次修复 · 移除挖空 + 重写短语匹配（用户二次反馈）

- **反馈**：上一版只是把挖空改名为「语境填空」，用户仍认为「划线部分丢失」；截图显示一道题被挖出 4 条空线，连 `the` / `such as` 一类虚词也被挖掉。
- **根因**：`blank()` 基于 `hwRegex()` 的**逐词全局正则**替换，多词短语被拆成单个 token，句中所有同形词（含功能词）都被换成空格；且题干文案仍称「划线」，与呈现矛盾。上一版未触及底层匹配逻辑。
- **彻底修复**：
  1. **删除全部挖空**：`blank()`、`cloze` 分支、`.quiz-stem .blank` 样式一并移除；语境题一律显示完整真题原句。
  2. **重写为「锚点词干序列」匹配**：`stemAlt()` 处理屈折与不规则变化（`penned` / `spelt` / `bought` / `homogenizing` / `are prone to` / `buy our way out of`）；`anchors()` 把 `(BMI)`、`sth`、`sb`、`one's`、`...`、连字符复合词、斜杠备选归一为锚点或空位；`buildRegex()` 先严格相邻、再允许少量插入词兜底，通配空位限长避免划偏；`markOnce()` **只标记第一个整体片段**，绝不逐词替换。
  3. `hl()` 同步改用 `markOnce()`，匹配不到时返回纯文本（不再回退逐词高亮），列表卡片 / 记忆卡 / 真题原文页的高亮一并修正。
- **全库验证（Node 直接加载站点函数）**：347/347 条均能整体划线；多处标记 0、超长标记 0；`hl()` 全部恰好 1 处 `<mark>`、0 条无高亮。
- **浏览器回归（Edge headless 注入探针）**：连做 20 题 → 语境选义 11 / 释义选词 8 / 熟词僻义 1；含挖空题 **0**；11 道语境题划线数全为 1；文案与呈现 100% 一致；每题 4 个选项互异；无页面异常；列表卡片展开后 `<mark>` 恰好 1 处。
- **未改动**：`data/` 下语料文件、`build.py` 与 `真题语料整理.md` 均不变。

