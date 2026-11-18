(() => {
  'use strict';
  const terms = window.FE_TERMS;
  const core = window.FEGame;
  const app = document.getElementById('app');
  const KEY = 'fe-memorize-v1';
  const fresh = () => ({ records: {}, filters: { area: '', category: '', source: '' }, reverse: false, totalCorrect: 0, streak: 0, bestStreak: 0, bestScore: 0 });
  let state = fresh(), game = null, interval = null, delay = null, weakExpanded = false;
  function storageWarning(message) {
    const notice = document.getElementById('storage-notice');
    notice.hidden = false;
    notice.textContent = message;
  }
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && typeof saved === 'object') {
      state = Object.assign(fresh(), saved);
      state.filters = Object.assign(fresh().filters, saved.filters);
      if (!state.records || typeof state.records !== 'object' || Array.isArray(state.records)) state.records = {};
      for (const [id, r] of Object.entries(state.records)) {
        if (!r || !['attempts', 'correct', 'streak', 'difficulty'].every(k => Number.isFinite(r[k]) && r[k] >= 0)) delete state.records[id];
      }
      for (const key of ['totalCorrect', 'streak', 'bestStreak', 'bestScore']) {
        if (!Number.isFinite(state[key]) || state[key] < 0) state[key] = 0;
      }
    }
  } catch (_) { storageWarning('記録を読み込めませんでした。この画面では新しい記録で遊べます。'); }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (_) { storageWarning('このブラウザでは記録を保存できません。ゲームは遊べますが、閉じると今回の記録は消えます。'); }
  }
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const filtered = () => terms.filter(t => ['area', 'category', 'source'].every(k => !state.filters[k] || t[k] === state.filters[k]));
  const button = (label, action, cls = '', extra = '') => `<button type="button" class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
  const stats = (a, b, c) => `<div class="stats">${[a, b, c].map(([v, label]) => `<div class="stat"><strong>${esc(v)}</strong><span>${esc(label)}</span></div>`).join('')}</div>`;
  const options = (values, selected) => ['', ...values].map(v => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(v || 'すべて')}</option>`).join('');
  function stopTimers() { clearInterval(interval); clearTimeout(delay); interval = delay = null; }
  function focusMain() { const heading = app.querySelector('h1'); if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); } }
  function record(t, correct, gentle = false) {
    state.records[t.id] = core.update(state.records[t.id], correct, gentle);
    state.totalCorrect += correct ? 1 : 0;
    state.streak = correct ? state.streak + 1 : 0;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    save();
  }
  function home() {
    stopTimers(); game = null;
    const pool = filtered();
    const weak = pool.filter(t => state.records[t.id]?.difficulty > 0).sort((a, b) => state.records[b.id].difficulty - state.records[a.id].difficulty);
    app.innerHTML = `<section class="hero"><p class="eyebrow">毎日の学習を、ひとつずつ。</p><h1>覚える。試す。<br>知識が、つながる。</h1><p class="muted">基本情報の${terms.length}語を、4つのゲームで。<br>苦手な用語を少し多めに、あなたのペースで復習。</p></section>
      ${stats([state.totalCorrect, '通算の正解'], [state.streak, '現在の連続正解'], [state.bestScore, '60秒の自己ベスト'])}
      <section class="panel"><h2>今日の学習範囲</h2><div class="filter-grid">
      <label>分野<select id="area" data-filter="area">${options(['テクノロジ', 'マネジメント', 'ストラテジ'], state.filters.area)}</select></label>
      <label>分類<select id="category" data-filter="category">${options([...new Set(terms.map(t => t.category))], state.filters.category)}</select></label>
      <label>出典<select id="source" data-filter="source">${options(['06提案', '補完'], state.filters.source)}</select></label></div><p class="filter-summary">出題対象 <strong>${pool.length}語</strong> ／ 全${terms.length}語</p></section>
      <div class="section-head"><h2>学び方を選ぶ</h2></div><p class="muted" style="font-size:13px">まずはカードで確認、慣れたらクイズに挑戦。</p>
      <div class="mode-grid">${button('<span class="mode-number">01 ／ 思い出す</span><strong>4択クイズ</strong><small>最大20問。用語に合う意味を選ぼう。</small>', 'start-quiz', 'mode primary', pool.length ? '' : 'disabled')}
      ${button('<span class="mode-number">02 ／ じっくり覚える</span><strong>フラッシュカード</strong><small>タップでめくる。「わかった」で定着。</small>', 'start-flash', 'mode', pool.length ? '' : 'disabled')}
      ${button('<span class="mode-number">03 ／ ペアを探す</span><strong>神経衰弱</strong><small>最大8ペア。用語と意味を結ぼう。</small>', 'start-memory', 'mode', pool.length ? '' : 'disabled')}
      ${button('<span class="mode-number">04 ／ 集中チャレンジ</span><strong>タイムアタック</strong><small>60秒の4択。連続正解でボーナス。</small>', 'start-timed', 'mode', pool.length ? '' : 'disabled')}</div>
      ${!pool.length ? '<p class="notice">該当する用語がありません。学習範囲を変更してください。</p>' : ''}
      <section class="panel"><h2>クイズの向き</h2><label><select id="direction"><option value="normal" ${!state.reverse ? 'selected' : ''}>用語 → 意味</option><option value="reverse" ${state.reverse ? 'selected' : ''}>意味 → 用語</option></select></label><p class="muted" style="font-size:12px">4択・タイムアタックに適用。ヒントを見ても不正解になりません。</p></section>
      <section><div class="section-head"><h2>苦手を、ひとつずつ</h2><span class="chip">${weak.length}語</span></div><p class="muted" style="font-size:13px">選択中の範囲から、苦手度の高い順に表示。</p>
      <ul class="weak-list">${weak.slice(0, weakExpanded ? weak.length : 5).map(t => {
        const r = state.records[t.id];
        return `<li class="weak-item"><strong>${esc(t.term)}</strong><p>${esc(t.meaning)}</p><span class="weak-meta">正答率 ${Math.round(r.correct / r.attempts * 100)}％ ・ ${r.attempts}回学習 ・ 苦手度 ${r.difficulty.toFixed(1)}</span><div class="weak-actions">${button('この用語をクイズ', 'single-quiz', '', `data-id="${esc(t.id)}"`)}${button('カードで確認', 'single-flash', '', `data-id="${esc(t.id)}"`)}</div></li>`;
      }).join('') || '<li class="empty">まだ苦手な用語はありません。<br>学習を始めると、ここに復習候補が並びます。</li>'}</ul>
      ${weak.length > 5 ? button(weakExpanded ? '5語だけ表示' : `すべての${weak.length}語を表示`, 'expand-weak', 'text-button') : ''}</section>
      <details><summary>記録と復習のしくみ</summary><p class="muted">不正解・「もう一度」で苦手度が上がり、連続正解で下がります。苦手な用語ほど選ばれやすく、未学習の用語も混ぜます。「わかった」はクイズの正解よりゆっくり苦手度が下がります。セッション内では同じ用語を重複させず、次回の学習に反映します。</p><p>最長連続正解：${state.bestStreak}回</p>${button('学習記録と設定をすべてリセット', 'reset', 'danger')}</details>`;
  }
  function toolbar(title, badge = '') {
    return `<div class="toolbar">${button('← ホーム', 'home', 'text-button')}<h1>${title}</h1>${badge}</div>`;
  }
  function start(mode, onlyId) {
    stopTimers();
    const pool = onlyId ? filtered().filter(t => t.id === onlyId) : filtered();
    if (!pool.length) return home();
    game = { mode, pool, items: core.select(pool, state.records, mode === 'memory' ? 8 : Math.min(20, pool.length)), index: 0, correct: 0, answered: false, flipped: false, grades: {}, score: 0, combo: 0, bestCombo: 0, started: Date.now() };
    if (mode === 'memory') {
      game.cards = core.shuffle(game.items.flatMap(t => [{ term: t, kind: 'term' }, { term: t, kind: 'meaning' }]));
      game.open = []; game.matched = []; game.moves = 0; game.locked = false;
      renderMemory();
      interval = setInterval(updateClock, 250);
    } else if (mode === 'timed') {
      game.deadline = Date.now() + 60000;
      renderQuiz(); interval = setInterval(updateClock, 100);
    } else if (mode === 'flash') renderFlash();
    else renderQuiz();
    focusMain();
  }
  function renderQuiz() {
    const t = game.items[game.index];
    game.answered = false;
    // 選択肢も出題範囲内から作る。範囲が小さいときは選択肢数を減らす。
    game.options = core.choices(t, game.pool, state.reverse);
    const timed = game.mode === 'timed';
    app.innerHTML = toolbar(timed ? 'タイムアタック' : '4択クイズ', timed ? '<span id="clock" class="timer" role="timer">60秒</span>' : `<span class="chip">${game.index + 1} / ${game.items.length}問</span>`)
      + (timed ? `<p id="live-score">${game.score}点 ・ 連続正解 ${game.combo}回</p>` : `<div class="progress"><span style="width:${game.index / game.items.length * 100}%"></span></div>`)
      + `<section class="question ${state.reverse ? 'reverse' : ''}"><span class="eyebrow">${esc(t.category)} ／ ${state.reverse ? 'この意味の用語は？' : 'この用語の意味は？'}</span><h2>${esc(state.reverse ? t.meaning : t.term)}</h2>${!state.reverse && t.reading ? `<p class="reading">${esc(t.reading)}</p>` : ''}</section>
      ${game.options.length < 4 ? '<p class="muted" style="font-size:12px">範囲内で異なる選択肢が4つそろわないため、選択肢を減らしています。</p>' : ''}
      <div class="answers">${game.options.map((o, i) => button(`<span class="letter">${i + 1}</span><span>${esc(o.text)}</span>`, 'answer', 'answer', `data-index="${i}"`)).join('')}</div>
      <div class="actions">${button('ヒントを見る', 'hint', 'text-button')}</div><div id="hint" class="hint" hidden>${esc(t.hint || 'この用語にはヒントがありません。')}</div><div id="feedback" aria-live="polite"></div>`;
    if (timed) updateClock();
  }
  function answer(index) {
    if (game.answered) return;
    if (game.mode === 'timed' && Date.now() >= game.deadline) return finish();
    const selected = game.options[index];
    if (!selected) return;
    game.answered = true;
    const t = game.items[game.index], correct = selected.correct;
    record(t, correct); game.correct += correct ? 1 : 0;
    game.combo = correct ? game.combo + 1 : 0;
    game.bestCombo = Math.max(game.bestCombo, game.combo);
    if (correct) game.score += 100 + Math.min(5, game.combo - 1) * 20;
    app.querySelectorAll('[data-action="answer"]').forEach((el, i) => {
      el.disabled = true;
      if (game.options[i].correct) el.classList.add('correct');
      else if (i === index) el.classList.add('wrong');
    });
    const timed = game.mode === 'timed';
    document.getElementById('feedback').innerHTML = `<div class="feedback ${correct ? '' : 'error'}"><strong>${correct ? '正解！' : 'もう一度、覚えよう。'}</strong><p>${esc(t.term)}${state.reverse && t.reading ? `（${esc(t.reading)}）` : ''}：${esc(t.meaning)}</p></div>${!timed ? `<div class="actions">${button(game.index + 1 === game.items.length ? '結果を見る' : '次の問題へ →', 'next-question', 'filled')}</div>` : ''}`;
    if (timed) {
      document.getElementById('live-score').textContent = `${game.score}点 ・ 連続正解 ${game.combo}回`;
      delay = setTimeout(nextQuestion, 850);
    } else app.querySelector('[data-action="next-question"]').focus({ preventScroll: true });
  }
  function nextQuestion() {
    if (!game || !game.answered) return;
    game.index++;
    if (game.index >= game.items.length) {
      if (game.mode !== 'timed') return finish();
      game.items = core.select(game.pool, state.records, Math.min(20, game.pool.length)); game.index = 0;
    }
    renderQuiz();
  }
  function renderFlash() {
    const t = game.items[game.index], graded = game.grades[t.id];
    app.innerHTML = toolbar('フラッシュカード', `<span class="chip">${game.index + 1} / ${game.items.length}枚</span>`)
      + `<p class="muted">未評価 ${game.items.length - Object.keys(game.grades).length}枚 ・ タップして表と裏を切り替え</p>
      ${button(`<span class="eyebrow">${game.flipped ? '意味' : esc(t.category)}</span><span class="card-main">${esc(game.flipped ? t.meaning : t.term)}</span>${!game.flipped && t.reading ? `<span class="reading">${esc(t.reading)}</span>` : ''}<small>${game.flipped ? 'タップで用語に戻る ↶' : 'タップで意味を見る ↻'}</small>`, 'flip', `flashcard ${game.flipped ? 'back' : ''}`, `aria-label="${game.flipped ? '意味：' : '用語：'}${esc(game.flipped ? t.meaning : t.term)}。タップしてめくる"`)}
      <div class="actions">${button('もう一度', 'grade-again', '', graded || !game.flipped ? 'disabled' : '')}${button('わかった', 'grade-known', 'filled', graded || !game.flipped ? 'disabled' : '')}</div>
      <p class="muted" role="status">${graded ? `このカードは「${graded === 'known' ? 'わかった' : 'もう一度'}」で記録済みです。` : game.flipped ? '思い出せたか、自分で評価しましょう。' : '意味を確認すると評価できます。'}</p>
      <div class="actions">${button('← 前', 'flash-prev', '', game.index === 0 ? 'disabled' : '')}${button('次 →', 'flash-next', '', game.index === game.items.length - 1 ? 'disabled' : '')}</div>
      <div class="actions">${button('ここまでの結果を見る', 'finish', 'text-button')}</div>`;
  }
  function grade(known) {
    const t = game.items[game.index];
    if (!game.flipped || game.grades[t.id]) return;
    game.grades[t.id] = known ? 'known' : 'again';
    record(t, known, known); game.correct += known ? 1 : 0;
    if (Object.keys(game.grades).length === game.items.length) return finish();
    const next = game.items.findIndex((item, i) => i > game.index && !game.grades[item.id]);
    game.index = next >= 0 ? next : game.items.findIndex(item => !game.grades[item.id]);
    game.flipped = false; renderFlash();
  }
  function renderMemory() {
    app.innerHTML = toolbar('神経衰弱') + stats([`${game.matched.length / 2} / ${game.items.length}`, 'そろったペア'], [game.moves, '手数'], ['0秒', '所要時間'])
      + '<p class="muted">用語と、その意味を1枚ずつ選んでペアにしよう。</p><div id="memory-status" role="status" aria-live="polite"></div>'
      + `<div class="memory-grid">${game.cards.map((card, i) => {
        const visible = game.open.includes(i) || game.matched.includes(i), matched = game.matched.includes(i);
        return button(visible ? `<span class="memory-kind">${card.kind === 'term' ? '用語' : '意味'}</span>${esc(card.term[card.kind])}${card.kind === 'term' && card.term.reading ? `<br><small>${esc(card.term.reading)}</small>` : ''}` : '？', 'memory', `memory-card ${visible ? '' : 'face-down'} ${matched ? 'matched' : ''}`, `data-index="${i}" aria-label="${i + 1}枚目、${visible ? esc(card.term[card.kind]) : '裏向き'}${matched ? '、ペア成立' : ''}" ${visible ? 'disabled' : ''}`);
      }).join('')}</div>`;
    const timer = app.querySelectorAll('.stat strong')[2]; timer.id = 'clock'; updateClock();
  }
  function flipMemory(index) {
    if (game.locked || game.open.includes(index) || game.matched.includes(index) || !game.cards[index]) return;
    game.open.push(index); renderMemory();
    if (game.open.length < 2) return;
    game.moves++;
    const [a, b] = game.open.map(i => game.cards[i]);
    const match = a.term.id === b.term.id && a.kind !== b.kind;
    if (match) {
      game.matched.push(...game.open); game.open = []; record(a.term, true); game.correct++;
      renderMemory(); document.getElementById('memory-status').textContent = 'ペア成立！';
      if (game.matched.length === game.cards.length) finish();
    } else {
      // 同じ用語を2回めくっても、この1手の不正解は1回だけ記録する。
      [...new Set([a.term.id, b.term.id])].forEach(id => record(terms.find(t => t.id === id), false));
      game.locked = true; renderMemory(); document.getElementById('memory-status').textContent = '違うペアです。意味を確認しましょう。';
      delay = setTimeout(() => { game.open = []; game.locked = false; renderMemory(); }, 1500);
    }
  }
  function updateClock() {
    if (!game) return;
    const el = document.getElementById('clock');
    if (game.mode === 'timed') {
      const left = Math.max(0, Math.ceil((game.deadline - Date.now()) / 1000));
      if (el) { el.textContent = `${left}秒`; el.classList.toggle('urgent', left <= 10); }
      if (!left) finish();
    } else if (game.mode === 'memory' && el) el.textContent = `${Math.floor((Date.now() - game.started) / 1000)}秒`;
  }
  function finish() {
    if (!game) return;
    stopTimers();
    const g = game; game = null;
    const elapsed = Math.floor((Date.now() - g.started) / 1000);
    let detail = '', value = '', label = '';
    if (g.mode === 'timed') {
      const best = g.score > state.bestScore;
      state.bestScore = Math.max(state.bestScore, g.score); save();
      value = `${g.score}`; label = '点';
      detail = `${best ? '<p class="chip">自己ベスト更新！</p>' : ''}${stats([g.correct, '正答数'], [g.bestCombo, '最長連続正解'], [state.bestScore, '自己ベスト'])}<p class="muted">正解100点。2連続目から20点ずつ増え、最大200点。<br>解説の表示中も60秒の時計は進みます。</p>`;
    } else if (g.mode === 'memory') {
      value = `${g.items.length}`; label = 'ペア、すべてそろいました';
      detail = stats([g.moves, '手数'], [`${elapsed}秒`, '所要時間'], [g.items.length, '復習した用語']);
    } else if (g.mode === 'flash') {
      const assessed = Object.keys(g.grades).length;
      value = `${g.correct} / ${assessed}`; label = '枚、わかった';
      detail = `<p>「もう一度」${assessed - g.correct}枚 ・ 未評価 ${g.items.length - assessed}枚</p><p class="muted">今回の評価を、次の出題に反映しました。</p>`;
    } else {
      value = `${g.correct} / ${g.items.length}`; label = '問正解';
      detail = `<p class="muted">間違えた用語は、苦手リストで確認できます。</p>`;
    }
    app.innerHTML = `<section class="result"><p class="eyebrow">今日の一歩を、記録しました。</p><h1>おつかれさまでした！</h1><div class="panel"><div class="result-value">${esc(value)}</div><p>${label}</p>${detail}</div><div class="actions">${button('もう一度遊ぶ', 'replay', 'filled')}${button('ホームへ', 'home')}</div></section>`;
    app.querySelector('[data-action="replay"]').addEventListener('click', () => start(g.mode, g.pool.length === 1 ? g.pool[0].id : undefined));
    focusMain();
  }
  app.addEventListener('change', event => {
    if (event.target.dataset.filter) {
      const key = event.target.dataset.filter;
      state.filters[key] = event.target.value; save(); home();
      document.getElementById(key)?.focus();
    } else if (event.target.id === 'direction') { state.reverse = event.target.value === 'reverse'; save(); }
  });
  app.addEventListener('click', event => {
    const el = event.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const action = el.dataset.action;
    if (action.startsWith('start-')) return start(action.slice(6));
    if (action.startsWith('single-')) return start(action.slice(7), el.dataset.id);
    if (action === 'home') { home(); focusMain(); }
    else if (action === 'reset') {
      if (confirm('すべての学習記録・自己ベスト・フィルタ設定を削除します。よろしいですか？')) {
        state = fresh();
        try { localStorage.removeItem(KEY); } catch (_) { storageWarning('保存済みの記録を削除できませんでした。ブラウザのサイトデータ設定から削除してください。'); }
        home();
      }
    } else if (action === 'expand-weak') { weakExpanded = !weakExpanded; home(); }
    else if (action === 'hint' && game) { document.getElementById('hint').hidden = false; el.disabled = true; }
    else if (action === 'answer' && game) answer(Number(el.dataset.index));
    else if (action === 'next-question' && game) nextQuestion();
    else if (action === 'flip' && game) { game.flipped = !game.flipped; renderFlash(); app.querySelector('[data-action="flip"]').focus({ preventScroll: true }); }
    else if (action === 'grade-known' && game) grade(true);
    else if (action === 'grade-again' && game) grade(false);
    else if (action === 'flash-prev' && game) { game.index = Math.max(0, game.index - 1); game.flipped = false; renderFlash(); }
    else if (action === 'flash-next' && game) { game.index = Math.min(game.items.length - 1, game.index + 1); game.flipped = false; renderFlash(); }
    else if (action === 'finish' && game) finish();
    else if (action === 'memory' && game) flipMemory(Number(el.dataset.index));
  });
  document.querySelector('.brand').addEventListener('click', e => { e.preventDefault(); home(); focusMain(); });
  if (!Array.isArray(terms) || !terms.length || !core) {
    app.textContent = '用語データを読み込めません。fe_terms.js と game-core.js が同じフォルダにあることを確認してください。';
  } else home();
})();
