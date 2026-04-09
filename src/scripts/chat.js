/**
 * Chat interface controller.
 * Manages the fake chat interaction, section visibility, and localStorage persistence.
 */

const STORAGE_KEY = "chat_history";
const SECTION_KEY = "current_section";
const MODE_KEY = "chat_mode";

// ─── State ──────────────────────────────────────────────────────────────────

let state = {
  mode: "chat", // 'chat' | 'scroll'
  currentSection: "landing",
  isOffline: false,
  history: [], // [{type, text, ts}]
};

// ─── DOM refs ────────────────────────────────────────────────────────────────

let $messages,
  $form,
  $input,
  $submit,
  $clearBtn,
  $modeBadge,
  $statusDot,
  $statusText,
  $mainContent,
  $offlineSection,
  $headerLabel;

// ─── Init ────────────────────────────────────────────────────────────────────

export function initChat(chatData) {
  $messages = document.getElementById("chat-messages");
  $form = document.getElementById("chat-form");
  $input = document.getElementById("chat-input");
  $submit = document.getElementById("chat-submit");
  $clearBtn = document.getElementById("chat-clear-btn");
  $modeBadge = document.getElementById("mode-badge");
  $statusDot = document.getElementById("chat-status-dot");
  $statusText = document.getElementById("chat-status-text");
  $mainContent = document.getElementById("js-main__content");
  $offlineSection = document.getElementById("offline-section");
  $headerLabel = document.getElementById("header-section-label");

  loadState();

  if (state.history.length > 0) {
    restoreHistory();
    restoreSection();
    restoreMode();
    updateClearBtn();
  } else {
    // Fresh start
    setTimeout(() => {
      addSystemMessage(chatData.welcome, true);
    }, 300);
  }

  $form.addEventListener("submit", (e) => {
    e.preventDefault();
    handleInput(chatData);
  });

  $clearBtn.addEventListener("click", () => {
    clearHistory(chatData);
  });

  $offlineSection
    .querySelector(".offline-cta")
    .addEventListener("click", () => {
      triggerRestart(chatData);
    });
}

// ─── Input Handler ───────────────────────────────────────────────────────────

function handleInput(chatData) {
  const raw = $input.value.trim();
  if (!raw) return;

  const input = raw.toLowerCase().trim();
  $input.value = "";

  addUserMessage(raw);

  if (state.isOffline) {
    if (input === "restart") {
      triggerRestart(chatData);
    } else {
      setTimeout(() => {
        addSystemMessage(
          "SESSION TERMINATED.\nType RESTART to reinitiate.",
          true,
        );
      }, 400);
    }
    return;
  }

  // Commands
    if (input === "exit") {
      triggerExit(chatData);
      return;
    }

  if (input === "scroll") {
    triggerScrollMode(chatData);
    return;
  }

  if (input === "chat") {
    triggerChatMode(chatData);
    return;
  }

  // Section matching
  const matched = matchSection(input);
  if (matched) {
    showTyping(() => {
      addSystemMessage(
        `${chatData.accessing} ${matched.dataset.sectionId.toUpperCase()}...`,
        false,
      );
      setTimeout(() => {
        switchSection(matched.dataset.sectionId);
      }, 150);
    });
    return;
  }

  // Unknown
  setTimeout(() => {
    addSystemMessage(chatData.unknown, true);
    setTimeout(() => {
      addSystemMessage(chatData.options, true);
    }, 600);
  }, 400);
}

// ─── Section Matching ────────────────────────────────────────────────────────

function matchSection(input) {
  const sections = document.querySelectorAll(".content-section");
  for (const section of sections) {
    const keywords = section.dataset.keywords.split(",");
    if (keywords.some((k) => k.trim() === input || input.includes(k.trim()))) {
      return section;
    }
  }
  return null;
}

// ─── Section Transitions ─────────────────────────────────────────────────────

function switchSection(newId) {
  if (state.isOffline) return;
  if (state.mode === "scroll") return;
  if (state.currentSection === newId) return;

  const current = document.querySelector(".content-section.is-visible");
  const next = document.querySelector(`[data-section-id="${newId}"]`);

  if (!next) return;

  // Hide offline if visible
  if ($offlineSection.classList.contains("is-visible")) {
    $offlineSection.classList.add("is-leaving");
    $offlineSection.classList.remove("is-visible");
    setTimeout(() => {
      $offlineSection.classList.remove("is-leaving");
      $offlineSection.style.display = "none";
    }, 300);
  }

  if (current) {
    current.classList.add("is-leaving");
    current.classList.remove("is-visible");
    setTimeout(() => {
      current.classList.remove("is-leaving");
      current.style.display = "none";
    }, 280);
  }

  setTimeout(
    () => {
      next.style.display = "block";
      // Force reflow before adding class so transition fires
      void next.offsetHeight;
      next.classList.add("is-visible");
      $mainContent.scrollTop = 0;
    },
    current ? 200 : 0,
  );

  state.currentSection = newId;
  updateHeaderLabel(newId);
  saveState();
}

