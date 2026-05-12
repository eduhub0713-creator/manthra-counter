// --- CONFIGURATION ---
const COOLDOWN_SECONDS = 1;
const STORAGE_KEY = "mantharaCounterState.v2";
const OLD_STORAGE_KEY = "mantharaCounterState.v1";
const HISTORY_KEY = "mantharaCounterSetHistory.v2";
const OLD_HISTORY_KEY = "mantharaCounterHistory.v1";
const DAY_MS = 24 * 60 * 60 * 1000;

const defaultState = {
  target: 108,
  done: 0,
  lastTapAt: 0,
  setStartedAt: 0,
  setFinishedAt: 0,
  historyRecorded: false,
};

const elements = {
  doneCount: document.getElementById("doneCount"),
  targetText: document.getElementById("targetText"),
  leftCount: document.getElementById("leftCount"),
  cooldownText: document.getElementById("cooldownText"),
  progressCircle: document.getElementById("progressCircle"),
  tapBtn: document.getElementById("tapBtn"),
  message: document.getElementById("message"),
  targetForm: document.getElementById("targetForm"),
  targetInput: document.getElementById("targetInput"),
  presetButtons: document.querySelectorAll(".preset-btn"),
  resetBtn: document.getElementById("resetBtn"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn"),
  historyList: document.getElementById("historyList"),
  historyTotal: document.getElementById("historyTotal"),
  installBtn: document.getElementById("installBtn"),
};

let state = loadState();
let deferredInstallPrompt = null;
let cooldownTimer = null;

function playCompletionSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 1.5);

    gainNode.gain.setValueAtTime(1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioCtx.currentTime + 1.5,
    );

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 1.5);
  } catch (e) {
    console.error("Audio playback failed", e);
  }
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) return { ...defaultState, ...saved };

    const oldSaved = JSON.parse(localStorage.getItem(OLD_STORAGE_KEY));
    if (oldSaved) return { ...defaultState, ...oldSaved };
  } catch {
    // Use defaults if stored data is damaged.
  }
  return { ...defaultState };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function saveHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function cleanHistory() {
  const cutoff = Date.now() - DAY_MS;
  const cleaned = loadHistory().filter((item) => item.finishedAt >= cutoff);
  saveHistory(cleaned);
  return cleaned;
}

function addHistorySet({ status = "Completed", finishedAt = Date.now() } = {}) {
  if (state.done <= 0) return;

  const history = cleanHistory();
  const startedAt = state.setStartedAt || finishedAt;
  const item = {
    id: `${startedAt}-${finishedAt}-${Math.random().toString(16).slice(2)}`,
    target: state.target,
    completed: state.done,
    startedAt,
    finishedAt,
    status,
  };

  history.unshift(item);
  saveHistory(history);
  state.historyRecorded = true;
  state.setFinishedAt = finishedAt;
}

function resetCurrentSet() {
  if (state.done > 0 && !state.historyRecorded) {
    const completedFullTarget = state.done >= state.target;
    addHistorySet({ status: completedFullTarget ? "Completed" : "Reset" });
  }

  state.done = 0;
  state.lastTapAt = 0;
  state.setStartedAt = 0;
  state.setFinishedAt = 0;
  state.historyRecorded = false;
  saveState();
  render();
}

function formatTime(time) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(time));
}

