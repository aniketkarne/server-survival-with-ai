/**
 * Save / load serialization.
 *
 * Deliberately free of DOM and Three.js dependencies so a full
 * save -> load round trip can be exercised under plain Node
 * (see test_save_load.js).
 *
 * The payload is an explicit allow-list of the fields the loader actually
 * restores. The save file used to be built by spreading the whole STATE
 * object, which dragged the Three.js scene graph (internetNode.mesh,
 * internetNode.ring - about 2 KB of mesh metadata per save) and the live
 * Audio / AudioContext objects of the SoundService into the JSON.
 */

const SAVE_VERSION = "2.0";

const SAVE_DEFAULT_SCORE = {
    total: 0,
    storage: 0,
    database: 0,
    maliciousBlocked: 0,
};

const SAVE_DEFAULT_FAILURES = {
    STATIC: 0,
    READ: 0,
    WRITE: 0,
    UPLOAD: 0,
    SEARCH: 0,
    MALICIOUS: 0,
};

const SAVE_DEFAULT_TRAFFIC = {
    STATIC: 0.30,
    READ: 0.20,
    WRITE: 0.15,
    UPLOAD: 0.05,
    SEARCH: 0.10,
    MALICIOUS: 0.20,
};

const SAVE_TRAFFIC_TYPES = ["STATIC", "READ", "WRITE", "UPLOAD", "SEARCH"];

function saveNum(value, fallback = 0) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function savePlainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/**
 * A zeroed finance ledger. The per-service maps are keyed by every
 * service type the game knows about, so a service added to CONFIG.services
 * shows up in the breakdown without another edit here.
 */
function createFinances(serviceTypes) {
    const byService = {};
    const countByService = {};
    for (const type of serviceTypes || []) {
        byService[type] = 0;
        countByService[type] = 0;
    }

    const byType = {};
    const countByType = {};
    for (const type of SAVE_TRAFFIC_TYPES) {
        byType[type] = 0;
        countByType[type] = 0;
    }

    return {
        income: {
            byType,
            countByType,
            requests: 0,
            total: 0,
        },
        expenses: {
            services: 0,
            upkeep: 0,
            repairs: 0,
            autoRepair: 0,
            mitigation: 0,
            breach: 0,
            byService,
            countByService,
        },
    };
}

/**
 * Rebuild the finance ledger from a (possibly partial or missing) payload.
 *
 * Every bucket the UI reads is guaranteed to exist, so the panel never has
 * to null-check, and the per-service breakdown keeps every key present in
 * the save - including service types that were not in the original
 * seven-entry template (CDN, API Gateway, NoSQL).
 */
function normalizeFinances(saved) {
    const source = savePlainObject(saved);
    const income = savePlainObject(source.income);
    const expenses = savePlainObject(source.expenses);
    const incomeByType = savePlainObject(income.byType);
    const incomeCountByType = savePlainObject(income.countByType);
    const expenseByService = savePlainObject(expenses.byService);
    const expenseCountByService = savePlainObject(expenses.countByService);

    // The traffic types the ledger knows about, plus any type the save
    // carries that this build has never seen. An unknown type is kept
    // rather than dropped, so a save written by a newer build does not
    // lose income on the way back in.
    const byType = {};
    const countByType = {};
    for (const type of new Set([
        ...SAVE_TRAFFIC_TYPES,
        ...Object.keys(incomeByType),
    ])) {
        byType[type] = saveNum(incomeByType[type]);
    }
    for (const type of new Set([
        ...SAVE_TRAFFIC_TYPES,
        ...Object.keys(incomeCountByType),
    ])) {
        countByType[type] = saveNum(incomeCountByType[type]);
    }

    const byService = {};
    for (const key of Object.keys(expenseByService)) {
        byService[key] = saveNum(expenseByService[key]);
    }
    const countByService = {};
    for (const key of Object.keys(expenseCountByService)) {
        countByService[key] = saveNum(expenseCountByService[key]);
    }

    return {
        income: {
            byType,
            countByType,
            requests: saveNum(income.requests),
            total: saveNum(income.total),
        },
        expenses: {
            services: saveNum(expenses.services),
            upkeep: saveNum(expenses.upkeep),
            repairs: saveNum(expenses.repairs),
            autoRepair: saveNum(expenses.autoRepair),
            mitigation: saveNum(expenses.mitigation),
            breach: saveNum(expenses.breach),
            byService,
            countByService,
        },
    };
}

