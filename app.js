let deals = [];

const APP_HOME_URL = "https://yusohi.github.io/yuso-advertiser-mail/";
if (window.location.protocol === "file:") {
  window.location.replace(APP_HOME_URL);
}

const API_URL = "https://bsmfvlodkqyfawsppjno.supabase.co/functions/v1/yuso-mail/api/data";
const CHANGE_PASSWORD_URL = "https://bsmfvlodkqyfawsppjno.supabase.co/functions/v1/yuso-mail/api/change-password";
const DELETE_DEAL_URL = "https://bsmfvlodkqyfawsppjno.supabase.co/functions/v1/yuso-mail/api/delete-deal";
const GMAIL_STATUS_URL = "https://bsmfvlodkqyfawsppjno.supabase.co/functions/v1/yuso-mail/api/gmail/status";
const GMAIL_AUTH_URL = "https://bsmfvlodkqyfawsppjno.supabase.co/functions/v1/yuso-mail/api/gmail/auth-url";
const GMAIL_SYNC_URL = "https://bsmfvlodkqyfawsppjno.supabase.co/functions/v1/yuso-mail/api/gmail/sync";
const PASSWORD_KEY = "yuso-mail-password";
const LAYOUT_KEY = "yuso-mail-layout";
const GMAIL_AUTO_CONNECT_KEY = "yuso-mail-gmail-auto-connect-attempted";
const HIDDEN_DEALS_KEY = "yuso-mail-hidden-deals";
const ARCHIVED_DEALS_KEY = "yuso-mail-archived-deals";
const PASSWORD_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

const state = {
  selectedId: "",
  view: "dashboard",
  returnView: "dashboard",
  filter: "all",
  brandFilter: "",
  query: "",
  updatedAt: "불러오는 중",
  loading: false,
  lastError: "",
  expandedMessages: new Set(),
  expandedQuotes: new Set(),
  rawMailOpen: new Set(),
  highlightedMessage: "",
  gmailConfigured: false,
  gmailConnected: false,
  calendarMonthOffset: 0,
  selectedCalendarKey: "",
};

const statusLabels = [
  ["all", "전체"],
  ["reply", "내 답장 필요"],
  ["priority", "중요도순"],
  ["urgent", "빨리 답장"],
  ["soon", "오늘 확인"],
  ["waiting", "상대 답장 대기"],
  ["signed", "계약 완료"],
  ["closed", "종료"],
  ["proposal", "신규 제안"],
];

const $ = (selector) => document.querySelector(selector);

function storageGet(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Safari private or in-app sessions can reject localStorage.
  }
}

function storageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Safari private or in-app sessions can reject localStorage.
  }
}

function readStoredSet(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch {
    return new Set();
  }
}

function writeStoredSet(key, values) {
  try {
    localStorage.setItem(key, JSON.stringify([...values].map(String)));
  } catch {
    // Safari private or in-app sessions can reject localStorage.
  }
}

function cookieGet(name) {
  const encoded = `${encodeURIComponent(name)}=`;
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(encoded))
    ?.slice(encoded.length) || "";
}

function cookieSet(name, value, maxAge = PASSWORD_COOKIE_MAX_AGE) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`;
}

function cookieRemove(name) {
  cookieSet(name, "", 0);
}

function savedPassword() {
  const password = storageGet(PASSWORD_KEY) || decodeURIComponent(cookieGet(PASSWORD_KEY) || "");
  if (password && !storageGet(PASSWORD_KEY)) storageSet(PASSWORD_KEY, password);
  return password;
}

function savePassword(password) {
  storageSet(PASSWORD_KEY, password);
  cookieSet(PASSWORD_KEY, password);
}

function clearPassword() {
  storageRemove(PASSWORD_KEY);
  cookieRemove(PASSWORD_KEY);
}

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

function emailFromValue(value = "") {
  const text = String(value || "");
  return text.match(/<([^>]+)>/)?.[1] || text.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] || "";
}

function domainFromEmail(value = "") {
  const email = emailFromValue(value).toLowerCase();
  return email.includes("@") ? email.split("@").pop() : "";
}

function avatarMarkup(label = "", email = "") {
  const domain = domainFromEmail(email);
  const text = escapeHtml(initials(label || email));
  if (domain && !/(gmail|googlemail)\.com$/.test(domain)) {
    const src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=96`;
    return `<span class="deal-avatar has-logo"><img src="${src}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove(); this.parentElement.classList.remove('has-logo')" /><span>${text}</span></span>`;
  }
  return `<span class="deal-avatar"><span>${text}</span></span>`;
}

function isSenderMe(value = "") {
  return /유소|yuso@wootso\.com|yuso/i.test(String(value));
}

