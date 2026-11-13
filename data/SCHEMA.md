# 真题语料数据规范（所有子代理必须严格遵守）

## 一、口径

- 英语一：**2005–2025**（2005–2009 的"英语"试卷按惯例归入英语一体系）
- 英语二：**2010–2025**（2010 年起分卷）
- 覆盖题型：阅读理解 Part A / Part B、完形填空、翻译、写作范文/题干、新题型。优先阅读 Part A。

## 二、铁律（违反即作废）

1. **每条 entry 必须能回归真题原文**：`quote` 必须是真题中真实存在的英文句子或忠实截取的连续片段，`source` 必须精确到"年份 + 卷别 + 题型/篇目"。**严禁编造句子**。不确定的句子宁可不收录。
2. 用 WebSearch / WebFetch 核实原文。可检索公开真题页面（新东方、中国教育在线、启航、考研帮等）。若某句只能凭记忆、无法核实，则**不要写入**。
3. **不收录太简单的内容**：不收中学已完全掌握的词与基础义（如 make/take/good/important 的常用义、be good at、a lot of 等）。只收：高阶搭配、抽象名词、学术动词、熟词僻义、主题域术语。
4. **单词必须有音标**：`word` / `polyseme` / `theme` 三类必须有 `phonetic`（IPA，带斜杠，如 `/ɪnˈeksərəbl/`）。`expression` 类型也要给其中核心词的音标。
5. **考频必须真实**：`freq` = 该词条在本站语料中可回溯的**独立真题出处数量**（不同年份/不同卷别的同一考点分别计数），`years_seen` 必须与之一致、只列真实年份。只有 1 处就写 1，禁止虚构放大。
6. 只输出 JSON 与 Markdown 文件，**不要在最终回复里粘贴大段内容**。

## 三、输出文件

每个子代理写两个文件（路径见各自任务）：

- `data/part-X.json`：结构化数据
- `data/part-X.md`：该分卷的**真题原文语料整理文本**（按年份 → 卷别 → 篇目，摘录含语言点的原文段落，中文夹注要点）

## 四、JSON 结构

```json
{
  "segment": "英语一 2005–2012",
  "agent": "A",
  "entries": [
    {
      "id": "a001",
      "type": "expression | word | polyseme | theme",
      "headword": "inexorable decline",
      "phonetic": "/ɪnˈeksərəbl/",
      "pos": "n. phrase / v. / adj. / ...",
      "meaning": "不可阻挡的衰退",
      "note": "写作可迁移：inexorable + 抽象名词，表趋势不可逆；比 unavoidable 更书面",
      "common_meaning": "（仅 polyseme 必填）常见义",
      "rare_meaning": "（仅 polyseme 必填）真题僻义",
      "quote": "perhaps the most far-reaching has been the inexorable decline in the scope and seriousness of their arts coverage.",
      "quote_zh": "其中影响最为深远的，或许是其艺术报道范围与严肃性不可逆转的衰退。",
      "source": "2010 英语一 阅读 Text 1",
      "year": 2010,
      "paper": "英语一",
      "section": "阅读 Text 1",
      "topic": "传媒与文化",
      "difficulty": 3,
      "freq": 2,
      "years_seen": [2010, 2019],
      "tags": ["写作可迁移", "长难句"]
    }
  ]
}
```

### 字段说明

| 字段 | 要求 |
| --- | --- |
| `type` | `expression` 地道表达/搭配；`word` 重点难词；`polyseme` 熟词僻义；`theme` 主题词 |
| `headword` | 英文词条；polyseme 用单词原形；theme 用主题域核心词 |
| `phonetic` | IPA 音标，斜杠包裹；英式美式均可，全卷统一风格 |
| `meaning` | 中文释义，简洁准确，突出真题语境义 |
| `note` | 用法/辨析/记忆锚点/写作迁移，一句话到两句话，不要空话 |
| `quote` | 真题原句（英文原文措辞） |
| `quote_zh` | 该句贴切翻译 |
| `source` | 例：`2010 英语一 阅读 Text 1` / `2014 英语二 完形` / `2006 英语一 翻译` |
| `section` | 例：`阅读 Text 1` / `完形` / `翻译` / `新题型` / `写作` |
| `topic` | 从下列主题域选一个：`经济与商业` `科技与AI` `法律与治理` `教育与人才` `环境与能源` `社会与人口` `心理与行为` `传媒与文化` `医学与健康` `科学与技术` `历史与语言` `职场与就业` |
| `difficulty` | 整数 2 或 3（2=有门槛，3=高阶/易错）。**禁止 1** |
| `freq` | 正整数，真实可回溯出处数 |
| `years_seen` | 整数年份数组，真实 |
| `tags` | 从 `写作可迁移` `长难句` `易错义` `高频搭配` `抽象名词` `态度词` `逻辑连接` 里选 0–3 个 |

## 五、质量要求

- `quote` 长度建议 12–45 词，过短不成语境、过长占版面。
- 同一个 `quote` 最多承载 2 条 entry，避免重复堆砌。
- `expression` 条目要能用于写作迁移（如 `be susceptible to`、`at the expense of`、`in conjunction with`），不要收简单动词短语。
- `polyseme` 必须真的存在义项落差（如 `game` 猎物、`weather` 渡过、`subject` 使遭受、`address` 处理），不能是同义反复。
- `theme` 按主题域组织，覆盖该主题的高阶术语（如 `regulatory / incentive / disparity / resilience`）。
- 每段分卷目标 **55–75 条 entries**，宁精勿滥。

## 六、Markdown 语料文本格式

```markdown
## 2010 · 英语一

### 阅读 Text 1｜传媒与文化
> Of all the changes that have taken place ...（原文段落）

**可回溯语言点**：inexorable decline（不可阻挡的衰退）、far-reaching（影响深远的）、deemed suitable for（被认为适合）、calling（使命感/天职）、in headlong retreat（迅速衰退）……
```

只摘录真正含语言点的段落，不要整篇复制。
