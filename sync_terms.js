'use strict';
const fs = require('node:fs');
const path = require('node:path');
const terms = JSON.parse(fs.readFileSync(path.join(__dirname, 'fe_terms.json'), 'utf8'));
if (!Array.isArray(terms)) throw new Error('用語データが配列ではありません。');
fs.writeFileSync(path.join(__dirname, 'fe_terms.js'), 'window.FE_TERMS = ' + JSON.stringify(terms, null, 2) + ';\n', 'utf8');
console.log(`fe_terms.js を生成しました（${terms.length}件）。`);
