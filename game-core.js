(function (root) {
  'use strict';
  const shuffle = (items, random = Math.random) => {
    const result = items.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };
  function select(items, records, count, random = Math.random) {
    const pool = items.slice(), result = [];
    while (pool.length && result.length < count) {
      const weights = pool.map(t => {
        const r = records[t.id];
        return !r || !r.attempts ? 3 : 1 + Math.min(8, r.difficulty || 0);
      });
      let point = random() * weights.reduce((a, b) => a + b, 0);
      let index = weights.length - 1;
      for (let i = 0; i < weights.length; i++) {
        point -= weights[i];
        if (point < 0) { index = i; break; }
      }
      result.push(pool.splice(index, 1)[0]);
    }
    return result;
  }
  function choices(term, items, reverse, random = Math.random) {
    const key = reverse ? 'term' : 'meaning';
    const seen = new Set([term[key]]);
    const wrong = [];
    const candidates = shuffle(items.filter(t => t.category === term.category), random)
      .concat(shuffle(items.filter(t => t.category !== term.category), random));
    for (const t of candidates) {
      if (!seen.has(t[key])) { wrong.push(t); seen.add(t[key]); }
      if (wrong.length === 3) break;
    }
    return shuffle([term, ...wrong], random).map(t => ({ text: t[key], correct: t[key] === term[key] }));
  }
  function update(record, correct, gentle = false) {
    const r = Object.assign({ attempts: 0, correct: 0, streak: 0, last: null, difficulty: 0 }, record);
    r.attempts++;
    r.correct += correct ? 1 : 0;
    r.streak = correct ? r.streak + 1 : 0;
    r.last = correct ? '正解' : 'もう一度';
    r.difficulty = Math.max(0, Math.min(10, r.difficulty + (correct ? -(gentle ? 0.5 : 1 + Math.min(r.streak, 3) * 0.25) : 2)));
    r.updatedAt = Date.now();
    return r;
  }
  const api = { shuffle, select, choices, update };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FEGame = api;
})(typeof window !== 'undefined' ? window : globalThis);
