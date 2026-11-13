# -*- coding: utf-8 -*-
"""考研英语真题语料库 · 内容审校批量检查（只读审查 + 按 id 精确修复）。

用法：
    python audit_content.py            # 批量检查，输出问题清单（不改任何文件）
    python audit_content.py fix        # 按 id 精确修复 100% 确定错误（仅改 data/part-*.json）
    python audit_content.py validate   # 修复后校验六个 part JSON 可解析、条数不变、必填齐全

审查范围：六个 part-*.json、corpus.json（只读）、各分卷 md、真题语料整理.md（只读）。
严禁修改：corpus.json / corpus.js / meta.json / 真题语料整理.md / build.py / index.html / assets/。
"""
import json, os, re, sys, collections

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, 'data')
PARTS = list('ABCDEF')
# 修复前各卷条数（用于验证「条数不变」）
EXPECTED_COUNTS = {'A': 68, 'B': 70, 'C': 69, 'D': 67, 'E': 72, 'F': 65}

REQUIRED = ['id', 'type', 'headword', 'phonetic', 'pos', 'meaning', 'note',
            'quote', 'quote_zh', 'source', 'year', 'paper', 'section',
            'topic', 'difficulty', 'freq', 'years_seen', 'tags']
POLY_ONLY = ['common_meaning', 'rare_meaning']
TOPICS = {'经济与商业', '科技与AI', '法律与治理', '教育与人才', '环境与能源',
          '社会与人口', '心理与行为', '传媒与文化', '医学与健康', '科学与技术',
          '历史与语言', '职场与就业'}
TAGS = {'写作可迁移', '长难句', '易错义', '高频搭配', '抽象名词', '态度词', '逻辑连接'}
TYPES = {'expression', 'word', 'polyseme', 'theme'}
SEG_TITLES = {  # 来自 build.py，用于检测 md 与 json 的 segment 冲突
    'A': '英语一 2005–2010', 'B': '英语一 2011–2016', 'C': '英语一 2017–2025',
    'D': '英语二 2010–2016', 'E': '英语二 2017–2025',
    'F': '跨卷专题 · 熟词僻义与主题词',
}
# 题目点名的转载页 OCR 易讹词：检查 json 是否真的误收
OCR_WORDS = ['induce', 'erudite', 'tardily', 'over-worded', 'discursive', 'unfocused']
IRREGULAR = {
    'spell': ['spelt', 'spells', 'spelling'],
    'buy': ['bought', 'buys', 'buying'],
    'take': ['took', 'taken', 'takes', 'taking'],
    'shed': ['sheds', 'shedding'],
    'weep': ['wept', 'weeps', 'weeping'],
    'put': ['puts', 'putting'],
    'pen': ['penned', 'pens', 'penning'],
}


def load_parts():
    out = {}
    for p in PARTS:
        with open(os.path.join(DATA, 'part-%s.json' % p), encoding='utf-8') as f:
            out[p] = json.load(f)
    return out


def all_entries(parts):
    for p in PARTS:
        for e in parts[p].get('entries', []):
            yield p, e


# ---------- headword 是否回归 quote（允许屈折变化） ----------
def clean_headword(hw):
    w = hw.lower()
    w = re.sub(r'\([^)]*\)', ' ', w)          # (for) / (of) / (CSR)
    w = w.replace('…', ' ').replace('...', ' ')
    w = re.sub(r"\bsb\b|\bsth\b|one's|sb\.", ' ', w)
    w = w.split('/')[0]                        # on/upon -> on
    w = w.replace('-', ' ')
    return re.findall(r"[a-z][a-z']*", w)


