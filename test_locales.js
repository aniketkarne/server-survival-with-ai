// Smoke test: each locale file declares its global *-TRANSLATIONS object.
// We use eval-in-context rather than require() because the files are plain
// `<script>` style: `const XX_TRANSLATIONS = {...}`.

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

function loadInContext(file, expectedGlobal) {
    const code = fs.readFileSync(file, 'utf8');
    // Make the global accessible
    const wrapper = `${code}\nreturn typeof ${expectedGlobal} !== 'undefined' ? ${expectedGlobal} : null;`;
    const fn = new Function(wrapper);
    return fn();
}

const expected = {
    'en': 'EN_TRANSLATIONS',
    'zh': 'ZH_TRANSLATIONS',
    'pt-BR': 'PT_BR_TRANSLATIONS',
    'de': 'DE_TRANSLATIONS',
    'fr': 'FR_TRANSLATIONS',
    'nep': 'NE_TRANSLATIONS',
};

for (const [code, globalName] of Object.entries(expected)) {
    const obj = loadInContext(path.join(ROOT, 'src', 'locales', `${code}.js`), globalName);
    if (!obj) throw new Error(`${code}: ${globalName} not defined`);
    if (!obj.title) throw new Error(`${code}: missing 'title'`);
    if (!obj.save_failed) throw new Error(`${code}: missing 'save_failed'`);
    if (!obj.load_failed_corrupted) throw new Error(`${code}: missing 'load_failed_corrupted'`);
    console.log(`${code.padEnd(5)} ✓ title="${obj.title}" save_failed="${obj.save_failed}"`);
}

// Now simulate i18n.js registration logic: every locale must be wired up.
const i18nCode = fs.readFileSync(path.join(ROOT, 'src/i18n.js'), 'utf8');
if (!i18nCode.match(/nep:\s*typeof\s+NE_TRANSLATIONS/)) {
    throw new Error('i18n.js does not register nep locale');
}
console.log('i18n.js ✓ registers nep locale');

// Check index.html has the script tag and the <option>.
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
if (!html.match(/<script src="src\/locales\/nep\.js">/)) {
    throw new Error('index.html does not load src/locales/nep.js');
}
if (!html.match(/<option value="nep"/)) {
    throw new Error('index.html does not list nep in language selector');
}
console.log('index.html ✓ loads nep.js and lists nep in lang-select');

// Check duplicate load-btn gone.
const loadBtnMatches = (html.match(/id="load-btn"/g) || []).length;
const downloadBtnMatches = (html.match(/id="download-btn"/g) || []).length;
if (loadBtnMatches !== 1) throw new Error(`duplicate id="load-btn" count = ${loadBtnMatches} (expected 1)`);
if (downloadBtnMatches !== 1) throw new Error(`id="download-btn" count = ${downloadBtnMatches} (expected 1)`);
console.log(`index.html ✓ unique ids: load-btn(${loadBtnMatches}) download-btn(${downloadBtnMatches})`);

// Check game.js uses load_failed_corrupted, not load_failed.
const game = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
const badRefs = (game.match(/i18n\.t\(['"]load_failed['"]\)/g) || []).length;
const goodRefs = (game.match(/i18n\.t\(['"]load_failed_corrupted['"]\)/g) || []).length;
if (badRefs !== 0) throw new Error(`game.js still uses i18n.t('load_failed') ${badRefs} time(s)`);
if (goodRefs < 1) throw new Error(`expected >=1 'load_failed_corrupted' references, got ${goodRefs}`);
console.log(`game.js ✓ uses load_failed_corrupted (${goodRefs}x), no broken load_failed`);

console.log('\nAll audit fixes verified.');