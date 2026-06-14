const FALLBACK_PASSWORD_HASH = "acaf377f6fb49363a8121d8c3ce441b7b938aef598e45b13bb1e8ecb5d50dd6f";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://bsmfvlodkqyfawsppjno.supabase.co";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_KEY") || "";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const APP_URL = Deno.env.get("APP_URL") || "https://yusohi.github.io/yuso-advertiser-mail/";
const REDIRECT_URI =
  Deno.env.get("GMAIL_REDIRECT_URI") ||
  "https://bsmfvlodkqyfawsppjno.supabase.co/functions/v1/yuso-mail/api/gmail/callback";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const TARGET_EMAIL = "yuso@wootso.com";
const enc = new TextEncoder();

type JsonMap = Record<string, unknown>;
type MailDeal = JsonMap & { id?: string; messages?: JsonMap[] };
type MailPayload = {
  deals?: MailDeal[];
  deletedDeals?: MailDeal[];
  updatedAt?: string;
  source?: string;
  [key: string]: unknown;
};

function hex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function sha(value: string) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(value)));
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function cors(req: Request) {
  const origin = req.headers.get("origin") || "*";
  const allowed = new Set(["https://yusohi.github.io", "http://localhost:4173", "http://localhost:8000", "http://127.0.0.1:8000"]);
  return {
    "Access-Control-Allow-Origin": allowed.has(origin) ? origin : "https://yusohi.github.io",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      ...cors(req),
    },
  });
}

function route(req: Request) {
  const pathname = new URL(req.url).pathname;
  const marker = "/yuso-mail";
  const index = pathname.indexOf(marker);
  return index >= 0 ? pathname.slice(index + marker.length) || "/" : "/";
}

function dbHeaders() {
  return {
    "apikey": SERVICE_ROLE_KEY,
    "authorization": `Bearer ${SERVICE_ROLE_KEY}`,
    "accept": "application/json",
    "content-type": "application/json",
  };
}

function seoulNow() {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
}

function iso(value: unknown) {
  const date = value ? new Date(String(value)) : new Date(0);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

async function currentPasswordHash() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/yuso_mail_settings?id=eq.auth&select=password_hash`, { headers: dbHeaders() });
  if (!response.ok) throw new Error(`settings_fetch_failed:${response.status}`);
  const rows = await response.json();
  return String(rows?.[0]?.password_hash || FALLBACK_PASSWORD_HASH);
}

async function verifyPassword(password: string) {
  return timingSafeEqual(await sha(password), await currentPasswordHash());
}

async function mailPayload(): Promise<MailPayload | undefined> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/yuso_mail_snapshots?id=eq.current&select=payload`, { headers: dbHeaders() });
  if (!response.ok) throw new Error(`data_fetch_failed:${response.status}`);
  const rows = await response.json();
  return rows?.[0]?.payload;
}

async function updateMailPayload(payload: MailPayload) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/yuso_mail_snapshots?id=eq.current`, {
    method: "PATCH",
    headers: { ...dbHeaders(), "prefer": "return=minimal" },
    body: JSON.stringify({ payload, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`data_update_failed:${response.status}`);
}

async function updatePasswordHash(password: string) {
  const password_hash = await sha(password);
  const response = await fetch(`${SUPABASE_URL}/rest/v1/yuso_mail_settings?id=eq.auth`, {
    method: "PATCH",
    headers: { ...dbHeaders(), "prefer": "return=minimal" },
    body: JSON.stringify({ password_hash, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`settings_update_failed:${response.status}`);
}

async function oauthRecord(id: string): Promise<JsonMap> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/yuso_mail_oauth?id=eq.${encodeURIComponent(id)}&select=payload`, { headers: dbHeaders() });
  if (!response.ok) throw new Error(`oauth_fetch_failed:${response.status}`);
  const rows = await response.json();
  return rows?.[0]?.payload || {};
}

async function updateOauthRecord(id: string, payload: JsonMap) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/yuso_mail_oauth?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...dbHeaders(), "prefer": "return=minimal" },
    body: JSON.stringify({ payload, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`oauth_update_failed:${response.status}`);
}