def word_forms(w):
    forms = {w}
    for suf in ('s', 'es', 'ed', 'd', 'ing', 'ies', 'ied', 'er', 'est'):
        forms.add(w + suf)
    if w.endswith('e'):
        forms.add(w[:-1] + 'ing'); forms.add(w[:-1] + 'ed')
    if w.endswith('y'):
        forms.add(w[:-1] + 'ies'); forms.add(w[:-1] + 'ied')
    if len(w) >= 3 and w[-1] not in 'aeiouwxy' and w[-2] in 'aeiou' and w[-3] not in 'aeiou':
        forms.add(w + w[-1] + 'ed'); forms.add(w + w[-1] + 'ing')
    forms.update(IRREGULAR.get(w, []))
    return forms


STOP = {'a', 'an', 'the', 'be', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
        'no', 'more', 'and', 'as', 'it', 'is', 'one', 'all', 'do', 'so', 'not', 'sth'}


def headword_in_quote(hw, quote):
    q = quote.lower()
    words = [w for w in clean_headword(hw) if w not in STOP]
    if not words:
        return None  # 无法判定
    for w in words:
        for f in word_forms(w):
            if re.search(r'(?<![a-z])' + re.escape(f) + r'(?![a-z])', q):
                return True
    return False


# ---------- 各项检查 ----------
def run_checks():
    parts = load_parts()
    entries = list(all_entries(parts))
    with open(os.path.join(DATA, 'corpus.json'), encoding='utf-8') as f:
        corpus = json.load(f)
    merged = corpus.get('entries', [])
    meta = corpus.get('meta', {})

    issues = collections.defaultdict(list)
    def add(cat, p, e, field, msg):
        issues[cat].append('%s/%s [%s] %s' % (p, e.get('id', '?'), field, msg))

    # 1. 字段完整性 / 类型 / 枚举 / 格式
    for p, e in entries:
        for f in REQUIRED:
            if f not in e or (isinstance(e[f], str) and not e[f].strip()):
                add('字段', p, e, f, '缺失或为空')
        if e.get('type') not in TYPES:
            add('枚举', p, e, 'type', '非法 type=%r' % e.get('type'))
        if e.get('type') == 'polyseme':
            for f in POLY_ONLY:
                if not str(e.get(f) or '').strip():
                    add('字段', p, e, f, 'polyseme 必填但为空')
        ph = str(e.get('phonetic') or '')
        if not (ph.startswith('/') and ph.endswith('/') and len(ph) > 2):
            add('音标格式', p, e, 'phonetic', '不是 /.../ 包裹: %r' % ph[:30])
        elif re.search(r'[\u4e00-\u9fff]', ph):
            add('音标格式', p, e, 'phonetic', '含中文字符')
        if e.get('difficulty') not in (2, 3):
            add('难度', p, e, 'difficulty', '取值=%r（SCHEMA 仅允许 2/3，禁止 1）' % e.get('difficulty'))
        if not isinstance(e.get('freq'), int) or e['freq'] < 1:
            add('考频', p, e, 'freq', '非正整数: %r' % e.get('freq'))
        if e.get('topic') not in TOPICS:
            add('枚举', p, e, 'topic', '非法 topic=%r' % e.get('topic'))
        tgs = e.get('tags') or []
        if len(tgs) > 3:
            add('枚举', p, e, 'tags', '超过 3 个: %r' % tgs)
        for t in tgs:
            if t not in TAGS:
                add('枚举', p, e, 'tags', '非法 tag=%r' % t)
        q = str(e.get('quote') or '')
        nw = len(q.split())
        if nw < 5:
            add('原句', p, e, 'quote', '过短(%d 词)' % nw)
        elif nw > 45:
            add('原句', p, e, 'quote', '偏长(%d 词，建议 12–45)' % nw)
        note = str(e.get('note') or '')
        if len(note) < 12:
            add('注释', p, e, 'note', '过短疑似空话(%d 字)' % len(note))
        # 非 polyseme 却带 common/rare 字段（冗余，一致性提示）
        if e.get('type') != 'polyseme' and ('common_meaning' in e or 'rare_meaning' in e):
            add('冗余字段', p, e, 'common/rare', '非 polyseme 却含僻义字段')

    # 2. 回归原文：headword 出现在 quote、source/year/paper/section 自洽
    for p, e in entries:
        r = headword_in_quote(str(e.get('headword') or ''), str(e.get('quote') or ''))
        if r is False:
            add('回归原文', p, e, 'headword/quote', '核心词形未在 quote 中出现: %r' % e.get('headword'))
        src = str(e.get('source') or '')
        yr = e.get('year')
        m = re.search(r'(19|20)\d{2}', src)
        if not m or int(m.group(0)) != yr:
            add('出处', p, e, 'source/year', 'source 年份与 year=%r 不符: %r' % (yr, src))
        if str(e.get('paper') or '') not in src:
            add('出处', p, e, 'source/paper', 'paper=%r 不在 source 中: %r' % (e.get('paper'), src))
        expect = '%s %s %s' % (yr, e.get('paper'), e.get('section'))
        if re.sub(r'\s+', '', expect) != re.sub(r'\s+', '', src):
            add('出处', p, e, 'source/section', '拼装=%r 与 source=%r 不一致' % (expect, src))
        ys = e.get('years_seen') or []
        if not isinstance(ys, list) or not all(isinstance(y, int) for y in ys):
            add('考频', p, e, 'years_seen', '非整数年份数组: %r' % ys)
        else:
            if len(ys) != len(set(ys)):
                add('考频', p, e, 'years_seen', '含重复年份: %r' % ys)
            if yr not in ys:
                add('考频', p, e, 'years_seen', '未包含本条 year=%s: %r' % (yr, ys))
            if ys and (min(ys) < 2005 or max(ys) > 2025):
                add('考频', p, e, 'years_seen', '超出 2005–2025: %r' % ys)

    # 3. quote 复用（>2 条违反 SCHEMA）
    qmap = collections.defaultdict(list)
    for p, e in entries:
        k = re.sub(r'\s+', ' ', str(e.get('quote') or '')).strip().lower()
        qmap[k].append('%s/%s' % (p, e.get('id')))
    for q, ids in qmap.items():
        if len(ids) > 2:
            add('原句复用', '-', {'id': '-'}, 'quote', '同一句承载 %d 条: %s | %s…' % (len(ids), ', '.join(ids), q[:60]))

    # 4. 同 (type, headword) 重复（源数据 / 合并后）
    def hkey(e):
        return (e.get('type'), re.sub(r'\s+', ' ', str(e.get('headword') or '')).strip().lower())
    src_groups = collections.defaultdict(list)
    for p, e in entries:
        src_groups[hkey(e)].append('%s/%s' % (p, e.get('id')))
    for k, ids in src_groups.items():
        if len(ids) > 1:
            add('源数据重复', '-', {'id': '-'}, 'headword', '%r × %d: %s' % (k, len(ids), ', '.join(ids)))
    m_groups = collections.defaultdict(list)
    for e in merged:
        m_groups[hkey(e)].append(e.get('uid'))
    for k, ids in m_groups.items():
        if len(ids) > 1:
            add('合并后重复', '-', {'id': '-'}, 'headword', 'corpus.json 中 %r × %d: %s' % (k, len(ids), ids))

    # 5. polyseme 跨卷僻义分歧（人工复核清单）
    poly = collections.defaultdict(list)
    for p, e in entries:
        if e.get('type') == 'polyseme':
            poly[str(e.get('headword')).lower()].append(
                (p, e.get('id'), str(e.get('common_meaning') or ''),
                 str(e.get('rare_meaning') or ''), str(e.get('phonetic') or ''),
                 str(e.get('pos') or '')))
    print('\n===== POLYSEME 僻义/音标人工复核清单（按 headword 分组）=====')
    for hw in sorted(poly):
        rows = poly[hw]
        rares = set(r[3] for r in rows)
        flag = '  <<< 僻义表述分歧' if len(rares) > 1 else ''
        phs = set(r[4] for r in rows)
        if len(phs) > 1:
            flag += '  <<< 音标不一致'
        print('  [%s] %d 条%s' % (hw, len(rows), flag))
        for p, i, cm, rm, ph, pos in rows:
            print('      %s/%s pos=%-10s ph=%-18s rare=%s' % (p, i, pos, ph, rm[:64]))

    # 6. 分卷 segment 与年份范围 / 与 build.py 标题 / md 冲突
    print('\n===== 分卷 segment / 年份范围 =====')
    for p in PARTS:
        ys = [e.get('year') for e in parts[p]['entries'] if isinstance(e.get('year'), int)]
        seg = parts[p].get('segment', '')
        print('  %s: segment=%r 实际 year %s–%s 条数=%d build标题=%r%s' % (
            p, seg, min(ys) if ys else '-', max(ys) if ys else '-', len(parts[p]['entries']),
            SEG_TITLES[p], '  <<< segment 与 build.py 标题不一致' if seg != SEG_TITLES[p] else ''))
        if seg != SEG_TITLES[p]:
            add('md/json 冲突', p, {'id': '-'}, 'segment',
                'part-%s.json segment=%r 但 真题语料整理.md 分卷标题=%r（build.py 常量）' % (p, seg, SEG_TITLES[p]))
        # segment 声明的年份范围 vs 实际条目
        nums = re.findall(r'(20\d{2})', seg)
        if len(nums) == 2 and ys:
            if int(nums[0]) != min(ys) or int(nums[1]) != max(ys):
                add('segment 年份', p, {'id': '-'}, 'segment',
                    '声明 %s–%s 但实际 %s–%s' % (nums[0], nums[1], min(ys), max(ys)))

    # 7. 真题语料整理.md 汇总数字 vs meta.json
    md_path = os.path.join(BASE, '真题语料整理.md')
    if os.path.exists(md_path):
        md = open(md_path, encoding='utf-8').read()
        head = md[:1200]
        for label, key in [('合并词条', 'total'), ('原始', 'raw'), ('可回溯真题出处', 'sources')]:
            m = re.search(label + r'[：:]\s*(\d+)', head)
            if m and int(m.group(1)) != meta.get(key):
                add('md/json 冲突', '-', {'id': '-'}, '真题语料整理.md',
                    '%s md=%s 但 meta.json=%s' % (label, m.group(1), meta.get(key)))
        # 分卷标题
        for p in PARTS:
            m = re.search(r'# 分卷 %s｜([^\n]+)' % p, md)
            if m and m.group(1).strip() != parts[p].get('segment', '').strip():
                add('md/json 冲突', p, {'id': '-'}, '真题语料整理.md',
                    '标题=%r 与 part-%s.json segment=%r 不一致' % (m.group(1).strip(), p, parts[p].get('segment')))

    # 8. OCR 易讹词是否真的混入 json quote
    for p, e in entries:
        q = str(e.get('quote') or '').lower()
        for w in OCR_WORDS:
            if re.search(r'(?<![a-z])' + w + r'(?![a-z])', q):
                add('OCR 讹误', p, e, 'quote', '出现易讹词 %r' % w)

    # 9. 汇总统计
    print('\n===== 汇总统计 =====')
    print('  源数据条目：%d（各卷 %s）' % (len(entries),
          ', '.join('%s=%d' % (p, len(parts[p]['entries'])) for p in PARTS)))
    print('  合并后 corpus.json 条目：%d（meta.total=%s, meta.raw=%s）' % (len(merged), meta.get('total'), meta.get('raw')))
    print('  类型分布：%s' % dict(collections.Counter(e.get('type') for _, e in entries)))
    print('  难度分布：%s' % dict(collections.Counter(e.get('difficulty') for _, e in entries)))
    print('  polyseme 词条数：%d' % len(poly))
    print('  topic 分布：%s' % dict(collections.Counter(e.get('topic') for _, e in entries)))

    print('\n===== 问题清单（按类别）=====')
    total = 0
    for cat in sorted(issues):
        print('\n  【%s】%d 项' % (cat, len(issues[cat])))
        for line in issues[cat]:
            print('    - ' + line)
            total += 1
    print('\n  问题合计：%d 项（含提示类，需人工判定确错/存疑/一致性）' % total)
    return issues


