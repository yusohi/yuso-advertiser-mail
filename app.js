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
  rawMailOpen: new Set(),
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
  const compact = localStorage.getItem(LAYOUT_KEY) === "compact";
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
  localStorage.setItem(LAYOUT_KEY, next);
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
  const leftMessages = dealMessages(left).length;
  const rightMessages = dealMessages(right).length;
  const leftHasGmail = /^https:\/\/mail\.google\.com/i.test(String(left?.gmail || ""));
  const rightHasGmail = /^https:\/\/mail\.google\.com/i.test(String(right?.gmail || ""));
  if (leftHasGmail !== rightHasGmail) return leftHasGmail ? left : right;
  if (leftMessages !== rightMessages) return leftMessages > rightMessages ? left : right;
  return parseDealDate(left).getTime() >= parseDealDate(right).getTime() ? left : right;
}

function normalizeDeals(list = []) {
  const unique = new Map();
  for (const deal of Array.isArray(list) ? list : []) {
    if (!deal || isWootsoCompanyDeal(deal)) continue;
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
  const latestSummary = compactSummary(latestExternalText || latestText, 92);
  const need = lastFromMe ? "상대 답장을 기다리는 상태" : inferNeed(latestExternalText || latestText);
  const progress = lastFromMe
    ? `내 답장 완료 · ${latestSender} 회신 대기`
    : `답장 필요 · ${need}`;
  const conversation = uniqueItems([
    latestExternal ? `상대: ${compactSummary(latestExternalText, 82)}` : "",
    latestMine ? `나: ${compactSummary(currentMessageText(latestMine), 82)}` : "",
    usableMessages[0] && usableMessages[0] !== latestExternal ? `시작: ${compactSummary(currentMessageText(usableMessages[0]), 82)}` : "",
  ], 3);
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
        <div class="condition-list">${insight.conditions.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
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
                  return `
                  <article class="mail-message ${expanded ? "expanded" : "collapsed"} ${isSenderMe(from) ? "from-me" : ""}">
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
    render();
    openMobileDetail();
    openDesktopDetail();
    return;
  }

  const filterButton = event.target.closest("[data-filter]");
  if (filterButton) {
    state.filter = filterButton.dataset.filter;
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
  localStorage.removeItem(PASSWORD_KEY);
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
