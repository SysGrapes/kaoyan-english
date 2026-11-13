# -*- coding: utf-8 -*-
"""合并各分卷语料，重算全局考频，生成网站可用的静态数据与整理文本。"""
import json, glob, os, re, collections

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, 'data')

PARTS = ['A', 'B', 'C', 'D', 'E', 'F']
SEG_TITLES = {
    'A': '英语一 2005–2010',
    'B': '英语一 2011–2016',
    'C': '英语一 2017–2024',
    'D': '英语二 2010–2016',
    'E': '英语二 2017–2025',
    'F': '跨卷专题 · 熟词僻义与主题词',
}

REQUIRED = ['id', 'type', 'headword', 'phonetic', 'pos', 'meaning', 'note',
            'quote', 'quote_zh', 'source', 'year', 'paper', 'section',
            'topic', 'difficulty', 'freq', 'years_seen', 'tags']

TYPE_PRIORITY = {'polyseme': 0, 'word': 1, 'theme': 2, 'expression': 3}

# 同一熟词在真题里考过不同僻义：必须按义项拆条，否则 rare_meaning 与例句错配
POLY_SENSE = {
    'subject': [('受试者|实验对象', 'n. 受试者 / 实验对象'), (None, 'v. 使遭受 / 受制于')],
    'game': [('猎物|野味', 'n. 猎物 / 野味'), (None, 'n. 进程 / 局面')],
    'buy': [('相信|买账|认同', 'v. 相信 / 买账'), (None, 'v. 用钱打通关系')],
    'ground': [('理由|根据|依据', 'n. 理由 / 依据 (grounds)'), (None, 'v. 使立足于')],
}

def norm_headword(hw):
    s = re.sub(r'\s+', ' ', str(hw or '').strip().lower())
    # 去掉尾部可选搭配标记，但保留 BMI / CSR 这类有意义的缩写
    s = re.sub(r'\s*\((?:of|for|to|with|from|in|on|as)\)\s*$', '', s)
    return s.strip()

def sense_of(e):
    hw = norm_headword(e.get('headword'))
    if e.get('type') != 'polyseme' or hw not in POLY_SENSE:
        return ''
    rare = str(e.get('rare_meaning') or '')
    for pat, label in POLY_SENSE[hw][:-1]:
        if re.search(pat, rare):
            return label
    return POLY_SENSE[hw][-1][1]

def norm_key(e):
    return (e.get('type', 'word'), norm_headword(e.get('headword')), sense_of(e))

def unify_types(raw):
    """同一词条 + 同一真题原句却标了不同类型时，归并为一种，避免重复卡片。"""
    groups = collections.defaultdict(list)
    for e in raw:
        groups[(norm_headword(e.get('headword')), norm_source(e.get('quote')))].append(e)
    n = 0
    for g in groups.values():
        ts = set(x.get('type') for x in g)
        if len(ts) < 2:
            continue
        best = sorted(ts, key=lambda t: TYPE_PRIORITY.get(t, 9))[0]
        for x in g:
            x['type'] = best
        n += 1
    return n

def norm_source(s):
    return re.sub(r'[\s，,、]+', '', str(s or ''))

def year_of_source(s):
    m = re.search(r'(19|20)\d{2}', str(s or ''))
    return int(m.group(0)) if m else None

