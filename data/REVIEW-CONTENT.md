# 内容审校报告 · 考研英语真题语料库

> 审查角色：独立内容审校（不参与网站开发）。
> 审查范围：`data/part-A.json … part-F.json`（六卷共 **411** 条）、`data/corpus.json`（合并 351 条，只读）、`data/part-*.md` 与 `真题语料整理.md`（只读）、`data/meta.json`（只读）。
> 审查方式：① 先读 `data/SCHEMA.md` 明确字段约定；② 全量通读六个分卷 JSON；③ 编写 `audit_content.py`（`check` / `fix` / `validate` 三模式）做批量检查；④ 用 WebSearch / WebFetch 做 8 组事实核查。
> 修改权限：仅用 Python 按 `id` 精确修改 `data/part-*.json`。**本报告未改动** `corpus.json`、`corpus.js`、`meta.json`、`真题语料整理.md`、`build.py`、`index.html`、`assets/`（均属主流程统一重建范围）。
> 结论速览：确定错误 **3** 项（已修复 2 项，1 项有事实依据但按授权未改 quote）；存疑待核 **6** 组；一致性提示 **7** 组。

---

## 一、确定错误

### 已直接修复（2 项，均 100% 确定）

#### E1 · `part-F.json` / `f002` · `phonetic`
- **字段**：`phonetic`（值 `/ˈsʌbdʒɪkt/`）
- **问题**：该 `polyseme` 的 `headword=subject`、`pos="v./adj."`，`quote` 为 2008 英语一完形 `…has **subjected** them to unique evolutionary pressures…`——**动词用法**（subject sb to sth「使遭受」），却标注了名词/形容词的重音在前读音 `/ˈsʌbdʒɪkt/`。
- **依据**：
  - 词典核查（单词鸭、听小云、PLC 培训、公众号「单词精讲 subject」）一致：subject 作名词/形容词读 `/ˈsʌbdʒɪkt/`（重音在前），作动词「使服从/使遭受」读 `/səbˈdʒekt/`（重音在后，首音节弱化为 /ə/）。
  - **同一句真题**在 `part-A.json/a043`（`pos="v."`）标注的正是 `/səbˈdʒekt/`，同词同句同卷别却给出两种读音。
  - `SCHEMA.md` 第四节要求 `phonetic` 为 IPA 且与词性对应；本题审查要点亦明确点名「subject 名词与动词读音差异」。
- **建议修正 / 已执行**：`/ˈsʌbdʒɪkt/` → `/səbˈdʒekt/`。
- **备注**：本条 `pos` 与 `rare_meaning` 同时含 v.（使遭受）与 adj.（be subject to 受制于）两义，音标按 `quote` 的动词用法取值；adj. 用法的读音差异宜在 `note` 中说明（`note` 已提及 subject to）。修复仅动 `part-F.json`，不改变 `corpus.json`（其 subject 主条目取自 `d044`）。

#### E2 · `part-F.json` / `f031` · `years_seen`
- **字段**：`years_seen`（值 `[2010, 2010]`）
- **问题**：年份数组含重复元素。`freq=2` 表示「同年两卷两处独立真题出处」（2010 英二 Text 1 拍卖句 + 2010 英一 Text 4 资产估值句），本身合理；但 `years_seen` 应「只列真实年份」且去重。
- **依据**：`SCHEMA.md` 铁律 5「`freq` = 可回溯的独立真题出处数，`years_seen` 必须与之一致、只列真实年份」；该条 `note` 自述两处均为 2010；`build.py` 的 `merge_group` 用 `set` 去重，修复不改变合并结果。全库仅此 1 条 years_seen 重复。
- **建议修正 / 已执行**：`[2010, 2010]` → `[2010]`（`freq=2` 保持不变）。

### 有事实依据、按授权未改（1 项，需主流程处理）