function oauthConfigured() {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

function tokenConfigured() {
  return oauthConfigured();
}

function decodeBase64Url(value = "") {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

function base64UrlToBase64(value = "") {
  return value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
}

function header(headers: JsonMap[] | undefined, name: string) {
  return String(headers?.find((item) => String(item.name || "").toLowerCase() === name.toLowerCase())?.value || "");
}

function headerBlob(headers: JsonMap[] | undefined, names: string[]) {
  return names.map((name) => header(headers, name)).filter(Boolean).join(" ").toLowerCase();
}

function messageHeaders(message: JsonMap) {
  return (message.payload as JsonMap | undefined)?.headers as JsonMap[] | undefined;
}

function messageHasTargetAccount(message: JsonMap) {
  const headers = messageHeaders(message);
  const accountHeaders = headerBlob(headers, [
    "From",
    "To",
    "Cc",
    "Bcc",
    "Delivered-To",
    "X-Original-To",
    "X-Forwarded-To",
    "Envelope-To",
    "Return-Path",
  ]);
  return accountHeaders.includes(TARGET_EMAIL);
}

function messagesForTargetAccount(thread: JsonMap) {
  return ((thread.messages as JsonMap[] | undefined) || []).filter(messageHasTargetAccount);
}

function decodeHtmlEntities(value = "") {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity) => {
    const key = String(entity).toLowerCase();
    if (key[0] === "#") {
      const code = key[1] === "x" ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : _;
    }
    return named[key] || _;
  });
}

function htmlToText(html = "") {
  return decodeHtmlEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<head[\s\S]*?<\/head>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(p|div|section|article|tr|table|blockquote|h[1-6])>/gi, "\n\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<a\b[^>]*href=["']?([^"'>\s]+)["']?[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n"),
  ).trim();
}

function bodyFromPayload(payload: JsonMap | undefined): string {
  if (!payload) return "";
  const mimeType = String(payload.mimeType || "").toLowerCase();
  const body = payload.body as JsonMap | undefined;
  if (typeof body?.data === "string") {
    const decoded = decodeBase64Url(body.data);
    return mimeType.includes("html") ? htmlToText(decoded) : decoded.trim();
  }
  const parts = Array.isArray(payload.parts) ? payload.parts as JsonMap[] : [];
  const html = parts.find((part) => String(part.mimeType || "").toLowerCase() === "text/html");
  if (html) return bodyFromPayload(html);
  const plain = parts.find((part) => String(part.mimeType || "").toLowerCase() === "text/plain");
  if (plain) return bodyFromPayload(plain);
  for (const part of parts) {
    const nested = bodyFromPayload(part);
    if (nested) return nested;
  }
  return "";
}

function threadHeaders(thread: JsonMap) {
  const messages = messagesForTargetAccount(thread);
  const first = messages[0] || {};
  const latest = messages[messages.length - 1] || first;
  return {
    first: messageHeaders(first),
    latest: messageHeaders(latest),
  };
}

function isAdvertiserConversation(thread: JsonMap) {
  const messages = messagesForTargetAccount(thread);
  const sample = messages
    .slice(-3)
    .map((message) => {
      const payload = message.payload as JsonMap | undefined;
      const headers = payload?.headers as JsonMap[] | undefined;
      return [header(headers, "From"), header(headers, "Subject"), bodyFromPayload(payload).slice(0, 1200)].join("\n");
    })
    .join("\n")
    .toLowerCase();
  return /(광고|협업|제안|협찬|ppl|브랜디드|공동구매|캠페인|제품.*보내|제품.*제공|촬영|업로드|creator|influencer|partnership|collaboration|campaign|sponsor)/i.test(sample);
}

