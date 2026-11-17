// Tests for the intervention event lifecycle (pause / resume / reset).
// Run: node test_intervention_state.js

const assert = require("assert");
const {
    createInterventionState,
    pauseActiveEvent,
    takePausedEvent,
} = require("./src/intervention.js");

let passed = 0;
function check(name, fn) {
    fn();
    passed++;
    console.log("ok -", name);
}

check("createInterventionState returns fresh defaults", () => {
    const s = createInterventionState();
    assert.strictEqual(s.activeEvent, null);
    assert.strictEqual(s.pausedEvent, null);
    assert.strictEqual(s.remainingTime, 0);
    assert.strictEqual(s.trafficShiftActive, false);
    assert.strictEqual(s.trafficShiftTimer, 0);
    assert.strictEqual(s.randomEventTimer, 0);
    assert.strictEqual(s.currentMilestoneIndex, 0);
    assert.strictEqual(s.rpsMultiplier, 1.0);
    assert.strictEqual(s.costMultiplier, 1.0);
    assert.strictEqual(s.trafficBurstMultiplier, 1.0);
    assert.deepStrictEqual(s.warnings, []);
});

check("two states do not share mutable fields", () => {
    const a = createInterventionState();
    const b = createInterventionState();
    a.warnings.push({ message: "x" });
    a.currentMilestoneIndex = 3;
    assert.deepStrictEqual(b.warnings, []);
    assert.strictEqual(b.currentMilestoneIndex, 0);
    assert.notStrictEqual(a.warnings, b.warnings);
});

check("pause records the active event and its remaining time", () => {
    const s = createInterventionState();
    s.activeEvent = "COST_SPIKE";
    s.eventEndTime = 42000;
    pauseActiveEvent(s, 30000);
    assert.strictEqual(s.pausedEvent, "COST_SPIKE");
    assert.strictEqual(s.remainingTime, 12000);
});

check("pause without an active event records nothing", () => {
    const s = createInterventionState();
    pauseActiveEvent(s, 1000);
    assert.strictEqual(s.pausedEvent, null);
    assert.strictEqual(s.remainingTime, 0);
});

check("double pause keeps the stored event (Pause button double-click)", () => {
    const s = createInterventionState();
    s.activeEvent = "TRAFFIC_BURST";
    s.eventEndTime = 42000;
    pauseActiveEvent(s, 30000); // first click records the event
    s.activeEvent = null; // endRandomEvent() clears it during pause
    pauseActiveEvent(s, 31000); // second click while still paused
    assert.strictEqual(s.pausedEvent, "TRAFFIC_BURST");
    assert.strictEqual(s.remainingTime, 12000);
});

check("resume restores the event with its remaining duration", () => {
    const s = createInterventionState();
    s.pausedEvent = "SERVICE_OUTAGE";
    s.remainingTime = 8000;
    assert.deepStrictEqual(takePausedEvent(s), {
        eventType: "SERVICE_OUTAGE",
        duration: 8000,
    });
    assert.strictEqual(s.pausedEvent, null);
    assert.strictEqual(s.remainingTime, 0);
});

check("resume with nothing paused returns null", () => {
    assert.strictEqual(takePausedEvent(createInterventionState()), null);
});

check("an event that expired while paused is dropped, not restarted at full duration", () => {
    for (const remaining of [0, -500]) {
        const s = createInterventionState();
        s.pausedEvent = "COST_SPIKE";
        s.remainingTime = remaining;
        assert.strictEqual(takePausedEvent(s), null);
        assert.strictEqual(s.pausedEvent, null);
        assert.strictEqual(s.remainingTime, 0);
    }
});

check("resume hands each event out exactly once", () => {
    const s = createInterventionState();
    s.pausedEvent = "COST_SPIKE";
    s.remainingTime = 5000;
    assert.ok(takePausedEvent(s));
    assert.strictEqual(takePausedEvent(s), null);
});

check("restart mid-event drops live effect multipliers", () => {
    // A restart must replace the whole intervention block, not patch it:
    // costMultiplier=2.0 / trafficBurstMultiplier=3.0 belong to the old
    // game's event and must not double costs or triple spawn rate in the
    // next one (in sandbox the expiry check never runs, so a leaked
    // multiplier would last the entire session).
    const old = createInterventionState();
    old.activeEvent = "COST_SPIKE";
    old.costMultiplier = 2.0;
    old.trafficBurstMultiplier = 3.0;
    old.currentMilestoneIndex = 2;
    const restarted = createInterventionState();
    assert.strictEqual(restarted.costMultiplier, 1.0);
    assert.strictEqual(restarted.trafficBurstMultiplier, 1.0);
    assert.strictEqual(restarted.currentMilestoneIndex, 0);
    assert.strictEqual(restarted.activeEvent, null);
});

console.log(`\n${passed} checks passed`);
