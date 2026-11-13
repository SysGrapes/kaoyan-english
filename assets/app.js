/* 真题语感 · 交互逻辑（纯静态，无依赖） */
(function () {
  'use strict';

  var ROOT = window.__CORPUS__ || { meta: {}, entries: [] };
  var META = ROOT.meta || {};
  var ALL = ROOT.entries || [];
  var TYPE_NAME = { expression: '地道表达', word: '重点单词', polyseme: '熟词僻义', theme: '主题词' };
  var TYPE_ORDER = ['expression', 'word', 'polyseme', 'theme'];
  var TOPICS = ['经济与商业', '法律与治理', '心理与行为', '环境与能源', '传媒与文化', '社会与人口',
    '科学与技术', '科技与AI', '职场与就业', '教育与人才', '历史与语言', '医学与健康'];
  var LS_FAV = 'ky.fav.v1', LS_MASTERY = 'ky.mastery.v1';

  /* ---------- 工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var FUNC_WORD = { the: 1, of: 1, to: 1, a: 1, an: 1, in: 1, on: 1, at: 1, for: 1,
    with: 1, and: 1, or: 1, as: 1, from: 1, into: 1, out: 1, off: 1, by: 1,
    more: 1, no: 1, than: 1, one: 1, that: 1 };
  var IRREGULAR = {
    buy: '(?:buy|bought)', spell: '(?:spel\\w*)', make: '(?:mak\\w*)',
    give: '(?:giv\\w*)', lose: '(?:los\\w*)', up: '(?:up\\w{0,4})'
  };
  // 单个锚点：精确词形优先，词干兜底，覆盖真题里的屈折与不规则变化
  function stemAlt(w) {
    var s = String(w).toLowerCase();
    if (s === 'be') return '(?:be|am|is|are|was|were|been|being)';
    if (IRREGULAR[s]) return IRREGULAR[s];
    if (FUNC_WORD[s]) return s + '(?![A-Za-z])';
    var exact = s.replace(/[^A-Za-z]/g, '');
    if (exact.length <= 2) return exact + '\\w*';
    var core = exact;
    if (exact.length > 4 && /e$/.test(exact)) core = exact.slice(0, -1);
    var stem = exact.length > 6 ? core.slice(0, 4) : core;
    if (stem === exact) return exact + '\\w*';
    return '(?:' + exact + '\\w*|' + stem + '\\w*)';
  }
  // 把词条拆成锚点序列；括号备注、sth / sb / one's / ... 视作可通配的空位
  function anchors(hw) {
    var raw = String(hw || '').trim()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\bdo\s+sth\b/gi, ' \u0001 ')
      .replace(/\b(?:sth|sb)\b/gi, ' ')
      .replace(/one['\u2019]s/gi, ' \u0001 ')
      .replace(/\.\.\.+/g, ' \u0001 ');
    var out = [];
    raw.split(/\s+/).forEach(function (t) {
      if (!t) return;
      if (t === '\u0001') { out.push({ wild: true }); return; }
      if (t.indexOf('/') >= 0) {
        out.push({ alt: t.split('/').filter(Boolean).map(function (x) {
          return '(?:' + stemAlt(x) + ')';
        }).join('|') });
        return;
      }
      if (t.indexOf('-') >= 0) {
        out.push({ alt: t.split(/-+/).filter(Boolean).map(function (x) {
          return '(?:' + stemAlt(x) + ')';
        }).join('[\\-\\s]+') });
        return;
      }
      var s = t.replace(/[^A-Za-z]/g, '');
      if (s) out.push({ w: s });
    });
    while (out.length && out[out.length - 1].wild) out.pop();
    return out;
  }
  function buildRegex(hw, gap) {
    var a = anchors(hw), parts = [];
    // 通配空位必须短，否则会从前面的同形词一路吞到后面的目标词
    var wildPat = gap === '[\\s\\-]+' ? '[^.!?]{0,25}?' : '[^.!?]{0,35}?';
    a.forEach(function (x, i) {
      if (x.wild) { parts.push(wildPat); return; }
      if (i > 0 && !a[i - 1].wild) parts.push(gap);
      parts.push(x.alt ? '(?:' + x.alt + ')' : '(?:' + stemAlt(x.w) + ')');
    });
    if (!parts.length) return null;
    try { return new RegExp('\\b(' + parts.join('') + ')\\b', 'i'); }
    catch (e) { return null; }
  }
  // 只标记第一个「整体」片段：严格相邻优先，允许少量插入词兜底；绝不逐词标记
  function markOnce(q, hw, open, close) {
    var raw = String(q == null ? '' : q);
    var regs = [buildRegex(hw, '[\\s\\-]+'), buildRegex(hw, '[^.!?]{0,30}?')];
    for (var r = 0; r < regs.length; r++) {
      var re = regs[r]; if (!re) continue;
      var m = re.exec(raw); if (!m || m[0].length > 160) continue;
      var i = m.index, end = i + m[0].length;
      return esc(raw.slice(0, i)) + open + esc(raw.slice(i, end)) + close + esc(raw.slice(end));
    }
    return null;
  }
  function hl(q, hw) {
    return markOnce(q, hw, '<mark>', '</mark>') || esc(q);
  }
  // 语境选义题：完整真题原句 + 考查词整体划线（不挖空）
  function underline(q, hw) {
    return markOnce(q, hw, '<span class="underline-target">', '</span>');
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function load(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._timer); toast._timer = setTimeout(function () { t.hidden = true; }, 1900);
  }
  function debounce(fn, ms) {
    var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); };
  }
  function freqLabel(e) { return '考频 ' + e.examCount + ' 次'; }
  function diffLabel(d) { return d >= 3 ? '★★★ 高阶' : '★★ 有门槛'; }

  /* ---------- 状态 ---------- */
  var fav = {}; (load(LS_FAV, []) || []).forEach(function (u) { fav[u] = 1; });
  var mastery = load(LS_MASTERY, {}) || {};
  var state = {
    view: 'library', types: new Set(), papers: new Set(), topics: new Set(), diffs: new Set(),
    query: '', yearFrom: 2005, yearTo: 2025, onlyHigh: false, onlyFav: false, onlyNew: false,
    showMeaning: false, sort: 'freqDesc', limit: 36, openUid: null,
    randMap: {}, studyPool: null, queue: [], qi: 0, flipped: false,
    quiz: null, corpusPaper: '', corpusYear: '', corpusQuery: ''
  };
  function reshuffle() { ALL.forEach(function (e) { state.randMap[e.uid] = Math.random(); }); }
  reshuffle();

  /* ---------- 初始化顶部与筛选器 ---------- */
  function initTop() {
    var years = ALL.reduce(function (a, e) { return a.concat(e.years_seen || []); }, []);
    var ymin = META.year_min || Math.min.apply(null, years), ymax = META.year_max || Math.max.apply(null, years);
    $('#topStats').innerHTML =
      stat(META.total || ALL.length, '语言点') + stat(META.sources || 0, '真题出处') +
      stat(ymin + '–' + ymax, '覆盖年份') + stat(Object.keys(META.topics || {}).length || 12, '主题域');
    $('#footerMeta').textContent = '共 ' + ALL.length + ' 条 · ' + (META.sources || 0) + ' 处真题出处 · ' + ymin + '–' + ymax;
    var un = ALL.filter(function (e) { return !mastery[e.uid] || mastery[e.uid].box < 2; }).length;
    $('#cardBadge').textContent = un;
  }
  function stat(v, l) { return '<div class="topstat"><b>' + esc(v) + '</b><span>' + esc(l) + '</span></div>'; }

  function chip(label, value, on, count, group) {
    return '<button class="chip' + (on ? ' on' : '') + '" data-group="' + group + '" data-value="' + esc(value) + '">' +
      esc(label) + (count != null ? '<span class="n">' + count + '</span>' : '') + '</button>';
  }
  function initFilters() {
    var tc = {};
    ALL.forEach(function (e) { tc[e.type] = (tc[e.type] || 0) + 1; });
    $('#typeChips').innerHTML = TYPE_ORDER.map(function (t) {
      return chip(TYPE_NAME[t], t, state.types.has(t), tc[t] || 0, 'type');
    }).join('');
    var pc = {};
    ALL.forEach(function (e) { (e.papers || []).forEach(function (p) { pc[p] = (pc[p] || 0) + 1; }); });
    $('#paperChips').innerHTML = ['英语一', '英语二'].map(function (p) {
      return chip(p, p, state.papers.has(p), pc[p] || 0, 'paper');
    }).join('');
    var qc = {};
    ALL.forEach(function (e) { qc[e.topic] = (qc[e.topic] || 0) + 1; });
    var topicList = TOPICS.filter(function (t) { return qc[t]; })
      .concat(Object.keys(qc).filter(function (t) { return TOPICS.indexOf(t) < 0; }));
    $('#topicChips').innerHTML = topicList.map(function (t) {
      return chip(t, t, state.topics.has(t), qc[t], 'topic');
    }).join('');
    $('#diffChips').innerHTML = [3, 2].map(function (d) {
      var n = ALL.filter(function (e) { return e.difficulty === d; }).length;
      return chip(d >= 3 ? 'Ⅲ 高阶易错' : 'Ⅱ 有门槛', String(d), state.diffs.has(d), n, 'diff');
    }).join('');
    var opts = '', y;
    for (y = 2005; y <= 2025; y++) opts += '<option value="' + y + '">' + y + '</option>';
    $('#yearFrom').innerHTML = opts; $('#yearTo').innerHTML = opts;
    $('#yearFrom').value = state.yearFrom; $('#yearTo').value = state.yearTo;
  }

  /* ---------- 筛选与排序 ---------- */
  function filtered() {
    var q = state.query.trim().toLowerCase();
    var lo = Math.min(state.yearFrom, state.yearTo), hi = Math.max(state.yearFrom, state.yearTo);
    return ALL.filter(function (e) {
      if (state.types.size && !state.types.has(e.type)) return false;
      if (state.papers.size) {
        var ps = e.papers || [e.paper];
        var hit = false;
        state.papers.forEach(function (p) { if (ps.indexOf(p) >= 0) hit = true; });
        if (!hit) return false;
      }
      if (state.topics.size && !state.topics.has(e.topic) && !(e.topics || []).some(function (t) { return state.topics.has(t); })) return false;
      if (state.diffs.size && !state.diffs.has(e.difficulty)) return false;
      var ys = (e.years_seen || []).concat([e.year]);
      if (!ys.some(function (y) { return y >= lo && y <= hi; })) return false;
      if (state.onlyHigh && e.examCount < 2) return false;
      if (state.onlyFav && !fav[e.uid]) return false;
      if (state.onlyNew && mastery[e.uid] && mastery[e.uid].box >= 2) return false;
      if (q) {
        var hay = [e.headword, e.sense, e.phonetic, e.meaning, e.note, e.quote, e.quote_zh,
          e.source, e.topic, e.common_meaning, e.rare_meaning, (e.tags || []).join(' '),
          (e.sources_all || []).join(' ')].join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }
  function sorted(list) {
    var s = state.sort, a = list.slice();
    var byAlpha = function (x, y) { return String(x.headword).localeCompare(String(y.headword), 'en'); };
    a.sort(function (x, y) {
      if (s === 'random') return (state.randMap[x.uid] || 0) - (state.randMap[y.uid] || 0);
      if (s === 'alpha') return byAlpha(x, y);
      if (s === 'yearDesc') return (y.year - x.year) || (y.examCount - x.examCount) || byAlpha(x, y);
      if (s === 'yearAsc') return (x.year - y.year) || (y.examCount - x.examCount) || byAlpha(x, y);
      if (s === 'diffDesc') return (y.difficulty - x.difficulty) || (y.examCount - x.examCount) || byAlpha(x, y);
      if (s === 'freqAsc') return (x.examCount - y.examCount) || (x.freq - y.freq) || byAlpha(x, y);
      return (y.examCount - x.examCount) || (y.freq - x.freq) || (y.difficulty - x.difficulty) || byAlpha(x, y);
    });
    return a;
  }

  /* ---------- 词条库渲染 ---------- */
  function cardHtml(e) {
    var open = state.openUid === e.uid;
    var more = e.more_quotes || [];
    var html = '<article class="wcard' + (open ? ' open' : '') + '" data-uid="' + e.uid + '">' +
      '<div class="wc-top">' +
        '<span class="badge b-' + e.type + '">' + TYPE_NAME[e.type] + '</span>' +
        '<span class="freq-pill">' + freqLabel(e) + '</span>' +
        '<span class="spacer"></span>' +
        '<button class="star' + (fav[e.uid] ? ' on' : '') + '" data-act="fav" title="收藏">' + (fav[e.uid] ? '★' : '☆') + '</button>' +
      '</div>' +
      '<div class="wc-word" data-act="open">' + esc(e.headword) + (e.sense ? '<span class="sense-tag">' + esc(e.sense) + '</span>' : '') + '</div>' +
      '<div class="wc-phon">' + esc(e.phonetic) + ' <span style="color:var(--ink-3)">' + esc(e.pos) + '</span></div>' +
      (state.showMeaning ? '<div class="wc-meaning">' + esc(e.meaning) + '</div>' : '<div class="wc-preview" data-act="open">' + esc(e.quote) + '</div>') +
      '<div class="wc-meta"><span class="diff">' + diffLabel(e.difficulty) + '</span><span>·</span><span>' + esc(e.topic) + '</span><span>·</span><span>' + esc(e.source) + '</span></div>' +
      '<div class="wc-detail"><div class="detail-grid"><div>' +
        '<div class="detail-label">真题原句 · 回归原文</div>' +
        '<blockquote class="quote">' + hl(e.quote, e.headword) + '</blockquote>' +
        '<p class="quote-zh">' + esc(e.quote_zh) + '</p>' +
        '<span class="src">' + esc(e.source) + ' · ' + esc(e.section) + '</span>' +
        (more.length ? '<details class="more-quotes"><summary>另 ' + more.length + ' 处真题原文</summary>' +
          more.map(function (m) {
            return '<div class="mq-item"><blockquote class="quote">' + hl(m.quote, e.headword) + '</blockquote>' +
              '<p class="quote-zh">' + esc(m.quote_zh) + '</p><span class="src">' + esc(m.source) + '</span></div>';
          }).join('') + '</details>' : '') +
      '</div><div>' +
        '<div class="detail-label">释义</div><div class="note" style="font-size:15px;color:var(--accent);font-weight:600">' + esc(e.meaning) + '</div>' +
        (e.type === 'polyseme' ? '<div class="poly-box"><div><span class="lbl">常见义</span>' + esc(e.common_meaning || '—') +
          '</div><div><span class="lbl">真题僻义</span><span class="rare">' + esc(e.rare_meaning || e.meaning) + '</span></div></div>' : '') +
        '<div class="detail-label" style="margin-top:14px">用法 / 记忆锚点</div><div class="note">' + esc(e.note) + '</div>' +
        '<div class="tagrow">' + (e.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</div>' +
        '<div class="detail-label">复现轨迹</div><div class="note" style="margin-bottom:6px">' +
          '考频 ' + e.examCount + ' 次 · 已收录 ' + e.sourceQuoteCount + ' 处原句 · ' +
          (e.years_seen || []).join('、') + '</div>' +
        ((e.sources_all || []).length ? '<div class="note" style="color:var(--ink-3);font-size:11.5px">出处：' +
          esc((e.sources_all || []).join(' / ')) + '</div>' : '') +
      '</div></div>' +
      '<div class="wc-actions">' +
        '<button class="ghost-btn" data-act="fav">' + (fav[e.uid] ? '★ 已收藏' : '☆ 收藏') + '</button>' +
        '<button class="ghost-btn" data-act="mastered">' + (mastery[e.uid] && mastery[e.uid].box >= 2 ? '✓ 已掌握' : '标记已掌握') + '</button>' +
        '<button class="ghost-btn" data-act="studyone">单独记忆 →</button>' +
      '</div></div></article>';
    return html;
  }
  function renderLibrary() {
    var list = sorted(filtered());
    var shown = list.slice(0, state.limit);
    $('#resultCount').textContent = list.length;
    var high = list.filter(function (e) { return e.examCount >= 2; }).length;
    $('#resultSub').textContent = '· 其中高频（≥2 次）' + high + ' 条' + (state.showMeaning ? '' : ' · 点卡片看释义与原句');
    $('#cardList').innerHTML = shown.map(cardHtml).join('');
    $('#emptyState').hidden = list.length > 0;
    $('#loadMoreWrap').hidden = list.length <= state.limit;
    var notes = {
      freqDesc: '<b>考频</b> = 可回溯的真题复现次数（按复现年份 / 独立出处去重，保守统计）。当前结果中 ' + high + ' 条为高频；同频依次按原句出处数、难度、字母序排列。',
      freqAsc: '按考频从低到高，适合先扫一遍低频但易错的表达。',
      diffDesc: '按难度从高到低，优先攻克 Ⅲ 阶熟词僻义与高阶学术词。',
      yearDesc: '按首次收录出处年份从新到旧，方便追近年命题趋势。',
      yearAsc: '按年份从旧到新，适合按真题顺序推进。',
      alpha: '按词条字母序排列。',
      random: '随机漫游，每次切换排序都会重新洗牌。'
    };
    $('#sortNote').innerHTML = notes[state.sort] || '';
  }

  /* ---------- 收藏 / 掌握 ---------- */
  function toggleFav(uid) {
    if (fav[uid]) delete fav[uid]; else fav[uid] = 1;
    save(LS_FAV, Object.keys(fav)); toast(fav[uid] ? '已加入收藏' : '已取消收藏');
  }
  function setMastery(uid, box) {
    var m = mastery[uid] || { seen: 0, box: 0 };
    m.box = box; m.seen = (m.seen || 0) + 1; m.last = Date.now();
    mastery[uid] = m; save(LS_MASTERY, mastery);
    initTop();
  }
  function masteredCount() {
    return ALL.filter(function (e) { return mastery[e.uid] && mastery[e.uid].box >= 2; }).length;
  }

  /* ---------- 记忆卡 ---------- */
  function buildQueue(force) {
    var pool = (state.studyPool && state.studyPool.length ? ALL.filter(function (e) { return state.studyPool.indexOf(e.uid) >= 0; }) : filtered());
    if ($('#studyFavOnly').checked) pool = pool.filter(function (e) { return fav[e.uid]; });
    if ($('#studyOnlyNew').checked) pool = pool.filter(function (e) { return !mastery[e.uid] || mastery[e.uid].box < 2; });
    if (!pool.length) pool = filtered().slice();
    if (!pool.length) pool = ALL.slice();
    pool = pool.slice().sort(function (a, b) {
      var ma = mastery[a.uid] ? mastery[a.uid].box : -1, mb = mastery[b.uid] ? mastery[b.uid].box : -1;
      return (ma - mb) || (b.examCount - a.examCount);
    });
    if (force === 'shuffle') shuffle(pool);
    state.queue = pool.map(function (e) { return e.uid; });
    state.qi = 0; state.flipped = false;
  }
  function currentEntry() {
    if (state.qi >= state.queue.length) return null;
    return ALL.filter(function (e) { return e.uid === state.queue[state.qi]; })[0] || null;
  }
  function renderCard() {
    var e = currentEntry();
    var card = $('#flipCard');
    $('#gradeRow').style.opacity = '1';
    if (!e) {
      $('#fcWord').textContent = '这一轮完成'; $('#fcPhon').textContent = '所有词条已过一遍';
      $('#fcSrc').textContent = ''; $('#fcType').textContent = ''; $('#fcFreq').textContent = '';
      $('.flip-tip').textContent = '点击「打乱顺序」再来一轮，或回到词条库调整范围';
      card.classList.remove('flipped');
      $('#studyProgress').style.width = '100%';
      $('#studyMeta').textContent = '已处理 ' + state.queue.length + ' / ' + state.queue.length;
      $('#studyBoxInfo').textContent = '累计已掌握 ' + masteredCount() + ' 条';
      return;
    }
    card.classList.remove('flipped'); state.flipped = false;
    $('#fcType').textContent = TYPE_NAME[e.type]; $('#fcType').className = 'badge b-' + e.type;
    $('#fcFreq').textContent = freqLabel(e);
    $('#fcWord').textContent = e.headword;
    $('#fcPhon').textContent = e.phonetic + '  ' + (e.pos || '');
    $('#fcSrc').textContent = e.source;
    $('#fbType').textContent = TYPE_NAME[e.type]; $('#fbType').className = 'badge b-' + e.type;
    $('#fbFreq').textContent = freqLabel(e);
    $('#fbWord').innerHTML = esc(e.headword) + '  ' + esc(e.phonetic) +
      (e.sense ? '<span class="sense-tag">' + esc(e.sense) + '</span>' : '');
    $('#fbMeaning').textContent = e.meaning;
    var poly = $('#fbPoly');
    if (e.type === 'polyseme') {
      poly.hidden = false;
      poly.innerHTML = '常见义：' + esc(e.common_meaning || '—') + '　→　真题僻义：<b>' + esc(e.rare_meaning || e.meaning) + '</b>';
    } else poly.hidden = true;
    $('#fbQuote').innerHTML = hl(e.quote, e.headword) + '<div style="font-family:var(--sans);font-size:11.5px;color:var(--ink-2);margin-top:6px">' +
      esc(e.quote_zh) + '　<span style="color:var(--teal)">' + esc(e.source) + '</span></div>';
    $('#fbNote').textContent = e.note || '';
    $('#studyProgress').style.width = (state.queue.length ? (state.qi / state.queue.length * 100) : 0) + '%';
    $('#studyMeta').textContent = '进度 ' + (state.qi + 1) + ' / ' + state.queue.length + '　·　' + diffLabel(e.difficulty);
    $('#studyBoxInfo').textContent = '累计已掌握 ' + masteredCount() + ' 条' + (fav[e.uid] ? '　·　★ 已收藏' : '');
    $('#favCurrent').textContent = fav[e.uid] ? '★ 取消收藏' : '☆ 收藏当前词条';
  }
  function flip() {
    var e = currentEntry(); if (!e) return;
    state.flipped = !state.flipped;
    $('#flipCard').classList.toggle('flipped', state.flipped);
  }
  function grade(g) {
    var e = currentEntry(); if (!e) return;
    if (!state.flipped) { flip(); toast('已翻开答案，再点一次完成评分'); return; }
    setMastery(e.uid, g);
    if (g === 0) state.queue.push(e.uid);       // 不认识：本轮末尾再来一次
    else if (g === 1) state.queue.splice(Math.min(state.qi + 4, state.queue.length), 0, e.uid);
    state.qi++; state.flipped = false;
    renderCard();
  }

  /* ---------- 测验 ---------- */
  function distractors(pool, field, answer, n, sameType, type) {
    var src = (sameType ? pool.filter(function (e) { return e.type === type; }) : pool).slice();
    shuffle(src);
    var out = [], seen = {}; seen[String(answer).toLowerCase()] = 1;
    for (var i = 0; i < src.length && out.length < n; i++) {
      var v = src[i][field]; if (!v) continue;
      var k = String(v).toLowerCase(); if (seen[k]) continue;
      seen[k] = 1; out.push(String(v));
    }
    var backup = ALL.slice(); shuffle(backup);
    for (var j = 0; j < backup.length && out.length < n; j++) {
      var v2 = backup[j][field]; if (!v2) continue;
      var k2 = String(v2).toLowerCase(); if (seen[k2]) continue;
      seen[k2] = 1; out.push(String(v2));
    }
    while (out.length < n) out.push('—');
    return out;
  }
  // 语境题的干扰项优先取「同一个词的其他义项」，让熟词僻义真正被辨析
  function meaningOptions(pool, e, n) {
    var seen = {}, out = [];
    seen[String(e.meaning).toLowerCase()] = 1;
    ALL.filter(function (x) {
      return x.uid !== e.uid &&
        String(x.headword).toLowerCase() === String(e.headword).toLowerCase();
    }).forEach(function (x) {
      if (!x.meaning) return;
      var k = String(x.meaning).toLowerCase();
      if (!seen[k]) { seen[k] = 1; out.push(x.meaning); }
    });
    var rest = distractors(pool, 'meaning', e.meaning, n, true, e.type);
    for (var i = 0; i < rest.length && out.length < n; i++) {
      var k2 = String(rest[i]).toLowerCase();
      if (!seen[k2]) { seen[k2] = 1; out.push(rest[i]); }
    }
    while (out.length < n) out.push('—');
    return out;
  }
  function makeQuestions(pool, n) {
    var qs = [], cand = shuffle(pool.slice());
    for (var i = 0; i < cand.length && qs.length < n; i++) {
      var e = cand[i];
      var kinds = e.type === 'polyseme'
        ? shuffle(['context', 'poly', 'reverse'])
        : shuffle(['context', 'reverse']);
      var made = null;
      for (var k = 0; k < kinds.length && !made; k++) {
        var kind = kinds[k];
        if (kind === 'context') {
          var marked = underline(e.quote, e.headword);
          if (!marked) continue;
          made = {
            kind: kind, label: '语境选义 · 判断原句中划线部分的含义', entry: e,
            stem: marked,
            sub: '出处：' + e.source + '　·　划线部分在此语境中取哪个义项？',
            answer: e.meaning,
            options: shuffle([e.meaning].concat(meaningOptions(pool, e, 3)))
          };
        } else if (kind === 'poly') {
          if (!e.rare_meaning) continue;
          made = {
            kind: kind, label: '熟词僻义 · 常见义 ≠ 真题义', entry: e,
            stem: '<span style="font-family:var(--serif);font-size:26px">' + esc(e.headword) + '</span> <span style="font-size:13px;color:var(--ink-3)">' + esc(e.phonetic) + '</span>',
            sub: '常见义「' + esc(e.common_meaning || '—') + '」；在真题语境中该词实际取哪个义项？',
            answer: e.rare_meaning,
            options: shuffle([e.rare_meaning].concat(distractors(pool, 'rare_meaning', e.rare_meaning, 3, true, 'polyseme')))
          };
        } else {
          made = {
            kind: kind, label: '释义选词 · 从中文回到地道英文', entry: e,
            stem: '<span style="font-size:21px">' + esc(e.meaning) + '</span>',
            sub: '下面哪个词条表达这个意思？（' + TYPE_NAME[e.type] + '）',
            answer: e.headword,
            options: shuffle([e.headword].concat(distractors(pool, 'headword', e.headword, 3, true, e.type)))
          };
        }
      }
      if (made) { made.options = shuffle(made.options); qs.push(made); }
    }
    return qs;
  }
  function startQuiz() {
    var pool = filtered();
    if ($('#quizHighOnly').checked) pool = pool.filter(function (e) { return e.examCount >= 2; });
    if ($('#quizFavOnly').checked) pool = pool.filter(function (e) { return fav[e.uid]; });
    var n = parseInt($('#quizCount').value, 10) || 10;
    if (pool.length < 4) { toast('当前筛选只剩 ' + pool.length + ' 条，请放宽条件（至少 4 条）'); return; }
    var qs = makeQuestions(pool, n);
    if (!qs.length) { toast('未能生成题目，请放宽筛选'); return; }
    if (qs.length < n) toast('当前筛选可出 ' + qs.length + ' 题（少于设定的 ' + n + ' 题）');
    state.quiz = { qs: qs, i: 0, score: 0, wrong: [], answered: false };
    $('#quizIntro').hidden = true; $('#quizResult').hidden = true; $('#quizRun').hidden = false;
    renderQuestion();
  }
  function renderQuestion() {
    var qz = state.quiz, q = qz.qs[qz.i];
    qz.answered = false;
    $('#quizProgress').textContent = '第 ' + (qz.i + 1) + ' / ' + qz.qs.length + ' 题';
    $('#quizScore').textContent = '得分 ' + qz.score + ' / ' + qz.i;
    $('#quizQuestion').textContent = q.label;
    $('#quizStem').innerHTML = q.stem;
    $('#quizSub').textContent = q.sub || '';
    $('#quizOptions').innerHTML = q.options.map(function (o, i) {
      return '<button class="opt" data-i="' + i + '"><span class="k">' + String.fromCharCode(65 + i) + '</span><span>' + esc(o) + '</span></button>';
    }).join('');
    var fb = $('#quizFeedback'); fb.hidden = true; fb.innerHTML = '';
    $('#nextQuestion').hidden = true;
  }
  function answer(i) {
    var qz = state.quiz; if (qz.answered) return;
    qz.answered = true;
    var q = qz.qs[qz.i], chosen = q.options[i], ok = chosen === q.answer;
    if (ok) qz.score++; else qz.wrong.push(q);
    $$('#quizOptions .opt').forEach(function (b, idx) {
      b.disabled = true;
      if (q.options[idx] === q.answer) b.classList.add('correct');
      else if (idx === i) b.classList.add('wrong');
    });
    var e = q.entry;
    var fb = $('#quizFeedback');
    fb.className = 'quiz-feedback ' + (ok ? 'ok' : 'no');
    fb.innerHTML = '<strong>' + (ok ? '答对了' : '正确答案：' + esc(q.answer)) + '</strong>' +
      '<blockquote class="quote">' + hl(e.quote, e.headword) + '</blockquote>' +
      '<div>' + esc(e.quote_zh) + '</div>' +
      '<div style="margin-top:6px;color:var(--ink-3)">' + esc(e.source) + '　·　' + esc(e.phonetic) + '　·　' + freqLabel(e) + '</div>' +
      '<div style="margin-top:6px">' + esc(e.note || '') + '</div>';
    fb.hidden = false;
    $('#nextQuestion').hidden = false;
    $('#nextQuestion').textContent = qz.i + 1 >= qz.qs.length ? '查看结果 →' : '下一题 →';
    $('#quizScore').textContent = '得分 ' + qz.score + ' / ' + (qz.i + 1);
  }
  function quizResult() {
    var qz = state.quiz;
    $('#quizRun').hidden = true; $('#quizResult').hidden = false;
    $('#quizResult').className = 'quiz-result';
    var pct = Math.round(qz.score / qz.qs.length * 100);
    $('#quizResult').innerHTML = '<div class="score">' + qz.score + '<span style="font-size:20px"> / ' + qz.qs.length + '</span></div>' +
      '<h3>' + (pct >= 85 ? '语境感很稳' : pct >= 60 ? '再过一轮就扎实了' : '建议先按考频过一遍高频词') + '</h3>' +
      '<p style="font-size:12.5px;color:var(--ink-3)">正确率 ' + pct + '%　·　全部题目均由真题原句生成</p>' +
      (qz.wrong.length ? '<div class="wrong-list"><h4>错题回顾（点开原句复习）</h4>' + qz.wrong.map(function (q) {
        return '<div class="wrong-item"><b>' + esc(q.entry.headword) + '</b> ' + esc(q.entry.phonetic) + ' — ' +
          esc(q.answer) + '<div style="color:var(--ink-3);margin-top:3px">' + esc(q.entry.source) + '：' + esc(q.entry.quote.slice(0, 90)) + '…</div></div>';
      }).join('') + '</div>' : '<div class="wrong-list"><h4>全部答对，没有错题</h4></div>') +
      '<div style="margin-top:20px;display:flex;gap:9px;justify-content:center;flex-wrap:wrap">' +
      '<button class="primary-btn" id="quizAgain">再来一组 →</button>' +
      '<button class="ghost-btn" id="quizBack">回到词条库</button></div>';
    $('#quizAgain').onclick = startQuiz;
    $('#quizBack').onclick = function () {
      state.quiz = null;
      $('#quizResult').hidden = true; $('#quizRun').hidden = true; $('#quizIntro').hidden = false;
      switchView('library');
    };
  }

  /* ---------- 真题原文 ---------- */
  function allQuotes() {
    var out = [];
    ALL.forEach(function (e) {
      out.push({ uid: e.uid, hw: e.headword, quote: e.quote, quote_zh: e.quote_zh,
        source: e.source, year: e.year, paper: e.paper, section: e.section, type: e.type });
      (e.more_quotes || []).forEach(function (m) {
        out.push({ uid: e.uid, hw: e.headword, quote: m.quote, quote_zh: m.quote_zh,
          source: m.source, year: m.year || e.year, paper: m.paper || e.paper,
          section: m.section || e.section, type: e.type });
      });
    });
    return out;
  }
  var QUOTES = allQuotes();
  function renderCorpus() {
    var p = state.corpusPaper, y = state.corpusYear, q = state.corpusQuery.trim().toLowerCase();
    var list = QUOTES.filter(function (o) {
      if (p && o.paper !== p) return false;
      if (y && String(o.year) !== String(y)) return false;
      if (q && (o.quote + ' ' + o.quote_zh + ' ' + o.hw + ' ' + o.source).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var groups = {};
    list.forEach(function (o) {
      var k = o.year + ' · ' + o.paper;
      (groups[k] = groups[k] || []).push(o);
    });
    var keys = Object.keys(groups).sort(function (a, b) { return parseInt(b, 10) - parseInt(a, 10); });
    $('#corpusList').innerHTML = keys.length ? keys.map(function (k) {
      var items = groups[k].sort(function (a, b) { return a.source.localeCompare(b.source, 'zh'); });
      return '<details class="corpus-group" open><summary>' + esc(k) +
        '<span class="gcount">' + items.length + ' 句 / ' + new Set(items.map(function (i) { return i.source; })).size + ' 篇目</span></summary>' +
        '<div class="corpus-body">' + items.map(function (o) {
          return '<div class="citem"><blockquote class="quote">' + hl(o.quote, o.hw) + '</blockquote>' +
            '<div class="citem-meta"><span class="cw" data-jump="' + o.uid + '" style="cursor:pointer">' + esc(o.hw) + '</span>' +
            '<span>' + esc(o.quote_zh) + '</span><span class="src" style="margin:0">' + esc(o.source) + ' · ' + esc(o.section) + '</span></div></div>';
        }).join('') + '</div></details>';
    }).join('') : '<div class="empty"><div class="empty-mark">∅</div><h3>没有匹配的真题句子</h3></div>';
  }
  function initCorpusFilter() {
    var years = Array.from(new Set(QUOTES.map(function (o) { return o.year; }))).sort(function (a, b) { return b - a; });
    $('#corpusYear').innerHTML = '<option value="">全部年份</option>' + years.map(function (y) {
      return '<option value="' + y + '">' + y + '</option>';
    }).join('');
  }

  /* ---------- 关于 ---------- */
  function initAbout() {
    var t = META.types || {};
    $('#aboutStats').innerHTML =
      stat(META.total || ALL.length, '语言点') + stat(META.sources || 0, '真题出处') +
      stat((META.year_min || 2005) + '–' + (META.year_max || 2025), '年份跨度') +
      stat(Object.keys(META.topics || {}).length, '主题域') +
      stat(t.polyseme || 0, '熟词僻义') + stat(masteredCount(), '已掌握');
  }

  /* ---------- 视图切换 ---------- */
  function switchView(v) {
    state.view = v;
    $$('.tab').forEach(function (b) { b.classList.toggle('active', b.dataset.view === v); });
    $$('.view').forEach(function (s) { s.classList.toggle('active', s.id === 'view-' + v); });
    if (v === 'cards') { if (!state.queue.length || state.studyPool === null) buildQueue(); renderCard(); }
    if (v === 'quiz' && !state.quiz) {
      $('#quizIntro').hidden = false; $('#quizRun').hidden = true; $('#quizResult').hidden = true;
    }
    if (v === 'corpus') { $('#corpusSearch').value = state.query; state.corpusQuery = state.query; renderCorpus(); }
    if (v === 'about') initAbout();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- 事件 ---------- */
  function bind() {
    $('#tabs').addEventListener('click', function (ev) {
      var b = ev.target.closest('.tab'); if (b) switchView(b.dataset.view);
    });
    var searchHandler = debounce(function () {
      state.query = $('#globalSearch').value; state.limit = 36; state.openUid = null;
      renderLibrary(); if (state.view === 'corpus') { state.corpusQuery = state.query; renderCorpus(); }
    }, 180);
    $('#globalSearch').addEventListener('input', searchHandler);

    $('#filters').addEventListener('click', function (ev) {
      var c = ev.target.closest('.chip'); if (!c) return;
      var g = c.dataset.group, v = c.dataset.value, set =
        g === 'type' ? state.types : g === 'paper' ? state.papers :
        g === 'topic' ? state.topics : state.diffs;
      if (g === 'diff') v = parseInt(v, 10);
      if (set.has(v)) set.delete(v); else set.add(v);
      c.classList.toggle('on', set.has(v));
      state.limit = 36; state.openUid = null; state.studyPool = null; renderLibrary();
    });
    $('#yearFrom').addEventListener('change', function () { state.yearFrom = +this.value; state.studyPool = null; renderLibrary(); });
    $('#yearTo').addEventListener('change', function () { state.yearTo = +this.value; state.studyPool = null; renderLibrary(); });
    ['onlyHigh', 'onlyFav', 'onlyNew', 'showMeaning'].forEach(function (id) {
      $('#' + id).addEventListener('change', function () {
        state[id] = this.checked; state.limit = 36; state.studyPool = null; renderLibrary();
      });
    });
    $('#resetFilters').addEventListener('click', resetFilters);
    $('#emptyReset').addEventListener('click', resetFilters);
    $('#sortSelect').addEventListener('change', function () {
      state.sort = this.value;
      if (state.sort === 'random') reshuffle();
      state.limit = 36; renderLibrary();
    });
    $('#loadMore').addEventListener('click', function () { state.limit += 36; renderLibrary(); });
    $('#focusStudy').addEventListener('click', function () {
      var pool = filtered();
      if (!pool.length) { toast('当前筛选没有词条'); return; }
      state.studyPool = pool.map(function (e) { return e.uid; });
      buildQueue(true); switchView('cards'); toast('已载入 ' + state.queue.length + ' 张卡');
    });

    $('#cardList').addEventListener('click', function (ev) {
      var card = ev.target.closest('.wcard'); if (!card) return;
      var uid = card.dataset.uid, act = (ev.target.closest('[data-act]') || {}).dataset;
      if (act && act.act === 'fav') { toggleFav(uid); renderLibrary(); return; }
      if (act && act.act === 'mastered') {
        setMastery(uid, mastery[uid] && mastery[uid].box >= 2 ? 0 : 2);
        toast(mastery[uid].box >= 2 ? '已标记掌握' : '已移回待复习'); renderLibrary(); return;
      }
      if (act && act.act === 'studyone') {
        state.studyPool = [uid]; $('#studyOnlyNew').checked = false;
        buildQueue(true); switchView('cards'); return;
      }
      state.openUid = state.openUid === uid ? null : uid;
      renderLibrary();
      if (state.openUid) {
        var el = $('.wcard.open'); if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });

    // 记忆卡
    $('#flipCard').addEventListener('click', flip);
    $('#gradeRow').addEventListener('click', function (ev) {
      var b = ev.target.closest('.grade'); if (b) grade(parseInt(b.dataset.grade, 10));
    });
    $('#skipCard').addEventListener('click', function () { state.qi++; state.flipped = false; renderCard(); });
    $('#favCurrent').addEventListener('click', function () {
      var e = currentEntry(); if (!e) return; toggleFav(e.uid); renderCard();
    });
    $('#shuffleCards').addEventListener('click', function () { state.studyPool = null; buildQueue('shuffle'); renderCard(); toast('已重新洗牌'); });
    ['studyOnlyNew', 'studyFavOnly'].forEach(function (id) {
      $('#' + id).addEventListener('change', function () { buildQueue(true); renderCard(); });
    });
    $('#resetMastery').addEventListener('click', function () {
      if (!confirm('确定清空所有掌握记录？收藏不会被删除。')) return;
      mastery = {}; save(LS_MASTERY, mastery); initTop(); buildQueue(true); renderCard(); toast('掌握记录已清空');
    });

    // 测验
    $('#startQuiz').addEventListener('click', startQuiz);
    $('#quizOptions').addEventListener('click', function (ev) {
      var b = ev.target.closest('.opt'); if (b) answer(parseInt(b.dataset.i, 10));
    });
    $('#nextQuestion').addEventListener('click', function () {
      var qz = state.quiz; if (!qz.answered) return;
      qz.i++;
      if (qz.i >= qz.qs.length) quizResult(); else renderQuestion();
    });
    $('#quitQuiz').addEventListener('click', function () {
      $('#quizRun').hidden = true; $('#quizResult').hidden = true; $('#quizIntro').hidden = false;
      state.quiz = null;
    });

    // 真题原文
    $('#corpusPaper').addEventListener('change', function () { state.corpusPaper = this.value; renderCorpus(); });
    $('#corpusYear').addEventListener('change', function () { state.corpusYear = this.value; renderCorpus(); });
    $('#corpusSearch').addEventListener('input', debounce(function () { state.corpusQuery = this.value; renderCorpus(); }, 180));
    $('#corpusList').addEventListener('click', function (ev) {
      var j = ev.target.closest('[data-jump]'); if (!j) return;
      var e = ALL.filter(function (x) { return x.uid === j.dataset.jump; })[0]; if (!e) return;
      state.types.clear(); state.papers.clear(); state.topics.clear(); state.diffs.clear();
      state.onlyHigh = state.onlyFav = state.onlyNew = false;
      ['onlyHigh', 'onlyFav', 'onlyNew'].forEach(function (id) { $('#' + id).checked = false; });
      $('#yearFrom').value = 2005; $('#yearTo').value = 2025; state.yearFrom = 2005; state.yearTo = 2025;
      $('#globalSearch').value = e.headword; state.query = e.headword;
      state.openUid = e.uid; state.limit = 36;
      initFilters(); renderLibrary(); switchView('library');
      setTimeout(function () { var el = $('.wcard.open'); if (el) el.scrollIntoView({ block: 'center' }); }, 120);
    });

    // 键盘
    document.addEventListener('keydown', function (ev) {
      var tag = (ev.target.tagName || '').toLowerCase();
      var typing = tag === 'input' || tag === 'select' || tag === 'textarea';
      if (ev.key === '/' && !typing) { ev.preventDefault(); $('#globalSearch').focus(); return; }
      if (typing) return;
      if (state.view === 'cards') {
        if (ev.code === 'Space' || ev.key === ' ') { ev.preventDefault(); flip(); }
        if (['1', '2', '3'].indexOf(ev.key) >= 0) grade(parseInt(ev.key, 10) - 1);
      }
      if (ev.key === 'Escape' && state.openUid) { state.openUid = null; renderLibrary(); }
    });
  }
  function resetFilters() {
    state.types.clear(); state.papers.clear(); state.topics.clear(); state.diffs.clear();
    state.onlyHigh = state.onlyFav = state.onlyNew = false; state.showMeaning = false;
    state.yearFrom = 2005; state.yearTo = 2025; state.query = ''; state.limit = 36;
    state.openUid = null; state.studyPool = null;
    state.sort = 'freqDesc'; $('#sortSelect').value = 'freqDesc';
    $('#globalSearch').value = '';
    ['onlyHigh', 'onlyFav', 'onlyNew', 'showMeaning'].forEach(function (id) { $('#' + id).checked = false; });
    $('#yearFrom').value = 2005; $('#yearTo').value = 2025;
    initFilters(); renderLibrary();
  }

  /* ---------- 启动 ---------- */
  if (!ALL.length) {
    document.body.innerHTML = '<div style="padding:60px;text-align:center;font-family:sans-serif">语料未加载：请确认 data/corpus.js 与 index.html 位于同一目录结构下。</div>';
    return;
  }
  initTop(); initFilters(); initCorpusFilter(); bind(); renderLibrary();
})();
