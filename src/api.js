/**
 * Tanaqul API Service Layer — Session 6
 * Connects React dashboard to live FastAPI backend on Railway.
 *
 * Usage:
 *   import api from './api';
 *   const investors = await api.investors.list();
 *   const dashboard = await api.dashboard.stats();
 */

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE) || "https://tanaqul-production.up.railway.app/api/v1";

// ─── Token Management ───────────────────────────────────────────────────────

let accessToken = localStorage.getItem("tanaqul_token") || null;
let refreshToken = localStorage.getItem("tanaqul_refresh") || null;

function setTokens(access, refresh) {
  accessToken = access;
  refreshToken = refresh;
  if (access) localStorage.setItem("tanaqul_token", access);
  else localStorage.removeItem("tanaqul_token");
  if (refresh) localStorage.setItem("tanaqul_refresh", refresh);
  else localStorage.removeItem("tanaqul_refresh");
}

function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem("tanaqul_token");
  localStorage.removeItem("tanaqul_refresh");
}

function getToken() {
  return accessToken;
}

// ─── Core Fetch Wrapper ─────────────────────────────────────────────────────

async function request(path, options = {}) {
  const { method = "GET", body, params, noAuth = false } = options;

  let url = `${API_BASE}${path}`;
  if (params) {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== "")
    ).toString();
    if (qs) url += `?${qs}`;
  }

  const headers = { "Content-Type": "application/json" };
  if (!noAuth && accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Auto-refresh on 401
  if (res.status === 401 && refreshToken && !options._retried) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request(path, { ...options, _retried: true });
    }
    clearTokens();
    window.dispatchEvent(new Event("tanaqul:logout"));
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `API Error ${res.status}`);
  }

  return res.json();
}

