// Regression test for the save / load round trip.
//
// Run: node test_save_load.js
//
// src/save.js is plain JavaScript with no DOM or Three.js dependencies, so
// it is loaded into a vm context and driven directly. The cases below cover
// the three ways the old inline save/load code in game.js went wrong:
//
//   1. `loadGameState` never applied the saved finances ledger or the saved
//      failure counters, even though both were written into the save file.
//   2. `||` fallbacks replaced legitimately-zero values with their defaults
//      (reputation 0 -> 100, sandbox RPS 0 -> 0.5, budget 0 -> 2000), and
//      `{ ...saveData.score } || { defaults }` never reached its fallback
//      because spreading undefined yields a truthy {}.
//   3. The payload was built by spreading the whole STATE object, which
//      dragged the Three.js scene graph and the live Audio objects of the
//      SoundService into the save file.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname);
const saveSrc = fs.readFileSync(path.join(repoRoot, "src/save.js"), "utf8");

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  saveSrc +
    "\n;this.buildSavePayload = buildSavePayload;" +
    "this.restoreSaveState = restoreSaveState;" +
    "this.createFinances = createFinances;",
  sandbox,
  { filename: "src/save.js" }
);

const { buildSavePayload, restoreSaveState, createFinances } = sandbox;

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

function eq(name, actual, expected) {
  check(
    name,
    JSON.stringify(actual) === JSON.stringify(expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

// A state object shaped like the live STATE, with the values a mid-game
// save would carry.
function makeState() {
  return {
    money: 1234.56,
    reputation: 87.5,
    requestsProcessed: 42,
    score: { total: 310, storage: 90, database: 200, maliciousBlocked: 20 },
    failures: { STATIC: 1, READ: 2, WRITE: 3, UPLOAD: 4, SEARCH: 5, MALICIOUS: 6 },
    finances: createFinances(["waf", "alb", "compute", "db", "s3", "cdn", "cache", "sqs", "apigw", "nosql"]),
    trafficDistribution: {
      STATIC: 0.3,
      READ: 0.2,
      WRITE: 0.15,
      UPLOAD: 0.05,
      SEARCH: 0.1,
      MALICIOUS: 0.2,
    },
    activeTool: "waf",
    selectedNodeId: "svc_abc",
    spawnTimer: 3.25,
    currentRPS: 4.5,
    timeScale: 1,
    elapsedGameTime: 120.75,
    isRunning: true,
    gameMode: "survival",
    sandboxBudget: 2000,
    upkeepEnabled: true,
    burstCount: 10,
    previousTimeScale: 3,
    services: [
      {
        id: "svc_abc",
        type: "waf",
        position: { x: -30, y: 0, z: 10 },
        connections: ["svc_def"],
        tier: 2,
        config: { cacheHitRate: 0.95 },
      },
    ],
    connections: [{ from: "svc_abc", to: "svc_def" }],
    internetNode: { connections: ["svc_abc"], position: { x: -40, y: 0, z: 0 } },
  };
}

console.log("save/load round trip");

// ---------------------------------------------------------------------------
// 1. A full round trip restores every persisted field.
// ---------------------------------------------------------------------------
{
  const state = makeState();
  state.finances.income.total = 900;
  state.finances.income.byType.READ = 120;
  state.finances.income.countByType.READ = 3;
  state.finances.expenses.services = 250;
  state.finances.expenses.upkeep = 33.5;
  state.finances.expenses.byService.cdn = 60;
  state.finances.expenses.countByService.cdn = 1;

  const payload = buildSavePayload(state);
  const restored = restoreSaveState({}, JSON.parse(JSON.stringify(payload)));

  eq("money restored", restored.money, 1234.56);
  eq("reputation restored", restored.reputation, 87.5);
  eq("requestsProcessed restored", restored.requestsProcessed, 42);
  eq("score restored", restored.score, state.score);
  eq("failures restored", restored.failures, state.failures);
  eq("traffic distribution restored", restored.trafficDistribution, state.trafficDistribution);
  eq("activeTool restored", restored.activeTool, "waf");
  eq("selectedNodeId restored", restored.selectedNodeId, "svc_abc");
  eq("currentRPS restored", restored.currentRPS, 4.5);
  eq("elapsedGameTime restored", restored.elapsedGameTime, 120.75);
  eq("gameMode restored", restored.gameMode, "survival");
  eq("sandboxBudget restored", restored.sandboxBudget, 2000);
  eq("upkeepEnabled restored", restored.upkeepEnabled, true);
  eq("burstCount restored", restored.burstCount, 10);

  eq("income total restored", restored.finances.income.total, 900);
  eq("income byType restored", restored.finances.income.byType.READ, 120);
  eq("income countByType restored", restored.finances.income.countByType.READ, 3);
  eq("expense services restored", restored.finances.expenses.services, 250);
  eq("expense upkeep restored", restored.finances.expenses.upkeep, 33.5);
  eq("expense byService restored", restored.finances.expenses.byService.cdn, 60);
  eq("expense countByService restored", restored.finances.expenses.countByService.cdn, 1);
}

// ---------------------------------------------------------------------------
// 2. The service / connection topology survives the round trip.
// ---------------------------------------------------------------------------
{
  const payload = buildSavePayload(makeState());
  eq("service count", payload.services.length, 1);
  eq("service id", payload.services[0].id, "svc_abc");
  eq("service type", payload.services[0].type, "waf");
  eq("service position", payload.services[0].position, [-30, 0, 10]);
  eq("service connections", payload.services[0].connections, ["svc_def"]);
  eq("service tier", payload.services[0].tier, 2);
  eq("service cacheHitRate", payload.services[0].cacheHitRate, 0.95);
  eq("connections restored", payload.connections, [{ from: "svc_abc", to: "svc_def" }]);
  eq("internetConnections restored", payload.internetConnections, ["svc_abc"]);
}

// ---------------------------------------------------------------------------
// 3. Zero is a value, not a missing field. The old `||` fallbacks turned
//    these into their defaults.
// ---------------------------------------------------------------------------
{
  const state = makeState();
  state.reputation = 0;
  state.currentRPS = 0;
  state.sandboxBudget = 0;
  state.money = 0;
  state.requestsProcessed = 0;
  state.burstCount = 0;

  const restored = restoreSaveState({}, buildSavePayload(state));

  eq("reputation 0 stays 0", restored.reputation, 0);
  eq("currentRPS 0 stays 0", restored.currentRPS, 0);
  eq("sandboxBudget 0 stays 0", restored.sandboxBudget, 0);
  eq("money 0 stays 0", restored.money, 0);
  eq("requestsProcessed 0 stays 0", restored.requestsProcessed, 0);
  eq("burstCount 0 stays 0", restored.burstCount, 0);
}

// ---------------------------------------------------------------------------
// 4. A save missing fields falls back to the defaults -- and the defaults
//    are complete. The old `{ ...saveData.score } || { defaults }` never
//    reached its fallback, leaving score.total undefined and the HUD
//    rendering the literal string "undefined".
// ---------------------------------------------------------------------------
{
  const restored = restoreSaveState({}, {});

  eq("missing reputation defaults to 100", restored.reputation, 100);
  eq("missing currentRPS defaults to 0.5", restored.currentRPS, 0.5);
  eq("missing sandboxBudget defaults to 2000", restored.sandboxBudget, 2000);
  eq("missing gameMode defaults to survival", restored.gameMode, "survival");

  check(
    "missing score has a numeric total",
    typeof restored.score.total === "number" && restored.score.total === 0,
    `score.total is ${restored.score.total}`
  );
  eq("missing score keeps every field", Object.keys(restored.score).sort(), [
    "database",
    "maliciousBlocked",
    "storage",
    "total",
  ]);

  check(
    "missing trafficDistribution is complete",
    Object.keys(restored.trafficDistribution).length === 6 &&
      restored.trafficDistribution.STATIC === 0.3,
    JSON.stringify(restored.trafficDistribution)
  );

  check(
    "missing failures has every counter",
    Object.keys(restored.failures).length === 6,
    JSON.stringify(restored.failures)
  );

  check(
    "missing finances is a complete ledger",
    typeof restored.finances.income.total === "number" &&
      typeof restored.finances.expenses.services === "number" &&
      typeof restored.finances.expenses.byService === "object",
    JSON.stringify(restored.finances)
  );
}

// ---------------------------------------------------------------------------
// 5. The payload carries the game state and nothing else. The old payload
//    was `{ ...STATE }`, which pulled in the Three.js scene graph
//    (internetNode.mesh / internetNode.ring, ~2 KB of mesh metadata) and
//    the SoundService's live Audio and AudioContext objects.
// ---------------------------------------------------------------------------
{
  const state = makeState();
  state.sound = {
    ctx: { state: "running", sampleRate: 48000 },
    masterGain: { gain: { value: 0.3 } },
    gameBgm: { src: "assets/sounds/game-background.mp3", loop: true },
  };
  state.internetNode.mesh = { geometry: { attributes: { position: { count: 9999 } } } };
  state.internetNode.ring = { geometry: { attributes: { position: { count: 9999 } } } };
  state.animationId = 42;
  state.lastTime = 123456;
  state.gameStartTime = 123000;

  const payload = buildSavePayload(state);

  check("payload has no sound object", payload.sound === undefined);
  check("payload has no scene graph", payload.internetNode === undefined);
  check("payload has no animation id", payload.animationId === undefined);
  check("payload has no rAF timestamp", payload.lastTime === undefined);
  check("payload has no wall clock start", payload.gameStartTime === undefined);

  // The payload must survive a JSON round trip -- no cycles, no functions.
  let reparsed = null;
  try {
    reparsed = JSON.parse(JSON.stringify(payload));
  } catch (err) {
    reparsed = null;
    check("payload is JSON serialisable", false, err.message);
  }
  check("payload is JSON serialisable", reparsed !== null);

  // And it must be materially smaller than the old `...STATE` payload.
  const oldStyle = {
    ...state,
    score: { ...state.score },
    trafficDistribution: { ...state.trafficDistribution },
    services: [],
    connections: [],
    requests: [],
    internetConnections: [...state.internetNode.connections],
  };
  const oldBytes = JSON.stringify(oldStyle).length;
  const newBytes = JSON.stringify(payload).length;
  check(
    "payload is smaller than the old `...STATE` payload",
    newBytes < oldBytes,
    `old ${oldBytes} bytes vs new ${newBytes} bytes`
  );
}

// ---------------------------------------------------------------------------
// 6. The finance ledger covers every service type the game knows about,
//    so CDN / API Gateway / NoSQL spend is not silently dropped.
// ---------------------------------------------------------------------------
{
  const finances = createFinances(["waf", "cdn", "apigw", "nosql"]);
  eq("ledger tracks every service type", Object.keys(finances.expenses.byService).sort(), [
    "apigw",
    "cdn",
    "nosql",
    "waf",
  ]);
  eq("ledger counts every service type", Object.keys(finances.expenses.countByService).sort(), [
    "apigw",
    "cdn",
    "nosql",
    "waf",
  ]);
}

// ---------------------------------------------------------------------------
// 7. Restoring a ledger that carries service types the loader has never
//    seen keeps them, rather than dropping the spend.
// ---------------------------------------------------------------------------
{
  const state = makeState();
  state.finances.expenses.byService.nosql = 80;
  state.finances.expenses.countByService.nosql = 1;

  const restored = restoreSaveState({}, buildSavePayload(state));
  eq("unknown service type survives restore", restored.finances.expenses.byService.nosql, 80);
  eq("unknown service count survives restore", restored.finances.expenses.countByService.nosql, 1);
}

// ---------------------------------------------------------------------------
// 8. A traffic type the loader has never seen survives the round trip too.
//    A save written by a newer build must not lose the income it recorded.
// ---------------------------------------------------------------------------
{
  const state = makeState();
  state.finances.income.byType.QUIC = 25;
  state.finances.income.countByType.QUIC = 4;

  const restored = restoreSaveState({}, buildSavePayload(state));
  eq("unknown traffic type survives restore", restored.finances.income.byType.QUIC, 25);
  eq("unknown traffic count survives restore", restored.finances.income.countByType.QUIC, 4);
}

// ---------------------------------------------------------------------------
// 9. Every traffic bucket the finance panel reads is present and numeric,
//    so no row in the income breakdown renders as "undefined".
// ---------------------------------------------------------------------------
{
  const restored = restoreSaveState({}, {});
  const byType = restored.finances.income.byType;
  const countByType = restored.finances.income.countByType;

  for (const type of ["STATIC", "READ", "WRITE", "UPLOAD", "SEARCH"]) {
    eq(`income byType.${type} is a number`, typeof byType[type], "number");
    eq(`income countByType.${type} is a number`, typeof countByType[type], "number");
  }
}

// ---------------------------------------------------------------------------
// 10. Backwards compatibility: a save written by the previous build (which
//     spread the whole STATE object, so it carried `failures` and `finances`
//     at the top level) still restores its ledger and counters. The old
//     loader ignored both even though they were in the file.
// ---------------------------------------------------------------------------
{
  const legacySave = {
    timestamp: 1700000000000,
    version: "2.0",
    money: 777.25,
    reputation: 63,
    requestsProcessed: 17,
    score: { total: 240, storage: 60, database: 150, maliciousBlocked: 30 },
    failures: { STATIC: 2, READ: 3, WRITE: 4, UPLOAD: 5, SEARCH: 6, MALICIOUS: 7 },
    finances: {
      income: {
        byType: { STATIC: 10, READ: 20, WRITE: 30, UPLOAD: 40, SEARCH: 50 },
        countByType: { STATIC: 1, READ: 2, WRITE: 3, UPLOAD: 4, SEARCH: 5 },
        requests: 15,
        total: 150,
      },
      expenses: {
        services: 400,
        upkeep: 25,
        repairs: 5,
        autoRepair: 0,
        mitigation: 3,
        breach: 0,
        byService: { waf: 40, alb: 50, compute: 60, db: 150, s3: 25, cache: 60, sqs: 45 },
        countByService: { waf: 1, alb: 1, compute: 1, db: 1, s3: 1, cache: 1, sqs: 1 },
      },
    },
    trafficDistribution: {
      STATIC: 0.3, READ: 0.2, WRITE: 0.15, UPLOAD: 0.05, SEARCH: 0.1, MALICIOUS: 0.2,
    },
    services: [],
    connections: [],
    requests: [],
    internetConnections: [],
  };

  const restored = restoreSaveState({}, legacySave);

  eq("legacy money restored", restored.money, 777.25);
  eq("legacy reputation restored", restored.reputation, 63);
  eq("legacy failures restored", restored.failures, legacySave.failures);
  eq("legacy income total restored", restored.finances.income.total, 150);
  eq("legacy expense services restored", restored.finances.expenses.services, 400);
  eq("legacy expense byService restored", restored.finances.expenses.byService.db, 150);
  eq("legacy mitigation restored", restored.finances.expenses.mitigation, 3);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
