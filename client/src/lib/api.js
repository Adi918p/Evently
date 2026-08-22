/**
 * Single gateway to the Express API.
 *
 * Every network call in the app goes through `request` so auth headers, error
 * shapes and the database-offline case are handled in exactly one place.
 *
 * Contract notes taken from the server, do not "tidy" these:
 *   - middleware/authMiddleware.js does `authHeader.split(" ")[1]`, so the
 *     header must be `Authorization: Bearer <token>`.
 *   - the token lives in localStorage under the key "token". The legacy pages
 *     used the same key, so an existing session survives this rewrite.
 *   - server.js short-circuits every /api request with 503 when Mongo is down.
 *   - GET /api/events returns a bare array; GET /api/events/:id returns
 *     { success, event, seatsLeft }. They are deliberately different.
 */

const TOKEN_KEY = "token";


const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || "";
/* ==========================================================================
   Token handling
   ========================================================================== */

export const getToken = () => {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token) => {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage blocked - session stays in memory only */
  }
};

export const clearToken = () => {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
};

/**
 * Reads the JWT payload without verifying it. Verification is the server's
 * job; this only drives UI affordances. Expired tokens are dropped so the UI
 * does not show a signed-in state the API will reject.
 */
export const decodeToken = (token = getToken()) => {
  if (!token) return null;
  try {
    const segment = token.split(".")[1];
    if (!segment) return null;
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      clearToken();
      return null;
    }
    return payload;
  } catch {
    clearToken();
    return null;
  }
};

/* ==========================================================================
   Errors
   ========================================================================== */

export class ApiError extends Error {
  constructor(message, { status = 0, data = null, offline = false } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
    this.offline = offline;
  }
}

/** True when the failure is worth a "check your connection" style message. */
export const isNetworkError = (error) =>
  error instanceof ApiError && (error.status === 0 || error.offline);

/* ==========================================================================
   Core request
   ========================================================================== */

let onUnauthorized = null;

/** Lets the auth provider react to a rejected token (sign out + redirect). */
export const setUnauthorizedHandler = (handler) => {
  onUnauthorized = handler;
};