function isNoiseThread(thread: JsonMap) {
  const messages = messagesForTargetAccount(thread);
  if (!messages.length) return true;
  const latest = messages[messages.length - 1] || {};
  const labels = Array.isArray(latest.labelIds) ? latest.labelIds.map(String) : [];
  if (labels.some((label) => ["SPAM", "TRASH"].includes(label))) return true;

  const headers = threadHeaders(thread);
  const latestHeaders = headers.latest;
  const firstHeaders = headers.first;
  const from = `${header(latestHeaders, "From")} ${header(firstHeaders, "From")}`.toLowerCase();
  const subject = `${header(latestHeaders, "Subject")} ${header(firstHeaders, "Subject")}`.toLowerCase();
  const bulkHeaders = [
    header(latestHeaders, "List-Unsubscribe"),
    header(latestHeaders, "List-Id"),
    header(latestHeaders, "Precedence"),
    header(latestHeaders, "Auto-Submitted"),
    header(latestHeaders, "X-Auto-Response-Suppress"),
    header(firstHeaders, "List-Unsubscribe"),
    header(firstHeaders, "List-Id"),
  ].join(" ").toLowerCase();
  const automated =
    /(no-?reply|donotreply|notification|newsletter|news|mailing|update|marketing|promo)/i.test(from) ||
    /(bulk|list|auto-generated|auto-replied|unsubscribe)/i.test(bulkHeaders) ||
    /(뉴스레터|구독|프로모션|이벤트|업데이트|알림|영수증|주문|결제|인증|코드|receipt|order|newsletter|weekly|digest|notification|verify|verification)/i.test(subject);

  return automated && !isAdvertiserConversation(thread);
}

function priorityForDeal(needsReply: boolean, latestDate: Date, text = "") {
  if (!needsReply) return { priorityScore: 10, priorityLevel: "waiting", priorityLabel: "대기" };
  const ageHours = Math.max(0, (Date.now() - latestDate.getTime()) / 36e5);
  const clean = text.toLowerCase();
  const purchaseRequest = /(공구|공동구매|구매\s*요청|판매\s*요청|마켓|스토어|커머스|affiliate|sales|reseller)/i.test(clean);
  const activeDeal = /(진행|계약|서명|촬영|업로드|일정|주소|배송|제품\s*발송|시딩|견적|광고비|비용|세금계산서|입금|확정|승인|컨펌)/i.test(clean);
  const asksReply = /(답장|회신|확인\s*부탁|검토\s*부탁|가능하실까요|어떠실까요|의견|전달\s*부탁|문의|요청|reply|respond|confirm|check)/i.test(clean);
  const urgent = /(마감|오늘|내일|금일|이번\s*주|급|빠르게|리마인드|reminder|urgent|asap|deadline)/i.test(clean);
  let score = 45;
  if (ageHours >= 72) score += 28;
  else if (ageHours >= 24) score += 18;
  else if (ageHours >= 8) score += 8;
  if (activeDeal) score += 24;
  if (urgent) score += 22;
  if (asksReply) score += 16;
  if (purchaseRequest) score = Math.min(score - 30, 45);
  if (/(감사합니다|확인했습니다|전달드렸|보내드렸)/i.test(clean)) score -= 8;
  if (score >= 82) return { priorityScore: score, priorityLevel: "urgent", priorityLabel: "빨리 답장" };
  if (score >= 62) return { priorityScore: score, priorityLevel: "soon", priorityLabel: "오늘 확인" };
  return { priorityScore: score, priorityLevel: "normal", priorityLabel: "일반 확인" };
}

function messageDate(message: JsonMap) {
  const payload = message.payload as JsonMap | undefined;
  const headers = payload?.headers as JsonMap[] | undefined;
  const rawDate = header(headers, "Date") || message.internalDate;
  const date = rawDate && /^\d+$/.test(String(rawDate)) ? new Date(Number(rawDate)) : new Date(String(rawDate || Date.now()));
  return date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
}

function gmailMessageDate(message: JsonMap) {
  const internalDate = message.internalDate;
  if (typeof internalDate === "string" && /^\d+$/.test(internalDate)) return new Date(Number(internalDate));
  if (typeof internalDate === "number") return new Date(internalDate);
  return new Date(String(internalDate || Date.now()));
}

