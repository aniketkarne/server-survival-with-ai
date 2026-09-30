// Smoke test: scoring and reputation are added exactly once per event.
//
// Run: node test_scoring_reputation.js
//
// Loads game.js as text, slices out the body of `function updateScore`, and
// evaluates it inside a sandbox where CONFIG / STATE / TRAFFIC_TYPES are
// supplied by us. Then we drive synthetic MALICIOUS_BLOCKED and
// MALICIOUS_PASSED events and assert the counters move by exactly one
// multiple of the configured point value — no more (would mean a duplicate-
// add / duplicate-deduct bug), no less.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname);
const gameSrc = fs.readFileSync(path.join(repoRoot, "game.js"), "utf8");
const configSrc = fs.readFileSync(path.join(repoRoot, "src/config.js"), "utf8");

// Slice the function body out of game.js. The function lives in the range
// lines 1299-1377 of game.js.
const startMarker = "function updateScore(req, outcome) {";
const start = gameSrc.indexOf(startMarker);
if (start === -1) {
  console.error("FAIL: could not find updateScore in game.js");
  process.exit(1);
}

// Walk forward and count braces to locate the matching close.
let depth = 0;
let end = -1;
let inString = null;
let escape = false;
for (let i = start; i < gameSrc.length; i++) {
  const c = gameSrc[i];
  if (inString) {
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === inString) inString = null;
    continue;
  }
  if (c === "'" || c === '"' || c === "`") { inString = c; continue; }
  if (c === "/" && gameSrc[i + 1] === "/") {
    const nl = gameSrc.indexOf("\n", i);
    i = nl === -1 ? gameSrc.length : nl;
    continue;
  }
  if (c === "/" && gameSrc[i + 1] === "*") {
    const close = gameSrc.indexOf("*/", i);
    i = close === -1 ? gameSrc.length : close + 1;
    continue;
  }
  if (c === "{") depth++;
  else if (c === "}") {
    depth--;
    if (depth === 0) { end = i + 1; break; }
  }
}
if (end === -1) {
  console.error("FAIL: could not find end of updateScore");
  process.exit(1);
}
const fnSrc = gameSrc.slice(start, end);

// Replace updateScoreUI() call with a guard so we don't try to call a
// function that depends on the full DOM.
const fnWrapped = fnSrc.replace(
  "updateScoreUI();",
  "if (typeof updateScoreUI === 'function') updateScoreUI();"
);

// Load CONFIG/TRAFFIC_TYPES from src/config.js. config.js uses `const`, so
// we append a line that copies them onto `this.*` after the script runs.
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  configSrc + "\n;this.CONFIG = CONFIG; this.TRAFFIC_TYPES = TRAFFIC_TYPES;",
  sandbox,
  { filename: "src/config.js" }
);
if (!sandbox.CONFIG) {
  console.error("FAIL: src/config.js did not expose CONFIG");
  process.exit(1);
}

const points = sandbox.CONFIG.survival.SCORE_POINTS;
console.log("SCORE_POINTS:", JSON.stringify(points));

// Stateful sandbox for updateScore.
const stateSandbox = {
  CONFIG: sandbox.CONFIG,
  TRAFFIC_TYPES: sandbox.TRAFFIC_TYPES,
  console: { ...console, warn: () => {}, log: () => {}, info: () => {}, error: console.error },
};
vm.createContext(stateSandbox);
vm.runInContext(
  "var STATE = {};" +
  "var updateScoreUI = function() {};" +
  fnWrapped,
  stateSandbox,
  { filename: "extracted-updateScore.js" }
);

if (typeof stateSandbox.updateScore !== "function") {
  console.error("FAIL: extracted updateScore is not a function");
  process.exit(1);
}

function freshState() {
  return {
    score: { total: 0, maliciousBlocked: 0, storage: 0, database: 0 },
    reputation: 0,
    failures: { STATIC: 0, READ: 0, WRITE: 0, UPLOAD: 0, SEARCH: 0, MALICIOUS: 0 },
    money: 0,
    finances: {
      expenses: {},
      income: {
        requests: 0,
        total: 0,
        byType: {},
        countByType: {},
      },
    },
    sound: { playFraudBlocked: () => {} },
  };
}