function normalizedKey(value = "") {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[^\p{L}\p{N}@.]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function messagePreview(body = "") {
  return normalizeVisibleMailText(body).replace(/\s+/g, " ").trim().slice(0, 150);
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

function splitSignatureText(text = "") {
  const lines = String(text || "").split("\n");
  const markers = [
    /^--\s*$/,
    /^(감사합니다|감사합니다\.|고맙습니다|Regards|Best regards|Sincerely|Thanks)[\s.!]*$/i,
    /^(유소정|소정|한진아|담당자|드림|올림)\s*(드림|올림)?\.?$/,
    /(creator|크리에이터|마케팅|브랜드|팀|Team|Manager|CEO|주식회사|\(주\)|@|www\.|https?:\/\/|010[-\s]\d{3,4}[-\s]\d{4})/i,
  ];
  let start = -1;
  const scanFrom = Math.max(0, lines.length - 12);
  for (let i = scanFrom; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (markers.some((pattern) => pattern.test(line))) {
      start = i;
      break;
    }
  }
  if (start < 0 || start === 0) return { body: text.trim(), signature: "" };
  const signature = lines.slice(start).join("\n").trim();
  if (signature.split("\n").filter(Boolean).length > 10) return { body: text.trim(), signature: "" };
  return {
    body: lines.slice(0, start).join("\n").trim(),
    signature,
  };
}

function linkifyEscapedText(html = "") {
  return html
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/g, '<a href="mailto:$1">$1</a>')
    .replace(/(010[-\s]\d{3,4}[-\s]\d{4})/g, '<a href="tel:$1">$1</a>');
}

function formatInlineMailText(text = "") {
  return linkifyEscapedText(
    escapeHtml(text)
      .replace(/^\*([^*\n:]{1,24})\*:\s*/gm, "<strong>$1:</strong> ")
      .replace(/^\*\s*([^*\n:]{1,24})\s*:\s*\*/gm, "<strong>$1:</strong>")
      .replace(/^[-•]\s+/gm, "• "),
  );
}

function formatMailText(body = "") {
  const text = normalizeVisibleMailText(body);
  if (!text) return "";
  const { body: mainText, signature } = splitSignatureText(text);
  return `
    ${mainText ? `<p>${formatInlineMailText(mainText)}</p>` : ""}
    ${signature ? `<aside class="mail-signature">${formatInlineMailText(signature)}</aside>` : ""}
  `;
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

function renderMailAttachments(attachments = []) {
  const images = Array.isArray(attachments)
    ? attachments.filter((item) => String(item?.mimeType || "").startsWith("image/") && item?.dataUrl)
    : [];
  if (!images.length) return "";
  return `
    <div class="mail-attachments">
      ${images
        .map(
          (item) => `
            <figure class="mail-attachment">
              <img src="${escapeAttr(item.dataUrl)}" alt="${escapeAttr(item.filename || "메일 첨부 이미지")}" loading="lazy" />
              ${item.filename ? `<figcaption>${escapeHtml(item.filename)}</figcaption>` : ""}
            </figure>
          `,
        )
        .join("")}
    </div>
  `;
}

async function loadDeals({ manual = false } = {}) {
  const password = savedPassword();
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
      clearPassword();
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

    deals = normalizeDeals(payload.deals);
    state.updatedAt = payload.updatedAt || new Date().toLocaleString("ko-KR");
    state.lastError = "";
    hideLogin();
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
  const password = savedPassword();
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
    clearPassword();
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
          : data.error === "gmail_reauth_required"
            ? "Gmail 연결이 만료되어 다시 연결합니다."
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
  if (!savedPassword()) return;
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

function isGmailReauthError(error) {
  const text = `${error?.data?.error || ""} ${error?.message || ""}`;
  return /gmail_reauth_required|gmail_refresh_failed|invalid_grant|expired|revoked/i.test(text);
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
    if (!silent) {
      const skipped = result.skippedNoise ? ` · 뉴스레터/스팸 ${result.skippedNoise}건 제외` : "";
      showToast(`Gmail 동기화 완료: ${result.finalCount || 0}건${skipped}`);
    }
    await loadDeals({ manual: true });
  } catch (error) {
    state.lastError = "Gmail 동기화 필요";
    if (isGmailReauthError(error)) {
      state.gmailConnected = false;
      showToast("Gmail 연결이 만료되어 다시 연결합니다.");
      await connectGmail();
      return;
    }
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
  const compact = storageGet(LAYOUT_KEY) === "compact";
  document.body.classList.toggle("compact", compact);
  const toggle = $("#layoutToggle");
  if (toggle) {
    toggle.setAttribute("aria-label", compact ? "목록 크게 보기" : "목록 작게 보기");
  }
}

function toggleLayoutMode() {
  if (isMobileLayout()) {
    document.body.classList.toggle("mobile-drawer-open");
    return;
  }
  const next = document.body.classList.contains("compact") ? "comfortable" : "compact";
  storageSet(LAYOUT_KEY, next);
  applyLayoutMode();
}

function isMobileLayout() {
  return window.matchMedia("(max-width: 980px)").matches;
}

function openMobileDetail() {
  if (!isMobileLayout()) return;
  document.body.classList.add("mobile-detail-open");
  document.body.classList.remove("mobile-drawer-open");
  document.querySelector(".detail")?.scrollTo({ top: 0 });
}

function openDesktopDetail() {
  if (isMobileLayout()) return;
  document.body.classList.add("desktop-detail-open", "desktop-detail-animating");
  document.querySelector(".detail")?.scrollTo({ top: 0, behavior: "smooth" });
  window.setTimeout(() => {
    document.body.classList.remove("desktop-detail-animating");
  }, 320);
}

function closeDesktopDetail() {
  document.body.classList.remove("desktop-detail-open", "desktop-detail-animating");
  document.querySelector(".deal-list")?.scrollTo({ top: 0, behavior: "smooth" });
}

function closeMobileDetail() {
  document.body.classList.remove("mobile-detail-open");
}

function closeDetailView() {
  closeMobileDetail();
  closeDesktopDetail();
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
  $("#passwordModal").classList.remove("hidden");
  $("#passwordModal").setAttribute("aria-hidden", "false");
  $("#changePasswordError").textContent = "";
  $("#currentPasswordInput").value = savedPassword();
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
  const password = savedPassword();
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
    clearPassword();
    showLogin("비밀번호가 맞지 않습니다.");
    throw new Error("unauthorized");
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
}

function parseDealDate(deal) {
  const iso = deal?.lastTouchIso || deal?.updatedAtIso;
  if (iso) {
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const text = String(deal?.lastTouch || "");
  const normalized = text.replace(/\s+/g, " ").trim();
  const patterns = [
    /(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*(\d{1,2})시\s*(\d{1,2})분(?:\s*(\d{1,2})초)?/,
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(?:오전|오후)?\s*(\d{1,2})[:시]\s*(\d{1,2})(?:분|\b)(?:\s*(\d{1,2})초)?/,
    /(\d{4})[.-]\s*(\d{1,2})[.-]\s*(\d{1,2})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      let hour = Number(match[4]);
      if (/오후/.test(normalized) && hour < 12) hour += 12;
      if (/오전/.test(normalized) && hour === 12) hour = 0;
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), hour, Number(match[5]), Number(match[6] || 0));
    }
  }
  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? new Date(0) : fallback;
}

function dealMessages(deal) {
  return Array.isArray(deal?.messages) ? deal.messages : fallbackMessages(deal);
}

function latestExternalMessage(deal) {
  const messages = dealMessages(deal);
  return [...messages].reverse().find((message) => !isSenderMe(message?.from)) || messages[messages.length - 1] || {};
}

function isWootsoCompanyDeal(deal) {
  const latestExternal = latestExternalMessage(deal);
  const primaryText = [
    deal?.advertiser,
    deal?.contact,
    deal?.brand,
    currentMessageText(latestExternal).slice(0, 700),
  ].join(" ");
  return /웃소|wootso/i.test(primaryText) && !/(유소|유소정|소정|yuso\.hi|yuso@wootso\.com)/i.test(primaryText);
}

function isNewsletterDeal(deal) {
  const latestExternal = latestExternalMessage(deal);
  const text = [
    deal?.advertiser,
    deal?.contact,
    deal?.brand,
    deal?.oneLine,
    deal?.nextAction,
    currentMessageText(latestExternal).slice(0, 1600),
  ].join(" ");
  const newsletterSignals =
    /(뉴스레터|트렌드\s*레터|레터\s*이미지|구독|수신\s*거부|unsubscribe|view\s+in\s+browser|read\s+online|weekly\s+digest|digest|vol\.\s*\d+|월드컵특수|리스크체크|오미영피자|캐릿|careet)/i;
  const advertiserSignals =
    /(협업|광고|광고주|브랜디드|ppl|기획\s*ppl|제안|견적|광고비|계약|서명|업로드|촬영|제품\s*제공|시딩|진행\s*가능|회신|답장\s*부탁)/i;
  return newsletterSignals.test(text) && !advertiserSignals.test(text);
}

function dealStorageKeys(deal) {
  return [deal?.id, dealDedupeKey(deal)].filter(Boolean).map(String);
}

function isLocallyHiddenDeal(deal) {
  const hidden = readStoredSet(HIDDEN_DEALS_KEY);
  const archived = readStoredSet(ARCHIVED_DEALS_KEY);
  return dealStorageKeys(deal).some((key) => hidden.has(key) || archived.has(key));
}

function rememberDealState(key, deal) {
  const stored = readStoredSet(key);
  for (const value of dealStorageKeys(deal)) stored.add(value);
  writeStoredSet(key, stored);
}

function isAdvertisingDeal(deal) {
  if (!/^https:\/\/mail\.google\.com/i.test(String(deal?.gmail || ""))) return false;
  if (isNewsletterDeal(deal)) return false;
  const latestExternal = latestExternalMessage(deal);
  const text = [
    deal?.advertiser,
    deal?.contact,
    deal?.brand,
    deal?.oneLine,
    deal?.nextAction,
    currentMessageText(latestExternal).slice(0, 1200),
  ].join(" ");
  const blocked = /(mrbeastcollab\.sbs|grammarly manager shared|dropsend collaboration|이용권 만료|newsletter|notification|no-?reply|google events|eventsatgoogle|creator club|크리에이터 클럽|final reminder|초대합니다|뉴스레터|트렌드\s*레터|수신\s*거부|unsubscribe|weekly\s+digest|digest|vol\.\s*\d+)/i.test(text);
  if (blocked) return false;
  return true;
}

function dealDedupeKey(deal) {
  const gmailThread = String(deal?.gmail || "").match(/#(?:all|inbox)\/([^/?#]+)/)?.[1] || "";
  if (gmailThread) return `gmail:${gmailThread}`;
  const latest = latestExternalMessage(deal);
  return [
    normalizedKey(deal?.advertiser || deal?.contact || deal?.email),
    normalizedKey(deal?.brand),
    normalizedKey(deal?.lastTouch),
    normalizedKey(currentMessageText(latest)).slice(0, 120),
  ].join("|");
}

function betterDeal(left, right) {
  const leftHasGmail = /^https:\/\/mail\.google\.com/i.test(String(left?.gmail || ""));
  const rightHasGmail = /^https:\/\/mail\.google\.com/i.test(String(right?.gmail || ""));
  if (leftHasGmail !== rightHasGmail) return leftHasGmail ? left : right;
  const leftDate = parseDealDate(left).getTime();
  const rightDate = parseDealDate(right).getTime();
  if (leftDate !== rightDate) return leftDate > rightDate ? left : right;
  const leftMessages = dealMessages(left).length;
  const rightMessages = dealMessages(right).length;
  if (leftMessages !== rightMessages) return leftMessages > rightMessages ? left : right;
  return left;
}

function normalizeDeals(list = []) {
  const unique = new Map();
  for (const deal of Array.isArray(list) ? list : []) {
    if (!deal || isWootsoCompanyDeal(deal)) continue;
    if (isLocallyHiddenDeal(deal)) continue;
    if (!isAdvertisingDeal(deal)) continue;
    const key = dealDedupeKey(deal);
    const current = unique.get(key);
    unique.set(key, current ? betterDeal(current, deal) : deal);
  }
  return Array.from(unique.values());
}

function priorityTextForDeal(deal) {
  const messages = dealMessages(deal);
  const latest = messages[messages.length - 1] || {};
  return `${currentMessageText(latest)} ${deal?.brand || ""} ${deal?.oneLine || ""} ${deal?.nextAction || ""}`;
}

function isPurchaseRequest(text = "") {
  return /(공구|공동구매|구매\s*요청|판매\s*요청|마켓|스토어|커머스|affiliate|sales|reseller)/i.test(String(text));
}

function dealPriority(deal) {
  const savedScore = Number(deal?.priorityScore || 0);
  const savedLevel = String(deal?.priorityLevel || "");
  const text = priorityTextForDeal(deal);
  const purchasePenalty = isPurchaseRequest(text) ? 30 : 0;
  if (savedScore && savedLevel) {
    const score = isPurchaseRequest(text) ? Math.min(Math.max(0, savedScore - purchasePenalty), 45) : savedScore;
    const level = score >= 82 ? "urgent" : score >= 62 ? "soon" : savedLevel === "waiting" ? "waiting" : "normal";
    return {
      score,
      level,
      label: level === "urgent" ? "빨리 답장" : level === "soon" ? "오늘 확인" : level === "waiting" ? "대기" : "일반 확인",
    };
  }

  if (deal?.status !== "reply") {
    return { score: 10, level: "waiting", label: "대기" };
  }
  const ageHours = Math.max(0, (Date.now() - parseDealDate(deal).getTime()) / 36e5);
  const activeDeal = /(진행|계약|서명|촬영|업로드|일정|주소|배송|제품\s*발송|시딩|견적|광고비|비용|세금계산서|입금|확정|승인|컨펌)/i.test(text);
  const asksReply = /(답장|회신|확인\s*부탁|검토\s*부탁|가능하실까요|어떠실까요|의견|전달\s*부탁|문의|요청|reply|respond|confirm|check)/i.test(text);
  const urgent = /(마감|오늘|내일|금일|이번\s*주|급|빠르게|리마인드|reminder|urgent|asap|deadline)/i.test(text);
  let score = 45;
  if (ageHours >= 72) score += 28;
  else if (ageHours >= 24) score += 18;
  else if (ageHours >= 8) score += 8;
  if (activeDeal) score += 24;
  if (urgent) score += 22;
  if (asksReply) score += 16;
  if (isPurchaseRequest(text)) score = Math.min(score - 30, 45);
  if (score >= 82) return { score, level: "urgent", label: "빨리 답장" };
  if (score >= 62) return { score, level: "soon", label: "오늘 확인" };
  return { score, level: "normal", label: "일반 확인" };
}

function dealMatchesFilter(deal, filter) {
  const priority = dealPriority(deal);
  if (filter === "priority" || filter === "all") return true;
  if (filter === "urgent") return deal.status === "reply" && priority.level === "urgent";
  if (filter === "soon") return deal.status === "reply" && (priority.level === "urgent" || priority.level === "soon");
  return deal.status === filter;
}

function sortByPriority(a, b) {
  const priorityDiff = dealPriority(b).score - dealPriority(a).score;
  if (priorityDiff) return priorityDiff;
  return parseDealDate(b).getTime() - parseDealDate(a).getTime();
}

function sortByRecent(a, b) {
  return parseDealDate(b).getTime() - parseDealDate(a).getTime();
}

function sortForCurrentFilter(items) {
  if (["priority", "urgent", "soon"].includes(state.filter)) return items.sort(sortByPriority);
  return items.sort(sortByRecent);
}

function formatDashboardDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}.${date.getDate()}`;
}

function formatCalendarKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseScheduleToken(token = "", baseDate = new Date()) {
  const text = String(token || "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (/오늘/.test(text)) return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  if (/내일/.test(text)) return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + 1);

  let match = text.match(/(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

  match = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (match) return new Date(baseDate.getFullYear(), Number(match[1]) - 1, Number(match[2]));

  match = text.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (match) return new Date(baseDate.getFullYear(), Number(match[1]) - 1, Number(match[2]));

  return null;
}

function scheduleLabelFromLine(line = "") {
  const text = normalizeVisibleMailText(line).replace(/\s+/g, " ").trim();
  if (/업로드|게시/.test(text)) return "업로드일";
  if (/촬영/.test(text)) return "촬영일";
  if (/가편|초안|시안/.test(text)) return "초안/가편 전달일";
  if (/최종|컨펌|확정/.test(text)) return "최종 확인일";
  if (/기획안|콘티|원고/.test(text)) {
    if (/수정|피드백|코멘트/.test(text)) return "기획안 수정 확인";
    if (/전달|공유|보내/.test(text)) return "기획안 전달일";
    return "기획안 관련 일정";
  }
  if (/가이드/.test(text)) return /전달|공유|보내/.test(text) ? "가이드 전달일" : "가이드 확인일";
  if (/계약|서명/.test(text)) return "계약서 확인일";
  if (/마감|deadline/i.test(text)) return "마감일";
  if (/회신|답장/.test(text)) return "답장 확인일";
  return "일정 확인";
}

function scheduleTopicFromLine(line = "") {
  const rawLabel = scheduleLabelFromLine(line);
  let label = rawLabel.replace(/일$/g, "").replace(/ 확인$/g, "");
  if (rawLabel === "일정 확인") label = "가능 날짜/일정 조건";
  const snippet = messageSnippet(line, 82);
  return `${label} 관련하여 이야기 나눔${snippet ? ` · ${snippet}` : ""}`;
}

function scheduleCategoryFromTitle(title = "") {
  if (/업로드|게시/.test(title)) return "upload";
  if (/촬영/.test(title)) return "shoot";
  if (/계약|서명/.test(title)) return "contract";
  if (/가이드/.test(title)) return "guide";
  if (/기획안|콘티|원고/.test(title)) return "plan";
  if (/초안|가편|시안/.test(title)) return "draft";
  if (/최종|컨펌|확정/.test(title)) return "final";
  if (/마감/.test(title)) return "deadline";
  if (/답장|회신/.test(title)) return "reply";
  return "schedule";
}

function scheduleConfidence({ title = "", context = "", tokenContext = "" } = {}) {
  const full = `${title} ${context}`;
  let score = 0;
  if (/확정|컨펌|진행\s*(?:확정|부탁|하겠|해주|가능)|가능합니다|가능할 것|좋습니다|좋은데요|괜찮|맞춰|픽스/i.test(full)) score += 90;
  if (/업로드|게시|촬영|계약|서명|마감|최종/i.test(full)) score += 45;
  if (/전달|공유|보내|수령/i.test(full)) score += 22;
  if (/제안|희망|가능하실까요|가능할까요|문의|검토|혹\b|혹시/i.test(full)) score -= 32;
  if (/->|→|←|피드백\s*및\s*픽스|수정\s*요청|초기|예시|이를테면/i.test(full)) score -= 45;
  if (/확정|컨펌|진행|가능합니다|가능할 것|좋|괜찮|픽스/i.test(tokenContext)) score += 95;
  if (/혹|혹시|가능한\s*컨디션|가능하실까요|가능할까요|희망|문의/i.test(tokenContext)) score -= 75;
  return score;
}

function dealTagColor(deal) {
  const source = normalizedKey(deal?.id || deal?.advertiser || deal?.email || "brand");
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) % 360;
  }
  const hue = (hash + 70) % 360;
  return {
    color: `hsl(${hue} 62% 42%)`,
    bg: `hsl(${hue} 76% 96%)`,
    border: `hsl(${hue} 54% 84%)`,
  };
}

function dealTagStyle(deal) {
  const color = dealTagColor(deal);
  return `--tag-color:${color.color};--tag-bg:${color.bg};--tag-border:${color.border};`;
}

function scheduleEventsForDeal(deal) {
  const messages = dealMessages(deal);
  const events = [];
  for (let messageIndex = 0; messageIndex < messages.length; messageIndex += 1) {
    const message = messages[messageIndex];
    const receivedAt = parseDealDate({ lastTouchIso: message.dateIso, lastTouch: message.date });
    if (receivedAt.getTime() > 0) {
      events.push({
        type: "mail",
        date: receivedAt,
        key: formatCalendarKey(receivedAt),
        deal,
        title: "메일 도착",
        text: `${deal.advertiser} 메일`,
      });
    }

    const baseDate = receivedAt.getTime() > 0 ? receivedAt : parseDealDate(deal);
    const lines = normalizeVisibleMailText(currentMessageText(message))
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      const context = [lines[lineIndex - 1], line, lines[lineIndex + 1]]
        .filter(Boolean)
        .join(" · ");
      if (!/(일정|업로드|게시|촬영|기획안|가이드|마감|초안|가편|최종|계약|서명|회신|답장|\d{1,2}\s*월\s*\d{1,2}\s*일|\d{1,2}\/\d{1,2})/i.test(context)) continue;
      const tokenMatches = [...line.matchAll(/\d{4}[.\-/]\s*\d{1,2}[.\-/]\s*\d{1,2}|\d{1,2}\s*월\s*\d{1,2}\s*일|\b\d{1,2}\/\d{1,2}\b|오늘|내일/g)];
      for (const match of tokenMatches) {
        const token = match[0];
        const date = parseScheduleToken(token, baseDate);
        if (!date || Number.isNaN(date.getTime())) continue;
        const title = scheduleLabelFromLine(context);
        const category = scheduleCategoryFromTitle(title);
        const tokenIndex = match.index || 0;
        const tokenContext = line.slice(Math.max(0, tokenIndex - 22), tokenIndex + token.length + 22);
        events.push({
          type: "schedule",
          date,
          key: formatCalendarKey(date),
          deal,
          title,
          text: scheduleTopicFromLine(context),
          category,
          confidence: scheduleConfidence({ title, context, tokenContext }),
          sourceOrder: messageIndex * 1000 + lineIndex,
        });
      }
    }
  }
  return events;
}

function consolidateScheduleEvents(events = []) {
  const mailEvents = events.filter((event) => event.type !== "schedule");
  const candidates = events
    .filter((event) => event.type === "schedule")
    .filter((event) => {
      if (["upload", "shoot", "contract", "deadline", "final"].includes(event.category)) return event.confidence >= 35;
      if (["plan", "guide", "draft"].includes(event.category)) return event.confidence >= 25;
      return event.confidence >= 95;
    });
  const groups = candidates.reduce((map, event) => {
    const key = [event.deal.id, event.category].join("|");
    const list = map.get(key) || [];
    list.push(event);
    map.set(key, list);
    return map;
  }, new Map());
  const chosen = [...groups.values()].map((list) => list.sort((a, b) => (
    b.confidence - a.confidence ||
    b.sourceOrder - a.sourceOrder ||
    b.date.getTime() - a.date.getTime()
  ))[0]);
  return [...mailEvents, ...chosen];
}

function matchesBrandFilter(deal) {
  return !state.brandFilter || String(deal?.id || "") === state.brandFilter;
}

function dashboardItems() {
  return deals.filter(matchesBrandFilter).map((deal) => {
    const messages = dealMessages(deal);
    const insight = buildDealInsight(deal, messages);
    const priority = dealPriority(deal);
    return {
      deal,
      insight,
      priority,
      lastDate: parseDealDate(deal),
      action: insight.nextSteps[0] || deal.nextAction || "메일 내용 확인하기",
    };
  });
}

function allCalendarEvents() {
  const seen = new Set();
  const rawEvents = deals
    .filter(matchesBrandFilter)
    .flatMap(scheduleEventsForDeal);
  return consolidateScheduleEvents(rawEvents)
    .filter((event) => {
      const key = [event.type, event.key, event.deal.id, event.title, event.text].join("|");
      if (!event.key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

function renderPriorityTasks(items) {
  const tasks = items
    .filter((item) => item.deal.status === "reply" || ["urgent", "soon"].includes(item.priority.level))
    .sort((a, b) => b.priority.score - a.priority.score || b.lastDate.getTime() - a.lastDate.getTime())
    .slice(0, 6);
  if (!tasks.length) return `<p class="dashboard-empty">지금 바로 답장할 메일은 없습니다.</p>`;
  return tasks
    .map((item, index) => {
      const productName = extractProductName(item.deal);
      const action = conciseActionLabel(item.action);
      return `
        <button class="task-card ${escapeAttr(item.priority.level)}" data-id="${escapeAttr(item.deal.id)}" type="button">
          <span class="task-rank">${index + 1}</span>
          <span class="task-body">
            <strong>${escapeHtml(item.deal.advertiser)}</strong>
            <span class="task-product">${escapeHtml(productName)}</span>
            <span>${highlightImportantText(action)}</span>
            <small>${escapeHtml(item.priority.label)} · 마지막 메일 ${escapeHtml(item.deal.lastTouch || formatDashboardDate(item.lastDate))}</small>
          </span>
        </button>
      `;
    })
    .join("");
}

function renderCalendar(events) {
  const today = new Date();
  const viewMonth = new Date(today.getFullYear(), today.getMonth() + state.calendarMonthOffset, 1);
  const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const monthEnd = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0);
  const start = new Date(monthStart);
  start.setDate(1 - monthStart.getDay());
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
  const grouped = events.reduce((map, event) => {
    const list = map.get(event.key) || [];
    list.push(event);
    map.set(event.key, list);
    return map;
  }, new Map());
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `
    <div class="mini-calendar">
      <div class="calendar-head">
        <div class="calendar-nav">
          <button data-calendar-nav="-1" type="button" aria-label="이전 달">‹</button>
          <strong>${viewMonth.getFullYear()}.${viewMonth.getMonth() + 1}</strong>
          <button data-calendar-nav="1" type="button" aria-label="다음 달">›</button>
        </div>
        <button class="calendar-today" data-calendar-nav="today" type="button">이번 달</button>
      </div>
      <p class="calendar-help">날짜를 누르면 그날 잡힌 메일과 일정을 볼 수 있습니다.</p>
      <div class="calendar-weekdays">${weekdays.map((day) => `<span>${day}</span>`).join("")}</div>
      <div class="calendar-grid">
        ${cells.map((date) => {
          const key = formatCalendarKey(date);
          const dayEvents = grouped.get(key) || [];
          const inMonth = date >= monthStart && date <= monthEnd;
          const isToday = key === formatCalendarKey(today);
          const hasSchedule = dayEvents.some((event) => event.type === "schedule");
          const hasMail = dayEvents.some((event) => event.type === "mail");
          const firstDeal = dayEvents[0]?.deal || null;
          return `
            <button class="calendar-day ${inMonth ? "" : "muted-day"} ${isToday ? "today" : ""} ${dayEvents.length ? "has-events" : ""}" data-calendar-day="${key}" style="${firstDeal ? dealTagStyle(firstDeal) : ""}" type="button">
              <span>${date.getDate()}</span>
              <em class="${hasSchedule ? "has-schedule" : hasMail ? "has-mail" : ""}">${dayEvents.length ? dayEvents.length : ""}</em>
            </button>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function dateFromCalendarKey(key = "") {
  const match = String(key).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function renderCalendarEventCard(event) {
  const isSchedule = event.type === "schedule";
  const label = isSchedule ? "일정" : "메일 도착";
  const title = isSchedule ? `${event.deal.advertiser} ${event.title}` : `${event.deal.advertiser} 메일 도착`;
  const text = isSchedule ? event.text : (event.text || event.deal.oneLine || "메일 내용 확인");
  return `
    <button class="calendar-event-card ${isSchedule ? "schedule" : "mail"}" data-calendar-detail-id="${escapeAttr(event.deal.id)}" style="${dealTagStyle(event.deal)}" type="button">
      <span class="calendar-event-type">${label}</span>
      <span>
        <strong>${escapeHtml(title)}</strong>
        <small>${highlightImportantText(text)}</small>
      </span>
    </button>
  `;
}

function renderCalendarModal() {
  const modal = $("#calendarModal");
  if (!modal) return;
  if (!state.selectedCalendarKey) {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    return;
  }
  const date = dateFromCalendarKey(state.selectedCalendarKey);
  const events = allCalendarEvents()
    .filter((event) => event.key === state.selectedCalendarKey)
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "schedule" ? -1 : 1;
      return String(a.deal.advertiser).localeCompare(String(b.deal.advertiser), "ko");
    });
  modal.innerHTML = `
    <div class="calendar-modal-card" role="dialog" aria-modal="true" aria-label="날짜 상세">
      <div class="calendar-modal-head">
        <div>
          <p class="eyebrow">Calendar</p>
          <h2>${date ? escapeHtml(formatDashboardDate(date)) : "선택한 날짜"}</h2>
          <span>${events.length ? `${events.length}개의 메일/일정` : "잡힌 내용 없음"}</span>
        </div>
        <button class="icon-button" data-calendar-close="true" type="button" aria-label="닫기">×</button>
      </div>
      <div class="calendar-modal-list">
        ${events.length ? events.map(renderCalendarEventCard).join("") : `<p class="dashboard-empty">이 날짜에 표시할 메일이나 일정이 없습니다.</p>`}
      </div>
    </div>
  `;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function renderUpcomingEvents(events) {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const upcoming = events
    .filter((event) => event.type === "schedule" && event.date.getTime() >= todayStart - 1000 * 60 * 60 * 24)
    .slice(0, 7);
  if (!upcoming.length) return `<p class="dashboard-empty">메일에서 잡힌 예정 일정이 아직 없습니다.</p>`;
  return upcoming.map((event) => `
    <button class="schedule-item" data-id="${escapeAttr(event.deal.id)}" style="${dealTagStyle(event.deal)}" type="button">
      <time>${escapeHtml(formatDashboardDate(event.date))}</time>
      <span>
        <strong><b class="brand-dot"></b>${escapeHtml(event.deal.advertiser)} ${escapeHtml(event.title)}</strong>
        <small>${highlightImportantText(event.text)}</small>
      </span>
    </button>
  `).join("");
}

function renderBrandTags(events) {
  const counts = events.reduce((map, event) => {
    const id = String(event.deal?.id || "");
    if (!id) return map;
    const current = map.get(id) || { deal: event.deal, count: 0 };
    current.count += 1;
    map.set(id, current);
    return map;
  }, new Map());
  const tags = [...counts.values()]
    .sort((a, b) => b.count - a.count || String(a.deal.advertiser).localeCompare(String(b.deal.advertiser), "ko"))
    .slice(0, 12);
  if (!tags.length) return "";
  return `
    <div class="brand-tags">
      <button class="brand-tag ${state.brandFilter ? "" : "active"}" data-brand-filter="" type="button">전체 <strong>${events.length}</strong></button>
      ${tags.map(({ deal, count }) => `
        <button class="brand-tag ${state.brandFilter === String(deal.id) ? "active" : ""}" data-brand-filter="${escapeAttr(deal.id)}" style="${dealTagStyle(deal)}" type="button">
          <span>${escapeHtml(deal.advertiser)}</span><strong>${count}</strong>
        </button>
      `).join("")}
    </div>
  `;
}

function renderRecentMail(items) {
  return items
    .sort((a, b) => b.lastDate.getTime() - a.lastDate.getTime())
    .slice(0, 5)
    .map((item) => `
      <button class="recent-mail-item" data-id="${escapeAttr(item.deal.id)}" type="button">
        ${avatarMarkup(item.deal.advertiser || item.deal.contact, item.deal.email || item.deal.contact)}
        <span>
          <strong>${escapeHtml(item.deal.advertiser)}</strong>
          <small>${escapeHtml(item.insight.latestSummary || item.deal.oneLine || "내용 확인 필요")}</small>
        </span>
        <time>${escapeHtml(formatDashboardDate(item.lastDate))}</time>
      </button>
    `)
    .join("");
}

function renderHomeDashboard() {
  const items = dashboardItems();
  const events = allCalendarEvents();
  const scopedDeals = deals.filter(matchesBrandFilter);
  const needsReply = scopedDeals.filter((deal) => deal.status === "reply").length;
  const urgent = items.filter((item) => item.deal.status === "reply" && item.priority.level === "urgent").length;
  const upcomingCount = events.filter((event) => event.type === "schedule").length;
  const latest = items.sort((a, b) => b.lastDate.getTime() - a.lastDate.getTime())[0];
  return `
    <div class="home-dashboard">
      <section class="dashboard-hero">
        <div>
          <p class="dashboard-kicker">오늘 먼저 볼 것</p>
          <h2>${urgent ? `급한 답장 ${urgent}개` : needsReply ? `답장할 메일 ${needsReply}개` : "지금은 큰 급한 일 없음"}</h2>
          <p>${state.brandFilter ? `${escapeHtml(items[0]?.deal.advertiser || "선택한 브랜드")} 메일만 보고 있습니다.` : latest ? `${escapeHtml(latest.deal.advertiser)} 메일이 가장 최근에 들어왔습니다.` : "메일을 불러오면 해야 할 일이 여기에 정리됩니다."}</p>
        </div>
        <div class="dashboard-stats">
          <span><strong>${deals.length}</strong><small>전체 대화</small></span>
          <span><strong>${needsReply}</strong><small>내 답장 필요</small></span>
          <span><strong>${upcomingCount}</strong><small>메일 속 일정</small></span>
        </div>
      </section>

      <section class="dashboard-panel tag-panel">
        <div class="dashboard-panel-head">
          <h3>브랜드별 일정 태그</h3>
          <span>누르면 해당 메일만 보기</span>
        </div>
        ${renderBrandTags(allEvents)}
      </section>

      <section class="dashboard-panel priority-panel">
        <div class="dashboard-panel-head">
          <h3>우선으로 할 일</h3>
          <span>중요도순</span>
        </div>
        <div class="task-list">${renderPriorityTasks(items)}</div>
      </section>

      <section class="dashboard-panel calendar-panel">
        <div class="dashboard-panel-head">
          <h3>일정 캘린더</h3>
          <span>초록: 일정 · 회색: 메일</span>
        </div>
        ${renderCalendar(events)}
      </section>

      <section class="dashboard-panel upcoming-panel">
        <div class="dashboard-panel-head">
          <h3>메일에서 잡힌 일정</h3>
          <span>${upcomingCount}개</span>
        </div>
        <div class="schedule-list">${renderUpcomingEvents(events)}</div>
      </section>

      <section class="dashboard-panel recent-panel">
        <div class="dashboard-panel-head">
          <h3>최근 들어온 메일</h3>
          <span>최신순</span>
        </div>
        <div class="recent-mail-list">${renderRecentMail(items)}</div>
      </section>
    </div>
  `;
}

function filteredDeals() {
  const query = state.query.trim().toLowerCase();
  const items = deals
    .filter((deal) => {
      const priority = dealPriority(deal);
      const matchesFilter = dealMatchesFilter(deal, state.filter);
      const matchesBrand = matchesBrandFilter(deal);
      const haystack =
        `${deal.advertiser} ${deal.contact} ${deal.brand} ${deal.statusLabel} ${deal.oneLine} ${priority.label}`.toLowerCase();
      return matchesBrand && matchesFilter && (!query || haystack.includes(query));
    });
  return sortForCurrentFilter(items);
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
  $("#statusFilters").innerHTML = [
    `<button class="${state.view === "dashboard" ? "active" : ""}" data-home="true" type="button"><span>대시보드</span><strong>⌂</strong></button>`,
    ...statusLabels
    .map(
      ([id, label]) => {
        const count = deals.filter((deal) => dealMatchesFilter(deal, id)).length;
        return `<button class="${state.view !== "dashboard" && state.filter === id ? "active" : ""}" data-filter="${id}" type="button"><span>${label}</span><strong>${count}</strong></button>`;
      },
    ),
  ].join("");
}

function renderList() {
  const title = document.querySelector(".mail-toolbar strong");
  if (title) title.textContent = state.view === "dashboard" ? "오늘의 대시보드" : "광고주 대화";

  if (state.view === "dashboard") {
    $("#resultCount").textContent = `${deals.length}건`;
    $("#dealList").innerHTML = deals.length
      ? renderHomeDashboard()
      : `<div class="empty-list">${state.lastError ? `${escapeHtml(state.lastError)}. 새로고침을 다시 눌러보세요.` : "메일을 불러오고 있습니다."}</div>`;
    return;
  }

  const items = filteredDeals();
  if (!items.some((deal) => deal.id === state.selectedId) && items[0]) {
    state.selectedId = items[0].id;
  }

  $("#resultCount").textContent = `${items.length}건`;
  if (!items.length) {
    const message = state.lastError
      ? `${state.lastError}. 새로고침을 다시 눌러보세요.`
      : "표시할 광고 메일이 없습니다.";
    $("#dealList").innerHTML = `<div class="empty-list">${escapeHtml(message)}</div>`;
    return;
  }
  $("#dealList").innerHTML = items
    .map(
      (deal) => {
        const messages = Array.isArray(deal.messages) ? deal.messages : fallbackMessages(deal);
        const insight = buildDealInsight(deal, messages);
        const priority = dealPriority(deal);
        const primaryAction = insight.nextSteps[0] || deal.nextAction || "내용 확인하기";
        const preview = insight.latestSummary || deal.oneLine || deal.brand || "";
        return `
        <div class="deal-row ${state.selectedId === deal.id ? "active" : ""}">
          <button class="deal-button" data-id="${escapeAttr(deal.id)}" type="button">
            ${avatarMarkup(deal.advertiser || deal.contact, deal.email || deal.contact)}
            <span class="deal-content">
              <span class="deal-title">
                <strong>${escapeHtml(deal.advertiser)}</strong>
                <span class="badge ${deal.status}">${escapeHtml(deal.statusLabel)}</span>
              </span>
              <span class="deal-priority ${escapeAttr(priority.level)}">${escapeHtml(priority.label)} · ${Math.round(priority.score)}점</span>
              <span class="deal-action">${escapeHtml(primaryAction)}</span>
              <span class="deal-preview">${escapeHtml(preview)}</span>
              <span class="deal-meta">마지막 메일 ${escapeHtml(deal.lastTouch)}</span>
            </span>
          </button>
          <span class="deal-row-actions">
            <button class="archive-deal" data-archive-id="${escapeAttr(deal.id)}" aria-label="${escapeAttr(deal.advertiser)} 보관" title="보관" type="button">⌄</button>
            <button class="delete-deal" data-delete-id="${escapeAttr(deal.id)}" aria-label="${escapeAttr(deal.advertiser)} 삭제" title="삭제" type="button">×</button>
          </span>
        </div>
      `;
      },
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

function subjectParticle(value = "") {
  const text = String(value || "").trim();
  const last = text.charCodeAt(text.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return "가";
  return (last - 0xac00) % 28 === 0 ? "가" : "이";
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

function compactSummary(text = "", length = 74) {
  const snippet = messageSnippet(text, length).replace(/[.。]\s*$/g, "");
  return snippet || "원문 확인 필요";
}

function uniqueItems(items, limit = 6) {
  const seen = new Set();
  return items
    .map((item) => (typeof item === "string" ? item.trim() : item))
    .filter((item) => {
      const text = conditionText(item);
      const key = text.toLowerCase();
      if (!text || seen.has(key)) return false;
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

function hasRevisionRequest(clean = "") {
  return (
    /(기획안|제안서|가이드|콘티|시안|원고)[^\n]{0,90}(수정\s*필요|수정이\s*필요|수정\s*코멘트|코멘트\s*달|피드백|검토\s*의견|수정\s*의견|반영\s*부탁|반영\s*요청)/.test(clean) ||
    /(수정\s*필요|수정이\s*필요|수정\s*코멘트|코멘트\s*달|피드백|검토\s*의견|수정\s*의견)[^\n]{0,90}(기획안|제안서|가이드|콘티|시안|원고)/.test(clean)
  );
}

function isInitialProposal(clean = "") {
  const proposal =
    /(광고|협업|협찬|브랜디드|PPL|캠페인|제품\s*제공|제품\s*협찬|제안|문의|콜라보|partnership|collaboration|campaign|sponsor)/i.test(clean) &&
    /(제안|문의|연락|진행|협업|캠페인|브랜드|제품|소개|광고|협찬|partnership|collaboration|campaign|sponsor)/i.test(clean);
  const active =
    /(계약서|전자계약|서명|날인|기획안\s*전달|가편|최종본|업로드\s*확정|촬영\s*진행|촬영용\s*제품|제품\s*수령|피드백\s*및\s*픽스|수정\s*코멘트|코멘트\s*달)/.test(clean);
  return proposal && !active;
}

function firstSentence(text = "", length = 96) {
  const clean = normalizeVisibleMailText(text).replace(/\s+/g, " ").trim();
  const sentence = clean.split(/(?:다\.|요\.|니다\.|[!?]\s)/)[0] || clean;
  return sentence.slice(0, length).trim();
}

function extractQuotedNames(text = "") {
  return [...String(text || "").matchAll(/[<《「『'“‘"]([^<》」』'”’"]{2,50})[>》」』'”’"]/g)]
    .map((match) => match[1].replace(/\s+/g, " ").trim())
    .filter((item) => !/https?|mailto|@|유소|크리에이터|youtube|instagram/i.test(item));
}

function proposalSubject(text = "") {
  const clean = normalizeVisibleMailText(text);
  const quoted = extractQuotedNames(clean).find((item) => /(젤리|식품|제품|서비스|브랜드|캠페인|PPL|콘텐츠|앱|플랫폼|클렌징|치약|세럼|크림|샴푸|영양제|기기|투어|호텔|숙소|가전|생활|뷰티|푸드)/i.test(item));
  if (quoted) return quoted;
  const patterns = [
    /(?:브랜드|제품|서비스|캠페인)\s*(?:명|이름)?\s*[:：]?\s*([^\n.]{2,60})/,
    /(?:진행하는|준비\s*중인)\s*([^\n.]{2,60}?(?:브랜드|캠페인|제품|서비스|프로모션))/,
    /([가-힣A-Za-z0-9&+\s]{2,40}?(?:젤리|식품|제품|서비스|캠페인|브랜드|PPL|콘텐츠|앱|플랫폼|클렌징|치약|세럼|크림|샴푸|영양제|기기))/
  ];
  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (match?.[1]) return match[1].replace(/\s+/g, " ").replace(/^(관련|대한|있는)\s*/, "").trim().slice(0, 60);
  }
  return "";
}

function requestedRateLabels(text = "") {
  const clean = normalizeVisibleMailText(text);
  const labels = [];
  if (/브랜디드|브랜드\s*콘텐츠|단독\s*기획/i.test(clean)) labels.push("branded");
  if (/기획\s*PPL|기획형\s*PPL|기획\s*피피엘|제품\s*3분|3분\s*노출/i.test(clean)) labels.push("plannedPpl");
  if (/(?:일반|단순)\s*PPL|콘텐츠\s*내\s*언급|기획\s*참여\s*불가/i.test(clean)) labels.push("generalPpl");
  if (/쇼츠|shorts/i.test(clean)) labels.push("shorts");
  if (/숏폼\s*패키지|(?:쇼츠|shorts)[^\n]{0,30}(?:릴스|reels)[^\n]{0,30}(?:틱톡|tiktok)|(?:릴스|reels)[^\n]{0,30}(?:틱톡|tiktok)/i.test(clean)) labels.push("shortPackage");
  if (/브랜디드\s*콘텐츠?\s*\+\s*(?:파생\s*)?쇼츠\s*패키지|파생\s*쇼츠\s*패키지/i.test(clean)) labels.push("brandedShorts");
  if (/2차\s*활용|구글애즈|메타|틱톡\s*광고|광고\s*소재|소재\s*활용/i.test(clean)) labels.push("usage");
  if (!labels.length && /광고비|단가|견적|비용|금액|rate|fee|budget/i.test(clean)) {
    const formats = inferContentFormat(clean);
    if (/브랜디드/.test(formats)) labels.push("branded");
    if (/기획 PPL|PPL/.test(formats)) labels.push("plannedPpl");
    if (/쇼츠/.test(formats)) labels.push("shorts");
  }
  return uniqueItems(labels, 8);
}

function rateLinesForLabels(labels = []) {
  const rateMap = {
    branded: "브랜디드 콘텐츠: 400만원 (VAT 별도)",
    plannedPpl: "기획형 PPL (제품 3분 노출): 300만원 (VAT 별도)",
    generalPpl: "일반 PPL (콘텐츠 내 언급 및 노출 / 기획 참여 불가): 150만원 (VAT 별도)",
    shorts: "쇼츠 콘텐츠: 150만원 (VAT 별도)",
    shortPackage: "숏폼 패키지 (유튜브 쇼츠 + 릴스 + 틱톡): 300만원 (VAT 별도)",
    brandedShorts: "브랜디드 콘텐츠 + 파생 쇼츠 패키지 (유튜브): 500만원 (VAT 별도)",
  };
  const out = labels.filter((label) => label !== "usage").map((label) => rateMap[label]).filter(Boolean);
  if (labels.includes("usage")) {
    out.push("2차 활용 비용(구글애즈, 메타, 틱톡 가능 / 최종 영상 그대로 사용 조건)");
    out.push("- 1개월: 100만원 (VAT 별도)");
    out.push("- 3개월: 200만원 (VAT 별도)");
  }
  return out;
}

function proposalSummaryItems(text = "", latestExternal = {}) {
  const clean = normalizeVisibleMailText(text);
  const subject = proposalSubject(clean);
  const formats = inferContentFormat(clean);
  const rateLabels = requestedRateLabels(clean);
  const items = [];
  if (subject) items.push(`제안 내용: ${subject} 관련 광고/협업 문의`);
  else items.push(`제안 내용: ${firstSentence(clean, 86)}`);
  if (formats) items.push(`희망 형태: ${formats}`);
  if (rateLabels.length) {
    const names = rateLabels
      .filter((label) => label !== "usage")
      .map((label) => ({
        branded: "브랜디드",
        plannedPpl: "기획형 PPL",
        generalPpl: "일반 PPL",
        shorts: "쇼츠",
        shortPackage: "숏폼 패키지",
        brandedShorts: "브랜디드+쇼츠 패키지",
      })[label])
      .filter(Boolean);
    items.push(`요청: ${names.length ? `${names.join(", ")} 단가` : "광고 단가"}${rateLabels.includes("usage") ? "와 2차 활용 비용" : ""} 확인`);
  } else if (/광고비|단가|견적|비용|금액|rate|fee|budget/i.test(clean)) {
    items.push("요청: 광고비/진행 비용 안내");
  }
  if (/일정|업로드|촬영|게시|마감|희망\s*일|스케줄/i.test(clean)) items.push("요청: 촬영/업로드 가능 일정 확인");
  if (/진행\s*가능|가능\s*여부|참여|검토|관심|회신|답변|문의/i.test(clean)) items.push("요청: 진행 가능 여부 회신");
  return uniqueItems(items, 4);
}

function latestIntent(text = "") {
  const clean = normalizeVisibleMailText(text);
  return {
    clean,
    initialProposal: isInitialProposal(clean),
    revision: hasRevisionRequest(clean),
    productSelect: /(상품|제품|물품|링크|리스트|카탈로그).*(추가|선택|셀렉|확인|골라|고르|담아)|(?:추가|선택|셀렉|확인|골라|고르|담아).*(상품|제품|물품|링크|리스트|카탈로그)/i.test(clean),
    contract: /계약|서명|날인|계약서|동의서|세금계산서|사업자등록증|통장사본/.test(clean),
    shipping: /주소|배송지|수령|연락처|성함|전화번호|수취인|택배|발송|출고/.test(clean),
    money: /비용|광고비|단가|견적|페이백|현금|VAT|무상|유상|금액|입금|정산|원고료|협찬비/.test(clean),
    schedule: /일정|가능|마감|촬영|업로드|게시|릴리즈|진행일|이번\s*주|다음\s*주|금주|오늘|내일|오전|오후/.test(clean),
    guide: /가이드라인|가이드|제품\s*정보|제품정보|레퍼런스|주의사항|필수\s*멘트|해시태그|태그|링크|성과|코드/.test(clean),
    approval: /확정|승인|컨펌|오케이|좋습니다|진행\s*부탁|그대로\s*진행|문제\s*없|괜찮/.test(clean),
    waitingReply: /회신|답장|확인\s*부탁|검토\s*부탁|말씀\s*부탁|전달\s*부탁|알려\s*주|문의|요청|가능하실까요|어떠실까요|reply|respond|confirm|check/i.test(clean),
  };
}

function inferNeed(text = "") {
  const intent = latestIntent(text);
  if (intent.initialProposal) return "광고 제안 내용을 확인하고 진행 여부를 답장하기";
  if (intent.revision) return "기획안/가이드 수정 요청을 확인해서 반영하기";
  if (intent.productSelect) return "제품 링크를 확인하고 선택 결과를 회신하기";
  if (intent.contract) return "계약/서명/정산 요청을 확인해서 처리하기";
  if (intent.shipping) return "배송지/연락처 정보를 확인해서 보내기";
  if (intent.money) return "비용과 제공 조건이 맞는지 확인해서 답장하기";
  if (intent.guide) return "가이드와 진행 조건을 확인하고 필요한 자료를 정리하기";
  if (intent.schedule || intent.approval) return "가능 일정과 진행 여부를 답장하기";
  return "제안 내용을 검토하고 진행 여부를 답장하기";
}

function latestActionSteps(text = "", need = "") {
  const intent = latestIntent(text);
  const steps = [];
  if (intent.initialProposal) {
    steps.push("제품/브랜드가 유소 채널과 맞는지 보기");
    steps.push("진행 가능하면 광고비와 일정 조건 답장하기");
    if (intent.schedule) steps.push("희망 촬영/업로드 날짜 확인하기");
    return uniqueItems(steps, 4);
  }
  if (intent.revision) {
    steps.push("기획안 코멘트 열어서 수정할 부분 보기");
    steps.push("수정 반영 후 진행 가능 여부 답장하기");
  }
  if (intent.productSelect) {
    steps.push("제품 링크 열고 원하는 제품 고르기");
    steps.push("고른 제품을 답장하기");
  }
  if (intent.contract) steps.push("계약서/서명 요청 확인하기");
  if (intent.shipping) steps.push("주소/연락처 보내기");
  if (intent.money) steps.push("광고비/VAT/제품 제공 조건 확인하기");
  if (intent.guide) steps.push("가이드 필수 문구 체크하기");
  if (intent.schedule) steps.push("촬영/업로드 가능한 날짜 확인하기");
  steps.push(need);
  steps.push("답장 전 최신 원문 한 번 더 보기");
  return uniqueItems(steps, 4);
}

function cleanProductName(value = "") {
  return String(value || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[#*_`"'“”‘’()[\]{}<>]/g, " ")
    .replace(/\b(?:제품|상품|브랜드|서비스|캠페인|협업|광고|제안|문의|진행|가능|확인|부탁|드립니다|입니다|관련|소개|콘텐츠|유튜브|채널)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
}

function extractProductName(deal, messages = dealMessages(deal)) {
  const latest = currentMessageText(latestExternalMessage(deal));
  const full = normalizeVisibleMailText([
    deal?.brand,
    deal?.oneLine,
    deal?.nextAction,
    latest,
  ].join("\n"));
  const patterns = [
    /(?:브랜드|제품|상품|서비스|캠페인)\s*(?:명|이름)?\s*[:：]\s*([^\n.,。]{2,32})/i,
    /['"“”‘’]([^'"“”‘’]{2,28})['"“”‘’]\s*(?:제품|상품|브랜드|서비스|캠페인)/i,
    /([가-힣A-Za-z0-9][가-힣A-Za-z0-9\s+·&-]{1,28})\s*(?:제품|상품|브랜드|서비스|캠페인|협업|광고|PPL)/i,
    /(?:폼\s*클렌징|클렌징폼|선크림|크림|세럼|앰플|마스크팩|샴푸|치약|칫솔|영양제|다이어트|림핏|비플레인|라이트앤조이|렌트리|모두닥|갓튜버|알파컷|카투어|원더라이프)/i,
  ];
  for (const pattern of patterns) {
    const match = full.match(pattern);
    if (match) {
      const value = cleanProductName(match[1] || match[0]);
      if (value && value.length >= 2) return value;
    }
  }
  const brand = cleanProductName(deal?.brand);
  if (brand && !/gmail|메일|광고/i.test(brand)) return brand;
  return "제품/브랜드";
}

function conciseActionLabel(action = "") {
  const text = String(action || "").trim();
  if (/제품 링크|원하는 제품|고른 제품|선택 결과/.test(text)) return "제품 선택해서 답장해야 함";
  if (/채널과 맞는지|진행 여부|제안 내용|검토/.test(text)) return "협업 가능한지 확인해야 함";
  if (/광고비|비용|VAT|제공 조건/.test(text)) return "광고비와 조건 확인해야 함";
  if (/계약|서명|정산/.test(text)) return "계약/서명 처리해야 함";
  if (/주소|연락처|배송/.test(text)) return "배송 정보 보내야 함";
  if (/촬영|업로드|일정|날짜/.test(text)) return "가능 일정 확인해야 함";
  if (/가이드|필수 문구|자료/.test(text)) return "가이드 조건 확인해야 함";
  if (/수정|코멘트|반영/.test(text)) return "수정 요청 확인해야 함";
  return text.replace(/하기$/g, "해야 함").replace(/보기$/g, "확인해야 함") || "메일 확인해야 함";
}

function progressFromLatest(text = "", sender = "상대", lastFromMe = false, need = "") {
  const intent = latestIntent(text);
  if (lastFromMe) return `내 답장 완료 · ${sender} 답장 기다리는 중`;
  if (intent.initialProposal) return "새 광고 제안 · 진행할지 확인하면 됨";
  if (intent.revision) return "답장 필요 · 수정 요청 확인 후 가능 여부 답장";
  if (intent.productSelect) {
    return "답장 필요 · 제품 고르고 답장";
  }
  if (intent.contract) return "답장 필요 · 계약서/서명 확인";
  if (intent.shipping) return "답장 필요 · 배송 정보 보내기";
  if (intent.money) return "답장 필요 · 광고비/제공 조건 확인";
  if (intent.guide) return "확인 필요 · 가이드 필수 조건 체크";
  if (intent.schedule || intent.approval) return "답장 필요 · 일정과 진행 여부 답장";
  return `답장 필요 · ${need}`;
}

function conversationSummaryFromLatest(messages, latestExternal, latestMine, latestText = "") {
  const cleanLatest = normalizeVisibleMailText(latestText);
  const intent = latestIntent(cleanLatest);
  const mineText = currentMessageText(latestMine || {});
  const firstText = currentMessageText(messages[0] || {});
  const items = [];

  if (intent.revision) {
    items.push("최근: 상대가 수정 코멘트를 보냈고, 반영 가능 여부를 기다림");
    if (/그대로\s*촬영\s*진행|촬영\s*진행/.test(cleanLatest)) items.push("진행: 큰 문제 없으면 그대로 촬영 진행 가능");
  } else if (intent.initialProposal) {
    items.push(...proposalSummaryItems(cleanLatest, latestExternal));
  } else if (intent.productSelect) {
    items.push("최근: 제품 링크 확인 후 선택 결과를 달라고 함");
  } else if (intent.contract) {
    items.push("최근: 계약서/서명 또는 정산 자료 확인 단계");
  } else if (intent.shipping) {
    items.push("최근: 제품 발송용 배송 정보를 요청함");
  } else if (intent.money) {
    items.push("최근: 광고비와 제공 조건을 확인해야 함");
  } else if (intent.guide) {
    items.push("최근: 가이드/필수 조건을 확인해달라고 함");
  } else if (intent.schedule || intent.approval) {
    items.push("최근: 일정 또는 진행 가능 여부 답장을 기다림");
  } else if (cleanLatest) {
    items.push(`최근: ${compactSummary(cleanLatest, 96)}`);
  }

  if (/가이드라인|가이드|제품\s*정보|제품정보|촬영용\s*제품|제품.*받/.test(mineText)) {
    items.push("내 답장: 가이드/제품 정보를 확인했다고 보냄");
  } else if (mineText) {
    items.push(`내 답장: ${compactSummary(mineText, 86)}`);
  }

  if (intent.initialProposal) {
    // The proposal summary above already captures the concrete request.
  } else if (/선물|제품.*보내|협업|광고|브랜드|캠페인|PPL/i.test(firstText)) {
    items.push("시작: 브랜드가 광고/협업 제안으로 연락함");
  } else if (firstText && firstText !== cleanLatest) {
    items.push(`시작: ${compactSummary(firstText, 86)}`);
  }

  return uniqueItems(items, 4);
}

function conversationSummaryAfterMyReply(messages, latestText = "") {
  const firstText = currentMessageText(messages[0] || {});
  const items = [];
  if (latestText) items.push(`최근 내 답장: ${compactSummary(latestText, 96)}`);
  items.push("현재: 내 답장은 보냈고 상대 답장 기다리는 중");
  if (/질문|궁금|확인|가능|사용법|권장|문의/.test(latestText)) {
    items.push("다음: 상대가 답하면 조건이 바뀌었는지 확인");
  }
  if (/선물|제품.*보내|협업|광고|브랜드|캠페인|PPL/i.test(firstText)) {
    items.push("시작: 브랜드가 광고/협업 제안으로 연락함");
  } else if (firstText && firstText !== latestText) {
    items.push(`시작: ${compactSummary(firstText, 86)}`);
  }
  return uniqueItems(items, 4);
}

function formatScheduleDate(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\((?:월|화|수|목|금|토|일)\)/g, "")
    .trim();
}

function latestMatch(text = "", pattern) {
  const matches = [...String(text || "").matchAll(pattern)];
  return matches.length ? matches[matches.length - 1] : null;
}

function inferContentFormat(text = "") {
  const clean = normalizeVisibleMailText(text);
  const formats = [];
  if (/브랜디드|브랜드\s*콘텐츠|branded/i.test(clean)) formats.push("브랜디드 콘텐츠");
  if (/기획\s*PPL|기획피피엘|기획\s*피피엘/i.test(clean)) formats.push("기획 PPL");
  else if (/\bPPL\b|피피엘/i.test(clean)) formats.push("PPL");
  if (/릴스|reels/i.test(clean)) formats.push("릴스");
  if (/쇼츠|shorts/i.test(clean)) formats.push("쇼츠");
  if (/피드/.test(clean)) formats.push("피드");
  if (/블로그/.test(clean)) formats.push("블로그");
  if (/공동구매|공구/.test(clean)) formats.push("공동구매");
  return uniqueItems(formats, 3).join(" + ");
}

function inferContractStatus(text = "") {
  const clean = normalizeVisibleMailText(text);
  if (/계약서[^\n]{0,40}(작성\s*전|작성전|전임|아직|미작성)|작성\s*전[^\n]{0,20}계약서/.test(clean)) return "계약서 미작성";
  if (/계약서[^\n]{0,40}(서명\s*완료|날인\s*완료|체결|완료)|(?:서명|날인|체결)[^\n]{0,30}(완료|되었습니다|했습니다)/.test(clean)) return "계약서 서명/체결 완료";
  if (/계약서[^\n]{0,40}(작성|서명|날인|요청|전달)|(?:서명|날인)[^\n]{0,30}요청/.test(clean)) return "계약서 확인/서명 필요";
  if (/계약|서명|날인/.test(clean)) return "계약서 여부 확인 필요";
  return "";
}

function plausibleAmountText(matchText = "") {
  const text = String(matchText || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (/광고비|비용|금액|협력\s*금액|진행|조건|정산|입금|제품\s*\d+\s*(?:대|개)?\s*\+|\$|vat/i.test(text)) return text;
  const amount = text.match(/(\d{1,4})\s*만/);
  if (amount && Number(amount[1]) >= 50) return text;
  if (/\d+\s*원/.test(text) && !/만\s*원/.test(text)) return "";
  return "";
}

function conditionItem(text = "", messageIndex = -1) {
  return { text: String(text || "").trim(), messageIndex };
}

function conditionText(item) {
  return typeof item === "string" ? item : String(item?.text || "");
}

function findSourceMessageIndex(messages = [], patternOrText) {
  if (!Array.isArray(messages) || !messages.length) return -1;
  for (let index = messages.length - 1; index >= 0; index--) {
    const text = currentMessageText(messages[index]);
    if (patternOrText instanceof RegExp) {
      if (patternOrText.test(text)) return index;
      patternOrText.lastIndex = 0;
    } else if (patternOrText && text.includes(String(patternOrText).slice(0, 80))) {
      return index;
    }
  }
  return -1;
}

function latestMessageMatch(messages = [], pattern) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const text = currentMessageText(messages[index]);
    const matches = [...text.matchAll(pattern)];
    if (matches.length) return { match: matches[matches.length - 1], index };
  }
  return { match: latestMatch(messages.map(currentMessageText).join("\n"), pattern), index: -1 };
}

function extractDealTerms(messages = [], latestText = "", allText = "") {
  const cleanAll = normalizeVisibleMailText(allText);
  const cleanLatest = normalizeVisibleMailText(latestText);
  const combined = `${cleanAll}\n${cleanLatest}`;
  const items = [];

  const format = inferContentFormat(combined);
  const amountPattern = /(?:제품\s*\d+\s*(?:대|개)?\s*\+\s*)?(?:(?:광고비|비용|금액|협력\s*금액|진행|조건)[^\n]{0,24}?)?(?:\d{1,3}(?:,\d{3})*|\d+)\s*만\s*원?\s*(?:\(?\s*vat\s*(?:별도|포함)?\s*\)?)?|(?:제품\s*\d+\s*(?:대|개)?\s*\+\s*)?(?:\d{1,3}(?:,\d{3})*|\d+)\s*만원?\s*(?:\(?\s*vat\s*(?:별도|포함)?\s*\)?)?|(?:\d{1,3}(?:,\d{3})*|\d+)\s*원\s*(?:\(?\s*vat\s*(?:별도|포함)?\s*\)?)?|\$\s*(?:\d{1,3}(?:,\d{3})*|\d+)|(?:\d{2,4})\s*(?:vat|VAT)\s*(?:별도|포함)/g;
  const amountCandidates = messages.flatMap((message, index) => {
    const text = currentMessageText(message);
    return [...text.matchAll(amountPattern)]
      .map((match) => ({ text: plausibleAmountText(match[0]).replace(/\s+\)/g, ")"), index }))
      .filter((item) => item.text);
  });
  const amountText = amountCandidates.length ? amountCandidates[amountCandidates.length - 1].text : "";
  const amountIndex = amountCandidates.length ? amountCandidates[amountCandidates.length - 1].index : -1;
  if (format || amountText) {
    const formatIndex = findSourceMessageIndex(messages, /브랜디드|브랜드\s*콘텐츠|기획\s*PPL|\bPPL\b|릴스|쇼츠|피드|블로그|공동구매|공구/i);
    items.push(conditionItem(`진행 조건: ${[format, amountText].filter(Boolean).join(" · ")}`, amountIndex >= 0 ? amountIndex : formatIndex));
  }

  const uploadFound = latestMessageMatch(messages, /(?:업로드|게시|최종본\s*확인\s*및\s*업로드)[^\n]{0,26}?(\d{1,2}\s*월\s*\d{1,2}\s*일|\d{1,2}\/\d{1,2}|\d{4}[.\-]\s*\d{1,2}[.\-]\s*\d{1,2})|(?:\d{1,2}\s*월\s*\d{1,2}\s*일|\d{1,2}\/\d{1,2})[^\n]{0,18}(?:업로드|게시)/g);
  if (uploadFound.match) items.push(conditionItem(`업로드: ${formatScheduleDate(uploadFound.match[0])}`, uploadFound.index));

  const exposureFound = latestMessageMatch(messages, /(?:초반\s*)?\d+\s*(?:~|-)?\s*\d*\s*분대?\s*노출|\d+\s*분\s*이상\s*노출|노출\s*희망[^\n]{0,24}/g);
  if (exposureFound.match) items.push(conditionItem(`노출: ${formatScheduleDate(exposureFound.match[0])}`, exposureFound.index));

  const contractStatus = inferContractStatus(combined);
  if (contractStatus) items.push(conditionItem(`계약서: ${contractStatus}`, findSourceMessageIndex(messages, /계약서|계약|서명|날인|동의서/)));

  const milestoneRules = [
    ["가이드", /(?:가이드|가이드라인)[^\n]{0,24}?(\d{1,2}\s*월\s*\d{1,2}\s*일|\d{1,2}\/\d{1,2}|전달|확인)/g],
    ["기획안", /(?:기획안|콘티|원고)[^\n]{0,32}?(\d{1,2}\s*월\s*\d{1,2}\s*일|\d{1,2}\/\d{1,2}|전달|수정|코멘트|확인|작성|진행)/g],
  ];
  for (const [label, pattern] of milestoneRules) {
    const found = latestMessageMatch(messages, pattern);
    if (!found.match) continue;
    let text = formatScheduleDate(found.match[0]);
    if (label === "기획안") {
      if (/수정|코멘트|피드백/.test(text)) text = "수정 요청 확인 필요";
      else if (/전달|작성/.test(text)) text = "작성/전달 진행 중";
    }
    items.push(conditionItem(`${label}: ${text}`, found.index));
  }

  const productIndex = findSourceMessageIndex(messages, /촬영용\s*제품|제품.*받|제품.*수령/);
  if (productIndex >= 0) items.push(conditionItem("제품: 촬영용 제품 수령 완료", productIndex));
  const addressIndex = findSourceMessageIndex(messages, /주소[^\n]{0,20}(전달|확인)|기존.*주소|배송지.*전달/);
  if (addressIndex >= 0) items.push(conditionItem("배송: 주소 전달/확인 완료", addressIndex));

  return uniqueItems(items, 6);
}

function conditionSummaryFromLatest(latestText = "", allText = "", mineText = "", messages = []) {
  const latest = normalizeVisibleMailText(latestText);
  const intent = latestIntent(latest);
  const all = normalizeVisibleMailText(allText);
  const mine = normalizeVisibleMailText(mineText);
  const items = extractDealTerms(messages, latest, all);

  if (intent.revision) items.push(conditionItem("현재 단계: 기획안/가이드 수정 코멘트 반영", findSourceMessageIndex(messages, /수정|코멘트|피드백|기획안|가이드/)));
  if (intent.productSelect) items.push(conditionItem("제품: 링크 확인 후 선택 결과 회신 필요", findSourceMessageIndex(messages, /제품|상품|링크|셀렉|선택/)));
  if (intent.contract) items.push(conditionItem("계약/정산: 요청 문서 확인 및 처리 필요", findSourceMessageIndex(messages, /계약|서명|날인|정산|세금계산서/)));
  if (intent.shipping) items.push(conditionItem("배송: 전달 가능한 배송지/연락처 확인 필요", findSourceMessageIndex(messages, /배송지|주소|연락처|수령|성함/)));
  if (intent.money) items.push(conditionItem("비용: 광고비/제공 조건 확인 또는 조율 필요", findSourceMessageIndex(messages, /광고비|비용|금액|정산|VAT/)));
  if (intent.guide) items.push(conditionItem("가이드: 필수 조건과 레퍼런스 확인 필요", findSourceMessageIndex(messages, /가이드|레퍼런스|필수|해시태그/)));
  if (/그대로\s*촬영\s*진행|촬영\s*진행/.test(latest)) items.push(conditionItem("진행: 반영 어려운 부분이 없으면 그대로 촬영 진행", findSourceMessageIndex(messages, /그대로\s*촬영\s*진행|촬영\s*진행/)));
  if (/촬영용\s*제품|제품.*받|제품.*수령/.test(mine)) items.push(conditionItem("제품: 촬영용 제품 수령 완료", findSourceMessageIndex(messages, /촬영용\s*제품|제품.*받|제품.*수령/)));

  return uniqueItems(items.length ? items : extractConditions(latest || all), 6);
}

function salutationName(value = "") {
  return senderName(value).replace(/\s*담당자\s*$/g, "").trim() || "담당자";
}

function draftFromLatest(latestText = "", sender = "담당자", need = "", options = {}) {
  const intent = latestIntent(latestText);
  if (intent.initialProposal) {
    const name = salutationName(sender);
    const subject = proposalSubject(latestText) || "보내주신 캠페인";
    const rateLines = rateLinesForLabels(requestedRateLabels(latestText));
    const intro = options.isFirstReply
      ? `안녕하세요 ${name} 담당자님!\n유튜브 채널 유소를 운영하고 있는 유소정입니다^^`
      : `안녕하세요 ${name} 담당자님!\n유소정입니다☺️`;
    const rateBlock = rateLines.length ? `\n\n비용은 아래와 같습니다.\n\n${rateLines.join("\n")}` : "";
    return `${intro}\n\n제 콘텐츠를 좋게 봐주시고 연락 주셔서 감사합니다.\n보내주신 ${subject} 제안 잘 확인했습니다.\n\n유소 채널의 자연스러운 일상 콘텐츠 흐름 안에서 제품과 브랜드의 장점을 잘 풀어낼 수 있을지 검토해보겠습니다.${rateBlock}\n\n궁금하신 점이나 협의가 필요하신 부분이 있으면 편하게 연락 부탁드립니다.\n\n감사합니다.\n유소정 드림`;
  }
  if (intent.revision) {
    return `안녕하세요, ${sender}님.\n\n기획안에 남겨주신 수정 코멘트 확인했습니다.\n말씀주신 부분 반영해서 진행하겠습니다.\n\n혹시 반영이 어려운 부분이 생기면 바로 다시 말씀드리고,\n특이사항 없으면 기존 일정대로 촬영 진행하겠습니다.\n\n감사합니다.\n유소정 드림`;
  }
  if (intent.productSelect) {
    return `안녕하세요, ${sender}님.\n\n보내주신 제품 링크 확인했습니다.\n추가된 항목까지 다시 살펴보고 선택 가능한 제품 정리해서 회신드리겠습니다.\n\n감사합니다.\n유소정 드림`;
  }
  if (intent.contract) {
    return `안녕하세요, ${sender}님.\n\n보내주신 계약/서명 관련 내용 확인했습니다.\n문서 내용 확인 후 서명 진행하겠습니다.\n\n감사합니다.\n유소정 드림`;
  }
  if (intent.shipping) {
    return `안녕하세요, ${sender}님.\n\n배송 정보 확인해서 전달드립니다.\n\n이름: 유소정\n연락처: 010-4270-4573\n주소: [확인 후 입력]\n\n감사합니다.\n유소정 드림`;
  }
  if (intent.money) {
    return `안녕하세요, ${sender}님.\n\n제안 주신 비용 및 제공 조건 확인했습니다.\n내부적으로 진행 가능 여부와 조건을 검토한 뒤 회신드리겠습니다.\n\n조정이 필요한 부분이 있으면 함께 정리해서 말씀드리겠습니다.\n\n감사합니다.\n유소정 드림`;
  }
  if (intent.guide) {
    return `안녕하세요, ${sender}님.\n\n보내주신 가이드라인과 진행 조건 확인했습니다.\n필수로 반영해야 하는 부분 체크해서 기획안과 촬영 준비에 반영하겠습니다.\n\n확인 중 궁금한 점이 생기면 다시 문의드리겠습니다.\n\n감사합니다.\n유소정 드림`;
  }
  return `안녕하세요, ${sender}님.\n\n제안 주신 내용 확인했습니다. ${need.replace(/기$/, "겠습니다")}.\n\n진행 전 아래 내용만 한 번 더 확인 부탁드립니다.\n- 진행 방식/콘텐츠 형태\n- 일정 및 업로드 마감\n- 제공 제품과 비용 조건\n\n확인해주시면 검토 후 답장드리겠습니다.\n\n감사합니다.\n유소정 드림`;
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
  const referenceText = lastFromMe ? latestText : latestExternalText || latestText;
  const conditions = conditionSummaryFromLatest(latestExternalText || latestText, allText, currentMessageText(latestMine || {}), usableMessages);
  const latestSender = senderName(latestExternal.from);
  const latestSummary = compactSummary(referenceText, 92);
  const need = lastFromMe ? "상대 답장을 기다리는 상태" : inferNeed(referenceText);
  const progress = progressFromLatest(referenceText, latestSender, lastFromMe, need);
  const conversation = lastFromMe
    ? conversationSummaryAfterMyReply(usableMessages, latestText)
    : conversationSummaryFromLatest(usableMessages, latestExternal, latestMine, referenceText);
  const nextSteps = lastFromMe
    ? ["새 회신이 오면 조건 변경 여부를 확인하기", "급한 건이면 2-3일 뒤 가볍게 리마인드하기"]
    : latestActionSteps(referenceText, need);
  const draft = lastFromMe
    ? `안녕하세요, ${latestSender}님.\n\n이전 메일 확인 부탁드립니다. 추가로 필요한 내용이 있으면 편하게 말씀 주세요.\n\n감사합니다.\n유소정 드림`
    : draftFromLatest(referenceText, latestSender, need, { isFirstReply: !latestMine });

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

function renderConditionItem(item) {
  const text = conditionText(item);
  const index = typeof item === "object" ? Number(item.messageIndex) : -1;
  const attrs = Number.isInteger(index) && index >= 0 ? ` data-condition-message="${index}" title="원문 위치 보기"` : "";
  return `<button class="condition-chip" type="button"${attrs}>${highlightImportantText(text)}</button>`;
}

function markClassForToken(token = "") {
  const value = String(token || "");
  if (/답장|회신|빨리|오늘|확인\s*필요/.test(value)) return "mark-hot";
  if (/내 답장 완료|기다리는|대기/.test(value)) return "mark-wait";
  if (/광고비|비용|VAT|vat|\d+\s*만/.test(value)) return "mark-money";
  if (/일정|업로드|촬영|\d{1,2}\/\d{1,2}|\d{1,2}\s*월\s*\d{1,2}\s*일/.test(value)) return "mark-date";
  if (/계약|서명|정산/.test(value)) return "mark-contract";
  if (/기획안|가이드|수정|피드백|코멘트|필수/.test(value)) return "mark-plan";
  return "mark-soft";
}

function highlightImportantText(value = "") {
  const tokenPattern = /(답장\s*필요|확인\s*필요|내 답장 완료|상대 답장 기다리는 중|답장 기다리는 중|회신|답장|빨리|오늘|광고비|비용|VAT|vat|\d+\s*만\s*원?|\d{1,2}\/\d{1,2}|\d{1,2}\s*월\s*\d{1,2}\s*일|일정|업로드|촬영|계약서?|서명|정산|기획안|가이드|수정|피드백|코멘트|필수\s*조건|필수\s*문구)/g;
  return escapeHtml(value).replace(tokenPattern, (token) => {
    return `<mark class="text-mark ${markClassForToken(token)}">${token}</mark>`;
  });
}

function renderLeadText(value = "") {
  const [status, ...restParts] = String(value || "").split(" · ");
  const rest = restParts.join(" · ");
  return `
    <div class="lead-text">
      <span class="lead-main"><span class="status-star" aria-hidden="true">★</span>${highlightImportantText(status)}</span>
      ${rest ? `<span class="lead-sub">${highlightImportantText(rest)}</span>` : ""}
    </div>
  `;
}

function renderActionItem(item, index) {
  return `
    <li>
      <span class="action-num">${index + 1}</span>
      <span>${highlightImportantText(item)}</span>
    </li>
  `;
}

function renderSummaryItem(item) {
  return `
    <li>
      <span class="summary-dot" aria-hidden="true">✦</span>
      <span>${highlightImportantText(item)}</span>
    </li>
  `;
}

function renderDetail() {
  if (state.view === "dashboard" && !document.body.classList.contains("desktop-detail-open") && !document.body.classList.contains("mobile-detail-open")) {
    $("#detail").innerHTML = "";
    return;
  }
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
  const rawMailOpen = state.rawMailOpen.has(String(deal.id));

  $("#detail").innerHTML = `
    <div class="detail-panel">
      <div class="detail-head">
      <button class="mobile-back-button" data-mobile-back="true" type="button" aria-label="메일 목록으로 돌아가기">‹</button>
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
        ${renderLeadText(insight.progress)}
      </section>
      <section class="section action-card">
        <h3>다음 액션</h3>
        <ol class="action-list">${insight.nextSteps.map(renderActionItem).join("")}</ol>
      </section>
      <section class="section">
        <h3>짧은 대화 요약</h3>
        <ul class="summary-list">${insight.conversation.map(renderSummaryItem).join("")}</ul>
      </section>
      <section class="section">
        <h3>핵심 조건</h3>
        <div class="condition-list">${insight.conditions.map(renderConditionItem).join("")}</div>
      </section>
      <section class="section" style="grid-column: 1 / -1;">
        <h3>대화 흐름</h3>
        ${renderTimeline(deal)}
      </section>
      <section class="section" id="mailThreadSection" style="grid-column: 1 / -1;">
        <details class="raw-mail-details" ${rawMailOpen ? "open" : ""}>
          <summary>전체 원문 보기 <span class="section-count">${messages.length}개</span></summary>
          <div class="mail-thread">
            ${messages
              .map(
                (message, index) => {
                  const key = `${deal.id}:${index}`;
                  const expanded = state.expandedMessages.has(key);
                  const from = message.from || "알 수 없음";
                  const highlighted = state.highlightedMessage === key;
                  return `
                  <article class="mail-message ${expanded ? "expanded" : "collapsed"} ${isSenderMe(from) ? "from-me" : ""} ${highlighted ? "source-highlight" : ""}" data-mail-index="${index}">
                    <button class="mail-message-summary" data-message-key="${escapeAttr(key)}" type="button" aria-expanded="${expanded}">
                      ${avatarMarkup(from, from).replace("deal-avatar", "mail-avatar")}
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
                      ${renderMailAttachments(message.attachments)}
                    </div>
                  </article>
                `;
                },
              )
              .join("")}
          </div>
        </details>
      </section>
      <section class="section" style="grid-column: 1 / -1;">
        <h3>다음 메일 초안</h3>
        <div class="draft">${escapeHtml(insight.draft)}</div>
      </section>
      </div>
    </div>
  `;
}

function fallbackMessages(deal) {
  const timeline = Array.isArray(deal?.timeline) ? deal.timeline : [];
  return timeline.map(([date, body]) => ({
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
  renderCalendarModal();
}

document.addEventListener("click", (event) => {
  if (!event.target.closest("#accountPanel") && !event.target.closest("#profileButton")) {
    closeAccountPanel();
  }

  const brandFilterButton = event.target.closest("[data-brand-filter]");
  if (brandFilterButton) {
    state.brandFilter = brandFilterButton.dataset.brandFilter || "";
    state.view = "dashboard";
    state.highlightedMessage = "";
    document.body.classList.remove("mobile-drawer-open");
    closeDetailView();
    render();
    return;
  }

  const calendarNavButton = event.target.closest("[data-calendar-nav]");
  if (calendarNavButton) {
    const value = calendarNavButton.dataset.calendarNav;
    state.calendarMonthOffset = value === "today" ? 0 : state.calendarMonthOffset + Number(value || 0);
    state.selectedCalendarKey = "";
    state.view = "dashboard";
    render();
    return;
  }

  const calendarDayButton = event.target.closest("[data-calendar-day]");
  if (calendarDayButton) {
    state.selectedCalendarKey = calendarDayButton.dataset.calendarDay || "";
    renderCalendarModal();
    return;
  }

  const calendarCloseButton = event.target.closest("[data-calendar-close]");
  if (calendarCloseButton || event.target === $("#calendarModal")) {
    state.selectedCalendarKey = "";
    renderCalendarModal();
    return;
  }

  const calendarDetailButton = event.target.closest("[data-calendar-detail-id]");
  if (calendarDetailButton) {
    state.selectedId = calendarDetailButton.dataset.calendarDetailId;
    state.returnView = "dashboard";
    state.view = "detail";
    state.highlightedMessage = "";
    state.selectedCalendarKey = "";
    render();
    openMobileDetail();
    openDesktopDetail();
    return;
  }

  if (document.body.classList.contains("mobile-drawer-open") && isMobileLayout()) {
    const inDrawer = event.target.closest(".sidebar");
    const onMenu = event.target.closest("#layoutToggle");
    if (!inDrawer && !onMenu) {
      document.body.classList.remove("mobile-drawer-open");
      return;
    }
  }

  const deleteButton = event.target.closest("[data-delete-id]");
  if (deleteButton) {
    const id = deleteButton.dataset.deleteId;
    const deal = deals.find((item) => item.id === id);
    if (!deal) return;
    if (!confirm(`${deal.advertiser} 메일을 목록에서 삭제할까요?`)) return;

    rememberDealState(HIDDEN_DEALS_KEY, deal);
    deals = deals.filter((item) => item.id !== id);
    if (state.selectedId === id) {
      state.selectedId = filteredDeals()[0]?.id || deals[0]?.id || "";
    }
    render();
    deleteButton.disabled = true;
    deleteDeal(id)
      .then(() => {
        showToast("메일을 삭제했습니다.");
      })
      .catch(() => {
        showToast("목록에서 숨겼습니다. 서버 삭제는 나중에 다시 시도됩니다.");
      })
      .finally(() => {
        deleteButton.disabled = false;
      });
    return;
  }

  const archiveButton = event.target.closest("[data-archive-id]");
  if (archiveButton) {
    const id = archiveButton.dataset.archiveId;
    const deal = deals.find((item) => item.id === id);
    if (!deal) return;
    rememberDealState(ARCHIVED_DEALS_KEY, deal);
    deals = deals.filter((item) => item.id !== id);
    if (state.selectedId === id) {
      state.selectedId = filteredDeals()[0]?.id || deals[0]?.id || "";
    }
    render();
    showToast("보관했습니다. 새로고침해도 목록에 뜨지 않습니다.");
    return;
  }

  const dealButton = event.target.closest("[data-id]");
  if (dealButton) {
    state.returnView = state.view === "dashboard" ? "dashboard" : "list";
    state.view = "detail";
    state.selectedId = dealButton.dataset.id;
    state.highlightedMessage = "";
    render();
    openMobileDetail();
    openDesktopDetail();
    return;
  }

  const homeButton = event.target.closest("[data-home]");
  if (homeButton) {
    state.view = "dashboard";
    state.brandFilter = "";
    state.highlightedMessage = "";
    document.body.classList.remove("mobile-drawer-open");
    closeDetailView();
    render();
    return;
  }

  const filterButton = event.target.closest("[data-filter]");
  if (filterButton) {
    state.view = "list";
    state.filter = filterButton.dataset.filter;
    state.highlightedMessage = "";
    document.body.classList.remove("mobile-drawer-open");
    closeDesktopDetail();
    render();
    return;
  }

  if (event.target.closest("[data-mobile-back]")) {
    state.view = state.returnView || "dashboard";
    closeDetailView();
    render();
    return;
  }

  const rawSummary = event.target.closest(".raw-mail-details > summary");
  if (rawSummary) {
    event.preventDefault();
    const id = String(state.selectedId || "");
    if (state.rawMailOpen.has(id)) {
      state.rawMailOpen.delete(id);
    } else {
      state.rawMailOpen.add(id);
    }
    renderDetail();
    return;
  }

  const conditionButton = event.target.closest("[data-condition-message]");
  if (conditionButton) {
    const selectedId = String(state.selectedId || "");
    const index = Number(conditionButton.dataset.conditionMessage);
    if (!selectedId || !Number.isInteger(index) || index < 0) return;

    const key = `${selectedId}:${index}`;
    state.rawMailOpen.add(selectedId);
    state.expandedMessages.add(key);
    state.highlightedMessage = key;
    renderDetail();
    requestAnimationFrame(() => {
      const target = document.querySelector(`#mailThreadSection [data-mail-index="${index}"]`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        showToast("조건이 나온 원문을 펼쳤습니다.");
      }
    });
    window.setTimeout(() => {
      if (state.highlightedMessage === key) {
        state.highlightedMessage = "";
        document.querySelector(".mail-message.source-highlight")?.classList.remove("source-highlight");
      }
    }, 4000);
    return;
  }

  const scrollMailButton = event.target.closest("[data-scroll-mail]");
  if (scrollMailButton) {
    const selectedId = String(state.selectedId || "");
    const deal = deals.find((item) => String(item.id || "") === selectedId);
    const messages = Array.isArray(deal?.messages) ? deal.messages : fallbackMessages(deal);
    state.rawMailOpen.add(selectedId);
    if (messages.length) {
      state.expandedMessages.add(`${selectedId}:${messages.length - 1}`);
    }
    renderDetail();
    requestAnimationFrame(() => {
      const latest = document.querySelector("#mailThreadSection .mail-message:last-child");
      const thread = latest || document.querySelector("#mailThreadSection");
      if (thread) {
        thread.scrollIntoView({ behavior: "smooth", block: latest ? "center" : "start" });
        showToast("전체 원문을 펼쳤습니다.");
      }
    });
    return;
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
  state.view = state.query.trim() ? "list" : state.view;
  closeDesktopDetail();
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
  clearPassword();
  closeAccountPanel();
  closeDetailView();
  deals = [];
  state.selectedId = "";
  state.view = "dashboard";
  state.returnView = "dashboard";
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
    savePassword(newPassword);
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
  savePassword(password);
  hideLogin();
  await loadDeals({ manual: true });
  await ensureGmailReady();
});

registerServiceWorker();
applyLayoutMode();
if (savedPassword()) {
  hideLogin();
}
closeDetailView();
render();

async function boot() {
  closeDetailView();
  state.filter = "all";
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

let lastForegroundRefresh = 0;

function refreshWhenForegrounded() {
  if (!savedPassword() || document.hidden) return;
  const now = Date.now();
  if (now - lastForegroundRefresh < 10_000) return;
  lastForegroundRefresh = now;
  loadDeals();
}

document.addEventListener("visibilitychange", refreshWhenForegrounded);
window.addEventListener("focus", refreshWhenForegrounded);

setInterval(() => {
  loadDeals();
}, 60_000);
