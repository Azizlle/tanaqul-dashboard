/**
 * Tanaqul — useApi Hook (Session 6)
 * Drop-in React hook that replaces MOCK data with live API data.
 *
 * Usage in TanaqulDashboard.jsx:
 *   import { useApiData } from './useApi';
 *
 *   // Inside your App component, replace the MOCK-based state with:
 *   const liveData = useApiData();
 *
 *   // Then pass liveData into AppDataContext.Provider value
 */

import { useState, useEffect, useCallback, useRef } from "react";
import api from "./api";

// ─── Data Transformers ──────────────────────────────────────────────────────
// Convert API response format → dashboard's expected format

function transformInvestor(inv) {
  return {
    id: inv.display_id || inv.id,
    _uuid: inv.id,
    nameEn: inv.name_en,
    nameAr: inv.name_ar,
    wallet: inv.wallet_address || "pending",
    holdingsValue: formatNum(inv.holdings_value),
    gold: inv.gold_grams || 0,
    silver: inv.silver_grams || 0,
    platinum: inv.platinum_grams || 0,
    status: inv.status,
    joined: inv.created_at?.split("T")[0] || "",
    vaultKey: inv.vault_key,
    nationalId: inv.national_id,
    kycExpiry: inv.kyc_expiry,
    noShowCount: inv.no_show_count || 0,
  };
}

function transformBar(bar) {
  return {
    id: bar.display_id || bar.id,
    _uuid: bar.id,
    metal: bar.metal,
    weight: `${bar.weight_grams}g`,
    barcode: bar.barcode,
    manufacturer: bar.manufacturer,
    vault: bar.vault_location,
    status: bar.status,
    depositor: bar.depositor_display_id || "—",
    deposited: bar.deposited_at?.split("T")[0] || "",
  };
}

function transformAppointment(apt) {
  return {
    id: apt.display_id || apt.id,
    _uuid: apt.id,
    investor: apt.investor_name,
    investorPhone: apt.investor_phone || "",
    nationalId: apt.national_id,
    type: apt.type,
    metal: apt.metal || "",
    qty: apt.quantity || "",
    vault: apt.vault_location || "",
    date: apt.scheduled_at?.replace("T", " ").substring(0, 16) || "",
    status: apt.status,
    fee: apt.fee || 0,
    paymentMethod: apt.payment_method || "",
  };
}

function transformTransaction(txn) {
  return {
    id: txn.display_id || txn.id,
    _uuid: txn.id,
    investor: txn.buyer_name || txn.seller_name || "",
    investorAr: txn.buyer_name_ar || txn.seller_name_ar || "",
    vaultKey: txn.vault_key || "",
    type: txn.type,
    metal: txn.metal,
    metalAmt: formatNum(txn.metal_amount || txn.total_sar),
    commission: formatNum(txn.commission),
    adminFee: formatNum(txn.admin_fee || 0),
    method: txn.payment_method || "Wallet",
    total: formatNum(txn.total_sar),
    status: txn.status,
    date: txn.created_at?.replace("T", " ").substring(0, 16) || "",
    buyerName: txn.buyer_name,
    buyerNationalId: txn.buyer_national_id,
    sellerName: txn.seller_name,
    sellerNationalId: txn.seller_national_id,
  };
}

function transformOrder(ord) {
  return {
    id: ord.display_id || ord.id,
    _uuid: ord.id,
    investor: ord.investor_name,
    investorId: ord.investor_id,
    type: ord.side,
    metal: ord.metal,
    grams: ord.quantity_grams,
    pricePerGram: ord.price_per_gram,
    totalSAR: ord.total_sar,
    commission: ord.commission,
    adminFee: ord.admin_fee,
    status: ord.status,
    date: ord.created_at?.replace("T", " ").substring(0, 16) || "",
  };
}

function transformMatch(m) {
  return {
    id: m.display_id || m.id,
    _uuid: m.id,
    metal: m.metal,
    grams: m.quantity_grams,
    pricePerGram: m.price_per_gram,
    totalSAR: m.total_sar,
    commission: m.commission,
    buyerName: m.buyer_name,
    sellerName: m.seller_name,
    blockNumber: m.block_number,
    date: m.matched_at?.replace("T", " ").substring(0, 16) || "",
  };
}