# ---------- 100% 确定错误的精确修复（按 part + id + 字段） ----------
FIXES = [
    # f002 subject：quote 为 2008 完形 "has subjected them to..."（动词用法），
    # 同一句的 a043 给 /səbˈdʒekt/（动词重音在后），本条却给 /ˈsʌbdʒɪkt/（名/形读音），
    # 与 pos 及 quote 语境不符 -> 改为动词读音，与 a043 统一。
    ('F', 'f002', 'phonetic', '/səbˈdʒekt/'),
    # f031 fetch：years_seen=[2010,2010] 重复年份；同年两卷属两处出处（freq=2 合理），
    # 但年份数组应去重 -> [2010]。
    ('F', 'f031', 'years_seen', [2010]),
]


def apply_fixes():
    parts = load_parts()
    done = []
    for p, eid, field, newval in FIXES:
        hit = [e for e in parts[p]['entries'] if e.get('id') == eid]
        if len(hit) != 1:
            raise RuntimeError('按 id 定位失败: part-%s %s 命中 %d 条' % (p, eid, len(hit)))
        old = hit[0].get(field)
        if old == newval:
            raise RuntimeError('无需修改: %s/%s %s 已等于目标值' % (p, eid, field))
        hit[0][field] = newval
        done.append((p, eid, field, old, newval))
        with open(os.path.join(DATA, 'part-%s.json' % p), 'w', encoding='utf-8') as f:
            json.dump(parts[p], f, ensure_ascii=False, indent=2)
            f.write('\n')
    for p, eid, field, old, new in done:
        print('  修复 %s/%s %s: %r -> %r' % (p, eid, field, old, new))
    print('  共修复 %d 处，仅改动 data/part-*.json' % len(done))