#### E3 · `part-C.json` / `c021` · `quote`（及 `note`）
- **字段**：`quote` / `note`
- **问题**：`quote` 作 `Nearly 2,000 years ago, as the Romans began to pull out of Scotland, they left behind a curious treasure: 10 tons of nails, nearly a million of **them**.`；真题原文为 `…nearly a million of **the things**.`。`note` 自称「2024 英语一 Text 1 回忆版中**多来源一致**的开头，仅收此稳定片段」，但所核 5 个来源无一处作 `of them`。
- **依据**：WebFetch 中公考研《2024考研英语一阅读试题原文》（`yz.kaoyan365.cn/yingyu/146373.html`）首句原文照抄即 `…10 tons of nails, nearly a million of the things.`；天任教育、中公考研试题页、考研信息网（回忆版）、四川考研 5 个独立来源一致。`c021` 的 `headword=pull out (of)` 回归原文无问题，差异仅在句末短语。
- **建议修正**：`of them` → `of the things`；`note` 中「多来源一致」改为「按公开真题原文修订」。
- **未直接改原因**：任务明确「不要擅自改 `quote`」，且「直接修复」白名单只含拼写、错别字、明显音标错误、明显词义错配、字段自相矛盾，原句措辞不在其列；留待主流程重建时统一修订。（2024 Text 1 其余词句未见异常。）

---

## 二、存疑待核

> 以下均**只写报告、不改数据**。

#### S1 · `part-B.json` / `b047` · `rare_meaning` 与 `quote` 不对应
- `polyseme` 的 `rare_meaning = "n.（社会问题的）对策、解决办法（the social cure）"`，但 `quote` 为 2013 英语一 Text 3 `Science and technology would **cure** all the ills of humanity, leading to lives of fulfillment and opportunity for all.`——**动词「治愈/消除」本义**（已核实：中国教育在线、华慧考研、和谐英语、无忧考网、可可英语 5 来源一致原文），并不体现所标名词僻义。
- `note` 说明作者是「有意用 2013 动词本义句与 2012 Text 1 的 the social cure 作义项对照」。属教学设计取舍，但违反「`rare_meaning` 应对应 `quote` 里的用法」的审查口径。
- **建议**：若保留本条，把体现僻义的 2012 英语一 Text 1 `The most glaring flaw of the social cure …` 作为 `quote`（`part-F/f010` 已收该句），或把本义句明确标注为「对照句」。合并后 `corpus.json/k0007` 的 `rare` 取自 `e045`（对应僻义），`b047` 本义句落在 `more_quotes`，合并结果尚可。
- **状态**：存疑，不改。

#### S2 · `part-B.json/b045`、`part-F.json/f030` · `court` 常见义/僻义疑似倒置
- `common_meaning = "n. 庭院、球场；v. 求爱、试图博得"`，`rare_meaning = "n. 法院、法庭"`。现代英语中 `court=法院` 属高频常用义，「庭院/求爱」反而更僻；法政阅读中一律指法院。是否属于「把常见义当成僻义」取决于教学口径。
- **建议**：主流程复核是否对调，或改写为「普通义：场地/宫廷 → 法政专义：法院」。不改。

#### S3 · `part-E.json/e058` · `tip` 的义项落差与难度
- `type=polyseme`、`difficulty=2`，`common="尖端；小提示；倾斜"`、`rare="小费；给小费"`。`tip=小费` 属中学阶段基础义，且 2025 英语二 Text 1 全篇主题即小费文化，`e070`（tipflation）、`f041/e041`（prevalence）同卷重复；作为「熟词僻义」义项落差偏弱。
- **建议**：主流程复核是否改归 `theme`（主题词）或调整 `common/rare`。按「不删条目」原则不改。

#### S4 · `part-C.json/c042` · `buy` 的 `meaning` 与 `note` 略有出入
- `meaning = "（僻义）收买、买通"`，但 `quote = "If connections can be **bought**, a basic premise of democratic society…is undermined."`（2017 英语一 Text 4）与 `note`「人脉可用钱买到」指的是「花钱买到关系」，而非「收买某人」；`common="购买（商品）"`、`rare="用钱打通关系／收买（被动 be bought）"` 亦随之偏颇。
- **建议**：`meaning` 改为「（关系/人脉）可用钱买到、打通」。属措辞精度，不改。

