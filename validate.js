'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const core = require('./game-core.js');
const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`合格：${name}`); }
  catch (error) { console.error(`失敗：${name}\n${error.message}`); process.exitCode = 1; }
}
let terms;
test('JSONは配列で150件前後（130〜170件）', () => {
  terms = JSON.parse(read('fe_terms.json'));
  assert(Array.isArray(terms)); assert(terms.length >= 130 && terms.length <= 170);
});
test('全件の必須キー・空欄・IDの一意性・分野・出典', () => {
  const ids = new Set();
  for (const t of terms) {
    for (const key of ['id', 'area', 'category', 'term', 'reading', 'meaning', 'hint', 'source']) {
      assert.equal(typeof t[key], 'string', `${t.id}: ${key}`);
    }
    assert(t.id.trim() && t.term.trim() && t.meaning.trim());
    assert(!ids.has(t.id), `ID重複: ${t.id}`); ids.add(t.id);
    assert(['テクノロジ', 'マネジメント', 'ストラテジ'].includes(t.area));
    assert(['06提案', '補完'].includes(t.source));
  }
});
test('fe_terms.jsの形式と全内容がJSONと一致', () => {
  const code = read('fe_terms.js');
  assert(/^window\.FE_TERMS = \[/.test(code));
  const sandbox = { window: {} }; vm.runInNewContext(code, sandbox, { timeout: 1000 });
  assert.equal(JSON.stringify(sandbox.window.FE_TERMS), JSON.stringify(terms));
});
test('HTMLから相対パスで読み込み、データをアプリより先に読む', () => {
  const html = read('index.html');
  for (const file of ['styles.css', 'fe_terms.js', 'game-core.js', 'app.js']) {
    assert(html.includes(`"${file}"`), `${file}の相対参照がない`);
    assert(fs.existsSync(path.join(__dirname, file)));
  }
  assert(html.indexOf('"fe_terms.js"') < html.indexOf('"app.js"'));
  assert(/<html lang="ja">/.test(html));
});
test('HTML・CSS・JSに外部CDN・外部リソース・通信処理がない', () => {
  const files = fs.readdirSync(__dirname).filter(f => /\.(html|css|js)$/.test(f) && f !== 'validate.js');
  const forbidden = /cdn\.|unpkg\.com|jsdelivr|googleapis|cloudflare|typekit|https?:\/\/|\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i;
  for (const file of files) assert(!forbidden.test(read(file)), `外部参照の疑い: ${file}`);
});
test('各JSの構文', () => {
  for (const file of ['app.js', 'game-core.js', 'fe_terms.js', 'sync_terms.js']) new vm.Script(read(file), { filename: file });
});
test('両方向の4択は正解1つ、重複なし、同じ分類優先', () => {
  for (const reverse of [false, true]) for (const t of terms) {
    const choices = core.choices(t, terms, reverse);
    assert.equal(choices.length, 4);
    assert.equal(choices.filter(c => c.correct).length, 1);
    assert.equal(new Set(choices.map(c => c.text)).size, 4);
    const key = reverse ? 'term' : 'meaning';
    if (new Set(terms.filter(x => x.category === t.category).map(x => x[key])).size >= 4) {
      assert(choices.every(c => terms.some(x => x.category === t.category && x[key] === c.text)));
    }
  }
  assert.equal(core.choices(terms[0], [terms[0]], false).length, 1);
});
test('重み付き出題は範囲を守り、重複せず、未学習と既学習にも機会がある', () => {
  const subset = terms.slice(0, 8);
  const chosen = core.select(subset, {}, 20);
  assert.equal(chosen.length, 8); assert.equal(new Set(chosen.map(t => t.id)).size, 8);
  assert(chosen.every(t => subset.includes(t)));
  const pair = terms.slice(0, 2);
  const records = { [pair[0].id]: { attempts: 1, difficulty: 8 }, [pair[1].id]: { attempts: 1, difficulty: 0 } };
  let high = 0;
  // 等間隔の乱数で確率を決定的に検証する。
  for (let i = 0; i < 100; i++) if (core.select(pair, records, 1, () => (i + 0.5) / 100)[0] === pair[0]) high++;
  assert.equal(high, 90);
  assert(core.select(pair, {}, 1, () => 0.99)[0] === pair[1]);
});
test('誤答・連続正解・カード評価で記録と苦手度が変わる', () => {
  let r = core.update(undefined, false);
  assert.equal(r.attempts, 1); assert.equal(r.correct, 0); assert.equal(r.difficulty, 2);
  const gentle = core.update(r, true, true), normal = core.update(r, true);
  assert(gentle.difficulty > normal.difficulty);
  r = core.update(core.update(r, true), true);
  assert.equal(r.attempts, 3); assert.equal(r.correct, 2); assert.equal(r.streak, 2);
  assert.equal(r.difficulty, 0);
  for (let i = 0; i < 30; i++) r = core.update(r, false);
  assert.equal(r.difficulty, 10); assert.equal(r.streak, 0);
});
test('4モードの操作・二重回答防止・保存・60秒終了・リセットの連携', () => {
  require('./app-smoke.js')(terms, core);
});
if (!process.exitCode) console.log(`\n自己テスト ${passed}項目すべて合格（用語${terms.length}件）。`);