async function refreshAccessToken() {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    setTokens(data.access_token, data.refresh_token || refreshToken);
    return true;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════════════════════════

const auth = {
  async login(email, password) {
    const data = await request("/auth/login", {
      method: "POST",
      body: { email, password },
      noAuth: true,
    });
    setTokens(data.access_token, data.refresh_token);
    return data;
  },

  async logout() {
    try {
      await request("/auth/logout", { method: "POST" });
    } catch {
      // Ignore errors on logout
    }
    clearTokens();
  },

  isAuthenticated() {
    return !!accessToken;
  },

  getToken,
};

// ═══════════════════════════════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

const dashboard = {
  async stats() {
    return request("/dashboard/stats");
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  INVESTORS
// ═══════════════════════════════════════════════════════════════════════════════

const investors = {
  async list(params = {}) {
    return request("/investors", { params });
  },

  async get(id) {
    return request(`/investors/${id}`);
  },

  async create(data) {
    return request("/investors", { method: "POST", body: data });
  },

  async update(id, data) {
    return request(`/investors/${id}`, { method: "PATCH", body: data });
  },

  async action(id, action) {
    return request(`/investors/${id}/${action}`, { method: "POST" });
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  ORDERS
// ═══════════════════════════════════════════════════════════════════════════════

const orders = {
  async list(params = {}) {
    return request("/orders", { params });
  },

  async get(id) {
    return request(`/orders/${id}`);
  },

  async create(data) {
    return request("/orders", { method: "POST", body: data });
  },

  async cancel(id) {
    return request(`/orders/${id}/cancel`, { method: "POST" });
  },

  async match(buyOrderId, sellOrderId) {
    return request("/orders/match", {
      method: "POST",
      body: { buy_order_id: buyOrderId, sell_order_id: sellOrderId },
    });
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  MATCHES / TRADES
// ═══════════════════════════════════════════════════════════════════════════════

const matches = {
  async list(params = {}) {
    return request("/matches", { params });
  },

  async get(id) {
    return request(`/matches/${id}`);
  },

  async stats() {
    return request("/matches/stats/summary");
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  WALLET
// ═══════════════════════════════════════════════════════════════════════════════

const wallet = {
  async movements(params = {}) {
    return request("/wallet/movements", { params });
  },

  async credit(data) {
    return request("/wallet/credit", { method: "POST", body: data });
  },

  async balance(investorId) {
    return request(`/wallet/balance/${investorId}`);
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  TRANSACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

const transactions = {
  async list(params = {}) {
    return request("/public/explorer/transactions/recent", { params });
  },

  async get(id) {
    return request(`/public/explorer/tx/${id}`);
  },

  async stats() {
    return request("/public/explorer/network");
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  VAULT (BARS)
// ═══════════════════════════════════════════════════════════════════════════════

const vault = {
  async bars(params = {}) {
    return request("/vault/bars", { params });
  },

  async getBar(id) {
    return request(`/vault/bars/${id}`);
  },

  async scanBarcode(barcode) {
    return request(`/vault/bars/barcode/${barcode}`);
  },

  async addBar(data) {
    return request("/vault/bars", { method: "POST", body: data });
  },

  async linkBar(barId, investorId) {
    return request(`/vault/bars/${barId}/link/${investorId}`, { method: "POST" });
  },

  async unlinkBar(barId) {
    return request(`/vault/bars/${barId}/unlink`, { method: "POST" });
  },

  async updateStatus(barId, status) {
    return request(`/vault/bars/${barId}/status`, {
      method: "PATCH",
      body: { status },
    });
  },

  async stats() {
    return request("/vault/stats");
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  APPOINTMENTS
// ═══════════════════════════════════════════════════════════════════════════════

const appointments = {
  async list(params = {}) {
    return request("/appointments", { params });
  },

  async get(id) {
    return request(`/appointments/${id}`);
  },

  async book(data) {
    return request("/appointments", { method: "POST", body: data });
  },

  async reschedule(id, scheduledAt) {
    return request(`/appointments/${id}/reschedule`, {
      method: "POST",
      body: { scheduled_at: scheduledAt },
    });
  },

  async cancel(id) {
    return request(`/appointments/${id}/cancel`, { method: "POST" });
  },

  async noShow(id) {
    return request(`/appointments/${id}/no-show`, { method: "POST" });
  },

  async start(id) {
    return request(`/appointments/${id}/start`, { method: "POST" });
  },

  async complete(id) {
    return request(`/appointments/${id}/complete`, { method: "POST" });
  },

  async generateOtp(id) {
    return request(`/appointments/${id}/otp/generate`, { method: "POST" });
  },

  async verifyOtp(id, code) {
    return request(`/appointments/${id}/otp/verify`, {
      method: "POST",
      body: { otp_code: code },
    });
  },

  async stats() {
    return request("/appointments/stats/summary");
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  WITHDRAWAL REQUESTS
// ═══════════════════════════════════════════════════════════════════════════════

const withdrawals = {
  async list(params = {}) {
    return request("/withdrawals", { params });
  },

  async get(id) {
    return request(`/withdrawals/${id}`);
  },

  async submit(data) {
    return request("/withdrawals", { method: "POST", body: data });
  },

  async approve(id) {
    return request(`/withdrawals/${id}/action`, {
      method: "POST",
      body: { action: "approve" },
    });
  },

  async reject(id, reason) {
    return request(`/withdrawals/${id}/action`, {
      method: "POST",
      body: { action: "reject", reason },
    });
  },

  async process(id) {
    return request(`/withdrawals/${id}/action`, {
      method: "POST",
      body: { action: "process" },
    });
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  BLACKLIST
// ═══════════════════════════════════════════════════════════════════════════════

const blacklist = {
  async list(params = {}) {
    return request("/blacklist", { params });
  },

  async check(nationalId) {
    return request(`/blacklist/check/${nationalId}`);
  },

  async ban(data) {
    return request("/blacklist", { method: "POST", body: data });
  },

  async unban(id) {
    return request(`/blacklist/${id}/unban`, { method: "POST" });
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  VALIDATORS
// ═══════════════════════════════════════════════════════════════════════════════

const validators = {
  async list(params = {}) {
    return request("/validators", { params });
  },

  async get(id) {
    return request(`/validators/${id}`);
  },

  async register(data) {
    return request("/validators", { method: "POST", body: data });
  },

  async update(id, data) {
    return request(`/validators/${id}`, { method: "PATCH", body: data });
  },

  async stats() {
    return request("/validators/stats/summary");
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  BLOCKCHAIN (BLOCKS)
// ═══════════════════════════════════════════════════════════════════════════════

const blocks = {
  async list(params = {}) {
    return request("/blocks", { params });
  },

  async get(blockNumber) {
    return request(`/blocks/${blockNumber}`);
  },

  async create(data) {
    return request("/blocks", { method: "POST", body: data });
  },

  async verifyChain() {
    return request("/blocks/chain/verify");
  },

  async stats() {
    return request("/blocks/chain/stats");
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  AML / CMA COMPLIANCE
// ═══════════════════════════════════════════════════════════════════════════════

const aml = {
  async scan(lookbackDays = 30) {
    return request("/aml/scan", { params: { lookback_days: lookbackDays } });
  },

  async riskProfile(investorId) {
    return request(`/aml/risk/${investorId}`);
  },

  async cmaReport(periodDays = 30) {
    return request("/aml/cma-report", { params: { period_days: periodDays } });
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  TREASURY & RECONCILIATION
// ═══════════════════════════════════════════════════════════════════════════════

const treasury = {
  async overview() {
    return request("/treasury/overview");
  },

  async daily(date = null) {
    return request("/treasury/daily", { params: date ? { date } : {} });
  },

  async auditBalances(params = {}) {
    return request("/treasury/audit/balances", { params });
  },

  async commission(periodDays = 30) {
    return request("/treasury/commission", { params: { period_days: periodDays } });
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  EXPORT
// ═══════════════════════════════════════════════════════════════════════════════
const storageFees = {
  async getConfig() { return request("/storage-fees/config"); },
  async saveConfig(d) { return request("/storage-fees/config", { method: "PUT", body: d }); },
  async getHistory(p={}) { return request("/storage-fees/history", { params: p }); },
  async runBilling(d) { return request("/storage-fees/run-billing", { method: "POST", body: d }); },
  async setExempt(id,d) { return request("/storage-fees/exempt/"+id, { method: "POST", body: d }); },
  async getExempt(id) { return request("/storage-fees/exempt/"+id); },
  async waiveMonth(id,d) { return request("/storage-fees/waive/"+id, { method: "POST", body: d }); },
  async forceSell(id,d) { return request("/storage-fees/force-sell/"+id, { method: "POST", body: d }); },
};
const api = {
  auth,
  dashboard,
  investors,
  orders,
  matches,
  wallet,
  transactions,
  vault,
  appointments,
  withdrawals,
  blacklist,
  validators,
  blocks,
  aml,
  treasury,
  storageFees,
  // Utilities
  setBaseUrl(url) {
    // Override base URL if needed
    Object.defineProperty(this, "_base", { value: url });
  },
};

export default api;
export { API_BASE, getToken, setTokens, clearTokens };