#### S5 · `part-F.json/f029` · `ornament` 的 `common/rare` 义项落差过弱
- `common="n. 装饰品、点缀物（具体物件）"`、`rare="n.（抽象）增色之物、装饰性点缀、门面"`，两者近乎同义反复；`SCHEMA.md` 第五节要求 `polyseme`「必须真的存在义项落差，不能是同义反复」。且 `part-A/a022` 已作 `word` 收录同词同句。
- **建议**：主流程复核该条是否应改归 `word` 或删除。不改。

#### S6 · 少数条目 `topic` 与 `quote` 语境不符（分类建议，1 组 5 条）
| 位置 | 现 `topic` | `quote` 实际语境 | 建议 |
| --- | --- | --- | --- |
| `part-F/f017` practice | 教育与人才 | 2020 英语二 Text 2「CEO 薪酬与股价挂钩、build up corporate value」（已核实希赛网/研线网真题原文） | 经济与商业 |
| `part-F/f014` interest | 经济与商业 | 2019 英语一 Text 2「符合学校最大利益」（教育语境） | 教育与人才 |
| `part-F/f047` vulnerable | 心理与行为 | 2020 英语二 Text 3「城市独自治污措施在政治上易受争议」（环境/治理） | 环境与能源 / 法律与治理 |
| `part-F/f051` productivity | 教育与人才 | 2022 英语一 Text 4「限制解雇高薪经理拖累生产率」（职场/经济） | 经济与商业 / 职场与就业 |
| `part-F/f063` homogenize | 历史与语言 | 2006 英语一 Text 1「美国社会是同化机器」（`part-A/a025` 同词标「社会与人口」） | 统一为 社会与人口 |
- **说明**：`topic`/`tags` 分类不在授权直接修复字段内，且各条 `note` 常跨多卷举例，故仅报告不改。

#### S7 · 已核实、故不列存疑（说明，避免凑数）
- 2025 英语二 Text 1 相关 6 条（`e020`/`e041`/`e058`/`e070`/`f040`/`f041`）的 `quote` 与社科赛斯、试题 PDF、新东方、微信逐句版一致；2024 英语一 Text 1 除 E3 外亦与 5 来源一致。2024/2025 条目虽新，但可回溯，**不因「看起来像回忆版」而标存疑或删条目**。

---

## 三、一致性提示

#### C1 · 同一 `headword` 跨卷僻义互相冲突，合并后造成 `rare_meaning` 与 `more_quotes` 语境错配（重点）
- 脚本按 `(type, headword)` 分组，发现 **4 组真义项分歧**（非措辞差异）：
  | headword | 各卷僻义 | 合并后 `corpus.json` | 错配表现 |
  | --- | --- | --- | --- |
  | `subject` | `a043`/`b044`/`f002`「使遭受 / 受制于」 vs `d044`「（实验）受试者」 | `k0002` 取 `d044` 为 main，`rare=受试者`，`ph=/ˈsʌbdʒɪkt/` | `more_quotes` 挂着 2008 完形（`subjected` 动词「使遭受」）与 2012 完形（`subject to` 形容词），与「受试者」僻义不符 |
  | `game` | `a042`/`f004`「猎物、野味」 vs `e043`「进程、局面（late in the game）」 | `k0004` `rare=猎物` | `more_quotes` 是 2017 英二 Text 3 的 `switching too late in the game` |
  | `buy` | `a051`/`d055`/`f006`「相信、买账」 vs `c042`「（关系）可花钱买到」 | `k0003` `rare=相信、买账` | `more_quotes` 含 2017 英一 Text 4 `If connections can be bought` |
  | `ground` | `d049`「v. 使立足于」 vs `f013`「n.（复数 grounds）理由、依据」 | `k0008` `rare=动词义` | `more_quotes` 是 2014 英一 Text 2 `grounds for complaint`（名词复数），词性也不同 |
- **依据**：`build.py:merge_group` 按 `score` 选唯一 `main`，`rare_meaning` 只保留一条，其余僻义仅以原句形式进 `more_quotes`（不带释义），必然产生上述错配。
- **建议**：主流程重建时，对「一词多僻义」按义项拆条（`headword` 加义项限定，如 `subject (v.)` / `subject (n. 受试者)`），或在 `note`/`rare_meaning` 中并列多个僻义并逐一标注出处；不要只保留一条 `rare`。本题要求检查「同一 headword 是否在不同分卷被赋予互相矛盾的僻义」，以上 4 组即为结论。