function showSection(id) {
  switchSection(id);
}

// ─── Mode Switching ───────────────────────────────────────────────────────────

function triggerScrollMode(chatData) {
  state.mode = "scroll";

  // Show all sections
  const sections = document.querySelectorAll(".content-section");
  sections.forEach((s) => {
    s.style.display = "block";
    s.classList.add("is-visible");
    s.classList.remove("is-leaving");
  });

  $mainContent.classList.add("scroll-mode");
  $modeBadge.textContent = "SCROLL MODE";
  $mainContent.scrollTop = 0;

  setTimeout(() => {
    addSystemMessage(chatData.scrollActivated, true);
  }, 300);

  saveState();
}

function triggerChatMode(chatData) {
  state.mode = "chat";
  $mainContent.classList.remove("scroll-mode");
  $modeBadge.textContent = "CHAT MODE";

  // Hide all except current
  const sections = document.querySelectorAll(".content-section");
  sections.forEach((s) => {
    if (s.dataset.sectionId !== state.currentSection) {
      s.classList.remove("is-visible", "is-leaving");
      s.style.display = "none";
    }
  });

  setTimeout(() => {
    addSystemMessage(chatData.chatRestored, true);
  }, 300);

  saveState();
}

// ─── Exit / Restart ───────────────────────────────────────────────────────────

function triggerExit(chatData) {
  state.isOffline = true;

  const current = document.querySelector(".content-section.is-visible");
  if (current) {
    current.classList.add("is-leaving");
    current.classList.remove("is-visible");
    setTimeout(() => {
      current.classList.remove("is-leaving");
      current.style.display = "none";
    }, 280);
  }

  setTimeout(() => {
    $offlineSection.style.display = "flex";
    void $offlineSection.offsetHeight;
    $offlineSection.classList.add("is-visible");
    $mainContent.scrollTop = 0;
  }, 200);

  $statusDot.classList.remove("active");
  $statusDot.classList.add("offline");
  $statusText.textContent = "OFFLINE";

  $input.disabled = false;
  $input.placeholder = "type RESTART...";

  setTimeout(() => {
    addSystemMessage(chatData.exitMessage, true);
  }, 300);

  updateHeaderLabel(null);
  saveState();
}

function triggerRestart(chatData) {
  state.isOffline = false;
  state.currentSection = "landing";
  state.mode = "chat";

  // Hide offline
  $offlineSection.classList.add("is-leaving");
  $offlineSection.classList.remove("is-visible");
  setTimeout(() => {
    $offlineSection.classList.remove("is-leaving");
    $offlineSection.style.display = "none";
  }, 280);

  // Show landing
  const landing = document.querySelector('[data-section-id="landing"]');
  if (landing) {
    setTimeout(() => {
      landing.style.display = "block";
      void landing.offsetHeight;
      landing.classList.add("is-visible");
      $mainContent.scrollTop = 0;
    }, 200);
  }

  $statusDot.classList.add("active");
  $statusDot.classList.remove("offline");
  $statusText.textContent = "STATUS: SECURE";

  $input.disabled = false;
  $input.placeholder = "enter directive...";
  $modeBadge.textContent = "CHAT MODE";

  setTimeout(() => {
    addSystemMessage(chatData.restart, true);
  }, 300);

  updateHeaderLabel("landing");
  $mainContent.classList.remove("scroll-mode");
  saveState();
}

// ─── Message Rendering ────────────────────────────────────────────────────────

function addSystemMessage(text, save = true) {
  const ts = Date.now();
  renderMessage({ type: "system", text, ts });
  if (save) {
    state.history.push({ type: "system", text, ts });
    updateClearBtn();
    saveState();
  }
  scrollMessages();
}

function addUserMessage(text) {
  const ts = Date.now();
  renderMessage({ type: "user", text, ts });
  state.history.push({ type: "user", text, ts });
  updateClearBtn();
  saveState();
  scrollMessages();
}