function dealIdFromThread(thread: JsonMap) {
  const messages = messagesForTargetAccount(thread);
  const first = messages[0] || {};
  const headers = messageHeaders(first);
  const from = header(headers, "From").toLowerCase();
  const subject = header(headers, "Subject").toLowerCase();
  if (from.includes("momentsco") || subject.includes("비플레인")) return "beplain";
  if (from.includes("temu.com") || subject.includes("테무")) return "temu-2026-june";
  if (from.includes("modoodoc") || subject.includes("모두닥")) return subject.includes("릴스") ? "modoodoc-reels" : "modoodoc";
  if (from.includes("onns.kr") || subject.includes("온누리")) return "onnuri-circuasian";
  if (from.includes("inuscomm") || subject.includes("오뚜기")) return "ottogi-lightjoy";
  if (from.includes("cartour")) return "cartour-slush";
  if (from.includes("ajd.co.kr") || subject.includes("아정당")) return "ajd";
  if (from.includes("dentalist")) return "dentalist";
  if (from.includes("noxinfluencer") || subject.includes("onspace") || subject.includes("manus")) return "onspace-ai";
  const domain = from.match(/@([^>\\s]+)/)?.[1]?.replace(/[^a-z0-9.-]/gi, "") || "gmail";
  const prefix = domain.split(".")[0].replace(/[^a-z0-9-]/gi, "-").slice(0, 30) || "gmail";
  return `${prefix}-${String(thread.id || crypto.randomUUID()).replace(/[^a-z0-9-]/gi, "").slice(0, 32)}`;
}

function senderEmail(thread: JsonMap) {
  const messages = messagesForTargetAccount(thread);
  const firstFromAdvertiser = messages.find((message) => !/유소|yuso@wootso\.com/i.test(header(messageHeaders(message), "From")));
  const first = firstFromAdvertiser || messages[0] || {};
  const headers = messageHeaders(first);
  return header(headers, "From");
}

function advertiserFromThread(thread: JsonMap) {
  const id = dealIdFromThread(thread);
  const known: Record<string, string> = {
    beplain: "비플레인",
    "temu-2026-june": "Temu",
    "modoodoc-reels": "모두닥",
    "onnuri-circuasian": "온누리스토어",
    "ottogi-lightjoy": "오뚜기 · 라이트앤조이",
    "cartour-slush": "카투어",
    ajd: "아정당",
    dentalist: "덴탈리스트",
    "onspace-ai": "ONSPACE AI / MANUS AI",
  };
  if (known[id]) return known[id];
  return senderEmail(thread).replace(/<.*>/, "").replace(/"/g, "").trim() || id;
}

function isDeleted(payload: MailPayload, deal: MailDeal, latestDate: Date) {
  const deleted = Array.isArray(payload.deletedDeals) ? payload.deletedDeals : [];
  return deleted.some((item) => {
    const same =
      item.id === deal.id ||
      (item.gmail && item.gmail === deal.gmail) ||
      (item.email && deal.email && String(deal.email).includes(String(item.email))) ||
      (item.advertiser && deal.advertiser && item.advertiser === deal.advertiser);
    return same && latestDate <= iso(item.deletedAt);
  });
}

async function refreshAccessToken() {
  if (!tokenConfigured()) throw new Error("gmail_oauth_not_configured");
  const saved = await oauthRecord("gmail_tokens");
  const refreshToken = String(saved.refresh_token || "");
  if (!refreshToken) throw new Error("gmail_not_connected");
  if (saved.access_token && Number(saved.expires_at || 0) > Date.now() + 60_000) return String(saved.access_token);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`gmail_refresh_failed:${JSON.stringify(data)}`);
  const next = {
    ...saved,
    access_token: data.access_token,
    expires_at: Date.now() + Number(data.expires_in || 3600) * 1000,
  };
  await updateOauthRecord("gmail_tokens", next);
  return String(data.access_token);
}

async function gmailJson(path: string, accessToken: string) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`gmail_api_failed:${response.status}:${JSON.stringify(data)}`);
  return data;
}

async function gmailThreadIds(q: string, accessToken: string, pageLimit = 2, maxResults = 50) {
  const ids = new Set<string>();
  let pageToken = "";
  let page = 0;
  do {
    const params = new URLSearchParams({ q, maxResults: String(maxResults) });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await gmailJson(`threads?${params.toString()}`, accessToken);
    for (const thread of data.threads || []) ids.add(String(thread.id));
    pageToken = String(data.nextPageToken || "");
    page++;
  } while (pageToken && page < pageLimit);
  return ids;
}

