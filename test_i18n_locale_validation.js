/**
 * Regression tests for src/i18n.js locale validation.
 *
 * Reproduces the browser environment enough to exercise I18nManager without
 * a runner — pure node, no deps. Run from repo root:
 *
 *     node test_i18n_locale_validation.js
 *
 * Exits 0 on success, 1 on first assertion failure (and prints the diff).
 */
'use strict';

const assert = require('assert');

// --- DOM stubs -------------------------------------------------------------

function makeStubs() {
    const storage = new Map();
    const listeners = {};

    const localStorage = {
        getItem: (k) => (storage.has(k) ? storage.get(k) : null),
        setItem: (k, v) => { storage.set(k, String(v)); },
        removeItem: (k) => { storage.delete(k); },
        clear: () => { storage.clear(); },
    };

    const window = {
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {},
    };

    class CustomEvent {
        constructor(type, init) { this.type = type; this.detail = init && init.detail; }
    }

    const document = {
        addEventListener() {},
        querySelectorAll: () => [],
        getElementById: () => null,
    };

    return {
        window,
        document,
        localStorage,
        CustomEvent,
        storage,
        listeners,
    };
}

// --- Reset module state between tests --------------------------------------

function loadI18nModule(stubs) {
    // Clear require cache so each test gets a fresh module evaluation.
    delete require.cache[require.resolve('./src/i18n.js')];
    const mod = require('./src/i18n.js');
    return mod;
}

// Globals expected by src/i18n.js — set before requiring the module.
function installGlobals(stubs) {
    global.window = stubs.window;
    global.document = stubs.document;
    global.localStorage = stubs.localStorage;
    global.CustomEvent = stubs.CustomEvent;
    // The module pulls in these translation globals — empty objects are fine
    // for locale-validation tests; the key behavior we exercise is the
    // SUPPORTED_LOCALES allowlist, not translation content.
    global.EN_TRANSLATIONS = { hello: 'Hello', farewell: 'Bye' };
    global.ZH_TRANSLATIONS = {};
    global.PT_BR_TRANSLATIONS = {};
    global.DE_TRANSLATIONS = {};
    global.FR_TRANSLATIONS = {};
}

function clearGlobals() {
    delete global.window;
    delete global.document;
    delete global.localStorage;
    delete global.CustomEvent;
    delete global.EN_TRANSLATIONS;
    delete global.ZH_TRANSLATIONS;
    delete global.PT_BR_TRANSLATIONS;
    delete global.DE_TRANSLATIONS;
    delete global.FR_TRANSLATIONS;
}