def validate():
    ok = True
    total = 0
    for p in PARTS:
        fp = os.path.join(DATA, 'part-%s.json' % p)
        try:
            d = json.load(open(fp, encoding='utf-8'))
        except Exception as ex:
            print('  part-%s.json 解析失败: %s' % (p, ex)); ok = False; continue
        es = d.get('entries', [])
        total += len(es)
        if len(es) != EXPECTED_COUNTS[p]:
            print('  part-%s.json 条数变化: %d -> 应为 %d' % (p, len(es), EXPECTED_COUNTS[p])); ok = False
        ids = [e.get('id') for e in es]
        if len(ids) != len(set(ids)):
            print('  part-%s.json 存在重复 id' % p); ok = False
        missing = []
        for e in es:
            for f in REQUIRED:
                if f not in e or (isinstance(e[f], str) and not e[f].strip()):
                    missing.append('%s/%s:%s' % (p, e.get('id'), f))
            if e.get('type') == 'polyseme':
                for f in POLY_ONLY:
                    if not str(e.get(f) or '').strip():
                        missing.append('%s/%s:%s' % (p, e.get('id'), f))
        print('  part-%s.json: %d 条, id 唯一, 必填缺失 %d%s' % (p, len(es), len(missing),
              (' -> ' + ', '.join(missing[:10])) if missing else ''))
        if missing:
            ok = False
    print('  六卷合计 %d 条（修复前 411 条）' % total)
    # 校验修复目标值已生效
    f = {e['id']: e for e in json.load(open(os.path.join(DATA, 'part-F.json'), encoding='utf-8'))['entries']}
    if f['f002']['phonetic'] != '/səbˈdʒekt/':
        print('  f002 phonetic 修复未生效'); ok = False
    if f['f031']['years_seen'] != [2010]:
        print('  f031 years_seen 修复未生效'); ok = False
    print('  校验结果：%s' % ('全部通过（可解析 / 条数不变 / 必填齐全 / 修复生效）' if ok else '存在问题'))
    return ok


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'check'
    if mode == 'fix':
        apply_fixes()
    elif mode == 'validate':
        validate()
    else:
        run_checks()
