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
const PASSWORD_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

const state = {
  selectedId: "",
  filter: "all",
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

function isAdvertisingDeal(deal) {
  if (!/^https:\/\/mail\.google\.com/i.test(String(deal?.gmail || ""))) return false;
  const latestExternal = latestExternalMessage(deal);
  const text = [
    deal?.advertiser,
    deal?.contact,
    deal?.brand,
    deal?.oneLine,
    deal?.nextAction,
    currentMessageText(latestExternal).slice(0, 1200),
  ].join(" ");
  const blocked = /(mrbeastcollab\.sbs|grammarly manager shared|dropsend collaboration|이용권 만료|newsletter|notification|no-?reply|google events|eventsatgoogle|creator club|크리에이터 클럽|final reminder|초대합니다)/i.test(text);
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

function filteredDeals() {
  const query = state.query.trim().toLowerCase();
  const items = deals
    .filter((deal) => {
      const priority = dealPriority(deal);
      const matchesFilter = dealMatchesFilter(deal, state.filter);
      const haystack =
        `${deal.advertiser} ${deal.contact} ${deal.brand} ${deal.statusLabel} ${deal.oneLine} ${priority.label}`.toLowerCase();
      return matchesFilter && (!query || haystack.includes(query));
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
  $("#statusFilters").innerHTML = statusLabels
    .map(
      ([id, label]) => {
        const count = deals.filter((deal) => dealMatchesFilter(deal, id)).length;
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
          <button class="delete-deal" data-delete-id="${escapeAttr(deal.id)}" aria-label="${escapeAttr(deal.advertiser)} 삭제" type="button">×</button>
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
    steps.push("브랜드와 제안 제품이 유소 채널에 맞는지 확인하기");
    steps.push("진행할지, 유료 광고 조건이 필요한지 답장하기");
    if (intent.schedule) steps.push("원하는 촬영/업로드 일정이 있는지 확인하기");
    return uniqueItems(steps, 4);
  }
  if (intent.revision) {
    steps.push("기획안/가이드에 남긴 수정 코멘트를 열어서 반영할 부분 확인하기");
    steps.push("수정 반영 후 가능한 일정과 진행 여부를 답장하기");
  }
  if (intent.productSelect) {
    steps.push("메일에 온 제품/상품 링크를 열어 추가된 항목 확인하기");
    steps.push("선택할 제품을 정리해서 상대에게 회신하기");
  }
  if (intent.contract) steps.push("계약/서명/정산 자료 요청 내용을 확인해서 처리하기");
  if (intent.shipping) steps.push("보내도 되는 배송지/연락처 정보만 정리해서 전달하기");
  if (intent.money) steps.push("광고비와 제공 조건이 맞는지 확인하고 조정할 조건 표시하기");
  if (intent.guide) steps.push("가이드라인/필수 조건을 확인하고 기획안 또는 촬영 준비에 반영하기");
  if (intent.schedule) steps.push("촬영/업로드 가능 일정을 캘린더와 비교해서 답장하기");
  steps.push(need);
  steps.push("답장 전 최신 원문에서 빠진 조건이 없는지 한 번 더 확인하기");
  return uniqueItems(steps, 4);
}

function progressFromLatest(text = "", sender = "상대", lastFromMe = false, need = "") {
  const intent = latestIntent(text);
  if (lastFromMe) return `내 답장 완료 · ${sender} 회신 대기`;
  if (intent.initialProposal) return "신규 제안 · 브랜드가 광고/협업 가능 여부를 문의한 단계";
  if (intent.revision) return "답장 필요 · 상대가 기획안/가이드 수정 코멘트를 전달했고, 반영 여부와 진행 가능 일정을 회신해야 함";
  if (intent.productSelect) {
    return "답장 필요 · 상대가 제품/상품 링크 확인을 요청했고, 셀렉 결과를 회신해야 함";
  }
  if (intent.contract) return "답장 필요 · 계약/서명/정산 자료를 확인하고 처리해야 함";
  if (intent.shipping) return "답장 필요 · 제품 발송을 위한 배송 정보 요청 단계";
  if (intent.money) return "답장 필요 · 비용/제공 조건을 검토하고 협의해야 함";
  if (intent.guide) return "답장 필요 · 가이드라인과 진행 조건을 확인해 반영해야 함";
  if (intent.schedule || intent.approval) return "답장 필요 · 일정과 진행 여부를 확인해 회신해야 함";
  return `답장 필요 · ${need}`;
}

function conversationSummaryFromLatest(messages, latestExternal, latestMine, latestText = "") {
  const cleanLatest = normalizeVisibleMailText(latestText);
  const intent = latestIntent(cleanLatest);
  const mineText = currentMessageText(latestMine || {});
  const firstText = currentMessageText(messages[0] || {});
  const items = [];

  if (intent.revision) {
    items.push("최근: 상대가 기획안/가이드/원고 수정 의견을 전달했고, 반영 여부를 알려달라고 함");
    if (/그대로\s*촬영\s*진행|촬영\s*진행/.test(cleanLatest)) items.push("진행: 큰 수정은 거의 없어서 코멘트 반영 후 그대로 촬영 진행하면 되는 상태");
  } else if (intent.initialProposal) {
    const name = senderName(latestExternal?.from);
    items.push(`최근: ${name}${subjectParticle(name)} 광고/협업 제안을 보냈고, 진행 가능 여부 검토가 필요한 상태`);
  } else if (intent.productSelect) {
    items.push("최근: 상대가 제품/상품 링크 확인 또는 셀렉 결과 회신을 요청함");
  } else if (intent.contract) {
    items.push("최근: 계약/서명/정산 자료 처리가 필요한 단계로 넘어옴");
  } else if (intent.shipping) {
    items.push("최근: 제품 발송을 위한 배송 정보 확인이 필요한 상태");
  } else if (intent.money) {
    items.push("최근: 비용과 제공 조건을 확인하거나 조율해야 하는 상태");
  } else if (intent.guide) {
    items.push("최근: 상대가 가이드라인/필수 조건/자료를 확인해달라고 전달함");
  } else if (intent.schedule || intent.approval) {
    items.push("최근: 일정 또는 진행 가능 여부를 확인해 회신해야 하는 상태");
  } else if (cleanLatest) {
    items.push(`최근: ${compactSummary(cleanLatest, 96)}`);
  }

  if (/가이드라인|가이드|제품\s*정보|제품정보|촬영용\s*제품|제품.*받/.test(mineText)) {
    items.push("이전: 유소가 가이드라인과 제품 정보를 확인했고 촬영용 제품 수령도 알림");
  } else if (mineText) {
    items.push(`내 답장: ${compactSummary(mineText, 86)}`);
  }

  if (/선물|제품.*보내|협업|광고|브랜드|캠페인|PPL/i.test(firstText)) {
    items.push("시작: 브랜드가 제품 협업/광고 제안으로 연락을 시작함");
  } else if (firstText && firstText !== cleanLatest) {
    items.push(`시작: ${compactSummary(firstText, 86)}`);
  }

  return uniqueItems(items, 4);
}

function conversationSummaryAfterMyReply(messages, latestText = "") {
  const firstText = currentMessageText(messages[0] || {});
  const items = [];
  if (latestText) items.push(`최근 내 답장: ${compactSummary(latestText, 96)}`);
  items.push("현재: 내가 답장을 보냈고 상대 회신을 기다리는 상태");
  if (/질문|궁금|확인|가능|사용법|권장|문의/.test(latestText)) {
    items.push("확인 필요: 상대가 다음 답장에서 질문/조건에 답하면 그 내용 기준으로 업데이트");
  }
  if (/선물|제품.*보내|협업|광고|브랜드|캠페인|PPL/i.test(firstText)) {
    items.push("시작: 브랜드가 제품 협업/광고 제안으로 연락을 시작함");
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

function draftFromLatest(latestText = "", sender = "담당자", need = "") {
  const intent = latestIntent(latestText);
  if (intent.initialProposal) {
    return `안녕하세요, ${sender}님.\n\n제안 주신 내용 확인했습니다.\n유소 채널과의 방향성, 희망 콘텐츠 형태, 제공 제품 및 광고비 조건을 함께 검토해보겠습니다.\n\n진행 가능 여부 확인 후 답장드리겠습니다.\n\n감사합니다.\n유소정 드림`;
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
    : draftFromLatest(referenceText, latestSender, need);

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
  return `<button class="condition-chip" type="button"${attrs}>${escapeHtml(text)}</button>`;
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
}

document.addEventListener("click", (event) => {
  if (!event.target.closest("#accountPanel") && !event.target.closest("#profileButton")) {
    closeAccountPanel();
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
    state.highlightedMessage = "";
    render();
    openMobileDetail();
    openDesktopDetail();
    return;
  }

  const filterButton = event.target.closest("[data-filter]");
  if (filterButton) {
    state.filter = filterButton.dataset.filter;
    state.highlightedMessage = "";
    document.body.classList.remove("mobile-drawer-open");
    closeDesktopDetail();
    render();
    return;
  }

  if (event.target.closest("[data-mobile-back]")) {
    closeDetailView();
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