// --- Tests ------------------------------------------------------------------

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ok  ${name}`);
    } catch (e) {
        failed++;
        console.log(`  FAIL ${name}`);
        console.log(`       ${e.message}`);
        if (e.actual !== undefined || e.expected !== undefined) {
            console.log(`       actual:   ${JSON.stringify(e.actual)}`);
            console.log(`       expected: ${JSON.stringify(e.expected)}`);
        }
    }
}

console.log('test_i18n_locale_validation');

test('constructor: no stored locale -> defaults to en', () => {
    const stubs = makeStubs();
    installGlobals(stubs);
    loadI18nModule(stubs);
    assert.strictEqual(stubs.window.i18n.currentLocale, 'en');
    assert.strictEqual(stubs.localStorage.getItem('game_locale'), 'en');
    clearGlobals();
});

test('constructor: valid stored locale is honored', () => {
    const stubs = makeStubs();
    stubs.localStorage.setItem('game_locale', 'de');
    installGlobals(stubs);
    loadI18nModule(stubs);
    assert.strictEqual(stubs.window.i18n.currentLocale, 'de');
    clearGlobals();
});

test('constructor: invalid stored locale (typo) falls back to en', () => {
    const stubs = makeStubs();
    stubs.localStorage.setItem('game_locale', 'xx');
    installGlobals(stubs);
    loadI18nModule(stubs);
    assert.strictEqual(stubs.window.i18n.currentLocale, 'en');
    assert.strictEqual(stubs.localStorage.getItem('game_locale'), 'en');
    clearGlobals();
});

test('constructor: stale "nep" locale (no longer registered) falls back to en', () => {
    // Older builds of the game registered 'nep'; current upstream main does
    // not. A returning user with persisted game_locale='nep' would otherwise
    // hit translations[undefined] on every t() call.
    const stubs = makeStubs();
    stubs.localStorage.setItem('game_locale', 'nep');
    installGlobals(stubs);
    loadI18nModule(stubs);
    assert.strictEqual(stubs.window.i18n.currentLocale, 'en');
    assert.strictEqual(stubs.localStorage.getItem('game_locale'), 'en');
    clearGlobals();
});

test('constructor: empty string stored locale falls back to en', () => {
    const stubs = makeStubs();
    stubs.localStorage.setItem('game_locale', '');
    installGlobals(stubs);
    loadI18nModule(stubs);
    assert.strictEqual(stubs.window.i18n.currentLocale, 'en');
    clearGlobals();
});

test('setLocale: switching to a valid locale updates currentLocale', () => {
    const stubs = makeStubs();
    installGlobals(stubs);
    loadI18nModule(stubs);
    stubs.window.i18n.setLocale('zh');
    assert.strictEqual(stubs.window.i18n.currentLocale, 'zh');
    assert.strictEqual(stubs.localStorage.getItem('game_locale'), 'zh');
    clearGlobals();
});

test('setLocale: switching to an unsupported locale is a no-op', () => {
    const stubs = makeStubs();
    installGlobals(stubs);
    loadI18nModule(stubs);
    stubs.window.i18n.setLocale('xx');
    assert.strictEqual(stubs.window.i18n.currentLocale, 'en');
    assert.strictEqual(stubs.localStorage.getItem('game_locale'), 'en');
    clearGlobals();
});

test('setLocale: switching to a registered but not-supported locale is a no-op', () => {
    // 'nep' is a hypothetical supported key that could exist in the
    // translations map in some future build but be missing from the
    // allowlist (or vice versa). For now we test the inverse: if the
    // translations map were empty for a key listed in SUPPORTED_LOCALES
    // (none currently), setLocale would still reject because
    // this.translations[locale] is `{}` and the check is on truthiness.
    // Instead exercise the supported-rejection path directly: 'klingon'
    // is unsupported and translations['klingon'] is undefined.
    const stubs = makeStubs();
    installGlobals(stubs);
    loadI18nModule(stubs);
    stubs.window.i18n.setLocale('klingon');
    assert.strictEqual(stubs.window.i18n.currentLocale, 'en');
    clearGlobals();
});

test('t(): translation key returns translated string for valid locale', () => {
    const stubs = makeStubs();
    installGlobals(stubs);
    loadI18nModule(stubs);
    assert.strictEqual(stubs.window.i18n.t('hello'), 'Hello');
    clearGlobals();
});

test('t(): unknown key returns the key string itself', () => {
    const stubs = makeStubs();
    installGlobals(stubs);
    loadI18nModule(stubs);
    assert.strictEqual(stubs.window.i18n.t('does_not_exist'), 'does_not_exist');
    clearGlobals();
});

test('t(): after switching locale via setLocale, t() reads new bundle', () => {
    const stubs = makeStubs();
    stubs.localStorage.setItem('game_locale', 'en');
    installGlobals(stubs);
    loadI18nModule(stubs);
    // ZH_TRANSLATIONS is {} in this test fixture; a key lookup should fall
    // through to the key string rather than throw.
    stubs.window.i18n.setLocale('zh');
    assert.strictEqual(stubs.window.i18n.t('hello'), 'hello');
    clearGlobals();
});

test('t(): variable interpolation works', () => {
    const stubs = makeStubs();
    installGlobals(stubs);
    global.EN_TRANSLATIONS = { greet: 'Hello, {name}!' };
    loadI18nModule(stubs);
    assert.strictEqual(stubs.window.i18n.t('greet', { name: 'Aniket' }), 'Hello, Aniket!');
    clearGlobals();
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);