function renderMessage({ type, text, ts }) {
  const msg = document.createElement("div");
  msg.className = `chat-msg chat-msg-${type}`;

  const bubble = document.createElement("div");
  bubble.className = "chat-msg-bubble mono--medium";
  bubble.textContent = text;

  const timestamp = document.createElement("div");
  timestamp.className = "chat-msg-timestamp mono--extra-small";
  timestamp.textContent = formatTime(ts);

  msg.appendChild(bubble);
  msg.appendChild(timestamp);
  $messages.appendChild(msg);
  return msg;
}

function showTyping(callback) {
  const indicator = document.createElement("div");
  indicator.className = "chat-msg chat-msg-system typing-indicator";
  indicator.innerHTML = `
    <div class="chat-msg-bubble">
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
    </div>`;
  $messages.appendChild(indicator);
  scrollMessages();

  setTimeout(() => {
    $messages.removeChild(indicator);
    callback();
  }, 700);
}

function scrollMessages() {
  requestAnimationFrame(() => {
    $messages.scrollTop = $messages.scrollHeight;
  });
}

// ─── Header Label ─────────────────────────────────────────────────────────────

function updateHeaderLabel(sectionId) {
  if (!$headerLabel) return;
  if (!sectionId) {
    $headerLabel.textContent = "";
    return;
  }
  const section = document.querySelector(`[data-section-id="${sectionId}"]`);
  if (section) {
    const label = section.querySelector(".section-label");
    $headerLabel.textContent = label ? label.textContent : "";
  }
}

// ─── Clear History ────────────────────────────────────────────────────────────

function clearHistory(chatData) {
  state.history = [];
  $messages.innerHTML = "";
  updateClearBtn();
  saveState();

  setTimeout(() => {
    addSystemMessage(chatData.welcome, true);
  }, 100);
}

function updateClearBtn() {
  if (state.history.length > 0) {
    $clearBtn.classList.add("has-history");
  } else {
    $clearBtn.classList.remove("has-history");
  }
}

// ─── Persistence ──────────────────────────────────────────────────────────────

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.history));
    localStorage.setItem(SECTION_KEY, state.currentSection);
    localStorage.setItem(
      MODE_KEY,
      JSON.stringify({
        mode: state.mode,
        isOffline: state.isOffline,
      }),
    );
  } catch (e) {
    // localStorage unavailable
  }
}

function loadState() {
  try {
    const history = localStorage.getItem(STORAGE_KEY);
    const section = localStorage.getItem(SECTION_KEY);
    const modeData = localStorage.getItem(MODE_KEY);

    if (history) state.history = JSON.parse(history);
    if (section) state.currentSection = section;
    if (modeData) {
      const parsed = JSON.parse(modeData);
      state.mode = parsed.mode || "chat";
      state.isOffline = parsed.isOffline || false;
    }
  } catch (e) {
    // Start fresh
  }
}

function restoreHistory() {
  state.history.forEach((msg) => renderMessage(msg));
  scrollMessages();
}

function restoreSection() {
  if (state.isOffline) {
    // Show offline state
    const sections = document.querySelectorAll(".content-section");
    sections.forEach((s) => {
      s.classList.remove("is-visible", "is-leaving");
      s.style.display = "none";
    });
    $offlineSection.style.display = "flex";
    void $offlineSection.offsetHeight;
    $offlineSection.classList.add("is-visible");

    $statusDot.classList.remove("active");
    $statusDot.classList.add("offline");
    $statusText.textContent = "OFFLINE";
    $input.placeholder = "type RESTART...";
    return;
  }

  if (state.mode === "scroll") {
    const sections = document.querySelectorAll(".content-section");
    sections.forEach((s) => {
      s.style.display = "block";
      s.classList.add("is-visible");
    });
    $mainContent.classList.add("scroll-mode");
    $modeBadge.textContent = "SCROLL MODE";
    return;
  }

  // Chat mode: show only current section
  const sections = document.querySelectorAll(".content-section");
  sections.forEach((s) => {
    const isTarget = s.dataset.sectionId === state.currentSection;
    if (isTarget) {
      s.style.display = "block";
      s.classList.add("is-visible");
    } else {
      s.classList.remove("is-visible", "is-leaving");
      s.style.display = "none";
    }
  });

  updateHeaderLabel(state.currentSection);
}

function restoreMode() {
  $modeBadge.textContent =
    state.mode === "scroll" ? "SCROLL MODE" : "CHAT MODE";
  if (state.isOffline) {
    $statusDot.classList.remove("active");
    $statusDot.classList.add("offline");
    $statusText.textContent = "OFFLINE";
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