#### C2 · 同一考点被拆成两条词条（`corpus.json` 实质重复）
- `save`：`part-C/c053` 的 `headword="save (for)"` 与 `part-F/f019` 的 `headword="save"` 字符串不同，`build.py:norm_key` 未合并 → `corpus.json/k0127` 与 `k0128` 并存，`common/rare` 几乎相同，`quote` 完全相同（2019 英语一 Text 2）。**建议**统一 `headword` 为 `save`。
- `prevalence`：`part-E/e041`（`word`）与 `part-F/f041`（`theme`）同词同 `quote`，因 `type` 不同拆成 `corpus.json/k0169` 与 `k0344`。**建议**统一 `type` 并合并。
- 另：`corpus.json` 中**不存在**「同 type 同 headword」的重复（合并逻辑已去重），此项为「字符串/类型口径不一致导致的实质重复」。

#### C3 · 同一 `quote` 被 3 条 entry 承载（违反 `SCHEMA.md` 第五节「同一个 `quote` 最多承载 2 条 entry」）
共 6 组：
1. `But the cult of the authentic … has spelt the death …` → `A/a005`, `A/a048`, `F/f005`
2. `Feelings of righteous indignation … are not the preserve of people alone.` → `A/a028`, `A/a041`, `F/f027`
3. `These rules say they must value some assets … would like them to fetch.` → `A/a054`, `A/a060`, `F/f024`
4. `As boards scrutinize succession plans … wish to move on.` → `B/b025`, `B/b069`, `F/f064`
5. `In many respects, the dearth of moral purpose frames … the terms on which the trial took place.` → `B/b057`, `F/f023`, `F/f037`
6. `A recent annual study of countries … sheds some light on that question.` → `C/c003`, `C/c064`, `F/f046`
- **建议**：主流程重建时每组保留语言点不同的 2 条，第 3 条并入 `more_quotes` 或删去。因涉及删条目，本次不改源数据。
- **成因**：`part-F` 定位为「跨卷专题 · 熟词僻义与主题词」，与 A–E 大量复现（源数据共 **47 组**同 `(type, headword)` 重复），属设计意图；但其中若干组出现「同 `quote` 同 `headword` 同 `type`」的完全冗余（如 `C/c057` 与 `F/f048` algorithm、`A/a057` 与 `F/f052` biomass、`B/b059` 与 `F/f045` peer pressure 等），建议一并去重。

#### C4 · `part-B.json` 非 `polyseme` 条目含冗余空字段
- `part-B.json` 有 **54 条** `expression`/`word`/`theme` 条目带 `common_meaning: ""`、`rare_meaning: ""`（其余五卷无此写法）。`SCHEMA.md` 规定这两个字段「仅 `polyseme` 必填」。`build.py` 合并时会 `pop` 掉，不影响 `corpus.json`，但源卷风格不统一。
- **建议**：主流程清理冗余字段。

#### C5 · 分卷 `segment` / md 标题与年份口径冲突
- `part-C.json` 的 `segment="英语一 2017–2024"`，实际 69 条年份确为 **2017–2024**（无 2025 条目）；但 `build.py` 的 `SEG_TITLES['C']="英语一 2017–2025"`，致 `真题语料整理.md` 分卷 C 标题写成「英语一 2017–2025」，比实际多一年，与 json 冲突。
- **建议**：主流程把 `SEG_TITLES['C']` 改为 `2017–2024` 后重建 md（`build.py` 与 md 均在严禁修改清单内，本次未动）。
- **说明**：全局 `year_max=2025` 由 `part-E` 的 2025 英语二条目支撑，`meta.json` 与 `真题语料整理.md` 汇总「覆盖年份 2005–2025」「合并 351 / 原始 411 / 出处 115」均正确、与 json 一致。其余 A/B/D/E/F 五卷 segment、实际年份范围、build.py 标题三者一致。

