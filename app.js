let deals = [];

const API_URL = "https://bsmfvlodkqyfawsppjno.supabase.co/functions/v1/yuso-mail/api/data";
const CHANGE_PASSWORD_URL = "https://bsmfvlodkqyfawsppjno.supabase.co/functions/v1/yuso-mail/api/change-password";
const DELETE_DEAL_URL = "https://bsmfvlodkqyfawsppjno.supabase.co/functions/v1/yuso-mail/api/delete-deal";
const GMAIL_STATUS_URL = "https://bsmfvlodkqyfawsppjno.supabase.co/functions/v1/yuso-mail/api/gmail/status";
const GMAIL_AUTH_URL = "https://bsmfvlodkqyfawsppjno.supabase.co/functions/v1/yuso-mail/api/gmail/auth-url";
const GMAIL_SYNC_URL = "https://bsmfvlodkqyfawsppjno.supabase.co/functions/v1/yuso-mail/api/gmail/sync";
const PASSWORD_KEY = "yuso-mail-password";
const LAYOUT_KEY = "yuso-mail-layout";
const GMAIL_AUTO_CONNECT_KEY = "yuso-mail-gmail-auto-connect-attempted";

const state = {
  selectedId: "",
  filter: "all",
  query: "",
  updatedAt: "불러오는 중",
  loading: false,
  lastError: "",
  expandedMessages: new Set(),
  expandedQuotes: new Set(),
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

function cleanMailText(body = "") {
  return String(body || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function splitQuotedBody(body = "") {
  const text = String(body || "").replace(/\r\n/g, "\n");
  const patterns = [
    /(^|\n)\s*\d{4}년\s+\d{1,2}월\s+\d{1,2}일[\s\S]{0,180}?님이 작성:\s*/,
    /(^|\n)\s*On\s.+?wrote:\s*/i,
    /(^|\n)\s*-{2,}\s*Forwarded message\s*-{2,}\s*/i,
    /(^|\n)\s*보낸 사람\s*:\s*/,
    /(^|\n)\s*From\s*:\s*/i,
  ];

  let best = null;
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    const index = match.index + (match[1] ? match[1].length : 0);
    if (index < 24) continue;
    if (!best || index < best.index) {
      best = { index, end: pattern.lastIndex || index + match[0].length, intro: match[0].trim() };
    }
  }

  const quotedLineIndex = text.search(/(^|\n)\s*>/);
  if (quotedLineIndex >= 24 && (!best || quotedLineIndex < best.index)) {
    return {
      current: text.slice(0, quotedLineIndex).trim(),
      intro: "",
      quoted: text.slice(quotedLineIndex).trim(),
    };
  }

  if (!best) return { current: text.trim(), intro: "", quoted: "" };
  return {
    current: text.slice(0, best.index).trim(),
    intro: best.intro,
    quoted: text.slice(best.end).trim(),
  };
}

function normalizeVisibleMailText(body = "") {
  return cleanMailText(body)
    .split("\n")
    .map((line) => line.replace(/^>\s?/, ""))
    .filter((line) => !/^\s*[-–—]\s*$/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatMailText(body = "") {
  const text = normalizeVisibleMailText(body);
  if (!text) return "";
  const html = escapeHtml(text)
    .replace(/^\*([^*\n:]{1,24})\*:\s*/gm, "<strong>$1:</strong> ")
    .replace(/^\*\s*([^*\n:]{1,24})\s*:\s*\*/gm, "<strong>$1:</strong>")
    .replace(/^[-•]\s+/gm, "• ");
  return `<p>${html}</p>`;
}

function renderMailBody(body = "", quoteKey = "") {
  const { current, intro, quoted } = splitQuotedBody(cleanMailText(body));
  if (!quoted) return formatMailText(current);

  const expanded = state.expandedQuotes.has(quoteKey);
  return `
    ${formatMailText(current)}
    <div class="quoted-mail ${expanded ? "expanded" : ""}">
      ${intro ? `<p class="quote-intro">${escapeHtml(intro)}</p>` : ""}
      <button class="quote-toggle" data-quote-key="${escapeAttr(quoteKey)}" type="button" aria-expanded="${expanded}" aria-label="이전 대화 ${expanded ? "접기" : "열기"}">•••</button>
      <div class="quoted-mail-body">
        ${formatMailText(quoted)}
      </div>
    </div>
  `;
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
  const connectButton = $("#connectGmailButton");
  const syncButton = $("#syncGmailButton");
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
    if (connectButton) {
      connectButton.hidden = state.gmailConnected || !state.gmailConfigured;
      connectButton.textContent = state.gmailConfigured ? "Gmail 연결" : "Gmail 설정 필요";
    }
    if (syncButton) {
      syncButton.hidden = !state.gmailConnected;
    }
    return data;
  } catch {
    state.gmailConfigured = false;
    state.gmailConnected = false;
    if (status) status.textContent = "Gmail 상태 확인 실패";
    if (connectButton) connectButton.hidden = false;
    if (syncButton) syncButton.hidden = true;
    return null;
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

async function ensureGmailReady() {
  const status = await refreshGmailStatus();
  if (!status) return;
  if (state.gmailConnected) {
    await syncGmailNow({ silent: true });
    return;
  }
  if (state.gmailConfigured && !sessionStorage.getItem(GMAIL_AUTO_CONNECT_KEY)) {
    sessionStorage.setItem(GMAIL_AUTO_CONNECT_KEY, "1");
    showToast("Gmail 연결 화면으로 이동합니다.");
    await connectGmail();
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

function compactTimelineDate(value = "") {
  const text = String(value || "").trim();
  const match = text.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{1,2})시\s*(\d{1,2})분/);
  if (match) {
    const hour = match[4].padStart(2, "0");
    const minute = match[5].padStart(2, "0");
    return `${match[2]}.${match[3]} ${hour}:${minute}`;
  }
  return text.replace(/(\d{4})년\s*/, "").replace(/\s+/g, " ").slice(0, 18);
}

function cleanTimelineText(value = "") {
  return String(value || "")
    .replace(/[<>]/g, "")
    .replace(/"/g, "")
    .replace(/\s+/g, " ")
    .trim() || "대화";
}

function senderName(value = "") {
  return String(value || "담당자")
    .replace(/<.*?>/g, "")
    .replace(/["']/g, "")
    .replace(/\s+/g, " ")
    .trim() || "담당자";
}

function currentMessageText(message) {
  return normalizeVisibleMailText(splitQuotedBody(cleanMailText(message?.body || "")).current || message?.body || "");
}

function messageSnippet(body = "", length = 86) {
  return normalizeVisibleMailText(body)
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, length);
}

function uniqueItems(items, limit = 6) {
  const seen = new Set();
  return items
    .map((item) => String(item || "").trim())
    .filter((item) => {
      const key = item.toLowerCase();
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function extractConditions(text = "") {
  const clean = normalizeVisibleMailText(text);
  const lines = clean.split("\n").map((line) => line.trim()).filter(Boolean);
  const money = clean.match(/(?:\d{1,3}(?:,\d{3})*|\d+)\s*(?:만\s*)?원|VAT|부가세|페이백|현금|광고비|비용/g) || [];
  const dates = clean.match(/\d{1,2}\s*월\s*\d{1,2}\s*일|\d{4}[.\-]\s*\d{1,2}[.\-]\s*\d{1,2}|이번\s*주|다음\s*주|금주|내일|오늘|일정|마감|촬영/g) || [];
  const deliverables = lines.filter((line) => /(릴스|쇼츠|피드|스토리|블로그|영상|콘텐츠|PPL|공동구매|체험단|가이드|링크|성과|제작|촬영)/i.test(line));
  const products = lines.filter((line) => /(제품|치약|칫솔|림핏|엔지|쿼드|키토|세트|무상|제공|배송|주소)/i.test(line));

  return uniqueItems([
    ...money.filter((item) => !/^(비용|광고비)$/.test(item)).map((item) => `비용/정산: ${item}`),
    ...dates.map((item) => `일정: ${item}`),
    ...deliverables.map((item) => `진행: ${item.replace(/^[-•✔\s]+/, "")}`),
    ...products.map((item) => `제품/배송: ${item.replace(/^[-•✔\s]+/, "")}`),
  ], 8);
}

function inferNeed(text = "") {
  const clean = normalizeVisibleMailText(text);
  if (/주소|배송지|수령|연락처|성함/.test(clean)) return "배송지/연락처 정보를 확인해서 보내기";
  if (/일정|가능|확인|마감|촬영|업로드|진행/.test(clean)) return "가능 일정과 진행 여부를 답장하기";
  if (/비용|광고비|단가|견적|페이백|현금|VAT|무상/.test(clean)) return "조건이 맞는지 보고 비용/진행 방식 협의하기";
  if (/가이드|계약|링크|성과|코드/.test(clean)) return "가이드와 진행 조건을 확인하고 필요한 자료 요청하기";
  return "제안 내용을 검토하고 진행 여부를 답장하기";
}

function buildDealInsight(deal, messages) {
  const usableMessages = messages.filter((message) => currentMessageText(message));
  const latest = usableMessages[usableMessages.length - 1] || {};
  const latestExternal = [...usableMessages].reverse().find((message) => !isSenderMe(message.from)) || latest;
  const latestMine = [...usableMessages].reverse().find((message) => isSenderMe(message.from));
  const latestText = currentMessageText(latest);
  const latestExternalText = currentMessageText(latestExternal);
  const allText = usableMessages.map(currentMessageText).join("\n\n");
  const lastFromMe = latest.from && isSenderMe(latest.from);
  const conditions = extractConditions(allText);
  const latestSender = senderName(latestExternal.from);
  const latestSummary = messageSnippet(latestExternalText || latestText, 150);
  const need = lastFromMe ? "상대 답장을 기다리는 상태" : inferNeed(latestExternalText || latestText);
  const progress = lastFromMe
    ? `내가 ${compactTimelineDate(latest.date)}에 답장을 보냈고, 현재는 ${latestSender}의 회신을 기다리는 중입니다.`
    : `${latestSender}가 마지막으로 보낸 메일 기준으로 ${need}가 필요합니다.`;
  const conversation = uniqueItems([
    usableMessages[0] ? `처음 제안: ${messageSnippet(currentMessageText(usableMessages[0]), 120)}` : "",
    latestMine ? `내가 보낸 최근 답장: ${messageSnippet(currentMessageText(latestMine), 120)}` : "",
    latestExternal ? `상대의 최근 요청/제안: ${latestSummary}` : "",
  ], 4);
  const nextSteps = lastFromMe
    ? ["새 회신이 오면 조건 변경 여부를 확인하기", "급한 건이면 2-3일 뒤 가볍게 리마인드하기"]
    : uniqueItems([
        need,
        /비용|광고비|단가|페이백|무상/.test(latestExternalText) ? "무상/성과형이면 고정 광고비 가능 여부를 협의하기" : "",
        /주소|배송지|연락처/.test(latestExternalText) ? "보내도 되는 배송 정보만 정리해서 전달하기" : "",
        "답장 전 원문에서 누락된 조건이 없는지 확인하기",
      ], 4);
  const draft = lastFromMe
    ? `안녕하세요, ${latestSender}님.\n\n이전 메일 확인 부탁드립니다. 추가로 필요한 내용이 있으면 편하게 말씀 주세요.\n\n감사합니다.\n유소정 드림`
    : `안녕하세요, ${latestSender}님.\n\n제안 주신 내용 확인했습니다. ${need.replace(/기$/, "겠습니다")}.\n\n진행 전 아래 내용만 한 번 더 확인 부탁드립니다.\n- 진행 방식/콘텐츠 형태\n- 일정 및 업로드 마감\n- 제공 제품과 비용 조건\n\n확인해주시면 검토 후 답장드리겠습니다.\n\n감사합니다.\n유소정 드림`;

  return {
    progress,
    conversation,
    nextSteps,
    conditions: conditions.length ? conditions : uniqueItems(deal.highlights || [], 5),
    draft,
    latestSummary,
  };
}

function renderTimeline(deal) {
  const messages = Array.isArray(deal.messages) ? deal.messages : [];
  const timeline = messages.length
    ? messages.map((message) => [message.date, `${senderName(message.from)} · ${messageSnippet(currentMessageText(message), 80)}`])
    : Array.isArray(deal.timeline) ? deal.timeline : [];
  if (!timeline.length) {
    return `<p class="muted">아직 기록된 흐름이 없습니다.</p>`;
  }

  const renderItems = (items) => items
    .map(([date, text]) => `
      <div class="event">
        <time>${escapeHtml(compactTimelineDate(date))}</time>
        <span>${escapeHtml(cleanTimelineText(text))}</span>
      </div>
    `)
    .join("");

  const recent = timeline.slice(-6);
  const older = timeline.slice(0, -6);
  return `
    <div class="timeline-clean">
      ${renderItems(recent)}
    </div>
    ${
      older.length
        ? `<details class="timeline-more">
            <summary>이전 흐름 ${older.length}개 보기</summary>
            <div class="timeline-scroll">${renderItems(older)}</div>
          </details>`
        : ""
    }
  `;
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
  const insight = buildDealInsight(deal, messages);

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
      <section class="section insight-card">
        <h3>현재 어디까지 왔는지</h3>
        <p class="lead-text">${escapeHtml(insight.progress)}</p>
        <p class="muted">${escapeHtml(insight.latestSummary || deal.oneLine || "")}</p>
      </section>
      <section class="section action-card">
        <h3>다음 액션</h3>
        <ol class="action-list">${insight.nextSteps.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
      </section>
      <section class="section">
        <h3>짧은 대화 요약</h3>
        <ul class="summary-list">${insight.conversation.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </section>
      <section class="section">
        <h3>핵심 조건</h3>
        <div class="condition-list">${insight.conditions.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
      </section>
      <section class="section" style="grid-column: 1 / -1;">
        <h3>대화 흐름</h3>
        ${renderTimeline(deal)}
      </section>
      <section class="section" style="grid-column: 1 / -1;">
        <h3>다음 메일 초안</h3>
        <div class="draft">${escapeHtml(insight.draft)}</div>
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
                    ${renderMailBody(message.body, `${key}:quote`)}
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
    navigator.serviceWorker
      .register(`./sw.js?v=${Date.now()}`)
      .then((registration) => registration.update())
      .catch(() => {
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
    return;
  }

  const quoteButton = event.target.closest("[data-quote-key]");
  if (quoteButton) {
    const key = quoteButton.dataset.quoteKey;
    if (state.expandedQuotes.has(key)) {
      state.expandedQuotes.delete(key);
    } else {
      state.expandedQuotes.add(key);
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
  await ensureGmailReady();
});

registerServiceWorker();
applyLayoutMode();
render();

async function boot() {
  await loadDeals();
  const params = new URLSearchParams(window.location.search);
  if (params.get("gmail") === "connected") {
    sessionStorage.removeItem(GMAIL_AUTO_CONNECT_KEY);
    window.history.replaceState({}, "", window.location.pathname);
    showToast("Gmail 연결이 완료되었습니다. 메일을 동기화합니다.");
    await syncGmailNow();
    return;
  }
  await ensureGmailReady();
}

boot();
setInterval(() => {
  loadDeals();
}, 60_000);
