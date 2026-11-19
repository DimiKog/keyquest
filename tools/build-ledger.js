// Builds ledger.html (single file) from tools/ledger.src.html + shared blocks of wordwallet.html
const fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
const ww = fs.readFileSync(path.join(root, 'wordwallet.html'), 'utf8');
const between = (a, b) => ww.slice(ww.indexOf(a) + a.length, ww.indexOf(b));
const style = ww.slice(ww.indexOf('<style>') + 7, ww.indexOf('</style>'));
const crypto = between('// ==CRYPTO==', '// ==END CRYPTO==');
const core = between('// ==CORE==', '// ==END CORE==');
const words = ww.split('\n').filter(l => /^const (WORDS|WIDX) = /.test(l)).join('\n');
let out = fs.readFileSync(path.join(__dirname, 'ledger.src.html'), 'utf8');
for (const [k, v] of Object.entries({ '/*STYLE*/': style, '/*CRYPTO*/': crypto, '/*CORE*/': core, '/*WORDS*/': words })) out = out.replace(k, () => v);
fs.writeFileSync(path.join(root, 'ledger.html'), out);
console.log('ledger.html', out.length, 'bytes');