async function imageAttachmentsFromPayload(messageId: string, payload: JsonMap | undefined, accessToken: string) {
  const out: JsonMap[] = [];
  const visit = async (part: JsonMap | undefined) => {
    if (!part || out.length >= 4) return;
    const mimeType = String(part.mimeType || "").toLowerCase();
    const filename = String(part.filename || "");
    const body = part.body as JsonMap | undefined;
    const size = Number(body?.size || 0);
    if (mimeType.startsWith("image/") && size >= 4096 && size <= 2_500_000) {
      let data = typeof body?.data === "string" ? body.data : "";
      const attachmentId = String(body?.attachmentId || "");
      if (!data && attachmentId) {
        const attachment = await gmailJson(`messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`, accessToken);
        data = String(attachment.data || "");
      }
      if (data) {
        out.push({
          filename: filename || "첨부 이미지",
          mimeType,
          size,
          dataUrl: `data:${mimeType};base64,${base64UrlToBase64(data)}`,
        });
      }
    }
    const parts = Array.isArray(part.parts) ? part.parts as JsonMap[] : [];
    for (const child of parts) await visit(child);
  };
  await visit(payload);
  return out;
}

async function dealFromThread(thread: JsonMap, accessToken: string): Promise<MailDeal | undefined> {
  const messages: JsonMap[] = [];
  const targetMessages = messagesForTargetAccount(thread);
  if (!targetMessages.length) return undefined;
  for (const message of targetMessages) {
    const payload = message.payload as JsonMap | undefined;
    const headers = payload?.headers as JsonMap[] | undefined;
    const body = bodyFromPayload(payload);
    if (!body) continue;
    const messageId = String(message.id || "");
    messages.push({
      from: header(headers, "From"),
      date: messageDate(message),
      body,
      attachments: messageId ? await imageAttachmentsFromPayload(messageId, payload, accessToken) : [],
    });
  }
  const last = messages[messages.length - 1] || {};
  if (!messages.length) return undefined;
  const first = targetMessages[0] || {};
  const headers = messageHeaders(first);
  const subject = header(headers, "Subject");
  const id = dealIdFromThread(thread);
  const advertiser = advertiserFromThread(thread);
  const email = senderEmail(thread).match(/<([^>]+)>/)?.[1] || senderEmail(thread);
  const latestFrom = String(last.from || "");
  const needsReply = !/유소|yuso@wootso\.com/i.test(latestFrom);
  const latestDate = gmailMessageDate(targetMessages[targetMessages.length - 1] || {});
  const latestText = String(last.body || "");
  const priority = priorityForDeal(needsReply, latestDate, latestText);

  return {
    id,
    advertiser,
    contact: senderEmail(thread).replace(/<.*>/, "").replace(/"/g, "").trim() || "담당자",
    email,
    gmail: `https://mail.google.com/mail/#all/${thread.id}`,
    status: needsReply ? "reply" : "waiting",
    statusLabel: needsReply ? "내 답장 필요" : "상대 답장 대기",
    brand: subject || advertiser,
    amount: "Gmail 원문 확인 필요",
    deadline: "Gmail 원문 확인 필요",
    lastTouch: String(last.date || seoulNow()),
    lastTouchIso: latestDate.toISOString(),
    account: TARGET_EMAIL,
    oneLine: `${advertiser} thread의 최신 Gmail 원문이 동기화되었습니다.`,
    nextAction: needsReply ? "최신 메일 원문을 확인하고 답장 여부를 결정." : "상대 답장 대기.",
    ...priority,
    highlights: ["Gmail OAuth 즉시 동기화로 가져온 thread", `원문 메시지 ${messages.length}개 저장`, "삭제한 thread는 새 메일 전까지 복구하지 않음"],
    timeline: messages.map((message) => [String(message.date || ""), String(message.from || "")]),
    draft: needsReply ? "원문을 확인한 뒤 답장 초안을 작성하세요." : "상대 답장을 기다립니다.",
    messages,
  };
}

async function syncGmailNow() {
  const payload = await mailPayload();
  if (!payload || !Array.isArray(payload.deals)) throw new Error("data_not_found");
  const accessToken = await refreshAccessToken();
  const queries = [
    { q: `to:${TARGET_EMAIL} newer_than:14d -in:trash -in:spam`, pages: 1, max: 25 },
    { q: `cc:${TARGET_EMAIL} newer_than:14d -in:trash -in:spam`, pages: 1, max: 25 },
    { q: `deliveredto:${TARGET_EMAIL} newer_than:14d -in:trash -in:spam`, pages: 1, max: 25 },
    {
      q: `to:${TARGET_EMAIL} newer_than:120d -in:trash -in:spam (광고 OR 협업 OR 제안 OR PPL OR 브랜디드 OR 공동구매 OR 협찬 OR partnership OR collaboration OR campaign OR creator OR influencer OR sponsor)`,
      pages: 2,
      max: 50,
    },
    {
      q: `cc:${TARGET_EMAIL} newer_than:120d -in:trash -in:spam (광고 OR 협업 OR 제안 OR PPL OR 브랜디드 OR 공동구매 OR 협찬 OR partnership OR collaboration OR campaign OR creator OR influencer OR sponsor)`,
      pages: 2,
      max: 50,
    },
    { q: `to:${TARGET_EMAIL} from:jnhan@momentsco.com`, pages: 1, max: 25 },
  ];
  const threadIds = new Set<string>();
  for (const query of queries) {
    for (const id of await gmailThreadIds(query.q, accessToken, query.pages, query.max)) {
      threadIds.add(id);
      if (threadIds.size >= 90) break;
    }
    if (threadIds.size >= 90) break;
  }

  const updated = new Map<string, MailDeal>((payload.deals || []).map((deal) => [String(deal.id), deal]));
  let skippedDeleted = 0;
  let skippedNoise = 0;
  let added = 0;
  let changed = 0;
  for (const id of threadIds) {
    const thread = await gmailJson(`threads/${id}?format=full`, accessToken);
    if (isNoiseThread(thread)) {
      skippedNoise++;
      continue;
    }
    const deal = await dealFromThread(thread, accessToken);
    if (!deal) {
      skippedNoise++;
      continue;
    }
    const targetMessages = messagesForTargetAccount(thread);
    const latestDate = gmailMessageDate(targetMessages[targetMessages.length - 1] || {});
    if (isDeleted(payload, deal, latestDate)) {
      skippedDeleted++;
      continue;
    }
    if (updated.has(String(deal.id))) changed++;
    else added++;
    updated.set(String(deal.id), { ...(updated.get(String(deal.id)) || {}), ...deal });
  }

  payload.deals = Array.from(updated.values());
  payload.source = "Gmail OAuth yuso@wootso.com only";
  payload.updatedAt = seoulNow();
  await updateMailPayload(payload);
  return { ok: true, added, updated: changed, skippedDeleted, skippedNoise, finalCount: payload.deals.length, updatedAt: payload.updatedAt };
}

async function handlePost(req: Request, p: string) {
  let body: JsonMap = {};
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "bad_request" }, 400);
  }
  const password = String(body?.password || "");

  if (p === "/api/data") {
    if (!(await verifyPassword(password))) return json(req, { error: "unauthorized" }, 401);
    const payload = await mailPayload();
    if (!payload) return json(req, { error: "data_not_found" }, 404);
    return json(req, payload, 200);
  }

  if (p === "/api/delete-deal") {
    const id = String(body?.id || "");
    if (!id) return json(req, { error: "missing_id" }, 400);
    if (!(await verifyPassword(password))) return json(req, { error: "unauthorized" }, 401);
    const payload = await mailPayload();
    if (!payload || !Array.isArray(payload.deals)) return json(req, { error: "data_not_found" }, 404);
    const deletedDeal = payload.deals.find((deal) => String(deal.id || "") === id);
    if (!deletedDeal) return json(req, { error: "not_found" }, 404);
    payload.deals = payload.deals.filter((deal) => String(deal.id || "") !== id);
    const tombstone = {
      id,
      advertiser: deletedDeal.advertiser || "",
      email: deletedDeal.email || "",
      gmail: deletedDeal.gmail || "",
      lastTouch: deletedDeal.lastTouch || "",
      deletedAt: new Date().toISOString(),
      deletedAtLabel: seoulNow(),
      restoreWhenNewMailArrives: true,
    };
    const previous = Array.isArray(payload.deletedDeals) ? payload.deletedDeals : [];
    payload.deletedDeals = [...previous.filter((deal) => String(deal.id || "") !== id), tombstone];
    payload.updatedAt = seoulNow();
    await updateMailPayload(payload);
    return json(req, { ok: true, deletedId: id, deals: payload.deals.length, deletedDeals: payload.deletedDeals.length, updatedAt: payload.updatedAt }, 200);
  }

  if (p === "/api/change-password") {
    const currentPassword = String(body?.currentPassword || "");
    const newPassword = String(body?.newPassword || "");
    if (newPassword.length < 8 || newPassword.length > 80) return json(req, { error: "invalid_new_password" }, 400);
    if (!(await verifyPassword(currentPassword))) return json(req, { error: "unauthorized" }, 401);
    await updatePasswordHash(newPassword);
    return json(req, { ok: true }, 200);
  }

  if (p === "/api/gmail/status") {
    if (!(await verifyPassword(password))) return json(req, { error: "unauthorized" }, 401);
    const saved = await oauthRecord("gmail_tokens");
    return json(req, { configured: oauthConfigured(), connected: Boolean(saved.refresh_token), email: saved.email || "" });
  }

  if (p === "/api/gmail/auth-url") {
    if (!(await verifyPassword(password))) return json(req, { error: "unauthorized" }, 401);
    if (!oauthConfigured()) return json(req, { error: "gmail_oauth_not_configured", redirectUri: REDIRECT_URI }, 400);
    const state = crypto.randomUUID();
    await updateOauthRecord("gmail_state", { state, created_at: new Date().toISOString() });
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: GMAIL_SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
      login_hint: "yuso@wootso.com",
    });
    return json(req, { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  }

  if (p === "/api/gmail/sync") {
    if (!(await verifyPassword(password))) return json(req, { error: "unauthorized" }, 401);
    try {
      return json(req, await syncGmailNow());
    } catch (error) {
      return json(req, { error: String(error instanceof Error ? error.message : error) }, 400);
    }
  }

  return json(req, { error: "not_found" }, 404);
}