function formatDuration(start, finish) {
  const totalSeconds = Math.max(0, Math.round((finish - start) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function renderHistory() {
  const history = cleanHistory();
  elements.historyTotal.textContent = `${history.length} set${history.length === 1 ? "" : "s"}`;

  if (!history.length) {
    elements.historyList.innerHTML = `<p class="history-empty">No completed or reset sets in the last 24 hours yet.</p>`;
    return;
  }

  elements.historyList.innerHTML = history
    .map((item, index) => {
      const duration = formatDuration(item.startedAt, item.finishedAt);
      const statusClass = item.status === "Completed" ? "completed" : "reset";

      return `
        <article class="history-item history-set">
          <div>
            <strong>Set #${history.length - index}</strong>
            <span class="history-pill ${statusClass}">${item.status}</span>
          </div>
          <div class="history-details">
            <span>Target: <b>${item.target}</b></span>
            <span>Did: <b>${item.completed}</b></span>
            <span>Start: <b>${formatTime(item.startedAt)}</b></span>
            <span>Finish: <b>${formatTime(item.finishedAt)}</b></span>
            <span>Time: <b>${duration}</b></span>
          </div>
        </article>
      `;
    })
    .join("");
}

function getCooldownLeft() {
  const elapsedSeconds = (Date.now() - state.lastTapAt) / 1000;
  return Math.max(0, Math.ceil(COOLDOWN_SECONDS - elapsedSeconds));
}

function render() {
  const left = Math.max(state.target - state.done, 0);
  const progress =
    state.target > 0 ? Math.min(state.done / state.target, 1) : 0;
  const ringLength = 427;
  const cooldownLeft = getCooldownLeft();

  elements.doneCount.textContent = state.done;
  elements.targetText.textContent = state.target;
  elements.leftCount.textContent = left;
  elements.targetInput.value = state.target;
  elements.progressCircle.style.strokeDashoffset =
    ringLength - ringLength * progress;

  if (state.done >= state.target) {
    elements.tapBtn.disabled = true;
    elements.cooldownText.textContent = "Done";
    elements.message.textContent =
      "Target completed. This set is saved in history. Reset to start the next set.";
  } else if (cooldownLeft > 0) {
    elements.tapBtn.disabled = true;
    elements.cooldownText.textContent = `${cooldownLeft}s`;
    elements.message.textContent = `Please wait ${cooldownLeft} second${cooldownLeft === 1 ? "" : "s"} before the next tap.`;
  } else {
    elements.tapBtn.disabled = false;
    elements.cooldownText.textContent = "Ready";
    elements.message.textContent = `Tap once for each mantra. Next tap unlocks after ${COOLDOWN_SECONDS} second${COOLDOWN_SECONDS === 1 ? "" : "s"}.`;
  }

  saveState();
  renderHistory();
}

function startCooldownClock() {
  clearInterval(cooldownTimer);
  cooldownTimer = setInterval(() => {
    render();
    if (getCooldownLeft() === 0) {
      clearInterval(cooldownTimer);
    }
  }, 100); // Frequency updated to 100ms for immediate response at 1s cooldown
}

function setTarget(value) {
  const nextTarget = Number.parseInt(value, 10);
  if (!Number.isFinite(nextTarget) || nextTarget < 1) {
    elements.message.textContent = "Please enter a target greater than 0.";
    return;
  }

  state.target = nextTarget;
  state.done = Math.min(state.done, state.target);

  if (state.done === 0) {
    state.setStartedAt = 0;
    state.setFinishedAt = 0;
    state.historyRecorded = false;
  }

  if (state.done >= state.target && !state.historyRecorded) {
    addHistorySet({ status: "Completed" });
  }

  saveState();
  render();
}

elements.tapBtn.addEventListener("click", () => {
  if (getCooldownLeft() > 0 || state.done >= state.target) return;

  if (!state.setStartedAt || state.done === 0) {
    state.setStartedAt = Date.now();
    state.setFinishedAt = 0;
    state.historyRecorded = false;
  }

  state.done += 1;
  state.lastTapAt = Date.now();

  if (state.done >= state.target && !state.historyRecorded) {
    addHistorySet({ status: "Completed", finishedAt: state.lastTapAt });
    playCompletionSound();
  }

  saveState();
  render();
  startCooldownClock();
});

elements.targetForm.addEventListener("submit", (event) => {
  event.preventDefault();
  setTarget(elements.targetInput.value);
});

elements.presetButtons.forEach((button) => {
  button.addEventListener("click", () => setTarget(button.dataset.target));
});

elements.resetBtn.addEventListener("click", resetCurrentSet);

elements.clearHistoryBtn.addEventListener("click", () => {
  saveHistory([]);
  renderHistory();
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  elements.installBtn.classList.remove("hidden");
});

elements.installBtn.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  elements.installBtn.classList.add("hidden");
});

window.addEventListener("appinstalled", () => {
  elements.installBtn.classList.add("hidden");
  deferredInstallPrompt = null;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js");
  });
}

localStorage.removeItem(OLD_HISTORY_KEY);
render();
startCooldownClock();
setInterval(() => {
  cleanHistory();
  renderHistory();
}, 60 * 1000);