async function request(
  path,
  { method = "GET", body, auth = false, signal, headers = {} } = {}
) {
  const finalHeaders = { ...headers };
  let payload;

  if (body !== undefined) {
    finalHeaders["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  if (auth) {
    const token = getToken();
    if (!token) {
      const error = new ApiError("Please sign in to continue.", { status: 401 });
      onUnauthorized?.(error);
      throw error;
    }
    finalHeaders.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(path, {
      method,
      headers: finalHeaders,
      body: payload,
      signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ApiError(
      "Cannot reach Evently right now. Check your connection and try again.",
      { status: 0 }
    );
  }

  // 204 and empty bodies are valid successes.
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (response.status === 503) {
    throw new ApiError(
      data?.message ||
        "Evently is temporarily unavailable. Please try again shortly.",
      { status: 503, data, offline: true }
    );
  }

  if (response.status === 401) {
    const error = new ApiError(data?.message || "Your session has expired.", {
      status: 401,
      data,
    });
    clearToken();
    onUnauthorized?.(error);
    throw error;
  }

  // A 5xx with no body did not come from a route handler - every one of ours
  // answers in JSON. It means nothing was listening: the Vite dev proxy returns
  // an empty 500 on ECONNREFUSED, and a reverse proxy does the same while the
  // API restarts or redeploys. Reporting that as "Request failed (500)" sends
  // people hunting for a bug in a request that was never delivered.
  if (response.status >= 500 && !data) {
    throw new ApiError(
      "Evently's server isn't responding. It may be restarting - wait a moment and try again.",
      { status: response.status, data: null, offline: true }
    );
  }

  // The API is inconsistent: some handlers signal failure with a non-2xx
  // status, others return 200 with { success: false }. Treat both as errors.
  if (!response.ok || data?.success === false) {
    throw new ApiError(data?.message || `Request failed (${response.status})`, {
      status: response.status,
      data,
    });
  }

  return data;
}

export { request };

/* ==========================================================================
   File downloads
   ========================================================================== */

/** Pulls the filename out of `attachment; filename="Evently-....pdf"`. */
const dispositionName = (header, fallback) => {
  if (!header) return fallback;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      /* fall through to the plain form */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1] : fallback;
};

/**
 * Downloads an authenticated binary response and hands it to the browser as a
 * save.
 *
 * `request` cannot do this: it reads the body as text to parse JSON, which
 * would corrupt a PDF. So this fetches the blob itself, and reads the failure
 * body as text only when the response is not ok - the server answers errors in
 * JSON, so a 403 or 409 still produces a real message instead of "download
 * failed".
 *
 * The object URL is revoked on the next tick. Revoking it synchronously would
 * race the click in Safari, and never revoking it leaks the whole file for the
 * lifetime of the tab.
 */
async function download(path, { fallbackName = "download" } = {}) {
  const token = getToken();
  if (!token) {
    const error = new ApiError("Please sign in to continue.", { status: 401 });
    onUnauthorized?.(error);
    throw error;
  }

  let response;
  try {
    response = await fetch(path, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new ApiError(
      "Cannot reach Evently right now. Check your connection and try again.",
      { status: 0 }
    );
  }

  if (!response.ok) {
    let message = `Download failed (${response.status})`;
    try {
      const text = await response.text();
      if (text) message = JSON.parse(text)?.message || message;
    } catch {
      /* keep the status message */
    }
    if (response.status === 401) {
      clearToken();
      const error = new ApiError(message, { status: 401 });
      onUnauthorized?.(error);
      throw error;
    }
    throw new ApiError(message, { status: response.status });
  }

  const blob = await response.blob();
  const name = dispositionName(
    response.headers.get("content-disposition"),
    fallbackName
  );

  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);

  return { name, size: blob.size };
}

export { download };

/* ==========================================================================
   Auth
   ========================================================================== */

export const auth = {
  login: (email, password) =>
    request("/api/auth/login", {
      method: "POST",
      body: { email, password },
    }),

  /** Starts signup. The server emails a 6 digit OTP and creates an unverified user. */
  register: (name, email, password) =>
    request("/api/auth/register", {
      method: "POST",
      body: { name, email, password },
    }),

  /** -> { registered, pendingVerification, deliverable, message } */
  checkEmail: (email) =>
    request("/api/auth/check-email", { method: "POST", body: { email } }),

  verifyEmailOtp: (email, otp) =>
    request("/api/auth/verify-email-otp", {
      method: "POST",
      body: { email, otp },
    }),

  resendEmailOtp: (email) =>
    request("/api/auth/resend-email-otp", { method: "POST", body: { email } }),

  me: (signal) => request("/api/auth/me", { auth: true, signal }),

  /** Full page redirect - Passport needs a real navigation, not fetch. */
  googleUrl: () => "/api/auth/google",
  /**
   * Full page redirect - Passport needs a real navigation, not fetch, so this
   * is a URL rather than a request. Absolute when VITE_API_ORIGIN is set; see
   * the note on API_ORIGIN for why this one call skips the proxy.
   */
  googleUrl: () => `${API_ORIGIN}/api/auth/google`
};

/* ==========================================================================
   Events
   ========================================================================== */

/** Server accepts q, city, category and date (plus dateFrom/dateTo aliases). */
const eventQuery = ({ query, city, category, date, dateFrom, dateTo } = {}) => {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (city) params.set("city", city);
  if (category) params.set("category", category);
  if (date) params.set("date", date);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
};

export const events = {
  /** -> Event[] (bare array, not wrapped) */
  list: (filters, signal) =>
    request(`/api/events${eventQuery(filters)}`, { signal }),

  /** -> { success, event, seatsLeft } */
  get: (id, signal) =>
    request(`/api/events/${encodeURIComponent(id)}`, { signal }),

  /** Organizer's own events. */
  mine: (signal) => request("/api/events/my", { auth: true, signal }),

  dashboardStats: (signal) =>
    request("/api/events/dashboard/stats", { auth: true, signal }),

  bookings: (id, signal) =>
    request(`/api/events/${encodeURIComponent(id)}/bookings`, {
      auth: true,
      signal,
    }),

  create: (payload) =>
    request("/api/events", { method: "POST", body: payload, auth: true }),

  update: (id, payload) =>
    request(`/api/events/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: payload,
      auth: true,
    }),

  remove: (id) =>
    request(`/api/events/${encodeURIComponent(id)}`, {
      method: "DELETE",
      auth: true,
    }),

  /**
   * Image upload. The server takes base64 data URLs in the JSON body (there is
   * no multipart handler) and stores the bytes in MongoDB, returning
   * app-relative /api/images/<key> paths. express.json is capped at 12mb, so
   * callers must downscale before sending.
   */
  uploadImages: (payload) =>
    request("/api/events/uploads", {
      method: "POST",
      body: payload,
      auth: true,
    }),
};

/* ==========================================================================
   Payments + bookings
   ========================================================================== */

export const payments = {
  /** -> { success, order, keyId } - keyId is the public Razorpay key. */
  createOrder: (eventId, tickets) =>
    request("/api/payments/create-order", {
      method: "POST",
      body: { eventId, tickets },
      auth: true,
    }),

  /**
   * Confirms the Razorpay signature server-side and creates the booking.
   * Key names are Razorpay's snake_case and must be passed through verbatim.
   */
  verify: ({
    eventId,
    tickets,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  }) =>
    request("/api/payments/verify", {
      method: "POST",
      body: {
        eventId,
        tickets,
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
      },
      auth: true,
    }),
};

export const bookings = {
  create: (payload) =>
    request("/api/bookings", { method: "POST", body: payload, auth: true }),

  mine: (signal) => request("/api/bookings/my", { auth: true, signal }),

  /**
   * Saves the pass as a PDF. The server re-renders it per request, so an old
   * booking downloads with the current design rather than whatever was emailed.
   * The real filename comes back in Content-Disposition; the fallback only
   * matters if a proxy strips the header.
   */
  downloadTicket: (id, ticketId) =>
    download(`/api/bookings/${encodeURIComponent(id)}/ticket`, {
      fallbackName: `Evently-${ticketId || "ticket"}.pdf`,
    }),

  /**
   * Door check-in, two steps.
   *
   * `mode: "preview"` reads the pass and returns what to show without touching
   * it. `mode: "confirm"` is the only call that checks anyone in, so the
   * operator can look at the name and guest count first. Omitting mode means
   * preview - the server defaults that way too.
   *
   * Refusals (not found, cancelled, already used, wrong event) come back as a
   * 200 with `ok: false`, so `request` resolves and the caller renders the
   * verdict. Only an authorisation failure throws.
   *
   * -> { mode, ok, state, message, booking, display }
   *    state: valid | admitted | checked-in | cancelled | wrong-event | not-found
   */
  verifyTicket: ({ bookingId, ticketId, eventId, mode = "preview" } = {}) =>
    request("/api/bookings/verify-ticket", {
      method: "POST",
      body: { bookingId, ticketId, eventId, mode },
      auth: true,
    }),
};

/* ==========================================================================
   Contact
   ========================================================================== */

export const contact = {
  send: ({ name, email, subject, message }) =>
    request("/api/contact", {
      method: "POST",
      body: { name, email, subject, message },
    }),
};

/* ==========================================================================
   Admin
   ========================================================================== */

export const admin = {
  dashboard: (signal) => request("/api/admin/dashboard", { auth: true, signal }),
  stats: (signal) => request("/api/admin/stats", { auth: true, signal }),

  events: (signal) => request("/api/admin/events", { auth: true, signal }),
  pendingEvents: (signal) =>
    request("/api/admin/events/pending", { auth: true, signal }),
  approveEvent: (id) =>
    request(`/api/admin/events/${encodeURIComponent(id)}/approve`, {
      method: "PATCH",
      auth: true,
    }),
  rejectEvent: (id) =>
    request(`/api/admin/events/${encodeURIComponent(id)}/reject`, {
      method: "PATCH",
      auth: true,
    }),
  deleteEvent: (id) =>
    request(`/api/admin/events/${encodeURIComponent(id)}`, {
      method: "DELETE",
      auth: true,
    }),

  users: (signal) => request("/api/admin/users", { auth: true, signal }),
  setUserRole: (id, role) =>
    request(`/api/admin/users/${encodeURIComponent(id)}/role`, {
      method: "PATCH",
      body: { role },
      auth: true,
    }),
  setUserStatus: (id, status) =>
    request(`/api/admin/users/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: { status },
      auth: true,
    }),

  messages: (signal) => request("/api/admin/messages", { auth: true, signal }),
  deleteMessage: (id) =>
    request(`/api/admin/messages/${encodeURIComponent(id)}`, {
      method: "DELETE",
      auth: true,
    }),
};