def merge_group(key, group):
    # 独立真题出处集合（不同年份/卷别/篇目各计 1 处）
    src_map = {}
    for e in group:
        k = norm_source(e.get('source'))
        if k and k not in src_map:
            src_map[k] = str(e.get('source')).strip()
    sources_all = sorted(src_map.values(),
                         key=lambda s: (year_of_source(s) or 0, s))

    years = set()
    papers = set()
    topics = set()
    tags = []
    for e in group:
        if isinstance(e.get('year'), int):
            years.add(e['year'])
        for y in e.get('years_seen') or []:
            if isinstance(y, int):
                years.add(y)
        for s in sources_all:
            y = year_of_source(s)
            if y:
                years.add(y)
        if e.get('paper'):
            papers.add(str(e['paper']).strip())
        if e.get('topic'):
            topics.add(str(e['topic']).strip())
        for t in e.get('tags') or []:
            if t not in tags:
                tags.append(t)

    # 按义项拆条的熟词僻义：复现年份只计该义项自身可回溯的出处，避免跨义项串年份
    if key[2]:
        years = set(e.get('year') for e in group if isinstance(e.get('year'), int))
        for s in sources_all:
            y = year_of_source(s)
            if y:
                years.add(y)

    # 主条目：信息最完整者（polyseme 的僻义字段、note 长度、原句完整度）
    def score(e):
        return (len(str(e.get('note') or '')) * 2
                + len(str(e.get('quote') or ''))
                + (60 if e.get('rare_meaning') else 0)
                + (40 if e.get('common_meaning') else 0)
                + (20 if e.get('phonetic') else 0))
    main = dict(max(group, key=score))
    main['sense'] = key[2] if len(key) > 2 else ''
    # 显示用词条去掉可选搭配标记，保留原大小写与 BMI / CSR 之类缩写
    main['headword'] = re.sub(
        r'\s*\((?:of|for|to|with|from|in|on|as)\)\s*$', '',
        str(main.get('headword') or '').strip())

    # 其他真题原句（去重后最多 3 条）
    more = []
    seen_q = {norm_source(main.get('quote'))}
    for e in sorted(group, key=lambda x: -len(str(x.get('quote') or ''))):
        q = str(e.get('quote') or '').strip()
        qk = norm_source(q)
        if not q or qk in seen_q:
            continue
        seen_q.add(qk)
        more.append({'quote': q, 'quote_zh': str(e.get('quote_zh') or '').strip(),
                     'source': str(e.get('source') or '').strip(),
                     'year': e.get('year'), 'paper': e.get('paper'),
                     'section': e.get('section')})
        if len(more) >= 3:
            break

    main['id'] = str(main.get('id') or key[1])
    main['phonetic'] = str(main.get('phonetic') or '').strip()
    main['difficulty'] = max(int(e.get('difficulty') or 2) for e in group)
    main['freq'] = len(sources_all) if sources_all else 1
    main['freq_raw'] = sum(int(e.get('freq') or 1) for e in group)
    # 考频：可回溯的真题复现次数（复现年份数与收录原句出处数取较大者，去重）
    main['examCount'] = max(len(sources_all), len(years), 1)
    main['span'] = (max(years) - min(years)) if len(years) > 1 else 0
    main['sourceQuoteCount'] = 1 + len(more)
    main['sources_all'] = sources_all
    main['years_seen'] = sorted(years)
    main['papers'] = sorted(papers)
    main['topics'] = sorted(topics)
    main['tags'] = tags[:3]
    main['more_quotes'] = more
    main['topic'] = main.get('topic') or (sorted(topics)[0] if topics else '社会与人口')
    main['year'] = int(main.get('year') or (sorted(years)[0] if years else 2005))
    main['paper'] = str(main.get('paper') or '英语一')
    main['section'] = str(main.get('section') or '阅读')
    main['source'] = str(main.get('source') or (sources_all[0] if sources_all else ''))
    # 修补 polyseme 的熟义/僻义字段
    if main['type'] == 'polyseme':
        for e in group:
            if not main.get('common_meaning') and e.get('common_meaning'):
                main['common_meaning'] = e['common_meaning']
            if not main.get('rare_meaning') and e.get('rare_meaning'):
                main['rare_meaning'] = e['rare_meaning']
        main.setdefault('common_meaning', '')
        main.setdefault('rare_meaning', main.get('meaning', ''))
    else:
        main.pop('common_meaning', None)
        main.pop('rare_meaning', None)

    for f in REQUIRED:
        if f not in main:
            main[f] = '' if f not in ('difficulty', 'freq', 'year', 'years_seen', 'tags') else None
    return main

