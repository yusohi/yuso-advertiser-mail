let deals = [];

const API_URL = "https://bsmfvlodkqyfawsppjno.supabase.co/functions/v1/yuso-mail/api/data";
const CHANGE_PASSWORD_URL = "https://bsmfvlodkqyfawsppjno.supabase.co/functions/v1/yuso-mail/api/change-password";
const PASSWORD_KEY = "yuso-mail-password";

const state = {
  selectedId: "",
  filter: "all",
  query: "",
  updatedAt: "불러오는 중",
  loading: false,
  lastError: "",
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
  button.textContent = isLoading ? "확인 중" : "새로고침";
}

function updateSyncStatus() {
  const status = $("#syncStatus");
  if (!status) return;
  const suffix = state.lastError ? ` · ${state.lastError}` : " · 60초마다 자동 확인";
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

function showLogin(message = "") {
  $("#loginScreen").classList.remove("hidden");
  $("#loginError").textContent = message;
  $("#passwordInput").focus();
}

function hideLogin() {
  $("#loginScreen").classList.add("hidden");
  $("#loginError").textContent = "";
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
      ([id, label]) =>
        `<button class="${state.filter === id ? "active" : ""}" data-filter="${id}" type="button">${label}</button>`,
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
      <button class="deal-button ${state.selectedId === deal.id ? "active" : ""}" data-id="${deal.id}" type="button">
        <div class="deal-title">
          <strong>${deal.advertiser}</strong>
          <span class="badge ${deal.status}">${deal.statusLabel}</span>
        </div>
        <div class="deal-meta">${deal.brand}</div>
        <div class="deal-meta">마지막 메일 ${deal.lastTouch}</div>
      </button>
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
        <button class="gmail-link" data-scroll-mail="true" type="button">메일 본문 보기</button>
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
      <section class="section" style="grid-column: 1 / -1;">
        <h3>메일 대화</h3>
        <div class="mail-thread">
          ${(deal.messages || fallbackMessages(deal))
            .map(
              (message) => `
                <article class="mail-message">
                  <div class="mail-message-head">
                    <strong>${escapeHtml(message.from)}</strong>
                    <span>${escapeHtml(message.date)}</span>
                  </div>
                  <p>${escapeHtml(message.body)}</p>
                </article>
              `,
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
    const thread = document.querySelector(".mail-thread");
    if (thread) {
      thread.scrollIntoView({ behavior: "smooth", block: "start" });
      showToast("웹앱 안에서 메일 본문을 바로 보여줍니다.");
    }
  }
});

$("#searchInput").addEventListener("input", (event) => {
  state.query = event.target.value;
  renderList();
  renderDetail();
});

$("#refreshButton").addEventListener("click", () => {
  loadDeals({ manual: true });
});

$("#logoutButton").addEventListener("click", () => {
  localStorage.removeItem(PASSWORD_KEY);
  deals = [];
  state.selectedId = "";
  render();
  showLogin();
});

$("#changePasswordButton").addEventListener("click", openPasswordModal);

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
});

registerServiceWorker();
render();
loadDeals();
setInterval(() => {
  loadDeals();
}, 60_000);