function transformWalletMovement(wm) {
  return {
    id: wm.display_id || wm.id,
    investor: wm.investor_name || "",
    nationalId: wm.national_id,
    vaultKey: wm.vault_key || "",
    type: wm.type,
    amount: formatNum(wm.amount),
    reason: wm.reason,
    date: wm.created_at?.replace("T", " ").substring(0, 16) || "",
  };
}

function transformWithdrawal(wr) {
  return {
    id: wr.display_id || wr.id,
    _uuid: wr.id,
    investor: wr.investor_name,
    nationalId: wr.national_id,
    amount: formatNum(wr.amount),
    bank: wr.bank_info || "",
    status: wr.status,
    requested: wr.created_at?.split("T")[0] || "",
    processed: wr.processed_at?.split("T")[0] || "—",
    rejectReason: wr.reject_reason || "",
  };
}

function transformBlacklist(bl) {
  return {
    id: bl.display_id || bl.id,
    _uuid: bl.id,
    name: bl.investor_name || "Unknown",
    nationalId: bl.national_id,
    vaultKey: bl.vault_key || "—",
    reason: bl.reason,
    bannedBy: bl.banned_by || "",
    date: bl.created_at?.split("T")[0] || "",
  };
}

function transformValidator(v) {
  return {
    id: v.display_id || v.id,
    _uuid: v.id,
    name: v.name,
    address: v.address,
    status: v.status,
    blocksValidated: v.blocks_validated,
    lastBlock: v.last_block,
    commissionEarned: formatNum(v.commission_earned),
    weight: `${v.weight_percent}%`,
    joined: v.joined_at?.split("T")[0] || "",
  };
}

function transformBlock(b) {
  return {
    number: b.number,
    hash: b.hash?.substring(0, 10) + "..." + b.hash?.slice(-4) || "",
    fullHash: b.hash,
    txCount: b.tx_count,
    commission: formatNum(b.commission),
    tanaqulShare: formatNum(b.tanaqul_share),
    creatorShare: formatNum(b.creator_share),
    validatorsShare: formatNum(b.validators_share),
    validator: b.validator_name,
    timestamp: b.created_at?.replace("T", " ").substring(0, 16) || "",
    size: `${(b.size_bytes / (1024 * 1024)).toFixed(2)} MB`,
  };
}

