'use strict';
// ブラウザAPIの最小スタブを使い、操作と保存の連携を検証する。
// 画面の見た目やブラウザ固有の挙動は、このテストの対象外。
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
module.exports = function smoke(terms, core) {
  const nodes = new Map(), listeners = {}, storage = new Map(), timers = new Map();
  let now = 1000, nextTimer = 1;
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      innerHTML: '', textContent: '', hidden: false, disabled: false,
      classList: { add() {}, toggle() {} }, focus() {},
      addEventListener(name, fn) { listeners[`${id}:${name}`] = fn; }
    });
    return nodes.get(id);
  };
  const app = node('app');
  app.querySelector = selector => selector.startsWith('h1') ? node('heading') : node(selector);
  app.querySelectorAll = selector => selector === '.stat strong' ? [node('stat1'), node('stat2'), node('stat3')] : [...app.innerHTML.matchAll(/data-action="answer"/g)].map((_, i) => node(`answer${i}`));
  const FakeDate = class extends Date { static now() { return now; } };
  const context = {
    window: { FE_TERMS: terms, FEGame: core },
    document: { getElementById: node, querySelector: node }, Date: FakeDate,
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    confirm: () => false,
    setInterval: fn => { const id = nextTimer++; timers.set(id, fn); return id; },
    clearInterval: id => timers.delete(id),
    setTimeout: fn => { const id = nextTimer++; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id)
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8'), context);
  const click = (action, more = {}) => listeners['app:click']({ target: { closest: () => ({ dataset: { action, ...more }, disabled: false }) } });
  const saved = () => JSON.parse(storage.get('fe-memorize-v1'));
  const attempts = () => Object.values(saved()?.records || {}).reduce((n, r) => n + r.attempts, 0);
  assert(app.innerHTML.includes('学び方を選ぶ'));
  click('start-quiz');
  for (let i = 0; i < 20; i++) {
    assert(app.innerHTML.includes('data-action="answer"'));
    click('hint'); click('answer', { index: '0' });
    assert(node('feedback').innerHTML.includes('結果を見る') || node('feedback').innerHTML.includes('次の問題へ'));
    click('answer', { index: '0' }); // 二重回答を無視する。
    click('next-question');
  }
  assert.equal(attempts(), 20);
  assert(app.innerHTML.includes('おつかれさまでした'));
  click('home'); click('start-flash');
  for (let i = 0; i < 20; i++) { click('flip'); click('grade-known'); }
  assert.equal(attempts(), 40);
  assert(app.innerHTML.includes('20 / 20'));
  click('home'); click('start-memory');
  const cardButtons = [...app.innerHTML.matchAll(/data-action="memory" data-index="(\d+)"/g)];
  assert.equal(cardButtons.length, 16);
  // 各カードをめくり、表示された意味または用語からペアを特定する。
  const positions = new Map();
  for (let i = 0; i < 16; i++) {
    click('memory', { index: String(i) });
    const card = app.innerHTML.match(new RegExp(`<button[^>]*data-action="memory" data-index="${i}"[^>]*>([\\s\\S]*?)</button>`));
    assert(card);
    const text = card[1].replace(/<[^>]*>/g, '');
    const escapeText = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const term = terms.find(t => text === '用語' + escapeText(t.term + (t.reading || '')) || text === '意味' + escapeText(t.meaning));
    assert(term, 'カードの内容が元データと一致する');
    if (!positions.has(term.id)) positions.set(term.id, []);
    positions.get(term.id).push(i);
    // 2枚が不一致の場合のタイマーを進める。
    if (i % 2 === 1) for (const [id, fn] of [...timers]) if (id !== [...timers.keys()][0]) { timers.delete(id); fn(); }
  }
  // すでに成立したペアは押しても無視される。
  for (const indexes of positions.values()) for (const i of indexes) click('memory', { index: String(i) });
  assert(app.innerHTML.includes('すべてそろいました'));
  click('home'); click('start-timed'); click('answer', { index: '0' });
  now += 61000;
  for (const fn of [...timers.values()]) fn();
  assert(app.innerHTML.includes('自己ベスト'));
  assert(!app.innerHTML.includes('data-action="answer"'));
  click('home');
  listeners['app:change']({ target: { dataset: { filter: 'area' }, value: 'ストラテジ' } });
  assert.equal(saved().filters.area, 'ストラテジ');
  click('reset'); // キャンセルは記録を残す。
  assert(saved().totalCorrect > 0);
  context.confirm = () => true; click('reset');
  assert.equal(storage.size, 0);
  assert.equal(timers.size, 0);
};
