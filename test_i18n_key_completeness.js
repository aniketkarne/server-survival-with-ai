// Audit: which i18n keys are referenced from code vs. present in each locale.
//
// Run: node test_i18n_key_completeness.js
//
// For each src/locales/*.js file, list the keys game.js / src/tutorial.js /
// index.html reference via i18n.t('foo') that the file does not define.
// That's the same root cause the previous PR #1 fixed for `load_failed` —
// a referenced key with no translation falls through to the literal key
// string. The fix is to backfill the missing key with a translated value
// in every locale.

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname);

// Step 1: collect every i18n.t('foo') reference in the codebase.
const refRegex = /i18n\.t\(\s*['"]([^'"]+)['"]\s*\)/g;
const referencedKeys = new Set();

function scan(p) {
  const full = path.join(repoRoot, p);
  if (!fs.existsSync(full)) return;
  const src = fs.readFileSync(full, "utf8");
  let m;
  while ((m = refRegex.exec(src)) !== null) referencedKeys.add(m[1]);
}

scan("game.js");
scan("src/tutorial.js");
scan("index.html");
scan("src/i18n.js");

const refArr = [...referencedKeys].sort();
console.log(`Referenced keys (${refArr.length} unique):`);
for (const k of refArr) console.log("  " + k);

// Step 2: parse each locale and collect its key set.
const keyRegex = /^\s*"([^"]+)"\s*:/gm;

function localeKeys(p) {
  const full = path.join(repoRoot, p);
  if (!fs.existsSync(full)) return new Set();
  const src = fs.readFileSync(full, "utf8");
  const out = new Set();
  let m;
  while ((m = keyRegex.exec(src)) !== null) out.add(m[1]);
  return out;
}

// Step 3: per-locale missing keys.
const localeFiles = fs
  .readdirSync(path.join(repoRoot, "src/locales"))
  .filter((n) => n.endsWith(".js"));

let totalMissing = 0;
console.log("\nPer-locale missing keys:");
for (const f of localeFiles) {
  const defined = localeKeys(path.join("src/locales", f));
  const missing = refArr.filter((k) => !defined.has(k));
  totalMissing += missing.length;
  if (missing.length === 0) {
    console.log(`  src/locales/${f}: 100% (${defined.size} keys)`);
  } else {
    console.log(`  src/locales/${f}: MISSING ${missing.length} key(s):`);
    for (const k of missing) console.log(`    - ${k}`);
  }
}

console.log(`\nTotal missing across all locales: ${totalMissing}`);

if (totalMissing > 0) process.exit(1);