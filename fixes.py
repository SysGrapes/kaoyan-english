# -*- coding: utf-8 -*-
"""审查后的一次性源数据修订（只改 data/part-*.json）。"""
import json, os, re

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, 'data')

parts = {}
for p in 'ABCDEF':
    fp = os.path.join(DATA, 'part-%s.json' % p)
    parts[p] = json.load(open(fp, encoding='utf-8'))

def find(part, eid):
    for e in parts[part]['entries']:
        if e['id'] == eid:
            return e
    raise KeyError('%s/%s' % (part, eid))

changes = []

# 1) 2024 英一 Text 1 原句校订（内容审查 E3，5 来源一致）
e = find('C', 'c021')
assert 'a million of them' in e['quote']
e['quote'] = e['quote'].replace('a million of them', 'a million of the things')
e['note'] = '写作可替换 withdraw from。按公开真题原文校订，取 2024 英语一 Text 1 开头的稳定片段。'
changes.append('C/c021 quote + note')

# 2) court：法院是常见义，不构成「熟词僻义」，改归法律主题词（审查 S2）
for pid, eid in [('B', 'b045'), ('F', 'f030')]:
    e = find(pid, eid)
    e['type'] = 'theme'
    e['topic'] = '法律与治理'
    e['meaning'] = 'n. 法院、法庭（司法机构）；v. 谋求、招致（court criticism）'
    e['note'] = '法政类阅读中 court 几乎总指法院 / 法庭；作动词时表「谋求、招致」，如 court controversy，是写作可用的中性表达。'
    e.pop('common_meaning', None)
    e.pop('rare_meaning', None)
    changes.append('%s/%s -> theme' % (pid, eid))

# 3) ornament：常见义与所谓僻义近乎同义反复，改归重点词（审查 S5）
e = find('F', 'f029')
e['type'] = 'word'
e['meaning'] = 'n. 装饰品；（抽象）增色之物、点缀、门面'
e.pop('common_meaning', None)
e.pop('rare_meaning', None)
changes.append('F/f029 -> word')

# 4) buy：2017 英一 Text 4 指「关系可用钱买到」，不是「收买某人」（审查 S4）
e = find('C', 'c042')
e['meaning'] = '（关系 / 人脉）可用钱买到、打通；被收买'
e['rare_meaning'] = '（关系 / 人脉）用钱打通、被收买（被动 be bought）'
changes.append('C/c042 meaning + rare_meaning')

# 5) cure：b047 原句为动词本义，与所标名词僻义不符；改用已核实的 2012 英一 Text 1 原句
src = find('F', 'f010')
e = find('B', 'b047')
for k in ['quote', 'quote_zh', 'source', 'year', 'paper', 'section', 'topic']:
    e[k] = src[k]
e['note'] = 'the social cure 中 cure 由医学「疗法」引申为社会问题的「对策、解决办法」；2012 英语一 Text 1、2019 英语二 Text 3 均考此义。'
changes.append('B/b047 quote -> 2012 英一 Text 1 已核实原句')

# 6) 主题域归类校正（审查 S6）
TOPIC_FIX = {
    'f017': '经济与商业', 'f014': '教育与人才', 'f047': '环境与能源',
    'f051': '经济与商业', 'f063': '社会与人口',
}
for eid, topic in TOPIC_FIX.items():
    e = find('F', eid)
    e['topic'] = topic
    changes.append('F/%s topic -> %s' % (eid, topic))

# 7) 清理非 polyseme 条目里冗余的空 common/rare 字段（审查 C4）
cleaned = 0
for p, d in parts.items():
    for e in d['entries']:
        if e.get('type') != 'polyseme':
            for k in ['common_meaning', 'rare_meaning']:
                if k in e and not str(e[k] or '').strip():
                    del e[k]
                    cleaned += 1
changes.append('清理冗余空字段 %d 处' % cleaned)

for p, d in parts.items():
    fp = os.path.join(DATA, 'part-%s.json' % p)
    with open(fp, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)

print('修订项：')
for c in changes:
    print(' -', c)
print('校验：')
total = 0
for p in 'ABCDEF':
    d = json.load(open(os.path.join(DATA, 'part-%s.json' % p), encoding='utf-8'))
    n = len(d['entries']); total += n
    print('  part-%s: %d 条' % (p, n))
print('  合计 %d 条' % total)