const fakeReq = {
  type: "MALICIOUS",
  typeConfig: sandbox.CONFIG.trafficTypes.MALICIOUS,
};

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("PASS:", msg);
}

// --- Case 1: MALICIOUS_BLOCKED should add points once ---
stateSandbox.STATE = freshState();
stateSandbox.updateScore(fakeReq, "MALICIOUS_BLOCKED");
assert(
  stateSandbox.STATE.score.total === points.MALICIOUS_BLOCKED_SCORE,
  `MALICIOUS_BLOCKED: STATE.score.total expected ${points.MALICIOUS_BLOCKED_SCORE}, got ${stateSandbox.STATE.score.total} (would be ${points.MALICIOUS_BLOCKED_SCORE * 2} if the duplicate-add bug is present)`
);
assert(
  stateSandbox.STATE.score.maliciousBlocked === points.MALICIOUS_BLOCKED_SCORE,
  `MALICIOUS_BLOCKED: STATE.score.maliciousBlocked expected ${points.MALICIOUS_BLOCKED_SCORE}, got ${stateSandbox.STATE.score.maliciousBlocked}`
);

// --- Case 2: MALICIOUS_PASSED should subtract reputation once ---
stateSandbox.STATE = freshState();
stateSandbox.updateScore(fakeReq, "MALICIOUS_PASSED");
assert(
  stateSandbox.STATE.reputation === points.MALICIOUS_PASSED_REPUTATION,
  `MALICIOUS_PASSED: STATE.reputation expected ${points.MALICIOUS_PASSED_REPUTATION}, got ${stateSandbox.STATE.reputation} (would be ${points.MALICIOUS_PASSED_REPUTATION * 2} if the duplicate-deduct bug is present)`
);

// --- Case 3: drive 50 successful blocks, score moves exactly 50*points ---
stateSandbox.STATE = freshState();
for (let i = 0; i < 50; i++) stateSandbox.updateScore(fakeReq, "MALICIOUS_BLOCKED");
assert(
  stateSandbox.STATE.score.total === 50 * points.MALICIOUS_BLOCKED_SCORE,
  `50 MALICIOUS_BLOCKED events: STATE.score.total expected ${50 * points.MALICIOUS_BLOCKED_SCORE}, got ${stateSandbox.STATE.score.total}`
);
assert(
  stateSandbox.STATE.score.maliciousBlocked === 50 * points.MALICIOUS_BLOCKED_SCORE,
  `50 MALICIOUS_BLOCKED events: STATE.score.maliciousBlocked expected ${50 * points.MALICIOUS_BLOCKED_SCORE}, got ${stateSandbox.STATE.score.maliciousBlocked}`
);

// --- Case 4: drive 50 successful breaches, reputation moves exactly 50*points ---
stateSandbox.STATE = freshState();
for (let i = 0; i < 50; i++) stateSandbox.updateScore(fakeReq, "MALICIOUS_PASSED");
assert(
  stateSandbox.STATE.reputation === 50 * points.MALICIOUS_PASSED_REPUTATION,
  `50 MALICIOUS_PASSED events: STATE.reputation expected ${50 * points.MALICIOUS_PASSED_REPUTATION}, got ${stateSandbox.STATE.reputation}`
);

// --- Case 5: COMPLETED for a STATIC request — non-malicious baseline still works ---
stateSandbox.STATE = freshState();
const staticReq = { type: "STATIC", typeConfig: sandbox.CONFIG.trafficTypes.STATIC };
stateSandbox.updateScore(staticReq, "COMPLETED");
assert(
  stateSandbox.STATE.score.total === staticReq.typeConfig.score,
  `STATIC COMPLETED: STATE.score.total expected ${staticReq.typeConfig.score}, got ${stateSandbox.STATE.score.total}`
);
assert(
  stateSandbox.STATE.money === staticReq.typeConfig.reward,
  `STATIC COMPLETED: STATE.money expected ${staticReq.typeConfig.reward}, got ${stateSandbox.STATE.money}`
);

console.log("\nAll scoring/reputation invariants hold.");