#### C6 · OCR 易讹词已核查，`part-*.json` 未误收（无错误，如实说明）
题目点名的三组转载页 OCR 差异，经核实**均为讹误**，六个分卷 JSON 的 `quote` 未采用讹误词：
- **2005 英一 Text 1 `induce/reduce`**：真题为 `…was enough to **induce** resentment in a female capuchin`（「引起不满」，可可英语、今日头条、金锄头一致）；中国报考在线作 `reduce resentment`（形近讹误且语义相反）。`part-A.json` 未引用该句（`a001`/`a028` 引用同篇另两句），无错误。
- **2010 英一 Text 1 `learned/erudite`**：真题为 `their **learned** contents were once deemed suitable for publication in general-circulation dailies`（中公、人大出版社、新东方在线、跨考、博档 5 来源一致）；`erudite contents` 为讹误。`a008`/`a023` 用 `learned` ✓，`quote_zh`「学识渊博的内容」与语境义一致 ✓。
- **2017 英二 Text 1 `lever/level`**：`Planning documents pledged … would be to lever/level a nation of sport lovers away from their couches`——多数中文转载页作 `level`（疑 OCR 沿袭），文都法硕等作 `lever`。`e044` 的 `note` 已明确说明分歧并**只取无争议的前两句连续原文**（`Parkrun is succeeding where London's Olympic "legacy" is failing. Ten years ago on Monday …`），未引用含 lever/level 的后句，处理得当。
- `part-A.md` 第 249 行、`part-E.md` 第 233 行已分别记录上述规避说明，与 json **无冲突**。
- 题目另举的 `minute /maɪˈnjuːt/ 与 /ˈmɪnɪt/`：全库无 `minute` 词条，不存在该音标错配；「subject 名词/动词读音差异」见 E1（已修复）。

#### C7 · 其余检查项均无异常（说明，避免凑数）
- 六个 part JSON 全部可解析；**必填字段齐全**（`REQUIRED` 18 项 + polyseme 的 `common_meaning`/`rare_meaning`，0 缺失）；`difficulty` 仅取 2/3（**无 1**）；`topic`、`tags` 全部在枚举内且 `tags ≤3`；`phonetic` 全部 `/…/` 包裹、未见非法 IPA 字符或中文混入。
- `headword` 核心词形（含屈折与不规则变化 `spelt`/`bought`/`subjected`/`penned`/`doctored`/`spiking` 等）**全部回归 `quote`**；`source`/`year`/`paper`/`section` 四字段拼装后与 `source` 完全一致；`years_seen` 均含本条年份且落在 2005–2025；`freq ≥1` 且为整数。
- `note` 未见空话；未见中文错别字；`quote_zh` 与 `quote` 对应抽查一致。
- **难度筛选**：未见 `difficulty=1`，也未见 `make/take/good/important` 常用义、`be good at`、`a lot of` 一类中学基础义词条。个别搭配（`b002 for the most part`、`c015 keep up with`、`d015 contrary to`、`d017 make ends meet`）虽偏常用，但均标 `difficulty=2` 且属书面高频搭配，按「宁精勿滥」不列为错误、不删条目。

---

## 附：修复与校验记录

| 项目 | 内容 |
| --- | --- |
| 修复脚本 | 项目根目录 `audit_content.py`，`FIXES` 按 `(part, id, field)` 精确定义，仅写 `data/part-F.json` |
| 修复 1 | `F/f002` `phonetic`: `/ˈsʌbdʒɪkt/` → `/səbˈdʒekt/` |
| 修复 2 | `F/f031` `years_seen`: `[2010, 2010]` → `[2010]` |
| 校验命令 | `python audit_content.py validate` |
| 校验结果 | 六卷全部可解析；条数 A=68 / B=70 / C=69 / D=67 / E=72 / F=65（合计 **411**，与修复前一致）；`id` 唯一；必填字段 0 缺失；两处修复值已生效；UTF-8 中文正常 |
| 未改动文件 | `corpus.json`(351) / `corpus.js` / `meta.json`(351) / `真题语料整理.md` / `build.py` / `index.html` / `assets/*` 均保持原样 |