/**
 * Build the payload written to localStorage or downloaded as a save file.
 * Only state that is actually restored on load is included.
 */
function buildSavePayload(state) {
    const source = state || {};
    const services = source.services || [];
    const connections = source.connections || [];
    const internetNode = source.internetNode || {};

    return {
        version: SAVE_VERSION,
        timestamp: Date.now(),
        money: saveNum(source.money),
        reputation: saveNum(source.reputation, 100),
        requestsProcessed: saveNum(source.requestsProcessed),
        score: { ...SAVE_DEFAULT_SCORE, ...savePlainObject(source.score) },
        failures: { ...SAVE_DEFAULT_FAILURES, ...savePlainObject(source.failures) },
        finances: normalizeFinances(source.finances),
        trafficDistribution: {
            ...SAVE_DEFAULT_TRAFFIC,
            ...savePlainObject(source.trafficDistribution),
        },
        activeTool: source.activeTool || "select",
        selectedNodeId: source.selectedNodeId ?? null,
        spawnTimer: saveNum(source.spawnTimer),
        currentRPS: saveNum(source.currentRPS, 0.5),
        timeScale: saveNum(source.timeScale),
        elapsedGameTime: saveNum(source.elapsedGameTime),
        isRunning: source.isRunning === true,
        gameMode: source.gameMode || "survival",
        sandboxBudget: saveNum(source.sandboxBudget, 2000),
        upkeepEnabled: source.upkeepEnabled !== false,
        burstCount: saveNum(source.burstCount, 10),
        previousTimeScale: saveNum(source.previousTimeScale, 1),
        services: services.map((service) => ({
            id: service.id,
            type: service.type,
            position: [
                service.position.x,
                service.position.y,
                service.position.z,
            ],
            connections: [...(service.connections || [])],
            tier: service.tier,
            cacheHitRate: service.config?.cacheHitRate ?? null,
        })),
        connections: connections.map((connection) => ({
            from: connection.from,
            to: connection.to,
        })),
        internetConnections: [...(internetNode.connections || [])],
    };
}

/**
 * Apply a save payload to a state object.
 *
 * Missing fields fall back to the documented defaults. Explicit zeros are
 * preserved: a save taken at 0 reputation stays at 0 instead of quietly
 * turning into a fresh run.
 */
function restoreSaveState(state, saveData) {
    const target = state || {};
    const data = savePlainObject(saveData);

    target.money = saveNum(data.money);
    target.reputation = saveNum(data.reputation, 100);
    target.requestsProcessed = saveNum(data.requestsProcessed);
    target.score = { ...SAVE_DEFAULT_SCORE, ...savePlainObject(data.score) };
    target.failures = {
        ...SAVE_DEFAULT_FAILURES,
        ...savePlainObject(data.failures),
    };
    target.finances = normalizeFinances(data.finances);
    target.trafficDistribution = {
        ...SAVE_DEFAULT_TRAFFIC,
        ...savePlainObject(data.trafficDistribution),
    };
    target.activeTool = data.activeTool || "select";
    target.selectedNodeId = data.selectedNodeId ?? null;
    target.spawnTimer = saveNum(data.spawnTimer);
    target.currentRPS = saveNum(data.currentRPS, 0.5);
    target.timeScale = saveNum(data.timeScale);
    target.elapsedGameTime = saveNum(data.elapsedGameTime);
    target.isRunning = data.isRunning === true;
    target.gameMode = data.gameMode || "survival";
    target.sandboxBudget = saveNum(data.sandboxBudget, 2000);
    target.upkeepEnabled = data.upkeepEnabled !== false;
    target.burstCount = saveNum(data.burstCount, 10);
    target.previousTimeScale = saveNum(data.previousTimeScale, 1);
    // A loaded game always resumes from a started state.
    target.gameStarted = true;

    return target;
}
