let deals = [];

const API_URL = "https://bsmfvlodkqyfawsppjno.supabase.co/functions/v1/yuso-mail/api/data";
const CHANGE_PASSWORD_URL = "https://bsmfvlodkqyfawsppjno.supabase.co/functions/v1/yuso-mail/api/change-password";
const DELETE_DEAL_URL = "https://bsmfvlodkqyfawsppjno.supabase.co/functions/v1/yuso-mail/api/delete-deal";
const GMAIL_STATUS_URL = "https://bsmfvlodkqyfawsppjno.supabase.co/functions/v1/yuso-mail/api/gmail/status";
const GMAIL_AUTH_URL = "https://bsmfvlodkqyfawsppjno.supabase.co/functions/v1/yuso-mail/api/gmail/auth-url";
const GMAIL_SYNC_URL = "https://bsmfvlodkqyfawsppjno.supabase.co/functions/v1/yuso-mail/api/gmail/sync";
const PASSWORD_KEY = "yuso-mail-password";
const LAYOUT_KEY = "yuso-mail-layout";

const state = {
  selectedId: "",
  filter: "all",
  query: "",
  updatedAt: "불러오는 중",
  loading: false,
  lastError: "",
  expandedMessages: new Set(),
  gmailConfigured: false,
  gmailConnected: false,
};

const statusLabels = [
  ["all", "전체"],
  ["reply", "내 답장 필요"],
  ["waiting", "상대 답장 대기"],
  ["signed", "계약 완료"],
  ["closed", "종료"],
  ["proposal", "신규 제안"],
];

const $ = (selector) => document.querySelector(selector);

