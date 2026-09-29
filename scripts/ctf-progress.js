(() => {
    "use strict";

    const TOTAL = 8;
    const PROGRESS_KEY = "orbi.ctf.completed";

    // ORBI recovery states.
    // Curious operators may notice that the diagnostic state is client-controlled.
    const SYSTEM_STATE_KEY = "orbi.sys.mode";
    const SYSTEM_STATES = Object.freeze({
        RECOVERY: "0x01",
        DIAGNOSTIC: "0xC7F"
    });

    const OVERRIDE_PAGE = "override.html";

    function readCompleted() {
        try {
            const raw = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "[]");
            if (!Array.isArray(raw)) return [];
            return [...new Set(raw.map(Number))]
                .filter(n => Number.isInteger(n) && n >= 1 && n <= TOTAL)
                .sort((a, b) => a - b);
        } catch {
            return [];
        }
    }

    function writeCompleted(list) {
        const cleaned = [...new Set(list.map(Number))]
            .filter(n => Number.isInteger(n) && n >= 1 && n <= TOTAL)
            .sort((a, b) => a - b);

        localStorage.setItem(PROGRESS_KEY, JSON.stringify(cleaned));
        return cleaned;
    }

    function completeChallenge(id) {
        const list = readCompleted();
        if (!list.includes(id)) list.push(id);
        return writeCompleted(list);
    }

    function hasCompleted(id) {
        return readCompleted().includes(Number(id));
    }

    function firstSevenComplete() {
        const completed = readCompleted();
        return [1,2,3,4,5,6,7].every(id => completed.includes(id));
    }

    function normalMissionComplete() {
        return readCompleted().length === TOTAL;
    }

    function diagnosticOverrideActive() {
        return localStorage.getItem(SYSTEM_STATE_KEY) === SYSTEM_STATES.DIAGNOSTIC;
    }

    async function sha256(text) {
        const bytes = new TextEncoder().encode(text);
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        return [...new Uint8Array(digest)]
            .map(byte => byte.toString(16).padStart(2, "0"))
            .join("");
    }

    function normalizeFlag(value) {
        return value.trim().toUpperCase();
    }

    function updateDashboard() {
        const completed = readCompleted();
        const percent = (completed.length / TOTAL) * 100;

        const progressText = document.getElementById("progressText");
        const progressFill = document.getElementById("progressFill");

        if (progressText) progressText.textContent = `${completed.length} / ${TOTAL}`;
        if (progressFill) progressFill.style.width = `${percent}%`;

        document.querySelectorAll("[data-challenge-id]").forEach(card => {
            const id = Number(card.dataset.challengeId);
            const status = card.querySelector(".challenge-status");

            if (completed.includes(id)) {
                card.classList.add("completed");
                if (status) status.textContent = "✓ Completed";
            } else {
                card.classList.remove("completed");
                if (status) status.textContent = "Not completed";
            }

            if (id === 8 && !firstSevenComplete()) {
                card.classList.add("locked");
                if (status) status.textContent = "🔒 Complete 1–7 first";
            } else if (id === 8) {
                card.classList.remove("locked");
            }
        });

        const banner = document.getElementById("missionCompleteBanner");
        if (banner) banner.hidden = !normalMissionComplete();
    }

    function setupDashboardLinks() {
        document.querySelectorAll(".challenge-card.locked").forEach(card => {
            card.addEventListener("click", event => {
                if (Number(card.dataset.challengeId) === 8 && !firstSevenComplete()) {
                    event.preventDefault();
                    const status = card.querySelector(".challenge-status");
                    if (status) status.textContent = "Complete challenges 1–7 to unlock";
                }
            });
        });
    }

    async function setupFlagForm(form) {
        const id = Number(form.dataset.challengeId);
        const expected = form.dataset.flagHash;
        const input = form.querySelector("[data-flag-input]");
        const message = form.querySelector("[data-flag-message]");
        const successArea = document.querySelector("[data-success-actions]");

        if (!id || !expected || !input || !message) return;

        if (hasCompleted(id)) {
            message.textContent = "✓ This challenge is already complete.";
            message.className = "flag-message success";
            if (successArea) successArea.hidden = false;
        }

        form.addEventListener("submit", async event => {
            event.preventDefault();

            const value = normalizeFlag(input.value);
            if (!value) {
                message.textContent = "Enter a flag first.";
                message.className = "flag-message error";
                return;
            }

            const enteredHash = await sha256(value);

            if (enteredHash === expected) {
                const completed = completeChallenge(id);
                message.textContent = `✓ Correct. Challenge ${id} recovered.`;
                message.className = "flag-message success";

                if (successArea) successArea.hidden = false;

                if (completed.length === TOTAL) {
                    window.setTimeout(() => {
                        window.location.href = "../completion.html";
                    }, 900);
                }
            } else {
                message.textContent = "Not quite. Re-check the clue and try again.";
                message.className = "flag-message error";
            }
        });
    }

    function setupFinalGate() {
        const gate = document.querySelector("[data-final-gate]");
        if (!gate) return;

        const locked = gate.querySelector("[data-final-locked]");
        const unlocked = gate.querySelector("[data-final-unlocked]");
        const open = firstSevenComplete();

        if (locked) locked.hidden = open;
        if (unlocked) unlocked.hidden = !open;
    }

    function setupCompletionPage() {
        if (!document.body.matches("[data-completion-page]")) return;

        if (!normalMissionComplete() && diagnosticOverrideActive()) {
            window.location.replace(OVERRIDE_PAGE);
            return;
        }

        const success = document.querySelector("[data-normal-success]");
        const incomplete = document.querySelector("[data-normal-incomplete]");
        const count = document.querySelector("[data-completion-count]");

        if (count) count.textContent = `${readCompleted().length} / ${TOTAL}`;

        if (success) success.hidden = !normalMissionComplete();
        if (incomplete) incomplete.hidden = normalMissionComplete();
    }

    function setupOverridePage() {
        if (!document.body.matches("[data-override-page]")) return;

        const accepted = document.querySelector("[data-override-accepted]");
        const denied = document.querySelector("[data-override-denied]");
        const active = diagnosticOverrideActive();

        if (accepted) accepted.hidden = !active;
        if (denied) denied.hidden = active;
    }

    function setupResetButtons() {
        document.querySelectorAll("[data-reset-progress]").forEach(button => {
            button.addEventListener("click", () => {
                if (!confirm("Reset Operation ORBI progress on this browser?")) return;
                localStorage.removeItem(PROGRESS_KEY);
                localStorage.removeItem(SYSTEM_STATE_KEY);
                window.location.reload();
            });
        });
    }

    document.addEventListener("DOMContentLoaded", () => {
        updateDashboard();
        setupDashboardLinks();
        setupFinalGate();
        setupCompletionPage();
        setupOverridePage();
        setupResetButtons();

        document.querySelectorAll("[data-flag-form]").forEach(setupFlagForm);

        // Keep ordinary recovery state quiet unless an operator changed it.
        if (!localStorage.getItem(SYSTEM_STATE_KEY)) {
            localStorage.setItem(SYSTEM_STATE_KEY, SYSTEM_STATES.RECOVERY);
        }
    });

    // Only the ordinary progress helper is exposed for page UI.
    window.OrbiProgress = {
        completed: readCompleted,
        isComplete: normalMissionComplete
    };
})();