def main():
    raw = []
    for p in PARTS:
        fp = os.path.join(DATA, 'part-%s.json' % p)
        if not os.path.exists(fp):
            print('MISSING', fp)
            continue
        d = json.load(open(fp, encoding='utf-8'))
        for e in d.get('entries', []):
            e['_part'] = p
            raw.append(e)
    print('raw entries:', len(raw))
    print('type-unified groups:', unify_types(raw))

    groups = collections.defaultdict(list)
    for e in raw:
        groups[norm_key(e)].append(e)

    merged = [merge_group(k, g) for k, g in groups.items()]
    merged.sort(key=lambda e: (-e['examCount'], -e['freq'], -e['difficulty'],
                               e['type'], e['headword'].lower()))
    # 稳定 id
    for i, e in enumerate(merged):
        e['uid'] = 'k%04d' % (i + 1)

    problems = []
    for e in merged:
        for f in ['phonetic', 'quote', 'quote_zh', 'source', 'meaning', 'note', 'headword']:
            if not str(e.get(f) or '').strip():
                problems.append((e['uid'], f, 'empty'))
        if not str(e.get('phonetic') or '').startswith('/'):
            problems.append((e['uid'], 'phonetic', 'not IPA: ' + str(e.get('phonetic'))[:30]))
        if e.get('difficulty') not in (2, 3):
            problems.append((e['uid'], 'difficulty', str(e.get('difficulty'))))
        if not isinstance(e.get('freq'), int) or e['freq'] < 1:
            problems.append((e['uid'], 'freq', str(e.get('freq'))))
        if len(str(e.get('quote') or '').split()) < 5:
            problems.append((e['uid'], 'quote', 'too short'))
        if e.get('type') == 'polyseme' and (not e.get('common_meaning') or not e.get('rare_meaning')):
            problems.append((e['uid'], 'polyseme', 'missing common/rare meaning'))
    print('merged entries:', len(merged))
    print('problems:', len(problems))
    for p in problems[:40]:
        print('  ', p)

    types = collections.Counter(e['type'] for e in merged)
    topics = collections.Counter(e['topic'] for e in merged)
    papers = collections.Counter(p for e in merged for p in e['papers'])
    years = sorted({y for e in merged for y in e['years_seen']})
    sources = {s for e in merged for s in e['sources_all']}
    print('types:', dict(types))
    print('topics:', dict(topics))
    print('papers:', dict(papers))
    print('year span:', years[0] if years else '-', years[-1] if years else '-')
    print('distinct sources:', len(sources))
    print('freq distribution:', dict(collections.Counter(e['freq'] for e in merged)))

    meta = {
        'total': len(merged),
        'raw': len(raw),
        'sources': len(sources),
        'types': dict(types),
        'topics': dict(topics),
        'papers': dict(papers),
        'year_min': years[0] if years else 2005,
        'year_max': years[-1] if years else 2025,
        'top_freq': [{'headword': e['headword'], 'freq': e['examCount'], 'type': e['type']}
                     for e in merged[:10]],
        'problems': [{'uid': a, 'field': b, 'issue': c} for a, b, c in problems],
    }

    with open(os.path.join(DATA, 'corpus.json'), 'w', encoding='utf-8') as f:
        json.dump({'meta': meta, 'entries': merged}, f, ensure_ascii=False, indent=1)
    with open(os.path.join(DATA, 'corpus.js'), 'w', encoding='utf-8') as f:
        f.write('/* 自动生成：考研英语真题语言精华语料库 */\n')
        f.write('window.__CORPUS__ = ')
        json.dump({'meta': meta, 'entries': merged}, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    with open(os.path.join(DATA, 'meta.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    # 合并整理文本
    out = ['# 考研英语（一/二）近二十年真题语言精华 · 语料整理', '',
           '> 语料口径：英语一 2005–2024、英语二 2010–2025（2025 英语一公开原文来源不足，按「拿不准不收」原则未强行纳入）；以阅读理解 Part A 为主，兼收完形、翻译、新题型。',
           '> 每个语言点均可回溯至真题原文，出处精确到年份、卷别与篇目。',
           '> 本文件由各分卷整理文本合并而成，为网站 `data/corpus.js` 的文本底稿。', '']
    out.append('## 汇总\n')
    out.append('- 合并词条：%d 条（原始 %d 条，按「词条 + 类型」归并）' % (len(merged), len(raw)))
    out.append('- 可回溯真题出处：%d 处' % len(sources))
    out.append('- 覆盖年份：%d–%d' % (meta['year_min'], meta['year_max']))
    out.append('- 四类分布：' + '、'.join('%s %d' % (k, v) for k, v in types.items()))
    out.append('- 考频（真题出处数）最高词条：' + '、'.join(
        '%s(%d处)' % (x['headword'], x['freq']) for x in meta['top_freq'][:6]))
    out.append('')
    for p in PARTS:
        fp = os.path.join(DATA, 'part-%s.md' % p)
        if not os.path.exists(fp):
            continue
        txt = open(fp, encoding='utf-8').read().strip()
        # 降一级处理：分卷标题作为一级章节，内部标题顺延
        out.append('\n---\n')
        out.append('# 分卷 %s｜%s\n' % (p, SEG_TITLES[p]))
        out.append(txt)
        out.append('')
    with open(os.path.join(BASE, '真题语料整理.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(out))
    print('corpus.js / corpus.json / meta.json / 真题语料整理.md written.')

if __name__ == '__main__':
    main()