function escapeAttr(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function showToast(message) {
  const toast = $("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3800);
}

function setLoading(isLoading) {
  state.loading = isLoading;
  const button = $("#refreshButton");
  if (!button) return;
  button.disabled = isLoading;
  button.classList.toggle("is-loading", isLoading);
  button.textContent = isLoading ? "…" : "↻";
}

function updateSyncStatus() {
  const status = $("#syncStatus");
  if (!status) return;
  const gmail = state.gmailConnected ? "Gmail 직접 동기화 연결됨" : "Gmail OAuth 연결 필요";
  const suffix = state.lastError ? ` · ${state.lastError}` : ` · ${gmail} · 화면은 1분마다 확인`;
  status.textContent = `유소채널 메일함 · ${state.updatedAt}${suffix}`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function initials(value = "") {
  const text = String(value || "").trim();
  if (!text) return "?";
  const emailMatch = text.match(/<([^>]+)>/);
  const clean = text
    .replace(/<[^>]+>/g, "")
    .replace(/["']/g, "")
    .trim();
  const source = clean || emailMatch?.[1] || text;
  if (/유소|yuso/i.test(source)) return "소정";
  if (/[가-힣]/.test(source)) return source.slice(0, 2);
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function isSenderMe(value = "") {
  return /유소|yuso@wootso\.com|yuso/i.test(String(value));
}

function messagePreview(body = "") {
  return String(body).replace(/\s+/g, " ").trim().slice(0, 150);
}

async function loadDeals({ manual = false } = {}) {
  const password = localStorage.getItem(PASSWORD_KEY);
  if (!password) {
    showLogin();
    setLoading(false);
    return;
  }

  setLoading(true);
  try {
    const response = await fetch(`${API_URL}?ts=${Date.now()}`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password }),
    });
    if (response.status === 401) {
      localStorage.removeItem(PASSWORD_KEY);
      showLogin("비밀번호가 맞지 않습니다.");
      return;
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    if (!Array.isArray(payload.deals)) {
      throw new Error("API 응답에 deals 배열이 없습니다");
    }

    deals = payload.deals;
    state.updatedAt = payload.updatedAt || new Date().toLocaleString("ko-KR");
    state.lastError = "";
    if (!deals.some((deal) => deal.id === state.selectedId)) {
      state.selectedId = deals[0]?.id || "";
    }
  } catch (error) {
    state.lastError = manual ? "새 데이터 확인 실패" : "자동 확인 실패";
  } finally {
    setLoading(false);
    render();
  }
}

async function postPrivate(url, body = {}) {
  const password = localStorage.getItem(PASSWORD_KEY);
  if (!password) {
    showLogin();
    throw new Error("비밀번호가 필요합니다.");
  }
  const response = await fetch(`${url}?ts=${Date.now()}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password, ...body }),
  });
  if (response.status === 401) {
    localStorage.removeItem(PASSWORD_KEY);
    showLogin("비밀번호가 맞지 않습니다.");
    throw new Error("unauthorized");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      data.error === "gmail_oauth_not_configured"
        ? "Google OAuth 설정이 아직 필요합니다."
        : data.error === "gmail_not_connected"
          ? "Gmail 연결이 아직 필요합니다."
          : data.error || `HTTP ${response.status}`;
    const error = new Error(message);
    error.data = data;
    throw error;
  }
  return data;
}

async function refreshGmailStatus() {
  const status = $("#gmailStatus");
  if (!localStorage.getItem(PASSWORD_KEY)) return;
  try {
    const data = await postPrivate(GMAIL_STATUS_URL);
    state.gmailConfigured = Boolean(data.configured);
    state.gmailConnected = Boolean(data.connected);
    if (status) {
      if (!state.gmailConfigured) {
        status.textContent = "Google OAuth 설정 필요";
      } else if (state.gmailConnected) {
        status.textContent = `Gmail 연결됨${data.email ? ` · ${data.email}` : ""}`;
      } else {
        status.textContent = "Gmail 연결 전";
      }
    }
  } catch {
    state.gmailConfigured = false;
    state.gmailConnected = false;
    if (status) status.textContent = "Gmail 상태 확인 실패";
  } finally {
    updateSyncStatus();
  }
}

async function connectGmail() {
  try {
    const data = await postPrivate(GMAIL_AUTH_URL);
    window.location.href = data.url;
  } catch (error) {
    showToast(error.message || "Gmail 연결을 시작하지 못했습니다.");
  }
}

async function syncGmailNow({ silent = false } = {}) {
  setLoading(true);
  try {
    const result = await postPrivate(GMAIL_SYNC_URL);
    state.updatedAt = result.updatedAt || new Date().toLocaleString("ko-KR");
    state.gmailConnected = true;
    state.lastError = "";
    if (!silent) showToast(`Gmail 동기화 완료: ${result.finalCount || 0}건`);
    await loadDeals({ manual: true });
  } catch (error) {
    state.lastError = "Gmail 동기화 필요";
    if (!silent) showToast(error.message || "Gmail 동기화 실패");
    await loadDeals({ manual: true });
  } finally {
    setLoading(false);
    refreshGmailStatus();
  }
}

function showLogin(message = "") {
  $("#loginScreen").classList.remove("hidden");
  $("#loginError").textContent = message;
  $("#passwordInput").focus();
}

function hideLogin() {
  $("#loginScreen").classList.add("hidden");
  $("#loginError").textContent = "";
}

function applyLayoutMode() {
  const compact = localStorage.getItem(LAYOUT_KEY) === "compact";
  document.body.classList.toggle("compact", compact);
  const toggle = $("#layoutToggle");
  if (toggle) {
    toggle.setAttribute("aria-label", compact ? "목록 크게 보기" : "목록 작게 보기");
  }
}

function toggleLayoutMode() {
  const next = document.body.classList.contains("compact") ? "comfortable" : "compact";
  localStorage.setItem(LAYOUT_KEY, next);
  applyLayoutMode();
}

function openAccountPanel() {
  $("#accountPanel").classList.remove("hidden");
}

function closeAccountPanel() {
  $("#accountPanel").classList.add("hidden");
}

function toggleAccountPanel() {
  $("#accountPanel").classList.toggle("hidden");
}

function openPasswordModal() {
  const savedPassword = localStorage.getItem(PASSWORD_KEY) || "";
  $("#passwordModal").classList.remove("hidden");
  $("#passwordModal").setAttribute("aria-hidden", "false");
  $("#changePasswordError").textContent = "";
  $("#currentPasswordInput").value = savedPassword;
  $("#newPasswordInput").value = "";
  $("#confirmPasswordInput").value = "";
  $("#currentPasswordInput").focus();
}

function closePasswordModal() {
  $("#passwordModal").classList.add("hidden");
  $("#passwordModal").setAttribute("aria-hidden", "true");
  $("#changePasswordForm").reset();
  $("#changePasswordError").textContent = "";
}

async function changePassword(currentPassword, newPassword) {
  const response = await fetch(CHANGE_PASSWORD_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (response.status === 401) {
    throw new Error("현재 비밀번호가 맞지 않습니다.");
  }
  if (response.status === 400) {
    throw new Error("새 비밀번호는 8자 이상이어야 합니다.");
  }
  if (!response.ok) {
    throw new Error("비밀번호 변경에 실패했습니다.");
  }
}

async function deleteDeal(id) {
  const password = localStorage.getItem(PASSWORD_KEY);
  if (!password) {
    showLogin();
    return;
  }

  const response = await fetch(DELETE_DEAL_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password, id }),
  });
  if (response.status === 401) {
    localStorage.removeItem(PASSWORD_KEY);
    showLogin("비밀번호가 맞지 않습니다.");
    throw new Error("unauthorized");
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
}

function filteredDeals() {
  const query = state.query.trim().toLowerCase();
  return deals.filter((deal) => {
    const matchesFilter = state.filter === "all" || deal.status === state.filter;
    const haystack = `${deal.advertiser} ${deal.contact} ${deal.brand} ${deal.statusLabel} ${deal.oneLine}`.toLowerCase();
    return matchesFilter && (!query || haystack.includes(query));
  });
}

function renderSummary() {
  const needsReply = deals.filter((deal) => deal.status === "reply").length;
  const waiting = deals.filter((deal) => deal.status === "waiting").length;
  $("#summary").innerHTML = `
    <div class="metric"><span>총 대화</span><strong>${deals.length}</strong></div>
    <div class="metric"><span>내 답장 필요</span><strong>${needsReply}</strong></div>
    <div class="metric"><span>상대 답장 대기</span><strong>${waiting}</strong></div>
  `;
  updateSyncStatus();
}

function renderFilters() {
  $("#statusFilters").innerHTML = statusLabels
    .map(
      ([id, label]) => {
        const count = id === "all" ? deals.length : deals.filter((deal) => deal.status === id).length;
        return `<button class="${state.filter === id ? "active" : ""}" data-filter="${id}" type="button"><span>${label}</span><strong>${count}</strong></button>`;
      },
    )
    .join("");
}

function renderList() {
  const items = filteredDeals();
  if (!items.some((deal) => deal.id === state.selectedId) && items[0]) {
    state.selectedId = items[0].id;
  }

  $("#resultCount").textContent = `${items.length}건`;
  $("#dealList").innerHTML = items
    .map(
      (deal) => `
      <div class="deal-row ${state.selectedId === deal.id ? "active" : ""}">
        <button class="deal-button" data-id="${escapeAttr(deal.id)}" type="button">
          <div class="deal-title">
            <strong>${escapeHtml(deal.advertiser)}</strong>
            <span class="badge ${deal.status}">${escapeHtml(deal.statusLabel)}</span>
          </div>
          <div class="deal-meta">${escapeHtml(deal.brand)}</div>
          <div class="deal-meta">마지막 메일 ${escapeHtml(deal.lastTouch)}</div>
        </button>
        <button class="delete-deal" data-delete-id="${escapeAttr(deal.id)}" aria-label="${escapeAttr(deal.advertiser)} 삭제" type="button">×</button>
      </div>
    `,
    )
    .join("");
}

function renderDetail() {
  const deal = deals.find((item) => item.id === state.selectedId) || filteredDeals()[0];
  if (!deal) {
    $("#detail").innerHTML = `<p class="muted">검색 결과가 없습니다.</p>`;
    return;
  }
  const messages = deal.messages || fallbackMessages(deal);
  if (messages.length && !messages.some((_, index) => state.expandedMessages.has(`${deal.id}:${index}`))) {
    state.expandedMessages.add(`${deal.id}:${messages.length - 1}`);
  }

  $("#detail").innerHTML = `
    <div class="detail-head">
      <div>
        <span class="badge ${deal.status}">${deal.statusLabel}</span>
        <h2>${deal.advertiser}</h2>
        <div class="muted">${deal.contact} · ${deal.email}</div>
        <div class="muted">수신 계정: ${deal.account || "yuso@wootso.com"}</div>
        <div class="amount">${deal.amount}</div>
      </div>
      <div class="link-actions">
        <button class="gmail-link" data-scroll-mail="true" type="button">전체 원문 보기</button>
      </div>
    </div>

    <div class="grid">
      <section class="section">
        <h3>현재 어디까지 왔는지</h3>
        <p>${deal.oneLine}</p>
        <p class="muted">마감/일정: ${deal.deadline}</p>
      </section>
      <section class="section">
        <h3>다음 액션</h3>
        <p>${deal.nextAction}</p>
      </section>
      <section class="section">
        <h3>핵심 조건</h3>
        <ul>${deal.highlights.map((item) => `<li>${item}</li>`).join("")}</ul>
      </section>
      <section class="section">
        <h3>대화 흐름</h3>
        <div class="timeline">
          ${deal.timeline
            .map(([date, text]) => `<div class="event"><strong>${date}</strong><span>${text}</span></div>`)
            .join("")}
        </div>
      </section>
      <section class="section" style="grid-column: 1 / -1;">
        <h3>다음 메일 초안</h3>
        <div class="draft">${deal.draft}</div>
      </section>
      <section class="section" id="mailThreadSection" style="grid-column: 1 / -1;">
        <h3>저장된 메일 원문 <span class="section-count">${messages.length}개</span></h3>
        <div class="mail-thread">
          ${messages
            .map(
              (message, index) => {
                const key = `${deal.id}:${index}`;
                const expanded = state.expandedMessages.has(key);
                const from = message.from || "알 수 없음";
                return `
                <article class="mail-message ${expanded ? "expanded" : "collapsed"} ${isSenderMe(from) ? "from-me" : ""}">
                  <button class="mail-message-summary" data-message-key="${escapeAttr(key)}" type="button" aria-expanded="${expanded}">
                    <span class="mail-avatar">${escapeHtml(initials(from))}</span>
                    <span class="mail-message-main">
                      <span class="mail-message-line">
                        <strong>${escapeHtml(from)}</strong>
                        <span>${escapeHtml(message.date)}</span>
                      </span>
                      <span class="mail-message-preview">${escapeHtml(messagePreview(message.body))}</span>
                    </span>
                    <span class="mail-toggle" aria-hidden="true">${expanded ? "⌃" : "⌄"}</span>
                  </button>
                  <div class="mail-message-body">
                    <p>${escapeHtml(message.body)}</p>
                  </div>
                </article>
              `;
              },
            )
            .join("")}
        </div>
      </section>
    </div>
  `;
}

function fallbackMessages(deal) {
  return deal.timeline.map(([date, body]) => ({
    from: "대화 요약",
    date,
    body,
  }));
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (!window.location.protocol.startsWith("http")) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // The app still works without offline caching.
    });
  });
}

function render() {
  renderSummary();
  renderFilters();
  renderList();
  renderDetail();
}

document.addEventListener("click", (event) => {
  if (!event.target.closest("#accountPanel") && !event.target.closest("#profileButton")) {
    closeAccountPanel();
  }

  const deleteButton = event.target.closest("[data-delete-id]");
  if (deleteButton) {
    const id = deleteButton.dataset.deleteId;
    const deal = deals.find((item) => item.id === id);
    if (!deal) return;
    if (!confirm(`${deal.advertiser} 메일을 목록에서 삭제할까요?`)) return;

    deleteButton.disabled = true;
    deleteDeal(id)
      .then(() => {
        deals = deals.filter((item) => item.id !== id);
        if (state.selectedId === id) {
          state.selectedId = filteredDeals()[0]?.id || deals[0]?.id || "";
        }
        render();
        showToast("메일을 삭제했습니다.");
      })
      .catch(() => {
        showToast("삭제하지 못했습니다.");
      })
      .finally(() => {
        deleteButton.disabled = false;
      });
    return;
  }

  const dealButton = event.target.closest("[data-id]");
  if (dealButton) {
    state.selectedId = dealButton.dataset.id;
    render();
    return;
  }

  const filterButton = event.target.closest("[data-filter]");
  if (filterButton) {
    state.filter = filterButton.dataset.filter;
    render();
    return;
  }

  const scrollMailButton = event.target.closest("[data-scroll-mail]");
  if (scrollMailButton) {
    const thread = document.querySelector("#mailThreadSection");
    if (thread) {
      thread.scrollIntoView({ behavior: "smooth", block: "start" });
      showToast("이전 대화까지 포함한 전체 원문으로 이동했습니다.");
    }
  }

  const messageButton = event.target.closest("[data-message-key]");
  if (messageButton) {
    const key = messageButton.dataset.messageKey;
    if (state.expandedMessages.has(key)) {
      state.expandedMessages.delete(key);
    } else {
      state.expandedMessages.add(key);
    }
    renderDetail();
  }
});

$("#searchInput").addEventListener("input", (event) => {
  state.query = event.target.value;
  renderList();
  renderDetail();
});

$("#refreshButton").addEventListener("click", () => {
  syncGmailNow();
});

$("#layoutToggle").addEventListener("click", toggleLayoutMode);

$("#profileButton").addEventListener("click", (event) => {
  event.stopPropagation();
  toggleAccountPanel();
});

$("#logoutButton").addEventListener("click", () => {
  localStorage.removeItem(PASSWORD_KEY);
  closeAccountPanel();
  deals = [];
  state.selectedId = "";
  render();
  showLogin();
});

$("#changePasswordButton").addEventListener("click", () => {
  closeAccountPanel();
  openPasswordModal();
});

$("#connectGmailButton").addEventListener("click", connectGmail);

$("#syncGmailButton").addEventListener("click", () => {
  closeAccountPanel();
  syncGmailNow();
});

$("#cancelPasswordChange").addEventListener("click", closePasswordModal);

$("#passwordModal").addEventListener("click", (event) => {
  if (event.target === $("#passwordModal")) closePasswordModal();
});

$("#changePasswordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const currentPassword = $("#currentPasswordInput").value.trim();
  const newPassword = $("#newPasswordInput").value.trim();
  const confirmPassword = $("#confirmPasswordInput").value.trim();
  const error = $("#changePasswordError");

  if (newPassword.length < 8) {
    error.textContent = "새 비밀번호는 8자 이상이어야 합니다.";
    return;
  }
  if (newPassword !== confirmPassword) {
    error.textContent = "새 비밀번호 확인이 일치하지 않습니다.";
    return;
  }

  const submitButton = event.submitter;
  if (submitButton) submitButton.disabled = true;
  error.textContent = "";
  try {
    await changePassword(currentPassword, newPassword);
    localStorage.setItem(PASSWORD_KEY, newPassword);
    closePasswordModal();
    showToast("비밀번호를 변경했습니다.");
    await loadDeals({ manual: true });
  } catch (changeError) {
    error.textContent = changeError.message;
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = $("#passwordInput").value.trim();
  if (!password) return;
  localStorage.setItem(PASSWORD_KEY, password);
  hideLogin();
  await loadDeals({ manual: true });
  await refreshGmailStatus();
});

registerServiceWorker();
applyLayoutMode();
render();
loadDeals();
refreshGmailStatus();
if (new URLSearchParams(window.location.search).get("gmail") === "connected") {
  window.history.replaceState({}, "", window.location.pathname);
  showToast("Gmail 연결이 완료되었습니다. 메일을 동기화합니다.");
  syncGmailNow();
}
setInterval(() => {
  loadDeals();
}, 60_000);