async function handleCallback(req: Request) {
  if (!oauthConfigured()) return new Response("Gmail OAuth is not configured.", { status: 500 });
  const url = new URL(req.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const savedState = await oauthRecord("gmail_state");
  if (!code || !state || state !== savedState.state) return new Response("Invalid OAuth state.", { status: 400 });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  const data = await response.json();
  if (!response.ok) return new Response(`Token exchange failed: ${JSON.stringify(data)}`, { status: 400 });
  const accessToken = data.access_token;
  let email = "";
  try {
    const profile = await gmailJson("profile", accessToken);
    email = String(profile.emailAddress || "");
  } catch {
    email = "";
  }
  const existing = await oauthRecord("gmail_tokens");
  await updateOauthRecord("gmail_tokens", {
    ...existing,
    refresh_token: data.refresh_token || existing.refresh_token,
    access_token: data.access_token,
    expires_at: Date.now() + Number(data.expires_in || 3600) * 1000,
    scope: data.scope,
    token_type: data.token_type,
    email,
    connected_at: new Date().toISOString(),
  });
  return Response.redirect(`${APP_URL}?gmail=connected`, 302);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (!SERVICE_ROLE_KEY) return json(req, { error: "server_not_configured" }, 500);
  const p = route(req);
  if (req.method === "GET" && p === "/api/gmail/callback") return handleCallback(req);
  if (req.method === "POST") return handlePost(req, p);
  return json(req, { error: "not_found" }, 404);
});
