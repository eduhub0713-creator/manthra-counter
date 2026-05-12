const STORAGE_KEY = "mantharaCounterState.v1";
const HISTORY_KEY = "mantharaCounterHistory.v1";
const COOLDOWN_SECONDS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

const defaultState = {
  target: 108,
  done: 0,
  lastTapAt: 0
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
  installBtn: document.getElementById("installBtn")
};

let state = loadState();
let deferredInstallPrompt = null;
let cooldownTimer = null;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return { ...defaultState, ...saved };
  } catch {
    return { ...defaultState };
  }
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
  const cleaned = loadHistory().filter((item) => item.time >= cutoff);
  saveHistory(cleaned);
  return cleaned;
}

function addHistoryTap() {
  const history = cleanHistory();
  history.unshift({ time: Date.now(), target: state.target });
  saveHistory(history);
}

function formatTime(time) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(time));
}

function renderHistory() {
  const history = cleanHistory();
  elements.historyTotal.textContent = `${history.length} tap${history.length === 1 ? "" : "s"}`;

  if (!history.length) {
    elements.historyList.innerHTML = `<p class="history-empty">No taps in the last 24 hours yet.</p>`;
    return;
  }

  elements.historyList.innerHTML = history
    .map((item, index) => `
      <div class="history-item">
        <strong>#${history.length - index}</strong>
        <span>${formatTime(item.time)} · Target ${item.target}</span>
      </div>
    `)
    .join("");
}

function getCooldownLeft() {
  const elapsedSeconds = Math.floor((Date.now() - state.lastTapAt) / 1000);
  return Math.max(0, COOLDOWN_SECONDS - elapsedSeconds);
}

function render() {
  const left = Math.max(state.target - state.done, 0);
  const progress = state.target > 0 ? Math.min(state.done / state.target, 1) : 0;
  const ringLength = 427;
  const cooldownLeft = getCooldownLeft();

  elements.doneCount.textContent = state.done;
  elements.targetText.textContent = state.target;
  elements.leftCount.textContent = left;
  elements.targetInput.value = state.target;
  elements.progressCircle.style.strokeDashoffset = ringLength - ringLength * progress;

  if (state.done >= state.target) {
    elements.tapBtn.disabled = true;
    elements.cooldownText.textContent = "Done";
    elements.message.textContent = "Target completed. Reset or set a new target to start again.";
  } else if (cooldownLeft > 0) {
    elements.tapBtn.disabled = true;
    elements.cooldownText.textContent = `${cooldownLeft}s`;
    elements.message.textContent = `Please wait ${cooldownLeft} second${cooldownLeft === 1 ? "" : "s"} before the next tap.`;
  } else {
    elements.tapBtn.disabled = false;
    elements.cooldownText.textContent = "Ready";
    elements.message.textContent = "Tap once for each mantra. Next tap unlocks after 5 seconds.";
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
  }, 500);
}

function setTarget(value) {
  const nextTarget = Number.parseInt(value, 10);
  if (!Number.isFinite(nextTarget) || nextTarget < 1) {
    elements.message.textContent = "Please enter a target greater than 0.";
    return;
  }

  state.target = nextTarget;
  state.done = Math.min(state.done, state.target);
  saveState();
  render();
}

elements.tapBtn.addEventListener("click", () => {
  if (getCooldownLeft() > 0 || state.done >= state.target) return;

  state.done += 1;
  state.lastTapAt = Date.now();
  addHistoryTap();
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

elements.resetBtn.addEventListener("click", () => {
  state.done = 0;
  state.lastTapAt = 0;
  saveState();
  render();
});

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

render();
startCooldownClock();
setInterval(cleanHistory, 60 * 1000);
