// Intervention mechanics state: random events, traffic shifts, RPS milestones.
// No DOM or THREE.js dependencies so the pause/resume/reset logic can be
// unit-tested in plain Node (see test_intervention_state.js).

function createInterventionState() {
    return {
        // Traffic shift state
        trafficShiftTimer: 0,
        trafficShiftActive: false,
        currentShift: null,
        originalTrafficDist: null,

        // Random events state
        randomEventTimer: 0,
        activeEvent: null,
        eventEndTime: 0,
        eventDuration: 0,
        pausedEvent: null,
        remainingTime: 0,

        // RPS milestone tracking
        currentMilestoneIndex: 0,
        rpsMultiplier: 1.0,

        // Event history for UI
        recentEvents: [],

        // Warning state
        warnings: [],

        // Active event effect multipliers
        costMultiplier: 1.0,
        trafficBurstMultiplier: 1.0
    };
}

// Record the active event when the game pauses. Idempotent: a second pause
// call while already paused must not clobber the stored event (the Pause
// button stays clickable while paused).
function pauseActiveEvent(intervention, now) {
    if (!intervention.activeEvent || intervention.pausedEvent) return;
    intervention.pausedEvent = intervention.activeEvent;
    intervention.remainingTime = intervention.eventEndTime - now;
}

// Take the event recorded at pause, if any. Returns { eventType, duration }
// with the time the event still had left, or null when there is nothing to
// resume or the event expired while paused (an expired event must end, not
// restart at full duration).
function takePausedEvent(intervention) {
    const eventType = intervention.pausedEvent;
    const remaining = intervention.remainingTime;
    intervention.pausedEvent = null;
    intervention.remainingTime = 0;
    if (!eventType || remaining <= 0) return null;
    return { eventType: eventType, duration: remaining };
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { createInterventionState, pauseActiveEvent, takePausedEvent };
}
