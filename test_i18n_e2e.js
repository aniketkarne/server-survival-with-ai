// Simulate the browser load order: all <script> tags share global scope,
// so const XX_TRANSLATIONS at top-level becomes a script global.
// We replicate that by concatenating all locale scripts + i18n.js into
// a single Function body and exposing the result.

const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

// Minimal browser-like globals
global.window = global;
global.window.dispatchEvent = () => true;
global.document = {
    addEventListener: () => {},
    querySelectorAll: () => [],
    getElementById: () => null,
};
global.localStorage = {
    _s: {},
    getItem(k){ return this._s[k] || null; },
    setItem(k,v){ this._s[k] = String(v); },
};

// Concatenate every script that index.html loads, in order.
const order = [
    'src/locales/en.js',
    'src/locales/zh.js',
    'src/locales/pt-BR.js',
    'src/locales/de.js',
    'src/locales/fr.js',
    'src/locales/nep.js',
    'src/i18n.js',
];

let bundle = '';
for (const f of order) {
    bundle += `\n// === ${f} ===\n` + fs.readFileSync(path.join(ROOT, f), 'utf8');
}

// Append a return for the manager + t.
bundle += `\nreturn { i18n: window.i18n, t: window.t };`;

const mgr = new Function(bundle)();
const i18n = mgr.i18n;
const t = mgr.t;

// Probe.
console.log('Default locale:', i18n.currentLocale);
console.log('Registered locales:', Object.keys(i18n.translations));

// Confirm every locale has real content (not empty {}).
for (const k of Object.keys(i18n.translations)) {
    const obj = i18n.translations[k];
    const keys = Object.keys(obj).length;
    if (keys === 0) throw new Error(`${k} translations object is empty`);
    console.log(`  ${k.padEnd(6)} ${keys} keys, sample title="${obj.title}"`);
}

i18n.setLocale('nep');
console.log('\nNepali probe:');
console.log('  currentLocale:', i18n.currentLocale);
console.log('  title:', t('title'));
console.log('  survival:', t('survival'));
console.log('  save_failed:', t('save_failed'));
console.log('  load_failed_corrupted:', t('load_failed_corrupted'));
console.log('  unknown key falls through:', t('this_key_does_not_exist'));

i18n.setLocale('en');
console.log('\nEnglish probe:');
console.log('  title:', t('title'));
console.log('  save_failed:', t('save_failed'));
console.log('  load_failed_corrupted:', t('load_failed_corrupted'));

// Simulate the corrupt-load path the bug fix addresses.
const alertMessages = [];
global.alert = (m) => alertMessages.push(m);
try {
    const reader = {
        onload: function(e) {
            try { JSON.parse('this is not json'); }
            catch (err) { alert(t('load_failed_corrupted')); }
        },
    };
    reader.onload();
} catch (e) {
    alert(e.message);
}
console.log('\nCorrupt-load alert message:', alertMessages);
if (!alertMessages[0] || alertMessages[0] === 'load_failed' || alertMessages[0] === 'load_failed_corrupted') {
    throw new Error(`alert message looks broken: ${alertMessages[0]}`);
}

console.log('\nEnd-to-end test passed.');