function formatNum(n) {
  if (n == null) return "0";
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// ─── Main Hook ──────────────────────────────────────────────────────────────

export function useApiData() {
  const [investors, setInvestors] = useState([]);
  const [bars, setBars] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [matches, setMatches] = useState([]);
  const [walletMovements, setWalletMovements] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [blacklistEntries, setBlacklistEntries] = useState([]);
  const [validators, setValidators] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [amlAlerts, setAmlAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refreshInterval = useRef(null);

  // Fetch all data
  const fetchAll = useCallback(async () => {
    try {
      const [
        invRes,
        barRes,
        aptRes,
        txnRes,
        ordRes,
        matchRes,
        wmRes,
        wrRes,
        blRes,
        valRes,
        blockRes,
        statsRes,
      ] = await Promise.allSettled([
        api.investors.list({ page_size: 200 }),
        api.vault.bars({ page_size: 200 }),
        api.appointments.list({ page_size: 200 }),
        api.transactions.list({ page_size: 200 }),
        api.orders.list({ page_size: 200 }),
        api.matches.list({ page_size: 200 }),
        api.wallet.movements({ page_size: 200 }),
        api.withdrawals.list({ page_size: 200 }),
        api.blacklist.list({ page_size: 200 }),
        api.validators.list({ page_size: 200 }),
        api.blocks.list({ page_size: 50 }),
        api.dashboard.stats(),
      ]);

      if (invRes.status === "fulfilled")
        setInvestors((invRes.value || []).map(transformInvestor));
      if (barRes.status === "fulfilled")
        setBars((barRes.value || []).map(transformBar));
      if (aptRes.status === "fulfilled")
        setAppointments((aptRes.value || []).map(transformAppointment));
      if (txnRes.status === "fulfilled")
        setTransactions((txnRes.value || []).map(transformTransaction));
      if (ordRes.status === "fulfilled")
        setOrders((ordRes.value || []).map(transformOrder));
      if (matchRes.status === "fulfilled")
        setMatches((matchRes.value || []).map(transformMatch));
      if (wmRes.status === "fulfilled")
        setWalletMovements((wmRes.value || []).map(transformWalletMovement));
      if (wrRes.status === "fulfilled")
        setWithdrawals((wrRes.value || []).map(transformWithdrawal));
      if (blRes.status === "fulfilled")
        setBlacklistEntries((blRes.value || []).map(transformBlacklist));
      if (valRes.status === "fulfilled")
        setValidators((valRes.value || []).map(transformValidator));
      if (blockRes.status === "fulfilled")
        setBlocks((blockRes.value || []).map(transformBlock));
      if (statsRes.status === "fulfilled")
        setDashboardStats(statsRes.value);

      setError(null);
    } catch (err) {
      console.error("API fetch error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + polling every 30s
  useEffect(() => {
    fetchAll();
    refreshInterval.current = setInterval(fetchAll, 30000);
    return () => clearInterval(refreshInterval.current);
  }, [fetchAll]);

  // AML scan
  const runAmlScan = useCallback(async (days = 30) => {
    try {
      const result = await api.aml.scan(days);
      setAmlAlerts(result.alerts || []);
      return result;
    } catch (err) {
      console.error("AML scan error:", err);
      return { alerts: [], total_alerts: 0 };
    }
  }, []);

  return {
    // Data
    investors,
    bars,
    appointments,
    transactions,
    orders,
    matches,
    walletMovements,
    withdrawals,
    blacklist: blacklistEntries,
    validators,
    blocks,
    dashboardStats,
    amlAlerts,
    // State
    loading,
    error,
    // Actions
    refresh: fetchAll,
    runAmlScan,
    // API reference for direct calls
    api,
  };
}

// ─── Action Hooks ───────────────────────────────────────────────────────────
// These hooks wrap API mutations and auto-refresh data

export function useInvestorActions(refresh) {
  return {
    async suspend(uuid) {
      await api.investors.action(uuid, "suspend");
      refresh();
    },
    async ban(uuid) {
      await api.investors.action(uuid, "ban");
      refresh();
    },
    async activate(uuid) {
      await api.investors.action(uuid, "activate");
      refresh();
    },
    async create(data) {
      const result = await api.investors.create(data);
      refresh();
      return result;
    },
  };
}

export function useVaultActions(refresh) {
  return {
    async addBar(data) {
      const result = await api.vault.addBar(data);
      refresh();
      return result;
    },
    async linkBar(barUuid, investorUuid) {
      await api.vault.linkBar(barUuid, investorUuid);
      refresh();
    },
    async unlinkBar(barUuid) {
      await api.vault.unlinkBar(barUuid);
      refresh();
    },
  };
}

export function useAppointmentActions(refresh) {
  return {
    async book(data) {
      const result = await api.appointments.book(data);
      refresh();
      return result;
    },
    async cancel(uuid) {
      await api.appointments.cancel(uuid);
      refresh();
    },
    async noShow(uuid) {
      await api.appointments.noShow(uuid);
      refresh();
    },
    async start(uuid) {
      await api.appointments.start(uuid);
      refresh();
    },
    async complete(uuid) {
      await api.appointments.complete(uuid);
      refresh();
    },
    async reschedule(uuid, dateTime) {
      await api.appointments.reschedule(uuid, dateTime);
      refresh();
    },
    async generateOtp(uuid) {
      return api.appointments.generateOtp(uuid);
    },
    async verifyOtp(uuid, code) {
      const result = await api.appointments.verifyOtp(uuid, code);
      refresh();
      return result;
    },
  };
}

export function useWithdrawalActions(refresh) {
  return {
    async approve(uuid) {
      await api.withdrawals.approve(uuid);
      refresh();
    },
    async reject(uuid, reason) {
      await api.withdrawals.reject(uuid, reason);
      refresh();
    },
    async process(uuid) {
      await api.withdrawals.process(uuid);
      refresh();
    },
  };
}

export function useBlacklistActions(refresh) {
  return {
    async ban(data) {
      const result = await api.blacklist.ban(data);
      refresh();
      return result;
    },
    async unban(uuid) {
      await api.blacklist.unban(uuid);
      refresh();
    },
  };
}

export function useBlockchainActions(refresh) {
  return {
    async createBlock(data) {
      const result = await api.blocks.create(data);
      refresh();
      return result;
    },
    async verifyChain() {
      return api.blocks.verifyChain();
    },
    async registerValidator(data) {
      const result = await api.validators.register(data);
      refresh();
      return result;
    },
    async updateValidator(uuid, data) {
      await api.validators.update(uuid, data);
      refresh();
    },
  };
}

export default api;
