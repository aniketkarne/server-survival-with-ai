# Changelog

All notable changes to Server Survival are documented here.

## [Unreleased]

### Fixed

- **`src/i18n.js`: locale allowlist enforcement.** `localStorage.getItem('game_locale')` was used as-is with no validation. If the persisted value did not match a registered translation bundle (typo, devtools edit, or a stale key like `'nep'` left over from an older build), the next `t()` call dereferenced `translations[undefined]` and threw `TypeError`, breaking every UI string. The constructor now validates the stored locale against `SUPPORTED_LOCALES` and rewrites it to `'en'` if invalid. `setLocale()` rejects unsupported locales with an early return.
- **`src/i18n.js`: removed debug `console.log` calls in `setLocale()`.** The leftover `console.log(locale); console.log(this.translations);` dumped the entire translations bundle to the browser console on every language switch.

### Added

- **`test_i18n_locale_validation.js`** — Node-only regression test (12 cases) covering the locale allowlist, persistence rewrite, `setLocale` rejection of unsupported values, and the translation/interpolation helpers.
- **`.github/workflows/tests.yml`** — CI job on `ubuntu-latest` Node 20 that runs `node test_i18n_locale_validation.js` on every push and PR to `main`.
- **`CONTRIBUTING.md`** — documents how to run the test suite and the three-step checklist for adding a new locale (locale file, script tag, allowlist entry).