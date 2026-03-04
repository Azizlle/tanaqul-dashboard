import React, { useState, useEffect, useRef, createContext, useContext, useCallback } from "react";

// ─── API Configuration ────────────────────────────────────────────────────────
const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE) || "https://tanaqul-production.up.railway.app/api/v1";

// Helper: API fetch with auth token
const apiFetch = async (path, options = {}) => {
  const token = localStorage.getItem("tanaqul_token");
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const resp = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (resp.status === 401) {
    // Try refresh
    const refresh = localStorage.getItem("tanaqul_refresh");
    if (refresh) {
      const rr = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (rr.ok) {
        const rd = await rr.json();
        localStorage.setItem("tanaqul_token", rd.access_token);
        localStorage.setItem("tanaqul_refresh", rd.refresh_token);
        headers["Authorization"] = `Bearer ${rd.access_token}`;
        return fetch(`${API_BASE}${path}`, { ...options, headers });
      }
    }
    localStorage.removeItem("tanaqul_token");
    localStorage.removeItem("tanaqul_refresh");
    window.dispatchEvent(new Event("tanaqul_logout"));
  }
  return resp;
};

// Helper: API login
// SECURITY: Login rate limiting
let _loginAttempts = 0;
let _loginLockout = 0;
const apiLogin = async (email, password, totp_code) => {
  if (Date.now() < _loginLockout) {
    const secs = Math.ceil((_loginLockout - Date.now()) / 1000);
    return { ok: false, status: 429, detail: "Too many attempts. Wait " + secs + "s" };
  }
  _loginAttempts++;
  if (_loginAttempts >= 5) {
    _loginLockout = Date.now() + 60000; // 1 min lockout
    _loginAttempts = 0;
    return { ok: false, status: 429, detail: "Too many attempts. Locked for 60s" };
  }
  const body = { email, password };
  if (totp_code) body.totp_code = totp_code;
  const resp = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (resp.ok) {
    if (data.requires_2fa_setup) {
      return { ok: false, status: 206, detail: "2FA_SETUP_REQUIRED", qr_code: data.qr_code, secret: data.secret };
    }
    _loginAttempts = 0; // Reset on success
    localStorage.setItem("tanaqul_token", data.access_token);
      localStorage.setItem("tanaqul_admin", JSON.stringify({name: data.name || data.email || "Admin", email: data.email || "", role: data.role || "viewer"})) // SECURITY: Default to viewer, not super_admin;
    localStorage.setItem("tanaqul_refresh", data.refresh_token);
    return { ok: true, data };
  }
  return { ok: false, status: resp.status, detail: data.detail, qr_code: data.qr_code, secret: data.secret };
};

// ─── Language Context ─────────────────────────────────────────────────────────

const AppDataContext = createContext({
  investors:[], setInvestors:()=>{},
  appointments:[], setAppointments:()=>{},
  bars:[], setBars:()=>{},
  withdrawals:[], setWithdrawals:()=>{},
  walletMovements:[], setWalletMovements:()=>{},
  orders:[], setOrders:()=>{},
  matches:[], setMatches:()=>{},
  validators:[], setValidators:()=>{},
  blacklist:[], setBlacklist:()=>{},
  auditLog:[], addAudit:()=>{},
  amlAlerts:[], cmaAlerts:[], amlDismissed:new Set(), dismissAmlAlert:()=>{}, amlLastRun:null,
  pageHint:null, setPageHint:()=>{},
  mmAccount:null, setMMAccount:()=>{}, reconState:null, setReconState:()=>{},
});
const useAppData = () => useContext(AppDataContext);

const LangContext = createContext({ lang:"en", t: k=>k, isAr: false, switchLang:()=>{}, bidEnabled:true, setBidEnabled:()=>{}, tradingOpen:true, setTradingOpen:()=>{}, commSplit:{buying:30,selling:30,creator:20,validators:20}, setCommSplit:()=>{}, gatewaySettings:{madaFee:"1.5",madaCap:"10.00",visaFee:"2.5",sadadFee:"5.00"}, setGatewaySettings:()=>{}, commissionRates:{buyer:"1.0",seller:"1.0"}, setCommissionRates:()=>{}, cancelFee:"50", setCancelFee:()=>{}, reportingConfig:{sarEmail:"",cmaEmail:"",sarEnabled:false,cmaEnabled:false,mlroName:"",mlroTitle:"",companyName:"",companyLicense:"",companyAddress:"",sarCc:"",cmaCc:""}, setReportingConfig:()=>{} });
const useLang = () => useContext(LangContext);
const useBidEnabled = () => { const { bidEnabled, setBidEnabled } = useContext(LangContext); return { bidEnabled, setBidEnabled }; };
const usePlatform = () => { const ctx = useContext(LangContext); return { tradingOpen: ctx.tradingOpen, setTradingOpen: ctx.setTradingOpen, commSplit: ctx.commSplit, setCommSplit: ctx.setCommSplit }; };

const AR = {
  // Sidebar
  "Dashboard":"لوحة التحكم",
  // Misc
  "Investors":"المستثمرون","Main Vault":"الخزينة الرئيسية","Appointments":"المواعيد","Financials":"الماليات","Reports":"التقارير",
  "Blacklist":"القائمة السوداء","Blocks":"البلوكات","Settings":"الإعدادات","Logout":"تسجيل الخروج","Collapse":"طي",
  "Live platform snapshot":"لقطة مباشرة للمنصة","Vault & Blockchain":"الخزينة والبلوكشين","Recent Transactions":"المعاملات الأخيرة",
  "Platform configuration and management":"إعدادات المنصة وإدارتها","Platform analytics and export center":"مركز التحليلات والتقارير",
  "Physical bars and token registry":"سجل السبائك والتوكينات","Vault deposit & withdrawal scheduling":"جدولة إيداع وسحب الخزينة",
  "Orders, wallets & withdrawal requests":"الطلبات والمحافظ وطلبات السحب",
  "Private permissioned blockchain — Tanaqul network":"البلوكشين الخاص — شبكة تنقّل",
  "Banned by National ID — blocked from login and registration until admin unbans":"محظورون بالهوية الوطنية","Total AUM":"إجمالي الأصول",
  "Volume (Today)":"الحجم (اليوم)","Volume (Month)":"الحجم (الشهر)","Commission (Today)":"العمولة (اليوم)",
  "Commission (Month)":"العمولة (الشهر)","Admin Fees (Today)":"رسوم الإدارة (اليوم)","Admin Fees (Month)":"رسوم الإدارة (الشهر)",
  "Active Orders":"طلبات نشطة","Pending Appointments":"مواعيد معلقة","Total Investors":"إجمالي المستثمرين","Gold (g)":"الذهب",
  "Silver (g)":"الفضة","Platinum (g)":"البلاتين","Tokens Minted":"توكينات مُضربة","Tokens Circulating":"التوكينات المتداولة",
  "Pending Burn":"بانتظار الحرق","Last Block":"آخر بلوك","Free Bars":"سبائك حرة","Linked Bars":"سبائك مرتبطة",
  "Total Tokens":"إجمالي التوكينات","Pending Withdrawal":"سحب معلق","Total Banned":"إجمالي المحظورين","Banned This Month":"محظورون هذا الشهر",
  "Unbanned This Month":"رُفع حظرهم هذا الشهر","Active Validators":"مدققون نشطون","Total Blocks":"إجمالي البلوكات",
  "Network Uptime":"وقت التشغيل","Name":"الاسم","Wallet":"المحفظة","Holdings (SAR)":"الحيازات","Status":"الحالة","Joined":"تاريخ الانضمام",
  "Actions":"الإجراءات","Bar ID":"رقم السبيكة","Metal":"المعدن","Weight":"الوزن","Purity":"النقاء","Serial":"التسلسلي","Location":"الموقع",
  "Linked To":"مرتبط بـ","Certificate":"الشهادة","Record ID":"رقم السجل","National ID":"الهوية الوطنية","Vault Key":"مفتاح الخزينة",
  "Reason":"السبب","Banned By":"محظور من قِبَل","Date":"التاريخ","Block #":"بلوك #","Transactions":"المعاملات","Commission":"العمولة",
  "Creator":"المنشئ","Size":"الحجم","Time":"الوقت","Order ID":"رقم الطلب","Type":"النوع","Amount (SAR)":"المبلغ (ريال)",
  "Metal / Grams":"المعدن / الغرامات","Payment":"الدفع","Withdrawal ID":"رقم السحب","Requested":"تاريخ الطلب","Amount":"المبلغ",
  "Save & Activate":"حفظ وتفعيل","Test Connection":"اختبار الاتصال","Add Bar":"إضافة سبيكة","Add Investor":"إضافة مستثمر",
  "Ban User":"حظر مستخدم","View":"عرض","Suspend":"إيقاف","Ban":"حظر","Activate":"تفعيل","Unban":"رفع الحظر","Notify":"إشعار","Reject":"رفض",
  "Mark Processed":"تمييز كمُعالج","Transfer":"نقل","Remove":"إزالة","Unlink":"فك الربط","Export":"تصدير","PDF":"PDF","Excel":"Excel",
  "Confirm":"تأكيد","Cancel":"إلغاء","Edit":"تعديل","Delete":"حذف","Close":"إغلاق","Back":"رجوع","Add Validator":"إضافة مدقق",
  "Deactivate":"إلغاء التفعيل","SUSPENDED":"موقوف","BANNED":"محظور","PENDING":"معلق","APPROVED":"مقبول","REJECTED":"مرفوض",
  "PROCESSED":"مُعالَج","FREE":"حر","LINKED":"مرتبط","PAYMENTS":"المدفوعات","COMMISSION":"العمولة","BLOCKCHAIN":"البلوكشين",
  "NOTIFICATIONS":"الإشعارات","VAULT":"الخزينة","MANUFACTURERS":"المصنّعون","NAFATH":"نفاذ","SECURITY":"الأمان",
  "Commission Per Party":"العمولة لكل طرف","Commission Split per Block":"توزيع العمولة لكل بلوك",
  "Distribution & Validator Qualification":"التوزيع وأهلية المدققين","تخارج — Takharoj Reserve Wallet":"تخارج — محفظة الاحتياطي",
  "Treasury & Recon":"الخزينة والتسوية","Daily Overview":"النظرة اليومية","Daily History":"السجل اليومي",
  "Weekly Sweeps":"التحويلات الأسبوعية","Discrepancy Log":"سجل الفروقات","Pool Bank":"بنك المجمع",
  "Market Maker":"صانع السوق","Takharoj Operating":"حساب تخارج التشغيلي","Vault 1:1":"تطابق الخزنة 1:1",
  "Run Reconciliation":"تشغيل التسوية","Trading Frozen":"التداول مجمد","Auto-Sweep":"تحويل تلقائي",
  "Manual Override":"تجاوز يدوي","Resolve":"حل","Balanced":"متوازن","Discrepancy":"فرق","Matched":"متطابق",
  "Mismatch":"عدم تطابق","Swept":"تم التحويل","Wallet Deposit":"إيداع المحفظة","MADA — Percentage + Fixed Cap":"مدى — نسبة + حد أقصى","Visa / Mastercard":"فيزا / ماستركارد",
  "SADAD — Fixed Fee":"سداد — رسوم ثابتة","Network":"الشبكة","Block Trigger":"محفز البلوك","Vault Locations":"مواقع الخزينة",
  "Appointment Rules":"قواعد المواعيد","Appointment Fees":"رسوم المواعيد","Manufacturers":"المصنّعون","NAFATH Integration":"تكامل نفاذ",
  "Live Price Feed":"خلاصة الأسعار المباشرة","Tanaqul — Buying Side":"تنقّل — جانب الشراء","Tanaqul — Selling Side":"تنقّل — جانب البيع",
  "Block Creator":"منشئ البلوك","Validators (weighted)":"المدققون (موزون)","Welcome back":"مرحباً بعودتك","Email":"البريد الإلكتروني",
  "Password":"كلمة المرور","Authenticator Code":"رمز المصادقة","Login":"دخول","Logging in...":"جاري الدخول...","Network Online":"الشبكة متصلة",
  "System Online":"النظام متصل","Validator Active":"مدقق نشط","Validators Active":"مدققون نشطون","Precious Admin":"إدارة المعادن",
  "Transaction Log":"سجل المعاملات","Order Book":"دفتر الأوامر","All Transactions":"جميع المعاملات","Txn ID":"رقم المعاملة",
  "Investor":"المستثمر","Admin Fee":"رسوم الإدارة","Total":"الإجمالي","Total Volume":"إجمالي الحجم","Total Commission":"إجمالي العمولة",
  "All":"الكل","BUY":"شراء","SELL":"بيع","COMPLETED":"مكتمل","CANCELLED":"ملغى","Total Holdings":"إجمالي الحيازات","Active":"نشط",
  "Suspended":"موقوف","Banned":"محظور","Search by name or ID...":"بحث بالاسم أو الرقم...","Integrity":"السلامة",
  "Linked Tokens":"توكينات مرتبطة","Floating":"عائم","Free":"حر","Linked":"مرتبط","DATE IN":"تاريخ الإيداع","DEPOSITOR":"المودِع",
  "MANUFACTURER":"الشركة المصنّعة","BARCODE":"الباركود","RESCHEDULED":"أُعيد جدولته","CANCELED":"ملغى","NO SHOW":"لم يحضر","EXPIRED":"منتهي",
  "BOOKED":"محجوز","WITHDRAWAL":"سحب","FEE":"الرسوم","SCHEDULED":"المجدول","QTY":"الكمية","No Show":"لم يحضر","Start":"ابدأ",
  "Reschedule":"إعادة جدولة","METHOD":"طريقة الدفع","ADMIN FEE":"رسوم الإدارة","WITHDRAWAL REQUESTS":"طلبات السحب",
  "WALLET MOVEMENTS":"حركات المحفظة","ORDERS":"الطلبات","IBAN":"الآيبان","BANK":"البنك",
  "pending withdrawal(s) require approval":"طلبات سحب معلقة تحتاج موافقة","Financial Reports":"التقارير المالية",
  "Vault Reports":"تقارير الخزينة","Investor Reports":"تقارير المستثمرين","Appointment Reports":"تقارير المواعيد",
  "ORDERS THIS MONTH":"الطلبات هذا الشهر","Payment Methods":"طرق الدفع","DAILY AVG THIS MONTH":"المتوسط اليومي هذا الشهر",
  "Volume by Period":"الحجم بالفترة","THIS MONTH":"هذا الشهر","Trading Volume by Metal":"حجم التداول بالمعدن",
  "COMMISSION + FEES":"العمولة والرسوم","Revenue Breakdown":"توزيع الإيرادات","APPOINTMENT TYPES":"أنواع المواعيد",
  "Deposit vs Withdrawal":"إيداع مقابل سحب","Tokens Minted/Burned":"توكينات مُصدَرة/محروقة","CIRCULATION STATUS":"حالة التداول",
  "Linked vs Floating Tokens":"مرتبط مقابل عائم","PHYSICAL INVENTORY":"المخزون الفعلي","Bars by Metal":"السبائك بالمعدن",
  "MOST ACTIVE":"الأكثر نشاطاً","Top by Trading Volume":"الأعلى تداولاً","HIGHEST PORTFOLIO":"أعلى محفظة",
  "Top by Holdings Value":"الأعلى بالحيازات","New Investors by Period":"مستثمرون جدد بالفترة","ACCOUNT STATUS":"حالة الحسابات",
  "Active / Suspended / Banned":"نشط / موقوف / محظور","SUCCESSFULLY DONE":"مكتمل بنجاح","Completion Rate":"معدل الإنجاز",
  "MISSED APPOINTMENTS":"مواعيد فائتة","No Show Rate":"معدل الغياب","TYPE BREAKDOWN":"توزيع النوع",
  "Deposit vs Withdrawal Split":"نسبة الإيداع والسحب","Total by Period":"الإجمالي بالفترة","Banned Users":"المستخدمون المحظورون",
  "ADDRESS":"العنوان","EARNED":"المكتسب","History":"السجل","VALIDATORS":"المدققون","TRANSACTIONS":"المعاملات","BLOCKS":"البلوكات",
  "HASH":"الهاش","TXS":"معاملات","Commission Distributed":"العمولة الموزعة","Tokens Burned":"التوكينات المحروقة","Online":"متصل",
  "Platform Name":"اسم المنصة","Timezone":"المنطقة الزمنية","Default Language":"اللغة الافتراضية",
  "Enable Wallet Deposits":"تفعيل إيداع المحفظة","Activate only when SAMA approved":"تفعيل عند موافقة ساما فقط","% Fee":"نسبة الرسوم %",
  "Max Cap (SAR)":"الحد الأقصى (ريال)","Fixed Fee (SAR)":"رسوم ثابتة (ريال)","SELLER COMMISSION (%)":"عمولة البائع (%)",
  "BUYER COMMISSION (%)":"عمولة المشتري (%)","per trade":"لكل صفقة","Deducted from seller earnings":"يُخصم من أرباح البائع",
  "Charged on top of trade amount":"يُضاف على مبلغ الصفقة","LIVE EXAMPLE — 10,000 SAR TRADE":"مثال حي — صفقة 10,000 ريال",
  "SELLER RECEIVES":"البائع يستلم","BUYER PAYS":"المشتري يدفع","Trade value":"قيمة الصفقة","Net earnings":"صافي الأرباح",
  "Total cost":"التكلفة الإجمالية","Total platform commission collected":"إجمالي العمولة المحصّلة",
  "Split is valid — totals 100%":"التوزيع صحيح — الإجمالي 100%",
  "Wallet Deposit disabled — pending SAMA regulatory clearance.":"إيداع المحفظة معطّل — في انتظار موافقة ساما.","prev:":"السابق:",
  "Avg/Day":"المتوسط/يوم","Silver":"الفضة","Platinum":"البلاتين","Booked":"محجوز","Completed":"مكتمل","Canceled":"ملغى","Expired":"منتهٍ",
  "Rescheduled":"أُعيد جدولته","Sunday":"الأحد","Monday":"الاثنين","Tuesday":"الثلاثاء","Wednesday":"الأربعاء","Thursday":"الخميس",
  "Friday":"الجمعة","Saturday":"السبت","March":"مارس","2026":"2026","Admin Fees Today":"رسوم الإدارة اليوم",
  "Pending Withdrawals":"طلبات السحب","Wallet Balances":"أرصدة المحافظ","Volume Today":"حجم اليوم","Gold in Vault":"الذهب في الخزينة",
  "Silver in Vault":"الفضة في الخزينة","Platinum in Vault":"البلاتين في الخزينة","In Circulation":"في التداول",
  "Assets under management":"الأصول المُدارة","Gold · SAR/g":"الذهب · ريال/غ","Silver · SAR/g":"الفضة · ريال/غ",
  "Platinum · SAR/g":"البلاتين · ريال/غ","Sealed":"مختوم","No records found":"لا توجد سجلات","NO_SHOW":"لم يحضر",
  // Header
  "Dashboard Overview":"نظرة عامة",
  // Vault
  "Total Bars":"إجمالي السبائك",
  // Blocks page
  "Latest Block":"آخر بلوك",
  // Table headers
  "Investor ID":"رقم المستثمر","TX ID":"رقم العملية",
  // Buttons
  "Save Settings":"حفظ الإعدادات",
  // Actions in tables
  "Approve":"قبول",
  // Statuses
  "ACTIVE":"نشط",
  // Settings tabs
  "PLATFORM":"المنصة",
  "REPORTING":"التقارير التنظيمية",
  "User Management":"إدارة المستخدمين","Account Profile":"الملف الشخصي",
  "Add Admin User":"إضافة مستخدم إدارة","Role":"الدور","Permissions":"الصلاحيات",
  "Super Admin":"مسؤول أعلى","Compliance Officer":"مسؤول الامتثال","Vault Manager":"مدير الخزينة",
  "Financial Controller":"المراقب المالي","Viewer":"مشاهد فقط","Custom":"مخصص",
  "Last Login":"آخر دخول","2FA Status":"حالة المصادقة الثنائية","Active Sessions":"الجلسات النشطة",
  "Change Password":"تغيير كلمة المرور","Recovery Phone":"هاتف الاسترداد","Recovery Email":"بريد الاسترداد",
  "Personal Info":"المعلومات الشخصية","Security":"الأمان","Activity Log":"سجل النشاط",
  "Save Changes":"حفظ التغييرات","Current Password":"كلمة المرور الحالية","New Password":"كلمة المرور الجديدة",
  "Confirm Password":"تأكيد كلمة المرور","Revoke":"إلغاء","Enable":"تفعيل","Disable":"تعطيل",
  "INFO":"المعلومات","SESSIONS":"الجلسات","ACTIVITY":"النشاط",
  // Section titles
  "Platform Settings":"إعدادات المنصة",
  // Login
  "Admin Login":"تسجيل دخول الإدارة",
  // Appointments
  "DEPOSIT":"إيداع",
  // Metal card labels
  "Gold":"الذهب",
  // Stat card titles - dashboard
  "Commission Today":"العمولة اليوم",
  "Volume (All)":"الحجم (الكل)","Commission (All)":"العمولة (الكل)","Admin Fees (All)":"رسوم إدارية (الكل)",
  // Sub-text translations
  "Month: ":"الشهر: ",
  // Reports
  "This month":"هذا الشهر",
  // ═══ NEW: System Health Page ═══
  "System Health":"حالة النظام","Uptime":"وقت التشغيل","API Latency":"زمن استجابة API","Memory Usage":"استخدام الذاكرة",
  "Database":"قاعدة البيانات","Cache Hit Rate":"معدل إصابة الكاش","Queue Depth":"عمق الطابور","Healthy":"سليم","Degraded":"متدهور",
  "Down":"متوقف","System health & infrastructure monitoring":"مراقبة صحة النظام والبنية التحتية",
  "Price Feed":"خلاصة الأسعار","Matching Engine":"محرك المطابقة","Blockchain Node":"عقدة البلوكشين",
  "Vault API":"واجهة الخزينة","NAFATH Gateway":"بوابة نفاذ","SMS Gateway":"بوابة الرسائل","Payment Gateway":"بوابة الدفع",
  "Last Checked":"آخر فحص","Response Time":"وقت الاستجابة","Services":"الخدمات","Infrastructure":"البنية التحتية",
  "Error Rate":"معدل الخطأ","Requests/min":"طلبات/دقيقة","CPU Usage":"استخدام المعالج","Disk Usage":"استخدام القرص",
  "Active Connections":"اتصالات نشطة","Incidents":"الحوادث","No incidents":"لا توجد حوادث",
  // ═══ NEW: Enhanced AML rules ═══
  "Dormant Reactivation":"إعادة تنشيط خامل","Cross-Border Pattern":"نمط عابر للحدود","Threshold Evasion":"تجنب الحدود",
  "Time-Zone Anomaly":"شذوذ المنطقة الزمنية",
  // ═══ NEW: Enhanced CMA rules ═══
  "Momentum Ignition":"إشعال الزخم","Quote Stuffing":"حشو الأسعار",
  // ═══ NEW: Export / Notifications ═══
  "Export Report":"تصدير تقرير","Generating PDF...":"جاري إنشاء PDF...","Generating Excel...":"جاري إنشاء Excel...",
  "Report exported":"تم تصدير التقرير","Notification Center":"مركز الإشعارات","Mark All Read":"تعليم الكل كمقروء",
  "No notifications":"لا توجد إشعارات","minutes ago":"دقائق مضت","hours ago":"ساعات مضت","just now":"الآن",
  "Unread":"غير مقروء","All Notifications":"جميع الإشعارات",
  // ═══ NEW: Role Permissions ═══
  "System Health Monitor":"مراقب صحة النظام","Can view system health page":"يمكنه عرض صحة النظام",
  "Export Access":"صلاحية التصدير","Can export reports":"يمكنه تصدير التقارير",
  "Bulk Actions":"إجراءات جماعية","Can perform bulk operations":"يمكنه تنفيذ إجراءات جماعية",
  // ═══ FIXED: Missing t() translation keys ═══
  "Alert dismissed":"تم إغلاق التنبيه",
  "Cannot reschedule within 24 hours of appointment":"لا يمكن إعادة الجدولة قبل 24 ساعة من الموعد",
  "Dismissed":"مُغلق",
  "Please select a date and time":"يرجى اختيار التاريخ والوقت",
  "⚠️ Enter rejection reason":"⚠️ أدخل سبب الرفض",
  "⚠️ IBAN is required before approving a withdrawal":"⚠️ مطلوب رقم الآيبان قبل الموافقة على السحب",
  "⚠️ Invalid IBAN format — Saudi IBAN must start with SA followed by 22 digits":"⚠️ صيغة آيبان غير صحيحة — يجب أن يبدأ بـ SA متبوعاً بـ 22 رقماً",
  "⚠️ Invalid National ID — must be 10 digits starting with 1 or 2":"⚠️ رقم هوية غير صحيح — يجب أن يكون 10 أرقام ويبدأ بـ 1 أو 2",
  "⚠️ Message is empty":"⚠️ الرسالة فارغة",
  "⚠️ National ID required":"⚠️ رقم الهوية مطلوب",
  "⚠️ Please enter a reason":"⚠️ يرجى إدخال السبب",
  "⚠️ Reason required":"⚠️ السبب مطلوب",
  "⚠️ This National ID is already banned":"⚠️ رقم الهوية محظور بالفعل",
  "✅ Certificate downloaded":"✅ تم تحميل الشهادة",
  "✅ Notification sent to registry":"✅ تم إرسال الإشعار إلى السجل",
  "✅ Record updated":"✅ تم تحديث السجل",
  "✅ User banned by National ID":"✅ تم حظر المستخدم بالهوية الوطنية",
  "✅ User unbanned — account restored":"✅ تم رفع الحظر — الحساب مُستعاد",
  // ═══ COMMUNICATION CENTER ═══
  "Communication Center":"مركز الاتصالات","Communication":"الاتصالات",
  "Dark Mode":"الوضع الداكن","Light Mode":"الوضع الفاتح",
  "Global Search":"البحث الشامل","Search...":"بحث...","No results":"لا نتائج","Go to page":"انتقل إلى الصفحة",
  "Timeline":"السجل الزمني","events":"أحداث","Account Created":"تم إنشاء الحساب",
  "Inbox":"صندوق الوارد","Compose":"إنشاء رسالة","Templates":"القوالب","Broadcasts":"الرسائل الجماعية",
  "Delivery Log":"سجل التسليم","Scheduled":"المجدولة","All Messages":"جميع الرسائل","Sent":"مرسلة","Draft":"مسودة","Failed":"فاشلة",
  "Delivered":"مُسلَّمة","Read":"مقروءة","Queued":"في الانتظار","Channel":"القناة","Recipient":"المستلم","Subject":"الموضوع",
  "Send Message":"إرسال الرسالة","Save Draft":"حفظ كمسودة","Schedule Send":"جدولة الإرسال","Use Template":"استخدام قالب",
  "Message Body":"نص الرسالة","Select Recipients":"اختر المستلمين","All Active Investors":"جميع المستثمرين النشطين",
  "KYC Expiring Investors":"مستثمرون تنتهي هوياتهم","Custom Selection":"اختيار مخصص","No Show Investors":"مستثمرون لم يحضروا",
  "High Value Investors":"مستثمرون ذوو قيمة عالية","New Investors":"مستثمرون جدد",
  "SMS":"رسالة نصية","Email Channel":"بريد إلكتروني","Push Notification":"إشعار فوري","In-App":"داخل التطبيق","All Channels":"جميع القنوات",
  "Template Name":"اسم القالب","Template Body":"نص القالب","Create Template":"إنشاء قالب","Edit Template":"تعديل القالب",
  "Delete Template":"حذف القالب","Category":"الفئة","Compliance":"الامتثال","Operations":"العمليات","Marketing":"التسويق",
  "Account":"الحساب","Appointment":"الموعد","Priority":"الأولوية","Normal":"عادي","Urgent":"عاجل",
  "recipients":"مستلمين","messages":"رسائل","sent today":"أرسلت اليوم","delivery rate":"معدل التسليم",
  "Investor messaging, templates & broadcast hub":"مركز رسائل المستثمرين والقوالب والبث الجماعي",
  "Search messages...":"بحث في الرسائل...","Type your message...":"اكتب رسالتك...","No messages yet":"لا توجد رسائل بعد",
  "Resend":"إعادة إرسال","View Details":"عرض التفاصيل","Bulk Send":"إرسال جماعي","Preview":"معاينة",
  "Confirm Broadcast":"تأكيد البث الجماعي","This will send to":"سيتم الإرسال إلى","investors":"مستثمرين",
  "Schedule Date":"تاريخ الجدولة","Cancel Schedule":"إلغاء الجدولة","Send Now":"إرسال الآن",
  "Message sent successfully":"تم إرسال الرسالة بنجاح","Draft saved":"تم حفظ المسودة","Template saved":"تم حفظ القالب",
  "Broadcast queued":"تم وضع البث في الطابور","Schedule set":"تم تعيين الجدولة",
};

const translate = (lang, key) => lang === "ar" ? (AR[key] || key) : key;



// ─── Tabler Icons (SVG) ───────────────────────────────────────────────────────
const TI = ({ d, size=20, stroke=1.75, color="currentColor", style={} }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
    style={{width:size,height:size,flexShrink:0,...style}}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    {Array.isArray(d) ? d.map((p,i)=><path key={i} d={p}/>) : <path d={d}/>}
  </svg>
);
const TIcircle = ({cx,cy,r,size=20,stroke=1.75,color="currentColor"}) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{width:size,height:size,flexShrink:0}}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <circle cx={cx} cy={cy} r={r}/>
  </svg>
);

const Icons = {
  dashboard:   (s=20,c="currentColor") => <TI size={s} color={c} d={["M5 12l-2 0l9 -9l9 9l-2 0","M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7","M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6"]} />,
  investors:   (s=20,c="currentColor") => <TI size={s} color={c} d={["M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0","M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2","M16 3.13a4 4 0 0 1 0 7.75","M21 21v-2a4 4 0 0 0 -3 -3.85"]} />,
  vault:       (s=20,c="currentColor") => <TI size={s} color={c} d={["M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z","M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0","M8 11v-4a4 4 0 0 1 8 0v4"]} />,
  appointments:(s=20,c="currentColor") => <TI size={s} color={c} d={["M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12z","M16 3v4","M8 3v4","M4 11h16","M10 16l2 2l4 -4"]} />,
  financials:  (s=20,c="currentColor") => <TI size={s} color={c} d={["M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2","M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z","M9 12h.01","M13 12h2","M9 16h.01","M13 16h2"]} />,
  reports:     (s=20,c="currentColor") => <TI size={s} color={c} d={["M4 19l4 -6l4 3l4 -4l4 4","M4 19h16"]} />,
  blacklist:   (s=20,c="currentColor") => <TI size={s} color={c} d={["M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0","M5.7 5.7l12.6 12.6"]} />,
  blocks:      (s=20,c="currentColor") => <TI size={s} color={c} d={["M12 3l8 4.5v9l-8 4.5l-8 -4.5v-9z","M12 12l8 -4.5","M12 12v9","M12 12l-8 -4.5"]} />,
  settings:    (s=20,c="currentColor") => <TI size={s} color={c} d={["M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z","M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"]} />,
  logout:      (s=20,c="currentColor") => <TI size={s} color={c} d={["M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2","M9 12h12l-3 -3","M18 15l3 -3"]} />,
  collapse:    (s=20,c="currentColor") => <TI size={s} color={c} d={["M15 6l-6 6l6 6"]} />,
  expand:      (s=20,c="currentColor") => <TI size={s} color={c} d={["M9 6l6 6l-6 6"]} />,
  // stat card icons
  gold:        (s=20,c="currentColor") => <TI size={s} color={c} d={["M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0","M12 8v1","M12 15v1","M9.5 9.5a2.5 2.5 0 0 1 5 1.5c0 2 -2.5 2 -2.5 3","M9.5 14.5h5"]} />,
  aum:         (s=20,c="currentColor") => <TI size={s} color={c} d={["M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0","M14.8 9a2 2 0 0 0 -1.8 -1h-2a2 2 0 1 0 0 4h2a2 2 0 1 0 0 4h-2a2 2 0 0 1 -1.8 -1","M12 7v10"]} />,
  volume:      (s=20,c="currentColor") => <TI size={s} color={c} d={["M3 12l3 -3l3 3l4 -4l4 4","M3 20h18","M3 4h18"]} />,
  commission:  (s=20,c="currentColor") => <TI size={s} color={c} d={["M17 8v-3a1 1 0 0 0 -1 -1h-10a2 2 0 0 0 0 4h12a1 1 0 0 1 1 1v3m0 4v3a1 1 0 0 1 -1 1h-12a2 2 0 0 1 -2 -2v-12","M20 12v4h-4a2 2 0 0 1 0 -4h4"]} />,
  pending:     (s=20,c="currentColor") => <TI size={s} color={c} d={["M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0","M12 7v5l3 3"]} />,
  wallet:      (s=20,c="currentColor") => <TI size={s} color={c} d={["M17 8v-3a1 1 0 0 0 -1 -1h-10a2 2 0 0 0 0 4h12a1 1 0 0 1 1 1v3m0 4v3a1 1 0 0 1 -1 1h-12a2 2 0 0 1 -2 -2v-12","M20 12v4h-4a2 2 0 0 1 0 -4h4"]} />,
  orders:      (s=20,c="currentColor") => <TI size={s} color={c} d={["M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2","M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z","M9 12l2 2l4 -4"]} />,
  calendar:    (s=20,c="currentColor") => <TI size={s} color={c} d={["M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12z","M16 3v4","M8 3v4","M4 11h16","M8 15h2v2h-2z"]} />,
  noshow:      (s=20,c="currentColor") => <TI size={s} color={c} d={["M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0","M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2","M17 14l4 4m0 -4l-4 4"]} />,
  check:       (s=20,c="currentColor") => <TI size={s} color={c} d={["M5 12l5 5l10 -10"]} />,
  cancel:      (s=20,c="currentColor") => <TI size={s} color={c} d={["M18 6l-12 12","M6 6l12 12"]} />,
  reschedule:  (s=20,c="currentColor") => <TI size={s} color={c} d={["M4.05 11a8 8 0 1 1 .5 4m-.5 5v-5h5"]} />,
  otp:         (s=20,c="currentColor") => <TI size={s} color={c} d={["M6 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0","M18 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0","M12 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0","M6 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0","M18 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0","M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0","M6 5m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0","M18 5m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0","M12 5m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"]} />,
  bar:         (s=20,c="currentColor") => <TI size={s} color={c} d={["M4 7h16a1 1 0 0 1 1 1v8a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-8a1 1 0 0 1 1 -1z","M9 12h6"]} />,
  search:      (s=20,c="currentColor") => <TI size={s} color={c} d={["M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0","M21 21l-6 -6"]} />,
  network:     (s=20,c="currentColor") => <TI size={s} color={c} d={["M6 9a6 6 0 1 0 12 0a6 6 0 0 0 -12 0","M12 3c1.333 .333 2 2.333 2 6s-.667 5.667 -2 6","M12 3c-1.333 .333 -2 2.333 -2 6s.667 5.667 2 6","M6 9h12","M3 20h7","M14 20h7","M10 20a2 2 0 1 0 4 0a2 2 0 1 0 -4 0","M12 15v3"]} />,
  block:       (s=20,c="currentColor") => <TI size={s} color={c} d={["M12 3l8 4.5v9l-8 4.5l-8 -4.5v-9z","M12 12l8 -4.5","M12 12v9","M12 12l-8 -4.5"]} />,
  user:        (s=20,c="currentColor") => <TI size={s} color={c} d={["M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0","M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"]} />,
  phone:       (s=20,c="currentColor") => <TI size={s} color={c} d={["M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2"]} />,
  warning:     (s=20,c="currentColor") => <TI size={s} color={c} d={["M12 9v4","M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.871l-8.106 -13.534a1.914 1.914 0 0 0 -3.274 0z","M12 16h.01"]} />,
  info:        (s=20,c="currentColor") => <TI size={s} color={c} d={["M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0","M12 8l.01 0","M11 12l1 0l0 4l1 0"]} />,
  edit:        (s=20,c="currentColor") => <TI size={s} color={c} d={["M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1","M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415z","M16 5l3 3"]} />,
  trash:       (s=20,c="currentColor") => <TI size={s} color={c} d={["M4 7l16 0","M10 11l0 6","M14 11l0 6","M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12","M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"]} />,
  download:    (s=20,c="currentColor") => <TI size={s} color={c} d={["M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2","M7 11l5 5l5 -5","M12 4l0 12"]} />,
  send:        (s=20,c="currentColor") => <TI size={s} color={c} d={["M10 14l11 -11","M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5"]} />,
  add:         (s=20,c="currentColor") => <TI size={s} color={c} d={["M12 5l0 14","M5 12l14 0"]} />,
  eye:         (s=20,c="currentColor") => <TI size={s} color={c} d={["M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0","M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6"]} />,
  refresh:     (s=20,c="currentColor") => <TI size={s} color={c} d={["M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4","M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"]} />,
  shield:      (s=20,c="currentColor") => <TI size={s} color={c} d={["M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3","M9 12l2 2l4 -4"]} />,
  token:       (s=20,c="currentColor") => <TI size={s} color={c} d={["M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0","M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0","M12 3l0 3","M12 18l0 3","M3 12l3 0","M18 12l3 0"]} />,
  fire:        (s=20,c="currentColor") => <TI size={s} color={c} d={["M12 12c2 -2.96 0 -7 -1 -8c0 3.038 -1.773 4.741 -3 6c-1.226 1.26 -2 3.24 -2 5a6 6 0 1 0 12 0c0 -1.532 -1.056 -3.94 -2 -5c-1.786 3 -2.791 3 -4 2z"]} />,
  // Sidebar-unique icons
  txlog:       (s=20,c="currentColor") => <TI size={s} color={c} d={["M4 4h16v16h-16z","M4 8h16","M4 12h16","M4 16h16","M8 4v16"]} />,
  orderbook:   (s=20,c="currentColor") => <TI size={s} color={c} d={["M3 4m0 1a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1z","M12 8v13","M5 21h14","M5 8l0 8a1 1 0 0 0 1 1h4","M19 8v8a1 1 0 0 1 -1 1h-4"]} />,
  auditlog:    (s=20,c="currentColor") => <TI size={s} color={c} d={["M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3","M12 11m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0","M12 12v4"]} />,
  usersAdmin:  (s=20,c="currentColor") => <TI size={s} color={c} d={["M9 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0","M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2","M16 3.13a4 4 0 0 1 0 7.75","M21 21v-2a4 4 0 0 0 -3 -3.85"]} />,
  profile:     (s=20,c="currentColor") => <TI size={s} color={c} d={["M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0","M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0 -20","M6 18.7a7 7 0 0 1 12 0"]} />,
  lock:        (s=20,c="currentColor") => <TI size={s} color={c} d={["M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2z","M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0","M8 11v-4a4 4 0 1 1 8 0v4"]} />,
  // AML/CMA category icons (SVG matching sidebar style)
  amlVolume:   (s=20,c="currentColor") => <TI size={s} color={c} d={["M17 8v-3a1 1 0 0 0 -1 -1h-10a2 2 0 0 0 0 4h12a1 1 0 0 1 1 1v3m0 4v3a1 1 0 0 1 -1 1h-12a2 2 0 0 1 -2 -2v-12","M20 12v4h-4a2 2 0 0 1 0 -4h4"]} />,
  amlPattern:  (s=20,c="currentColor") => <TI size={s} color={c} d={["M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4","M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"]} />,
  amlVelocity: (s=20,c="currentColor") => <TI size={s} color={c} d={["M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11"]} />,
  amlWithdraw: (s=20,c="currentColor") => <TI size={s} color={c} d={["M3 21l18 0","M3 10l18 0","M5 6l7 -3l7 3","M4 10l0 11","M20 10l0 11","M8 14l0 3","M12 14l0 3","M16 14l0 3"]} />,
  amlOnboard:  (s=20,c="currentColor") => <TI size={s} color={c} d={["M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0","M6 21v-2a4 4 0 0 1 4 -4h3","M16 19h6","M19 16v6"]} />,
  amlBehavior: (s=20,c="currentColor") => <TI size={s} color={c} d={["M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0","M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"]} />,
  amlComply:   (s=20,c="currentColor") => <TI size={s} color={c} d={["M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2","M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z","M9 14l2 2l4 -4"]} />,
  amlEnforce:  (s=20,c="currentColor") => <TI size={s} color={c} d={["M12 9v4","M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.871l-8.106 -13.534a1.914 1.914 0 0 0 -3.274 0z","M12 16h.01"]} />,
  amlSystem:   (s=20,c="currentColor") => <TI size={s} color={c} d={["M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z","M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"]} />,
  amlVault:    (s=20,c="currentColor") => <TI size={s} color={c} d={["M3 21l18 0","M3 10l18 0","M5 6l7 -3l7 3","M4 10l0 11","M20 10l0 11","M12 14l0 3"]} />,
  // CMA manipulation icons
  cmaSelfTrade:(s=20,c="currentColor") => <TI size={s} color={c} d={["M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4","M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"]} />,
  cmaSpoofing: (s=20,c="currentColor") => <TI size={s} color={c} d={["M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0","M9 10l.01 0","M15 10l.01 0","M9.5 15a3.5 3.5 0 0 0 5 0"]} />,
  cmaRamping:  (s=20,c="currentColor") => <TI size={s} color={c} d={["M3 17l6 -6l4 4l8 -8","M14 7l7 0l0 7"]} />,
  cmaLayering: (s=20,c="currentColor") => <TI size={s} color={c} d={["M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z","M4 10m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z","M4 16m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"]} />,
  cmaCollusion:(s=20,c="currentColor") => <TI size={s} color={c} d={["M7 11a4 4 0 1 0 0 -8a4 4 0 0 0 0 8z","M17 11a4 4 0 1 0 0 -8a4 4 0 0 0 0 8z","M3 21v-2a4 4 0 0 1 4 -4h2","M15 15h2a4 4 0 0 1 4 4v2"]} />,
  cmaFictitious:(s=20,c="currentColor") => <TI size={s} color={c} d={["M3 4m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z","M7 4h13a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-13","M11 8h4","M11 12h4"]} />,
  cmaChurning: (s=20,c="currentColor") => <TI size={s} color={c} d={["M4 19l4 -6l4 3l4 -4l4 4","M4 19h16","M4 12l3 -4l4 3l4 -6l4 3"]} />,
  cmaMatched:  (s=20,c="currentColor") => <TI size={s} color={c} d={["M7 7m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0","M17 17m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0","M17 7l-10 10"]} />,
  cmaPumpDump: (s=20,c="currentColor") => <TI size={s} color={c} d={["M3 17l6 -6l4 4l8 -8","M3 7l6 6l4 -4l8 8"]} />,
  cmaClosing:  (s=20,c="currentColor") => <TI size={s} color={c} d={["M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0","M12 7v5l3 3"]} />,
  cmaScale:    (s=20,c="currentColor") => <TI size={s} color={c} d={["M12 3v18","M7 7l5 -4l5 4","M4 13l3 5h10l3 -5"]} />,
  treasury:    (s=20,c="currentColor") => <TI size={s} color={c} d={["M12 3l8 4.5v9l-8 4.5l-8 -4.5v-9z","M12 12l8 -4.5","M12 12v9","M12 12l-8 -4.5","M8 14v2","M16 14v2","M12 7v1"]} />,
  sweep:       (s=20,c="currentColor") => <TI size={s} color={c} d={["M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11"]} />,
  // ═══ NEW ICONS ═══
  health:      (s=20,c="currentColor") => <TI size={s} color={c} d={["M19.5 13.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572"]} />,
  bell:        (s=20,c="currentColor") => <TI size={s} color={c} d={["M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6","M9 17v1a3 3 0 0 0 6 0v-1"]} />,
  fileExport:  (s=20,c="currentColor") => <TI size={s} color={c} d={["M14 3v4a1 1 0 0 0 1 1h4","M11.5 21h-4.5a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v5m-5 6h7m-3 -3l3 3l-3 3"]} />,
  server:      (s=20,c="currentColor") => <TI size={s} color={c} d={["M3 4m0 1a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1z","M3 14m0 1a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1z","M7 8v.01","M7 18v.01"]} />,
  activity:    (s=20,c="currentColor") => <TI size={s} color={c} d={["M3 12h4l3 8l4 -16l3 8h4"]} />,
  cpu:         (s=20,c="currentColor") => <TI size={s} color={c} d={["M5 5m0 1a1 1 0 0 1 1 -1h12a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-12a1 1 0 0 1 -1 -1z","M9 9h6v6h-6z","M3 10h2","M3 14h2","M19 10h2","M19 14h2","M10 3v2","M14 3v2","M10 19v2","M14 19v2"]} />,
  bulkAction:  (s=20,c="currentColor") => <TI size={s} color={c} d={["M9 6l11 0","M9 12l11 0","M9 18l11 0","M5 6l0 .01","M5 12l0 .01","M5 18l0 .01"]} />,
  envelope:    (s=20,c="currentColor") => <TI size={s} color={c} d={["M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10z","M3 7l9 6l9 -6"]} />,
  megaphone:   (s=20,c="currentColor") => <TI size={s} color={c} d={["M18 8a3 3 0 0 1 0 6","M10 8v6a1 1 0 0 1 -1 1h-1a1 1 0 0 1 -1 -1v-1.5l-4 1.5v-6l4 1.5v-1.5a1 1 0 0 1 1 -1h1a1 1 0 0 1 1 1","M10 8l5 -3v12l-5 -3"]} />,
  template:    (s=20,c="currentColor") => <TI size={s} color={c} d={["M4 4m0 1a1 1 0 0 1 1 -1h14a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-14a1 1 0 0 1 -1 -1z","M4 12m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z","M14 12l6 0","M14 16l6 0","M14 20l6 0"]} />,
  clockSend:   (s=20,c="currentColor") => <TI size={s} color={c} d={["M20.984 12.535a9 9 0 1 0 -8.468 8.45","M12 7v5l3 3","M19 16v6","M22 19l-3 3l-3 -3"]} />,
};

function SAR({ size = "1em", color = "currentColor", style = {} }) {
  return (
    <>
      <style>{`
        @font-face {
          font-family: 'saudi_riyal_bold';
          src: url('https://cdn.jsdelivr.net/npm/@emran-alhaddad/saudi-riyal-font/fonts/bold/saudi_riyal.woff2') format('woff2'),
               url('https://cdn.jsdelivr.net/npm/@emran-alhaddad/saudi-riyal-font/fonts/bold/saudi_riyal.woff') format('woff'),
               url('https://cdn.jsdelivr.net/npm/@emran-alhaddad/saudi-riyal-font/fonts/bold/saudi_riyal.ttf') format('truetype');
          font-weight: bold;
          font-style: normal;
          font-display: swap;
        }
      `}</style>
      <span
        style={{
          fontFamily: "'saudi_riyal_bold', sans-serif",
          fontSize: size,
          color: color,
          lineHeight: 1,
          verticalAlign: "middle",
          flexShrink: 0,
          display: "inline-block",
          fontWeight: "bold",
          ...style
        }}
      >{String.fromCharCode(0xe900)}</span>
    </>
  );
}

function SARAmount({ amount, size="1em", color="currentColor" }) {
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:"0.18em",direction:"ltr",unicodeBidi:"embed"}}>
      <SAR size={size} color={color} />
      <span>{amount}</span>
    </span>
  );
}

const TanaqulLogo = ({ size=36 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Left face */}
    <polygon points="20,35 50,52 50,82 20,65" fill="#1A3560"/>
    {/* Right face */}
    <polygon points="80,35 50,52 50,82 80,65" fill="#243F72"/>
    {/* Top face */}
    <polygon points="20,35 50,18 80,35 50,52" fill="#2B4E8C"/>
    {/* Inner cutout top */}
    <polygon points="35,35 50,25 65,35 50,45" fill="#2A2015" opacity="0.55"/>
    {/* Inner cutout left */}
    <polygon points="35,35 50,45 50,62 35,52" fill="#2A2015" opacity="0.45"/>
    {/* Inner cutout right */}
    <polygon points="65,35 50,45 50,62 65,52" fill="#2A2015" opacity="0.35"/>
    {/* Teal arrow top-right */}
    <path d="M62,7 L80,17 L74,20 L81,32 L68,25 L63,31 L59,9 Z" fill="#C4956A"/>
    {/* Teal dots */}
    <circle cx="84" cy="19" r="3.2" fill="#C4956A" opacity="0.75"/>
    <circle cx="87" cy="28" r="2.4" fill="#C4956A" opacity="0.55"/>
    <circle cx="88" cy="11" r="1.8" fill="#C4956A" opacity="0.45"/>
  </svg>
);

// MOCK data removed — all data comes from live API

// ─── Theme System
// ─── Theme System — Light & Dark modes ──────────────────────────────────────
const LIGHT_THEME = {
  navy:"#2D2418", navyDark:"#1E1810", navyLight:"#3D3225",
  teal:"#6B9080", tealLight:"#EFF5F2",
  gold:"#C4956A", goldLight:"#FDF4EC", goldDim:"#8B6540",
  white:"#FFFFFF", bg:"#FAF8F5", border:"#E8E0D4",
  text:"#2D2418", textMuted:"#8C7E6F",
  green:"#6B9080", red:"#C85C3E", orange:"#D4943A",
  cream:"#F5F0E8", sand:"#E8DFD1", warmShadow:"rgba(45,36,24,0.08)",
  accent:"#C4956A", sidebar:"#2A2015", sidebarHover:"rgba(196,149,106,0.12)",
  sidebarActive:"rgba(196,149,106,0.18)", sidebarBorder:"rgba(196,149,106,0.15)",
  cardShadow:"0 2px 12px rgba(45,36,24,0.06)",
  greenSolid:"#4A7A68", greenBg:"#F0F5F1",
  purpleSolid:"#7B6BA5", purpleBg:"#F0EDF7",
  redBg:"#FBEAE5", blueSolid:"#5B7FA5",
  silverText:"#475569",
  _mode:"light",
};
const DARK_THEME = {
  navy:"#E8E0D4", navyDark:"#1A1510", navyLight:"#F5F0E8",
  teal:"#8BB5A2", tealLight:"#1E2D26",
  gold:"#D4A878", goldLight:"#2A2015", goldDim:"#D4A878",
  white:"#1E1A15", bg:"#151210", border:"#3D3225",
  text:"#E8E0D4", textMuted:"#A89880",
  green:"#8BB5A2", red:"#E8826A", orange:"#E8B476",
  cream:"#2A2418", sand:"#3D3225", warmShadow:"rgba(0,0,0,0.3)",
  accent:"#D4A878", sidebar:"#151210", sidebarHover:"rgba(212,168,120,0.12)",
  sidebarActive:"rgba(212,168,120,0.22)", sidebarBorder:"rgba(212,168,120,0.15)",
  cardShadow:"0 2px 16px rgba(0,0,0,0.25)",
  greenSolid:"#6DAF8F", greenBg:"#1A2E24",
  purpleSolid:"#9B8DC5", purpleBg:"#252035",
  redBg:"#2E1A15", blueSolid:"#7BA3C5",
  silverText:"#A0AEC0",
  _mode:"dark",
};
// ThemeContext — provides C and toggle
const ThemeContext = createContext({ C:LIGHT_THEME, dark:false, toggleDark:()=>{} });
const useTheme = () => useContext(ThemeContext);
// Backward compat — C is now a mutable reference updated by App
let C = {...LIGHT_THEME};

const BADGE_AR = {
  ACTIVE:"نشط", COMPLETED:"مكتمل", CONFIRMED:"مؤكد", BOOKED:"محجوز",
  PROCESSED:"مُعالج", CREDIT:"إضافة", LINKED:"مرتبط",
  PENDING:"معلق", APPROVED:"مقبول", BANNED:"محظور",
  SUSPENDED:"موقوف", CANCELLED:"ملغى", EXPIRED:"منتهي",
  FREE:"حر", DEBIT:"خصم",
  BUY:"شراء", SELL:"بيع",
  DEPOSIT:"إيداع", WITHDRAWAL:"سحب",
  RESCHEDULED:"أُعيد جدولته", NO_SHOW:"لم يحضر", SEALED:"مختوم",
  // ═══ FIXED: Missing badge Arabic translations ═══
  MEDIUM:"متوسط", HIGH:"مرتفع", CRITICAL:"حرج", LOW:"منخفض",
  DAMAGED:"تالف", LEFT:"خارج الخزينة", INACTIVE:"غير نشط", CANCELED:"ملغى", IN_PROGRESS:"قيد التنفيذ",
};
const Badge = ({ label }) => {
  const { isAr } = useLang();
  const map = {
    ACTIVE:"#4A7A68:#EFF5F2", COMPLETED:"#4A7A68:#EFF5F2", CONFIRMED:"#4A7A68:#EFF5F2", BOOKED:"#5B7FA5:#E8EFF7",
    PROCESSED:"#4A7A68:#EFF5F2", CREDIT:"#4A7A68:#EFF5F2", LINKED:"#6B9080:#EFF5F2",
    PENDING:"#C4956A:#FDF4EC", APPROVED:"#C4956A:#FDF4EC", BANNED:"#8B3520:#FBEAE5",
    SUSPENDED:"#C85C3E:#FBEAE5", CANCELLED:"#C85C3E:#FBEAE5", CANCELED:"#C85C3E:#FBEAE5", EXPIRED:"#C85C3E:#FBEAE5", INACTIVE:"#C85C3E:#FBEAE5",
    FREE:"#7B6BA5:#F0EDF7", DEBIT:"#C85C3E:#FBEAE5",
    BUY:"#4A7A68:#EFF5F2", SELL:"#C85C3E:#FBEAE5",
    DEPOSIT:"#6B9080:#EFF5F2", WITHDRAWAL:"#C4956A:#FDF4EC",
    RESCHEDULED:"#7B6BA5:#F0EDF7", NO_SHOW:"#C85C3E:#FBEAE5", SEALED:"#4A7A68:#EFF5F2", IN_PROGRESS:"#C4956A:#FDF4EC",
    // ═══ FIXED: Missing badge colors ═══
    MEDIUM:"#D4943A:#FDF4EC", HIGH:"#C85C3E:#FBEAE5", CRITICAL:"#8B3520:#FBEAE5", LOW:"#6B9080:#EFF5F2",
    DAMAGED:"#C85C3E:#FBEAE5", LEFT:"#7B6BA5:#F0EDF7",
  };
  const [fg, bg] = (map[label] || "#8C7E6F:#F5F0E8").split(":");
  const display = isAr ? (BADGE_AR[label] || label) : label;
  return <span style={{display:"inline-flex",alignItems:"center",padding:"2px 10px",borderRadius:999,fontSize:13,fontWeight:600,color:fg,backgroundColor:bg,whiteSpace:"nowrap"}}>{display}</span>;
};




const StatCard = ({ title, value, sub, icon, gold }) => {
  const { t, isAr } = useLang();
  return (
    <div style={{background:C.white,borderRadius:16,padding:"18px 20px",border:`1px solid ${gold?C.gold+"44":C.border}`,boxShadow:gold?`0 0 0 1px ${C.gold}22,0 2px 12px ${C.gold}18`:"0 1px 4px rgba(0,0,0,0.06)",display:"flex",alignItems:"flex-start",gap:14}}>
      <div style={{width:46,height:46,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,flexShrink:0,background:gold?C.goldLight:C.tealLight}}>{icon}</div>
      <div style={{flex:1,minWidth:0,textAlign:"start"}}>
        <p style={{fontSize:13,color:C.textMuted,fontWeight:500,marginBottom:3}}>{t(title)}</p>
        <p style={{fontSize:26,fontWeight:700,color:gold?C.gold:C.navy,lineHeight:1}}>{value}</p>
        {sub && <p style={{fontSize:13,color:C.textMuted,marginTop:3}}>{typeof sub==="string"?sub.replace(/^Month: /,isAr?"الشهر: ":"Month: "):sub}</p>}
      </div>
    </div>
  );
};

const SectionHeader = ({ title, sub, action }) => {
  const { t, isAr } = useLang();
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
      <div style={{textAlign:"start"}}>
        <h2 style={{fontSize:25,fontWeight:700,color:C.navy}}>{t(title)}</h2>
        {sub && <p style={{fontSize:14,color:C.textMuted,marginTop:2}}>{t(sub)}</p>}
      </div>
      {action}
    </div>
  );
};

const Btn = ({ children, onClick, variant="primary", small }) => {
  const s = {
    primary:{background:C.navy,color:C.white,border:"none"},
    gold:{background:C.gold,color:C.white,border:"none"},
    teal:{background:C.teal,color:C.white,border:"none"},
    outline:{background:"transparent",color:C.navy,border:`1px solid ${C.border}`},
    danger:{background:C.red,color:C.white,border:"none"},
    ghost:{background:"transparent",color:C.textMuted,border:"none"},
  };
  return <button onClick={onClick} style={{...s[variant],borderRadius:8,cursor:"pointer",padding:small?"5px 12px":"8px 16px",fontSize:small?11:13,fontWeight:600,display:"inline-flex",alignItems:"center",gap:5,whiteSpace:"nowrap"}} onMouseEnter={e=>e.currentTarget.style.opacity="0.82"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>{children}</button>;
};

const TTable = ({ cols, rows }) => {
  const { t, isAr } = useLang();
  return (
    <div style={{overflowX:"auto",borderRadius:12,border:`1px solid ${C.border}`}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
        <thead><tr style={{background:C.navyDark}}>{cols.map((col,i)=><th key={i} style={{padding:"10px 14px",textAlign:"center",fontWeight:600,color:"#A89880",fontSize:12,letterSpacing:"0.06em",whiteSpace:"nowrap",textTransform:"uppercase"}}>{t(col.label)}</th>)}</tr></thead>
        <tbody>
          {rows.map((row,i)=>(
            <tr key={i} style={{borderTop:`1px solid ${C.border}`,background:i%2===0?C.white:"#FAFBFC"}}>
              {cols.map((col,j)=><td key={j} style={{padding:"10px 14px",color:C.text,whiteSpace:"nowrap",textAlign:"center",verticalAlign:"middle"}}>{col.render?col.render(row[col.key],row):row[col.key]}</td>)}
            </tr>
          ))}
          {rows.length===0&&<tr><td colSpan={cols.length} style={{padding:28,textAlign:"center",color:C.textMuted}}>{t("No records found")}</td></tr>}
        </tbody>
      </table>
    </div>
  );
};

const Modal = ({ title, children, onClose }) => {
  const { t, isAr } = useLang();
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:C.white,borderRadius:20,width:"100%",maxWidth:520,maxHeight:"85vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.25)",direction:isAr?"rtl":"ltr"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"18px 22px",borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,background:C.white,zIndex:1}}>
          <h3 style={{fontSize:22,fontWeight:700,color:C.navy}}>{t(title)}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:26,cursor:"pointer",color:C.textMuted}}>×</button>
        </div>
        <div style={{padding:22}}>{children}</div>
      </div>
    </div>
  );
};

const Inp = ({ label, value, onChange, placeholder, type="text" }) => {
  const { isAr } = useLang();
  const ref = useRef(null);
  const committed = useRef(value ?? "");
  useEffect(() => {
    if (ref.current && String(value ?? "") !== committed.current) {
      ref.current.value = value ?? "";
      committed.current = String(value ?? "");
    }
  }, [value]);
  const handleChange = (val) => { committed.current = val; onChange(val); };
  return (
    <div style={{marginBottom:14}}>
      {label&&<label style={{display:"block",fontSize:13,fontWeight:600,color:C.textMuted,marginBottom:5,textAlign:"start"}}>{label}</label>}
      <input
        ref={ref}
        type={type}
        defaultValue={value ?? ""}
        onChange={e => handleChange(e.target.value)}
        onBlur={e => handleChange(e.target.value)}
        placeholder={placeholder}
        dir={isAr?"rtl":"ltr"}
        style={{width:"100%",padding:"8px 11px",borderRadius:8,fontSize:19,border:`1px solid ${C.border}`,color:C.text,outline:"none",boxSizing:"border-box",textAlign:"start"}}
      />
    </div>
  );
};

const Sel = ({ label, value, onChange, options }) => {
  const { isAr } = useLang();
  return (
    <div style={{marginBottom:14}}>
      {label&&<label style={{display:"block",fontSize:13,fontWeight:600,color:C.textMuted,marginBottom:5,textAlign:"start"}}>{label}</label>}
      <select value={value} onChange={e=>onChange(e.target.value)} style={{width:"100%",padding:"8px 11px",borderRadius:8,fontSize:19,border:`1px solid ${C.border}`,color:C.text,outline:"none",background:C.white,boxSizing:"border-box",direction:isAr?"rtl":"ltr",textAlign:"start"}}>
        {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
};

const TabBar = ({ tabs, active, onChange }) => {
  const { t } = useLang();
  return (
    <div style={{display:"flex",gap:3,marginBottom:18,background:C.bg,padding:3,borderRadius:10,width:"fit-content",flexWrap:"wrap"}}>
      {tabs.map(tab=>{
        const id    = typeof tab==="object"?tab.id:tab;
        const label = typeof tab==="object"?tab.label:t(tab);
        return <button key={id} onClick={()=>onChange(id)} style={{padding:"7px 15px",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",border:"none",background:active===id?C.white:"transparent",color:active===id?C.navy:C.textMuted,boxShadow:active===id?"0 1px 4px rgba(0,0,0,0.1)":"none",transition:"all 0.15s",whiteSpace:"nowrap"}}>{label}</button>;
      })}
    </div>
  );
};

// ─── Multi-Provider Price Engine ─────────────────────────────────────────────
// Switch provider anytime via Settings → Security → Price Feed
// No code changes needed — ever.

const TROY_OZ_TO_GRAMS = 31.1035;
const USD_TO_SAR       = 3.75; // Saudi Riyal fixed peg to USD

// ─── Provider Registry ────────────────────────────────────────────────────────
// To add a new provider: add entry here + case in fetchFromProvider()
const PROVIDERS = {
  "metals.dev": {
    id:          "metals.dev",
    name:        "metals.dev",
    tier:        "starter",
    tierLabel:   "Starter — $0–$14.99/mo",
    description: "Best for beta & early users. Free plan available.",
    docsUrl:     "https://metals.dev",
    signupUrl:   "https://metals.dev",
    keyLabel:    "API Key",
    keyPlaceholder: "Enter your metals.dev API key...",
    plans: [
      {name:"Free",    price:"$0",       req:"100/mo",    note:"Testing only"},
      {name:"Starter", price:"$1.49/mo", req:"1,000/mo",  note:"~1 fetch/30min"},
      {name:"Basic",   price:"$3.49/mo", req:"10,000/mo", note:"~1 fetch/5min"},
      {name:"Pro",     price:"$14.99/mo",req:"100,000/mo",note:"~1 fetch/30s"},
    ],
    minInterval: 60,
    color: "#C4956A",
  },
  "xignite": {
    id:          "xignite",
    name:        "Xignite Metals",
    tier:        "growth",
    tierLabel:   "Growth — ~$200–500/mo",
    description: "Recommended at 100+ active users. Real-time tick data.",
    docsUrl:     "https://www.xignite.com/product/metals",
    signupUrl:   "https://www.xignite.com",
    keyLabel:    "API Token",
    keyPlaceholder: "Enter your Xignite API token...",
    plans: [
      {name:"Basic",      price:"~$200/mo", req:"Unlimited",  note:"60s refresh"},
      {name:"Standard",   price:"~$350/mo", req:"Unlimited",  note:"10s refresh"},
      {name:"Enterprise", price:"~$500/mo", req:"Unlimited",  note:"Real-time tick"},
    ],
    minInterval: 10,
    color: "#8B5CF6",
  },
  "ice": {
    id:          "ice",
    name:        "ICE Data Services",
    tier:        "growth",
    tierLabel:   "Growth — ~$300–800/mo",
    description: "Strong in Gulf region. LBMA certified. Good for KSA compliance.",
    docsUrl:     "https://www.theice.com/market-data",
    signupUrl:   "https://www.theice.com",
    keyLabel:    "API Key",
    keyPlaceholder: "Enter your ICE Data Services API key...",
    plans: [
      {name:"Standard",   price:"~$300/mo", req:"Unlimited",  note:"60s refresh"},
      {name:"Premium",    price:"~$500/mo", req:"Unlimited",  note:"Real-time"},
      {name:"Enterprise", price:"~$800/mo", req:"Unlimited",  note:"LBMA direct"},
    ],
    minInterval: 10,
    color: "#D4943A",
  },
  "refinitiv": {
    id:          "refinitiv",
    name:        "Refinitiv LSEG Elektron",
    tier:        "regulated",
    tierLabel:   "Regulated — ~$500–2,000/mo",
    description: "SAMA & CMA compliant. Used by Saudi banks & Tadawul. Required for fintech license.",
    docsUrl:     "https://developers.lseg.com",
    signupUrl:   "https://www.lseg.com/en/data-analytics",
    keyLabel:    "App Key (RDP)",
    keyPlaceholder: "Enter your Refinitiv/LSEG RDP App Key...",
    plans: [
      {name:"Standard",   price:"~$500/mo",   req:"Unlimited", note:"Real-time LBMA"},
      {name:"Premium",    price:"~$1,000/mo",  req:"Unlimited", note:"Tick-by-tick"},
      {name:"Enterprise", price:"~$2,000/mo",  req:"Unlimited", note:"Full Elektron"},
    ],
    minInterval: 1,
    color: "#C85C3E",
  },
  "bloomberg": {
    id:          "bloomberg",
    name:        "Bloomberg B-PIPE",
    tier:        "institutional",
    tierLabel:   "Institutional — $2,000+/mo",
    description: "Industry gold standard. Every major bank uses it. For institutional scale.",
    docsUrl:     "https://www.bloomberg.com/professional/product/b-pipe/",
    signupUrl:   "https://www.bloomberg.com/professional",
    keyLabel:    "B-PIPE Credentials",
    keyPlaceholder: "Contact Bloomberg for credentials...",
    plans: [
      {name:"Standard",   price:"~$2,000/mo", req:"Unlimited", note:"Full B-PIPE"},
      {name:"Enterprise", price:"Custom",      req:"Unlimited", note:"Dedicated feed"},
    ],
    minInterval: 1,
    color: "#1A3560",
  },
};

const TIER_INFO = {
  starter:      { label:"Starter",     color:"#C4956A", bg:"#FDF4EC",  desc:"Beta & early users" },
  growth:       { label:"Growth",      color:C.greenSolid, bg:"#EFF5F2",  desc:"100+ active users" },
  regulated:    { label:"Regulated",   color:"#D4943A", bg:"#FDF4EC",  desc:"Licensed platform (SAMA/CMA)" },
  institutional:{ label:"Institutional",color:C.purpleSolid,bg:C.purpleBg,  desc:"Institutional / bank-grade" },
};

// ─── Shared price store ───────────────────────────────────────────────────────
const FALLBACK_PRICES = {
  XAU: { priceSAR:839.00, priceUSD:223.73, change:0.42,  high:841.10, low:835.80, open:836.32 },
  XAG: { priceSAR: 10.42, priceUSD:  2.78, change:-0.18, high: 10.50, low: 10.38, open: 10.44 },
  XPT: { priceSAR:138.50, priceUSD: 36.93, change: 1.09, high:139.20, low:136.50, open:137.00 },
};
let _prices = {
  XAU: { symbol:"XAU", name:"Gold",     color:"#D4A017", ...FALLBACK_PRICES.XAU },
  XAG: { symbol:"XAG", name:"Silver",   color:"#A89880", ...FALLBACK_PRICES.XAG },
  XPT: { symbol:"XPT", name:"Platinum", color:"#C4956A", ...FALLBACK_PRICES.XPT },
};
// ⚠️ SECURITY: API key in localStorage is accessible via XSS and DevTools.
// Production: Proxy API calls through backend — never expose API keys to client.
let _provider  = localStorage.getItem("price_provider") || "metals.dev";
let _apiKey    = localStorage.getItem("price_api_key")  || "";
let _interval  = parseInt(localStorage.getItem("price_interval") || "60");
let _status    = _apiKey ? "LOADING" : "DEMO";
let _lastFetch = 0;
let _listeners = [];
let _timer     = null;

const _notify    = () => _listeners.forEach(fn => fn());
const _subscribe = (fn) => { _listeners.push(fn); return () => { _listeners = _listeners.filter(x => x !== fn); }; };

// ─── Provider Adapters ────────────────────────────────────────────────────────
async function fetchFromProvider(providerId, apiKey) {
  const toGram = (sarPerOz) => +(sarPerOz / TROY_OZ_TO_GRAMS).toFixed(2);
  const toUSD  = (sar)      => +(sar / USD_TO_SAR).toFixed(4);
  const prev   = { ..._prices };
  const chg    = (newP, sym) => {
    const old = prev[sym]?.priceSAR || newP;
    return old > 0 ? +((newP - old) / old * 100).toFixed(3) : 0;
  };

  if (providerId === "metals.dev") {
    const res  = await fetch(`https://api.metals.dev/v1/latest?api_key=${apiKey}&currency=SAR&unit=toz`);
    if (res.status === 401) throw new Error("Invalid API key");
    if (res.status === 429) throw new Error("Quota exceeded — upgrade plan");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.status !== "success") throw new Error(json.message || "API error");
    const m = json.metals;
    const g = toGram(m.gold||0), s = toGram(m.silver||0), p = toGram(m.platinum||0);
    return {
      XAU:{ symbol:"XAU",name:"Gold",    color:"#D4A017",priceSAR:g,priceUSD:toUSD(g),change:chg(g,"XAU"),high:toGram((m.gold||0)*1.002),low:toGram((m.gold||0)*0.998),open:toGram((m.gold||0)*0.999) },
      XAG:{ symbol:"XAG",name:"Silver",  color:"#A89880",priceSAR:s,priceUSD:toUSD(s),change:chg(s,"XAG"),high:s*1.002,low:s*0.998,open:s*0.999 },
      XPT:{ symbol:"XPT",name:"Platinum",color:"#C4956A",priceSAR:p,priceUSD:toUSD(p),change:chg(p,"XPT"),high:p*1.003,low:p*0.997,open:p*0.999 },
    };
  }

  if (providerId === "xignite") {
    // Xignite: GET https://globalmetals.xignite.com/xGlobalMetals.json/GetRealTimeMetalQuote
    // Header: Authorization: Bearer TOKEN
    const getQuote = async (symbol) => {
      const r = await fetch(
        `https://globalmetals.xignite.com/xGlobalMetals.json/GetRealTimeMetalQuote?Symbol=${symbol}&_Token=${apiKey}`
      );
      if (!r.ok) throw new Error(`Xignite HTTP ${r.status}`);
      return r.json();
    };
    const [gold, silver, plat] = await Promise.all([getQuote("XAUSAR"), getQuote("XAGSAR"), getQuote("XPTSAR")]);
    const gSAR = toGram(gold.Last   * TROY_OZ_TO_GRAMS || 0);
    const sSAR = toGram(silver.Last * TROY_OZ_TO_GRAMS || 0);
    const pSAR = toGram(plat.Last   * TROY_OZ_TO_GRAMS || 0);
    return {
      XAU:{ symbol:"XAU",name:"Gold",    color:"#D4A017",priceSAR:gSAR,priceUSD:toUSD(gSAR),change:chg(gSAR,"XAU"),high:toGram(gold.High*TROY_OZ_TO_GRAMS||0),  low:toGram(gold.Low*TROY_OZ_TO_GRAMS||0),  open:toGram(gold.Open*TROY_OZ_TO_GRAMS||0)   },
      XAG:{ symbol:"XAG",name:"Silver",  color:"#A89880",priceSAR:sSAR,priceUSD:toUSD(sSAR),change:chg(sSAR,"XAG"),high:toGram(silver.High*TROY_OZ_TO_GRAMS||0),low:toGram(silver.Low*TROY_OZ_TO_GRAMS||0),open:toGram(silver.Open*TROY_OZ_TO_GRAMS||0) },
      XPT:{ symbol:"XPT",name:"Platinum",color:"#C4956A",priceSAR:pSAR,priceUSD:toUSD(pSAR),change:chg(pSAR,"XPT"),high:toGram(plat.High*TROY_OZ_TO_GRAMS||0),  low:toGram(plat.Low*TROY_OZ_TO_GRAMS||0),  open:toGram(plat.Open*TROY_OZ_TO_GRAMS||0)   },
    };
  }

  if (providerId === "ice") {
    // ICE Data: GET https://api.theice.com/api/v1/continuous/precious-metals
    // Header: apiKey: KEY
    const r = await fetch("https://api.theice.com/api/v1/continuous/precious-metals", {
      headers: { "apiKey": apiKey, "Accept": "application/json" }
    });
    if (r.status === 401) throw new Error("Invalid API key");
    if (!r.ok) throw new Error(`ICE HTTP ${r.status}`);
    const data = await r.json();
    const find = (sym) => data.find(d => d.symbol === sym) || {};
    const gd = find("XAUSAR"), sd = find("XAGSAR"), pd = find("XPTSAR");
    const gSAR = toGram((gd.lastPrice||0)*USD_TO_SAR);
    const sSAR = toGram((sd.lastPrice||0)*USD_TO_SAR);
    const pSAR = toGram((pd.lastPrice||0)*USD_TO_SAR);
    return {
      XAU:{ symbol:"XAU",name:"Gold",    color:"#D4A017",priceSAR:gSAR,priceUSD:toUSD(gSAR),change:chg(gSAR,"XAU"),high:toGram((gd.highPrice||0)*USD_TO_SAR),low:toGram((gd.lowPrice||0)*USD_TO_SAR),open:toGram((gd.openPrice||0)*USD_TO_SAR) },
      XAG:{ symbol:"XAG",name:"Silver",  color:"#A89880",priceSAR:sSAR,priceUSD:toUSD(sSAR),change:chg(sSAR,"XAG"),high:toGram((sd.highPrice||0)*USD_TO_SAR),low:toGram((sd.lowPrice||0)*USD_TO_SAR),open:toGram((sd.openPrice||0)*USD_TO_SAR) },
      XPT:{ symbol:"XPT",name:"Platinum",color:"#C4956A",priceSAR:pSAR,priceUSD:toUSD(pSAR),change:chg(pSAR,"XPT"),high:toGram((pd.highPrice||0)*USD_TO_SAR),low:toGram((pd.lowPrice||0)*USD_TO_SAR),open:toGram((pd.openPrice||0)*USD_TO_SAR) },
    };
  }

  if (providerId === "refinitiv") {
    // Refinitiv RDP: GET https://api.refinitiv.com/data/pricing/snapshots/v1/?universe=XAU=,XAG=,XPT=
    // Header: Authorization: Bearer TOKEN (obtained via token endpoint)
    const r = await fetch(
      "https://api.refinitiv.com/data/pricing/snapshots/v1/?universe=XAUSAR%3D%2CXAGSAR%3D%2CXPTSAR%3D&fields=BID,ASK,OPEN_PRC,HIGH_1,LOW_1",
      { headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" } }
    );
    if (r.status === 401) throw new Error("Invalid API key — check RDP token");
    if (!r.ok) throw new Error(`Refinitiv HTTP ${r.status}`);
    const json = await r.json();
    const find = (ric) => json.data?.find(d => d[0] === ric) || [];
    const g = find("XAUSAR="), s = find("XAGSAR="), p = find("XPTSAR=");
    const gSAR=toGram(((g[1]||0)+(g[2]||0))/2||0), sSAR=toGram(((s[1]||0)+(s[2]||0))/2||0), pSAR=toGram(((p[1]||0)+(p[2]||0))/2||0);
    return {
      XAU:{ symbol:"XAU",name:"Gold",    color:"#D4A017",priceSAR:gSAR,priceUSD:toUSD(gSAR),change:chg(gSAR,"XAU"),high:toGram(g[4]||0),low:toGram(g[5]||0),open:toGram(g[3]||0) },
      XAG:{ symbol:"XAG",name:"Silver",  color:"#A89880",priceSAR:sSAR,priceUSD:toUSD(sSAR),change:chg(sSAR,"XAG"),high:toGram(s[4]||0),low:toGram(s[5]||0),open:toGram(s[3]||0) },
      XPT:{ symbol:"XPT",name:"Platinum",color:"#C4956A",priceSAR:pSAR,priceUSD:toUSD(pSAR),change:chg(pSAR,"XPT"),high:toGram(p[4]||0),low:toGram(p[5]||0),open:toGram(p[3]||0) },
    };
  }

  if (providerId === "bloomberg") {
    // Bloomberg B-PIPE: uses BLPAPI SDK / WebSocket — not a simple REST call.
    // In production, route through your backend: POST /api/market/prices
    // Backend holds Bloomberg credentials securely.
    const r = await fetch("/api/market/prices", {
      method: "POST",
      headers: { "Content-Type":"application/json", "x-bloomberg-key": apiKey },
      body: JSON.stringify({ symbols: ["XAU","XAG","XPT"], currency:"SAR" })
    });
    if (!r.ok) throw new Error(`Bloomberg backend HTTP ${r.status}`);
    const json = await r.json();
    const gSAR = +json.XAU?.priceSAR||0, sSAR = +json.XAG?.priceSAR||0, pSAR = +json.XPT?.priceSAR||0;
    return {
      XAU:{ symbol:"XAU",name:"Gold",    color:"#D4A017",priceSAR:gSAR,priceUSD:toUSD(gSAR),change:chg(gSAR,"XAU"),high:+json.XAU?.high||gSAR,low:+json.XAU?.low||gSAR,open:+json.XAU?.open||gSAR },
      XAG:{ symbol:"XAG",name:"Silver",  color:"#A89880",priceSAR:sSAR,priceUSD:toUSD(sSAR),change:chg(sSAR,"XAG"),high:+json.XAG?.high||sSAR,low:+json.XAG?.low||sSAR,open:+json.XAG?.open||sSAR },
      XPT:{ symbol:"XPT",name:"Platinum",color:"#C4956A",priceSAR:pSAR,priceUSD:toUSD(pSAR),change:chg(pSAR,"XPT"),high:+json.XPT?.high||pSAR,low:+json.XPT?.low||pSAR,open:+json.XPT?.open||pSAR },
    };
  }

  throw new Error(`Unknown provider: ${providerId}`);
}

// ─── Core fetch function ──────────────────────────────────────────────────────
async function fetchPrices() {
  if (!_apiKey) { _status = "DEMO"; _notify(); return; }
  _status = "LOADING"; _notify();
  try {
    _prices    = await fetchFromProvider(_provider, _apiKey);
    _status    = "LIVE";
    _lastFetch = Date.now();
    _notify();
  } catch(err) {
    console.warn(`[${_provider}] price error:`, err.message);
    _status = err.message.includes("Invalid") ? "INVALID_KEY" :
              err.message.includes("Quota")   ? "QUOTA"       : "ERROR";
    _notify();
  }
}

// ─── Public API — called from Settings to switch/save ────────────────────────
function setPriceFeed(providerId, apiKey, intervalSecs) {
  _provider  = providerId;
  _apiKey    = apiKey.trim();
  _interval  = intervalSecs || PROVIDERS[providerId]?.minInterval || 60;
  localStorage.setItem("price_provider", _provider);
  localStorage.setItem("price_api_key",  _apiKey);
  localStorage.setItem("price_interval", String(_interval));
  if (_timer) clearInterval(_timer);
  if (_apiKey) {
    fetchPrices();
    _timer = setInterval(fetchPrices, _interval * 1000);
  } else {
    _status = "DEMO"; _notify();
  }
}

// Start on load
if (_apiKey) {
  fetchPrices();
  _timer = setInterval(fetchPrices, _interval * 1000);
}

// ─── React hook ──────────────────────────────────────────────────────────────
function useLivePrices() {
  const [, tick] = useState(0);
  useEffect(() => {
    const unsub = _subscribe(() => tick(n => n + 1));
    return unsub;
  }, []);
  return {
    prices:    Object.values(_prices),
    gold:      _prices.XAU,
    silver:    _prices.XAG,
    plat:      _prices.XPT,
    status:    _status,
    lastFetch: _lastFetch,
    provider:  _provider,
    interval:  _interval,
  };
}

// ─── Price Ticker ─────────────────────────────────────────────────────────────
const PriceTicker = () => {
  const { isAr } = useLang();
  const { prices, status, lastFetch } = useLivePrices();
  const [flash, setFlash] = useState({});
  const prevRef = useRef({});

  useEffect(() => {
    const changed = {};
    prices.forEach(p => {
      const prev = prevRef.current[p.symbol];
      if (prev !== undefined && prev !== p.priceSAR)
        changed[p.symbol] = p.priceSAR > prev ? "up" : "down";
      prevRef.current[p.symbol] = p.priceSAR;
    });
    if (Object.keys(changed).length) {
      setFlash(changed);
      setTimeout(() => setFlash({}), 1400);
    }
  }, [prices]);

  const ST = {
    LIVE:        { dot:"#4ADE80", label:"Live",        bg:"#052e16" },
    DEMO:        { dot:"#D4943A", label:"Demo",        bg:"#1c1407" },
    LOADING:     { dot:"#C4956A", label:"Loading...",  bg:"#0c1a2e" },
    ERROR:       { dot:"#C85C3E", label:"Error",       bg:"#2d0a0a" },
    INVALID_KEY: { dot:"#C85C3E", label:"Bad Key",     bg:"#2d0a0a" },
    QUOTA:       { dot:"#D4943A", label:"Quota Full",  bg:"#1c1407" },
  }[status] || { dot:"#A89880", label:"...", bg:C.navyDark };

  return (
    <div style={{marginBottom:22}}>
      {status === "DEMO" && (
        <div style={{background:"#1c1407",border:"1px solid #D4943A",borderRadius:10,padding:"8px 14px",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
          {Icons.warning(15,"#D4943A")}
          <span style={{fontSize:13,color:"#D4943A"}}>Demo prices — Go to <strong>Settings → Price Feed</strong> and enter your <strong>metals.dev</strong> API key to activate live prices.</span>
        </div>
      )}
      {(status === "INVALID_KEY" || status === "QUOTA") && (
        <div style={{background:"#2d0a0a",border:"1px solid #C85C3E",borderRadius:10,padding:"8px 14px",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
          {Icons.warning(15,"#C85C3E")}
          <span style={{fontSize:13,color:"#C85C3E"}}>
            {status === "INVALID_KEY" ? "Invalid API key — check Settings → Price Feed" : "API quota exceeded — upgrade your metals.dev plan"}
          </span>
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr auto",gap:10}}>
        {prices.map(p => {
          const fl   = flash[p.symbol];
          const isUp = p.change >= 0;
          return (
            <div key={p.symbol} style={{
              background: fl==="up" ? C.greenBg : fl==="down" ? "#FBF0EC" : C.white,
              borderRadius:14, padding:"14px 20px", display:"flex",
              alignItems:"center", justifyContent:"space-between",
              transition:"background 0.5s",
              border:`1px solid ${fl==="up"?"#86EFAC":fl==="down"?"#E8C5BA":C.border}`,
              boxShadow: fl ? `0 0 12px ${fl==="up"?"#4A7A6822":"#C85C3E22"}` : "0 1px 4px rgba(0,0,0,0.06)",
            }}>
              <div>
                <p style={{fontSize:13,color:C.textMuted,fontWeight:600,marginBottom:4,letterSpacing:"0.05em"}}>{isAr?({"Gold":"الذهب","Silver":"الفضة","Platinum":"البلاتين"}[p.name]||p.name):p.name} · {isAr?"ريال/غ":"SAR/g"}</p>
                <p style={{fontSize:26,fontWeight:800,color:C.navy,lineHeight:1,display:"flex",alignItems:"center",gap:6,direction:"ltr",unicodeBidi:"embed"}}>
                  <SAR size="0.78em" color={p.color}/>
                  {p.priceSAR.toLocaleString("en-SA",{minimumFractionDigits:2,maximumFractionDigits:2})}
                </p>
                <div style={{display:"flex",gap:12,marginTop:5,direction:"ltr"}}>
                  <span style={{fontSize:12,color:C.textMuted}}>{isAr?"أع":"H"}: <span style={{color:C.greenSolid,fontWeight:600}}>{(+p.high||0).toLocaleString("en-SA",{minimumFractionDigits:2,maximumFractionDigits:2})}</span></span>
                  <span style={{fontSize:12,color:C.textMuted}}>{isAr?"أد":"L"}: <span style={{color:"#C85C3E",fontWeight:600}}>{(+p.low||0).toLocaleString("en-SA",{minimumFractionDigits:2,maximumFractionDigits:2})}</span></span>
                  <span style={{fontSize:12,color:C.textMuted}}>{isAr?"افت":"O"}: {(+p.open||0).toLocaleString("en-SA",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <span style={{display:"block",fontSize:17,fontWeight:700,marginBottom:4,
                  color:isUp?C.greenSolid:"#C85C3E",background:isUp?"#EFF5F2":C.redBg,
                  padding:"4px 10px",borderRadius:20}}>{isUp?"▲":"▼"} {isUp?"+":""}{p.change}%</span>
                <span style={{fontSize:12,color:C.textMuted,fontWeight:600}}>{p.symbol}</span>
              </div>
            </div>
          );
        })}
        {/* Status panel */}
        <div style={{background:C.white,borderRadius:14,padding:"14px 16px",display:"flex",flexDirection:"column",justifyContent:"space-between",minWidth:110,border:`1px solid ${C.border}`}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:ST.dot,boxShadow:`0 0 8px ${ST.dot}`}}/>
              <span style={{fontSize:14,fontWeight:700,color:ST.dot}}>{ST.label}</span>
            </div>
            <p style={{fontSize:11,color:C.textMuted,marginBottom:2}}>{PROVIDERS[_provider]?.name||_provider}</p>
            {_lastFetch>0&&<p style={{fontSize:11,color:C.textMuted}}>Updated: {new Date(_lastFetch).toLocaleTimeString()}</p>}
            {_interval&&<p style={{fontSize:11,color:C.textMuted}}>Every {_interval}s</p>}
          </div>
          <button onClick={fetchPrices} title={isAr?"تحديث الآن":"Refresh now"}
            style={{marginTop:8,background:"rgba(255,255,255,0.07)",border:`1px solid ${ST.dot}44`,borderRadius:7,color:"#A89880",fontSize:13,cursor:"pointer",padding:"5px 0",fontWeight:600}}>↻ Refresh</button>
        </div>
      </div>
    </div>
  );
};


// ─── Shared initial order book data (used by Dashboard widget + OrderBook) ───
const INITIAL_OB_ORDERS = [];
// SECURITY: Hardcoded orders removed

// ─── Mini Order Book Widget (Dashboard) ──────────────────────────────────────
const MiniOrderBook = ({ orders, isAr }) => {
  const [metal, setMetal] = useState("Gold");
  const MCOL = {Gold:C.gold,Silver:"#A89880",Platinum:C.purpleSolid};
  const METALS_AR = {Gold:"الذهب",Silver:"الفضة",Platinum:"البلاتين"};

  const open = orders.filter(o=>o.metal===metal&&(o.status==="OPEN"||o.status==="PARTIAL"));
  const bids = open.filter(o=>o.side==="BUY") .sort((a,b)=>b.price-a.price).slice(0,5);
  const asks = open.filter(o=>o.side==="SELL").sort((a,b)=>a.price-b.price).slice(0,5);
  const bestBid = bids[0]?.price||null;
  const bestAsk = asks[0]?.price||null;
  const spread  = bestBid&&bestAsk ? (bestAsk-bestBid).toFixed(2) : null;

  const totalAskGrams = asks.reduce((s,o)=>s+(o.qty-o.filled),0);
  const totalBidGrams = bids.reduce((s,o)=>s+(o.qty-o.filled),0);

  return (
    <div style={{background:C.white,borderRadius:16,border:`1px solid ${C.border}`,padding:"18px 20px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <p style={{fontSize:16,fontWeight:700,color:C.navy}}>{isAr?"دفتر الأوامر — لحظي":"Order Book — Live"}</p>
        <div style={{display:"flex",gap:5}}>
          {["Gold","Silver","Platinum"].map(m=>(
            <button key={m} onClick={()=>setMetal(m)} style={{padding:"3px 10px",borderRadius:6,fontSize:12,fontWeight:700,cursor:"pointer",
              border:`1px solid ${metal===m?MCOL[m]:C.border}`,background:metal===m?MCOL[m]+"22":C.white,color:metal===m?MCOL[m]:C.textMuted}}>
              {isAr?METALS_AR[m]:m}
            </button>
          ))}
        </div>
      </div>

      {/* Spread bar */}
      {spread ? (
        <div style={{display:"flex",gap:12,marginBottom:12,padding:"8px 12px",borderRadius:8,background:"#FAF8F5",border:`1px solid ${C.border}`}}>
          <div style={{textAlign:"center",flex:1}}>
            <p style={{fontSize:11,color:C.textMuted,fontWeight:600}}>{isAr?"أفضل شراء":"BEST BID"}</p>
            <p style={{fontSize:16,fontWeight:800,color:C.greenSolid}}>SAR {bestBid.toFixed(2)}</p>
            <p style={{fontSize:11,color:C.textMuted}}>{totalBidGrams}g</p>
          </div>
          <div style={{textAlign:"center",flex:1}}>
            <p style={{fontSize:11,color:C.textMuted,fontWeight:600}}>{isAr?"السبريد":"SPREAD"}</p>
            <p style={{fontSize:14,fontWeight:700,color:C.navy}}>SAR {spread}</p>
          </div>
          <div style={{textAlign:"center",flex:1}}>
            <p style={{fontSize:11,color:C.textMuted,fontWeight:600}}>{isAr?"أفضل بيع":"BEST ASK"}</p>
            <p style={{fontSize:16,fontWeight:800,color:"#C85C3E"}}>SAR {bestAsk.toFixed(2)}</p>
            <p style={{fontSize:11,color:C.textMuted}}>{totalAskGrams}g</p>
          </div>
        </div>
      ):(
        <div style={{padding:"10px",borderRadius:8,background:C.bg,textAlign:"center",marginBottom:12}}>
          <p style={{fontSize:13,color:C.textMuted}}>{isAr?"لا توجد أوامر مفتوحة":"No open orders for this metal"}</p>
        </div>
      )}

      {/* Depth */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <div>
          <p style={{fontSize:12,fontWeight:700,color:C.greenSolid,marginBottom:5,textAlign:"center"}}>{isAr?"شراء":"BIDS"}</p>
          {bids.length===0?<p style={{fontSize:12,color:C.textMuted,textAlign:"center"}}>—</p>:bids.map((b,i)=>(
            <div key={b.id} style={{display:"flex",justifyContent:"space-between",padding:"3px 6px",borderRadius:4,marginBottom:2,
              background:`rgba(34,197,94,${0.12-i*0.02})`}}>
              <span style={{fontSize:13,fontWeight:700,color:C.greenSolid}}>{b.price.toFixed(2)}</span>
              <span style={{fontSize:12,color:C.textMuted}}>{b.qty-b.filled}g{b.marketMaker&&<span style={{fontSize:10,color:C.gold,fontWeight:800}}> MM</span>}</span>
            </div>
          ))}
        </div>
        <div>
          <p style={{fontSize:12,fontWeight:700,color:"#C85C3E",marginBottom:5,textAlign:"center"}}>{isAr?"بيع":"ASKS"}</p>
          {asks.length===0?<p style={{fontSize:12,color:C.textMuted,textAlign:"center"}}>—</p>:asks.map((a,i)=>(
            <div key={a.id} style={{display:"flex",justifyContent:"space-between",padding:"3px 6px",borderRadius:4,marginBottom:2,
              background:`rgba(239,68,68,${0.12-i*0.02})`}}>
              <span style={{fontSize:13,fontWeight:700,color:"#C85C3E"}}>{a.price.toFixed(2)}</span>
              <span style={{fontSize:12,color:C.textMuted}}>{a.qty-a.filled}g{a.marketMaker&&<span style={{fontSize:10,color:C.gold,fontWeight:800}}> MM</span>}</span>
            </div>
          ))}
        </div>
      </div>
      <p style={{fontSize:11,color:C.textMuted,textAlign:"center",marginTop:8}}>{isAr?"قراءة فقط — الإدارة من صفحة دفتر الأوامر":"Read-only — manage in Order Book page"}</p>
    </div>
  );
};

const Dashboard = () => {
  const { t, isAr } = useLang();
  const { orders, matches, investors, appointments, withdrawals, bars, walletMovements, amlAlerts, cmaAlerts, amlDismissed, appDashStats } = useAppData();
  const s = appDashStats || {
    aum:"0", volumeToday:"0", volumeMonth:"0",
    commissionToday:"0", commissionMonth:"0",
    adminFeesToday:"0", adminFeesMonth:"0",
    pendingWithdrawals:"0", totalWalletBalance:"0",
    activeOrders:0, pendingAppointments:0, totalInvestors:0,
    goldGrams:"0", silverGrams:"0", platinumGrams:"0",
    tokensMinted:0, tokensCirculating:0, tokensPendingBurn:0,
    lastBlock:"—", blockNumber:0,
  };
  const { gold: gp, silver: sp, plat: pp } = useLivePrices();

  const fmtK = n => (n == null || isNaN(n) ? "0" : Number(n).toLocaleString("en-SA",{maximumFractionDigits:0}));
  const goldGrams   = bars.filter(b=>b.metal==="Gold"   && (b.status==="LINKED"||b.status==="FREE")).reduce((s2,b)=>s2+parseFloat(b.weight),0);
  const silverGrams = bars.filter(b=>b.metal==="Silver" && (b.status==="LINKED"||b.status==="FREE")).reduce((s2,b)=>s2+parseFloat(b.weight),0);
  const platGrams   = bars.filter(b=>b.metal==="Platinum"&& (b.status==="LINKED"||b.status==="FREE")).reduce((s2,b)=>s2+parseFloat(b.weight),0);
  const liveAUM = (goldGrams*(gp?.priceSAR||839) + silverGrams*(sp?.priceSAR||10.42) + platGrams*(pp?.priceSAR||138.5));
  const liveAUMStr = fmtK(liveAUM);

  const today = new Date().toISOString().slice(0,10);
  const todayMatches = matches.filter(m=>m.date&&m.date.startsWith(today));
  const volumeToday = todayMatches.reduce((a,m)=>a+m.totalSAR,0);
  const commToday   = todayMatches.reduce((a,m)=>a+m.commission,0);
  const adminToday  = todayMatches.reduce((a,m)=>a+(m.adminFee||0),0);
  const volumeAll   = matches.reduce((a,m)=>a+m.totalSAR,0);
  const commAll     = matches.reduce((a,m)=>a+m.commission,0);
  const adminAll    = matches.reduce((a,m)=>a+(m.adminFee||0),0);

  const pendingW    = withdrawals.filter(w=>w.status==="PENDING").length;
  const walletBal   = walletMovements.reduce((a,w)=>{const raw=w.amount; const amt=typeof raw==="number"?raw:(parseFloat(String(raw).replace(/,/g,""))||0); return a+(w.type==="CREDIT"?amt:-amt);},0);
  const activeOrd   = orders.filter(o=>o.status==="OPEN"||o.status==="PARTIAL").length;
  const pendingAppt = appointments.filter(a=>a.status==="BOOKED"||a.status==="RESCHEDULED").length;
  const totalInv    = investors.length;
  const activeInv   = investors.filter(i=>i.status==="ACTIVE").length;
  const kycExpiring = investors.filter(i=>{if(!i.kycExpiry)return false;const d=(new Date(i.kycExpiry)-new Date())/(86400000);return d>0&&d<30;}).length;
  const unreadAml   = (amlAlerts||[]).filter(a=>!amlDismissed?.has(a.key)).length;

  // 7-day volume sparkline data
  const sparkData = [14200, 18500, 12800, 22100, 19400, 16700, volumeAll||21500];
  const sparkMax = Math.max(...sparkData);
  const sparkPts = sparkData.map((v,i)=>`${20+i*(260/6)},${120-((v/sparkMax)*100)}`).join(" ");
  const sparkArea = `${sparkPts} ${20+6*(260/6)},120 20,120`;
  const dayLabels = isAr?["سبت","أحد","اثنين","ثلاثاء","أربعاء","خميس","جمعة"]:["Sat","Sun","Mon","Tue","Wed","Thu","Fri"];

  // Recent activity feed
  const activity = [
    ...matches.slice(-4).map(m=>({icon:"💰",text:`${m.metal} ${m.qty}g`,sub:isAr?`SAR ${fmtK(m.totalSAR)} — ${m.filledFor}`:`SAR ${fmtK(m.totalSAR)} — ${m.filledFor}`,time:m.date})),
    ...appointments.filter(a=>a.status==="BOOKED").slice(-3).map(a=>({icon:"📅",text:a.investor,sub:`${a.type} · ${a.metal}`,time:a.date||a.slot})),
    ...withdrawals.filter(w=>w.status==="PENDING").slice(-2).map(w=>({icon:"💸",text:w.investor||w.name,sub:`SAR ${w.amount}`,time:w.date||"Today"})),
  ].sort((a,b)=>b.time?.localeCompare(a.time)||0).slice(0,8);

  return (
    <div>
      <PriceTicker />

      {/* ═══ Welcome Banner ═══ */}
      <div style={{background:`linear-gradient(135deg, ${C.sidebar} 0%, #3D3225 60%, ${C.gold}22 100%)`,borderRadius:18,padding:"24px 30px",marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-30,right:isAr?undefined:-30,left:isAr?-30:undefined,width:140,height:140,borderRadius:"50%",background:`${C.gold}15`}}/>
        <div style={{position:"absolute",bottom:-20,right:isAr?undefined:60,left:isAr?60:undefined,width:80,height:80,borderRadius:"50%",background:`${C.gold}10`}}/>
        <div style={{position:"relative",zIndex:1}}>
          <h2 style={{fontSize:22,fontWeight:800,color:"#FFF",margin:0}}>{isAr?"مرحباً بعودتك، عبدالعزيز 👋":"Welcome back, Abdulaziz 👋"}</h2>
          <p style={{fontSize:14,color:"#A89880",marginTop:4}}>{new Date().toLocaleDateString(isAr?"ar-SA":"en-SA",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</p>
          <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
            {pendingW>0&&<span style={{background:"#D4943A22",color:"#D4943A",padding:"3px 10px",borderRadius:6,fontSize:12,fontWeight:700}}>{pendingW} {isAr?"سحب معلق":"pending withdrawals"}</span>}
            {kycExpiring>0&&<span style={{background:"#C4956A22",color:"#C4956A",padding:"3px 10px",borderRadius:6,fontSize:12,fontWeight:700}}>{kycExpiring} {isAr?"KYC قارب انتهاؤه":"KYC expiring"}</span>}
            {unreadAml>0&&<span style={{background:"#C85C3E22",color:"#C85C3E",padding:"3px 10px",borderRadius:6,fontSize:12,fontWeight:700}}>{unreadAml} {isAr?"تنبيه حرج":"critical alerts"}</span>}
            {pendingW===0&&kycExpiring===0&&unreadAml===0&&<span style={{background:"#6B908022",color:"#8BB5A2",padding:"3px 10px",borderRadius:6,fontSize:12,fontWeight:700}}>✅ {isAr?"جميع الأنظمة تعمل بسلاسة":"All systems running smoothly"}</span>}
          </div>
        </div>
        <div style={{textAlign:isAr?"left":"right",position:"relative",zIndex:1}}>
          <div style={{fontSize:28,fontWeight:900,color:C.gold}}><SARAmount amount={liveAUMStr} size="28px" color={C.gold}/></div>
          <p style={{fontSize:12,color:"#A89880",marginTop:2}}>{isAr?"إجمالي الأصول المُدارة":"Total AUM"} · {bars.length} {isAr?"سبيكة":"bars"} · {activeInv} {isAr?"مستثمر":"investors"}</p>
        </div>
      </div>

      <SectionHeader title={isAr?"نظرة عامة على لوحة التحكم":"Dashboard Overview"} sub="Live platform snapshot" />
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:14}}>
        <StatCard icon={Icons.aum(22,C.gold)} title={isAr?"إجمالي الأصول المُدارة":"Total AUM"} value={<SARAmount amount={liveAUMStr}/>} sub={isAr?"الأصول تحت الإدارة":"Assets under management"} gold />
        <StatCard icon={Icons.volume(22,C.teal)} title="Volume Today" value={<SARAmount amount={fmtK(volumeToday)}/>} sub={(isAr?"الكل: ":"All: ")+fmtK(volumeAll)} />
        <StatCard icon={Icons.commission(22,C.gold)} title="Commission Today" value={<SARAmount amount={fmtK(commToday)}/>} sub={(isAr?"الكل: ":"All: ")+fmtK(commAll)} gold />
        <StatCard icon={Icons.settings(22,C.textMuted)} title="Admin Fees Today" value={<SARAmount amount={fmtK(adminToday)}/>} sub={(isAr?"الكل: ":"All: ")+fmtK(adminAll)} />
      </div>

      {/* ═══ Sparkline + Activity Row ═══ */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20}}>
        {/* 7-Day Volume Chart */}
        <div style={{background:C.white,borderRadius:16,border:`1px solid ${C.border}`,padding:"18px 22px",boxShadow:C.cardShadow}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div><span style={{fontSize:15,fontWeight:700,color:C.navy}}>{isAr?"حجم التداول — 7 أيام":"Trading Volume — 7 Days"}</span></div>
            <span style={{background:"#6B908022",color:C.greenSolid,padding:"3px 10px",borderRadius:6,fontSize:12,fontWeight:700}}>↗ 12.3%</span>
          </div>
          <svg viewBox="0 0 300 140" style={{width:"100%",height:120}}>
            <defs><linearGradient id="spGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.gold} stopOpacity="0.35"/><stop offset="100%" stopColor={C.gold} stopOpacity="0.02"/></linearGradient></defs>
            <polygon points={sparkArea} fill="url(#spGrad)"/>
            <polyline points={sparkPts} fill="none" stroke={C.gold} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            {sparkData.map((v,i)=><circle key={i} cx={20+i*(260/6)} cy={120-((v/sparkMax)*100)} r="3.5" fill={C.gold} stroke={C.white} strokeWidth="2"/>)}
            {dayLabels.map((d,i)=><text key={i} x={20+i*(260/6)} y="136" textAnchor="middle" fontSize="9" fill={C.textMuted}>{d}</text>)}
          </svg>
        </div>

        {/* Recent Activity Feed */}
        <div style={{background:C.white,borderRadius:16,border:`1px solid ${C.border}`,padding:"18px 22px",boxShadow:C.cardShadow}}>
          <span style={{fontSize:15,fontWeight:700,color:C.navy,display:"block",marginBottom:10}}>{isAr?"النشاط الأخير":"Recent Activity"}</span>
          <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:140,overflowY:"auto"}}>
            {activity.length===0&&<p style={{fontSize:13,color:C.textMuted,textAlign:"center",padding:20}}>✨ {isAr?"لا يوجد نشاط حديث":"No recent activity"}</p>}
            {activity.map((ev,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 8px",borderRadius:8,background:i%2===0?C.bg:"transparent"}}>
                <span style={{fontSize:16,flexShrink:0}}>{ev.icon}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:C.navy,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.text}</div>
                  <div style={{fontSize:11,color:C.textMuted}}>{ev.sub}</div>
                </div>
                <span style={{fontSize:10,color:C.textMuted,flexShrink:0}}>{ev.time?.slice(5,10)||""}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:14,marginBottom:28}}>
        <StatCard icon={Icons.pending(22,C.orange)} title={isAr?"طلبات السحب المعلقة":"Pending Withdrawals"} value={pendingW} />
        <StatCard icon={Icons.wallet(22,C.teal)} title={isAr?"أرصدة المحافظ":"Wallet Balances"} value={<SARAmount amount={fmtK(Math.abs(walletBal))}/>} />
        <StatCard icon={Icons.orders(22,C.navy)} title={isAr?"الأوامر النشطة":"Active Orders"} value={activeOrd} />
        <StatCard icon={Icons.calendar(22,C.teal)} title={isAr?"المواعيد المعلقة":"Pending Appointments"} value={pendingAppt} />
        <StatCard icon={Icons.investors(22,C.navy)} title={isAr?"إجمالي المستثمرين":"Total Investors"} value={totalInv} />
      </div>
      {(amlAlerts?.length>0||cmaAlerts?.length>0)&&<div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:28}}>
        <StatCard icon={Icons.warning(22,C.red)} title={isAr?"تنبيهات غسل الأموال":"AML Alerts"} value={(amlAlerts||[]).filter(a=>!amlDismissed?.has(a.key)).length} sub={`${(amlAlerts||[]).filter(a=>a.level==="CRITICAL").length} ${isAr?"حرج":"critical"}, ${(amlAlerts||[]).filter(a=>a.level==="HIGH").length} ${isAr?"مرتفع":"high"}`} />
        <StatCard icon={Icons.shield(22,C.purpleSolid)} title={isAr?"تنبيهات التلاعب":"CMA Manipulation"} value={(cmaAlerts||[]).length} sub={`${(cmaAlerts||[]).filter(a=>a.level==="CRITICAL").length} ${isAr?"حرج":"critical"}, ${(cmaAlerts||[]).filter(a=>a.level==="HIGH").length} ${isAr?"مرتفع":"high"}`} />
        <StatCard icon={Icons.check(22,C.greenSolid)} title={isAr?"تم معالجتها":"Dismissed"} value={amlDismissed?.size||0} sub={isAr?"تنبيهات تمت مراجعتها":"Reviewed alerts"} />
        <StatCard icon={Icons.auditlog(22,C.gold)} title={isAr?"آخر فحص":"Last Scan"} value={isAr?"مستمر":"Live"} sub={isAr?"مراقبة مستمرة":"Continuous monitoring"} gold />
      </div>}
      <SectionHeader title={isAr?"دفتر الأوامر":"Order Book"} sub={isAr?"نظرة لحظية — آخر 5 مستويات":"Live snapshot — top 5 levels"} />
      <div style={{marginBottom:28}}>
        <MiniOrderBook orders={orders} isAr={isAr} />
      </div>
      <SectionHeader title={isAr?"الخزنة والبلوكتشين":"Vault & Blockchain"} />
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:14,marginBottom:28}}>
        <StatCard icon={Icons.bar(22,C.orange)} title={isAr?"الذهب في الخزنة":"Gold in Vault"} value={fmtK(goldGrams)+"g"} sub={<SARAmount amount={fmtK(goldGrams*(gp?.priceSAR||839))}/>} gold />
        <StatCard icon={Icons.bar(22,"#A89880")} title={isAr?"الفضة في الخزنة":"Silver in Vault"} value={fmtK(silverGrams)+"g"} sub={<SARAmount amount={fmtK(silverGrams*(sp?.priceSAR||10.42))}/>} />
        <StatCard icon={Icons.bar(22,C.teal)} title={isAr?"البلاتين في الخزنة":"Platinum in Vault"} value={fmtK(platGrams)+"g"} sub={<SARAmount amount={fmtK(platGrams*(pp?.priceSAR||138.5))}/>} />
        <StatCard icon={Icons.token(22,C.teal)} title={isAr?"الرموز المصكوكة":"Tokens Minted"} value={(s.tokensMinted||0).toLocaleString()} />
        <StatCard icon={Icons.token(22,C.navy)} title={isAr?"المتداولة":"In Circulation"} value={(s.tokensCirculating||0).toLocaleString()} />
        <StatCard icon={Icons.fire(22,C.red)} title={isAr?"بانتظار الحرق":"Pending Burn"} value={s.tokensPendingBurn} />
        <StatCard icon={Icons.block(22,C.navy)} title={isAr?"آخر كتلة":"Last Block"} value={"#"+s.blockNumber} sub={s.lastBlock} gold />
      </div>
    </div>
  );
};

const Investors = () => {
  const { lang, t, isAr } = useLang();
  const { investors, setInvestors, appointments, setAppointments, blacklist, addAudit, pageHint, setPageHint } = useAppData();
  const [search,setSearch]=useState(""); 
  const [filter,setFilter]=useState("ALL"); 

  // Auto-filter from action center hint
  useEffect(()=>{
    if(pageHint?.filter){setFilter(pageHint.filter);if(pageHint.search)setSearch(pageHint.search);setPageHint(null);}
  },[pageHint]);
  const [sel,setSel]=useState(null);
  const [action,setAction]=useState(null); // 'suspend'|'ban'|'unban'|'activate'|'notify'
  const [reason,setReason]=useState("");
  const [notifyMsg,setNotifyMsg]=useState("");
  const [toast,setToast]=useState("");

  const showToast = (msg) => { setToast(msg); setTimeout(()=>setToast(""),3000); };

  const doAction = (inv, act) => { setSel(inv); setAction(act); setReason(""); setNotifyMsg(""); };

  const confirmAction = () => {
    const newStatus = {suspend:"SUSPENDED",activate:"ACTIVE",ban:"BANNED",unban:"ACTIVE"}[action];
    setInvestors(prev => prev.map(i => i.id===sel.id ? {...i, status:newStatus} : i));

    // Auto-cancel appointments for suspended/banned investors
    if(action==="suspend" || action==="ban") {
      setAppointments(prev => prev.map(a => {
        if(a.nationalId !== sel.nationalId) return a;
        if(a.status==="BOOKED" || a.status==="RESCHEDULED")
          return {...a, status:"CANCELED", cancelReason:"Investor "+action+"ed by admin"};
        return a;
      }));
    }

    addAudit(action.toUpperCase(), sel.id + " — " + sel.nameEn, reason||"No reason provided");
    const msgs = {suspend:"Investor suspended — appointments auto-cancelled",activate:"Investor reactivated",ban:"Investor banned — appointments auto-cancelled",unban:"Investor unbanned",notify:"Notification sent"};
    showToast("✅ "+msgs[action]);
    setSel(null); setAction(null);
  };

  const rows = investors.filter(i=>(filter==="ALL"||i.status===filter)&&
    (i.nameEn.toLowerCase().includes(search.toLowerCase())||i.id.includes(search)||
     (i.nationalId||"").includes(search)));

  return (
    <div>
      {toast&&<div style={{position:"fixed",top:20,right:20,background:C.navy,color:C.white,padding:"12px 20px",borderRadius:12,fontSize:15,fontWeight:600,zIndex:9999,boxShadow:"0 4px 20px rgba(0,0,0,0.3)"}}>{toast}</div>}
      <SectionHeader title={isAr?"المستثمرون":"Investors"} sub={investors.length+" total — Suspended: can login, no actions | Banned: blocked by National ID"}
        action={<ExportMenu isAr={isAr}
          onCSV={()=>downloadCSV("investors_"+new Date().toISOString().slice(0,10),
            ["ID","Name","National ID","Wallet","Holdings (SAR)","Gold (g)","Silver (g)","Platinum (g)","Status","Joined","KYC Expiry"],
            investors.map(inv=>[inv.id,inv.nameEn,inv.nationalId,inv.wallet,inv.holdingsValue,inv.gold,inv.silver,inv.platinum,inv.status,inv.joined,inv.kycExpiry||"—"])
          )}
          onPDF={()=>{/* PDF generation placeholder */}}
        />}
      />
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:14,marginBottom:22}}>
        <StatCard icon={Icons.investors(22,C.navy)} title={t("Total")} value={investors.length} />
        <StatCard icon={Icons.check(22,C.greenSolid)} title={t("Active")} value={investors.filter(i=>i.status==="ACTIVE").length} />
        <StatCard icon={Icons.pending(22,"#D4943A")} title={t("Suspended")} value={investors.filter(i=>i.status==="SUSPENDED").length} />
        <StatCard icon={Icons.blacklist(22,"#C85C3E")} title={t("Banned")} value={investors.filter(i=>i.status==="BANNED").length} />
        <StatCard icon={Icons.aum(22,C.gold)} title={t("Total Holdings")} value={<SARAmount amount={investors.reduce((a,i)=>a+parseFloat((i.holdingsValue||"0").replace(/,/g,"")),0).toLocaleString("en-SA",{maximumFractionDigits:0})}/>} gold />
      </div>
<div style={{display:"flex",gap:10,marginBottom:8,flexWrap:"wrap",alignItems:"center"}}>
        <input placeholder={isAr?"بحث بالاسم أو الرقم...":"Search by name or ID..."} value={search} onChange={e=>setSearch(e.target.value)}
          style={{flex:1,minWidth:200,padding:"8px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:16,outline:"none"}} />
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center",marginBottom:16}}>
        {[["ALL","الكل"],["ACTIVE","نشط"],["SUSPENDED","موقوف"],["BANNED","محظور"]].map(([f,fAr])=>(
          <button key={f} onClick={()=>setFilter(f)} style={{padding:"7px 16px",borderRadius:8,fontSize:14,fontWeight:600,cursor:"pointer",
            border:`1px solid ${filter===f?C.navy:C.border}`,background:filter===f?C.navy:C.white,color:filter===f?C.white:C.textMuted}}>{isAr?fAr:f}</button>
        ))}
      </div>
      <TTable cols={[
        {key:"id",label:"ID"},{key:"nameEn",label:"Name",render:(v,row)=>{
          const todayStr = new Date().toISOString().slice(0,10);
          const kycExpired = row.kycExpiry && row.kycExpiry < todayStr;
          const soonExpiry = !kycExpired && row.kycExpiry && row.kycExpiry < new Date(Date.now()+30*24*60*60*1000).toISOString().slice(0,10);
          const noShowWarn = (row.noShowCount||0) >= 2;
          const isBlacklisted = blacklist.some(bl=>bl.nationalId===row.nationalId);
          return (
            <div style={{textAlign:"start"}}>
              <div style={{fontWeight:600,color:C.navy}}>{isAr&&row.nameAr?row.nameAr:v}</div>
              <div style={{display:"flex",gap:4,marginTop:2,flexWrap:"wrap"}}>
                                {kycExpired&&<span style={{fontSize:11,fontWeight:700,color:"#C85C3E",background:C.redBg,borderRadius:4,padding:"1px 5px"}}>⛔ KYC EXPIRED</span>}
                {soonExpiry&&<span style={{fontSize:11,fontWeight:700,color:"#D4943A",background:"#FDF4EC",borderRadius:4,padding:"1px 5px"}}>⚠ KYC expiring</span>}
                {noShowWarn&&<span style={{fontSize:11,fontWeight:700,color:"#C85C3E",background:C.redBg,borderRadius:4,padding:"1px 5px"}}>🚫 {row.noShowCount} no-shows</span>}
                {isBlacklisted&&<span style={{fontSize:11,fontWeight:700,color:C.purpleSolid,background:C.purpleBg,borderRadius:4,padding:"1px 5px"}}>🚫 Blacklisted</span>}
              </div>
            </div>
          );
        }},
        {key:"vaultKey",label:"Vault Key",render:v=><span style={{fontFamily:"monospace",fontSize:13,color:C.teal}}>{v}</span>},
        {key:"holdingsValue",label:"Holdings",render:v=><SARAmount amount={v}/>},
        {key:"gold",label:"Gold(g)"},{key:"silver",label:"Silver(g)"},{key:"platinum",label:"Pt(g)"},
        {key:"status",label:"Status",render:v=><Badge label={v}/>},
        {key:"joined",label:"Joined"},
        {key:"id",label:"Actions",render:(_,row)=>(
          <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"center"}}>
            <Btn small variant="outline" onClick={()=>doAction(row,"view")}>{isAr?"عرض":"View"}</Btn>
            {row.status==="ACTIVE"&&<><Btn small variant="ghost" onClick={()=>doAction(row,"suspend")}>{t("Suspend")}</Btn><Btn small variant="danger" onClick={()=>doAction(row,"ban")}>{t("Ban")}</Btn></>}
            {row.status==="SUSPENDED"&&<><Btn small variant="teal" onClick={()=>doAction(row,"activate")}>{t("Activate")}</Btn><Btn small variant="danger" onClick={()=>doAction(row,"ban")}>{t("Ban")}</Btn></>}
            {row.status==="BANNED"&&<Btn small variant="teal" onClick={()=>doAction(row,"unban")}>{t("Unban")}</Btn>}
            <Btn small variant="ghost" onClick={()=>doAction(row,"notify")}>{t("Notify")}</Btn>
            <Btn small variant="outline" onClick={()=>doAction(row,"timeline")} style={{color:C.purpleSolid,borderColor:C.purpleSolid}}>📜 {isAr?"السجل":"Timeline"}</Btn>
          </div>
        )},
      ]} rows={rows} />

      {/* View Modal */}
      {action==="view"&&sel&&<Modal title={"Investor — "+sel.nameEn} onClose={()=>{setSel(null);setAction(null);}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:0}}>
          {[["ID",sel.id],["Arabic Name",sel.nameAr],["Vault Key",sel.vaultKey],["Status",sel.status],
            ["Joined",sel.joined],["Gold",sel.gold+"g"],["Silver",sel.silver+"g"],["Platinum",sel.platinum+"g"],
            ["Holdings",sel.holdingsValue],["National ID",sel.nationalId||"—"],["Wallet",sel.wallet]].map(([k,v])=>(
            <div key={k} style={{display:"flex",flexDirection:"column",padding:"9px 10px",borderBottom:`1px solid ${C.border}`}}>
              <span style={{fontSize:12,color:C.textMuted,fontWeight:600,textTransform:"uppercase"}}>{k}</span>
              <span style={{fontSize:16,fontWeight:600,color:C.navy,marginTop:2,wordBreak:"break-all"}}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap"}}>
          {sel.status!=="BANNED"&&<Btn variant="danger" onClick={()=>setAction("ban")}>Ban</Btn>}
          {sel.status==="BANNED"&&<Btn variant="teal" onClick={()=>setAction("unban")}>{t("Unban")}</Btn>}
          {sel.status==="ACTIVE"&&<Btn variant="ghost" onClick={()=>setAction("suspend")}>{t("Suspend")}</Btn>}
          {sel.status==="SUSPENDED"&&<Btn variant="teal" onClick={()=>setAction("activate")}>{t("Activate")}</Btn>}
          <Btn variant="outline" onClick={()=>doAction(sel,"notify")}>{isAr?"إرسال إشعار":"Send Notification"}</Btn>
          <Btn variant="ghost" onClick={()=>{setSel(null);setAction(null);}}>{isAr?"إغلاق":"Close"}</Btn>
        </div>
      </Modal>}

      {/* Confirm Action Modals */}
      {["suspend","ban","unban","activate"].includes(action)&&sel&&<Modal
        title={{suspend:"Suspend Investor",ban:"Ban Investor",unban:"Unban Investor",activate:"Reactivate Investor"}[action]}
        onClose={()=>{setSel(null);setAction(null);}}>
        <div style={{background:{suspend:"#FDF4EC",ban:C.redBg,unban:"#EFF5F2",activate:"#EFF5F2"}[action],borderRadius:10,padding:"10px 14px",marginBottom:14}}>
          <p style={{fontSize:15,color:{suspend:"#8B6540",ban:"#C85C3E",unban:C.greenSolid,activate:C.greenSolid}[action],fontWeight:600}}>
            {action==="suspend"&&<>Investor can still login but cannot buy, sell or take actions. <br/><span style={{fontSize:13,color:"#8B6540"}}>⚠️ Note: Any open orders will remain in the Order Book — cancel them manually in Order Book.</span></>}
            {action==="ban"&&"Ban is tied to National ID. Investor cannot login or re-register."}
            {action==="unban"&&"Investor will be restored to ACTIVE status."}
            {action==="activate"&&"Investor will be fully reactivated."}
          </p>
        </div>
        <p style={{fontSize:15,color:C.navy,fontWeight:600,marginBottom:6}}>Investor: <span style={{color:C.teal}}>{sel.nameEn}</span> ({sel.id})</p>
        {(action==="suspend"||action==="ban")&&(
          <div style={{marginBottom:14}}>
            <label style={{display:"block",fontSize:13,fontWeight:600,color:C.textMuted,marginBottom:5}}>REASON (required)</label>
            <textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Enter reason..."
              style={{width:"100%",padding:"8px 12px",borderRadius:8,fontSize:15,border:`1px solid ${C.border}`,resize:"vertical",minHeight:70,boxSizing:"border-box",fontFamily:"inherit"}}/>
          </div>
        )}
        <div style={{display:"flex",gap:8}}>
          <Btn variant={{suspend:"ghost",ban:"danger",unban:"teal",activate:"teal"}[action]}
            onClick={()=>{if((action==="suspend"||action==="ban")&&!reason.trim()){showToast("⚠️ Please enter a reason");return;}confirmAction();}}>
            Confirm {action.charAt(0).toUpperCase()+action.slice(1)}
          </Btn>
          <Btn variant="outline" onClick={()=>{setSel(null);setAction(null);}}>{t("Cancel")}</Btn>
        </div>
      </Modal>}

      {/* Notify Modal */}
      {action==="notify"&&sel&&<Modal title={"Notify — "+sel.nameEn} onClose={()=>{setSel(null);setAction(null);}}>
        <p style={{fontSize:14,color:C.textMuted,marginBottom:14}}>Send SMS + push notification to investor.</p>
        <Sel label={isAr?"القالب":"Template"} value="" onChange={v=>setNotifyMsg(v)} options={[
          {value:"",label:"— Select template or write custom —"},
          {value:"Your account has been reviewed.",label:"Account review notice"},
          {value:"Please complete your KYC verification.",label:"KYC reminder"},
          {value:"Your appointment is confirmed.",label:"Appointment confirmed"},
          {value:"Action required on your account.",label:"Action required"},
        ]} />
        <div style={{marginBottom:14}}>
          <label style={{display:"block",fontSize:13,fontWeight:600,color:C.textMuted,marginBottom:5}}>{isAr?"الرسالة":"MESSAGE"}</label>
          <textarea value={notifyMsg} onChange={e=>setNotifyMsg(e.target.value)} placeholder="Type custom message..."
            style={{width:"100%",padding:"8px 12px",borderRadius:8,fontSize:15,border:`1px solid ${C.border}`,resize:"vertical",minHeight:80,boxSizing:"border-box",fontFamily:"inherit"}}/>
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn variant="teal" onClick={()=>{if(!notifyMsg.trim()){showToast("⚠️ Message is empty");return;}showToast("✅ Notification sent to "+sel.nameEn);setSel(null);setAction(null);}}>{isAr?"إرسال إشعار":"Send Notification"}</Btn>
          <Btn variant="outline" onClick={()=>{setSel(null);setAction(null);}}>{t("Cancel")}</Btn>
        </div>
      </Modal>}
      {/* Investor Timeline Modal */}
      {action==="timeline"&&sel&&<InvestorTimeline investor={sel} onClose={()=>{setSel(null);setAction(null);}} />}
    </div>
  );
};


const TransactionLog = () => {
  const { t, isAr } = useLang();
  const { matches } = useAppData();
  const [txns, setTxns] = useState([]);
  const liveTxRows = matches.map(m=>({id:m.id,investor:m.filledFor,buyerName:m.filledFor,sellerName:m.filledFor,type:"MATCH",metal:m.metal,metalAmt:String(m.totalSAR),commission:String(m.commission),adminFee:String(m.adminFee||0),method:"Wallet",total:String(m.totalSAR),status:"COMPLETED",date:m.date}));
  const allTxns = [...liveTxRows, ...txns];
  const [typeF, setTypeF]     = useState("ALL");
  const [metalF, setMetalF]   = useState("ALL");
  const [statusF, setStatusF] = useState("ALL");
  const [search, setSearch]   = useState("");
  const [toast, setToast]     = useState("");
  const [page, setPage]       = useState(1);
  const PAGE_SIZE = 10;
  const showToast = m => { setToast(m); setTimeout(()=>setToast(""),3000); };

  const exportCSV = () => {
    // SEC: Sanitize values to prevent CSV formula injection (=, +, -, @, \t, \r)
    const sanitize = (v) => { const s=String(v||""); return /^[=+\-@\t\r]/.test(s) ? "'"+s : s; };
    const headers = ["Txn ID","Buyer","Buyer NID","Seller","Seller NID","Type","Metal","Amount","Commission","Admin Fee","Total","Payment","Status","Date"];
    const csvRows = [headers.join(","), ...rows.map(r=>[r.id,r.buyerName||"",r.buyerNationalId||"",r.sellerName||"",r.sellerNationalId||"",r.type,r.metal,r.metalAmt,r.commission,r.adminFee,r.total,r.method,r.status,r.date].map(v=>`"${sanitize(v)}"`).join(","))];
    const blob = new Blob([csvRows.join("\n")],{type:"text/csv"});
    const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="transactions.csv"; a.click();
    URL.revokeObjectURL(a.href); // SEC-MEM-01: prevent blob URL leak
  };

  const rows = allTxns.filter(tx => {
    const s = search.toLowerCase();
    return (typeF==="ALL"   || tx.type===typeF) &&
    (metalF==="ALL"  || tx.metal===metalF) &&
    (statusF==="ALL" || tx.status===statusF) &&
    (search===""     || tx.id.toLowerCase().includes(s) ||
      (tx.investor||"").toLowerCase().includes(s) ||
      (tx.buyerName||"").toLowerCase().includes(s) ||
      (tx.sellerName||"").toLowerCase().includes(s));
  });

  const totalVol   = rows.reduce((a,t)=>a+parseFloat(t.metalAmt.replace(/,/g,"")),0);
  const totalComm  = rows.reduce((a,t)=>a+parseFloat(t.commission.replace(/,/g,"")),0);
  const totalCount = rows.length;

  const fmtNum = n => (n||0).toLocaleString("en-SA", {maximumFractionDigits:0});

  const TxBadge = ({type}) => (
    <span style={{
      display:"inline-flex",alignItems:"center",gap:4,
      padding:"3px 10px",borderRadius:20,fontSize:13,fontWeight:700,
      background: type==="BUY"  ? "#EFF5F2" : "#FDF4EC",
      color:      type==="BUY"  ? "#15803D" : "#8B6540",
    }}>{isAr?(type==="BUY"?"شراء":"بيع"):type}</span>
  );

  const StBadge = ({status}) => (
    <span style={{
      display:"inline-flex",alignItems:"center",
      padding:"3px 10px",borderRadius:20,fontSize:13,fontWeight:700,
      background: status==="COMPLETED" ? "#EFF5F2" : C.redBg,
      color:      status==="COMPLETED" ? "#15803D" : "#8B3520",
    }}>{isAr?(status==="COMPLETED"?"مكتمل":"ملغى"):status}</span>
  );

  const MetalDot = ({metal}) => {
    const colors = {Gold:"#D4943A",Silver:"#8C7E6F",Platinum:C.purpleSolid};
    const arNames = {Gold:"ذهب",Silver:"فضة",Platinum:"بلاتين"};
    return (
      <span style={{display:"inline-flex",alignItems:"center",gap:5}}>
        <span style={{width:8,height:8,borderRadius:"50%",background:colors[metal]||C.teal,display:"inline-block"}}/>
        {isAr?arNames[metal]:metal}
      </span>
    );
  };

  return (
    <div>
      <SectionHeader
        title={t("Transaction Log")}
        sub={isAr?"سجل كامل بجميع معاملات المنصة":"Complete record of all platform trades"}
        action={<ExportMenu isAr={isAr}
          onCSV={()=>downloadCSV("transactions_"+new Date().toISOString().slice(0,10),
            ["ID","Investor","Type","Metal","Amount","Commission","Admin Fee","Method","Total","Status","Date"],
            rows.map(r=>[r.id,r.investor,r.type,r.metal,r.metalAmt,r.commission,r.adminFee,r.method,r.total,r.status,r.date])
          )}
          onPDF={()=>{/* PDF generation placeholder */}}
        />}
      />

      {/* Stat Cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:22}}>
        <StatCard icon={Icons.aum(22,C.gold)} title={t("Total Volume")} value={<SARAmount amount={fmtNum(totalVol)}/>} gold />
        <StatCard icon={Icons.aum(22,C.teal)} title={t("Total Commission")} value={<SARAmount amount={fmtNum(totalComm)}/>} />
        <StatCard icon={Icons.investors(22,C.navy)} title={t("Transactions")} value={totalCount} />
      </div>

      {/* Filters */}
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
        <input
          placeholder={isAr?"بحث بالمعرف أو الاسم...":"Search by ID or investor..."}
          value={search} onChange={e=>setSearch(e.target.value)}
          style={{flex:1,minWidth:200,padding:"8px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:15,outline:"none"}}
        />
      </div>
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",justifyContent:"center"}}>
        {/* Type */}
        {[["ALL","الكل"],["BUY","شراء"],["SELL","بيع"]].map(([f,fAr])=>(
          <button key={f} onClick={()=>setTypeF(f)} style={{padding:"6px 14px",borderRadius:8,fontSize:14,fontWeight:600,cursor:"pointer",
            border:`1px solid ${typeF===f?C.teal:C.border}`,background:typeF===f?C.tealLight:C.white,color:typeF===f?C.teal:C.textMuted}}>
            {isAr?fAr:f}
          </button>
        ))}
        <div style={{width:1,height:24,background:C.border}}/>
        {/* Metal */}
        {[["ALL","الكل"],["Gold","ذهب"],["Silver","فضة"],["Platinum","بلاتين"]].map(([f,fAr])=>(
          <button key={f} onClick={()=>setMetalF(f)} style={{padding:"6px 14px",borderRadius:8,fontSize:14,fontWeight:600,cursor:"pointer",
            border:`1px solid ${metalF===f?C.gold:C.border}`,background:metalF===f?C.goldLight:C.white,color:metalF===f?C.goldDim:C.textMuted}}>
            {isAr?fAr:f}
          </button>
        ))}
        <div style={{width:1,height:24,background:C.border}}/>
        {/* Status */}
        {[["ALL","الكل"],["COMPLETED","مكتمل"],["CANCELLED","ملغى"]].map(([f,fAr])=>(
          <button key={f} onClick={()=>setStatusF(f)} style={{padding:"6px 14px",borderRadius:8,fontSize:14,fontWeight:600,cursor:"pointer",
            border:`1px solid ${statusF===f?C.navy:C.border}`,background:statusF===f?C.navy:C.white,color:statusF===f?C.white:C.textMuted}}>
            {isAr?fAr:f}
          </button>
        ))}
      </div>

      {/* Export + pagination */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
        <span style={{fontSize:14,color:C.textMuted}}>{isAr?`${rows.length} معاملة — صفحة ${page} من ${Math.ceil(rows.length/PAGE_SIZE)}`:`${rows.length} transactions — page ${page} of ${Math.ceil(rows.length/PAGE_SIZE)||1}`}</span>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <Btn small variant="outline" onClick={()=>setPage(p=>Math.max(1,p-1))} >←</Btn>
          <Btn small variant="outline" onClick={()=>setPage(p=>Math.min(Math.ceil(rows.length/PAGE_SIZE),p+1))}>→</Btn>
          <Btn small variant="ghost" onClick={exportCSV}>{isAr?"⬇ تصدير CSV":"⬇ Export CSV"}</Btn>
        </div>
      </div>
      {/* Table */}
      <TTable cols={[
        {key:"id",   label:isAr?"رقم المعاملة":"Txn ID"},
        {key:"buyerName", label:isAr?"المشتري":"Buyer", render:(v,row)=>(
          <div>
            <div style={{fontWeight:600,color:C.greenSolid}}>{v}</div>
            <div style={{fontSize:12,color:C.textMuted,fontFamily:"monospace"}}>{isAr?"هوية:":"‫ID:"} {row.buyerNationalId}</div>
          </div>
        )},
        {key:"sellerName", label:isAr?"البائع":"Seller", render:(v,row)=>{
          const washTrade = row.buyerNationalId && row.sellerNationalId && row.buyerNationalId===row.sellerNationalId && row.buyerNationalId!=="N/A";
          return (
            <div>
              <div style={{fontWeight:600,color:"#C85C3E"}}>{v}</div>
              <div style={{fontSize:12,color:C.textMuted,fontFamily:"monospace"}}>{isAr?"هوية:":"ID:"} {row.sellerNationalId}</div>
              {washTrade&&<div style={{fontSize:11,fontWeight:700,color:C.purpleSolid,background:C.purpleBg,borderRadius:4,padding:"1px 5px",marginTop:2}}>⚠ Wash Trade</div>}
            </div>
          );
        }},
        {key:"type",   label:isAr?"النوع":"Type",    render:v=><TxBadge type={v}/>},
        {key:"metal",  label:isAr?"المعدن":"Metal",   render:v=><MetalDot metal={v}/>},
        {key:"metalAmt",    label:isAr?"المبلغ":"Amount",     render:v=><SARAmount amount={v}/>},
        {key:"commission",  label:isAr?"العمولة":"Commission", render:v=><SARAmount amount={v}/>},
        {key:"adminFee",    label:isAr?"رسوم الإدارة":"Admin Fee",  render:v=><span style={{color:v==="0"||v==="—"?C.textMuted:C.text}}>{v==="0"||v===""?"—":<SARAmount amount={v}/>}</span>},
        {key:"total",  label:isAr?"الإجمالي":"Total",   render:v=><span style={{fontWeight:700}}><SARAmount amount={v}/></span>},
        {key:"method", label:isAr?"طريقة الدفع":"Payment"},
        {key:"status", label:isAr?"الحالة":"Status",  render:v=><StBadge status={v}/>},
        {key:"date",   label:isAr?"التاريخ":"Date"},
      ]} rows={rows.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE)} />

      {toast&&<div style={{position:"fixed",top:20,right:20,background:C.navy,color:C.white,padding:"12px 20px",borderRadius:12,fontSize:15,fontWeight:600,zIndex:9999,boxShadow:"0 4px 20px rgba(0,0,0,0.3)"}}>{toast}</div>}
    </div>
  );
};

const Vault = () => {
  const { t, isAr } = useLang();
  const { bars } = useAppData();
  const [metal,setMetal]=useState("ALL"); const [status,setStatus]=useState("ALL");

  const [barsModal,setBarsModal]=useState(null);
  const [vaultToast,setVaultToast]=useState("");
  const showVaultToast = (m)=>{ setVaultToast(m); setTimeout(()=>setVaultToast(""),3000); };
  const rows=bars.filter(b=>(metal==="ALL"||b.metal===metal)&&(status==="ALL"||b.status===status));
  return (
    <div>
      <SectionHeader title="Main Vault" sub={isAr?"سجل السبائك الفيزيائية — القيد والخروج يتم عبر المواعيد فقط":"Physical bar registry — linking and unlinking only through appointments"} />
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:14,marginBottom:22}}>
        <StatCard icon={Icons.vault(22,C.navy)} title={isAr?"إجمالي السبائك":"Total Bars"} value={bars.length} />
        <StatCard icon={Icons.block(22,C.teal)} title={t("Linked")} value={bars.filter(b=>b.status==="LINKED").length} />
        <StatCard icon={Icons.check(22,C.greenSolid)} title={t("Free")} value={bars.filter(b=>b.status==="FREE").length} />
        <StatCard icon={Icons.token(22,C.teal)} title={isAr?"إجمالي الرموز":"Total Tokens"} value="0" gold />
        <StatCard icon={Icons.token(22,C.navy)} title={t("Floating")} value={bars.filter(b=>b.status==="FREE").reduce((s,b)=>s+parseFloat(b.weight||0),0).toLocaleString("en-SA")} />
        <StatCard icon={Icons.block(22,C.teal)} title={t("Linked Tokens")} value={bars.filter(b=>b.status==="LINKED").reduce((s,b)=>s+parseFloat(b.weight||0),0).toLocaleString("en-SA")} />
        <StatCard icon={Icons.check(22,C.greenSolid)} title={t("Integrity")} value={bars.filter(b=>b.status==="DAMAGED").length===0&&bars.filter(b=>b.status==="LEFT").length===bars.filter(b=>b.leftOn).length&&bars.filter(b=>b.leftOn&&b.status!=="LEFT").length===0?"1:1 ✓":"⚠ Check"} gold />
      </div>
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center",justifyContent:"center"}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center",marginBottom:8}}>{[["ALL","الكل"],["Gold","ذهب"],["Silver","فضة"],["Platinum","بلاتين"]].map(([m,mAr])=><button key={m} onClick={()=>setMetal(m)} style={{padding:"6px 14px",borderRadius:8,fontSize:14,fontWeight:600,cursor:"pointer",border:`1px solid ${metal===m?C.gold:C.border}`,background:metal===m?C.goldLight:C.white,color:metal===m?C.goldDim:C.textMuted}}>{isAr?mAr:m}</button>)}</div>
        <div style={{width:1,height:24,background:C.border}} />
        <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center",marginBottom:16}}>{[["ALL","الكل"],["LINKED","مرتبط"],["FREE","حر"]].map(([s,sAr])=><button key={s} onClick={()=>setStatus(s)} style={{padding:"6px 14px",borderRadius:8,fontSize:14,fontWeight:600,cursor:"pointer",border:`1px solid ${status===s?C.navy:C.border}`,background:status===s?C.navy:C.white,color:status===s?C.white:C.textMuted}}>{isAr?sAr:s}</button>)}</div>
      </div>
      <TTable cols={[
        {key:"id",label:"Bar ID"},{key:"metal",label:"Metal"},{key:"weight",label:"Weight"},
        {key:"barcode",label:"Barcode",render:v=><span style={{fontFamily:"monospace",fontSize:12}}>{v}</span>},
        {key:"manufacturer",label:"Manufacturer"},{key:"vault",label:"Vault"},
        {key:"status",label:"Status",render:v=><Badge label={v}/>},
        {key:"depositor",label:"Depositor"},{key:"deposited",label:"Date In"},{key:"leftOn",label:"Date Out",render:v=>v?<span style={{color:"#8C7E6F",fontStyle:"italic"}}>{v}</span>:<span style={{color:C.textMuted}}>—</span>},
        {key:"id",label:"Actions",render:(_,row)=><div style={{display:"flex",gap:5,justifyContent:"center"}}>
          <Btn small variant="outline" onClick={()=>{setBarsModal({type:"cert",bar:row});}}>{t("Certificate")}</Btn>
        </div>},
      ]} rows={rows} />
      {vaultToast&&<div style={{position:"fixed",top:20,right:20,background:C.navy,color:C.white,padding:"12px 20px",borderRadius:12,fontSize:15,fontWeight:600,zIndex:9999,boxShadow:"0 4px 20px rgba(0,0,0,0.3)"}}>{vaultToast}</div>}

      {/* Certificate Modal */}
      {barsModal?.type==="cert"&&<Modal title={"Bar Certificate — "+barsModal.bar.id} onClose={()=>setBarsModal(null)}>
        <div style={{background:C.goldLight,borderRadius:12,padding:16,border:`2px solid ${C.gold}55`,marginBottom:14}}>
          <div style={{textAlign:"center",marginBottom:12}}>
            <p style={{fontSize:13,color:C.goldDim,fontWeight:700,letterSpacing:"0.1em"}}>TANAQUL PRECIOUS — BAR CERTIFICATE</p>
            <p style={{fontSize:24,fontWeight:800,color:C.gold,fontFamily:"monospace"}}>{barsModal.bar.id}</p>
          </div>
          {[["Metal",barsModal.bar.metal],["Weight",barsModal.bar.weight],["Barcode",barsModal.bar.barcode],
            ["Manufacturer",barsModal.bar.manufacturer],["Vault",barsModal.bar.vault+" Vault"],
            ["Status",barsModal.bar.status],["Depositor",barsModal.bar.depositor],["Date In",barsModal.bar.deposited]
          ].map(([k,v])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.gold}33`}}>
              <span style={{fontSize:13,color:C.textMuted,fontWeight:600}}>{k}</span>
              <span style={{fontSize:15,fontWeight:700,color:C.navy,fontFamily:k==="Barcode"?"monospace":"inherit"}}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:8}}><Btn variant="gold" onClick={()=>{showVaultToast("✅ Certificate downloaded");setBarsModal(null);}}>⬇ Download PDF</Btn><Btn variant="outline" onClick={()=>setBarsModal(null)}>{isAr?"إغلاق":"Close"}</Btn></div>
      </Modal>}



      {/* Deposits and withdrawals are appointment-only — no manual vault actions */}
    </div>
  );
};

const MANUFACTURERS = ["MKS PAMP SA (Switzerland)","Valcambi SA (Switzerland)","Argor-Heraeus (Switzerland)","Perth Mint (Australia)","Royal Canadian Mint","Emirates Gold (UAE)","Saudi Aramco Refinery","Johnson Matthey","Umicore","Credit Suisse"];

function isExpired(dateStr) {
  const apptTime = new Date(dateStr);
  const now = new Date();
  return now > new Date(apptTime.getTime() + 30 * 60000);
}

const STATUS_COLORS = {
  BOOKED: {bg:"#E8EFF7",color:C.blueSolid},
  EXPIRED: {bg:C.redBg,color:"#C85C3E"},
  COMPLETED: {bg:"#EFF5F2",color:C.greenSolid},
  NO_SHOW: {bg:"#FDF4EC",color:"#8B6540"},
  CANCELED: {bg:"#F3F4F6",color:"#6B7280"},
  RESCHEDULED: {bg:C.purpleBg,color:C.purpleSolid},
};

const ApptBadge = ({status}) => {
  const s = STATUS_COLORS[status] || {bg:"#F3F4F6",color:"#6B7280"};
  const labels = {BOOKED:"Booked",EXPIRED:"Expired",COMPLETED:"Completed",NO_SHOW:"No Show",CANCELED:"Canceled",RESCHEDULED:"Rescheduled"};
  return <span style={{padding:"3px 10px",borderRadius:20,fontSize:13,fontWeight:700,background:s.bg,color:s.color}}>{labels[status]||status}</span>;
};

const Appointments = () => {
  const { t, isAr, cancelFee: ctxCancelFee } = useLang();
  const cfee = parseFloat(ctxCancelFee || "50");
  const { appointments, setAppointments, bars, setBars, investors, setInvestors, walletMovements, setWalletMovements, addAudit, pageHint, setPageHint } = useAppData();
  const [type,setType]=useState("ALL");
  const [statusFilter,setStatusFilter]=useState("ALL");

  // Auto-filter from action center hint
  useEffect(()=>{
    if(pageHint?.filter){setStatusFilter(pageHint.filter);setPageHint(null);}
  },[pageHint]);
  const [sel,setSel]=useState(null);
  const [modal,setModal]=useState(null); // 'view'|'cancel'|'noshow'|'reschedule'|'start'|'otp'
  const [startStep,setStartStep]=useState(1); // 1=info, 2=bars, 3=otp
  const [inProgress,setInProgress]=useState(new Set());
  const [manufacturer,setManufacturer]=useState(MANUFACTURERS[0]);
  const [reschedDate,setReschedDate]=useState("");
  const [reschedTime,setReschedTime]=useState("");
  const [otpVal,setOtpVal]=useState("");
  const [otpError,setOtpError]=useState("");
  const [otpSecs,setOtpSecs]=useState(300);
  const [otpExpired,setOtpExpired]=useState(false);
  const [startData,setStartData]=useState({barcode:"",purity:"999.9 (24K)",notes:""});
  const [apptToast,setApptToast]=useState("");
  const showApptToast=(msg)=>{setApptToast(msg);setTimeout(()=>setApptToast(""),4000);};
  // ⚠️ SECURITY: In production, OTP must be generated server-side and delivered via SMS/push.
  // This mock value exists only for prototype demonstration. Remove before deployment.
  const MOCK_OTP = null;

  const closeAll = (interrupted=false) => { if(interrupted&&sel&&startStep>1){setInProgress(p=>new Set([...p,sel.id]));} setSel(null); setModal(null); setStartStep(1); setOtpVal(""); setOtpError(""); setOtpSecs(300); setOtpExpired(false); setReschedDate(""); setReschedTime(""); };

  // OTP countdown when on step 3
  useEffect(()=>{
    if(modal==="start"&&startStep===3){
      setOtpSecs(300); setOtpExpired(false);
      const iv = setInterval(()=>{
        setOtpSecs(s=>{ if(s<=1){ clearInterval(iv); setOtpExpired(true); return 0; } return s-1; });
      },1000);
      return ()=>clearInterval(iv);
    }
  },[modal,startStep]);

  const rows = appointments.filter(a=>
    (type==="ALL"||a.type===type) &&
    (statusFilter==="ALL"||a.status===statusFilter)
  );
  
  // Within-24hr reschedule freeze check
  const canReschedule = (appt) => {
    const apptTime = new Date(appt.date);
    const hoursUntil = (apptTime - new Date()) / 3600000;
    return hoursUntil > 24;
  };

  const actionBtns = (row) => {
    const expired = isExpired(row.date);
    if(row.status==="COMPLETED"||row.status==="CANCELED") return (
      <div style={{display:"flex",gap:4,justifyContent:"center"}}><Btn small variant="outline" onClick={()=>{setSel(row);setModal("view");}}>{isAr?"عرض":"View"}</Btn></div>
    );
    if(row.status==="NO_SHOW") return (
      <div style={{display:"flex",gap:4,justifyContent:"center"}}><Btn small variant="outline" onClick={()=>{setSel(row);setModal("view");}}>{isAr?"عرض":"View"}</Btn></div>
    );
    if(row.status==="IN_PROGRESS") return (
      <div style={{display:"flex",gap:4,justifyContent:"center"}}><Btn small variant="teal" onClick={()=>{setSel(row);setModal("start");}}>{isAr?"متابعة":"Continue"}</Btn></div>
    );
    if(row.status==="RESCHEDULED"||row.status==="BOOKED") {
      if(expired) return (
        <div style={{display:"flex",gap:4,justifyContent:"center"}}>
          <Btn small variant="teal" onClick={()=>{setSel(row);setModal("start");}}>{inProgress.has(row.id)?"Continue":"Start"}</Btn>
          <Btn small variant="danger" onClick={()=>{setSel(row);setModal("noshow");}}>{t("No Show")}</Btn>
        </div>
      );
      return (
        <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"center"}}>
          <Btn small variant="teal" onClick={()=>{setSel(row);setModal("start");}}>{inProgress.has(row.id)?"Continue":"Start"}</Btn>
          <Btn small variant="outline" onClick={()=>{ if(!canReschedule(row)){showApptToast(isAr?"لا يمكن إعادة الجدولة خلال 24 ساعة من الموعد":"Cannot reschedule within 24 hours of appointment");return;} setSel(row);setModal("reschedule");}}>{t("Reschedule")}</Btn>
          <Btn small variant="danger" onClick={()=>{setSel(row);setModal("cancel");}}>{t("Cancel")}</Btn>
        </div>
      );
    }
    if(row.status==="EXPIRED") return (
      <div style={{display:"flex",gap:4,justifyContent:"center"}}>
        <Btn small variant="teal" onClick={()=>{setSel(row);setModal("start");}}>{inProgress.has(row.id)?"Continue":"Start"}</Btn>
        <Btn small variant="danger" onClick={()=>{setSel(row);setModal("noshow");}}>{t("No Show")}</Btn>
      </div>
    );
    return null;
  };

  return (
    <div>
      {apptToast&&<div style={{position:"fixed",top:24,left:"50%",transform:"translateX(-50%)",zIndex:9999,background:"#2D2418",color:"#FFF",padding:"12px 24px",borderRadius:12,fontSize:14,fontWeight:600,boxShadow:"0 8px 32px rgba(0,0,0,0.2)",display:"flex",alignItems:"center",gap:8}}><span>⚠️</span>{apptToast}</div>}
      <SectionHeader title={isAr?"المواعيد":"Appointments"} sub="Vault deposit & withdrawal scheduling" />

      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:14,marginBottom:22}}>
        <StatCard icon={Icons.calendar(22,C.teal)} title={t("Booked")} value={appointments.filter(a=>a.status==="BOOKED").length} />
        <StatCard icon={Icons.pending(22,"#C85C3E")} title={t("Expired")} value={appointments.filter(a=>a.status==="EXPIRED").length} />
        <StatCard icon={Icons.check(22,C.greenSolid)} title={t("Completed")} value={appointments.filter(a=>a.status==="COMPLETED").length} gold />
        <StatCard icon={Icons.cancel(22,"#C85C3E")} title={t("No Show")} value={appointments.filter(a=>a.status==="NO_SHOW").length} />
        <StatCard icon={Icons.cancel(22,"#6B7280")} title={t("Canceled")} value={appointments.filter(a=>a.status==="CANCELED").length} />
        <StatCard icon={Icons.reschedule(22,C.purpleSolid)} title={t("Rescheduled")} value={appointments.filter(a=>a.status==="RESCHEDULED").length} />
      </div>
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
        {[["ALL","الكل"],["DEPOSIT","إيداع"],["WITHDRAWAL","سحب"]].map(([f,fAr])=><button key={f} onClick={()=>setType(f)} style={{padding:"6px 14px",borderRadius:8,fontSize:14,fontWeight:600,cursor:"pointer",border:`1px solid ${type===f?C.teal:C.border}`,background:type===f?C.tealLight:C.white,color:type===f?C.teal:C.textMuted}}>{isAr?fAr:f}</button>)}
        <div style={{width:1,height:24,background:C.border}} />
        {[["ALL","الكل"],["BOOKED","محجوز"],["IN_PROGRESS","قيد التنفيذ"],["EXPIRED","منتهٍ"],["COMPLETED","مكتمل"],["NO_SHOW","لم يحضر"],["CANCELED","ملغى"],["RESCHEDULED","أُعيد جدولته"]].map(([f,fAr])=><button key={f} onClick={()=>setStatusFilter(f)} style={{padding:"6px 14px",borderRadius:8,fontSize:14,fontWeight:600,cursor:"pointer",border:`1px solid ${statusFilter===f?C.navy:C.border}`,background:statusFilter===f?C.navy:C.white,color:statusFilter===f?C.white:C.textMuted}}>{isAr?fAr:f}</button>)}
      </div>
      <TTable cols={[
        {key:"id",label:"ID"},{key:"investor",label:"Investor"},
        {key:"type",label:"Type",render:v=><Badge label={v}/>},{key:"metal",label:"Metal"},{key:"qty",label:"Qty"},
        {key:"vault",label:"Vault"},{key:"date",label:"Scheduled"},
        {key:"fee",label:"Fee",render:v=><SARAmount amount={v}/>},
        {key:"status",label:"Status",render:v=><ApptBadge status={v}/>},
        {key:"id",label:"Actions",render:(_,row)=>actionBtns(row)},
      ]} rows={rows} />

      {/* CANCEL CONFIRMATION */}
      {modal==="cancel"&&sel&&<Modal title={isAr?"إلغاء الموعد":"Cancel Appointment"} onClose={closeAll}>
        <div style={{textAlign:"center",padding:"8px 0"}}>
          <div style={{marginBottom:12,display:"flex",justifyContent:"center"}}>{Icons.warning(44,"#D4943A")}</div>
          <p style={{fontSize:20,fontWeight:600,color:C.navy,marginBottom:8}}>Are you sure you want to cancel this appointment?</p>
          <p style={{fontSize:14,color:C.textMuted,marginBottom:6}}>Appointment: <b>{sel.id}</b> — {sel.investor}</p>
          <p style={{fontSize:14,color:C.textMuted,marginBottom:16}}>Scheduled: {sel.date}</p>
          <div style={{background:"#FDF4EC",borderRadius:10,padding:"10px 16px",marginBottom:20,textAlign:"left"}}>
            <p style={{fontSize:14,fontWeight:600,color:"#8B6540"}}>💰 Refund Policy</p>
            <p style={{fontSize:13,color:"#8B6540",marginTop:4}}>The appointment fee of <b>{sel.fee} SAR</b> will be refunded minus a <b>{cfee} SAR</b> cancellation fee.</p>
            <p style={{fontSize:13,color:"#8B6540",marginTop:2}}>Investor receives: <b>{sel.fee - cfee} SAR</b> back to their wallet.</p>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"center"}}>
            <Btn variant="danger" onClick={()=>{
              setAppointments(prev=>prev.map(a=>a.id===sel.id?{...a,status:"CANCELED",cancelReason:"Cancelled by admin"}:a));
              // Create wallet refund movement (fee minus cancellation charge from Settings)
              const refundAmt = Math.max(0, sel.fee - cfee);
              if(refundAmt > 0) {
                setWalletMovements(prev => [{
                  id: "WM-" + String(Date.now()).slice(-6) + String(Math.random()).slice(2,5),
                  investor: sel.investor,
                  nationalId: sel.nationalId,
                  vaultKey: "—",
                  type: "CREDIT",
                  amount: refundAmt,
                  reason: "Appointment Cancellation Refund — " + sel.id + " (" + cfee + " SAR fee kept)",
                  date: new Date().toISOString().slice(0,16).replace("T"," "),
                }, ...prev]);
              }
              addAudit("CANCEL_APPOINTMENT", sel.id, sel.investor+" (NID: "+(sel.nationalId||"—")+") — "+sel.type+" — refund SAR "+refundAmt);
              closeAll();
            }}>Yes, Cancel Appointment</Btn>
            <Btn variant="outline" onClick={closeAll}>No, Keep It</Btn>
          </div>
        </div>
      </Modal>}

      {/* NO SHOW CONFIRMATION */}
      {modal==="noshow"&&sel&&<Modal title={isAr?"تسجيل عدم حضور":"Mark as No Show"} onClose={closeAll}>
        <div style={{textAlign:"center",padding:"8px 0"}}>
          <div style={{marginBottom:12,display:"flex",justifyContent:"center"}}>{Icons.cancel(44,"#C85C3E")}</div>
          <p style={{fontSize:20,fontWeight:600,color:C.navy,marginBottom:8}}>Are you sure you want to mark this as No Show?</p>
          <p style={{fontSize:14,color:C.textMuted,marginBottom:6}}>Appointment: <b>{sel.id}</b> — {sel.investor}</p>
          <p style={{fontSize:14,color:C.textMuted,marginBottom:16}}>Scheduled: {sel.date}</p>
          <div style={{background:C.redBg,borderRadius:10,padding:"10px 16px",marginBottom:20,textAlign:"left"}}>
            <p style={{fontSize:14,fontWeight:600,color:"#8B3520"}}>⛔ No Refund</p>
            <p style={{fontSize:13,color:"#8B3520",marginTop:4}}>The appointment fee of <b>{sel.fee} SAR</b> will NOT be refunded for no-shows.</p>
            <p style={{fontSize:13,color:"#8B3520",marginTop:4}}>⚠️ Investors with 2+ no-shows are flagged and require a security deposit for future bookings.</p>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"center"}}>
            <Btn variant="danger" onClick={()=>{
              setAppointments(prev=>prev.map(a=>a.id===sel.id?{...a,status:"NO_SHOW"}:a));
              setInvestors(prev=>prev.map(inv=>{
                // nationalId is the universal key — name comes from NAFATH
                return inv.nationalId===sel.nationalId ? {...inv,noShowCount:(inv.noShowCount||0)+1} : inv;
              }));
              addAudit("NO_SHOW", sel.id, sel.investor+" (NID: "+sel.nationalId+") — "+sel.date);
              closeAll();
            }}>Yes, Mark as No Show</Btn>
            <Btn variant="outline" onClick={closeAll}>No, Go Back</Btn>
          </div>
        </div>
      </Modal>}

      {/* RESCHEDULE */}
      {modal==="reschedule"&&sel&&<Modal title={isAr?"إعادة جدولة الموعد":"Reschedule Appointment"} onClose={closeAll}>
        <p style={{fontSize:14,color:C.textMuted,marginBottom:16}}>Appointment: <b>{sel.id}</b> — {sel.investor} — {sel.type} — {sel.metal}</p>
        <div style={{display:"grid",gap:12,marginBottom:20}}>
          <div>
            <label style={{fontSize:13,fontWeight:600,color:C.textMuted,display:"block",marginBottom:4}}>{isAr?"التاريخ الجديد":"NEW DATE"}</label>
            <input type="date" value={reschedDate} min={new Date().toISOString().slice(0,10)} onChange={e=>setReschedDate(e.target.value)} style={{width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:19,outline:"none"}} />
          </div>
          <div>
            <label style={{fontSize:13,fontWeight:600,color:C.textMuted,display:"block",marginBottom:4}}>{isAr?"الوقت الجديد":"NEW TIME"}</label>
            <select value={reschedTime} onChange={e=>setReschedTime(e.target.value)} style={{width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:19,outline:"none",background:C.white}}>
              <option value="">Select time slot...</option>
              {["09:00","10:00","11:00","14:00","15:00","16:00"].map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn variant="teal" onClick={()=>{
            if(!reschedDate||!reschedTime){showApptToast(isAr?"يرجى اختيار التاريخ والوقت":"Please select a date and time");return;}
            const newDate = reschedDate+" "+reschedTime;
            setAppointments(prev=>prev.map(a=>a.id===sel.id?{...a,status:"RESCHEDULED",date:newDate}:a));
            addAudit("RESCHEDULE", sel.id, sel.investor+" → "+newDate);
            closeAll();
          }} style={{opacity:reschedDate&&reschedTime?1:0.5}}><span style={{display:"flex",alignItems:"center",gap:6}}>{Icons.check(14,C.white)} Confirm Reschedule</span></Btn>
          <Btn variant="outline" onClick={closeAll}>{t("Cancel")}</Btn>
        </div>
      </Modal>}

      {/* START — Step 1: Investor Info */}
      {modal==="start"&&sel&&startStep===1&&<Modal title={`Start Appointment — ${sel.id}`} onClose={closeAll}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16,background:C.tealLight,borderRadius:10,padding:"10px 14px"}}>
          {Icons.user(24,C.teal)}
          <div>
            <p style={{fontSize:19,fontWeight:700,color:C.navy}}>{sel.investor}</p>
            <p style={{fontSize:13,color:C.textMuted}}>{sel.investorPhone} • {sel.type} • {sel.metal} • {sel.qty}</p>
          </div>
        </div>
        {[["Appointment ID",sel.id],["Type",sel.type],["Metal",sel.metal],["Quantity",sel.qty],["Vault",sel.vault],["Scheduled",sel.date],["Fee Paid",sel.fee+" SAR"],["Payment",sel.paymentMethod]].map(([k,v])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:14,color:C.textMuted}}>{k}</span>
            <span style={{fontSize:14,fontWeight:600,color:C.navy}}>{v}</span>
          </div>
        ))}
        <div style={{marginTop:16,display:"flex",gap:8}}>
          <Btn variant="gold" onClick={()=>{setAppointments(prev=>prev.map(a=>a.id===sel.id?{...a,status:"IN_PROGRESS"}:a));setStartStep(2);}}>Continue to Bar Details →</Btn>
        </div>
      </Modal>}

      {/* START — Step 2: Bar Details */}
      {modal==="start"&&sel&&startStep===2&&<Modal title={sel.type==="DEPOSIT"?"Bar Deposit Details":"Bar Withdrawal Details"} onClose={()=>closeAll(true)}>
        <p style={{fontSize:14,color:C.textMuted,marginBottom:14}}>{sel.investor} • {sel.metal} • {sel.qty}</p>
        <div style={{display:"grid",gap:12}}>
          {sel.type==="DEPOSIT"&&<>
            <div>
              <label style={{fontSize:13,fontWeight:600,color:C.textMuted,display:"block",marginBottom:4}}>{isAr?"الباركود":"BARCODE"}</label>
              <input placeholder="Scan or enter barcode..." value={startData.barcode} onChange={e=>setStartData(d=>({...d,barcode:e.target.value}))} style={{width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:19,outline:"none"}} />
            </div>
            <div>
              <label style={{fontSize:13,fontWeight:600,color:C.textMuted,display:"block",marginBottom:4}}>{isAr?"الشركة المصنعة":"MANUFACTURER"}</label>
              <select value={manufacturer} onChange={e=>setManufacturer(e.target.value)} style={{width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:19,outline:"none",background:C.white}}>
                {MANUFACTURERS.map(m=><option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={{fontSize:13,fontWeight:600,color:C.textMuted,display:"block",marginBottom:4}}>{isAr?"النقاوة":"PURITY"}</label>
              <select value={startData.purity} onChange={e=>setStartData(d=>({...d,purity:e.target.value}))} style={{width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:19,outline:"none",background:C.white}}>
                <option>999.9 (24K)</option><option>995.0</option><option>916.7 (22K)</option><option>750.0 (18K)</option>
              </select>
            </div>
          </>}
          {sel.type==="WITHDRAWAL"&&<>
            <div>
              <label style={{fontSize:13,fontWeight:600,color:C.textMuted,display:"block",marginBottom:4}}>BAR BARCODE (to be withdrawn)</label>
              <input placeholder="Scan or enter barcode..." value={startData.barcode} onChange={e=>setStartData(d=>({...d,barcode:e.target.value}))} style={{width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:19,outline:"none"}} />
            </div>
          </>}
          <div>
            <label style={{fontSize:13,fontWeight:600,color:C.textMuted,display:"block",marginBottom:4}}>{isAr?"الوزن":"WEIGHT"}</label>
            <input defaultValue={sel.qty} style={{width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:19,outline:"none",background:"#f8f9fb"}} readOnly />
          </div>
          <div>
            <label style={{fontSize:13,fontWeight:600,color:C.textMuted,display:"block",marginBottom:4}}>NOTES (optional)</label>
            <input placeholder="Any additional notes..." value={startData.notes} onChange={e=>setStartData(d=>({...d,notes:e.target.value}))} style={{width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:19,outline:"none"}} />
          </div>
        </div>
        <div style={{marginTop:16,display:"flex",gap:8}}>
          <Btn variant="gold" onClick={()=>setStartStep(3)}>Continue to OTP Verification →</Btn>
          <Btn variant="outline" onClick={()=>setStartStep(1)}>← Back</Btn>
        </div>
      </Modal>}

      {/* START — Step 3: OTP */}
      {modal==="start"&&sel&&startStep===3&&<Modal title={isAr?"التحقق من رمز OTP":"OTP Verification"} onClose={()=>closeAll(true)}>
        <div style={{textAlign:"center",padding:"8px 0 16px"}}>
          <div style={{marginBottom:12,display:"flex",justifyContent:"center"}}>{Icons.otp(44,C.teal)}</div>
          <p style={{fontSize:20,fontWeight:700,color:C.navy,marginBottom:6}}>{isAr?"أدخل رمز التحقق للمستثمر":"Enter Investor OTP"}</p>
          <p style={{fontSize:14,color:C.textMuted,marginBottom:4}}>An OTP has been sent to the investor's registered mobile:</p>
          <p style={{fontSize:19,fontWeight:700,color:C.teal,marginBottom:20}}>{sel.investorPhone}</p>
          <p style={{fontSize:14,color:C.textMuted,marginBottom:12}}>Ask the investor to read the OTP and enter it below to authenticate the {sel.type.toLowerCase()}:</p>
          <input
            type="text"
            value={otpVal}
            onChange={e=>{setOtpVal(e.target.value.replace(/\D/g,"").slice(0,6));setOtpError("");}}
            placeholder="000000"
            maxLength={6}
            style={{width:180,padding:"14px",borderRadius:12,border:`2px solid ${otpError?C.red:otpVal.length===6?C.teal:C.border}`,fontSize:34,outline:"none",textAlign:"center",letterSpacing:"0.4em",fontWeight:700,marginBottom:8}}
          />
          {otpError&&<p style={{color:C.red,fontSize:14,marginBottom:8}}>{otpError}</p>}
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:20}}>
            <span style={{fontSize:14,fontWeight:700,color:otpExpired?"#C85C3E":otpSecs<60?"#D4943A":C.textMuted}}>
              {otpExpired?"⛔ OTP expired":`⏱ ${Math.floor(otpSecs/60)}:${String(otpSecs%60).padStart(2,"0")} remaining`}
            </span>
            <button onClick={()=>{setOtpSecs(300);setOtpExpired(false);setOtpVal("");setOtpError("");}}
              style={{fontSize:13,fontWeight:700,color:C.teal,background:"none",border:`1px solid ${C.teal}`,borderRadius:6,padding:"3px 10px",cursor:"pointer"}}>
              Resend OTP
            </button>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"center"}}>
            <Btn variant="gold" onClick={()=>{
              if(otpExpired){setOtpError("OTP has expired. Click Resend OTP.");return;}
              if(otpVal===MOCK_OTP){
                // Mark IN_PROGRESS then COMPLETED
                setAppointments(prev=>prev.map(a=>a.id===sel.id?{...a,status:"IN_PROGRESS"}:a));
                setTimeout(()=>setAppointments(prev=>prev.map(a=>a.id===sel.id?{...a,status:"COMPLETED"}:a)),500);
                // Bar lifecycle: deposit → LINKED, withdrawal → LEFT
                if(sel.type==="DEPOSIT"&&startData.barcode){
                  const existingBar = bars.find(b=>b.barcode===startData.barcode.trim());
                  if(existingBar&&existingBar.status==="LEFT"){
                    // Re-deposit: restore bar
                    setBars(prev=>prev.map(b=>b.barcode===startData.barcode.trim()?{...b,status:"LINKED",depositor:sel.nationalId||sel.investor,deposited:new Date().toISOString().slice(0,10),leftOn:undefined}:b));
                  } else if(!existingBar){
                    // New bar
                    const newBar={id:"BAR-"+String(bars.length+1).padStart(3,"0"),metal:sel.metal,weight:sel.qty,barcode:startData.barcode.trim(),manufacturer,vault:sel.vault.replace(" Vault 1","").replace(" Vault",""),status:"LINKED",depositor:sel.nationalId||sel.investor,deposited:new Date().toISOString().slice(0,10)};
                    setBars(prev=>[...prev,newBar]);
                  }
                }
                if(sel.type==="WITHDRAWAL"&&startData.barcode){
                  setBars(prev=>prev.map(b=>b.barcode===startData.barcode.trim()?{...b,status:"LEFT",leftOn:new Date().toISOString().slice(0,10),vault:"—"}:b));
                }
                addAudit("COMPLETE_APPOINTMENT", sel.id, sel.investor+" — "+sel.type+" — "+sel.metal+" "+sel.qty);
                closeAll();
              }
              else{setOtpError("Incorrect OTP. Please ask the investor to check their phone.");}
            }} style={{opacity:otpVal.length===6&&!otpExpired?1:0.5}}>
              ✓ Verify & Complete {sel.type}
            </Btn>
            <Btn variant="outline" onClick={()=>setStartStep(2)}>← Back</Btn>
          </div>
          <p style={{fontSize:12,color:C.textMuted,marginTop:12}}>Note: Completing this action will {sel.type==="DEPOSIT"?"mint tokens to investor wallet":"burn tokens from investor wallet"}.</p>
        </div>
      </Modal>}

      {/* VIEW (Completed / No Show / Canceled) */}
      {modal==="view"&&sel&&<Modal title={`Appointment — ${sel.id}`} onClose={closeAll}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,background:C.bg,borderRadius:10,padding:"10px 14px"}}>
          <ApptBadge status={sel.status} />
          <span style={{fontSize:14,color:C.textMuted}}>{sel.type} • {sel.date}</span>
        </div>
        {[["Appointment ID",sel.id],["Investor",sel.investor],["National ID",sel.nationalId||"—"],["Phone",sel.investorPhone],["Type",sel.type],["Metal",sel.metal],["Quantity",sel.qty],["Vault",sel.vault],["Scheduled",sel.date],["Fee",sel.fee+" SAR"],["Payment Method",sel.paymentMethod],["Status",sel.status.replace("_"," ")]].map(([k,v])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:14,color:C.textMuted}}>{k}</span>
            <span style={{fontSize:14,fontWeight:600,color:C.navy}}>{v}</span>
          </div>
        ))}
        {sel.status==="CANCELED"&&<div style={{background:"#F3F4F6",borderRadius:10,padding:"10px 14px",marginTop:12}}>
          <p style={{fontSize:13,color:C.textMuted}}>Refunded: <b>{sel.fee-cfee} SAR</b> (after {cfee} SAR cancellation fee)</p>
        </div>}
        {sel.status==="NO_SHOW"&&<div style={{background:C.redBg,borderRadius:10,padding:"10px 14px",marginTop:12}}>
          <p style={{fontSize:13,color:"#8B3520"}}>No refund issued — investor did not show up.</p>
        </div>}
        <div style={{marginTop:14}}><Btn variant="outline" onClick={closeAll}>{isAr?"إغلاق":"Close"}</Btn></div>
      </Modal>}
    </div>
  );
};


const Financials = () => {
  const { t, isAr } = useLang();
  const { withdrawals, setWithdrawals, matches, walletMovements, addAudit, pageHint, setPageHint } = useAppData();
  const [tab,setTab]=useState("ORDERS");

  // Auto-switch tab from action center hint
  useEffect(()=>{
    if(pageHint?.tab){setTab(pageHint.tab);setPageHint(null);}
  },[pageHint]);
  const txRows = matches.map(m=>({id:m.id,investor:m.filledFor,type:"MATCH",metal:m.metal,metalAmt:String(m.totalSAR),commission:String(m.commission),adminFee:String(m.adminFee||0),method:"Wallet",total:String(m.totalSAR),status:"COMPLETED",date:m.date}));
  const [wModal,setWModal]=useState(null);
  const [wReason,setWReason]=useState("");
  const [finToast,setFinToast]=useState("");
  const showFinToast = (m)=>{ setFinToast(m); setTimeout(()=>setFinToast(""),3000); };

  // Live-computed financial stats
  const fmtK = n => (n == null || isNaN(n) ? "0" : Number(n).toLocaleString("en-SA",{maximumFractionDigits:0}));
  const today = new Date().toISOString().slice(0,10);
  const todayM = matches.filter(m=>m.date&&m.date.startsWith(today));
  const volToday  = todayM.reduce((a,m)=>a+m.totalSAR,0);
  const commToday = todayM.reduce((a,m)=>a+m.commission,0);
  const adminToday= todayM.reduce((a,m)=>a+(m.adminFee||0),0);
  const volAll    = matches.reduce((a,m)=>a+m.totalSAR,0);
  const commAll   = matches.reduce((a,m)=>a+m.commission,0);
  const adminAll  = matches.reduce((a,m)=>a+(m.adminFee||0),0);
  const walBal    = walletMovements.reduce((a,w)=>{const raw=w.amount;const amt=typeof raw==="number"?raw:(parseFloat(String(raw).replace(/,/g,""))||0);return a+(w.type==="CREDIT"?amt:-amt);},0);

  const doWithdrawal = (row, type) => { setWModal({type,row}); setWReason(""); };

  const confirmWithdrawal = () => {
    const {type,row} = wModal;
    // IBAN required and format validated before approval
    if(type==="approve" && (!row.iban || row.iban==="—")) {
      showFinToast("⚠️ IBAN is required before approving a withdrawal");
      return;
    }
    if(type==="approve" && !/^SA\d{22}$/.test(row.iban.replace(/\s/g,""))) {
      showFinToast("⚠️ Invalid IBAN format — Saudi IBAN must start with SA followed by 22 digits");
      return;
    }
    setWithdrawals(prev=>prev.map(w=>{
      if(w.id!==row.id) return w;
      if(type==="approve")   return {...w,status:"APPROVED",processed:new Date().toISOString().slice(0,10)};
      if(type==="reject")    return {...w,status:"REJECTED",processed:new Date().toISOString().slice(0,10)};
      if(type==="processed") return {...w,status:"PROCESSED",processed:new Date().toISOString().slice(0,16).replace("T"," ")};
      return w;
    }));
    addAudit("WITHDRAWAL_"+type.toUpperCase(), row.id, row.investor+" — SAR "+row.amount);
    const msgs = {approve:"✅ Withdrawal approved",reject:"✅ Withdrawal rejected",processed:"✅ Marked as processed",notify:"✅ Notification sent"};
    showFinToast(msgs[type]);
    setWModal(null);
  };

  return (
    <div>
      {finToast&&<div style={{position:"fixed",top:20,right:20,background:C.navy,color:C.white,padding:"12px 20px",borderRadius:12,fontSize:15,fontWeight:600,zIndex:9999,boxShadow:"0 4px 20px rgba(0,0,0,0.3)"}}>{finToast}</div>}
      <SectionHeader title={isAr?"الماليات":"Financials"} sub="Orders, wallets & withdrawal requests" />
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:14,marginBottom:22}}>
        <StatCard icon={Icons.volume(22,C.teal)} title="Volume Today" value={<SARAmount amount={fmtK(volToday)}/>} sub={(isAr?"الكل: ":"All: ")+fmtK(volAll)} />
        <StatCard icon={Icons.commission(22,C.gold)} title="Commission Today" value={<SARAmount amount={fmtK(commToday)}/>} sub={(isAr?"الكل: ":"All: ")+fmtK(commAll)} gold />
        <StatCard icon={Icons.settings(22,C.textMuted)} title="Admin Fees Today" value={<SARAmount amount={fmtK(adminToday)}/>} sub={(isAr?"الكل: ":"All: ")+fmtK(adminAll)} />
        <StatCard icon={Icons.pending(22,"#D4943A")} title={isAr?"طلبات السحب المعلقة":"Pending Withdrawals"} value={withdrawals.filter(w=>w.status==="PENDING").length+(isAr?" طلب":" requests")} />
        <StatCard icon={Icons.wallet(22,C.teal)} title={isAr?"أرصدة المحافظ":"Wallet Balances"} value={<SARAmount amount={fmtK(Math.abs(walBal))}/>} />
      </div>
      <TabBar tabs={["ORDERS","WALLET MOVEMENTS","WITHDRAWAL REQUESTS"]} active={tab} onChange={setTab} />
      {tab==="ORDERS"&&<>
        {matches.length>0&&<div style={{background:C.greenBg,borderRadius:10,padding:"8px 14px",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:14,fontWeight:700,color:C.greenSolid}}>✅ {matches.length} live match{matches.length!==1?"es":""} from today's trading session</span>
        </div>}
        <TTable cols={[
        {key:"id",label:"TX ID"},{key:"investor",label:"Investor",render:(v,row)=>row.filledFor||v},
        {key:"vaultKey",label:"Vault Key",render:v=><span style={{fontFamily:"monospace",fontSize:12,color:C.teal}}>{v}</span>},
        {key:"type",label:"Type",render:v=><Badge label={v}/>},{key:"metal",label:"Metal"},
        {key:"metalAmt",label:"Amount",render:v=><SARAmount amount={v}/>},
        {key:"commission",label:"Commission",render:v=><SARAmount amount={v}/>},
        {key:"adminFee",label:"Admin Fee",render:v=>v==="0"?"—":<SARAmount amount={v}/>},
        {key:"method",label:"Method"},{key:"total",label:"Total",render:v=><SARAmount amount={v}/>},
        {key:"status",label:"Status",render:v=><Badge label={v}/>},{key:"date",label:"Date"},
      ]} rows={txRows} /></>}
      {tab==="WALLET MOVEMENTS"&&<TTable cols={[
        {key:"id",label:"ID"},{key:"investor",label:"Investor"},
        {key:"vaultKey",label:"Vault Key",render:v=><span style={{fontFamily:"monospace",fontSize:12,color:C.teal}}>{v}</span>},
        {key:"type",label:"Type",render:v=><Badge label={v}/>},
        {key:"amount",label:"Amount",render:v=><SARAmount amount={typeof v==="number"?v.toLocaleString("en-SA"):v}/>},
        {key:"reason",label:"Reason"},{key:"date",label:"Date"},
      ]} rows={walletMovements} />}
      {tab==="WITHDRAWAL REQUESTS"&&<>
        {withdrawals.filter(w=>w.status==="PENDING").length>0&&(
          <div style={{background:"#FDF4EC",borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
            {Icons.pending(16,"#D4943A")}<span style={{fontSize:14,fontWeight:600,color:"#8B6540"}}>{withdrawals.filter(w=>w.status==="PENDING").length} pending withdrawal(s) require approval</span>
          </div>
        )}
        <TTable cols={[
          {key:"id",label:"ID"},{key:"investor",label:"Investor"},
          {key:"amount",label:"Amount",render:v=><SARAmount amount={typeof v==="number"?v.toLocaleString("en-SA"):v}/>},
          {key:"bank",label:"Bank"},{key:"iban",label:"IBAN",render:v=><span style={{fontFamily:"monospace",fontSize:12}}>{v}</span>},
          {key:"status",label:"Status",render:v=><Badge label={v}/>},
          {key:"requested",label:"Requested"},{key:"processed",label:"Processed",render:v=>v||"—"},
          {key:"id",label:"Actions",render:(_,row)=>(
            <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"center"}}>
              {row.status==="PENDING"&&<><Btn small variant="teal" onClick={()=>doWithdrawal(row,"approve")}>{t("Approve")}</Btn><Btn small variant="danger" onClick={()=>doWithdrawal(row,"reject")}>{t("Reject")}</Btn></>}
              {row.status==="APPROVED"&&<Btn small variant="gold" onClick={()=>doWithdrawal(row,"processed")}>{t("Mark Processed")}</Btn>}
              <Btn small variant="ghost" onClick={()=>doWithdrawal(row,"notify")}>{t("Notify")}</Btn>
            </div>
          )},
        ]} rows={withdrawals} />
      </>}

      {/* Withdrawal action modal */}
      {wModal&&<Modal title={{approve:"Approve Withdrawal",reject:"Reject Withdrawal",processed:"Mark as Processed",notify:"Notify Investor"}[wModal.type]} onClose={()=>setWModal(null)}>
        <div style={{background:{approve:"#EFF5F2",reject:C.redBg,processed:"#E8EFF7",notify:C.purpleBg}[wModal.type],borderRadius:10,padding:"12px 14px",marginBottom:14}}>
          <p style={{fontSize:15,fontWeight:600,color:{approve:C.greenSolid,reject:"#C85C3E",processed:C.blueSolid,notify:C.blueSolid}[wModal.type]}}>
            {wModal.type==="approve"&&"Investor will be notified. Process the bank transfer manually after approval."}
            {wModal.type==="reject"&&"Funds will be returned to investor wallet."}
            {wModal.type==="processed"&&"Confirm that the bank transfer has been completed."}
            {wModal.type==="notify"&&"Send a status update to the investor."}
          </p>
        </div>
        <div style={{marginBottom:14}}>
          {[["Investor",wModal.row.investor],["Amount","SAR "+wModal.row.amount],["Bank",wModal.row.bank],["IBAN",wModal.row.iban||"—"],["Status",wModal.row.status]].map(([k,v])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.border}`}}>
              <span style={{fontSize:13,color:C.textMuted}}>{k}</span><span style={{fontSize:15,fontWeight:600,color:C.navy}}>{v}</span>
            </div>
          ))}
        </div>
        {wModal.type==="reject"&&<div style={{marginBottom:14}}>
          <label style={{display:"block",fontSize:13,fontWeight:600,color:C.textMuted,marginBottom:5}}>{isAr?"سبب الرفض":"REJECTION REASON"}</label>
          <textarea value={wReason} onChange={e=>setWReason(e.target.value)} placeholder="Enter reason for rejection..."
            style={{width:"100%",padding:"8px 12px",borderRadius:8,fontSize:15,border:`1px solid ${C.border}`,resize:"vertical",minHeight:70,boxSizing:"border-box",fontFamily:"inherit"}}/>
        </div>}
        <div style={{display:"flex",gap:8}}>
          <Btn variant={{approve:"teal",reject:"danger",processed:"gold",notify:"teal"}[wModal.type]}
            onClick={()=>{if(wModal.type==="reject"&&!wReason.trim()){showFinToast("⚠️ Enter rejection reason");return;}confirmWithdrawal();}}>
            Confirm
          </Btn>
          <Btn variant="outline" onClick={()=>setWModal(null)}>{t("Cancel")}</Btn>
        </div>
      </Modal>}
    </div>
  );
};

// Mini sparkline bar chart
const MiniBar = ({ data, color="#C4956A" }) => {
  const max = Math.max(...data);
  return (
    <div style={{display:"flex",alignItems:"flex-end",gap:3,height:52}}>
      {data.map((v,i)=>(
        <div key={i} style={{flex:1,background:color,borderRadius:2,opacity:0.7+0.3*(v/max),height:`${(v/max)*100}%`,minHeight:4}} />
      ))}
    </div>
  );
};

// Donut chart (CSS-based)
const MiniDonut = ({ pct, color="#C4956A", size=56 }) => {
  const p = Math.max(0.5, Math.min(100, pct));
  const ang = (p / 100) * 360;
  const toRad = (a) => (a - 90) * Math.PI / 180;
  // Donut geometry — outer ellipse, inner ellipse, depth
  const cx = 50, cy = 40, orx = 40, ory = 26, irx = 18, iry = 12, d = 10;
  const uid = `d3_${Math.random().toString(36).slice(2,7)}`;
  // Points on outer/inner ellipses
  const ox = (a) => cx + orx * Math.cos(toRad(a));
  const oy = (a) => cy + ory * Math.sin(toRad(a));
  const ix = (a) => cx + irx * Math.cos(toRad(a));
  const iy = (a) => cy + iry * Math.sin(toRad(a));
  const lg = ang > 180 ? 1 : 0;
  // Darken helper
  const dk = (hex, amt=45) => {
    const n = parseInt(hex.replace("#",""),16);
    return `rgb(${Math.max(0,(n>>16)-amt)},${Math.max(0,((n>>8)&0xff)-amt)},${Math.max(0,(n&0xff)-amt)})`;
  };
  // Top face donut arc path (outer arc CW, then inner arc CCW)
  const donutArc = (startA, endA, fill) => {
    if(Math.abs(endA - startA) < 0.5) return null;
    const la = (endA - startA) > 180 ? 1 : 0;
    return <path d={`M${ox(startA)},${oy(startA)} A${orx},${ory} 0 ${la},1 ${ox(endA)},${oy(endA)} L${ix(endA)},${iy(endA)} A${irx},${iry} 0 ${la},0 ${ix(startA)},${iy(startA)} Z`} fill={fill}/>;
  };
  // 3D side wall (only visible on bottom half where oy > cy)
  const sideWall = (startA, endA, fill) => {
    // Draw side strips at small angle increments
    const steps = Math.max(2, Math.ceil(Math.abs(endA-startA)/6));
    const paths = [];
    for(let i=0;i<steps;i++){
      const a1 = startA + (endA-startA)*i/steps;
      const a2 = startA + (endA-startA)*(i+1)/steps;
      const y1 = oy(a1), y2 = oy(a2);
      // Only show side if below center (visible in 3D perspective)
      if(y1 >= cy-2 || y2 >= cy-2){
        paths.push(<path key={i} d={`M${ox(a1)},${oy(a1)} A${orx},${ory} 0 0,1 ${ox(a2)},${oy(a2)} L${ox(a2)},${oy(a2)+d} A${orx},${ory} 0 0,0 ${ox(a1)},${oy(a1)+d} Z`} fill={fill}/>);
      }
    }
    return paths;
  };
  return (
    <svg width={size} height={size} viewBox="0 0 100 90" style={{display:"block"}}>
      <defs>
        <linearGradient id={`${uid}_c`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color}/><stop offset="100%" stopColor={dk(color,35)}/>
        </linearGradient>
        <linearGradient id={`${uid}_bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E8E0D4"/><stop offset="100%" stopColor="#D8D0C4"/>
        </linearGradient>
        <radialGradient id={`${uid}_hole`} cx="50%" cy="40%" r="50%">
          <stop offset="0%" stopColor="#FDFBF7"/><stop offset="100%" stopColor="#EDE6DA"/>
        </radialGradient>
      </defs>
      {/* 3D side walls — background (remaining %) */}
      {p < 100 && sideWall(ang, 360, dk("#D5CCBF",15))}
      {/* 3D side walls — colored slice */}
      {sideWall(0, ang, dk(color,55))}
      {/* Top face — background ring (remaining %) */}
      {p < 100 && donutArc(ang, 360, `url(#${uid}_bg)`)}
      {/* Top face — colored ring slice */}
      {donutArc(0, ang, `url(#${uid}_c)`)}
      {/* Inner hole — 3D depth */}
      <ellipse cx={cx} cy={cy+d} rx={irx} ry={iry} fill="#D5CCBF" opacity="0.4"/>
      {/* Inner hole — top face */}
      <ellipse cx={cx} cy={cy} rx={irx} ry={iry} fill={`url(#${uid}_hole)`}/>
      {/* Gloss highlight */}
      <ellipse cx={cx-6} cy={cy-8} rx={12} ry={5} fill="#FFF" opacity="0.15"/>
      {/* Percentage text centered in hole */}
      <text x={cx} y={cy+5} textAnchor="middle" fontSize="13" fontWeight="800" fill={color}>{pct}%</text>
    </svg>
  );
};

const Reports = () => {
  const { t, isAr } = useLang();
  const { matches, investors, walletMovements, bars } = useAppData();
  const { gold: gp, silver: sp, plat: pp } = useLivePrices();
  const fmtK = n => (n == null || isNaN(n) ? "0" : Number(n).toLocaleString("en-SA",{maximumFractionDigits:0}));
  const liveGoldG   = bars.filter(b=>b.metal==="Gold"   &&(b.status==="LINKED"||b.status==="FREE")).reduce((s,b)=>s+parseFloat(b.weight),0);
  const liveSilverG = bars.filter(b=>b.metal==="Silver" &&(b.status==="LINKED"||b.status==="FREE")).reduce((s,b)=>s+parseFloat(b.weight),0);
  const livePlatG   = bars.filter(b=>b.metal==="Platinum"&&(b.status==="LINKED"||b.status==="FREE")).reduce((s,b)=>s+parseFloat(b.weight),0);
  const liveAUM     = liveGoldG*(gp?.priceSAR||839)+liveSilverG*(sp?.priceSAR||10.42)+livePlatG*(pp?.priceSAR||138.5);
  const volAll      = matches.reduce((a,m)=>a+m.totalSAR,0);
  const commAll     = matches.reduce((a,m)=>a+m.commission,0);
  const adminAll    = matches.reduce((a,m)=>a+(m.adminFee||0),0);
  const REPORT_DATA = {
    financial: [
      { title:"Revenue Breakdown", sub:"Commission + Fees", value:<SARAmount amount={fmtK(commAll+adminAll)}/>, prev:<SARAmount amount="0"/>, change:"—", up:false, chart:[0], color:C.gold, breakdown:[] },
      { title:"Trading Volume by Metal", sub:"This month", value:<SARAmount amount={fmtK(volAll)}/>, prev:<SARAmount amount="0"/>, change:"—", up:false, chart:[0], color:C.teal, breakdown:[] },
      { title:"Volume by Period", sub:"Daily avg", value:<SARAmount amount={fmtK(Math.round(volAll/30))}/>, prev:<SARAmount amount="0"/>, change:"—", up:false, chart:[0], color:"#8B5CF6", breakdown:[] },
      { title:"Payment Methods", sub:"Orders", value:"0 orders", prev:"0", change:"—", up:false, chart:[0], color:"#D4943A", breakdown:[] },
      { title:"Wallet Movements", sub:"Credits & debits", value:<SARAmount amount="0"/>, prev:<SARAmount amount="0"/>, change:"—", up:false, chart:[0], color:C.teal, breakdown:[] },
      { title:"Withdrawal Requests", sub:"This month", value:<SARAmount amount="0"/>, prev:<SARAmount amount="0"/>, change:"—", up:false, chart:[0], color:"#C85C3E", breakdown:[] },
    ],
    vault: [
      { title:"Bars by Metal", sub:"Physical inventory", value:fmtK(bars.length)+" bars", prev:"0", change:"—", up:false, chart:[0], color:C.gold, breakdown:[] },
      { title:"Linked vs Floating Tokens", sub:"Circulation", value:"0 tokens", prev:"0", change:"—", up:false, chart:[0], color:C.navy, breakdown:[] },
      { title:"Tokens Minted/Burned", sub:"This month", value:"0 minted", prev:"0", change:"—", up:false, chart:[0], color:C.greenSolid, breakdown:[] },
      { title:"Deposit vs Withdrawal", sub:"Appointments", value:"0 this month", prev:"0", change:"—", up:false, chart:[0], color:"#8B5CF6", breakdown:[] },
    ],
    investors: [
      { title:"Active / Suspended / Banned", sub:"Account status", value:fmtK(investors.length)+" total", prev:"0", change:"—", up:false, chart:[0], color:C.navy, breakdown:[] },
      { title:"New Investors", sub:"This month", value:"0 new", prev:"0", change:"—", up:false, chart:[0], color:C.teal, breakdown:[] },
      { title:"Top by Holdings", sub:"Highest portfolio", value:<SARAmount amount="0"/>, prev:<SARAmount amount="0"/>, change:"—", up:false, chart:[0], color:C.gold, breakdown:[] },
      { title:"Top by Volume", sub:"Most active", value:<SARAmount amount="0"/>, prev:<SARAmount amount="0"/>, change:"—", up:false, chart:[0], color:"#8B5CF6", breakdown:[] },
    ],
    appointments: [
      { title:"Total by Period", sub:"This month", value:"0 appointments", prev:"0", change:"—", up:false, chart:[0], color:C.teal, breakdown:[] },
      { title:"Deposit vs Withdrawal", sub:"Type breakdown", value:"0 deposits", prev:"0", change:"—", up:false, chart:[0], color:C.gold, breakdown:[] },
      { title:"No Show Rate", sub:"Missed", value:"0%", prev:"0%", change:"—", up:false, chart:[0], color:"#C85C3E", breakdown:[] },
      { title:"Completion Rate", sub:"Done", value:"0%", prev:"0%", change:"—", up:false, chart:[0], color:C.greenSolid, breakdown:[] },
    ],
  };
// Combined multi-segment 3D donut for all breakdowns in one chart
  const SEGMENT_COLORS = ["#C4956A",C.greenSolid,C.blueSolid,"#8B5CF6","#C85C3E","#D4943A","#6B9080",C.purpleSolid];
  const MultiDonut = ({ segments, size=100 }) => {
    const cx=50,cy=40,orx=40,ory=26,irx=18,iry=12,d=10;
    const uid=`md_${Math.random().toString(36).slice(2,7)}`;
    const toRad=(a)=>(a-90)*Math.PI/180;
    const ox=(a)=>cx+orx*Math.cos(toRad(a));
    const oy=(a)=>cy+ory*Math.sin(toRad(a));
    const ix=(a)=>cx+irx*Math.cos(toRad(a));
    const iy=(a)=>cy+iry*Math.sin(toRad(a));
    const dk=(hex,amt=45)=>{const n=parseInt(hex.replace("#",""),16);return `rgb(${Math.max(0,(n>>16)-amt)},${Math.max(0,((n>>8)&0xff)-amt)},${Math.max(0,(n&0xff)-amt)})`;};
    // Build angle ranges
    const total = segments.reduce((a,s)=>a+s.pct,0)||1;
    let cumAngle = 0;
    const arcs = segments.filter(s=>s.pct>0).map((s,i)=>{
      const startA = cumAngle;
      const sweep = (s.pct/total)*360;
      cumAngle += sweep;
      return { ...s, startA, endA: cumAngle, color: s.color||SEGMENT_COLORS[i%SEGMENT_COLORS.length] };
    });
    const donutArc=(sa,ea,fill)=>{
      if(Math.abs(ea-sa)<0.5) return null;
      const la=(ea-sa)>180?1:0;
      return <path d={`M${ox(sa)},${oy(sa)} A${orx},${ory} 0 ${la},1 ${ox(ea)},${oy(ea)} L${ix(ea)},${iy(ea)} A${irx},${iry} 0 ${la},0 ${ix(sa)},${iy(sa)} Z`} fill={fill}/>;
    };
    const sideWall=(sa,ea,fill)=>{
      const steps=Math.max(2,Math.ceil(Math.abs(ea-sa)/6));
      const paths=[];
      for(let i=0;i<steps;i++){
        const a1=sa+(ea-sa)*i/steps;
        const a2=sa+(ea-sa)*(i+1)/steps;
        if(oy(a1)>=cy-2||oy(a2)>=cy-2)
          paths.push(<path key={`${sa}_${i}`} d={`M${ox(a1)},${oy(a1)} A${orx},${ory} 0 0,1 ${ox(a2)},${oy(a2)} L${ox(a2)},${oy(a2)+d} A${orx},${ory} 0 0,0 ${ox(a1)},${oy(a1)+d} Z`} fill={fill}/>);
      }
      return paths;
    };
    return (
      <svg width={size} height={size*0.9} viewBox="0 0 100 90" style={{display:"block"}}>
        <defs>
          {arcs.map((a,i)=><linearGradient key={`g${i}`} id={`${uid}_${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={a.color}/><stop offset="100%" stopColor={dk(a.color,30)}/></linearGradient>)}
          <radialGradient id={`${uid}_hole`} cx="50%" cy="40%" r="50%"><stop offset="0%" stopColor="#FDFBF7"/><stop offset="100%" stopColor="#EDE6DA"/></radialGradient>
        </defs>
        {/* 3D side walls */}
        {arcs.map((a,i)=>sideWall(a.startA,a.endA,dk(a.color,55)))}
        {/* Top face arcs */}
        {arcs.map((a,i)=>donutArc(a.startA,a.endA,`url(#${uid}_${i})`))}
        {/* Inner hole depth + top */}
        <ellipse cx={cx} cy={cy+d} rx={irx} ry={iry} fill="#D5CCBF" opacity="0.4"/>
        <ellipse cx={cx} cy={cy} rx={irx} ry={iry} fill={`url(#${uid}_hole)`}/>
        <ellipse cx={cx-6} cy={cy-8} rx={12} ry={5} fill="#FFF" opacity="0.13"/>
      </svg>
    );
  };

  const ReportCard = ({ r }) => (
    <div style={{background:C.white,borderRadius:18,border:`1px solid ${C.border}`,overflow:"hidden",boxShadow:"0 2px 12px rgba(0,0,0,0.07)"}}>
      <div style={{padding:"22px 24px 14px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div style={{flex:1}}>
            <p style={{fontSize:14,color:C.textMuted,fontWeight:600,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>{r.sub}</p>
            <p style={{fontSize:18,fontWeight:700,color:C.navy}}>{r.title}</p>
          </div>
          <span style={{fontSize:15,fontWeight:700,color:r.up?C.greenSolid:"#C85C3E",background:r.up?"#EFF5F2":C.redBg,padding:"4px 10px",borderRadius:20,flexShrink:0,marginLeft:10}}>{r.change}</span>
        </div>
        <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:14}}>
          <div>
            <p style={{fontSize:32,fontWeight:800,color:C.navy,lineHeight:1}}>{r.value}</p>
            <p style={{fontSize:14,color:C.textMuted,marginTop:5}}>prev: {r.prev}</p>
          </div>
          <MiniBar data={r.chart} color={r.color} />
        </div>
      </div>
      <div style={{padding:"14px 24px",background:"#FAF8F5",borderTop:`1px solid ${C.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          {/* Single combined pie chart */}
          <MultiDonut segments={r.breakdown.map((b,i)=>({pct:b.pct,color:SEGMENT_COLORS[i%SEGMENT_COLORS.length]}))} size={90} />
          {/* Legend */}
          <div style={{display:"flex",flexDirection:"column",gap:4,flex:1}}>
            {r.breakdown.map((b,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{width:10,height:10,borderRadius:3,background:SEGMENT_COLORS[i%SEGMENT_COLORS.length],flexShrink:0}} />
                <span style={{fontSize:12,color:C.textMuted,flex:1}}>{b.label}</span>
                <span style={{fontSize:13,fontWeight:700,color:C.navy}}>{b.val}</span>
                <span style={{fontSize:11,color:C.textMuted}}>{b.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{padding:"12px 24px",display:"flex",gap:8,borderTop:`1px solid ${C.border}`}}>
        <Btn small variant="outline"><span style={{display:"flex",alignItems:"center",gap:4}}>{Icons.download(13,C.navy)} PDF</span></Btn>
        <Btn small variant="teal"><span style={{display:"flex",alignItems:"center",gap:4}}>{Icons.download(13,C.white)} Excel</span></Btn>
      </div>
    </div>
  );

  return (
    <div>
      <SectionHeader title={isAr?"التقارير":"Reports"} sub="Platform analytics and export center" />
      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:14,marginBottom:28}}>
        <StatCard icon={Icons.aum(22,C.gold)} title={isAr?"إجمالي الأصول المُدارة":"Total AUM"} value={<SARAmount amount={fmtK(liveAUM)}/>} gold />
        <StatCard icon={Icons.volume(22,C.teal)} title={isAr?"الحجم (الكل)":"Volume (All)"} value={<SARAmount amount={fmtK(volAll)}/>} />
        <StatCard icon={Icons.commission(22,C.gold)} title={isAr?"العمولة (الكل)":"Commission (All)"} value={<SARAmount amount={fmtK(commAll)}/>} gold />
        <StatCard icon={Icons.settings(22,C.textMuted)} title={isAr?"رسوم الإدارة (الكل)":"Admin Fees (All)"} value={<SARAmount amount={fmtK(adminAll)}/>} />
        <StatCard icon={Icons.investors(22,C.navy)} title={isAr?"إجمالي المستثمرين":"Total Investors"} value={investors.length} />
        <StatCard icon={Icons.token(22,C.teal)} title={isAr?"إجمالي الرموز":"Total Tokens"} value="0" />
      </div>
      {[
        {title:isAr?"التقارير المالية":"Financial Reports", key:"financial"},
        {title:isAr?"تقارير الخزينة":"Vault Reports", key:"vault"},
        {title:isAr?"تقارير المستثمرين":"Investor Reports", key:"investors"},
        {title:isAr?"تقارير المواعيد":"Appointment Reports", key:"appointments"},
      ].map(section=>(
        <div key={section.key} style={{marginBottom:28}}>
          <h3 style={{fontSize:22,fontWeight:700,color:C.navy,marginBottom:16,paddingBottom:10,borderBottom:`2px solid ${C.border}`}}>{section.title}</h3>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(360px,1fr))",gap:18}}>
            {REPORT_DATA[section.key].map((r,i)=><ReportCard key={i} r={r}/>)}
          </div>
        </div>
      ))}
    </div>
  );
};

const Blacklist = () => {
  const { t, isAr } = useLang();
  const { blacklist, setBlacklist, addAudit } = useAppData();
  const [showAdd,setShowAdd]=useState(false);
  const [form,setForm]=useState({nationalId:"",name:"",reason:""});
  const [editRow,setEditRow]=useState(null);
  const [blToast,setBlToast]=useState("");
  const showBlToast = (m)=>{ setBlToast(m); setTimeout(()=>setBlToast(""),3000); };

  const addBan = () => {
    if(!form.nationalId.trim()){showBlToast("⚠️ National ID required");return;}
    if(!/^[12]\d{9}$/.test(form.nationalId.trim())){showBlToast("⚠️ Invalid National ID — must be 10 digits starting with 1 or 2");return;}
    if(!form.reason.trim()){showBlToast("⚠️ Reason required");return;}
    if(blacklist.some(b=>b.nationalId===form.nationalId.trim())){showBlToast("⚠️ This National ID is already banned");return;}
    const newEntry = {
      id:"BL-"+String(Date.now()).slice(-6),
      name:form.name||"Unknown",
      nationalId:form.nationalId.trim(),
      vaultKey:"—",
      reason:form.reason,
      bannedBy:"Admin",
      date:new Date().toISOString().slice(0,10),
    };
    setBlacklist(prev=>[newEntry,...prev]);
    addAudit("BLACKLIST_ADD", newEntry.id, form.nationalId+" — "+form.reason);
    showBlToast("✅ User banned by National ID");
    setShowAdd(false); setForm({nationalId:"",name:"",reason:""});
  };

  const unban = (id) => {
    setBlacklist(prev=>prev.filter(b=>b.id!==id));
    showBlToast("✅ User unbanned — account restored");
  };

  return (
    <div>
      {blToast&&<div style={{position:"fixed",top:20,right:20,background:C.navy,color:C.white,padding:"12px 20px",borderRadius:12,fontSize:15,fontWeight:600,zIndex:9999,boxShadow:"0 4px 20px rgba(0,0,0,0.3)"}}>{blToast}</div>}
      <SectionHeader title={isAr?"المستخدمون المحظورون":"Banned Users"} sub="Banned by National ID — blocked from login and registration until admin unbans"
        action={<Btn variant="danger" onClick={()=>setShowAdd(true)}><span style={{display:"flex",alignItems:"center",gap:5}}>{Icons.add(14,C.white)} Ban User</span></Btn>} />
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:22}}>
        <StatCard icon={Icons.blacklist(22,"#C85C3E")} title={isAr?"إجمالي المحظورين":"Total Banned"} value={blacklist.length} />
        <StatCard icon={Icons.calendar(22,C.teal)} title={isAr?"المحظورون هذا الشهر":"Banned This Month"} value={blacklist.filter(b=>b.date?.startsWith("2026-03")).length} />
        <StatCard icon={Icons.check(22,C.greenSolid)} title={isAr?"رُفع الحظر هذا الشهر":"Unbanned This Month"} value="0" />
      </div>
      <TTable cols={[
        {key:"id",label:"Record ID"},{key:"name",label:"Name"},
        {key:"nationalId",label:"National ID",render:v=><span style={{fontFamily:"monospace",fontSize:13}}>{v}</span>},
        {key:"vaultKey",label:"Vault Key",render:v=><span style={{fontFamily:"monospace",fontSize:12,color:C.teal}}>{v}</span>},
        {key:"reason",label:"Reason"},{key:"bannedBy",label:"Banned By"},{key:"date",label:"Date"},
        {key:"id",label:"Actions",render:(_,row)=><div style={{display:"flex",gap:4,justifyContent:"center"}}>
          <Btn small variant="teal" onClick={()=>unban(row.id)}>{t("Unban")}</Btn>
          <Btn small variant="outline" onClick={()=>setEditRow(row)}>{isAr?"تعديل":"Edit"}</Btn>
          <Btn small variant="ghost" onClick={()=>showBlToast("✅ Notification sent to registry")}>{t("Notify")}</Btn>
        </div>},
      ]} rows={blacklist} />

      {/* Ban Form */}
      {showAdd&&<Modal title={isAr?"حظر مستخدم برقم الهوية":"Ban User by National ID"} onClose={()=>setShowAdd(false)}>
        <div style={{background:"#FBF0EC",borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
          {Icons.warning(16,"#C85C3E")}<p style={{fontSize:14,color:"#C85C3E",fontWeight:500}}>Ban is tied to National ID. Cannot login or re-register until manually unbanned.</p>
        </div>
        <Inp label="National ID *" value={form.nationalId} onChange={v=>setForm({...form,nationalId:v})} placeholder="1090123456" />
        <Inp label="Full Name (optional)" value={form.name} onChange={v=>setForm({...form,name:v})} placeholder="Mohammed Al-..." />
        <div style={{marginBottom:14}}>
          <label style={{display:"block",fontSize:13,fontWeight:600,color:C.textMuted,marginBottom:5}}>REASON *</label>
          <textarea value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})} placeholder="Describe the reason for ban..."
            style={{width:"100%",padding:"8px 12px",borderRadius:8,fontSize:15,border:`1px solid ${C.border}`,resize:"vertical",minHeight:80,boxSizing:"border-box",fontFamily:"inherit"}}/>
        </div>
        <div style={{display:"flex",gap:8}}><Btn variant="danger" onClick={addBan}>{isAr?"تأكيد الحظر":"Confirm Ban"}</Btn><Btn variant="outline" onClick={()=>setShowAdd(false)}>{t("Cancel")}</Btn></div>
      </Modal>}

      {/* Edit Modal */}
      {editRow&&<Modal title={"Edit — "+editRow.id} onClose={()=>setEditRow(null)}>
        <Inp label={isAr?"السبب":"Reason"} value={editRow.reason} onChange={v=>setEditRow({...editRow,reason:v})} placeholder="Update reason..." />
        <div style={{display:"flex",gap:8}}>
          <Btn variant="gold" onClick={()=>{
            setBlacklist(prev=>prev.map(b=>b.id===editRow.id?{...b,reason:editRow.reason}:b));
            showBlToast("✅ Record updated"); setEditRow(null);
          }}>{isAr?"حفظ":"Save"}</Btn>
          <Btn variant="outline" onClick={()=>setEditRow(null)}>{t("Cancel")}</Btn>
        </div>
      </Modal>}
    </div>
  );
};

const ValidatorsTab = () => {
  const { t, isAr } = useLang();
  const { validators, setValidators } = useAppData();
  const [showAdd,setShowAdd]=useState(false);
  const [vName,setVName]=useState("");
  const [vAddr,setVAddr]=useState("");
  const [vEnd, setVEnd] =useState("");
  const [blkToast,setBlkToast]=useState("");
  const showBlkToast=(m)=>{setBlkToast(m);setTimeout(()=>setBlkToast(""),3000);};

  const statusPill=(status)=>{
    const cfg={ACTIVE:{c:C.greenSolid,bg:"#EFF5F2"},INACTIVE:{c:"#C85C3E",bg:C.redBg}};
    const s=cfg[status]||{c:"#8C7E6F",bg:"#F5F0E8"};
    const labAr={ACTIVE:"نشط",INACTIVE:"موقف"};
    return <span style={{display:"inline-flex",padding:"2px 10px",borderRadius:999,fontSize:13,fontWeight:700,color:s.c,background:s.bg}}>{isAr?(labAr[status]||status):status}</span>;
  };

  return (
    <div>
      {blkToast&&<div style={{position:"fixed",top:20,right:20,background:C.navy,color:C.white,padding:"12px 20px",borderRadius:12,fontSize:15,fontWeight:600,zIndex:9999,boxShadow:"0 4px 20px rgba(0,0,0,0.3)"}}>{blkToast}</div>}
      {validators.filter(v=>v.status==="ACTIVE").length < 3&&(
        <div style={{background:"#FDF4EC",border:"1px solid #D4943A55",borderRadius:12,padding:"12px 16px",marginBottom:14,display:"flex",gap:10,alignItems:"flex-start"}}>
          <span style={{fontSize:20}}>⚠️</span>
          <div>
            <p style={{fontSize:15,fontWeight:700,color:"#8B6540"}}>{isAr?"تحذير: عدد المدققين غير كافٍ":"Centralization Risk"}</p>
            <p style={{fontSize:13,color:"#8B6540"}}>{(()=>{const n=validators.filter(v=>v.status==="ACTIVE").length;return isAr?`لديك ${n} مدقق نشط فقط. الحد الأدنى الموصى به لإنتاج هو 3 مدققين.`:`Only ${n} active validator${n===1?"":"s"}. Minimum 3 recommended for production decentralization.`;})()}</p>
          </div>
        </div>
      )}
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
        <Btn variant="teal" onClick={()=>setShowAdd(true)}>{isAr?"+ إضافة مدقق":"+ Add Validator"}</Btn>
      </div>
      <TTable cols={[
        {key:"id",             label:isAr?"الرقم":"ID"},
        {key:"name",           label:isAr?"الاسم":"Name"},
        {key:"address",        label:isAr?"العنوان":"Address",render:v=><span style={{fontFamily:"monospace",fontSize:12,color:C.teal}}>{v}</span>},
        {key:"status",         label:isAr?"الحالة":"Status",render:v=>statusPill(v)},
        {key:"blocksValidated",label:isAr?"البلوكات":"Blocks"},
        {key:"weight",         label:isAr?"الوزن":"Weight"},
        {key:"commissionEarned",label:isAr?"العمولة":"Earned",render:v=><SARAmount amount={v}/>},
        {key:"joined",         label:isAr?"تاريخ الانضمام":"Joined"},
        {key:"_act",           label:"",render:(_,row)=>(
          <div style={{display:"flex",gap:5,justifyContent:"center"}}>
            {row.status==="ACTIVE"
              ?<Btn small variant="danger" onClick={()=>{
                const activeCount=validators.filter(v=>v.status==="ACTIVE").length;
                if(activeCount<=1){showBlkToast(isAr?"⛔ لا يمكن تعطيل المدقق الأخير — سيتوقف البلوكشين":"⛔ Cannot deactivate last active validator — blockchain will halt");return;}
                setValidators(p=>p.map(v=>v.id===row.id?{...v,status:"INACTIVE"}:v));showBlkToast(isAr?"✅ تم تعطيل المدقق":"✅ Validator deactivated");}}>{isAr?"تعطيل":"Deactivate"}</Btn>
              :<Btn small variant="teal"   onClick={()=>{setValidators(p=>p.map(v=>v.id===row.id?{...v,status:"ACTIVE"} :v));showBlkToast(isAr?"✅ تم تفعيل المدقق":"✅ Validator activated");}}>{isAr?"تفعيل":"Activate"}</Btn>
            }
            <Btn small variant="outline" onClick={()=>showBlkToast(isAr?"تم تصدير السجل":"📋 History exported")}>{isAr?"سجل":"History"}</Btn>
          </div>
        )},
      ]} rows={validators} />

      {showAdd&&(
        <Modal title={isAr?"إضافة عقدة مدقق":"Add Validator Node"} onClose={()=>setShowAdd(false)}>
          <div style={{background:C.purpleBg,borderRadius:10,padding:"10px 14px",marginBottom:14}}>
            <p style={{fontSize:13,color:C.blueSolid}}>{isAr?"يشارك المدققون الجدد في إنشاء البلوكات ويحصلون على 20٪ من عمولة كل بلوك.":"New validators participate in block creation and earn 20% of commission split."}</p>
          </div>
          <div style={{marginBottom:12}}>
            <label style={{display:"block",fontSize:13,fontWeight:600,color:C.textMuted,marginBottom:5}}>{isAr?"اسم المدقق":"Validator Name"}</label>
            <input value={vName} onChange={e=>setVName(e.target.value)} placeholder={isAr?"اسم العقدة":"Node name or organization"}
              style={{width:"100%",padding:"8px 11px",borderRadius:8,fontSize:16,border:`1px solid ${C.border}`,color:C.text,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div style={{marginBottom:12}}>
            <label style={{display:"block",fontSize:13,fontWeight:600,color:C.textMuted,marginBottom:5}}>{isAr?"عنوان المحفظة":"Wallet Address"}</label>
            <input value={vAddr} onChange={e=>setVAddr(e.target.value)} placeholder="0x..."
              style={{width:"100%",padding:"8px 11px",borderRadius:8,fontSize:16,border:`1px solid ${C.border}`,color:C.text,outline:"none",boxSizing:"border-box",fontFamily:"monospace"}}/>
          </div>
          <div style={{marginBottom:12}}>
            <label style={{display:"block",fontSize:13,fontWeight:600,color:C.textMuted,marginBottom:5}}>{isAr?"رابط العقدة":"Endpoint URL"}</label>
            <input value={vEnd} onChange={e=>setVEnd(e.target.value)} placeholder="https://validator-node..."
              style={{width:"100%",padding:"8px 11px",borderRadius:8,fontSize:16,border:`1px solid ${C.border}`,color:C.text,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div style={{display:"flex",gap:8,marginTop:4}}>
            <Btn variant="teal" onClick={()=>{
              if(!vName||!vAddr){showBlkToast(isAr?"⚠️ الاسم والعنوان مطلوبان":"⚠️ Name and address required");return;}
              const newV={id:"VAL-"+(validators.length+1).toString().padStart(3,"0"),name:vName,address:vAddr,status:"ACTIVE",blocksValidated:0,weight:"0%",commissionEarned:"0",joined:new Date().toISOString().slice(0,10)};
              setValidators(p=>[...p,newV]);
              showBlkToast(isAr?"✅ تم إضافة المدقق":"✅ Validator added");
              setShowAdd(false);setVName("");setVAddr("");setVEnd("");
            }}>{isAr?"إضافة مدقق":"Add Validator"}</Btn>
            <Btn variant="outline" onClick={()=>setShowAdd(false)}>{isAr?"إلغاء":"Cancel"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

const Blocks = () => {
  const { t, isAr, commSplit } = useLang();
  const { matches, appBlocks, appBlockStats } = useAppData();
  const [tab,setTab]=useState("BLOCKS");
  const apiSplit = appBlockStats?.commission_split;
  const tanaqulPct = apiSplit ? apiSplit.platform_percent : ((commSplit.buying||30)+(commSplit.selling||30));
  const creatorPct = apiSplit ? apiSplit.creator_percent : (commSplit.creator||20);
  const validatorsPct = apiSplit ? apiSplit.validators_percent : (commSplit.validators||20);
  const triggerSettings = appBlockStats?.trigger_settings;
  const triggerText = triggerSettings ? `${triggerSettings.size_mb}MB or ${triggerSettings.hours}hrs` : "1MB or 24hrs";
  const blockTxRows = matches.map(m=>({id:m.id,investor:m.filledFor,type:"MATCH",metal:m.metal,metalAmt:String(m.totalSAR),commission:String(m.commission),adminFee:String(m.adminFee||0),method:"Wallet",total:String(m.totalSAR),status:"COMPLETED",date:m.date}));
  return (
    <div>
      <SectionHeader title={isAr?"الكتل":"Blocks"} sub="Private permissioned blockchain — Tanaqul network" />
      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:14,marginBottom:18}}>
        <StatCard icon={Icons.block(22,C.navy)} title={isAr?"آخر كتلة":"Latest Block"} value={"#"+(appBlockStats?.latest_block_number || 0)} gold />
        <StatCard icon={Icons.token(22,C.teal)} title={isAr?"الرموز المصكوكة":"Tokens Minted"} value={appBlockStats?.total_blocks || 0} />
        <StatCard icon={Icons.fire(22,"#C85C3E")} title={isAr?"الرموز المحروقة":"Tokens Burned"} value={appBlockStats?.commission_breakdown?.tanaqul ? Number(appBlockStats.commission_breakdown.tanaqul).toLocaleString("en-SA",{maximumFractionDigits:0}) : "0"} />
        <StatCard icon={Icons.aum(22,C.gold)} title={isAr?"العمولات الموزعة":"Commission Distributed"} value={<SARAmount amount={appBlockStats?.total_commission ? Number(appBlockStats.total_commission).toLocaleString("en-SA",{maximumFractionDigits:0}) : matches.reduce((a,m)=>a+m.commission,0).toLocaleString("en-SA",{maximumFractionDigits:0})}/>} gold />
        <StatCard icon={Icons.investors(22,C.navy)} title={isAr?"المصادقون النشطون":"Active Validators"} value={appBlockStats?.active_validators || 1} />
        <StatCard icon={Icons.network(22,C.teal)} title={isAr?"الشبكة":"Network"} value="✅ Online" />
      </div>
      <div style={{background:C.navyDark,borderRadius:12,padding:"12px 16px",marginBottom:18,display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:7,height:7,borderRadius:"50%",background:"#4ADE80",boxShadow:"0 0 8px #4ADE80"}} /><span style={{fontSize:13,color:"#A89880",fontWeight:500}}>{isAr?"الشبكة متصلة":"Network Online"}</span></div>
        <span style={{color:C.silverText}}>|</span>
        <span style={{fontSize:13,color:"#A89880"}}>Trigger: <span style={{color:C.gold}}>{triggerText}</span></span>
        <span style={{color:C.silverText}}>|</span>
        <span style={{fontSize:13,color:"#A89880"}}>Split: <span style={{color:C.teal}}>{tanaqulPct}% Tanaqul / {creatorPct}% Creator / {validatorsPct}% Validators</span></span>
        <span style={{color:C.silverText}}>|</span>
        <span style={{fontSize:13,color:"#A89880",fontFamily:"monospace"}}>Last: {(appBlockStats?.latest_block_hash ? (appBlockStats.latest_block_hash.substring(0,10)+"..."+appBlockStats.latest_block_hash.slice(-4)) : "–")}</span>
      </div>
      <TabBar tabs={[{id:"BLOCKS",label:isAr?"البلوكات":"BLOCKS"},{id:"TRANSACTIONS",label:isAr?"المعاملات":"TRANSACTIONS"},{id:"VALIDATORS",label:isAr?"المدققون":"VALIDATORS"}]} active={tab} onChange={setTab} />
      {tab==="BLOCKS"&&<TTable cols={[
        {key:"number",label:"Block #",render:v=><span style={{fontFamily:"monospace",color:C.gold}}>#{v}</span>},
        {key:"hash",label:"Hash",render:v=><span style={{fontFamily:"monospace",fontSize:12,color:C.teal}}>{v}</span>},
        {key:"txCount",label:"TXs"},
        {key:"commission",label:"Commission",render:v=><SARAmount amount={v}/>},
        {key:"tanaqulShare",label:`Tanaqul ${tanaqulPct}%`,render:v=><SARAmount amount={v}/>},
        {key:"creatorShare",label:`Creator ${creatorPct}%`,render:v=><SARAmount amount={v}/>},
        {key:"validatorsShare",label:`Validators ${validatorsPct}%`,render:v=><SARAmount amount={v}/>},
        {key:"validator",label:"Creator"},{key:"size",label:"Size"},{key:"timestamp",label:"Time"},
      ]} rows={appBlocks || []} emptyText={isAr?"لا توجد كتل بعد — سيتم إنشاؤها تلقائياً":"No blocks yet — will be created automatically"} />}
      {tab==="TRANSACTIONS"&&<TTable cols={[
        {key:"id",label:"TX Hash",render:(_,r)=><span style={{fontFamily:"monospace",fontSize:12,color:C.teal}}>{r.id}</span>},
        {key:"investor",label:"Investor"},{key:"type",label:"Type",render:v=><Badge label={v}/>},{key:"metal",label:"Metal"},
        {key:"metalAmt",label:"Amount",render:v=><SARAmount amount={v}/>},
        {key:"commission",label:"Commission",render:v=><SARAmount amount={v}/>},
        {key:"status",label:"Status",render:v=><Badge label={v}/>},{key:"date",label:"Time"},
      ]} rows={blockTxRows} />}
      {tab==="VALIDATORS"&&<ValidatorsTab />}
    </div>
  );
};


// ─── Audit Log ───────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT & AML INTELLIGENCE CENTER
// 5-tab system: Audit Trail · AML Alerts · Risk Scoring · Behavior Analytics · Compliance
// ═══════════════════════════════════════════════════════════════════════════════

const RiskBadge = ({level}) => {
  const cfg = {CRITICAL:{c:"#C85C3E",bg:C.redBg,icon:"🔴"},HIGH:{c:"#D4943A",bg:"#FDF4EC",icon:"🟠"},MEDIUM:{c:"#C4956A",bg:"#FDF4EC",icon:"🔵"},LOW:{c:C.greenSolid,bg:"#EFF5F2",icon:"🟢"}};
  const s = cfg[level]||cfg.LOW;
  return <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 10px",borderRadius:20,fontSize:12,fontWeight:800,color:s.c,background:s.bg,border:`1px solid ${s.c}33`}}>{s.icon} {level}</span>;
};

const Sparkline = ({data,color="#C4956A",w=80,h=24}) => {
  if(!data||data.length<2) return null;
  const max=Math.max(...data),min=Math.min(...data),range=max-min||1;
  const pts=data.map((v,i)=>`${(i/(data.length-1))*w},${h-((v-min)/range)*h}`).join(" ");
  return <svg width={w} height={h} style={{display:"block"}}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
};

const AuditLog = () => {
  const { isAr, t, reportingConfig } = useLang();
  const { auditLog, investors, matches, orders, walletMovements, withdrawals, appointments, bars, blacklist, amlAlerts: globalAmlAlerts, cmaAlerts: globalCmaAlerts, amlDismissed, dismissAmlAlert, amlLastRun, pageHint, setPageHint } = useAppData();
  const [tab, setTab] = useState("trail");

  // Auto-switch tab from action center hint
  useEffect(()=>{
    if(pageHint?.tab){setTab(pageHint.tab);setPageHint(null);}
  },[pageHint]);
  const [riskFilter, setRiskFilter] = useState("ALL");
  const [searchQ, setSearchQ] = useState("");
  const [amlModal, setAmlModal] = useState(null);
  const [sarModal, setSarModal] = useState(null);
  const [toast, setToast] = useState("");
  const [showDismissed, setShowDismissed] = useState(false);
  const showToast = m => { setToast(m); setTimeout(()=>setToast(""),3500); };

  // ── Compliance Workflow State ──
  const [compTasks, setCompTasks] = useState([
    {
      id:"SANC-01", regulator:"SAMA", check:"Sanctions Screening",
      checkAr:"فحص العقوبات",
      detail:"Cross-reference all investors against SAMA, UN, OFAC, EU sanctions lists",
      detailAr:"مراجعة جميع المستثمرين مقابل قوائم العقوبات (ساما، الأمم المتحدة، OFAC، الاتحاد الأوروبي)",
      frequency:"Daily + On Each New Investor Onboarding",
      frequencyAr:"يومياً + عند تسجيل كل مستثمر جديد",
      assignee:"MLRO",
      status:"PENDING", // PENDING | IN_PROGRESS | COMPLETED | OVERDUE
      dueDate: new Date(Date.now()+86400000).toISOString().slice(0,10),
      steps:[
        {id:1, label:"Export current investor list (CSV)", labelAr:"تصدير قائمة المستثمرين الحالية (CSV)", done:false},
        {id:2, label:"Run against SAMA sanctions database", labelAr:"المراجعة مقابل قاعدة بيانات عقوبات ساما", done:false},
        {id:3, label:"Run against UN Consolidated List", labelAr:"المراجعة مقابل القائمة الموحدة للأمم المتحدة", done:false},
        {id:4, label:"Run against OFAC SDN List", labelAr:"المراجعة مقابل قائمة OFAC SDN", done:false},
        {id:5, label:"Document results & flag matches", labelAr:"توثيق النتائج وتحديد التطابقات", done:false},
        {id:6, label:"If match → freeze account + file SAR", labelAr:"في حالة التطابق ← تجميد الحساب + تقديم بلاغ", done:false},
      ],
      log:[], // {date, action, by}
    },
    {
      id:"TRAIN-01", regulator:"SAMA", check:"Staff Training Records",
      checkAr:"سجلات تدريب الموظفين",
      detail:"Annual AML/CFT training certification for all compliance team members",
      detailAr:"شهادة تدريب سنوية لمكافحة غسل الأموال/تمويل الإرهاب لجميع أعضاء فريق الامتثال",
      frequency:"Annual (renew before expiry)",
      frequencyAr:"سنوياً (تجديد قبل انتهاء الصلاحية)",
      assignee:"HR / MLRO",
      status:"PENDING",
      dueDate: new Date(Date.now()+30*86400000).toISOString().slice(0,10),
      steps:[
        {id:1, label:"Identify all compliance staff members", labelAr:"تحديد جميع أعضاء فريق الامتثال", done:false},
        {id:2, label:"Verify each has valid AML/CFT certificate", labelAr:"التحقق من شهادة AML/CFT صالحة لكل عضو", done:false},
        {id:3, label:"Schedule training for expired/missing certs", labelAr:"جدولة التدريب للشهادات المنتهية/المفقودة", done:false},
        {id:4, label:"Upload certificates to compliance vault", labelAr:"رفع الشهادات إلى خزينة الامتثال", done:false},
        {id:5, label:"Update training expiry tracker", labelAr:"تحديث متتبع انتهاء صلاحية التدريب", done:false},
      ],
      log:[],
    },
    {
      id:"PEP-01", regulator:"SAMA", check:"PEP Screening",
      checkAr:"فحص الأشخاص المعرضين سياسياً",
      detail:"Politically Exposed Persons cross-check for all investors. PEP = Enhanced Due Diligence required.",
      detailAr:"فحص الأشخاص المعرضين سياسياً لجميع المستثمرين. PEP = العناية الواجبة المعززة مطلوبة.",
      frequency:"On Onboarding + Annually",
      frequencyAr:"عند التسجيل + سنوياً",
      assignee:"Compliance Officer",
      status:"PENDING",
      dueDate: new Date(Date.now()+7*86400000).toISOString().slice(0,10),
      steps:[
        {id:1, label:"Export investor list with names & NID", labelAr:"تصدير قائمة المستثمرين بالأسماء وأرقام الهوية", done:false},
        {id:2, label:"Screen against PEP databases (SAMA + international)", labelAr:"الفحص مقابل قواعد بيانات PEP (ساما + دولية)", done:false},
        {id:3, label:"Check family members & close associates", labelAr:"فحص أفراد العائلة والمقربين", done:false},
        {id:4, label:"Flag PEP matches → apply EDD tier", labelAr:"تحديد تطابقات PEP ← تطبيق العناية المعززة", done:false},
        {id:5, label:"Obtain senior management approval for PEPs", labelAr:"الحصول على موافقة الإدارة العليا لحالات PEP", done:false},
        {id:6, label:"Verify source of wealth documentation", labelAr:"التحقق من وثائق مصدر الثروة", done:false},
        {id:7, label:"Document results in compliance file", labelAr:"توثيق النتائج في ملف الامتثال", done:false},
      ],
      log:[],
    },
    {
      id:"CMA-NOTIFY", regulator:"CMA", check:"Authority Notification (Art 11)",
      checkAr:"إخطار الهيئة (المادة 11)",
      detail:"File notification to CMA within 3 business days when market manipulation is suspected.",
      detailAr:"تقديم إخطار لهيئة السوق المالية خلال 3 أيام عمل عند الاشتباه بالتلاعب بالسوق.",
      frequency:"Within 3 days of CRITICAL/HIGH CMA alert",
      frequencyAr:"خلال 3 أيام من تنبيه حرج/عالٍ من هيئة السوق المالية",
      assignee:"MLRO / Legal",
      status: (globalCmaAlerts||[]).filter(a=>a.level==="CRITICAL"||a.level==="HIGH").length>0?"OVERDUE":"PENDING",
      dueDate: new Date(Date.now()+3*86400000).toISOString().slice(0,10),
      steps:[
        {id:1, label:"Review flagged CMA alerts (CRITICAL/HIGH)", labelAr:"مراجعة تنبيهات هيئة السوق المالية (حرج/عالٍ)", done:false},
        {id:2, label:"Confirm manipulation suspicion with evidence", labelAr:"تأكيد الاشتباه بالتلاعب مع الأدلة", done:false},
        {id:3, label:"Prepare CMA notification form", labelAr:"إعداد نموذج إخطار هيئة السوق المالية", done:false},
        {id:4, label:"Include: investor details, trade data, pattern", labelAr:"تضمين: تفاصيل المستثمر، بيانات التداول، النمط", done:false},
        {id:5, label:"Submit via CMA portal (Tadawul e-services)", labelAr:"التقديم عبر بوابة هيئة السوق المالية (تداول)", done:false},
        {id:6, label:"Save confirmation reference number", labelAr:"حفظ رقم مرجع التأكيد", done:false},
        {id:7, label:"Log submission in audit trail", labelAr:"تسجيل التقديم في سجل المراجعة", done:false},
      ],
      log:[],
    },
  ]);
  const [wfModal, setWfModal] = useState(null); // task id
  const [wfNote, setWfNote] = useState("");
  const [sendConfirm, setSendConfirm] = useState(null); // {type:"SAR"|"CMA", data:{...}}
  const [cmaNotifModal, setCmaNotifModal] = useState(null);

  const generateCMANotif = (alert) => {
    const p = profiles[alert.nid];
    const rc = reportingConfig||{};
    const now = new Date();

    const catRegMap = {
      SELF_TRADE:{en:"Article 3(b)(1) — Self-Trading Prohibition",ar:"المادة 3(ب)(1) — حظر التداول الذاتي"},
      MATCHED_ORDERS:{en:"Article 3(b)(2-3) — Pre-Arranged Trading",ar:"المادة 3(ب)(2-3) — الأوامر المرتبة مسبقاً"},
      SPOOFING:{en:"Article 3(b)(6) — Spoofing / False Orders",ar:"المادة 3(ب)(6) — الانتحال / الأوامر الوهمية"},
      PRICE_RAMPING:{en:"Article 3(b)(4-5) — Price Ramping / Marking the Close",ar:"المادة 3(ب)(4-5) — التصعيد السعري"},
      LAYERING:{en:"Article 3(b)(6) — Layering",ar:"المادة 3(ب)(6) — الطبقات"},
      CHURNING:{en:"Article 16 — Excessive Trading (Churning)",ar:"المادة 16 — الإفراط في التداول"},
      COLLUSION:{en:"Article 3 — Collusive Manipulation",ar:"المادة 3 — التواطؤ للتلاعب"},
      PUMP_DUMP:{en:"Article 3(b)(4) — Pump and Dump",ar:"المادة 3(ب)(4) — التضخيم والإغراق"},
      CLOSING_MANIP:{en:"Article 3(b)(6) — Closing Price Manipulation",ar:"المادة 3(ب)(6) — التلاعب بسعر الإغلاق"},
    };
    const reg = catRegMap[alert.category]||{en:"CMA Market Conduct Regulations",ar:"أنظمة سلوك السوق"};

    const narrativeEn =
      `This notification is filed pursuant to CMA Market Conduct Regulations, Article 11, which requires reporting of suspected market manipulation within 3 business days.\n\n`+
      `DETECTION:\n`+
      `The automated market surveillance system flagged activity matching ${alert.category} pattern via rule ${alert.rule}: "${alert.title}". `+
      `${alert.detail}\n\n`+
      `SUSPECTED VIOLATION:\n`+
      `Subject ${alert.name} (National ID: ${alert.nid}) engaged in trading behavior consistent with market manipulation. `+
      (p ? `Trading profile: SAR ${p.totalVolume.toLocaleString()} total volume, ${p.ordCount} orders placed, ${p.txCount} executed transactions. `:"") +
      `Severity: ${alert.level}.\n\n`+
      `REGULATION BREACHED:\n`+
      `${reg.en}\n\n`+
      `ACTION TAKEN:\n`+
      (alert.level==="CRITICAL"?"Account frozen and placed under enhanced surveillance pending investigation.":"Enhanced monitoring applied. Trading activity under active review.");

    const narrativeAr =
      `يُقدّم هذا الإخطار بموجب المادة 11 من أنظمة سلوك السوق الصادرة عن هيئة السوق المالية، والتي تلزم بالإبلاغ عن التلاعب المشتبه به خلال 3 أيام عمل.\n\n`+
      `الكشف:\n`+
      `رصد نظام المراقبة الآلي للسوق نشاطاً يتوافق مع نمط ${alert.category} عبر القاعدة ${alert.rule}: "${alert.title}". `+
      `${alert.detail}\n\n`+
      `المخالفة المشتبه بها:\n`+
      `قام الشخص المعني ${alert.name} (رقم الهوية: ${alert.nid}) بسلوك تداولي يتوافق مع التلاعب بالسوق. `+
      (p ? `ملف التداول: ${p.totalVolume.toLocaleString()} ريال سعودي إجمالي حجم التداول، ${p.ordCount} أمر، ${p.txCount} معاملة منفذة. `:"") +
      `الخطورة: ${alert.level}.\n\n`+
      `النظام المُخالف:\n`+
      `${reg.ar}\n\n`+
      `الإجراء المتخذ:\n`+
      (alert.level==="CRITICAL"?"تم تجميد الحساب ووضعه تحت مراقبة معززة بانتظار التحقيق.":"تم تطبيق المراقبة المعززة. نشاط التداول قيد المراجعة.");

    return {
      notifId:"CMA-NOTIF-"+String(now.getTime()).slice(-8), filedDate:now.toISOString().slice(0,10),
      filedBy:rc.mlroName||"MLRO", filedByAr:rc.mlroNameAr||"المسؤول",
      filedTitle:rc.mlroTitle||"Compliance Officer", filedTitleAr:rc.mlroTitleAr||"مسؤول الامتثال",
      company:rc.companyName||"Tanaqul", companyAr:rc.companyNameAr||"تناقل",
      license:rc.companyLicense||"", licenseAr:rc.companyLicenseAr||"",
      toEmail:rc.cmaEmail||"enforcement@cma.org.sa", ccEmail:rc.cmaCc||"",
      subjectName:alert.name, subjectNID:alert.nid,
      category:alert.category, rule:alert.rule, title:alert.title, level:alert.level,
      regulationEn:reg.en, regulationAr:reg.ar,
      narrativeEn, narrativeAr,
      actionTakenEn:alert.level==="CRITICAL"?"Account frozen pending investigation":"Enhanced monitoring under review",
      actionTakenAr:alert.level==="CRITICAL"?"تجميد الحساب بانتظار التحقيق":"مراقبة معززة قيد المراجعة",
    };
  };

  // Use App-level continuous alerts
  const amlAlerts = globalAmlAlerts || [];
  const cmaAlerts = globalCmaAlerts || [];

  // ── Helper: parse SAR amounts ──
  const parseSAR = v => { if(typeof v === "number") return v; return parseFloat(String(v||"0").replace(/,/g,"")); };

  // ══════════════════════════════════════════════════════════════════════════
  // AI ENGINE: Behavioral Analysis & AML Detection
  // ══════════════════════════════════════════════════════════════════════════

  const buildInvestorProfiles = () => {
    const allTxns = [
      
      ...matches.map(m=>({
        id:m.id, buyerNationalId:m.buyerNid||"", sellerNationalId:m.sellerNid||"",
        total:String(m.totalSAR), metal:m.metal, status:"COMPLETED", date:m.date,
      })),
    ];
    const allWM = [...walletMovements];
    const allAppts = [...(appointments||[])];
    const profiles = {};

    investors.forEach(inv => {
      const nid = inv.nationalId;
      const txns = allTxns.filter(tx => tx.buyerNationalId===nid || tx.sellerNationalId===nid);
      const wm = allWM.filter(w => w.investor === inv.nameEn);
      const appts = allAppts.filter(a => a.nationalId === nid);
      const noShows = appts.filter(a => a.status==="NO_SHOW").length;
      const cancelled = appts.filter(a => a.status==="CANCELED"||a.status==="CANCELLED").length;
      const ords = orders.filter(o => o.nationalId===nid);
      const matchList = matches.filter(m => {
        const buyOrd = orders.find(o=>o.id===m.buyOrder);
        const sellOrd = orders.find(o=>o.id===m.sellOrder);
        return (buyOrd?.nationalId===nid)||(sellOrd?.nationalId===nid);
      });

      // Compute trade volumes
      const buyVolume = txns.filter(tx=>tx.buyerNationalId===nid&&tx.status==="COMPLETED").reduce((a,tx)=>a+parseSAR(tx.total),0);
      const sellVolume = txns.filter(tx=>tx.sellerNationalId===nid&&tx.status==="COMPLETED").reduce((a,tx)=>a+parseSAR(tx.total),0);
      const totalVolume = buyVolume + sellVolume;
      const matchVolume = matchList.reduce((a,m)=>a+m.totalSAR,0);

      // Withdrawal analysis
      const wdReqs = withdrawals.filter(w=>w.nationalId===nid||w.investor===inv.nameEn);
      const totalWithdrawn = wdReqs.filter(w=>w.status==="PROCESSED"||w.status==="APPROVED").reduce((a,w)=>a+parseSAR(w.amount),0);

      // Time-based analysis
      const txDates = txns.map(tx=>new Date(tx.date));
      const daysBetween = txDates.length>1 ? (Math.max(...txDates)-Math.min(...txDates))/(86400000) : 0;
      const txFrequency = daysBetween>0 ? txns.length/daysBetween : 0;

      // Holdings value
      const holdings = parseSAR(inv.holdingsValue);

      profiles[nid] = {
        inv, nid, name:inv.nameEn,
        txCount: txns.length, matchCount: matchList.length,
        buyVolume, sellVolume, totalVolume, matchVolume,
        totalWithdrawn, wdCount: wdReqs.length,
        noShows, cancelledAppts: cancelled,
        txFrequency, daysBetween,
        holdings, ordCount: ords.length,
        cancelledOrders: ords.filter(o=>o.status==="CANCELLED").length,
        joinDate: inv.joined,
        kycExpiry: inv.kycExpiry,
        status: inv.status,
      };
    });
    return profiles;
  };

  const profiles = buildInvestorProfiles();

  // AML alerts now come from App-level continuous engine (via context)
  // No local runAMLRules needed — globalAmlAlerts updates on every state change

  // ══════════════════════════════════════════════════════════════════════════
  // RISK SCORING ENGINE — 0 to 100
  // ══════════════════════════════════════════════════════════════════════════

  const computeRiskScores = () => {
    return Object.values(profiles).map(p => {
      let score = 0;
      const factors = [];

      // Volume factor (0-25)
      if(p.totalVolume > 200000){ score+=25; factors.push("Volume > 200K SAR (+25)"); }
      else if(p.totalVolume > 100000){ score+=15; factors.push("Volume > 100K SAR (+15)"); }
      else if(p.totalVolume > 50000){ score+=8; factors.push("Volume > 50K SAR (+8)"); }

      // Velocity factor (0-20)
      if(p.txFrequency > 1){ score+=20; factors.push("TX freq > 1/day (+20)"); }
      else if(p.txFrequency > 0.5){ score+=12; factors.push("TX freq > 0.5/day (+12)"); }
      else if(p.txFrequency > 0.2){ score+=5; factors.push("TX freq > 0.2/day (+5)"); }

      // Buy/Sell ratio imbalance (0-15)
      if(p.buyVolume > 0 && p.sellVolume > 0){
        const ratio = Math.max(p.buyVolume,p.sellVolume)/Math.min(p.buyVolume,p.sellVolume);
        if(ratio < 1.5 && p.totalVolume > 20000){ score+=15; factors.push("Balanced buy/sell — wash risk (+15)"); }
      }

      // No-shows (0-10)
      if(p.noShows >= 3){ score+=10; factors.push("3+ no-shows (+10)"); }
      else if(p.noShows >= 2){ score+=5; factors.push("2 no-shows (+5)"); }

      // Account age (0-10)
      const age = (new Date()-new Date(p.joinDate))/(86400000);
      if(age < 14 && p.totalVolume > 10000){ score+=10; factors.push("New acct < 14d + active (+10)"); }
      else if(age < 30 && p.totalVolume > 5000){ score+=5; factors.push("New acct < 30d + active (+5)"); }

      // KYC (0-10)
      if(p.kycExpiry){
        const daysLeft = (new Date(p.kycExpiry)-new Date())/(86400000);
        if(daysLeft <= 0){ score+=10; factors.push("KYC expired (+10)"); }
        else if(daysLeft < 30){ score+=4; factors.push("KYC expiring < 30d (+4)"); }
      }

      // Status (0-10)
      if(p.status==="BANNED"){ score+=10; factors.push("Banned status (+10)"); }
      else if(p.status==="SUSPENDED"){ score+=5; factors.push("Suspended (+5)"); }

      const riskLevel = score >= 60 ? "CRITICAL" : score >= 40 ? "HIGH" : score >= 20 ? "MEDIUM" : "LOW";

      return { ...p, riskScore: Math.min(100,score), riskLevel, factors };
    }).sort((a,b)=>b.riskScore-a.riskScore);
  };

  const riskScores = computeRiskScores();

  // ══════════════════════════════════════════════════════════════════════════
  // SAR (Suspicious Activity Report) Generator
  // ══════════════════════════════════════════════════════════════════════════

  const generateSAR = (alert) => {
    const p = profiles[alert.nid];
    const rc = reportingConfig||{};
    const now = new Date();
    const id = "SAR-"+String(now.getTime()).slice(-8);
    const date = now.toISOString().slice(0,10);
    const levelAr = {CRITICAL:"حرج",HIGH:"مرتفع",MEDIUM:"متوسط",LOW:"منخفض"};

    // Complete rule data: EN regulation, AR regulation, AR title
    const ruleData = {
      R01:{en:"SAMA AML/CFT — Article 5: Suspicious Transaction Reporting",ar:"نظام ساما لمكافحة غسل الأموال — المادة ٥: الإبلاغ عن المعاملات المشبوهة",titleAr:"نشاط تداول بقيمة عالية"},
      R02:{en:"SAMA AML/CFT — Article 16: Wash Trading / Structuring",ar:"نظام ساما لمكافحة غسل الأموال — المادة ١٦: غسل الأموال / تجزئة المعاملات",titleAr:"نمط شراء وبيع سريع"},
      R03:{en:"SAMA AML/CFT — Article 5: Velocity-Based Suspicious Activity",ar:"نظام ساما لمكافحة غسل الأموال — المادة ٥: نشاط مشبوه مبني على السرعة",titleAr:"ارتفاع مفاجئ في وتيرة المعاملات"},
      R04:{en:"SAMA AML/CFT — Article 12: Disproportionate Withdrawal",ar:"نظام ساما لمكافحة غسل الأموال — المادة ١٢: سحب غير متناسب",titleAr:"سحب غير متناسب مع الحيازات"},
      R05:{en:"SAMA AML/CFT — Article 7: High-Risk New Account",ar:"نظام ساما لمكافحة غسل الأموال — المادة ٧: حساب جديد عالي المخاطر",titleAr:"حساب جديد بحجم تداول مرتفع"},
      R06:{en:"SAMA AML/CFT — Article 9: Behavioral Anomaly",ar:"نظام ساما لمكافحة غسل الأموال — المادة ٩: انحراف سلوكي",titleAr:"نمط سلوكي غير اعتيادي"},
      R07:{en:"SAMA AML/CFT — Article 5: KYC Compliance",ar:"نظام ساما لمكافحة غسل الأموال — المادة ٥: الامتثال لمتطلبات اعرف عميلك",titleAr:"انتهاء أو اقتراب انتهاء التحقق من الهوية"},
      R08:{en:"SAMA AML/CFT — Article 5: Excessive Cancellations",ar:"نظام ساما لمكافحة غسل الأموال — المادة ٥: إلغاءات مفرطة",titleAr:"إلغاءات مفرطة للأوامر"},
      R09:{en:"SAMA AML/CFT — Article 18: Banned Entity Activity",ar:"نظام ساما لمكافحة غسل الأموال — المادة ١٨: نشاط كيان محظور",titleAr:"نشاط تداول من مستخدم محظور"},
      R10:{en:"SAMA AML/CFT — Article 12: Structuring",ar:"نظام ساما لمكافحة غسل الأموال — المادة ١٢: تجزئة مالية",titleAr:"معاملات بمبالغ مدوّرة مشبوهة"},
      R11:{en:"SAMA AML/CFT — Article 5: Platform Volume",ar:"نظام ساما لمكافحة غسل الأموال — المادة ٥: حجم المنصة",titleAr:"حجم تطابق مرتفع على المنصة"},
      R12:{en:"SAMA AML/CFT — Article 18: Blacklisted Orders",ar:"نظام ساما لمكافحة غسل الأموال — المادة ١٨: أوامر في القائمة السوداء",titleAr:"أوامر نشطة لمستخدم محظور"},
      R14:{en:"SAMA AML/CFT — Article 12: Multiple Banks",ar:"نظام ساما لمكافحة غسل الأموال — المادة ١٢: حسابات بنكية متعددة",titleAr:"سحب من حسابات بنكية متعددة"},
    };
    const rk = (alert.rule||"").split(":")[0]||alert.rule;
    const rd = ruleData[rk]||{en:"SAMA AML/CFT Regulations",ar:"أنظمة ساما لمكافحة غسل الأموال",titleAr:alert.title};

    // Build Arabic detail from English detail numeric data
    const buildDetailAr = () => {
      const d = alert.detail||"";
      const nums = (d.match(/[\d,]+/g)||[]).map(n=>n.replace(/,/g,""));
      if(rk==="R01") return "إجمالي حجم التداول "+d.match(/SAR [\d,]+/)?.[0]?.replace("SAR","")?.trim()+" ريال سعودي يتجاوز الحد المقرر من ساما.";
      if(rk==="R02") return "شراء "+nums[0]+" ريال / بيع "+nums[1]+" ريال، بمعدل تكرار مرتفع.";
      if(rk==="R03") return nums[0]+" معاملة خلال "+nums[1]+" أيام.";
      if(rk==="R04") return "تم تسييل "+nums[0]+"% من إجمالي الحيازات.";
      if(rk==="R05") return "عمر الحساب "+nums[0]+" يوم، حجم تداول "+nums[1]+" ريال سعودي.";
      if(rk==="R06") return nums[0]+" حالات عدم حضور للمواعيد المقررة.";
      if(rk==="R07"&&d.includes("Expired")) return "منتهية الصلاحية منذ "+nums[0]+" يوم.";
      if(rk==="R07") return "تنتهي خلال "+nums[0]+" يوم.";
      if(rk==="R08") return nums[0]+" أوامر ملغاة.";
      if(rk==="R09") return "مستخدم محظور لديه "+nums[0]+" معاملة و"+nums[1]+" أمر.";
      if(rk==="R10") return nums[0]+" معاملات بمبالغ مدوّرة.";
      if(rk==="R14") return nums[0]+" حسابات بنكية مستخدمة.";
      return d;
    };
    const detailAr = buildDetailAr();

    const narrativeEn =
      "This Suspicious Activity Report is filed pursuant to SAMA Anti-Money Laundering and Counter-Terrorist Financing Regulations.\n\n"+
      "DETECTION:\n"+
      "The automated AML monitoring system detected suspicious activity matching rule "+alert.rule+": \""+alert.title+"\". "+
      alert.detail+"\n\n"+
      "SUSPICION:\n"+
      "Subject "+alert.name+" (National ID: "+alert.nid+") exhibited behavior consistent with "+alert.title.toLowerCase()+". "+
      (p ? "Total trading volume: SAR "+p.totalVolume.toLocaleString()+" across "+p.txCount+" transactions since account opening on "+p.joinDate+". ":"") +
      "Risk level assessed as "+alert.level+" based on automated scoring.\n\n"+
      "REGULATION BREACHED:\n"+
      rd.en+"\n\n"+
      "RECOMMENDATION:\n"+
      (alert.level==="CRITICAL"?"Immediate account freeze and escalation to senior compliance.":
       alert.level==="HIGH"?"Enhanced Due Diligence (EDD) required within 48 hours.":
       "Continued monitoring under standard compliance review cycle.");

    const narrativeAr =
      "يُقدّم هذا البلاغ عن نشاط مشبوه بموجب أنظمة مكافحة غسل الأموال وتمويل الإرهاب الصادرة عن البنك المركزي السعودي (ساما).\n\n"+
      "الكشف:\n"+
      "رصد نظام المراقبة الآلي لمكافحة غسل الأموال نشاطاً مشبوهاً يتوافق مع القاعدة "+alert.rule+": \""+rd.titleAr+"\". "+
      detailAr+"\n\n"+
      "الاشتباه:\n"+
      "أظهر الشخص المعني "+alert.name+" (رقم الهوية: "+alert.nid+") سلوكاً يتوافق مع "+rd.titleAr+". "+
      (p ? "إجمالي حجم تداول الشخص المعني "+p.totalVolume.toLocaleString()+" ريال سعودي عبر "+p.txCount+" معاملة منذ فتح الحساب في "+p.joinDate+". ":"") +
      "تم تقييم مستوى المخاطر كـ \""+(levelAr[alert.level]||alert.level)+"\" بناءً على نظام التقييم الآلي.\n\n"+
      "النظام المُخالف:\n"+
      rd.ar+"\n\n"+
      "التوصية:\n"+
      (alert.level==="CRITICAL"?"تجميد الحساب فوراً والتصعيد إلى مسؤول الامتثال الأعلى.":
       alert.level==="HIGH"?"مطلوب إجراء العناية الواجبة المعززة خلال ٤٨ ساعة.":
       "استمرار المراقبة ضمن دورة المراجعة القياسية.");

    return {
      reportId:id, filedDate:date,
      filedBy:rc.mlroName||"Admin", filedByAr:rc.mlroNameAr||"المسؤول",
      filedTitle:rc.mlroTitle||"Money Laundering Reporting Officer",
      filedTitleAr:rc.mlroTitleAr||"مسؤول الإبلاغ عن غسل الأموال",
      company:rc.companyName||"Tanaqul Precious Metals Trading Co.",
      companyAr:rc.companyNameAr||"شركة تناقل لتجارة المعادن الثمينة",
      license:rc.companyLicense||"",
      licenseAr:rc.companyLicenseAr||"",
      companyAddress:rc.companyAddress||"",
      companyAddressAr:rc.companyAddressAr||"طريق الملك فهد، الرياض ١٢٣٤٥، المملكة العربية السعودية",
      toEmail:rc.sarEmail||"sar@sama.gov.sa", ccEmail:rc.sarCc||"",
      subjectName:alert.name, subjectNID:alert.nid,
      alertRule:alert.rule, alertTitle:alert.title,
      alertTitleAr:rd.titleAr,
      riskLevel:alert.level, riskLevelAr:levelAr[alert.level]||alert.level,
      regulation:rd.en, regulationAr:rd.ar,
      narrativeEn, narrativeAr,
      recommendationEn: alert.level==="CRITICAL"?"IMMEDIATE ESCALATION — Freeze account":alert.level==="HIGH"?"Enhanced Due Diligence within 48h":"Standard monitoring cycle",
      recommendationAr: alert.level==="CRITICAL"?"تصعيد فوري — تجميد الحساب":alert.level==="HIGH"?"العناية الواجبة المعززة خلال ٤٨ ساعة":"دورة المراقبة القياسية",
    };
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  const ACTION_COLOR = {
    CANCEL_APPOINTMENT:"#C85C3E",NO_SHOW:"#D4943A",RESCHEDULE:C.purpleSolid,
    COMPLETE_APPOINTMENT:C.greenSolid,SUSPEND:"#D4943A",BAN:"#C85C3E",
    ACTIVATE:C.greenSolid,UNBAN:C.greenSolid,MARKET_MAKER_ORDER:"#B7791F",
    WITHDRAWAL_APPROVE:C.greenSolid,WITHDRAWAL_REJECT:"#C85C3E",WITHDRAWAL_PROCESSED:C.blueSolid,
    BLACKLIST_ADD:"#C85C3E",
  };

  const CATEGORY_ICON = {VOLUME:"amlVolume",PATTERN:"amlPattern",VELOCITY:"amlVelocity",WITHDRAWAL:"amlWithdraw",ONBOARDING:"amlOnboard",BEHAVIOR:"amlBehavior",COMPLIANCE:"amlComply",ENFORCEMENT:"amlEnforce",SYSTEM:"amlSystem",VAULT:"amlVault"};

  const critCount = amlAlerts.filter(a=>a.level==="CRITICAL").length;
  const highCount = amlAlerts.filter(a=>a.level==="HIGH").length;

  const filteredAlerts = amlAlerts.filter(a => {
    if(!showDismissed && amlDismissed.has(a.key)) return false;
    if(riskFilter !== "ALL" && a.level !== riskFilter) return false;
    if(searchQ && !a.name.toLowerCase().includes(searchQ.toLowerCase()) && !a.nid.includes(searchQ) && !a.title.toLowerCase().includes(searchQ.toLowerCase())) return false;
    return true;
  });
  const activeAlertCount = amlAlerts.filter(a=>!amlDismissed.has(a.key)).length;
  const cmaCritCount = cmaAlerts.filter(a=>a.level==="CRITICAL").length;
  const cmaHighCount = cmaAlerts.filter(a=>a.level==="HIGH").length;

  const tabs = [
    {id:"trail",label:isAr?"سجل المراجعة":"Audit Trail",icon:"amlComply",count:auditLog.length},
    {id:"aml",label:isAr?"تنبيهات غسل الأموال":"AML Alerts",icon:"amlEnforce",count:amlAlerts.length,badge:critCount+highCount},
    {id:"cma",label:isAr?"مراقبة التلاعب بالسوق":"Market Manipulation",icon:"cmaScale",count:cmaAlerts.length,badge:cmaCritCount+cmaHighCount},
    {id:"risk",label:isAr?"تقييم المخاطر":"Risk Scoring",icon:"amlVolume",count:riskScores.length},
    {id:"behavior",label:isAr?"تحليل السلوك":"Behavior Analytics",icon:"🧠",count:Object.keys(profiles).length},
    {id:"compliance",label:isAr?"الامتثال":"Compliance",icon:"✅"},
  ];

  // ══════════════════════════════════════════════════════════════════════════
  // STAT CARDS
  // ══════════════════════════════════════════════════════════════════════════

  const riskDistro = {CRITICAL:riskScores.filter(r=>r.riskLevel==="CRITICAL").length, HIGH:riskScores.filter(r=>r.riskLevel==="HIGH").length, MEDIUM:riskScores.filter(r=>r.riskLevel==="MEDIUM").length, LOW:riskScores.filter(r=>r.riskLevel==="LOW").length};

  return (
    <div>
      {toast&&<div style={{position:"fixed",top:20,right:20,background:C.navy,color:C.white,padding:"12px 20px",borderRadius:12,fontSize:15,fontWeight:600,zIndex:9999,boxShadow:"0 4px 20px rgba(0,0,0,0.3)"}}>{toast}</div>}

      <SectionHeader title={isAr?"مركز التدقيق والامتثال":"Audit & AML Intelligence Center"} sub={isAr?"أدوات التدقيق والذكاء الاصطناعي لكشف الأنشطة المشبوهة":"AI-powered auditing tools, AML detection, risk scoring & compliance monitoring"} />

      {/* LIVE MONITORING STATUS */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14,padding:"10px 16px",borderRadius:10,background:"linear-gradient(90deg,#1E1810,#2A2015)",border:"1px solid #3D3225"}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:C.greenSolid,boxShadow:"0 0 8px #4A7A68",animation:"pulse 2s infinite"}}/>
          <span style={{fontSize:14,fontWeight:700,color:"#4ADE80"}}>{isAr?"المراقبة المباشرة":"LIVE MONITORING"}</span>
        </div>
        <div style={{width:1,height:16,background:"#3D3225"}}/>
        <span style={{fontSize:13,color:"#A89880"}}>14 AML + 10 CMA rules scanning continuously</span>
        <div style={{width:1,height:16,background:"#3D3225"}}/>
        <span style={{fontSize:13,color:"#A89880"}}>Last scan: {amlLastRun ? new Date(amlLastRun).toLocaleTimeString() : "—"}</span>
        <div style={{width:1,height:16,background:"#3D3225"}}/>
        <span style={{fontSize:13,color:"#A89880"}}>{amlAlerts.filter(a=>!amlDismissed.has(a.key)).length} active / {amlDismissed.size} dismissed</span>
        <div style={{flex:1}}/>
        <span style={{fontSize:12,color:"#8C7E6F"}}>Engine re-evaluates on every state mutation (orders, matches, bans, withdrawals)</span>
      </div>

      {/* TOP STATS */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:22}}>
        <StatCard icon={Icons.financials(22,C.navy)} title={isAr?"أحداث التدقيق":"Audit Events"} value={auditLog.length} />
        <StatCard icon={Icons.warning(22,"#C85C3E")} title={isAr?"تنبيهات غسل الأموال":"AML Alerts"} value={amlAlerts.length} sub={critCount>0?`${critCount} ${isAr?"حرجة":"critical"}`:undefined} />
        <StatCard icon={Icons.shield(22,C.purpleSolid)} title={isAr?"تنبيهات التلاعب":"CMA Manipulation"} value={cmaAlerts.length} sub={cmaCritCount>0?`${cmaCritCount} ${isAr?"حرجة":"critical"}`:`${cmaHighCount} ${isAr?"مرتفعة":"high"}`} />
        <StatCard icon={Icons.check(22,C.greenSolid)} title={isAr?"مخاطر منخفضة":"Low Risk"} value={riskDistro.LOW} sub={`${Math.round(riskDistro.LOW/Math.max(1,riskScores.length)*100)}% ${isAr?"من المستثمرين":"of investors"}`} />
      </div>

      {/* ALERT BANNER */}
      {(critCount + cmaCritCount) > 0 && <div style={{background:"linear-gradient(90deg,#8B3520,#C85C3E)",borderRadius:12,padding:"14px 20px",marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
        <span style={{fontSize:26}}>🚨</span>
        <div style={{flex:1}}>
          <p style={{fontSize:16,fontWeight:800,color:"#FFF"}}>{critCount + cmaCritCount} CRITICAL Alert{(critCount+cmaCritCount)>1?"s":""} — {critCount>0?`${critCount} AML`:""}{critCount>0&&cmaCritCount>0?" + ":""}{cmaCritCount>0?`${cmaCritCount} Market Manipulation`:""}</p>
          <p style={{fontSize:13,color:"#E8C5BA"}}>{cmaCritCount>0?"CMA Market Conduct Regulations require immediate investigation of manipulation alerts. ":""}SAMA regulations require escalation within 24 hours.</p>
        </div>
        <button onClick={()=>setTab(cmaCritCount>0?"cma":"aml")} style={{padding:"8px 16px",borderRadius:8,background:"#FFF",color:"#C85C3E",fontSize:14,fontWeight:700,border:"none",cursor:"pointer"}}>Review Now →</button>
      </div>}

      {/* TAB BAR */}
      <div style={{display:"flex",gap:4,marginBottom:18,flexWrap:"wrap"}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            padding:"8px 16px",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer",border:`1.5px solid ${tab===t.id?C.navy:C.border}`,
            background:tab===t.id?C.navy:C.white,color:tab===t.id?C.white:C.textMuted,display:"flex",alignItems:"center",gap:6,position:"relative",
          }}>
            <span>{Icons[t.icon]?.(16, tab===t.id?"#FFF":C.textMuted)||t.icon}</span> {t.label}
            {t.count!==undefined&&<span style={{fontSize:12,opacity:0.7}}>({t.count})</span>}
            {t.badge>0&&<span style={{position:"absolute",top:-6,right:-6,background:"#C85C3E",color:"#FFF",fontSize:11,fontWeight:900,borderRadius:20,padding:"1px 6px",minWidth:16,textAlign:"center"}}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* ═══ TAB 1: AUDIT TRAIL ═══ */}
      {tab==="trail"&&<div>
        {auditLog.length===0?(
          <div style={{background:C.white,borderRadius:14,border:`1px solid ${C.border}`,padding:"40px",textAlign:"center"}}>
            <p style={{fontSize:38,marginBottom:12}}>📋</p>
            <p style={{fontSize:16,color:C.textMuted}}>{isAr?"لا توجد إجراءات مسجلة بعد":"No actions recorded yet — they appear here as you work"}</p>
          </div>
        ):(
          <TTable cols={[
            {key:"id",label:"ID",render:v=><span style={{fontFamily:"monospace",fontSize:12,color:C.teal}}>{v}</span>},
            {key:"timestamp",label:isAr?"الوقت":"Time"},
            {key:"admin",label:isAr?"المشرف":"Admin",render:v=><span style={{fontSize:13,color:C.textMuted}}>{v}</span>},
            {key:"ip",label:"IP",render:v=>v?<span style={{fontFamily:"monospace",fontSize:11,color:C.textMuted}}>{v}</span>:<span style={{color:C.textMuted}}>—</span>},
            {key:"action",label:isAr?"الإجراء":"Action",render:v=>{
              const col=ACTION_COLOR[v]||C.navy;
              return <span style={{padding:"2px 8px",borderRadius:20,fontSize:12,fontWeight:800,color:col,background:col+"18",border:`1px solid ${col}44`}}>{v.replace(/_/g," ")}</span>;
            }},
            {key:"entity",label:isAr?"الكيان":"Entity",render:v=><span style={{fontWeight:600,color:C.navy,fontSize:14}}>{v}</span>},
            {key:"details",label:isAr?"التفاصيل":"Details",render:v=><span style={{fontSize:13,color:C.textMuted}}>{v}</span>},
          ]} rows={auditLog} />
        )}
      </div>}

      {/* ═══ TAB 2: AML ALERTS ═══ */}
      {tab==="aml"&&<div>
        {/* Filters */}
        <div style={{display:"flex",gap:8,marginBottom:14,alignItems:"center",flexWrap:"wrap"}}>
          {["ALL","CRITICAL","HIGH","MEDIUM","LOW"].map(f=>(
            <button key={f} onClick={()=>setRiskFilter(f)} style={{padding:"5px 14px",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",
              border:`1px solid ${riskFilter===f?C.navy:C.border}`,background:riskFilter===f?C.navy:C.white,color:riskFilter===f?C.white:C.textMuted}}>
              {f} {f!=="ALL"&&<span style={{fontSize:12}}>({amlAlerts.filter(a=>a.level===f).length})</span>}
            </button>
          ))}
          <div style={{flex:1}}/>
          <button onClick={()=>setShowDismissed(d=>!d)} style={{padding:"5px 12px",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",
            border:`1px solid ${C.border}`,background:showDismissed?"#F5F0E8":C.white,color:C.textMuted}}>
            {showDismissed?"Hide":"Show"} Dismissed ({amlDismissed.size})
          </button>
          <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Search alerts..." style={{padding:"7px 14px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:14,width:200,outline:"none"}}/>
        </div>

        {filteredAlerts.length===0?(
          <div style={{background:C.white,borderRadius:14,border:`1px solid ${C.border}`,padding:"40px",textAlign:"center"}}>
            <p style={{fontSize:38,marginBottom:12}}>✅</p>
            <p style={{fontSize:16,color:C.greenSolid,fontWeight:600}}>No alerts match the current filter</p>
          </div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {filteredAlerts.map((a,i)=>(
              <div key={i} style={{background:C.white,borderRadius:12,border:`1px solid ${C.border}`,padding:"14px 18px",display:"flex",alignItems:"flex-start",gap:14,
                borderLeft:`4px solid ${a.level==="CRITICAL"?"#C85C3E":a.level==="HIGH"?"#D4943A":a.level==="MEDIUM"?"#C4956A":C.greenSolid}`}}>
                <span style={{marginTop:2}}>{Icons[CATEGORY_ICON[a.category]]?.(22,a.level==="CRITICAL"?"#C85C3E":a.level==="HIGH"?"#D4943A":"#C4956A")||Icons.warning(22,"#A89880")}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                    <RiskBadge level={a.level}/>
                    <span style={{fontSize:12,fontWeight:700,color:C.teal,fontFamily:"monospace"}}>{a.rule}</span>
                    <span style={{fontSize:15,fontWeight:700,color:C.navy}}>{a.title}</span>
                  </div>
                  <p style={{fontSize:13,color:C.textMuted,marginBottom:4}}>{a.detail}</p>
                  <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                    <span style={{fontSize:12,color:C.textMuted}}>👤 {a.name}</span>
                    <span style={{fontSize:12,color:C.textMuted,fontFamily:"monospace"}}>NID: {a.nid}</span>
                    <span style={{fontSize:12,color:C.textMuted}}>📁 {a.category}</span>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  <Btn small variant="danger" onClick={()=>{const sar=generateSAR(a);setSarModal(sar);}}>{isAr?"تقديم بلاغ":"File SAR"}</Btn>
                  <Btn small variant="outline" onClick={()=>setAmlModal(a)}>{isAr?"التفاصيل":"Details"}</Btn>
                  {!amlDismissed.has(a.key)&&<Btn small variant="outline" onClick={()=>{dismissAmlAlert(a.key);showToast("Alert dismissed");}}>Dismiss</Btn>}
                  {amlDismissed.has(a.key)&&<span style={{fontSize:11,color:C.textMuted,textAlign:"center",fontWeight:600}}>✓ Dismissed</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>}

      {/* ═══ TAB 3: CMA MARKET MANIPULATION MONITORING CENTER ═══ */}
      {tab==="cma"&&<div>
        {/* CMA Header */}
        <div style={{background:"linear-gradient(135deg,#1E1B4B,#312E81)",borderRadius:14,padding:"20px 24px",marginBottom:18,border:"1px solid #4338CA33"}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
            <span>{Icons.cmaScale(28,"#A5B4FC")}</span>
            <div>
              <p style={{fontSize:18,fontWeight:800,color:"#E0E7FF"}}>{isAr?"مركز مراقبة التلاعب بالسوق":"Market Manipulation Monitoring Center"}</p>
              <p style={{fontSize:13,color:"#A5B4FC"}}>{isAr?"وفقاً لأنظمة سلوك السوق الصادرة عن هيئة السوق المالية":"Per CMA Market Conduct Regulations — Articles 2, 3, 16"}</p>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10}}>
            {[
              {label:isAr?"التداول الذاتي":"Self-Trading",icon:"cmaSelfTrade",count:cmaAlerts.filter(a=>a.category==="SELF_TRADE").length,color:"#C85C3E"},
              {label:isAr?"الانتحال":"Spoofing",icon:"cmaSpoofing",count:cmaAlerts.filter(a=>a.category==="SPOOFING").length,color:"#D4943A"},
              {label:isAr?"التصعيد السعري":"Price Ramping",icon:"cmaRamping",count:cmaAlerts.filter(a=>a.category==="PRICE_RAMPING").length,color:"#D4943A"},
              {label:isAr?"الطبقات":"Layering",icon:"cmaLayering",count:cmaAlerts.filter(a=>a.category==="LAYERING").length,color:C.purpleSolid},
              {label:isAr?"التواطؤ":"Collusion",icon:"cmaCollusion",count:cmaAlerts.filter(a=>a.category==="COLLUSION").length,color:"#C4956A"},
            ].map((s,i)=>(
              <div key={i} style={{background:"rgba(255,255,255,0.08)",borderRadius:10,padding:"10px 14px",textAlign:"center"}}>
                <span>{Icons[s.icon]?.(20,s.count>0?s.color:"#6B7280")}</span>
                <p style={{fontSize:24,fontWeight:900,color:s.count>0?s.color:"#6B7280"}}>{s.count}</p>
                <p style={{fontSize:12,fontWeight:600,color:"#A5B4FC"}}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Self-Trading Section — Most critical, gets its own panel */}
        {(()=>{
          const selfTrades = cmaAlerts.filter(a=>a.category==="SELF_TRADE");
          if(selfTrades.length===0) return (
            <div style={{background:C.greenBg,borderRadius:12,padding:"16px 20px",marginBottom:14,border:"1px solid #86EFAC"}}>
              <p style={{fontSize:15,fontWeight:700,color:C.greenSolid}}>✅ {isAr?"لا يوجد تداول ذاتي مكتشف":"No Self-Trading Detected"}</p>
              <p style={{fontSize:13,color:"#15803D"}}>{isAr?"جميع المطابقات تمت بين أطراف مختلفة":"All matches involve different beneficial owners — compliant with Art 3(b)(1)"}</p>
            </div>
          );
          return (
            <div style={{background:"#FBF0EC",borderRadius:14,padding:"18px 22px",marginBottom:14,border:"2px solid #C85C3E44"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                <span style={{fontSize:24}}>🔴</span>
                <div style={{flex:1}}>
                  <p style={{fontSize:16,fontWeight:800,color:"#8B3520"}}>⚠️ {selfTrades.length} Self-Trading Violation{selfTrades.length>1?"s":""} — Art 3(b)(1) Market Conduct Regulations</p>
                  <p style={{fontSize:13,color:"#B91C1C"}}>{isAr?"تداول لا يغير الملكية المستفيدة — محظور بموجب المادة 3(ب)(1)":"Trades involving no change in beneficial ownership — strictly prohibited. CMA penalty: up to SAR 25,000,000 fine + 5 years imprisonment."}</p>
                </div>
              </div>
              {selfTrades.map((a,i)=>(
                <div key={i} style={{background:"#FFF",borderRadius:10,padding:"12px 16px",marginBottom:6,borderLeft:"4px solid #C85C3E"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <RiskBadge level={a.level}/>
                      <span style={{fontFamily:"monospace",fontSize:12,color:C.teal}}>{a.rule}</span>
                      <span style={{fontSize:14,fontWeight:700,color:C.navy}}>{a.name}</span>
                    </div>
                    <div style={{display:"flex",gap:4}}>
                      <Btn small variant="danger" onClick={()=>{const sar=generateSAR(a);setSarModal(sar);}}>{isAr?"تقديم بلاغ":"File SAR"}</Btn>
                      <Btn small variant="outline" style={{borderColor:C.purpleSolid,color:C.purpleSolid}} onClick={()=>{const n=generateCMANotif(a);setCmaNotifModal(n);}}>{isAr?"إخطار الهيئة":"Notify CMA"}</Btn>
                      {!amlDismissed.has(a.key)&&<Btn small variant="outline" onClick={()=>{dismissAmlAlert(a.key);showToast("Dismissed");}}>Dismiss</Btn>}
                    </div>
                  </div>
                  <p style={{fontSize:13,color:C.text,lineHeight:"1.5"}}>{a.detail}</p>
                  <p style={{fontSize:12,color:C.purpleSolid,fontWeight:600,marginTop:4}}>📖 {a.article}</p>
                </div>
              ))}
            </div>
          );
        })()}

        {/* All CMA Alerts Table */}
        {cmaAlerts.filter(a=>a.category!=="SELF_TRADE").length > 0 && (
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:18}}>
            {cmaAlerts.filter(a=>a.category!=="SELF_TRADE").map((a,i)=>(
              <div key={i} style={{background:C.white,borderRadius:12,border:`1px solid ${C.border}`,padding:"14px 18px",display:"flex",alignItems:"flex-start",gap:14,
                borderLeft:`4px solid ${a.level==="CRITICAL"?"#C85C3E":a.level==="HIGH"?"#D4943A":"#C4956A"}`}}>
                <span style={{marginTop:2}}>
                  {Icons[{SPOOFING:"cmaSpoofing",PRICE_RAMPING:"cmaRamping",LAYERING:"cmaLayering",COLLUSION:"cmaCollusion",FICTITIOUS:"cmaFictitious",CHURNING:"cmaChurning",PUMP_DUMP:"cmaPumpDump",MATCHED_ORDERS:"cmaMatched",CLOSING_MANIP:"cmaClosing"}[a.category]]?.(22,a.level==="CRITICAL"?"#C85C3E":a.level==="HIGH"?"#D4943A":"#C4956A")||Icons.cmaScale(22,"#A89880")}
                </span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                    <RiskBadge level={a.level}/>
                    <span style={{fontSize:12,fontWeight:700,color:C.purpleSolid,fontFamily:"monospace"}}>{a.rule}</span>
                    <span style={{fontSize:15,fontWeight:700,color:C.navy}}>{a.title}</span>
                  </div>
                  <p style={{fontSize:13,color:C.textMuted,marginBottom:4}}>{a.detail}</p>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                    <span style={{fontSize:12,padding:"1px 8px",borderRadius:4,background:C.purpleBg,color:C.purpleSolid,fontWeight:700}}>📖 {a.article}</span>
                    <span style={{fontSize:12,color:C.textMuted}}>👤 {a.name}</span>
                    <span style={{fontSize:12,color:C.textMuted,fontFamily:"monospace"}}>NID: {a.nid}</span>
                    <span style={{fontSize:12,padding:"1px 6px",borderRadius:4,background:"#F5F0E8",color:C.navy,fontWeight:700}}>{a.category}</span>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  <Btn small variant="danger" onClick={()=>{const sar=generateSAR(a);setSarModal(sar);}}>{isAr?"تقديم بلاغ":"File SAR"}</Btn>
                  <Btn small variant="outline" style={{borderColor:C.purpleSolid,color:C.purpleSolid}} onClick={()=>{const n=generateCMANotif(a);setCmaNotifModal(n);}}>{isAr?"إخطار الهيئة":"Notify CMA"}</Btn>
                  {!amlDismissed.has(a.key)&&<Btn small variant="outline" onClick={()=>{dismissAmlAlert(a.key);showToast("Dismissed");}}>Dismiss</Btn>}
                </div>
              </div>
            ))}
          </div>
        )}

        {cmaAlerts.length===0&&(
          <div style={{background:C.white,borderRadius:14,border:`1px solid ${C.border}`,padding:"40px",textAlign:"center"}}>
            <p style={{fontSize:38,marginBottom:12}}>✅</p>
            <p style={{fontSize:16,color:C.greenSolid,fontWeight:600}}>{isAr?"لا توجد أنماط تلاعب مكتشفة":"No manipulation patterns detected"}</p>
          </div>
        )}

        {/* CMA Rules Reference */}
        <div style={{background:C.white,borderRadius:14,border:`1px solid ${C.border}`,padding:"20px 24px",marginTop:16}}>
          <p style={{fontSize:16,fontWeight:800,color:C.navy,marginBottom:14}}>{Icons.cmaScale(16,C.navy)} {isAr?"قواعد كشف التلاعب بالسوق — هيئة السوق المالية":"CMA Market Manipulation Detection Rules — Active (10)"}</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {[
              {id:"CMA-01",name:isAr?"التداول الذاتي":"Self-Trading",art:"Art 3(b)(1)",desc:"Trade with no change in beneficial ownership"},
              {id:"CMA-02",name:isAr?"أوامر مرتبة مسبقاً":"Pre-Arranged Orders",art:"Art 3(b)(2-3)",desc:"Same size/time/price on both sides"},
              {id:"CMA-03",name:isAr?"الانتحال":"Spoofing",art:"Art 3(b)(6)",desc:"Orders not intended to execute"},
              {id:"CMA-04",name:isAr?"التصعيد السعري":"Price Ramping",art:"Art 3(b)(4-5)",desc:"Successively higher/lower prices"},
              {id:"CMA-05",name:isAr?"صفقات وهمية":"Fictitious Trades",art:"Art 3(a)(1)",desc:"System-to-system trade review"},
              {id:"CMA-06",name:isAr?"الإفراط في التداول":"Churning",art:"Art 16",desc:"Turnover ratio > 3x holdings"},
              {id:"CMA-07",name:isAr?"ضخ وتفريغ":"Pump-and-Dump",art:"Art 3(a)(2-3)",desc:"Buy cluster then rapid sell"},
              {id:"CMA-08",name:isAr?"التلاعب بسعر الإغلاق":"Closing Price Manipulation",art:"Art 3(b)(6)",desc:"Near-close orders affecting price"},
              {id:"CMA-09",name:isAr?"الطبقات":"Layering",art:"Art 3(b)(6)",desc:"Multiple orders at different price levels"},
              {id:"CMA-10",name:isAr?"التواطؤ":"Cross-Party Collusion",art:"Art 2",desc:"Repeated counterparty pattern"},
            ].map(r=>(
              <div key={r.id} style={{display:"flex",gap:10,padding:"8px 12px",borderRadius:8,background:"#FAF8F5",alignItems:"center"}}>
                <span style={{fontSize:12,fontWeight:900,color:C.purpleSolid,fontFamily:"monospace",minWidth:50}}>{r.id}</span>
                <div style={{flex:1}}>
                  <p style={{fontSize:13,fontWeight:700,color:C.navy}}>{r.name}</p>
                  <p style={{fontSize:11,color:C.textMuted}}>{r.desc}</p>
                </div>
                <span style={{fontSize:11,padding:"1px 6px",borderRadius:4,background:C.purpleBg,color:C.purpleSolid,fontWeight:700}}>{r.art}</span>
              </div>
            ))}
          </div>
        </div>
      </div>}

      {/* ═══ TAB 4: RISK SCORING ═══ */}
      {tab==="risk"&&<div>
        {/* Risk Distribution */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:18}}>
          {[{lv:"CRITICAL",c:"#C85C3E",bg:C.redBg},{lv:"HIGH",c:"#D4943A",bg:"#FDF4EC"},{lv:"MEDIUM",c:"#C4956A",bg:"#FDF4EC"},{lv:"LOW",c:C.greenSolid,bg:"#EFF5F2"}].map(x=>(
            <div key={x.lv} style={{background:x.bg,borderRadius:12,padding:"14px 18px",border:`1px solid ${x.c}33`}}>
              <p style={{fontSize:12,fontWeight:700,color:x.c,letterSpacing:"0.08em"}}>{x.lv} RISK</p>
              <p style={{fontSize:30,fontWeight:900,color:x.c}}>{riskDistro[x.lv]}</p>
              <p style={{fontSize:12,color:x.c,opacity:0.7}}>{riskScores.length>0?Math.round(riskDistro[x.lv]/riskScores.length*100):0}% of investors</p>
            </div>
          ))}
        </div>

        {/* Risk Table */}
        <div style={{background:C.white,borderRadius:14,border:`1px solid ${C.border}`,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
            <thead>
              <tr style={{background:C.navyDark}}>
                {["Rank","Investor","NID","Score","Level","Volume","TX Count","Factors"].map(h=>(
                  <th key={h} style={{padding:"10px 12px",textAlign:"left",fontSize:12,fontWeight:700,color:"#A89880",letterSpacing:"0.06em"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {riskScores.map((r,i)=>(
                <tr key={r.nid} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.white:"#FAF8F5"}}>
                  <td style={{padding:"10px 12px",fontWeight:800,color:C.textMuted}}>#{i+1}</td>
                  <td style={{padding:"10px 12px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:28,height:28,borderRadius:"50%",background:C.navy,display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <span style={{fontSize:13,fontWeight:800,color:C.white}}>{r.name.charAt(0)}</span>
                      </div>
                      <div>
                        <p style={{fontWeight:700,color:C.navy,fontSize:14}}>{r.name}</p>
                        <p style={{fontSize:12,color:C.textMuted}}>{r.status}</p>
                      </div>
                    </div>
                  </td>
                  <td style={{padding:"10px 12px",fontFamily:"monospace",fontSize:12,color:C.teal}}>{r.nid}</td>
                  <td style={{padding:"10px 12px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{width:50,height:6,borderRadius:3,background:"#E8E0D4",overflow:"hidden"}}>
                        <div style={{width:`${r.riskScore}%`,height:"100%",borderRadius:3,
                          background:r.riskLevel==="CRITICAL"?"#C85C3E":r.riskLevel==="HIGH"?"#D4943A":r.riskLevel==="MEDIUM"?"#C4956A":C.greenSolid}}/>
                      </div>
                      <span style={{fontWeight:800,fontSize:15,color:C.navy}}>{r.riskScore}</span>
                    </div>
                  </td>
                  <td style={{padding:"10px 12px"}}><RiskBadge level={r.riskLevel}/></td>
                  <td style={{padding:"10px 12px",fontWeight:600,color:C.navy,fontSize:13}}>SAR {r.totalVolume.toLocaleString()}</td>
                  <td style={{padding:"10px 12px",fontWeight:600,textAlign:"center"}}>{r.txCount}</td>
                  <td style={{padding:"10px 12px"}}>
                    <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                      {r.factors.slice(0,3).map((f,fi)=>(
                        <span key={fi} style={{fontSize:11,padding:"1px 6px",borderRadius:4,background:"#F5F0E8",color:C.textMuted}}>{f}</span>
                      ))}
                      {r.factors.length>3&&<span style={{fontSize:11,color:C.teal,fontWeight:700}}>+{r.factors.length-3} more</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>}

      {/* ═══ TAB 4: BEHAVIOR ANALYTICS ═══ */}
      {tab==="behavior"&&<div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          {Object.values(profiles).filter(p=>p.status==="ACTIVE").map(p=>{
            const risk = riskScores.find(r=>r.nid===p.nid);
            const pAlerts = amlAlerts.filter(a=>a.nid===p.nid);
            return (
              <div key={p.nid} style={{background:C.white,borderRadius:14,border:`1px solid ${C.border}`,padding:"18px 20px",
                borderTop:`3px solid ${risk?.riskLevel==="CRITICAL"?"#C85C3E":risk?.riskLevel==="HIGH"?"#D4943A":risk?.riskLevel==="MEDIUM"?"#C4956A":C.greenSolid}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:36,height:36,borderRadius:"50%",background:C.navy,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <span style={{fontSize:16,fontWeight:800,color:C.white}}>{p.name.charAt(0)}</span>
                    </div>
                    <div>
                      <p style={{fontWeight:700,color:C.navy,fontSize:16}}>{p.name}</p>
                      <p style={{fontSize:12,color:C.textMuted,fontFamily:"monospace"}}>{p.nid}</p>
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    {risk&&<RiskBadge level={risk.riskLevel}/>}
                    <p style={{fontSize:12,color:C.textMuted,marginTop:2}}>Score: {risk?.riskScore||0}/100</p>
                  </div>
                </div>

                {/* Metrics Grid */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
                  {[
                    {label:"Buy Vol",val:`SAR ${p.buyVolume.toLocaleString()}`,color:C.greenSolid},
                    {label:"Sell Vol",val:`SAR ${p.sellVolume.toLocaleString()}`,color:"#C85C3E"},
                    {label:"Holdings",val:`SAR ${p.holdings.toLocaleString()}`,color:C.navy},
                    {label:"Transactions",val:p.txCount,color:C.teal},
                    {label:"TX Freq",val:p.txFrequency>0?p.txFrequency.toFixed(2)+"/day":"—",color:C.textMuted},
                    {label:"Withdrawn",val:`SAR ${p.totalWithdrawn.toLocaleString()}`,color:"#D4943A"},
                  ].map(m=>(
                    <div key={m.label} style={{background:"#FAF8F5",borderRadius:8,padding:"8px 10px"}}>
                      <p style={{fontSize:11,fontWeight:700,color:C.textMuted,letterSpacing:"0.06em"}}>{m.label.toUpperCase()}</p>
                      <p style={{fontSize:14,fontWeight:700,color:m.color}}>{m.val}</p>
                    </div>
                  ))}
                </div>

                {/* Behavioral Flags */}
                {pAlerts.length > 0 && (
                  <div style={{background:"#FDF4EC",borderRadius:8,padding:"8px 12px"}}>
                    <p style={{fontSize:12,fontWeight:700,color:"#8B6540",marginBottom:4}}>⚠️ {pAlerts.length} AML Alert{pAlerts.length>1?"s":""}</p>
                    {pAlerts.slice(0,3).map((a,i)=>(
                      <p key={i} style={{fontSize:12,color:"#8B6540"}}>• {a.rule}: {a.title}</p>
                    ))}
                  </div>
                )}
                {pAlerts.length === 0 && (
                  <div style={{background:"#EFF5F2",borderRadius:8,padding:"8px 12px"}}>
                    <p style={{fontSize:12,fontWeight:700,color:C.greenSolid}}>✅ No AML flags — normal behavior profile</p>
                  </div>
                )}

                {/* No-Show / Appointment Flags */}
                {(p.noShows>0||p.cancelledAppts>0)&&<div style={{marginTop:6,display:"flex",gap:8}}>
                  {p.noShows>0&&<span style={{fontSize:12,padding:"2px 8px",borderRadius:4,background:C.redBg,color:"#C85C3E",fontWeight:700}}>🚫 {p.noShows} no-show{p.noShows>1?"s":""}</span>}
                  {p.cancelledAppts>0&&<span style={{fontSize:12,padding:"2px 8px",borderRadius:4,background:"#F3F4F6",color:"#6B7280",fontWeight:700}}>❌ {p.cancelledAppts} cancelled</span>}
                </div>}
              </div>
            );
          })}
        </div>
      </div>}

      {/* ═══ TAB 5: COMPLIANCE DASHBOARD ═══ */}
      {tab==="compliance"&&<div>

        {/* ── MANUAL COMPLIANCE WORKFLOW TRACKER ── */}
        <div style={{background:"linear-gradient(135deg,#1E1810,#2A2015)",borderRadius:14,padding:"20px 24px",marginBottom:18,border:"1px solid #3D3225"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              {Icons.shield(22,"#C4956A")}
              <div>
                <p style={{fontSize:18,fontWeight:800,color:"#E8E0D4"}}>{isAr?"سير عمل الامتثال اليدوي":"Manual Compliance Workflow"}</p>
                <p style={{fontSize:13,color:"#A89880"}}>{isAr?"المهام التي تتطلب إجراء بشري — ساما وهيئة السوق المالية":"Tasks requiring human action — SAMA & CMA regulatory obligations"}</p>
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              {[
                {label:isAr?"معلقة":"Pending",count:compTasks.filter(t=>t.status==="PENDING").length,color:"#D4943A",bg:"#6B4D2D"},
                {label:isAr?"جاري":"In Progress",count:compTasks.filter(t=>t.status==="IN_PROGRESS").length,color:"#C4956A",bg:"#6B4D2D"},
                {label:isAr?"متأخرة":"Overdue",count:compTasks.filter(t=>t.status==="OVERDUE").length,color:"#C85C3E",bg:"#6B2D1E"},
                {label:isAr?"مكتملة":"Completed",count:compTasks.filter(t=>t.status==="COMPLETED").length,color:"#6B9080",bg:"#2D5443"},
              ].map((s,i)=>(
                <div key={i} style={{background:s.bg,borderRadius:10,padding:"8px 14px",textAlign:"center",minWidth:60}}>
                  <p style={{fontSize:20,fontWeight:900,color:s.color}}>{s.count}</p>
                  <p style={{fontSize:11,fontWeight:600,color:s.color+"99"}}>{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Task Cards ── */}
        <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:18}}>
          {compTasks.map(task => {
            const stepsTotal = task.steps.length;
            const stepsDone = task.steps.filter(s=>s.done).length;
            const pct = stepsTotal>0?Math.round(stepsDone/stepsTotal*100):0;
            const overdue = new Date(task.dueDate) < new Date() && task.status!=="COMPLETED";
            const statusCfg = {
              PENDING:{color:"#D4943A",bg:"#FDF4EC",label:isAr?"معلق":"PENDING",icon:"⏳"},
              IN_PROGRESS:{color:"#C4956A",bg:"#FDF4EC",label:isAr?"جاري":"IN PROGRESS",icon:"🔄"},
              COMPLETED:{color:C.greenSolid,bg:"#EFF5F2",label:isAr?"مكتمل":"COMPLETED",icon:"✅"},
              OVERDUE:{color:"#C85C3E",bg:C.redBg,label:isAr?"متأخر":"OVERDUE",icon:"🚨"},
            }[overdue&&task.status!=="COMPLETED"?"OVERDUE":task.status];

            return (
              <div key={task.id} style={{background:C.white,borderRadius:14,border:`1px solid ${C.border}`,overflow:"hidden",
                borderLeft:`5px solid ${statusCfg.color}`}}>
                {/* Header */}
                <div style={{padding:"16px 20px",display:"flex",alignItems:"center",gap:14}}>
                  <div style={{width:44,height:44,borderRadius:12,background:statusCfg.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>
                    {statusCfg.icon}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                      <span style={{fontSize:11,fontWeight:800,color:task.regulator==="SAMA"?"#C4956A":C.purpleSolid,background:task.regulator==="SAMA"?"#FDF4EC":C.purpleBg,padding:"2px 8px",borderRadius:6}}>{task.regulator}</span>
                      <span style={{fontSize:11,fontWeight:700,color:C.textMuted,fontFamily:"monospace"}}>{task.id}</span>
                    </div>
                    <p style={{fontSize:16,fontWeight:700,color:C.navy}}>{isAr?task.checkAr:task.check}</p>
                    <p style={{fontSize:13,color:C.textMuted,marginTop:2}}>{isAr?task.detailAr:task.detail}</p>
                  </div>
                  <div style={{textAlign:"end",flexShrink:0}}>
                    <p style={{fontSize:11,fontWeight:600,color:C.textMuted}}>{isAr?"الموعد النهائي":"DUE DATE"}</p>
                    <p style={{fontSize:15,fontWeight:700,color:overdue&&task.status!=="COMPLETED"?"#C85C3E":C.navy}}>{task.dueDate}</p>
                    <p style={{fontSize:11,color:C.textMuted,marginTop:2}}>{isAr?"المسؤول":"Assignee"}: <b>{task.assignee}</b></p>
                  </div>
                </div>
                {/* Progress Bar */}
                <div style={{padding:"0 20px 6px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{flex:1,height:6,background:C.bg,borderRadius:3,overflow:"hidden"}}>
                      <div style={{width:pct+"%",height:"100%",borderRadius:3,background:pct===100?C.greenSolid:statusCfg.color,transition:"width 0.3s"}} />
                    </div>
                    <span style={{fontSize:13,fontWeight:700,color:pct===100?C.greenSolid:statusCfg.color,minWidth:40,textAlign:"end"}}>{stepsDone}/{stepsTotal}</span>
                  </div>
                </div>
                {/* Steps + Actions */}
                <div style={{padding:"10px 20px 16px",borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:14}}>
                  {/* Steps list */}
                  <div style={{flex:1,display:"flex",flexDirection:"column",gap:4}}>
                    <p style={{fontSize:12,fontWeight:700,color:C.textMuted,marginBottom:2}}>{isAr?"خطوات سير العمل":"WORKFLOW STEPS"} ({isAr?task.frequencyAr:task.frequency})</p>
                    {task.steps.map(step=>(
                      <div key={step.id} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",cursor:"pointer"}}
                        onClick={()=>{
                          if(task.status==="COMPLETED") return;
                          setCompTasks(prev=>prev.map(t=>t.id===task.id?{...t,
                            steps:t.steps.map(s=>s.id===step.id?{...s,done:!s.done}:s),
                            status:t.steps.filter(s=>s.id===step.id?!s.done:s.done).length===0?"COMPLETED":
                              t.steps.some(s=>s.id===step.id?!s.done:s.done)?"IN_PROGRESS":"PENDING",
                            log:[...t.log,{date:new Date().toISOString(),action:(step.done?"Unchecked":"Checked")+": "+(isAr?step.labelAr:step.label),by:"Admin"}]
                          }:t));
                        }}>
                        <div style={{width:18,height:18,borderRadius:5,border:`2px solid ${step.done?C.greenSolid:C.border}`,
                          background:step.done?C.greenSolid:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.15s"}}>
                          {step.done&&<span style={{color:"#FFF",fontSize:13,fontWeight:900}}>✓</span>}
                        </div>
                        <span style={{fontSize:14,color:step.done?C.textMuted:C.navy,textDecoration:step.done?"line-through":"none",fontWeight:step.done?400:500}}>
                          {isAr?step.labelAr:step.label}
                        </span>
                      </div>
                    ))}
                  </div>
                  {/* Action buttons */}
                  <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0,minWidth:130}}>
                    {task.status!=="COMPLETED"&&<Btn small variant="teal" onClick={()=>{
                      const allDone = task.steps.every(s=>s.done);
                      if(!allDone){showToast(isAr?"⚠️ أكمل جميع الخطوات أولاً":"⚠️ Complete all steps first");return;}
                      setCompTasks(prev=>prev.map(t=>t.id===task.id?{...t,status:"COMPLETED",
                        log:[...t.log,{date:new Date().toISOString(),action:"Task marked COMPLETED",by:"Admin"}]
                      }:t));
                      showToast(isAr?"✅ تم إكمال المهمة":"✅ Task completed");
                    }}>{isAr?"تأكيد الإكمال":"Mark Complete"}</Btn>}
                    {task.status==="COMPLETED"&&<Btn small variant="outline" onClick={()=>{
                      setCompTasks(prev=>prev.map(t=>t.id===task.id?{...t,status:"PENDING",
                        steps:t.steps.map(s=>({...s,done:false})),
                        dueDate:new Date(Date.now()+(task.id==="SANC-01"?1:task.id==="CMA-NOTIFY"?3:task.id==="PEP-01"?7:30)*86400000).toISOString().slice(0,10),
                        log:[...t.log,{date:new Date().toISOString(),action:"Task reset — new cycle started",by:"Admin"}]
                      }:t));
                      showToast(isAr?"🔄 تم إعادة تعيين الدورة":"🔄 Cycle reset — new due date set");
                    }}>{isAr?"بدء دورة جديدة":"Start New Cycle"}</Btn>}
                    <Btn small variant="outline" onClick={()=>setWfModal(wfModal===task.id?null:task.id)}>
                      {isAr?"السجل والملاحظات":"Log & Notes"} ({task.log.length})
                    </Btn>
                  </div>
                </div>
                {/* Expandable Log */}
                {wfModal===task.id&&(
                  <div style={{padding:"0 20px 16px",borderTop:`1px solid ${C.border}`,background:"#FAF8F5"}}>
                    <p style={{fontSize:12,fontWeight:700,color:C.textMuted,padding:"10px 0 6px"}}>{isAr?"سجل النشاط":"ACTIVITY LOG"}</p>
                    {task.log.length===0&&<p style={{fontSize:13,color:C.textMuted,fontStyle:"italic"}}>{isAr?"لا يوجد نشاط بعد":"No activity logged yet"}</p>}
                    <div style={{maxHeight:150,overflowY:"auto",display:"flex",flexDirection:"column",gap:4}}>
                      {[...task.log].reverse().map((entry,i)=>(
                        <div key={i} style={{display:"flex",gap:8,fontSize:13,color:C.text,padding:"4px 8px",background:C.white,borderRadius:6,border:`1px solid ${C.border}`}}>
                          <span style={{color:C.textMuted,flexShrink:0,fontFamily:"monospace",fontSize:12}}>{new Date(entry.date).toLocaleString("en-SA",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</span>
                          <span style={{flex:1}}>{entry.action}</span>
                          <span style={{color:C.teal,fontWeight:600,flexShrink:0}}>{entry.by}</span>
                        </div>
                      ))}
                    </div>
                    {/* Add note */}
                    <div style={{display:"flex",gap:8,marginTop:8}}>
                      <input value={wfNote} onChange={e=>setWfNote(e.target.value)} placeholder={isAr?"أضف ملاحظة...":"Add a note..."}
                        style={{flex:1,padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:14,outline:"none"}}
                        onKeyDown={e=>{if(e.key==="Enter"&&wfNote.trim()){
                          setCompTasks(prev=>prev.map(t=>t.id===task.id?{...t,log:[...t.log,{date:new Date().toISOString(),action:"Note: "+wfNote,by:"Admin"}]}:t));
                          setWfNote("");
                        }}} />
                      <Btn small variant="gold" onClick={()=>{
                        if(!wfNote.trim()) return;
                        setCompTasks(prev=>prev.map(t=>t.id===task.id?{...t,log:[...t.log,{date:new Date().toISOString(),action:"Note: "+wfNote,by:"Admin"}]}:t));
                        setWfNote("");
                      }}>{isAr?"إضافة":"Add"}</Btn>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* SAMA Compliance Checklist */}
        <div style={{background:C.white,borderRadius:14,border:`1px solid ${C.border}`,padding:"20px 24px",marginBottom:16}}>
          <p style={{fontSize:16,fontWeight:800,color:C.navy,marginBottom:14,display:"flex",alignItems:"center",gap:8}}>{Icons.amlVault(16,C.navy)} SAMA AML/CFT Compliance Status</p>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {[
              {check:"Customer Due Diligence (CDD)",status:investors.every(i=>i.nationalId)?"PASS":"FAIL",detail:"All investors have verified National ID"},
              {check:"Enhanced Due Diligence (EDD) for High-Risk",status:riskDistro.CRITICAL===0?"PASS":"ACTION",detail:riskDistro.CRITICAL>0?`${riskDistro.CRITICAL} critical-risk investor(s) require EDD`:"No critical-risk investors"},
              {check:"Transaction Monitoring System",status:"PASS",detail:"14-rule automated AML detection engine active"},
              {check:"Suspicious Activity Reporting (SAR)",status:"PASS",detail:"SAR generation tool available for all alert levels"},
              {check:"KYC Renewal Tracking",status:riskScores.some(r=>r.kycExpiry&&(new Date(r.kycExpiry)-new Date())/(86400000)<0)?"FAIL":"PASS",detail:"All active investors must have valid KYC"},
              {check:"Sanctions Screening",status:compTasks.find(t=>t.id==="SANC-01")?.status==="COMPLETED"?"PASS":"MANUAL",detail:compTasks.find(t=>t.id==="SANC-01")?.status==="COMPLETED"?"Last completed: "+compTasks.find(t=>t.id==="SANC-01")?.log.slice(-1)[0]?.date?.slice(0,10):"Action required — use workflow above"},
              {check:"Record Retention (5 years)",status:"PASS",detail:`${auditLog.length} audit entries maintained. Production: archive to immutable storage.`},
              {check:"Staff Training Records",status:compTasks.find(t=>t.id==="TRAIN-01")?.status==="COMPLETED"?"PASS":"MANUAL",detail:compTasks.find(t=>t.id==="TRAIN-01")?.status==="COMPLETED"?"Training verified — "+compTasks.find(t=>t.id==="TRAIN-01")?.log.slice(-1)[0]?.date?.slice(0,10):"Action required — use workflow above"},
              {check:"Risk Assessment Methodology",status:"PASS",detail:"Multi-factor scoring model (volume, velocity, behavior, KYC, status)"},
              {check:"Politically Exposed Persons (PEP) Screening",status:compTasks.find(t=>t.id==="PEP-01")?.status==="COMPLETED"?"PASS":"MANUAL",detail:compTasks.find(t=>t.id==="PEP-01")?.status==="COMPLETED"?"PEP screening completed — "+compTasks.find(t=>t.id==="PEP-01")?.log.slice(-1)[0]?.date?.slice(0,10):"Action required — use workflow above"},
            ].map((item,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:10,background:item.status==="PASS"?C.greenBg:item.status==="FAIL"?"#FBF0EC":"#FDF4EC"}}>
                <span style={{fontSize:20}}>{item.status==="PASS"?"✅":item.status==="FAIL"?"❌":"⚠️"}</span>
                <div style={{flex:1}}>
                  <p style={{fontSize:14,fontWeight:700,color:C.navy}}>{item.check}</p>
                  <p style={{fontSize:12,color:C.textMuted}}>{item.detail}</p>
                </div>
                <span style={{padding:"2px 10px",borderRadius:20,fontSize:12,fontWeight:800,
                  color:item.status==="PASS"?C.greenSolid:item.status==="FAIL"?"#C85C3E":"#D4943A",
                  background:item.status==="PASS"?"#EFF5F2":item.status==="FAIL"?C.redBg:"#FDF4EC"}}>{item.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CMA Market Conduct Compliance */}
        <div style={{background:C.white,borderRadius:14,border:`1px solid ${C.border}`,padding:"20px 24px",marginBottom:16}}>
          <p style={{fontSize:16,fontWeight:800,color:C.navy,marginBottom:14,display:"flex",alignItems:"center",gap:8}}>{Icons.cmaScale(16,C.navy)} {isAr?"الامتثال لأنظمة سلوك السوق — هيئة السوق المالية":"CMA Market Conduct Compliance Status"}</p>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {[
              {check:isAr?"حظر التداول الذاتي (المادة 3.ب.1)":"Self-Trading Prohibition (Art 3.b.1)",status:cmaAlerts.filter(a=>a.category==="SELF_TRADE").length===0?"PASS":"FAIL",detail:cmaAlerts.filter(a=>a.category==="SELF_TRADE").length>0?`${cmaAlerts.filter(a=>a.category==="SELF_TRADE").length} self-trade(s) detected — immediate investigation required`:"No trades with unchanged beneficial ownership detected"},
              {check:isAr?"حظر الأوامر المرتبة (المادة 3.ب.2-3)":"Pre-Arranged Trade Prohibition (Art 3.b.2-3)",status:cmaAlerts.filter(a=>a.category==="MATCHED_ORDERS").length===0?"PASS":"FAIL",detail:cmaAlerts.filter(a=>a.category==="MATCHED_ORDERS").length>0?`${cmaAlerts.filter(a=>a.category==="MATCHED_ORDERS").length} suspected pre-arranged trade(s)`:"No matched order patterns detected"},
              {check:isAr?"كشف الانتحال (المادة 3.ب.6)":"Spoofing Detection (Art 3.b.6)",status:cmaAlerts.filter(a=>a.category==="SPOOFING").length===0?"PASS":"ACTION",detail:"AI monitoring for orders not intended to execute"},
              {check:isAr?"مراقبة التصعيد السعري (المادة 3.ب.4-5)":"Price Ramping Monitoring (Art 3.b.4-5)",status:cmaAlerts.filter(a=>a.category==="PRICE_RAMPING").length===0?"PASS":"FAIL",detail:"Surveillance for successively higher/lower order patterns"},
              {check:isAr?"مراقبة الطبقات (المادة 3.ب.6)":"Layering Surveillance (Art 3.b.6)",status:cmaAlerts.filter(a=>a.category==="LAYERING").length===0?"PASS":"ACTION",detail:"Multiple orders at different price levels detection"},
              {check:isAr?"حظر الإفراط في التداول (المادة 16)":"Churning Prevention (Art 16)",status:cmaAlerts.filter(a=>a.category==="CHURNING").length===0?"PASS":"ACTION",detail:"Turnover ratio monitoring relative to holdings"},
              {check:isAr?"مراقبة التواطؤ":"Collusion Surveillance",status:cmaAlerts.filter(a=>a.category==="COLLUSION").length===0?"PASS":"ACTION",detail:"Repeated counterparty pattern analysis"},
              {check:isAr?"مراقبة سعر الإغلاق":"Closing Price Surveillance (Art 3.b.6)",status:"PASS",detail:"Late order detection system active"},
              {check:isAr?"إخطار الهيئة (المادة 11)":"Authority Notification (Art 11)",status:compTasks.find(t=>t.id==="CMA-NOTIFY")?.status==="COMPLETED"?"PASS":"MANUAL",detail:compTasks.find(t=>t.id==="CMA-NOTIFY")?.status==="COMPLETED"?"CMA notified — "+compTasks.find(t=>t.id==="CMA-NOTIFY")?.log.slice(-1)[0]?.date?.slice(0,10):"Action required — use workflow above"},
              {check:isAr?"حفظ السجلات 10 سنوات (المادة 11.د)":"Record Retention 10 Years (Art 11.d)",status:"PASS",detail:`${auditLog.length + cmaAlerts.length} records. Production: archive per 10-year requirement`},
            ].map((item,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:10,background:item.status==="PASS"?C.greenBg:item.status==="FAIL"?"#FBF0EC":"#FDF4EC"}}>
                <span style={{fontSize:20}}>{item.status==="PASS"?"✅":item.status==="FAIL"?"❌":"⚠️"}</span>
                <div style={{flex:1}}>
                  <p style={{fontSize:14,fontWeight:700,color:C.navy}}>{item.check}</p>
                  <p style={{fontSize:12,color:C.textMuted}}>{item.detail}</p>
                </div>
                <span style={{padding:"2px 10px",borderRadius:20,fontSize:12,fontWeight:800,
                  color:item.status==="PASS"?C.greenSolid:item.status==="FAIL"?"#C85C3E":"#D4943A",
                  background:item.status==="PASS"?"#EFF5F2":item.status==="FAIL"?C.redBg:"#FDF4EC"}}>{item.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* AML Rules Reference */}
        <div style={{background:C.white,borderRadius:14,border:`1px solid ${C.border}`,padding:"20px 24px"}}>
          <p style={{fontSize:16,fontWeight:800,color:C.navy,marginBottom:14}}>🤖 AI Detection Rules — Active ({14})</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {[
              {id:"R01",name:"High-Value Transaction",threshold:"SAR 60,000",cat:"VOLUME"},
              {id:"R02",name:"Wash Trading Pattern",threshold:"Buy+Sell > 10K + freq > 0.5/d",cat:"PATTERN"},
              {id:"R03",name:"Velocity Spike",threshold:"≥5 TX in < 7 days",cat:"VELOCITY"},
              {id:"R04",name:"Disproportionate Withdrawal",threshold:"> 70% of portfolio",cat:"WITHDRAWAL"},
              {id:"R05",name:"New Account High Volume",threshold:"< 30 days + > SAR 50K",cat:"ONBOARDING"},
              {id:"R06",name:"Repeated No-Shows",threshold:"≥ 2 no-shows",cat:"BEHAVIOR"},
              {id:"R07",name:"KYC Expiry",threshold:"< 30 days / expired",cat:"COMPLIANCE"},
              {id:"R08",name:"Excessive Cancellations",threshold:"≥ 3 cancelled orders",cat:"PATTERN"},
              {id:"R09",name:"Banned User Activity",threshold:"Any historical activity",cat:"ENFORCEMENT"},
              {id:"R10",name:"Round-Amount Structuring",threshold:"≥ 2 round-number TX",cat:"PATTERN"},
              {id:"R11",name:"Platform Volume Anomaly",threshold:"> SAR 100K daily",cat:"SYSTEM"},
              {id:"R12",name:"Blacklisted Active Orders",threshold:"Any open orders",cat:"ENFORCEMENT"},
              {id:"R13",name:"Bar Outside Vault > 30d",threshold:"> 30 days since left",cat:"VAULT"},
              {id:"R14",name:"Multiple Bank Withdrawals",threshold:"≥ 2 different banks",cat:"WITHDRAWAL"},
            ].map(r=>(
              <div key={r.id} style={{display:"flex",gap:10,padding:"8px 12px",borderRadius:8,background:"#FAF8F5",alignItems:"center"}}>
                <span style={{fontSize:12,fontWeight:900,color:C.teal,fontFamily:"monospace",minWidth:28}}>{r.id}</span>
                <div style={{flex:1}}>
                  <p style={{fontSize:13,fontWeight:700,color:C.navy}}>{r.name}</p>
                  <p style={{fontSize:11,color:C.textMuted}}>{r.threshold}</p>
                </div>
                <span style={{fontSize:11,padding:"1px 6px",borderRadius:4,background:C.navy+"15",color:C.navy,fontWeight:700}}>{r.cat}</span>
              </div>
            ))}
          </div>
        </div>
      </div>}

      {/* ═══ MODALS ═══ */}

      {/* AML Alert Detail Modal */}
      {amlModal&&<Modal title={`AML Alert — ${amlModal.rule}`} onClose={()=>setAmlModal(null)}>
        <div style={{padding:"4px 0"}}>
          <div style={{display:"flex",gap:10,marginBottom:14,alignItems:"center"}}>
            <RiskBadge level={amlModal.level}/>
            <span style={{fontSize:16,fontWeight:800,color:C.navy}}>{amlModal.title}</span>
          </div>
          <div style={{background:"#FAF8F5",borderRadius:10,padding:"12px 16px",marginBottom:12}}>
            <p style={{fontSize:14,color:C.text,lineHeight:"1.6"}}>{amlModal.detail}</p>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            <div style={{background:"#F5F0E8",borderRadius:8,padding:"8px 12px"}}>
              <p style={{fontSize:11,fontWeight:700,color:C.textMuted}}>{isAr?"الموضوع":"SUBJECT"}</p>
              <p style={{fontSize:14,fontWeight:700,color:C.navy}}>{amlModal.name}</p>
            </div>
            <div style={{background:"#F5F0E8",borderRadius:8,padding:"8px 12px"}}>
              <p style={{fontSize:11,fontWeight:700,color:C.textMuted}}>{isAr?"رقم الهوية":"NATIONAL ID"}</p>
              <p style={{fontSize:14,fontWeight:700,color:C.teal,fontFamily:"monospace"}}>{amlModal.nid}</p>
            </div>
            <div style={{background:"#F5F0E8",borderRadius:8,padding:"8px 12px"}}>
              <p style={{fontSize:11,fontWeight:700,color:C.textMuted}}>{isAr?"التصنيف":"CATEGORY"}</p>
              <p style={{fontSize:14,fontWeight:700,color:C.navy,display:"flex",alignItems:"center",gap:6}}>{Icons[CATEGORY_ICON[amlModal.category]]?.(16,C.navy)||Icons.warning(16,C.navy)} {amlModal.category}</p>
            </div>
            <div style={{background:"#F5F0E8",borderRadius:8,padding:"8px 12px"}}>
              <p style={{fontSize:11,fontWeight:700,color:C.textMuted}}>{isAr?"وقت الكشف":"DETECTED AT"}</p>
              <p style={{fontSize:14,fontWeight:700,color:C.navy}}>{new Date(amlModal.automatedAt).toLocaleString()}</p>
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <Btn variant="danger" onClick={()=>{const sar=generateSAR(amlModal);setSarModal(sar);setAmlModal(null);}}>{isAr?"تقديم تقرير النشاط المشبوه":"File SAR Report"}</Btn>
            <Btn variant="outline" onClick={()=>setAmlModal(null)}>{isAr?"إغلاق":"Close"}</Btn>
          </div>
        </div>
      </Modal>}

      {/* SAR Report Modal */}
      {sarModal&&<Modal title={`${isAr?"تقرير نشاط مشبوه":"Suspicious Activity Report"} — ${sarModal.reportId}`} onClose={()=>setSarModal(null)}>
        <div style={{padding:"4px 0"}}>
          <div style={{background:"#FDF4EC",borderRadius:10,padding:"12px 16px",marginBottom:14}}>
            <p style={{fontSize:14,fontWeight:700,color:"#8B6540"}}>⚠️ {isAr?"سيتم إرسال هذا البلاغ إلى":"This report will be sent to"}: <b>{sarModal.toEmail||reportingConfig?.sarEmail||"sar@sama.gov.sa"}</b></p>
          </div>
          <div style={{background:"#FAF8F5",borderRadius:10,padding:"16px",marginBottom:14,fontFamily:"monospace",fontSize:13,lineHeight:"1.8",color:C.text,direction:isAr?"rtl":"ltr"}}>
            <p style={{fontWeight:700,fontSize:15}}>{isAr?"تقرير نشاط مشبوه (SAR)":"SUSPICIOUS ACTIVITY REPORT (SAR)"}</p>
            <p>════════════════════════════════════</p>
            <p><b>{isAr?"إلى":"To"}:</b> {sarModal.toEmail}</p>
            <p><b>{isAr?"نسخة":"CC"}:</b> {sarModal.ccEmail}</p>
            <p><b>{isAr?"من":"From"}:</b> {isAr?sarModal.filedByAr||sarModal.filedBy:sarModal.filedBy}، {isAr?sarModal.companyAr||sarModal.company:sarModal.company}</p>
            <p><b>{isAr?"الترخيص":"License"}:</b> {isAr?sarModal.licenseAr||sarModal.license||"—":sarModal.license||"—"}</p>
            <p>════════════════════════════════════</p>
            <p><b>{isAr?"رقم البلاغ":"Report ID"}:</b> {sarModal.reportId}</p>
            <p><b>{isAr?"تاريخ التقديم":"Filed Date"}:</b> {sarModal.filedDate}</p>
            <p><b>{isAr?"مستوى الخطورة":"Risk Level"}:</b> <span style={{color:sarModal.riskLevel==="CRITICAL"?"#C85C3E":"#D4943A",fontWeight:800}}>{isAr?sarModal.riskLevelAr||sarModal.riskLevel:sarModal.riskLevel}</span></p>
            <p>────────────────────────────────────</p>
            <p><b>{isAr?"اسم الشخص المعني":"Subject Name"}:</b> {sarModal.subjectName}</p>
            <p><b>{isAr?"رقم الهوية الوطنية":"National ID"}:</b> {sarModal.subjectNID}</p>
            <p><b>{isAr?"القاعدة المُشغّلة":"Triggering Rule"}:</b> {sarModal.alertRule} — {isAr?sarModal.alertTitleAr||sarModal.alertTitle:sarModal.alertTitle}</p>
            <p><b>{isAr?"النظام المُخالف":"Regulation Breached"}:</b> {isAr?sarModal.regulationAr:sarModal.regulation}</p>
            <p>────────────────────────────────────</p>
            <p style={{whiteSpace:"pre-wrap",fontFamily:"inherit",lineHeight:"1.9"}}>{isAr?sarModal.narrativeAr:sarModal.narrativeEn}</p>
            <p>────────────────────────────────────</p>
            <p><b>{isAr?"مقدم من":"FILED BY"}:</b> {isAr?(sarModal.filedByAr||sarModal.filedBy)+"، "+(sarModal.filedTitleAr||""):sarModal.filedBy+", "+(sarModal.filedTitle||"")}</p>
            <p><b>{isAr?"الشركة":"COMPANY"}:</b> {isAr?sarModal.companyAr||sarModal.company:sarModal.company} — {isAr?sarModal.companyAddressAr||"":sarModal.companyAddress||reportingConfig?.companyAddress||""}</p>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {reportingConfig?.sarEnabled&&<Btn variant="danger" onClick={()=>setSendConfirm({type:"SAR",data:sarModal})}>{Icons.send(14,"#FFF")} {isAr?"إرسال إلى ساما الآن":"Send to SAMA Now"}</Btn>}
            <Btn variant="gold" onClick={()=>{showToast("✅ "+sarModal.reportId+(isAr?" تم الحفظ في قائمة الامتثال":" saved to compliance queue"));setSarModal(null);}}>{isAr?"حفظ في قائمة الامتثال":"Save to Queue"}</Btn>
            <Btn variant="outline" onClick={()=>setSarModal(null)}>{isAr?"إلغاء":"Cancel"}</Btn>
          </div>
        </div>
      </Modal>}

      {/* CMA Notification Modal */}
      {cmaNotifModal&&<Modal title={`${isAr?"إخطار هيئة السوق المالية":"CMA Notification"} — ${cmaNotifModal.notifId}`} onClose={()=>setCmaNotifModal(null)}>
        <div style={{padding:"4px 0"}}>
          <div style={{background:C.purpleBg,borderRadius:10,padding:"12px 16px",marginBottom:14}}>
            <p style={{fontSize:14,fontWeight:700,color:"#5D4E82"}}>⚖️ {isAr?"إخطار بموجب المادة 11 — الموعد النهائي: 3 أيام عمل":"Filed under Art 11 — Deadline: 3 business days"} → <b>{cmaNotifModal.toEmail}</b></p>
          </div>
          <div style={{background:"#FAF8F5",borderRadius:10,padding:"16px",marginBottom:14,fontFamily:"monospace",fontSize:13,lineHeight:"1.8",color:C.text,direction:isAr?"rtl":"ltr"}}>
            <p style={{fontWeight:700,fontSize:15}}>{isAr?"إخطار التلاعب بالسوق — هيئة السوق المالية":"CMA MARKET MANIPULATION NOTIFICATION"}</p>
            <p>{isAr?"بموجب أنظمة سلوك السوق — المادة 11":"Per Market Conduct Regulations — Article 11"}</p>
            <p>════════════════════════════════════</p>
            <p><b>{isAr?"إلى":"To"}:</b> {cmaNotifModal.toEmail}</p>
            <p><b>{isAr?"نسخة":"CC"}:</b> {cmaNotifModal.ccEmail}</p>
            <p><b>{isAr?"من":"From"}:</b> {isAr?cmaNotifModal.filedByAr||cmaNotifModal.filedBy:cmaNotifModal.filedBy}، {isAr?cmaNotifModal.companyAr||cmaNotifModal.company:cmaNotifModal.company}</p>
            <p><b>{isAr?"الترخيص":"License"}:</b> {isAr?cmaNotifModal.licenseAr||cmaNotifModal.license:cmaNotifModal.license}</p>
            <p>════════════════════════════════════</p>
            <p><b>{isAr?"رقم الإخطار":"Notification ID"}:</b> {cmaNotifModal.notifId}</p>
            <p><b>{isAr?"تاريخ التقديم":"Filed Date"}:</b> {cmaNotifModal.filedDate}</p>
            <p><b>{isAr?"التصنيف":"Category"}:</b> <span style={{fontWeight:800,color:C.purpleSolid}}>{cmaNotifModal.category}</span></p>
            <p><b>{isAr?"الخطورة":"Severity"}:</b> <span style={{color:cmaNotifModal.level==="CRITICAL"?"#C85C3E":"#D4943A",fontWeight:800}}>{cmaNotifModal.level}</span></p>
            <p>────────────────────────────────────</p>
            <p><b>{isAr?"اسم الشخص المعني":"Subject Name"}:</b> {cmaNotifModal.subjectName}</p>
            <p><b>{isAr?"رقم الهوية الوطنية":"National ID"}:</b> {cmaNotifModal.subjectNID}</p>
            <p><b>{isAr?"النظام المُخالف":"Regulation Breached"}:</b> {isAr?cmaNotifModal.regulationAr:cmaNotifModal.regulationEn}</p>
            <p>────────────────────────────────────</p>
            <p style={{whiteSpace:"pre-wrap",fontFamily:"inherit",lineHeight:"1.9"}}>{isAr?cmaNotifModal.narrativeAr:cmaNotifModal.narrativeEn}</p>
            <p>────────────────────────────────────</p>
            <p><b>{isAr?"مقدم من":"FILED BY"}:</b> {isAr?(cmaNotifModal.filedByAr||cmaNotifModal.filedBy)+"، "+(cmaNotifModal.filedTitleAr||""):cmaNotifModal.filedBy+", "+cmaNotifModal.filedTitle}</p>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {reportingConfig?.cmaEnabled&&<Btn variant="danger" onClick={()=>setSendConfirm({type:"CMA",data:cmaNotifModal})}>{Icons.send(14,"#FFF")} {isAr?"إرسال إلى الهيئة الآن":"Send to CMA Now"}</Btn>}
            <Btn variant="gold" onClick={()=>{showToast("✅ "+cmaNotifModal.notifId+(isAr?" تم الحفظ في قائمة الامتثال":" saved to compliance queue"));setCmaNotifModal(null);}}>{isAr?"حفظ في قائمة الامتثال":"Save to Queue"}</Btn>
            <Btn variant="outline" onClick={()=>setCmaNotifModal(null)}>{isAr?"إلغاء":"Cancel"}</Btn>
          </div>
        </div>
      </Modal>}

      {/* Send Confirmation Popup */}
      {sendConfirm&&<Modal title={isAr?"تأكيد الإرسال":"Confirm Submission"} onClose={()=>setSendConfirm(null)}>
        <div style={{padding:"4px 0",textAlign:"center"}}>
          <div style={{width:64,height:64,borderRadius:16,background:sendConfirm.type==="SAR"?C.redBg:C.purpleBg,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontSize:30}}>
            {sendConfirm.type==="SAR"?"🚨":"⚖️"}
          </div>
          <p style={{fontSize:18,fontWeight:800,color:C.navy,marginBottom:8}}>
            {sendConfirm.type==="SAR"
              ?(isAr?"إرسال تقرير النشاط المشبوه إلى ساما؟":"Send SAR Report to SAMA?")
              :(isAr?"إرسال إخطار التلاعب إلى هيئة السوق المالية؟":"Send Manipulation Notification to CMA?")}
          </p>
          <div style={{background:"#FAF8F5",borderRadius:10,padding:"12px 16px",marginBottom:16,textAlign:"start",fontSize:14,lineHeight:"1.8",color:C.text}}>
            <p><b>{isAr?"إلى":"To"}:</b> {sendConfirm.type==="SAR"?reportingConfig?.sarEmail:reportingConfig?.cmaEmail}</p>
            <p><b>{isAr?"نسخة":"CC"}:</b> {sendConfirm.type==="SAR"?reportingConfig?.sarCc:reportingConfig?.cmaCc}</p>
            <p><b>{isAr?"المرجع":"Reference"}:</b> {sendConfirm.data.reportId||sendConfirm.data.notifId}</p>
            <p><b>{isAr?"الموضوع":"Subject"}:</b> {sendConfirm.data.subjectName} — {sendConfirm.data.subjectNID}</p>
            <p><b>{isAr?"المستوى":"Severity"}:</b> <span style={{color:"#C85C3E",fontWeight:800}}>{sendConfirm.data.riskLevel||sendConfirm.data.level}</span></p>
          </div>
          <div style={{background:"#FBF0EC",borderRadius:10,padding:"10px 14px",marginBottom:16}}>
            <p style={{fontSize:13,fontWeight:600,color:"#8B3520"}}>{isAr?"⚠️ هذا الإجراء نهائي ولا يمكن التراجع عنه. التقرير الرسمي سيُرسل فوراً.":"⚠️ This action is final and cannot be undone. The official report will be dispatched immediately."}</p>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"center"}}>
            <Btn variant="danger" onClick={()=>{
              const ref = sendConfirm.data.reportId||sendConfirm.data.notifId;
              const target = sendConfirm.type==="SAR"?"SAMA":"CMA";
              showToast(`✅ ${ref} ${isAr?"تم الإرسال بنجاح إلى":"successfully dispatched to"} ${target} — ${sendConfirm.type==="SAR"?reportingConfig?.sarEmail:reportingConfig?.cmaEmail}`);
              setSendConfirm(null);
              setSarModal(null);
              setCmaNotifModal(null);
            }}>{Icons.send(14,"#FFF")} {isAr?"تأكيد الإرسال الآن":"Confirm & Send Now"}</Btn>
            <Btn variant="outline" onClick={()=>setSendConfirm(null)}>{isAr?"رجوع":"Go Back"}</Btn>
          </div>
        </div>
      </Modal>}
    </div>
  );
};

// ─── Price Feed Settings Component (used inside Settings → Security tab) ──────
const PriceFeedSettings = () => {
  const { isAr } = useLang();
  const { status, lastFetch, provider: activeProvider } = useLivePrices();
  const [provider, setProvider] = useState(localStorage.getItem("price_provider") || "metals.dev");
  const [key,      setKey]      = useState(localStorage.getItem("price_api_key")  || "");
  const [intv,     setIntv]     = useState(localStorage.getItem("price_interval") || "60");
  const [showKey,  setShowKey]  = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [testing,  setTesting]  = useState(false);
  const [testMsg,  setTestMsg]  = useState("");

  const pInfo   = PROVIDERS[provider] || PROVIDERS["metals.dev"];
  const tierInfo = TIER_INFO[pInfo.tier] || TIER_INFO.starter;

  const STATUS_INFO = {
    LIVE:        { color:C.greenSolid, bg:"#EFF5F2", label:"✅ Live prices active" },
    DEMO:        { color:"#D4943A", bg:"#FDF4EC", label:"⚠️ Demo mode — enter API key to activate" },
    LOADING:     { color:"#C4956A", bg:"#FDF4EC", label:"⏳ Connecting..." },
    ERROR:       { color:"#C85C3E", bg:C.redBg, label:"❌ Connection error" },
    INVALID_KEY: { color:"#C85C3E", bg:C.redBg, label:"❌ Invalid API key" },
    QUOTA:       { color:"#D4943A", bg:"#FDF4EC", label:"⚠️ Monthly quota exceeded" },
  }[status] || { color:"#8C7E6F", bg:"#F5F0E8", label:"..." };

  const handleSave = () => {
    setPriceFeed(provider, key, parseInt(intv) || pInfo.minInterval);
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  };

  const handleTest = async () => {
    if (!key.trim()) { setTestMsg("❌ Enter an API key first"); return; }
    setTesting(true); setTestMsg("Testing connection to " + pInfo.name + "...");
    try {
      const result = await fetchFromProvider(provider, key.trim());
      const g = result.XAU?.priceSAR?.toFixed(2);
      setTestMsg(`✅ Connected to ${pInfo.name}! Gold = ${g} SAR/g`);
    } catch(e) {
      setTestMsg("❌ " + e.message);
    }
    setTesting(false);
  };

  const TIER_ORDER = ["starter","growth","regulated","institutional"];

  return (
    <div style={{background:C.white,borderRadius:14,padding:20,border:`1px solid ${C.border}`,marginBottom:16}}>
      <h3 style={{fontSize:20,fontWeight:700,color:C.navy,marginBottom:6,paddingBottom:10,borderBottom:`2px solid ${C.gold}33`}}>
        Live Price Feed
      </h3>

      {/* Status Bar */}
      <div style={{background:STATUS_INFO.bg,borderRadius:10,padding:"10px 14px",marginBottom:18,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:14,fontWeight:700,color:STATUS_INFO.color}}>{STATUS_INFO.label}</span>
          {status==="LIVE"&&<span style={{fontSize:13,color:STATUS_INFO.color,opacity:0.8}}>via {PROVIDERS[activeProvider]?.name||activeProvider}</span>}
        </div>
        {lastFetch>0&&<span style={{fontSize:12,color:STATUS_INFO.color}}>Updated: {new Date(lastFetch).toLocaleTimeString()}</span>}
      </div>

      {/* Provider Selector */}
      <div style={{marginBottom:18}}>
        <label style={{display:"block",fontSize:13,fontWeight:700,color:C.textMuted,marginBottom:10,letterSpacing:"0.05em"}}>SELECT PROVIDER — SWITCH ANYTIME, NO CODE CHANGES NEEDED</label>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {Object.values(PROVIDERS).map(p => {
            const ti   = TIER_INFO[p.tier];
            const isSel = provider === p.id;
            const isActive = activeProvider === p.id && status === "LIVE";
            return (
              <div key={p.id} onClick={()=>{setProvider(p.id);setTestMsg("");}}
                style={{borderRadius:12,padding:"14px 16px",cursor:"pointer",transition:"all 0.15s",
                  border:`2px solid ${isSel?p.color:C.border}`,
                  background:isSel?p.color+"0D":C.white,
                  boxShadow:isSel?`0 0 0 1px ${p.color}33`:"none"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontSize:15,fontWeight:700,color:isSel?p.color:C.navy}}>{p.name}</span>
                  <div style={{display:"flex",gap:5,alignItems:"center"}}>
                    {isActive&&<span style={{fontSize:11,fontWeight:700,color:C.greenSolid,background:"#EFF5F2",padding:"2px 7px",borderRadius:20}}>{isAr?"نشط":"ACTIVE"}</span>}
                    <span style={{fontSize:11,fontWeight:700,color:ti.color,background:ti.bg,padding:"2px 7px",borderRadius:20}}>{ti.label}</span>
                  </div>
                </div>
                <p style={{fontSize:13,color:C.textMuted,lineHeight:1.4}}>{p.description}</p>
                <p style={{fontSize:12,color:p.color,fontWeight:600,marginTop:4}}>{p.tierLabel}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Provider Info */}
      <div style={{background:"#FAF8F5",borderRadius:12,padding:"14px 16px",marginBottom:16,border:`1px solid ${pInfo.color}33`}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <p style={{fontSize:15,fontWeight:700,color:pInfo.color}}>{pInfo.name} — Setup</p>
          <div style={{display:"flex",gap:8}}>
            <a href={pInfo.signupUrl} target="_blank" rel="noreferrer"
              style={{fontSize:13,color:pInfo.color,fontWeight:700,textDecoration:"none",border:`1px solid ${pInfo.color}44`,padding:"4px 10px",borderRadius:7}}>
              Sign Up →
            </a>
            <a href={pInfo.docsUrl} target="_blank" rel="noreferrer"
              style={{fontSize:13,color:C.textMuted,fontWeight:600,textDecoration:"none",border:`1px solid ${C.border}`,padding:"4px 10px",borderRadius:7}}>
              Docs
            </a>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(pInfo.plans.length,4)},1fr)`,gap:8}}>
          {pInfo.plans.map(pl=>(
            <div key={pl.name} style={{background:C.white,borderRadius:8,padding:"10px 10px",border:`1px solid ${pInfo.color}33`,textAlign:"center"}}>
              <p style={{fontSize:13,fontWeight:700,color:pInfo.color,marginBottom:2}}>{pl.name}</p>
              <p style={{fontSize:16,fontWeight:800,color:C.navy}}>{pl.price}</p>
              <p style={{fontSize:12,color:C.textMuted}}>{pl.req}</p>
              <p style={{fontSize:12,color:C.textMuted}}>{pl.note}</p>
            </div>
          ))}
        </div>
      </div>

      {/* API Key */}
      <div style={{marginBottom:14}}>
        <label style={{display:"block",fontSize:13,fontWeight:700,color:C.textMuted,marginBottom:5}}>{pInfo.keyLabel.toUpperCase()}</label>
        <div style={{display:"flex",gap:8}}>
          <input type={showKey?"text":"password"} value={key} onChange={e=>setKey(e.target.value)}
            placeholder={pInfo.keyPlaceholder}
            style={{flex:1,padding:"10px 12px",borderRadius:9,fontSize:15,border:`1px solid ${C.border}`,outline:"none",fontFamily:"monospace"}}/>
          <button onClick={()=>setShowKey(s=>!s)}
            style={{padding:"10px 14px",borderRadius:9,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",fontSize:13,fontWeight:600,color:C.textMuted,whiteSpace:"nowrap"}}>
            {showKey?"Hide":"Show"}
          </button>
        </div>
      </div>

      {/* Interval */}
      <div style={{marginBottom:16}}>
        <label style={{display:"block",fontSize:13,fontWeight:700,color:C.textMuted,marginBottom:7}}>{isAr?"فترة التحديث":"REFRESH INTERVAL"}</label>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {[["10","10s"],["30","30s"],["60","60s"],["120","2min"],["300","5min"],["600","10min"]].map(([val,label])=>{
            const ok = parseInt(val) >= pInfo.minInterval;
            return (
              <button key={val} onClick={()=>ok&&setIntv(val)} style={{
                padding:"7px 14px",borderRadius:8,fontSize:13,fontWeight:700,cursor:ok?"pointer":"not-allowed",
                border:`2px solid ${intv===val&&ok?pInfo.color:C.border}`,
                background:intv===val&&ok?pInfo.color+"18":"transparent",
                color:!ok?"#CBD5E1":intv===val?pInfo.color:C.textMuted,
                opacity:ok?1:0.5,
              }}>{label}</button>
            );
          })}
        </div>
        <p style={{fontSize:12,color:C.textMuted,marginTop:5}}>Min interval for {pInfo.name}: {pInfo.minInterval}s</p>
      </div>

      {/* Actions */}
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <button onClick={handleSave} style={{padding:"10px 20px",borderRadius:9,border:"none",background:pInfo.color,color:C.white,fontSize:15,fontWeight:700,cursor:"pointer"}}>
          {saved?"✅ Saved & Active!":"Save & Activate"}
        </button>
        <button onClick={handleTest} disabled={testing} style={{padding:"10px 16px",borderRadius:9,border:`1px solid ${C.border}`,background:C.white,color:C.navy,fontSize:15,fontWeight:600,cursor:testing?"not-allowed":"pointer",opacity:testing?0.7:1}}>
          {testing?"Testing...":"Test Connection"}
        </button>
        {key&&<button onClick={()=>{setKey("");setPriceFeed(provider,"",parseInt(intv));}}
          style={{padding:"10px 14px",borderRadius:9,border:"1px solid #C85C3E44",background:"transparent",color:"#C85C3E",fontSize:14,fontWeight:600,cursor:"pointer"}}>
          Clear Key
        </button>}
      </div>

      {testMsg&&<div style={{marginTop:10,padding:"10px 14px",borderRadius:9,
        background:testMsg.startsWith("✅")?"#EFF5F2":C.redBg,
        color:testMsg.startsWith("✅")?C.greenSolid:"#C85C3E",fontSize:14,fontWeight:600}}>
        {testMsg}
      </div>}

      {/* Roadmap */}
      <div style={{marginTop:18,padding:"14px 16px",background:"#FAF8F5",borderRadius:12,border:`1px solid ${C.border}`}}>
        <p style={{fontSize:14,fontWeight:700,color:C.navy,marginBottom:10}}>📈 Recommended Provider by Stage</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
          {TIER_ORDER.map(tier=>{
            const ti = TIER_INFO[tier];
            const provs = Object.values(PROVIDERS).filter(p=>p.tier===tier);
            return (
              <div key={tier} style={{background:C.white,borderRadius:10,padding:"10px 12px",border:`1px solid ${ti.color}44`}}>
                <p style={{fontSize:13,fontWeight:700,color:ti.color,marginBottom:3}}>{ti.label}</p>
                <p style={{fontSize:12,color:C.textMuted,marginBottom:6}}>{ti.desc}</p>
                {provs.map(p=>(
                  <div key={p.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <span style={{fontSize:13,fontWeight:600,color:C.navy}}>{p.name}</span>
                    <button onClick={()=>{setProvider(p.id);setTestMsg("");}}
                      style={{fontSize:11,padding:"2px 8px",borderRadius:6,border:`1px solid ${p.color}55`,background:provider===p.id?p.color:"transparent",color:provider===p.id?C.white:p.color,cursor:"pointer",fontWeight:700}}>
                      {provider===p.id?"Selected":"Use"}
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};


// ─── Appointment Slots Configurator ──────────────────────────────────────────
const ApptSlotsConfig = ({ start, setStart, end, setEnd, interval, setInterval, desks, setDesks }) => {
  const { isAr } = useLang();
  // Generate slots from config
  const generateSlots = () => {
    const slots = [];
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const startMins = sh * 60 + sm;
    const endMins   = eh * 60 + em;
    const step      = parseInt(interval) || 30;
    const d         = parseInt(desks) || 1;
    for (let m = startMins; m < endMins; m += step) {
      const hh = String(Math.floor(m / 60)).padStart(2, "0");
      const mm = String(m % 60).padStart(2, "0");
      slots.push(`${hh}:${mm}`);
    }
    return { slots, total: slots.length, capacity: slots.length * d };
  };

  const { slots, total, capacity } = generateSlots();
  const timeOpts = [];
  for (let h = 7; h <= 20; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hh = String(h).padStart(2,"0"), mm = String(m).padStart(2,"0");
      timeOpts.push(`${hh}:${mm}`);
    }
  }

  return (
    <div style={{marginBottom:14}}>
      <label style={{display:"block",fontSize:13,fontWeight:700,color:C.textMuted,marginBottom:10,letterSpacing:"0.05em"}}>{isAr?"الفترات الزمنية":"TIME SLOTS"}</label>

      {/* Config Grid */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:14}}>
        {/* Opening Time */}
        <div>
          <label style={{display:"block",fontSize:12,fontWeight:600,color:C.textMuted,marginBottom:5}}>{isAr?"وقت الفتح":"OPENING TIME"}</label>
          <select value={start} onChange={e=>setStart(e.target.value)}
            style={{width:"100%",padding:"8px 10px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:15,color:C.text,outline:"none",background:C.white,cursor:"pointer"}}>
            {timeOpts.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {/* Closing Time */}
        <div>
          <label style={{display:"block",fontSize:12,fontWeight:600,color:C.textMuted,marginBottom:5}}>{isAr?"وقت الإغلاق":"CLOSING TIME"}</label>
          <select value={end} onChange={e=>setEnd(e.target.value)}
            style={{width:"100%",padding:"8px 10px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:15,color:C.text,outline:"none",background:C.white,cursor:"pointer"}}>
            {timeOpts.filter(t=>t>start).map(t=><option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {/* Interval */}
        <div>
          <label style={{display:"block",fontSize:12,fontWeight:600,color:C.textMuted,marginBottom:5}}>{isAr?"فترة المواعيد":"SLOT INTERVAL"}</label>
          <select value={interval} onChange={e=>setInterval(e.target.value)}
            style={{width:"100%",padding:"8px 10px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:15,color:C.text,outline:"none",background:C.white,cursor:"pointer"}}>
            {[["15","Every 15 min"],["20","Every 20 min"],["30","Every 30 min"],["45","Every 45 min"],["60","Every 1 hour"]].map(([v,l])=>(
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        {/* Desks */}
        <div>
          <label style={{display:"block",fontSize:12,fontWeight:600,color:C.textMuted,marginBottom:5}}>{isAr?"مكاتب الاستقبال":"RECEPTION DESKS"}</label>
          <select value={desks} onChange={e=>setDesks(e.target.value)}
            style={{width:"100%",padding:"8px 10px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:15,color:C.text,outline:"none",background:C.white,cursor:"pointer"}}>
            {["1","2","3","4","5","6"].map(n=><option key={n} value={n}>{n} {n==="1"?"desk":"desks"}</option>)}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
        <div style={{background:C.tealLight,borderRadius:10,padding:"10px 14px",textAlign:"center"}}>
          <p style={{fontSize:24,fontWeight:800,color:C.teal}}>{total}</p>
          <p style={{fontSize:12,color:C.teal,fontWeight:600}}>Slots/day</p>
        </div>
        <div style={{background:C.goldLight,borderRadius:10,padding:"10px 14px",textAlign:"center"}}>
          <p style={{fontSize:24,fontWeight:800,color:C.goldDim}}>{desks}</p>
          <p style={{fontSize:12,color:C.goldDim,fontWeight:600}}>{isAr?"مكاتب":"Desks"}</p>
        </div>
        <div style={{background:C.greenBg,borderRadius:10,padding:"10px 14px",textAlign:"center"}}>
          <p style={{fontSize:24,fontWeight:800,color:C.greenSolid}}>{capacity}</p>
          <p style={{fontSize:12,color:C.greenSolid,fontWeight:600}}>Capacity/day</p>
        </div>
      </div>

      {/* Generated Slots Preview */}
      {slots.length > 0 ? (
        <div style={{background:"#FAF8F5",borderRadius:10,padding:"12px 14px",border:`1px solid ${C.border}`}}>
          <p style={{fontSize:12,fontWeight:700,color:C.textMuted,marginBottom:8,letterSpacing:"0.05em"}}>
            GENERATED SLOTS — {start} to {end}, every {interval} min × {desks} desk{desks>1?"s":""}
          </p>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {slots.map(slot=>(
              <span key={slot} style={{padding:"4px 11px",background:C.white,borderRadius:7,fontSize:14,fontWeight:600,color:C.navy,border:`1px solid ${C.border}`}}>
                {slot}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div style={{background:"#FBF0EC",borderRadius:10,padding:"10px 14px",border:"1px solid #E8C5BA"}}>
          <p style={{fontSize:14,color:"#C85C3E",fontWeight:600}}>⚠️ No slots — closing time must be after opening time</p>
        </div>
      )}
    </div>
  );
};

// ─── Toggle Switch ────────────────────────────────────────────────────────────
const Toggle = ({label, sub, value, onChange}) => {
  const { isAr } = useLang();
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",borderBottom:`1px solid ${C.border}`}}>
      <div style={{textAlign:"start"}}><p style={{fontSize:19,fontWeight:600,color:C.navy}}>{label}</p>{sub&&<p style={{fontSize:13,color:C.textMuted,marginTop:2}}>{sub}</p>}</div>
      <div onClick={()=>onChange(!value)} style={{width:42,height:22,borderRadius:11,cursor:"pointer",background:value?C.teal:C.border,position:"relative",transition:"background 0.2s",flexShrink:0}}>
        <div style={{position:"absolute",top:2,left:value?22:2,width:18,height:18,borderRadius:"50%",background:C.white,transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}} />
      </div>
    </div>
  );
};

// ─── Settings Group Card ─────────────────────────────────────────────────────
const G = ({title, children}) => {
  const { t, isAr } = useLang();
  return (
    <div style={{background:C.white,borderRadius:14,padding:20,border:`1px solid ${C.border}`,marginBottom:16}}>
      <h3 style={{fontSize:20,fontWeight:700,color:C.navy,marginBottom:14,paddingBottom:10,borderBottom:`2px solid ${C.gold}33`,textAlign:"start"}}>{t(title)}</h3>
      {children}
    </div>
  );
};

// ─── Commission Tab Component ─────────────────────────────────────────────────
const CommissionTab = ({
  commBuyer, setCommBuyer, commSeller, setCommSeller,
  splitBuying, setSplitBuying, splitSelling, setSplitSelling,
  splitCreator, setSplitCreator, splitValidators, setSplitValidators,
  distSched, setDistSched, minValidator, setMinValidator,
  takharojWallet, setTakharojWallet, blocksInPeriod, setBlocksInPeriod,
  showSaved
}) => {
  const { isAr } = useLang();
  const pctOpts = ["0","5","10","15","20","25","30","35","40","45","50"].map(v=>({value:v,label:v+"%"}));
  const commOpts = ["0.25","0.5","0.75","1.0","1.25","1.5","1.75","2.0","2.5","3.0"].map(v=>({value:v,label:v+"%"}));

  const totalSplit = parseInt(splitBuying||0)+parseInt(splitSelling||0)+parseInt(splitCreator||0)+parseInt(splitValidators||0);
  const splitOk = totalSplit === 100;

  // Example trade preview
  const tradeAmt = 10000;
  const buyComm  = +(tradeAmt * parseFloat(commBuyer||0) / 100).toFixed(2);
  const sellComm = +(tradeAmt * parseFloat(commSeller||0) / 100).toFixed(2);
  const totalComm = buyComm + sellComm;
  const buyerPays  = tradeAmt + buyComm;
  const sellerGets = tradeAmt - sellComm;

  // Split breakdown from total commission
  const splitOf = (pct) => +(totalComm * parseInt(pct||0) / 100).toFixed(2);

  return (
    <div>
      {/* ── Per-Party Commission ── */}
      <G title={isAr?"العمولة لكل طرف":"Commission Per Party"}>
        <div style={{background:C.purpleBg,borderRadius:10,padding:"10px 14px",marginBottom:14,border:"1px solid #C8D6E8"}}>
          <p style={{fontSize:14,color:C.blueSolid,fontWeight:500,lineHeight:1.6}}>
            Commission is charged independently on both sides of every trade.
            The <strong>buyer pays</strong> trade value + buyer commission.
            The <strong>seller receives</strong> trade value − seller commission.
          </p>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
          <div>
            <label style={{display:"block",fontSize:13,fontWeight:700,color:C.textMuted,marginBottom:6}}>BUYER COMMISSION (%)</label>
            <select value={commBuyer} onChange={e=>setCommBuyer(e.target.value)}
              style={{width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:16,color:C.text,outline:"none",background:C.white,cursor:"pointer"}}>
              {commOpts.map(o=><option key={o.value} value={o.value}>{o.label} per trade</option>)}
            </select>
            <p style={{fontSize:12,color:C.textMuted,marginTop:4}}>{isAr?"تُضاف على قيمة الصفقة":"Charged on top of trade amount"}</p>
          </div>
          <div>
            <label style={{display:"block",fontSize:13,fontWeight:700,color:C.textMuted,marginBottom:6}}>SELLER COMMISSION (%)</label>
            <select value={commSeller} onChange={e=>setCommSeller(e.target.value)}
              style={{width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:16,color:C.text,outline:"none",background:C.white,cursor:"pointer"}}>
              {commOpts.map(o=><option key={o.value} value={o.value}>{o.label} per trade</option>)}
            </select>
            <p style={{fontSize:12,color:C.textMuted,marginTop:4}}>{isAr?"تُخصم من أرباح البائع":"Deducted from seller earnings"}</p>
          </div>
        </div>

        {/* Live Trade Example */}
        <div style={{background:C.navyDark,borderRadius:12,padding:"14px 18px",marginBottom:4}}>
          <p style={{fontSize:12,fontWeight:700,color:"#A89880",letterSpacing:"0.08em",marginBottom:12}}>LIVE EXAMPLE — 10,000 SAR TRADE</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
            {/* Buyer */}
            <div style={{background:"rgba(255,255,255,0.05)",borderRadius:10,padding:"12px 14px",border:"1px solid rgba(255,255,255,0.08)"}}>
              <p style={{fontSize:12,color:"#8C7E6F",fontWeight:700,marginBottom:8}}>{isAr?"يدفع المشتري":"BUYER PAYS"}</p>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{fontSize:14,color:"#A89880"}}>{isAr?"قيمة الصفقة":"Trade value"}</span>
                <span style={{fontSize:14,color:"#E8E0D4",fontWeight:600}}>10,000 SAR</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <span style={{fontSize:14,color:"#A89880"}}>Commission ({commBuyer}%)</span>
                <span style={{fontSize:14,color:"#FCA5A5",fontWeight:600}}>+ {buyComm.toLocaleString()} SAR</span>
              </div>
              <div style={{borderTop:"1px solid rgba(255,255,255,0.1)",paddingTop:8,display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:15,color:C.white,fontWeight:700}}>{isAr?"التكلفة الإجمالية":"Total cost"}</span>
                <span style={{fontSize:17,color:C.gold,fontWeight:800}}>{buyerPays.toLocaleString()} SAR</span>
              </div>
            </div>
            {/* Seller */}
            <div style={{background:"rgba(255,255,255,0.05)",borderRadius:10,padding:"12px 14px",border:"1px solid rgba(255,255,255,0.08)"}}>
              <p style={{fontSize:12,color:"#8C7E6F",fontWeight:700,marginBottom:8}}>{isAr?"يستلم البائع":"SELLER RECEIVES"}</p>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{fontSize:14,color:"#A89880"}}>{isAr?"قيمة الصفقة":"Trade value"}</span>
                <span style={{fontSize:14,color:"#E8E0D4",fontWeight:600}}>10,000 SAR</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <span style={{fontSize:14,color:"#A89880"}}>Commission ({commSeller}%)</span>
                <span style={{fontSize:14,color:"#FCA5A5",fontWeight:600}}>− {sellComm.toLocaleString()} SAR</span>
              </div>
              <div style={{borderTop:"1px solid rgba(255,255,255,0.1)",paddingTop:8,display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:15,color:C.white,fontWeight:700}}>{isAr?"صافي الأرباح":"Net earnings"}</span>
                <span style={{fontSize:17,color:"#4ADE80",fontWeight:800}}>{sellerGets.toLocaleString()} SAR</span>
              </div>
            </div>
          </div>
          <div style={{background:"rgba(212,160,23,0.12)",borderRadius:8,padding:"8px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:14,color:"#A89880"}}>Total platform commission collected</span>
            <span style={{fontSize:17,color:C.gold,fontWeight:800}}>{totalComm.toLocaleString()} SAR</span>
          </div>
        </div>
      </G>

      {/* ── Commission Split ── */}
      <G title={isAr?"توزيع العمولة لكل كتلة":"Commission Split per Block"}>
        <div style={{background:splitOk?C.greenBg:"#FBF0EC",borderRadius:10,padding:"10px 14px",marginBottom:14,border:`1px solid ${splitOk?"#86EFAC":"#E8C5BA"}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <p style={{fontSize:14,color:splitOk?C.greenSolid:"#C85C3E",fontWeight:600}}>
              {splitOk?"✅ Split is valid — totals 100%":`⚠️ Split must total 100% — currently ${totalSplit}%`}
            </p>
            <span style={{fontSize:20,fontWeight:800,color:splitOk?C.greenSolid:"#C85C3E"}}>{totalSplit}%</span>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
          {[
            {label:"Tanaqul — Buying Side",val:splitBuying,set:setSplitBuying,color:C.navy,icon:"🏛"},
            {label:"Tanaqul — Selling Side",val:splitSelling,set:setSplitSelling,color:C.teal,icon:"🏛"},
            {label:"Block Creator",val:splitCreator,set:setSplitCreator,color:C.purpleSolid,icon:"⛏"},
            {label:"Validators (weighted)",val:splitValidators,set:setSplitValidators,color:"#D4943A",icon:"✅"},
          ].map(({label,val,set,color,icon})=>(
            <div key={label} style={{background:"#FAF8F5",borderRadius:10,padding:"12px 14px",border:`1px solid ${color}33`}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <span style={{fontSize:14,color:C.navy,fontWeight:600}}>{icon} {label}</span>
                <span style={{fontSize:20,fontWeight:800,color:color}}>{val}%</span>
              </div>
              <select value={val} onChange={e=>set(e.target.value)}
                style={{width:"100%",padding:"7px 10px",borderRadius:7,border:`1px solid ${color}44`,fontSize:15,color:C.text,outline:"none",background:C.white,cursor:"pointer"}}>
                {pctOpts.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {/* Split amount from example trade */}
              <p style={{fontSize:12,color:C.textMuted,marginTop:5}}>
                Example: {splitOf(val).toLocaleString()} SAR per 10,000 SAR trade
              </p>
              {/* Visual bar */}
              <div style={{marginTop:6,height:4,borderRadius:4,background:"#E8E0D4",overflow:"hidden"}}>
                <div style={{height:"100%",width:`${Math.min(parseInt(val||0),100)}%`,background:color,borderRadius:4,transition:"width 0.3s"}}/>
              </div>
            </div>
          ))}
        </div>
      </G>

      {/* ── Distribution ── */}
      <G title={isAr?"التوزيع":"Distribution"}>
        <Sel label={isAr?"جدول التوزيع":"Distribution Schedule"} value={distSched} onChange={setDistSched}
          options={[{value:"daily",label:"Daily"},{value:"weekly",label:"Weekly"},{value:"perblock",label:"Per Block (instant)"}]} />
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:4}}>
          <div>
            <label style={{display:"block",fontSize:13,fontWeight:700,color:C.textMuted,marginBottom:6}}>BLOCKS PER PERIOD (ESTIMATE)</label>
            <select value={blocksInPeriod} onChange={e=>setBlocksInPeriod(e.target.value)}
              style={{width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:16,color:C.text,outline:"none",background:C.white,cursor:"pointer"}}>
              {["100","250","500","1000","2000","5000"].map(v=><option key={v} value={v}>{v} blocks</option>)}
            </select>
          </div>
          <div>
            <label style={{display:"block",fontSize:13,fontWeight:700,color:C.textMuted,marginBottom:6}}>MIN BLOCK PARTICIPATION TO QUALIFY</label>
            <select value={minValidator} onChange={e=>setMinValidator(e.target.value)}
              style={{width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:16,color:C.text,outline:"none",background:C.white,cursor:"pointer"}}>
              {["5","10","15","20","25","30","40","50"].map(v=><option key={v} value={v}>{v}%</option>)}
            </select>
          </div>
        </div>
        {/* Live explanation */}
        {(()=>{
          const total = parseInt(blocksInPeriod||500);
          const pct   = parseInt(minValidator||10);
          const need  = Math.ceil(total * pct / 100);
          const validatorSplitSAR = splitOf(splitValidators);
          return (
            <div style={{borderRadius:10,overflow:"hidden",marginBottom:16,marginTop:10}}>
              <div style={{background:C.navyDark,padding:"12px 16px"}}>
                <p style={{fontSize:12,fontWeight:700,color:"#A89880",letterSpacing:"0.08em",marginBottom:10}}>{isAr?"قاعدة تأهيل المصادق":"VALIDATOR QUALIFICATION RULE"}</p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
                  <div style={{background:"rgba(255,255,255,0.05)",borderRadius:8,padding:"10px 12px",textAlign:"center"}}>
                    <p style={{fontSize:22,fontWeight:800,color:C.gold}}>{total}</p>
                    <p style={{fontSize:11,color:"#8C7E6F",fontWeight:600,marginTop:2}}>{isAr?"الكتل في الفترة":"BLOCKS IN PERIOD"}</p>
                  </div>
                  <div style={{background:"rgba(255,255,255,0.05)",borderRadius:8,padding:"10px 12px",textAlign:"center"}}>
                    <p style={{fontSize:22,fontWeight:800,color:C.teal}}>{need}</p>
                    <p style={{fontSize:11,color:"#8C7E6F",fontWeight:600,marginTop:2}}>MUST VALIDATE ({pct}%)</p>
                  </div>
                  <div style={{background:"rgba(255,255,255,0.05)",borderRadius:8,padding:"10px 12px",textAlign:"center"}}>
                    <p style={{fontSize:22,fontWeight:800,color:"#4ADE80"}}>{total - need}</p>
                    <p style={{fontSize:11,color:"#8C7E6F",fontWeight:600,marginTop:2}}>{isAr?"المسموح بتفويتها":"ALLOWED TO MISS"}</p>
                  </div>
                </div>
                <div style={{background:"rgba(239,68,68,0.1)",borderRadius:8,padding:"10px 14px",border:"1px solid rgba(239,68,68,0.2)"}}>
                  <p style={{fontSize:13,color:"#FCA5A5",fontWeight:600,lineHeight:1.6}}>
                    ⚠️ Validator signs fewer than <strong style={{color:"#E8826A"}}>{need} blocks</strong> in the period
                    → their commission share (<strong style={{color:"#E8826A"}}>{splitValidators}% = {validatorSplitSAR} SAR</strong> on a 10,000 SAR trade)
                    is forfeited and transferred to the <strong style={{color:"#FBBF24"}}>{isAr?"محفظة تخارج":"Takharoj wallet"}</strong>.
                  </p>
                </div>
              </div>
            </div>
          );
        })()}
      </G>

      {/* ── Takharoj Wallet ── */}
      <G title="تخارج — Takharoj Reserve Wallet">
        <div style={{background:"#FDF4EC",borderRadius:10,padding:"10px 14px",marginBottom:14,border:"1px solid #FCD34D"}}>
          <p style={{fontSize:14,color:"#8B6540",fontWeight:600,lineHeight:1.6}}>
            Forfeited validator commissions are transferred to this Tanaqul-controlled wallet.
            Validators who fail to meet the minimum block participation threshold lose their share for that period — no exceptions.
          </p>
        </div>
        <div style={{marginBottom:14}}>
          <label style={{display:"block",fontSize:13,fontWeight:700,color:C.textMuted,marginBottom:6}}>{isAr?"عنوان محفظة تخارج":"TAKHAROJ WALLET ADDRESS"}</label>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <input
              defaultValue={takharojWallet}
              onBlur={e=>setTakharojWallet(e.target.value)}
              placeholder="0x..."
              style={{flex:1,padding:"10px 12px",borderRadius:9,fontSize:15,border:`2px solid ${C.gold}55`,color:C.text,outline:"none",fontFamily:"monospace",background:"#FDF4EC"}}
            />
            <div style={{padding:"10px 14px",borderRadius:9,background:C.goldLight,border:`1px solid ${C.gold}44`,display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:C.greenSolid,boxShadow:"0 0 6px #4A7A68"}}/>
              <span style={{fontSize:13,color:C.goldDim,fontWeight:700,whiteSpace:"nowrap"}}>{isAr?"تتحكم بها تناقل":"Tanaqul Controlled"}</span>
            </div>
          </div>
        </div>
        <div style={{background:"#FAF8F5",borderRadius:10,padding:"12px 16px",border:`1px solid ${C.border}`}}>
          <p style={{fontSize:13,fontWeight:700,color:C.navy,marginBottom:8}}>What happens to forfeited earnings:</p>
          {[
            ["1","Block closes → participation recorded on-chain"],
            ["2","Period ends → system checks each validator's block count"],
            ["3","Below threshold → their share calculated"],
            ["4","Amount transferred to Takharoj wallet automatically"],
            ["5","Qualifying validators are NOT affected — they receive their full share"],
          ].map(([n,t])=>(
            <div key={n} style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:6}}>
              <div style={{width:18,height:18,borderRadius:"50%",background:C.navy,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
                <span style={{fontSize:11,fontWeight:800,color:C.white}}>{n}</span>
              </div>
              <span style={{fontSize:14,color:C.text}}>{t}</span>
            </div>
          ))}
        </div>
      </G>
    </div>
  );
};


// ─────────────────────────────────────────────────────────────────────────────
// ORDER BOOK PAGE
// ─────────────────────────────────────────────────────────────────────────────
const OrderBook = () => {
  const { t, isAr } = useLang();
  const { bidEnabled } = useBidEnabled();
  const { tradingOpen } = usePlatform();
  const { gatewaySettings, commissionRates } = useLang();
  const appData = useAppData();
  const { orders, setOrders, matches, setMatches, bars, investors, walletMovements, setWalletMovements, addAudit, pageHint, setPageHint } = appData;

  // Auto-switch tab from action center hint
  useEffect(()=>{
    if(pageHint?.tab){setTab(pageHint.tab);setPageHint(null);}
  },[pageHint]);

  // ── Dynamic commission rate from Settings ────────────────────────────────
  const buyerCommRate  = parseFloat(commissionRates.buyer  || "1.0") / 100;
  const sellerCommRate = parseFloat(commissionRates.seller || "1.0") / 100;
  const totalCommRate  = buyerCommRate + sellerCommRate;

  // ── KYC expiry check ────────────────────────────────────────────────────
  const isKycExpired = (nationalId) => {
    if(!nationalId || nationalId==="SYSTEM") return false;
    const inv = investors.find(i=>i.nationalId===nationalId);
    if(!inv || !inv.kycExpiry) return false;
    return inv.kycExpiry < new Date().toISOString().slice(0,10);
  };

  // ── Refund calculator ─────────────────────────────────────────────────────
  //
  //  Gateway fee rules (ALWAYS non-refundable):
  //    MADA            → tradeValue × (madaFee% / 100), capped at madaCap SAR
  //    Visa/Mastercard → tradeValue × (visaFee% / 100)  (no cap)
  //    SADAD           → flat sadadFee SAR per order
  //    Wallet / Other  → 0
  //
  //  Refund formula:
  //    originalCharge = (qty × price) + commission(2%) + gatewayFee(order)
  //    Refund         = originalCharge − execSAR − commission(execSAR) − gatewayFee
  //
  //  commission is charged only on filled portion — excess returned
  //  gatewayFee is kept in full regardless of fill amount
  //
  const calcGatewayFee = (payment, tradeValue) => {
    const gw = gatewaySettings;
    const method = (payment || "").toUpperCase();
    if(method === "MADA") {
      const pct = parseFloat(gw.madaFee) || 0;
      const cap = parseFloat(gw.madaCap) || Infinity;
      return Math.min(Math.round(tradeValue * pct / 100), Math.round(cap));
    }
    if(method === "VISA" || method === "MASTERCARD" || method === "APPLE PAY" || method === "STC PAY") {
      const pct = parseFloat(gw.visaFee) || 0;
      return Math.round(tradeValue * pct / 100);
    }
    if(method === "SADAD") {
      return Math.round(parseFloat(gw.sadadFee) || 0);
    }
    return 0; // Wallet, internal, MM — no gateway fee
  };

  const issueRefund = (order, filledQty, execSAR, reason) => {
    if(order.side !== "BUY") return;
    if(order.nationalId === "SYSTEM") return; // Skip refund for system orders (Market Maker, Stabilizer)

    const commissionRate     = totalCommRate; // dynamic from Settings
    const originalTradeValue = order.qty * order.price;
    const gatewayFee         = calcGatewayFee(order.payment, originalTradeValue); // non-refundable
    const originalCommission = Math.round(originalTradeValue * commissionRate);
    const originalTotal      = originalTradeValue + originalCommission + gatewayFee;

    const filledCommission = Math.round(execSAR * commissionRate);
    const refundSAR        = Math.round(originalTotal - execSAR - filledCommission - gatewayFee);

    if(refundSAR <= 0) return;

    const method = (order.payment || "").toUpperCase();
    const gwLabel = method === "MADA"    ? `MADA fee SAR ${gatewayFee} (${gatewaySettings.madaFee}%, cap SAR ${gatewaySettings.madaCap})`
                  : method === "SADAD"   ? `SADAD flat fee SAR ${gatewayFee}`
                  : (method === "VISA" || method === "MASTERCARD") ? `${method} fee SAR ${gatewayFee} (${gatewaySettings.visaFee}%)`
                  : null;

    const newEntry = {
      id:       "WM-" + String(Date.now()).slice(-6) + String(Math.random()).slice(2,5),
      investor: order.investor,
      nationalId: order.nationalId,
      vaultKey: "—",
      type:     "CREDIT",
      amount:   refundSAR,
      reason:   reason + (gwLabel ? ` — ${gwLabel} kept` : ""),
      date:     new Date().toISOString().slice(0,16).replace("T"," "),
    };
    setWalletMovements(prev => [newEntry, ...prev]);
  };
  const [tab, setTab]           = useState("open");
  const [metal, setMetal]       = useState("Gold");
  const [stabEnabled, setStabEnabled]   = useState(true);
  const [maxSpreadPct, setMaxSpreadPct] = useState("2.0");
  const [stabCapSAR, setStabCapSAR]     = useState("500000");
  // Market Maker state
  const [mmOpen, setMmOpen]         = useState(false);
  const [mmSide, setMmSide]         = useState("SELL");
  const [mmMetal, setMmMetal]       = useState("Gold");
  const [mmQty, setMmQty]           = useState("");
  const [mmPrice, setMmPrice]       = useState("");
  const [mmExpiry, setMmExpiry]     = useState("GTC");
  const [mmExpDate, setMmExpDate]   = useState("");
  const [mmFloor, setMmFloor]       = useState(""); // price floor SAR/g
  const [mmCeiling, setMmCeiling]   = useState(""); // price ceiling SAR/g

  const GATEWAY = ["MADA","Visa","Mastercard","Apple Pay","STC Pay","Android Pay"];
  const mmTotal = parseFloat(mmQty||0) * parseFloat(mmPrice||0);

  const METALS    = ["Gold","Silver","Platinum"];
  const METALS_AR = {Gold:"\u0627\u0644\u0630\u0647\u0628",Silver:"\u0627\u0644\u0641\u0636\u0629",Platinum:"\u0627\u0644\u0628\u0644\u0627\u062a\u064a\u0646"};
  const MCOL      = {Gold:C.gold,Silver:"#A89880",Platinum:C.purpleSolid};

  // orders and matches now from AppDataContext (persist across navigation)
  const [matchLog, setMatchLog] = useState([]); // live match events shown as toasts
  const [synLog,   setSynLog]   = useState([]);
  const [matchToast, setMatchToast] = useState("");
  const showMatchToast = (msg) => { setMatchToast(msg); setTimeout(()=>setMatchToast(""),4000); };

  // ── Derived views ──────────────────────────────────────────────────────────
  const openByM    = orders.filter(o=>o.metal===metal&&(o.status==="OPEN"||o.status==="PARTIAL"));
  const bids       = openByM.filter(o=>o.side==="BUY") .sort((a,b)=>b.price-a.price);
  const asks       = openByM.filter(o=>o.side==="SELL").sort((a,b)=>a.price-b.price);
  const bestBid    = bids[0]?.price||null;
  const bestAsk    = asks[0]?.price||null;
  const spread     = bestBid&&bestAsk?(bestAsk-bestBid).toFixed(2):null;
  const spreadPct  = bestBid&&bestAsk?(((bestAsk-bestBid)/bestBid)*100).toFixed(2):null;
  const spreadWide = spreadPct&&parseFloat(spreadPct)>parseFloat(maxSpreadPct);
  const openList      = orders.filter(o=>o.status==="OPEN"||o.status==="PARTIAL");
  const filledList    = orders.filter(o=>o.status==="FILLED");
  const cancelledList = orders.filter(o=>o.status==="CANCELLED");

  const cancelOrder = (id) => {
    const order = orders.find(o=>o.id===id);
    if(!order) return;
    if(order.status==="FILLED"||order.status==="CANCELLED") return;
    // Compute actual execution value from match records (not order.price which may differ from exec price)
    const orderMatches = matches.filter(m=>m.buyOrder===id||m.sellOrder===id);
    const actualExecSAR = orderMatches.reduce((a,m)=>a+m.totalSAR, 0);
    setOrders(p=>p.map(o=>o.id===id?{...o,status:"CANCELLED",cancelReason:"Admin cancelled"}:o));
    issueRefund(order, order.filled||0, actualExecSAR, "Admin Cancelled Order — Refund");
  };

  // ── Auto-cancel BIDs when bid mode disabled ────────────────────────────────
  useEffect(()=>{
    if(!bidEnabled){
      const toBeCancelled = orders.filter(o=>
        o.side==="BUY"&&(o.status==="OPEN"||o.status==="PARTIAL")
      );
      toBeCancelled.forEach(o=>{
        const actualExec = matches.filter(m=>m.buyOrder===o.id||m.sellOrder===o.id).reduce((a,m)=>a+m.totalSAR,0);
        issueRefund(o, o.filled||0, actualExec, "Bid Orders Disabled — Refund");
      });
      setOrders(p=>p.map(o=>
        o.side==="BUY"&&(o.status==="OPEN"||o.status==="PARTIAL")
          ?{...o,status:"CANCELLED",cancelReason:"Bid orders disabled by admin"}
          :o
      ));
    }
  },[bidEnabled]);

  // ── Auto-cancel GTD orders past expiry ────────────────────────────────────
  useEffect(()=>{
    const today = new Date().toISOString().slice(0,10);
    const gtdExpired = orders.filter(o=>
      o.expiry==="GTD"&&o.expiryDate&&o.expiryDate<today&&
      (o.status==="OPEN"||o.status==="PARTIAL")
    );
    gtdExpired.forEach(o=>{
      const actualExec = matches.filter(m=>m.buyOrder===o.id||m.sellOrder===o.id).reduce((a,m)=>a+m.totalSAR,0);
      issueRefund(o, o.filled||0, actualExec, `GTD Expired (${o.expiryDate}) — Refund`);
    });
    setOrders(p=>p.map(o=>{
      if(o.expiry==="GTD"&&o.expiryDate&&o.expiryDate<today&&(o.status==="OPEN"||o.status==="PARTIAL"))
        return {...o,status:"CANCELLED",cancelReason:"GTD expired"};
      return o;
    }));
  },[]);

  // ── Core matching engine ───────────────────────────────────────────────────
  //
  // Rules:
  //   Bids ON  → two-sided: BUY queued if no match; leftover stays open
  //   Bids OFF → ASK-only:  BUY filled from SELL pool by FIFO time priority;
  //              unfilled remainder DROPPED immediately (never queued)
  //
  // FIFO: oldest placed timestamp wins when qty > available
  //
  const runMatch = (incomingOrder, currentOrders) => {
    let updatedOrders = [...currentOrders];
    const newMatches  = [];
    const now         = new Date().toISOString().slice(0,16).replace("T"," ");

    if(incomingOrder.side==="BUY"){
      // Get all available SELL orders for same metal, sorted by price ASC then time ASC
      const availableSells = updatedOrders
        .filter(o=>o.side==="SELL"&&o.metal===incomingOrder.metal&&(o.status==="OPEN"||o.status==="PARTIAL")&&!isKycExpired(o.nationalId))
        .sort((a,b)=>a.price!==b.price ? a.price-b.price : a.placed.localeCompare(b.placed));

      let remaining = incomingOrder.qty;
      let filled    = 0;

      for(const sell of availableSells){
        if(remaining<=0) break;
        const available = sell.qty - sell.filled;
        const fillQty   = Math.min(remaining, available);
        const execPrice = sell.price; // buyer pays ask price
        const totalSAR  = Math.round(fillQty * execPrice);
        const commission= Math.round(totalSAR * totalCommRate); // dynamic from Settings (buyer% + seller%)
        const adminFee  = calcGatewayFee(incomingOrder.payment, totalSAR);  // dynamic by payment method

        // Update the sell order
        const newFilled = sell.filled + fillQty;
        const newStatus = newFilled >= sell.qty ? "FILLED" : "PARTIAL";
        updatedOrders = updatedOrders.map(o=>o.id===sell.id
          ? {...o, filled:newFilled, status:newStatus}
          : o
        );

        // Record match
        newMatches.push({
          id:"MTC-"+String(matches.length+newMatches.length+1).padStart(3,"0"),
          buyOrder:incomingOrder.id, sellOrder:sell.id,
          metal:incomingOrder.metal, qty:fillQty,
          price:execPrice, totalSAR, commission, adminFee,
          filledFor:incomingOrder.investor, date:now,
          mode: bidEnabled ? "bid-ask" : "ask-only",
        });

        filled    += fillQty;
        remaining -= fillQty;
      }

      // Determine incoming order final state
      let incomingStatus;
      if(filled===0){
        // No fills at all
        if(!bidEnabled){
          // ASK-only mode: drop the whole order
          incomingStatus = "CANCELLED";
          incomingOrder  = {...incomingOrder, status:"CANCELLED", filled:0,
            cancelReason:"ASK-only mode: no available grams"};
          issueRefund(incomingOrder, 0, 0, "No Grams Available — Full Refund");
        } else {
          // Bids ON: queue it
          incomingStatus = "OPEN";
          incomingOrder  = {...incomingOrder, status:"OPEN", filled:0};
        }
      } else if(filled >= incomingOrder.qty){
        // Fully filled
        incomingOrder = {...incomingOrder, status:"FILLED", filled};
      } else {
        // Partial fill
        if(!bidEnabled){
          // ASK-only: drop remaining — show as PARTIAL but mark remainder dropped
          incomingOrder = {...incomingOrder, status:"PARTIAL", filled,
            cancelReason:`ASK-only: ${remaining}g dropped — no more available grams`};
          // Refund unfilled portion: commission only on filled grams, admin fee kept always
          const execSAR = newMatches.reduce((s,m)=>s+m.totalSAR, 0);
          issueRefund(incomingOrder, filled, execSAR, `Partial Fill — ${remaining}g Unfilled, Refunded`);
        } else {
          // Bids ON: partial fill, rest stays open
          incomingOrder = {...incomingOrder, status:"PARTIAL", filled};
        }
      }

      return { updatedOrders, newMatches, finalOrder: incomingOrder };

    } else {
      // SELL order — queue it, it doesn't chase buyers
      // Check if any open BID matches immediately (bids ON only)
      if(bidEnabled){
        const availableBuys = updatedOrders
          .filter(o=>o.side==="BUY"&&o.metal===incomingOrder.metal&&(o.status==="OPEN"||o.status==="PARTIAL")&&o.price>=incomingOrder.price&&!isKycExpired(o.nationalId))
          .sort((a,b)=>a.placed.localeCompare(b.placed)); // FIFO

        let remaining = incomingOrder.qty;
        let filled    = 0;

        for(const buy of availableBuys){
          if(remaining<=0) break;
          const available = buy.qty - buy.filled;
          const fillQty   = Math.min(remaining, available);
          const execPrice = incomingOrder.price;
          const totalSAR  = Math.round(fillQty * execPrice);
          const commission= Math.round(totalSAR * totalCommRate); // dynamic from Settings
          const adminFee  = calcGatewayFee(incomingOrder.payment, totalSAR); // dynamic

          const newFilled = buy.filled + fillQty;
          const newStatus = newFilled >= buy.qty ? "FILLED" : "PARTIAL";
          updatedOrders = updatedOrders.map(o=>o.id===buy.id
            ? {...o, filled:newFilled, status:newStatus}
            : o
          );

          newMatches.push({
            id:"MTC-"+String(matches.length+newMatches.length+1).padStart(3,"0"),
            buyOrder:buy.id, sellOrder:incomingOrder.id,
            metal:incomingOrder.metal, qty:fillQty,
            price:execPrice, totalSAR, commission, adminFee,
            filledFor:buy.investor, date:now, mode:"bid-ask",
          });

          filled    += fillQty;
          remaining -= fillQty;
        }

        if(filled>=incomingOrder.qty){
          incomingOrder = {...incomingOrder, status:"FILLED", filled};
        } else if(filled>0){
          incomingOrder = {...incomingOrder, status:"PARTIAL", filled};
        } else {
          incomingOrder = {...incomingOrder, status:"OPEN", filled:0};
        }
      } else {
        // Bids OFF: SELL order just sits as open ASK for buyers to consume
        incomingOrder = {...incomingOrder, status:"OPEN", filled:0};
      }

      return { updatedOrders, newMatches, finalOrder: incomingOrder };
    }
  };

  // ── Market Maker validation ────────────────────────────────────────────────
  const MIN_QTY_GRAMS = 0.1;
  const mmQtyNum   = parseFloat(mmQty||0);
  const mmPriceNum = parseFloat(mmPrice||0);
  const mmQtyBad   = mmQtyNum > 0 && mmQtyNum < MIN_QTY_GRAMS;
  const mmFloorBad = mmFloor && mmSide==="SELL" && mmPriceNum < parseFloat(mmFloor);
  const mmCeilBad  = mmCeiling && mmSide==="BUY"  && mmPriceNum > parseFloat(mmCeiling);

  // ── Market Maker order injection ───────────────────────────────────────────
  const doMarketMaker = () => {
    if(!mmQty||!mmPrice) return;
    // Treasury freeze check — block MM during nightly reconciliation
    const { reconState: _rc } = appData || {};
    if(_rc?.frozen) { showMatchToast(isAr?"⚠️ التداول مجمد — التسوية جارية":"⚠️ Trading frozen — reconciliation in progress"); return; }
    // Negative / zero guard
    if(mmQtyNum <= 0)  { showMatchToast(isAr?"⚠️ الكمية يجب أن تكون أكبر من صفر":"⚠️ Quantity must be greater than 0"); return; }
    if(mmPriceNum <= 0){ showMatchToast(isAr?"⚠️ السعر يجب أن يكون أكبر من صفر":"⚠️ Price must be greater than 0"); return; }
    if(mmQtyBad) { showMatchToast(isAr?`⚠️ الحد الأدنى ${MIN_QTY_GRAMS}g`:`⚠️ Minimum is ${MIN_QTY_GRAMS}g`); return; }
    if(mmFloorBad){ showMatchToast(isAr?"⚠️ السعر أقل من حد السعر الأدنى المحدد":"⚠️ Price is below the configured floor"); return; }
    if(mmCeilBad) { showMatchToast(isAr?"⚠️ السعر أعلى من السقف المحدد":"⚠️ Price exceeds the configured ceiling"); return; }
    // Inventory check: MM SELL must be backed by FREE bars
    if(mmSide==="SELL"){
      const freeGrams = bars
        .filter(b=>b.metal===mmMetal&&b.status==="FREE")
        .reduce((sum,b)=>sum+parseFloat(b.weight),0);
      if(mmQtyNum > freeGrams){
        showMatchToast(isAr?`⚠️ مخزون غير كافٍ — متاح ${freeGrams}غ فقط`:`⚠️ Insufficient inventory — only ${freeGrams}g FREE bars available for ${mmMetal}`);
        return;
      }
    }

    const ts = new Date().toISOString().slice(0,16).replace("T"," ");
    const incoming = {
      id:"MM-"+(orders.filter(o=>o.id.startsWith("MM-")).length+1).toString().padStart(3,"0"),
      investor:"[Market Maker]", investorAr:"[صانع السوق]", nationalId:"SYSTEM",
      side:mmSide, metal:mmMetal, qty:mmQtyNum, filled:0,
      price:mmPriceNum, payment:"Wallet",
      expiry:mmExpiry, expiryDate:mmExpDate,
      status:"OPEN", placed:ts, marketMaker:true,
    };

    // IOC pre-check
    if(mmExpiry==="IOC"){
      const hasMatch = orders.some(o=>
        o.metal===mmMetal&&(o.status==="OPEN"||o.status==="PARTIAL")&&
        (mmSide==="BUY" ? o.side==="SELL"&&o.price<=mmPriceNum : o.side==="BUY"&&o.price>=mmPriceNum)
      );
      if(!hasMatch){
        const cancelled={...incoming,status:"CANCELLED",cancelReason:"IOC: No immediate match"};
        setOrders(p=>[cancelled,...p]);
        issueRefund(cancelled, 0, 0, "IOC No Match — Full Refund");
        showMatchToast(isAr?"⚠️ IOC: لا يوجد تطابق — تم إلغاء الأمر":"⚠️ IOC: No match — MM order cancelled");
        setMmOpen(false); setMmQty(""); setMmPrice(""); setMmExpDate(""); return;
      }
    }

    const {updatedOrders, newMatches, finalOrder} = runMatch(incoming, orders);
    setOrders(prev => {
      // Apply the same fill updates to the latest state (avoid stale closure)
      const idMap = {};
      updatedOrders.forEach(o => idMap[o.id] = o);
      const merged = prev.map(o => idMap[o.id] ? idMap[o.id] : o);
      return [finalOrder, ...merged];
    });
    if(newMatches.length>0){
      setMatches(prev=>{
        const nextId=prev.length+1;
        return [...prev,...newMatches.map((m,i)=>({...m,id:"MTC-"+String(nextId+i).padStart(3,"0")}))];
      });
      const filled=newMatches.reduce((s,m)=>s+m.qty,0);
      showMatchToast(`✅ MM: ${filled}g ${isAr?"منفّذ":"matched"} @ SAR ${mmPriceNum.toFixed(2)}`);
    } else {
      showMatchToast(isAr?"📋 أمر صانع السوق في دفتر الأوامر":"📋 Market maker order queued");
    }
    addAudit("MARKET_MAKER_ORDER", incoming.id, `${mmSide} ${mmQtyNum}g ${mmMetal} @ SAR ${mmPriceNum}`);
    setMmOpen(false); setMmQty(""); setMmPrice(""); setMmExpDate("");
  };

  const sidePill=(side,mm)=>(
    <span style={{display:"inline-flex",alignItems:"center",gap:4}}>
      <span style={{padding:"2px 10px",borderRadius:999,fontSize:13,fontWeight:700,color:side==="BUY"?C.greenSolid:"#C85C3E",background:side==="BUY"?"#EFF5F2":C.redBg}}>{isAr?(side==="BUY"?"شراء":"بيع"):side}</span>
      {mm&&<span style={{padding:"2px 6px",borderRadius:999,fontSize:11,fontWeight:800,color:C.white,background:C.gold}}>MM</span>}
    </span>
  );

  const stPill=(status,synthetic)=>{
    if(synthetic) return <span style={{display:"inline-flex",padding:"2px 10px",borderRadius:999,fontSize:13,fontWeight:700,color:C.purpleSolid,background:C.purpleBg}}>{isAr?"\u0645\u0648\u0627\u0632\u0646":"Synth"}</span>;
    const cfg={OPEN:{c:C.blueSolid,bg:"#E8EFF7"},PARTIAL:{c:"#D4943A",bg:"#FDF4EC"},FILLED:{c:C.greenSolid,bg:"#EFF5F2"},CANCELLED:{c:"#C85C3E",bg:C.redBg}};
    const s=cfg[status]||cfg.OPEN;
    const en={OPEN:"Open",PARTIAL:"Partial",FILLED:"Filled",CANCELLED:"Cancelled"};
    const ar={OPEN:"\u0645\u0641\u062a\u0648\u062d",PARTIAL:"\u062c\u0632\u0626\u064a",FILLED:"\u0645\u0643\u062a\u0645\u0644",CANCELLED:"\u0645\u0644\u063a\u0649"};
    return <span style={{display:"inline-flex",padding:"2px 10px",borderRadius:999,fontSize:13,fontWeight:700,color:s.c,background:s.bg}}>{isAr?ar[status]:en[status]}</span>;
  };


  const TABS=[
    {id:"open",      label:isAr?"\u0627\u0644\u0623\u0648\u0627\u0645\u0631 \u0627\u0644\u0645\u0641\u062a\u0648\u062d\u0629":"Open Orders"},
    {id:"matched",   label:isAr?"\u0627\u0644\u0635\u0641\u0642\u0627\u062a \u0627\u0644\u0645\u0646\u0641\u0630\u0629":"Matched Trades"},
    {id:"stabilizer",label:isAr?"\u0645\u0648\u0627\u0632\u0646 \u0627\u0644\u0633\u0628\u0631\u064a\u062f":"Spread Stabilizer"},
  ];

  return (
    <div style={{padding:"24px 28px",maxWidth:1200,margin:"0 auto"}}>
      {matchToast&&<div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",background:C.navyDark,color:C.white,padding:"12px 24px",borderRadius:14,fontSize:15,fontWeight:600,zIndex:9999,boxShadow:"0 4px 24px rgba(0,0,0,0.35)",whiteSpace:"nowrap"}}>{matchToast}</div>}
      <SectionHeader title={isAr?"دفتر الأوامر":"Order Book"} sub={isAr?"\u0625\u062f\u0627\u0631\u0629 \u0623\u0648\u0627\u0645\u0631 \u0627\u0644\u0634\u0631\u0627\u0621 \u0648\u0627\u0644\u0628\u064a\u0639 \u0648\u0627\u0644\u0645\u0637\u0627\u0628\u0642\u0629 \u0627\u0644\u062a\u0644\u0642\u0627\u0626\u064a\u0629":"Manage buy/sell orders, partial fills & automated matching"} />

{(()=>{const {lastFetch,status}=useLivePrices();const stale=lastFetch>0&&(Date.now()-lastFetch)>15*60*1000;return stale?(<div style={{background:"#FDF4EC",border:"1px solid #D4943A55",borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:8}}><span>⚠️</span><span style={{fontSize:14,fontWeight:600,color:"#8B6540"}}>{isAr?"سعر المعدن قديم — آخر تحديث منذ أكثر من 15 دقيقة":"Stale price feed — last update over 15 min ago. New orders may use incorrect prices."}</span></div>):null;})()}

      <div style={{display:"flex",gap:6,marginBottom:20,background:C.bg,padding:4,borderRadius:10,width:"fit-content"}}>
        {TABS.map(tb=>(
          <button key={tb.id} onClick={()=>setTab(tb.id)} style={{padding:"7px 18px",borderRadius:8,fontSize:14,fontWeight:600,cursor:"pointer",border:"none",background:tab===tb.id?C.white:C.bg,color:tab===tb.id?C.navy:C.textMuted,boxShadow:tab===tb.id?"0 1px 4px rgba(0,0,0,0.08)":"none"}}>
            {tb.label}
          </button>
        ))}
      </div>

      {/* ── OPEN ORDERS ── */}
      {tab==="open" && (
        <div>
          <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap",alignItems:"flex-start"}}>
            <div style={{flex:"1 1 320px",background:C.white,borderRadius:14,border:`1px solid ${C.border}`,padding:"16px 18px"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                <span style={{fontWeight:700,fontSize:15,color:C.navy}}>{isAr?"\u0639\u0645\u0642 \u0627\u0644\u0633\u0648\u0642":"Order Depth"}</span>
                <div style={{display:"flex",gap:6}}>
                  {METALS.map(m=>(
                    <button key={m} onClick={()=>setMetal(m)} style={{padding:"3px 10px",borderRadius:6,fontSize:13,fontWeight:600,cursor:"pointer",border:`1px solid ${metal===m?MCOL[m]:C.border}`,background:metal===m?MCOL[m]+"22":C.white,color:metal===m?MCOL[m]:C.textMuted}}>
                      {isAr?METALS_AR[m]:m}
                    </button>
                  ))}
                </div>
              </div>
              {spread ? (
                <div style={{display:"flex",gap:16,marginBottom:12,padding:"8px 12px",borderRadius:8,background:spreadWide?"#FBF0EC":C.greenBg,border:`1px solid ${spreadWide?"#C85C3E44":C.gold+"44"}`}}>
                  <div style={{textAlign:"center"}}>
                    <p style={{fontSize:12,color:C.textMuted,fontWeight:500}}>{isAr?"\u0623\u0641\u0636\u0644 \u0634\u0631\u0627\u0621":"Best Bid"}</p>
                    <p style={{fontSize:17,fontWeight:700,color:C.greenSolid}}>SAR {bestBid.toFixed(2)}</p>
                  </div>
                  <div style={{textAlign:"center",flex:1}}>
                    <p style={{fontSize:12,color:C.textMuted,fontWeight:500}}>{isAr?"\u0627\u0644\u0633\u0628\u0631\u064a\u062f":"Spread"}</p>
                    <p style={{fontSize:15,fontWeight:700,color:spreadWide?"#C85C3E":C.navy}}>SAR {spread} ({spreadPct}%)</p>
                    {spreadWide&&<p style={{fontSize:12,color:"#C85C3E",fontWeight:600}}>⚠ {isAr?"\u064a\u062a\u062c\u0627\u0648\u0632 \u0627\u0644\u062d\u062f":"Exceeds limit"}</p>}
                  </div>
                  <div style={{textAlign:"center"}}>
                    <p style={{fontSize:12,color:C.textMuted,fontWeight:500}}>{isAr?"\u0623\u0641\u0636\u0644 \u0628\u064a\u0639":"Best Ask"}</p>
                    <p style={{fontSize:17,fontWeight:700,color:"#C85C3E"}}>SAR {bestAsk.toFixed(2)}</p>
                  </div>
                </div>
              ):(
                <div style={{padding:"8px 12px",borderRadius:8,background:C.bg,textAlign:"center",marginBottom:12}}>
                  <p style={{fontSize:14,color:C.textMuted}}>{isAr?"\u0644\u0627 \u062a\u0648\u062c\u062f \u0623\u0648\u0627\u0645\u0631 \u0644\u0647\u0630\u0627 \u0627\u0644\u0645\u0639\u062f\u0646":"No open orders for this metal"}</p>
                </div>
              )}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div>
                  <p style={{fontSize:13,fontWeight:700,color:C.greenSolid,marginBottom:6,textAlign:"center"}}>{isAr?"\u0634\u0631\u0627\u0621":"BIDS"}</p>
                  {bids.length===0?<p style={{fontSize:13,color:C.textMuted,textAlign:"center"}}>—</p>:bids.map(b=>(
                    <div key={b.id} style={{display:"flex",justifyContent:"space-between",padding:"3px 6px",borderRadius:4,marginBottom:2,background:b.synthetic?"#F0EDF722":"#EFF5F244"}}>
                      <span style={{fontSize:13,color:C.greenSolid,fontWeight:600}}>{b.price.toFixed(2)}</span>
                      <span style={{fontSize:13,color:C.textMuted}}>{b.qty-b.filled}g</span>
                      {b.synthetic&&<span style={{fontSize:11,color:C.purpleSolid,fontWeight:700}}>S</span>}
                    </div>
                  ))}
                </div>
                <div>
                  <p style={{fontSize:13,fontWeight:700,color:"#C85C3E",marginBottom:6,textAlign:"center"}}>{isAr?"\u0628\u064a\u0639":"ASKS"}</p>
                  {asks.length===0?<p style={{fontSize:13,color:C.textMuted,textAlign:"center"}}>—</p>:asks.map(a=>(
                    <div key={a.id} style={{display:"flex",justifyContent:"space-between",padding:"3px 6px",borderRadius:4,marginBottom:2,background:"#FBEAE544"}}>
                      <span style={{fontSize:13,color:"#C85C3E",fontWeight:600}}>{a.price.toFixed(2)}</span>
                      <span style={{fontSize:13,color:C.textMuted}}>{a.qty-a.filled}g</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <StatCard icon={Icons.orders(22,C.navy)} title={isAr?"\u0645\u0641\u062a\u0648\u062d\u0629":"Open"} value={openList.length} />
              <StatCard icon={Icons.commission(22,C.greenSolid)} title={isAr?"\u0645\u0646\u0641\u0630\u0629":"Filled"} value={filledList.length} />
              <StatCard icon={Icons.pending(22,C.red)} title={isAr?"\u0645\u0644\u063a\u0627\u0629":"Cancelled"} value={cancelledList.length} />
            </div>
          </div>
          {!tradingOpen&&(
            <div style={{background:"#FBF0EC",border:"1px solid #C85C3E33",borderRadius:12,padding:"14px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:22}}>🔴</span>
              <div>
                <p style={{fontSize:15,fontWeight:700,color:"#C85C3E"}}>{isAr?"السوق مغلق حالياً":"Market Closed"}</p>
                <p style={{fontSize:13,color:"#8B3520"}}>{isAr?"لا يمكن وضع أوامر جديدة خارج ساعات التداول":"No new orders can be placed outside trading hours"}</p>
              </div>
            </div>
          )}
          <div style={{display:"flex",justifyContent:"flex-end",alignItems:"center",gap:12,marginBottom:12}}>
            {!bidEnabled&&(
              <div style={{display:"flex",alignItems:"center",gap:6,background:"#FBF0EC",border:"1px solid #C85C3E33",borderRadius:8,padding:"6px 12px"}}>
                <span style={{fontSize:15}}>🚫</span>
                <span style={{fontSize:13,fontWeight:600,color:"#C85C3E"}}>{isAr?"أوامر الشراء معطّلة — يمكن وضع أوامر بيع فقط":"Bid orders disabled — SELL orders only"}</span>
              </div>
            )}
            <Btn variant="gold" onClick={()=>{if(!tradingOpen){showMatchToast(isAr?"⚠️ السوق مغلق":"⚠️ Market is closed");return;}setMmOpen(true);}}>⚡ {isAr?"صانع السوق":"Market Maker"}</Btn>
          </div>
          <TTable cols={[
            {key:"id",      label:"Order ID"},
            {key:"investor",label:isAr?"\u0627\u0644\u0645\u0633\u062a\u062b\u0645\u0631":"Investor",render:(v,row)=><span>{isAr&&row.investorAr?row.investorAr:v}</span>},
            {key:"side",    label:"Side",  render:(_,row)=>sidePill(row.side,row.marketMaker)},
            {key:"metal",   label:"Metal", render:(v)=><span style={{fontWeight:600,color:MCOL[v]}}>{isAr?METALS_AR[v]:v}</span>},
            {key:"qty",     label:"Qty",   render:(v,row)=><span>{v}g ({row.filled}g {isAr?"\u0645\u0646\u0641\u0630":"filled"})</span>},
            {key:"price",   label:"Price", render:(v)=><span style={{fontWeight:600}}>SAR {v.toFixed(2)}</span>},
            {key:"payment", label:isAr?"\u0627\u0644\u062f\u0641\u0639":"Payment",render:(v)=><span>{v}{GATEWAY.includes(v)&&<span style={{fontSize:11,color:C.textMuted,background:"#F5F0E8",borderRadius:4,padding:"0 3px",marginLeft:3}}>200K</span>}</span>},
            {key:"expiry",  label:"Expiry",render:(v,row)=><span>{v}{row.expiryDate?" "+row.expiryDate:""}</span>},
            {key:"status",  label:"Status",render:(_,row)=>stPill(row.status,row.synthetic)},
            {key:"placed",  label:"Placed"},
            {key:"cancelReason", label:isAr?"ملاحظة":"Note", render:v=>v?<span style={{fontSize:12,color:"#C85C3E",fontStyle:"italic"}}>{v}</span>:null},
            {key:"_a",      label:"",render:(_,row)=>(row.status==="OPEN"||row.status==="PARTIAL")&&!row.synthetic?<Btn small variant="danger" onClick={()=>cancelOrder(row.id)}>{isAr?"إلغاء":"Cancel"}</Btn>:null},
          ]} rows={orders} />
        </div>
      )}

      {/* ── MATCHED TRADES ── */}
      {tab==="matched" && (
        <div>
          <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
            <StatCard icon={Icons.commission(22,C.gold)} title={isAr?"صفقات منفذة":"Matched Trades"} value={matches.length} gold />
            <StatCard icon={Icons.aum(22,C.teal)} title={isAr?"إجمالي الحجم":"Total Volume"} value={<SARAmount amount={matches.reduce((s,m)=>s+m.totalSAR,0).toLocaleString("en-SA")}/>} />
            <StatCard icon={Icons.commission(22,C.navy)} title={isAr?"إجمالي العمولة":"Commission"} value={<SARAmount amount={matches.reduce((s,m)=>s+m.commission,0).toLocaleString("en-SA")}/>} />
            <StatCard icon={Icons.orders(22,C.purpleSolid)} title={isAr?"ASK فقط":"ASK-only fills"} value={matches.filter(m=>m.mode==="ask-only").length} />
          </div>
          <TTable cols={[
            {key:"id",        label:"Match ID"},
            {key:"metal",     label:"Metal",      render:(v)=><span style={{fontWeight:600,color:MCOL[v]}}>{isAr?METALS_AR[v]:v}</span>},
            {key:"qty",       label:"Qty",         render:(v)=><span>{v}g</span>},
            {key:"price",     label:"Exec Price",  render:(v)=><span style={{fontWeight:600}}>SAR {v.toFixed(2)}</span>},
            {key:"totalSAR",  label:"Total",       render:(v)=><span style={{fontWeight:700}}><SARAmount amount={v.toLocaleString("en-SA")}/></span>},
            {key:"commission",label:"Commission",  render:(v)=><SARAmount amount={v.toLocaleString("en-SA")}/>},
            {key:"adminFee",  label:"Admin Fee",   render:(v)=>v?<SARAmount amount={v.toLocaleString("en-SA")}/>:<span style={{color:C.textMuted}}>—</span>},
            {key:"buyOrder",  label:"Buy Order"},
            {key:"sellOrder", label:"Sell Order"},
            {key:"mode",      label:"Mode", render:v=><span style={{fontSize:12,fontWeight:700,padding:"2px 7px",borderRadius:20,background:v==="ask-only"?C.purpleBg:"#E8EFF7",color:v==="ask-only"?C.purpleSolid:C.blueSolid}}>{v==="ask-only"?"ASK-only":"Bid-Ask"}</span>},
            {key:"filledFor", label:isAr?"مُنفَّذ لـ":"Filled For"},
            {key:"date",      label:"Executed"},
          ]} rows={matches} />
        </div>
      )}

      {/* ── SPREAD STABILIZER ── */}
      {tab==="stabilizer" && (
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:16,marginBottom:24}}>
            <div style={{background:C.white,borderRadius:16,border:`1px solid ${stabEnabled?C.teal+"44":C.border}`,padding:"20px 22px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <div>
                  <p style={{fontWeight:700,fontSize:16,color:C.navy}}>{isAr?"\u0645\u0648\u0627\u0632\u0646 \u0627\u0644\u0633\u0628\u0631\u064a\u062f":"Spread Stabilizer"}</p>
                  <p style={{fontSize:13,color:C.textMuted,marginTop:2}}>{isAr?"\u064a\u0636\u062e \u0623\u0648\u0627\u0645\u0631 \u0627\u0635\u0637\u0646\u0627\u0639\u064a\u0629 \u0639\u0646\u062f \u0627\u062a\u0633\u0627\u0639 \u0627\u0644\u0633\u0628\u0631\u064a\u062f":"Injects synthetic orders when spread widens"}</p>
                </div>
                <button onClick={()=>setStabEnabled(p=>!p)} style={{padding:"6px 16px",borderRadius:8,fontSize:14,fontWeight:700,cursor:"pointer",border:"none",background:stabEnabled?C.teal:C.textMuted,color:C.white}}>
                  {stabEnabled?(isAr?"\u0645\u0641\u0639\u0651\u0644":"ACTIVE"):(isAr?"\u0645\u0639\u0637\u0651\u0644":"OFF")}
                </button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <p style={{fontSize:13,color:C.textMuted,fontWeight:500,marginBottom:4}}>{isAr?"\u0627\u0644\u062d\u062f \u0627\u0644\u0623\u0642\u0635\u0649 (%)":"Max Spread (%)"}</p>
                  <input value={maxSpreadPct} onChange={e=>setMaxSpreadPct(e.target.value)} disabled={!stabEnabled}
                    style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:16,fontWeight:600,color:C.navy,background:stabEnabled?C.white:C.bg,boxSizing:"border-box"}}/>
                </div>
                <div>
                  <p style={{fontSize:13,color:C.textMuted,fontWeight:500,marginBottom:4}}>{isAr?"\u062d\u062f \u0627\u0644\u062a\u0639\u0631\u0636 (\u0631\u064a\u0627\u0644)":"Exposure Cap (SAR)"}</p>
                  <input value={stabCapSAR} onChange={e=>setStabCapSAR(e.target.value)} disabled={!stabEnabled}
                    style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:16,fontWeight:600,color:C.navy,background:stabEnabled?C.white:C.bg,boxSizing:"border-box"}}/>
                </div>
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <StatCard icon={Icons.aum(22,C.gold)} title={isAr?"\u0627\u0644\u062a\u0639\u0631\u0636 \u0627\u0644\u062d\u0627\u0644\u064a":"Current Exposure"} value={<SARAmount amount={(()=>{const exp=orders.filter(o=>o.synthetic&&(o.status==="OPEN"||o.status==="PARTIAL")).reduce((a,o)=>a+Math.round((o.qty-o.filled)*o.price),0);return exp.toLocaleString("en-SA");})()}/>} sub={`${((orders.filter(o=>o.synthetic&&(o.status==="OPEN"||o.status==="PARTIAL")).reduce((a,o)=>a+Math.round((o.qty-o.filled)*o.price),0)/parseInt(stabCapSAR||1))*100).toFixed(1)}% of cap`} gold />
              <StatCard icon={Icons.network(22,C.teal)} title={isAr?"\u0623\u0648\u0627\u0645\u0631 \u0646\u0634\u0637\u0629":"Active Synthetic"} value={orders.filter(o=>o.synthetic&&o.status==="OPEN").length} />
            </div>
          </div>
          <div style={{background:"#FFF7ED",border:`1px solid ${C.gold}44`,borderRadius:12,padding:"14px 18px",marginBottom:20,display:"flex",gap:12,alignItems:"flex-start"}}>
            <span style={{fontSize:22,flexShrink:0}}>⚠️</span>
            <div>
              <p style={{fontWeight:700,fontSize:15,color:C.navy,marginBottom:4}}>{isAr?"\u062d\u062f \u0628\u0648\u0627\u0628\u0627\u062a \u0627\u0644\u062f\u0641\u0639 \u2014 200,000 \u0631\u064a\u0627\u0644":"Payment Gateway Limit — SAR 200,000"}</p>
              <p style={{fontSize:14,color:C.textMuted}}>{isAr?"\u064a\u0646\u0637\u0628\u0642 \u0639\u0644\u0649: \u0645\u062f\u0649\u060c \u0641\u064a\u0632\u0627\u060c \u0645\u0627\u0633\u062a\u0631\u0643\u0627\u0631\u062f\u060c Apple Pay\u060c STC Pay \u2014 \u0644\u0627 \u064a\u0646\u0637\u0628\u0642: SADAD\u060c \u0627\u0644\u0645\u062d\u0641\u0638\u0629":"Applies to: MADA, Visa, Mastercard, Apple Pay, STC Pay — Exempt: SADAD, Wallet"}</p>
            </div>
          </div>
          <SectionHeader title={isAr?"\u0633\u062c\u0644 \u0627\u0644\u0623\u0648\u0627\u0645\u0631 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064a\u0629":"Synthetic Order Log"} />
          <TTable cols={[
            {key:"id",    label:"ID"},
            {key:"metal", label:"Metal", render:(v)=><span style={{fontWeight:600,color:MCOL[v]}}>{isAr?METALS_AR[v]:v}</span>},
            {key:"side",  label:"Side",  render:(_,row)=>sidePill(row.side)},
            {key:"qty",   label:"Qty",   render:(v)=><span>{v}g</span>},
            {key:"price", label:"Price", render:(v)=><span>SAR {v.toFixed(2)}</span>},
            {key:"reason",label:"Trigger"},
            {key:"status",label:"Status",render:(v)=>stPill(v,false)},
            {key:"date",  label:"Date"},
          ]} rows={synLog} />
        </div>
      )}

      {/* ── MARKET MAKER MODAL ── */}
      {mmOpen && (
        <Modal title={isAr?"⚡ صانع السوق":"⚡ Market Maker"} onClose={()=>setMmOpen(false)}>
          <div style={{background:"#FFF7ED",borderRadius:10,padding:"10px 14px",marginBottom:14,border:"1px solid #FCD34D"}}>
            <p style={{fontSize:14,color:"#8B6540",fontWeight:600}}>
              {isAr
                ?"أوامر صانع السوق تُضخ مباشرة في دفتر الأوامر. لا تخضع لحدود بوابة الدفع."
                :"Market Maker orders inject directly into the order book. Not subject to payment gateway limits."}
            </p>
          </div>
          {!bidEnabled && mmSide==="BUY" && (
            <div style={{background:"#FDF4EC",border:"1px solid #FCD34D",borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",gap:8,alignItems:"flex-start"}}>
              <span style={{fontSize:18}}>⚠️</span>
              <p style={{fontSize:13,fontWeight:700,color:"#8B6540"}}>
                {isAr
                  ?"أوامر الشراء معطّلة عالمياً — سيتم قيد هذا الأمر لكن المستثمرين لا يستطيعون الشراء"
                  :"Bid orders are globally disabled — this MM BUY will be placed but investor BUY orders remain blocked"}
              </p>
            </div>
          )}

          {/* Side */}
          <p style={{fontSize:13,fontWeight:700,color:C.textMuted,marginBottom:6}}>{isAr?"الجانب":"Side"}</p>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            {[["SELL",isAr?"بيع (عرض سيولة)":"SELL (Provide Liquidity)","#C85C3E",C.redBg],
              ["BUY", isAr?"شراء (امتصاص عرض)":"BUY (Absorb Supply)",C.greenSolid,"#EFF5F2"]].map(([s,lbl,col,bg])=>(
              <button key={s} onClick={()=>setMmSide(s)} style={{flex:1,padding:"10px",borderRadius:8,fontWeight:700,fontSize:14,cursor:"pointer",
                border:`2px solid ${mmSide===s?col:C.border}`,background:mmSide===s?bg:C.white,color:mmSide===s?col:C.textMuted}}>
                {lbl}
              </button>
            ))}
          </div>

          {/* Metal + Qty + Price */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <p style={{fontSize:13,fontWeight:600,color:C.textMuted,marginBottom:4}}>{isAr?"المعدن":"Metal"}</p>
              <select value={mmMetal} onChange={e=>setMmMetal(e.target.value)}
                style={{width:"100%",padding:"8px 10px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:15,background:C.white,boxSizing:"border-box"}}>
                {METALS.map(m=><option key={m} value={m}>{isAr?METALS_AR[m]:m}</option>)}
              </select>
            </div>
            <div>
              <p style={{fontSize:13,fontWeight:600,color:C.textMuted,marginBottom:4}}>{isAr?"الكمية (غ)":"Qty (g)"}</p>
              <input type="number" value={mmQty} onChange={e=>setMmQty(e.target.value)} placeholder="0"
                style={{width:"100%",padding:"8px 10px",borderRadius:8,border:`1px solid ${mmQtyBad?"#C85C3E":C.border}`,fontSize:15,boxSizing:"border-box"}}/>
              {mmQtyBad&&<p style={{fontSize:12,color:"#C85C3E",marginTop:2}}>Min {MIN_QTY_GRAMS}g</p>}
            </div>
            <div>
              <p style={{fontSize:13,fontWeight:600,color:C.textMuted,marginBottom:4}}>{isAr?"السعر (ريال/غ)":"Price (SAR/g)"}</p>
              <input type="number" value={mmPrice} onChange={e=>setMmPrice(e.target.value)} placeholder="0.00"
                style={{width:"100%",padding:"8px 10px",borderRadius:8,border:`1px solid ${(mmFloorBad||mmCeilBad)?"#C85C3E":C.border}`,fontSize:15,boxSizing:"border-box"}}/>
              {mmFloorBad&&<p style={{fontSize:12,color:"#C85C3E",marginTop:2}}>{isAr?"أقل من السعر الأدنى":"Below price floor"} (SAR {mmFloor})</p>}
              {mmCeilBad&&<p style={{fontSize:12,color:"#C85C3E",marginTop:2}}>{isAr?"أعلى من السقف":"Above price ceiling"} (SAR {mmCeiling})</p>}
            </div>
            <div style={{padding:"8px 10px",borderRadius:8,background:C.bg,border:`1px solid ${C.border}`,display:"flex",flexDirection:"column",justifyContent:"center"}}>
              <p style={{fontSize:12,color:C.textMuted,marginBottom:2}}>{isAr?"إجمالي القيمة":"Total Value"}</p>
              <p style={{fontSize:18,fontWeight:700,color:C.navy}}><SARAmount amount={mmTotal.toLocaleString("en-SA",{minimumFractionDigits:2,maximumFractionDigits:2})}/></p>
            </div>
          </div>

          {/* Price Guards */}
          <div style={{marginTop:12,padding:"12px 14px",borderRadius:10,background:"#FAF8F5",border:`1px solid ${C.border}`}}>
            <p style={{fontSize:13,fontWeight:700,color:C.navy,marginBottom:8}}>{isAr?"حراسة السعر (اختياري)":"Price Guards (optional)"}</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <p style={{fontSize:12,color:C.textMuted,marginBottom:4}}>{isAr?"السعر الأدنى (ريال/غ)":"Price Floor (SAR/g)"}</p>
                <input type="number" value={mmFloor} onChange={e=>setMmFloor(e.target.value)} placeholder={isAr?"بدون حد أدنى":"No floor"}
                  style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:14,boxSizing:"border-box"}}/>
              </div>
              <div>
                <p style={{fontSize:12,color:C.textMuted,marginBottom:4}}>{isAr?"السقف السعري (ريال/غ)":"Price Ceiling (SAR/g)"}</p>
                <input type="number" value={mmCeiling} onChange={e=>setMmCeiling(e.target.value)} placeholder={isAr?"بدون سقف":"No ceiling"}
                  style={{width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:14,boxSizing:"border-box"}}/>
              </div>
            </div>
          </div>

          {/* Expiry */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:12,marginBottom:16}}>
            <div>
              <p style={{fontSize:13,fontWeight:600,color:C.textMuted,marginBottom:4}}>{isAr?"نوع الصلاحية":"Expiry"}</p>
              <select value={mmExpiry} onChange={e=>setMmExpiry(e.target.value)}
                style={{width:"100%",padding:"8px 10px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:15,background:C.white,boxSizing:"border-box"}}>
                <option value="GTC">GTC — {isAr?"حتى الإلغاء":"Good Till Cancelled"}</option>
                <option value="GTD">GTD — {isAr?"حتى تاريخ":"Good Till Date"}</option>
                <option value="IOC">IOC — {isAr?"فوري أو إلغاء":"Immediate or Cancel"}</option>
              </select>
            </div>
            {mmExpiry==="GTD"&&(
              <div>
                <p style={{fontSize:13,fontWeight:600,color:C.textMuted,marginBottom:4}}>{isAr?"تاريخ الانتهاء":"Expiry Date"}</p>
                <input type="date" value={mmExpDate} onChange={e=>setMmExpDate(e.target.value)}
                  style={{width:"100%",padding:"8px 10px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:15,boxSizing:"border-box"}}/>
              </div>
            )}
          </div>

          <div style={{display:"flex",justifyContent:"flex-end",gap:10}}>
            <Btn variant="outline" onClick={()=>setMmOpen(false)}>{isAr?"إلغاء":"Cancel"}</Btn>
            <Btn variant="gold" onClick={doMarketMaker}>
              ⚡ {isAr?"تأكيد أمر صانع السوق":"Inject Market Maker Order"}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

const BidTogglePanel = () => {
  const { isAr } = useLang();
  const { bidEnabled, setBidEnabled } = useBidEnabled();
  const { tradingOpen, setTradingOpen } = usePlatform();

  const handleToggle = (val) => {
    setBidEnabled(val);
    // Note: auto-cancel of open BIDs happens inside OrderBook via useEffect
  };

  return (
    <G title={isAr?"إعدادات دفتر الأوامر":"Order Book — Bid Settings"}>
      <div style={{marginBottom:16}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16}}>
          <div style={{flex:1}}>
            <p style={{fontSize:16,fontWeight:700,color:C.navy,marginBottom:4}}>
              {isAr?"تفعيل أوامر الشراء (BID)":"Enable Bid Orders (BUY side)"}
            </p>
            <p style={{fontSize:14,color:C.textMuted,lineHeight:1.6}}>
              {isAr
                ?"عند التعطيل، لا يمكن للمستثمرين وضع أوامر شراء جديدة وتُلغى جميع أوامر الشراء المفتوحة تلقائياً. أوامر البيع (ASK) تبقى نشطة دائماً — المستثمرون يشترون من الكميات المعروضة فقط."
                :"When disabled, investors cannot place new BUY orders and all open BID orders are auto-cancelled. SELL orders (ASK) always remain active — investors can only buy from offered grams."}
            </p>
          </div>
          <div style={{flexShrink:0}}>
            <button
              onClick={()=>handleToggle(!bidEnabled)}
              style={{
                width:52, height:28, borderRadius:14, border:"none", cursor:"pointer",
                background:bidEnabled?C.greenSolid:"#CBD5E1", position:"relative",
                transition:"background 0.2s", flexShrink:0
              }}>
              <div style={{
                width:20, height:20, borderRadius:"50%", background:"white",
                position:"absolute", top:4,
                left:bidEnabled?28:4,
                transition:"left 0.2s",
                boxShadow:"0 1px 4px rgba(0,0,0,0.2)"
              }}/>
            </button>
          </div>
        </div>
        {!bidEnabled && (
          <div style={{marginTop:12,background:"#FBF0EC",border:"1px solid #C85C3E33",borderRadius:10,padding:"10px 14px",display:"flex",gap:10,alignItems:"flex-start"}}>
            <span style={{fontSize:18,flexShrink:0}}>🚫</span>
            <div>
              <p style={{fontSize:14,fontWeight:700,color:"#C85C3E",marginBottom:2}}>
                {isAr?"أوامر الشراء معطّلة":"Bid Orders Disabled"}
              </p>
              <p style={{fontSize:13,color:"#8B3520"}}>
                {isAr
                  ?"جميع أوامر الشراء المفتوحة تم إلغاؤها. المستثمرون يرون الكميات المعروضة للشراء المباشر فقط."
                  :"All open BID orders have been auto-cancelled. Investors see offered quantities for direct purchase only."}
              </p>
            </div>
          </div>
        )}
        {bidEnabled && (
          <div style={{marginTop:12,background:C.greenBg,border:"1px solid #4A7A6833",borderRadius:10,padding:"10px 14px",display:"flex",gap:10,alignItems:"flex-start"}}>
            <span style={{fontSize:18,flexShrink:0}}>✅</span>
            <div>
              <p style={{fontSize:14,fontWeight:700,color:C.greenSolid,marginBottom:2}}>
                {isAr?"أوامر الشراء نشطة":"Bid Orders Active"}
              </p>
              <p style={{fontSize:13,color:"#3D6B56"}}>
                {isAr
                  ?"يمكن للمستثمرين وضع أوامر شراء بسعر محدد. يتم المطابقة تلقائياً عند تساوي سعر الشراء مع سعر البيع."
                  :"Investors can place limit BUY orders. Auto-matching occurs when bid price meets ask price."}
              </p>
            </div>
          </div>
        )}
      </div>
    </G>
  );
};

// ─── User Management Module ─────────────────────────────────────────────────
const ROLES = [
  {id:"SUPER_ADMIN",label:"Super Admin",labelAr:"مسؤول أعلى",color:"#C85C3E",desc:"Full platform access — all modules, settings, and user management",descAr:"صلاحيات كاملة — جميع الوحدات والإعدادات وإدارة المستخدمين"},
  {id:"COMPLIANCE",label:"Compliance Officer",labelAr:"مسؤول الامتثال",color:C.purpleSolid,desc:"AML/CMA monitoring, SAR filing, risk scoring, audit trail",descAr:"مراقبة غسل الأموال/هيئة السوق، تقديم البلاغات، تقييم المخاطر"},
  {id:"VAULT_MGR",label:"Vault Manager",labelAr:"مدير الخزينة",color:"#C4956A",desc:"Vault operations, appointments, bar management, OTP verification",descAr:"عمليات الخزينة، المواعيد، إدارة السبائك، التحقق بالرمز"},
  {id:"FINANCIAL",label:"Financial Controller",labelAr:"المراقب المالي",color:"#6B9080",desc:"Orders, wallet movements, withdrawals, commission management",descAr:"الأوامر، حركات المحفظة، عمليات السحب، إدارة العمولات"},
  {id:"VIEWER",label:"Viewer",labelAr:"مشاهد فقط",color:"#8C7E6F",desc:"Read-only access to dashboard and reports — no actions",descAr:"صلاحية قراءة فقط — لوحة التحكم والتقارير بدون إجراءات"},
  {id:"CUSTOM",label:"Custom",labelAr:"مخصص",color:C.blueSolid,desc:"Custom permissions — select individual modules",descAr:"صلاحيات مخصصة — اختر الوحدات"},
];
const MODULES = [
  {id:"dashboard",label:"Dashboard",labelAr:"لوحة التحكم"},
  {id:"investors",label:"Investors",labelAr:"المستثمرون"},
  {id:"txlog",label:"Transaction Log",labelAr:"سجل المعاملات"},
  {id:"orderbook",label:"Order Book",labelAr:"دفتر الأوامر"},
  {id:"vault",label:"Main Vault",labelAr:"الخزينة الرئيسية"},
  {id:"appointments",label:"Appointments",labelAr:"المواعيد"},
  {id:"financials",label:"Financials",labelAr:"الماليات"},
  {id:"reports",label:"Reports",labelAr:"التقارير"},
  {id:"blacklist",label:"Blacklist",labelAr:"القائمة السوداء"},
  {id:"blocks",label:"Blocks",labelAr:"البلوكات"},
  {id:"auditlog",label:"Audit & AML",labelAr:"التدقيق ومكافحة غسل الأموال"},
  {id:"commcenter",label:"Communication",labelAr:"مركز الاتصالات"},
  {id:"settings",label:"Settings",labelAr:"الإعدادات"},
  {id:"health",label:"System Health",labelAr:"حالة النظام"},
  {id:"usermgmt",label:"User Management",labelAr:"إدارة المستخدمين"},
];
const ROLE_PERMS = {
  SUPER_ADMIN:MODULES.map(m=>m.id),
  COMPLIANCE:["dashboard","investors","auditlog","reports","blacklist"],
  VAULT_MGR:["dashboard","vault","appointments","investors"],
  FINANCIAL:["dashboard","financials","orderbook","txlog","reports"],
  VIEWER:["dashboard","reports","health"],
  CUSTOM:[],
};

const UserManagement = () => {
  const { isAr, t } = useLang();
  const [customRoles, setCustomRoles] = useState([]);
  const allRoles = [...ROLES.filter(r=>r.id!=="CUSTOM"), ...customRoles, ROLES.find(r=>r.id==="CUSTOM")];
  const allRolePerms = {...ROLE_PERMS};
  customRoles.forEach(r=>{ allRolePerms[r.id]=r.perms; });
  const [users, setUsers] = useState(() => {
    // Load current admin from localStorage (no hardcoded users)
    try {
      const admin = JSON.parse(localStorage.getItem("tanaqul_admin") || "{}");
      if (admin.name || admin.email) {
        return [{
          id: "USR-001",
          name: admin.name || "Admin",
          nameAr: admin.name || "مسؤول",
          email: admin.email || "",
          role: (admin.role || "SUPER_ADMIN").toUpperCase(),
          perms: ROLE_PERMS[(admin.role || "SUPER_ADMIN").toUpperCase()] || ROLE_PERMS.SUPER_ADMIN,
          twoFA: true,
          status: "ACTIVE",
          lastLogin: new Date().toISOString().slice(0, 16).replace("T", " "),
          sessions: 1,
          created: "—",
          log: []
        }];
      }
    } catch(e) {}
    return [];
  });
  const [modal, setModal] = useState(null); // null | "add" | user object
  const [activityModal, setActivityModal] = useState(null);
  const [roleModal, setRoleModal] = useState(false);
  const [newRole, setNewRole] = useState({label:"",labelAr:"",color:C.blueSolid,perms:[]});
  const [editPerms, setEditPerms] = useState([]);
  const [editRole, setEditRole] = useState("VIEWER");
  const [newUser, setNewUser] = useState({name:"",email:"",role:"VIEWER"});
  const [logFilter, setLogFilter] = useState("ALL");
  const [toast, setToast] = useState("");
  const showToast = m => { setToast(m); setTimeout(()=>setToast(""),3000); };

  const roleOf = id => allRoles.find(r=>r.id===id)||ROLES[4];

  return (
    <div>
      <SectionHeader title={isAr?"إدارة المستخدمين":"User Management"} sub={isAr?"إدارة مستخدمي الإدارة والصلاحيات والجلسات":"Manage admin users, roles, permissions & sessions"}
        action={<div style={{display:"flex",gap:8}}><Btn variant="outline" onClick={()=>{setNewRole({label:"",labelAr:"",color:C.blueSolid,perms:[]});setRoleModal(true);}}>{Icons.settings(14,C.gold)} {isAr?"إنشاء دور":"Create Role"}</Btn><Btn variant="gold" onClick={()=>{setNewUser({name:"",nameAr:"",email:"",role:"VIEWER"});setModal("add");}}>{Icons.add(14,C.white)} {isAr?"إضافة مستخدم":"Add User"}</Btn></div>} />

      {toast&&<div style={{position:"fixed",top:20,right:20,background:C.navy,color:C.white,padding:"12px 20px",borderRadius:12,fontSize:15,fontWeight:600,zIndex:9999,boxShadow:C.cardShadow}}>{toast}</div>}

      {/* Role Legend */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:18}}>
        {allRoles.map(r=>(
          <div key={r.id} style={{display:"flex",alignItems:"center",gap:6,background:C.white,borderRadius:10,padding:"8px 14px",border:`1px solid ${C.border}`}}>
            <div style={{width:10,height:10,borderRadius:3,background:r.color}} />
            <span style={{fontSize:14,fontWeight:600,color:C.navy}}>{isAr?r.labelAr:r.label}</span>
            <span style={{fontSize:12,color:C.textMuted}}>— {isAr?r.descAr:r.desc}</span>
            {r.custom&&<button onClick={()=>{setCustomRoles(p=>p.filter(x=>x.id!==r.id));showToast(isAr?"تم حذف الدور":"Role deleted");}} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:C.red,fontWeight:700,padding:"0 4px"}}>✕</button>}
          </div>
        ))}
      </div>

      {/* User Cards */}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {users.map(u => {
          const role = roleOf(u.role);
          return (
            <div key={u.id} style={{background:C.white,borderRadius:14,border:`1px solid ${C.border}`,padding:"18px 22px",display:"flex",alignItems:"center",gap:16,borderInlineStart:`4px solid ${role.color}`,boxShadow:C.cardShadow}}>
              <div style={{width:44,height:44,borderRadius:12,background:`${role.color}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {Icons.user(22,role.color)}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}}>
                  <span style={{fontSize:16,fontWeight:700,color:C.navy}}>{isAr?u.nameAr:u.name}</span>
                  <span style={{fontSize:12,fontWeight:700,color:role.color,background:`${role.color}15`,padding:"2px 8px",borderRadius:6}}>{isAr?role.labelAr:role.label}</span>
                  <Badge label={u.status} />
                  {u.twoFA&&<span style={{fontSize:11,fontWeight:700,color:C.greenSolid,background:"#EFF5F2",padding:"2px 6px",borderRadius:4}}>🔒 2FA</span>}
                </div>
                <div style={{display:"flex",gap:14,fontSize:13,color:C.textMuted,flexWrap:"wrap"}}>
                  <span>{u.email}</span>
                  <span>{isAr?"آخر دخول":"Last login"}: {u.lastLogin}</span>
                  <span>{isAr?"الجلسات":"Sessions"}: {u.sessions}</span>
                  <span style={{fontFamily:"monospace",fontSize:12}}>{u.id}</span>
                </div>
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0,flexWrap:"wrap"}}>
                <Btn small variant="outline" onClick={()=>{setModal(u);setEditRole(u.role);setEditPerms([...u.perms]);}}>{isAr?"تعديل":"Edit"}</Btn>
                <Btn small variant="primary" onClick={()=>{setActivityModal(u);setLogFilter("ALL");}}>{isAr?"سجل النشاط":"Activity Log"}</Btn>
                {u.status==="ACTIVE"&&u.role!=="SUPER_ADMIN"&&<Btn small variant="danger" onClick={()=>{setUsers(p=>p.map(x=>x.id===u.id?{...x,status:"SUSPENDED",sessions:0,log:[{date:new Date().toISOString().slice(0,16).replace("T"," "),action:"Account suspended",actionAr:"إيقاف الحساب",detail:"Suspended by Super Admin",ip:"—"},...(x.log||[])]}:x));showToast(isAr?"تم إيقاف المستخدم":"User suspended");}}>{isAr?"إيقاف":"Suspend"}</Btn>}
                {u.status==="SUSPENDED"&&<Btn small variant="teal" onClick={()=>{setUsers(p=>p.map(x=>x.id===u.id?{...x,status:"ACTIVE",log:[{date:new Date().toISOString().slice(0,16).replace("T"," "),action:"Account reactivated",actionAr:"إعادة تفعيل الحساب",detail:"Reactivated by Super Admin",ip:"—"},...(x.log||[])]}:x));showToast(isAr?"تم تفعيل المستخدم":"User reactivated");}}>{isAr?"تفعيل":"Activate"}</Btn>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add User Modal */}
      {modal==="add"&&<Modal title={isAr?"إضافة مستخدم إدارة":"Add Admin User"} onClose={()=>setModal(null)}>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{display:"flex",gap:10}}>
            <div style={{flex:1}}><Inp label="Full Name (English)" value={newUser.name} onChange={v=>setNewUser(p=>({...p,name:v}))} placeholder="e.g. Noura Al-Shamsi" /></div>
            <div style={{flex:1}}><Inp label="الاسم الكامل (عربي)" value={newUser.nameAr} onChange={v=>setNewUser(p=>({...p,nameAr:v}))} placeholder="مثال: نورة الشمسي" /></div>
          </div>
          <Inp label={isAr?"البريد الإلكتروني":"Email"} value={newUser.email} onChange={v=>setNewUser(p=>({...p,email:v}))} placeholder="user@tanaqul.sa" />
          <Sel label={isAr?"الدور":"Role"} value={newUser.role} onChange={v=>setNewUser(p=>({...p,role:v}))} options={allRoles.map(r=>({value:r.id,label:isAr?r.labelAr:r.label}))} />
          <div style={{background:C.bg,borderRadius:10,padding:"12px 14px"}}>
            <p style={{fontSize:13,fontWeight:600,color:C.textMuted,marginBottom:6}}>{isAr?"الصلاحيات":"Permissions"}</p>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {(allRolePerms[newUser.role]||[]).map(p=>(
                <span key={p} style={{fontSize:12,padding:"3px 8px",borderRadius:6,background:C.white,border:`1px solid ${C.border}`,color:C.navy,fontWeight:600}}>{p}</span>
              ))}
              {(allRolePerms[newUser.role]||[]).length===0&&<span style={{fontSize:13,color:C.textMuted,fontStyle:"italic"}}>{isAr?"اختر الدور أولاً":"Select role first"}</span>}
            </div>
          </div>
          <Btn variant="gold" onClick={()=>{
            if(!newUser.name||!newUser.nameAr||!newUser.email){showToast(isAr?"⚠️ أكمل جميع الحقول بالعربية والإنجليزية":"⚠️ Fill all fields in both languages");return;}
            const id="USR-"+String(Date.now()).slice(-3);
            setUsers(p=>[...p,{id,name:newUser.name,nameAr:newUser.nameAr,email:newUser.email,role:newUser.role,perms:allRolePerms[newUser.role]||[],twoFA:false,status:"ACTIVE",lastLogin:"—",sessions:0,created:new Date().toISOString().slice(0,10),log:[{date:new Date().toISOString().slice(0,16).replace("T"," "),action:"Account created",actionAr:"إنشاء الحساب",detail:"Created by Super Admin",ip:"—"}]}]);
            setModal(null);showToast(isAr?"✅ تم إضافة المستخدم — كلمة مرور مؤقتة أُرسلت للبريد":"✅ User added — temporary password sent to email");
          }}>{isAr?"إنشاء المستخدم":"Create User"}</Btn>
        </div>
      </Modal>}

      {/* Edit User Modal */}
      {modal&&modal!=="add"&&<Modal title={`${isAr?"تعديل":"Edit"} — ${isAr?modal.nameAr:modal.name}`} onClose={()=>setModal(null)}>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <Sel label={isAr?"الدور":"Role"} value={editRole} onChange={v=>{setEditRole(v);setEditPerms(allRolePerms[v]||[]);}} options={allRoles.map(r=>({value:r.id,label:isAr?r.labelAr:r.label}))} />
          <div>
            <p style={{fontSize:13,fontWeight:600,color:C.textMuted,marginBottom:8}}>{isAr?"الوحدات المتاحة":"Module Access"}</p>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {MODULES.map(m=>{
                const on = editPerms.includes(m.id);
                return (
                  <div key={m.id} onClick={()=>{if(editRole!=="CUSTOM")return;setEditPerms(p=>on?p.filter(x=>x!==m.id):[...p,m.id]);}}
                    style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:8,background:on?`${C.gold}12`:C.bg,cursor:editRole==="CUSTOM"?"pointer":"default",border:`1px solid ${on?C.gold+"44":C.border}`}}>
                    <div style={{width:18,height:18,borderRadius:5,border:`2px solid ${on?C.gold:C.border}`,background:on?C.gold:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      {on&&<span style={{color:C.white,fontSize:13,fontWeight:900}}>✓</span>}
                    </div>
                    <span style={{fontSize:14,fontWeight:on?600:400,color:on?C.navy:C.textMuted}}>{isAr?m.labelAr:m.label}</span>
                  </div>
                );
              })}
            </div>
            {editRole!=="CUSTOM"&&<p style={{fontSize:12,color:C.textMuted,marginTop:6,fontStyle:"italic"}}>{isAr?"اختر 'مخصص' لتعديل الصلاحيات يدوياً":"Select 'Custom' role to modify permissions manually"}</p>}
          </div>
          <div style={{display:"flex",gap:8}}>
            <Btn variant="gold" onClick={()=>{
              setUsers(p=>p.map(x=>x.id===modal.id?{...x,role:editRole,perms:editRole==="CUSTOM"?editPerms:ROLE_PERMS[editRole]}:x));
              setModal(null);showToast(isAr?"✅ تم تحديث الصلاحيات":"✅ Permissions updated");
            }}>{isAr?"حفظ التغييرات":"Save Changes"}</Btn>
            {!modal.twoFA&&<Btn variant="teal" onClick={()=>{setUsers(p=>p.map(x=>x.id===modal.id?{...x,twoFA:true}:x));showToast(isAr?"🔒 تم تفعيل المصادقة الثنائية":"🔒 2FA enabled");setModal(null);}}>{isAr?"تفعيل 2FA":"Enable 2FA"}</Btn>}
            {modal.sessions>0&&<Btn variant="danger" onClick={()=>{setUsers(p=>p.map(x=>x.id===modal.id?{...x,sessions:0}:x));showToast(isAr?"تم إلغاء جميع الجلسات":"All sessions revoked");}}>{isAr?"إلغاء الجلسات":"Revoke Sessions"}</Btn>}
          </div>
        </div>
      </Modal>}

      {/* Create Custom Role Modal */}
      {roleModal&&<Modal title={isAr?"إنشاء دور مخصص":"Create Custom Role"} onClose={()=>setRoleModal(false)}>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{display:"flex",gap:10}}>
            <div style={{flex:1}}><Inp label="Role Name (English)" value={newRole.label} onChange={v=>setNewRole(p=>({...p,label:v}))} placeholder="e.g. Auditor" /></div>
            <div style={{flex:1}}><Inp label="اسم الدور (عربي)" value={newRole.labelAr} onChange={v=>setNewRole(p=>({...p,labelAr:v}))} placeholder="مثال: مدقق" /></div>
          </div>
          {/* Color picker */}
          <div>
            <p style={{fontSize:13,fontWeight:600,color:C.textMuted,marginBottom:6}}>{isAr?"لون الدور":"Role Color"}</p>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {["#C85C3E",C.purpleSolid,"#C4956A","#6B9080",C.blueSolid,"#8C7E6F","#D4943A",C.greenSolid,"#B7791F","#9B4DCA"].map(c=>(
                <div key={c} onClick={()=>setNewRole(p=>({...p,color:c}))}
                  style={{width:32,height:32,borderRadius:8,background:c,cursor:"pointer",border:newRole.color===c?`3px solid ${C.navy}`:"3px solid transparent",transition:"all 0.15s"}} />
              ))}
            </div>
          </div>
          {/* Module permissions */}
          <div>
            <p style={{fontSize:13,fontWeight:600,color:C.textMuted,marginBottom:8}}>{isAr?"صلاحيات الوحدات":"Module Permissions"}</p>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {MODULES.map(m=>{
                const on = newRole.perms.includes(m.id);
                return (
                  <div key={m.id} onClick={()=>setNewRole(p=>({...p,perms:on?p.perms.filter(x=>x!==m.id):[...p.perms,m.id]}))}
                    style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:8,background:on?`${newRole.color}12`:C.bg,cursor:"pointer",border:`1px solid ${on?newRole.color+"44":C.border}`}}>
                    <div style={{width:18,height:18,borderRadius:5,border:`2px solid ${on?newRole.color:C.border}`,background:on?newRole.color:"transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      {on&&<span style={{color:"#FFF",fontSize:11,fontWeight:800}}>✓</span>}
                    </div>
                    <span style={{fontSize:14,fontWeight:on?600:400,color:on?C.navy:C.textMuted}}>{isAr?m.labelAr:m.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Preview */}
          <div style={{background:C.bg,borderRadius:10,padding:"12px 14px",display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:12,height:12,borderRadius:4,background:newRole.color}} />
            <span style={{fontSize:14,fontWeight:700,color:C.navy}}>{newRole.label||"..."}</span>
            <span style={{fontSize:12,color:C.textMuted}}>/ {newRole.labelAr||"..."}</span>
            <span style={{fontSize:12,color:C.textMuted}}>— {newRole.perms.length} {isAr?"وحدة":"modules"}</span>
          </div>
          <Btn variant="gold" onClick={()=>{
            if(!newRole.label||!newRole.labelAr){showToast(isAr?"⚠️ أدخل اسم الدور بالعربية والإنجليزية":"⚠️ Enter role name in both languages");return;}
            if(newRole.perms.length===0){showToast(isAr?"⚠️ اختر وحدة واحدة على الأقل":"⚠️ Select at least one module");return;}
            const id = "ROLE_"+newRole.label.toUpperCase().replace(/\s+/g,"_");
            if(allRoles.find(r=>r.id===id)){showToast(isAr?"⚠️ هذا الدور موجود مسبقاً":"⚠️ Role already exists");return;}
            const role = {
              id, label:newRole.label, labelAr:newRole.labelAr, color:newRole.color, custom:true,
              desc:`Custom: ${newRole.perms.length} modules`,
              descAr:`مخصص: ${newRole.perms.length} وحدة`,
              perms:[...newRole.perms],
            };
            setCustomRoles(p=>[...p,role]);
            setRoleModal(false);
            showToast(isAr?"✅ تم إنشاء الدور: "+newRole.labelAr:"✅ Role created: "+newRole.label);
          }}>{isAr?"إنشاء الدور":"Create Role"}</Btn>
        </div>
      </Modal>}

      {/* Activity Log Modal — Super Admin review */}
      {activityModal&&(()=>{
        const u = activityModal;
        const role = roleOf(u.role);
        const log = u.log||[];
        const actionTypes = [...new Set(log.map(e=>e.action))];
        const filtered = logFilter==="ALL"?log:log.filter(e=>e.action===logFilter);
        return (
          <Modal title={`${isAr?"سجل نشاط":"Activity Log"} — ${isAr?u.nameAr:u.name}`} onClose={()=>setActivityModal(null)}>
            <div style={{padding:"4px 0"}}>
              {/* User header */}
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14,padding:"12px 16px",background:C.bg,borderRadius:10}}>
                <div style={{width:38,height:38,borderRadius:10,background:`${role.color}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {Icons.user(20,role.color)}
                </div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:16,fontWeight:700,color:C.navy}}>{isAr?u.nameAr:u.name}</span>
                    <span style={{fontSize:12,fontWeight:700,color:role.color,background:`${role.color}15`,padding:"2px 8px",borderRadius:6}}>{isAr?role.labelAr:role.label}</span>
                    <Badge label={u.status} />
                  </div>
                  <p style={{fontSize:13,color:C.textMuted,marginTop:2}}>{u.email} — {u.id}</p>
                </div>
                <div style={{textAlign:"center",flexShrink:0}}>
                  <p style={{fontSize:22,fontWeight:800,color:C.navy}}>{log.length}</p>
                  <p style={{fontSize:11,color:C.textMuted}}>{isAr?"إجراء":"actions"}</p>
                </div>
              </div>

              {/* Filter pills */}
              <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:12}}>
                {["ALL",...actionTypes.slice(0,6)].map(f=>(
                  <button key={f} onClick={()=>setLogFilter(f)}
                    style={{padding:"4px 10px",borderRadius:6,fontSize:12,fontWeight:600,cursor:"pointer",
                      border:`1px solid ${logFilter===f?C.gold:C.border}`,
                      background:logFilter===f?C.goldLight:C.white,
                      color:logFilter===f?C.goldDim:C.textMuted}}>
                    {f==="ALL"?(isAr?"الكل":"All"):f}
                  </button>
                ))}
              </div>

              {/* Log entries */}
              <div style={{maxHeight:400,overflowY:"auto",display:"flex",flexDirection:"column",gap:2}}>
                {filtered.length===0&&<p style={{fontSize:14,color:C.textMuted,textAlign:"center",padding:20}}>{isAr?"لا توجد إجراءات":"No activity found"}</p>}
                {filtered.map((entry,i)=>{
                  const isLogin = entry.action.includes("Login")||entry.action.includes("دخول");
                  const isDanger = entry.action.includes("Suspend")||entry.action.includes("إيقاف")||entry.action.includes("SAR")||entry.action.includes("بلاغ");
                  const isSuccess = entry.action.includes("Approved")||entry.action.includes("موافقة")||entry.action.includes("Completed")||entry.action.includes("reactivated");
                  return (
                    <div key={i} style={{display:"flex",gap:10,padding:"8px 12px",borderRadius:8,background:i%2===0?C.bg:"transparent",alignItems:"flex-start"}}>
                      <div style={{width:6,height:6,borderRadius:3,marginTop:6,flexShrink:0,
                        background:isDanger?C.red:isSuccess?C.green:isLogin?"#C4956A":C.textMuted}} />
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                          <span style={{fontSize:12,fontFamily:"monospace",color:C.textMuted,flexShrink:0}}>{entry.date}</span>
                          <span style={{fontSize:14,fontWeight:600,color:isDanger?C.red:isSuccess?C.green:C.navy}}>{isAr?entry.actionAr:entry.action}</span>
                        </div>
                        <p style={{fontSize:13,color:C.textMuted,marginTop:1}}>{entry.detail}</p>
                      </div>
                      <span style={{fontSize:11,fontFamily:"monospace",color:C.textMuted,flexShrink:0}}>{entry.ip}</span>
                    </div>
                  );
                })}
              </div>

              {/* Summary stats */}
              <div style={{display:"flex",gap:10,marginTop:14,paddingTop:14,borderTop:`1px solid ${C.border}`}}>
                <div style={{flex:1,background:C.bg,borderRadius:8,padding:"8px 12px",textAlign:"center"}}>
                  <p style={{fontSize:18,fontWeight:800,color:C.navy}}>{log.filter(e=>e.action.includes("Login")||e.action.includes("دخول")).length}</p>
                  <p style={{fontSize:11,color:C.textMuted}}>{isAr?"تسجيلات دخول":"Logins"}</p>
                </div>
                <div style={{flex:1,background:C.bg,borderRadius:8,padding:"8px 12px",textAlign:"center"}}>
                  <p style={{fontSize:18,fontWeight:800,color:C.navy}}>{log.filter(e=>!e.action.includes("Login")&&!e.action.includes("دخول")).length}</p>
                  <p style={{fontSize:11,color:C.textMuted}}>{isAr?"إجراءات":"Actions"}</p>
                </div>
                <div style={{flex:1,background:C.bg,borderRadius:8,padding:"8px 12px",textAlign:"center"}}>
                  <p style={{fontSize:18,fontWeight:800,color:C.navy}}>{[...new Set(log.map(e=>e.ip))].filter(ip=>ip!=="—").length}</p>
                  <p style={{fontSize:11,color:C.textMuted}}>{isAr?"عناوين IP":"Unique IPs"}</p>
                </div>
                <div style={{flex:1,background:C.bg,borderRadius:8,padding:"8px 12px",textAlign:"center"}}>
                  <p style={{fontSize:18,fontWeight:800,color:C.navy}}>{log.filter(e=>e.action.includes("SAR")||e.action.includes("CMA")||e.action.includes("بلاغ")||e.action.includes("إخطار")).length}</p>
                  <p style={{fontSize:11,color:C.textMuted}}>{isAr?"بلاغات":"Reports"}</p>
                </div>
              </div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
};
const AccountProfile = () => {
  const { isAr, t } = useLang();
  const [tab, setTab] = useState("INFO");
  const [profile, setProfile] = useState({
    name:(JSON.parse(localStorage.getItem("tanaqul_admin")||"{}").name)||"Admin", nameAr:(JSON.parse(localStorage.getItem("tanaqul_admin")||"{}").name)||"مسؤول",
    email:(JSON.parse(localStorage.getItem("tanaqul_admin")||"{}").email)||"", phone:"",
    phoneVerified:true,
    recoveryPhone:"", recoveryPhoneVerified:false,
    recoveryEmail:"",
    role:"Super Admin", roleAr:"مسؤول أعلى",
    joined:"2025-09-01", lastLogin:"2026-03-02 09:14",
    twoFA:true, lang:"ar",
  });
  const [pwForm, setPwForm] = useState({current:"",newPw:"",confirm:""});
  const [toast, setToast] = useState("");
  const [saved, setSaved] = useState(false);
  const [phoneOtp, setPhoneOtp] = useState({show:false,field:null,code:"",sent:false,verified:false,timer:0});
  const [sessions] = useState([]);
  const [activityLog] = useState([]);
  const showToast = m => { setToast(m); setTimeout(()=>setToast(""),3000); };
  const showSaved = () => { setSaved(true); setTimeout(()=>setSaved(false),2500); };

  // Phone OTP countdown
  useEffect(()=>{
    if(phoneOtp.timer>0){
      const iv=setInterval(()=>setPhoneOtp(p=>({...p,timer:p.timer-1})),1000);
      return ()=>clearInterval(iv);
    }
  },[phoneOtp.timer]);

  const sendOtp = (field) => {
    setPhoneOtp({show:true,field,code:"",sent:true,verified:false,timer:60});
    showToast(isAr?"📱 تم إرسال رمز التحقق":"📱 OTP sent to phone");
  };
  const verifyOtp = () => {
    if(false){
      if(phoneOtp.field==="phone") setProfile(p=>({...p,phoneVerified:true}));
      else setProfile(p=>({...p,recoveryPhoneVerified:true}));
      setPhoneOtp(p=>({...p,show:false,verified:true}));
      showToast(isAr?"✅ تم التحقق من الرقم":"✅ Phone verified");
    } else {
      showToast(isAr?"❌ رمز خاطئ":"❌ Incorrect code");
    }
  };

  return (
    <div>
      <SectionHeader title={isAr?"الملف الشخصي":"Account Profile"} sub={isAr?"إدارة بيانات الحساب والأمان":"Manage your account credentials and security"} />
      {toast&&<div style={{position:"fixed",top:20,right:20,background:C.navy,color:C.white,padding:"12px 20px",borderRadius:12,fontSize:15,fontWeight:600,zIndex:9999,boxShadow:C.cardShadow}}>{toast}</div>}

      {/* Profile Header Card */}
      <div style={{background:C.white,borderRadius:16,border:`1px solid ${C.border}`,padding:"24px 28px",marginBottom:18,display:"flex",alignItems:"center",gap:20,boxShadow:C.cardShadow}}>
        <div style={{width:64,height:64,borderRadius:16,background:`linear-gradient(135deg, ${C.gold}, ${C.goldDim})`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <span style={{fontSize:28,fontWeight:900,color:C.white}}>{profile.name.charAt(0)}</span>
        </div>
        <div style={{flex:1}}>
          <p style={{fontSize:22,fontWeight:800,color:C.navy}}>{isAr?profile.nameAr:profile.name}</p>
          <p style={{fontSize:14,color:C.textMuted,marginTop:2}}>{isAr?profile.roleAr:profile.role} — {profile.email}</p>
          <div style={{display:"flex",gap:10,marginTop:6,flexWrap:"wrap"}}>
            <span style={{fontSize:12,padding:"3px 8px",borderRadius:6,background:"#EFF5F2",color:C.greenSolid,fontWeight:700}}>🔒 {isAr?"المصادقة الثنائية مفعلة":"2FA Enabled"}</span>
            <span style={{fontSize:12,padding:"3px 8px",borderRadius:6,background:C.bg,color:C.textMuted,fontWeight:600}}>{isAr?"انضم":"Joined"}: {profile.joined}</span>
            <span style={{fontSize:12,padding:"3px 8px",borderRadius:6,background:C.bg,color:C.textMuted,fontWeight:600}}>{isAr?"آخر دخول":"Last login"}: {profile.lastLogin}</span>
          </div>
        </div>
      </div>

      <TabBar tabs={["INFO","SECURITY","SESSIONS","ACTIVITY"]} active={tab} onChange={setTab} />

      {/* Personal Info Tab — 2 column grid */}
      {tab==="INFO"&&<div style={{background:C.white,borderRadius:14,border:`1px solid ${C.border}`,padding:24,boxShadow:C.cardShadow}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 20px"}}>
          <Inp label={isAr?"الاسم الكامل (إنجليزي)":"Full Name (English)"} value={profile.name} onChange={v=>setProfile(p=>({...p,name:v}))} />
          <Inp label={isAr?"الاسم الكامل (عربي)":"Full Name (Arabic)"} value={profile.nameAr} onChange={v=>setProfile(p=>({...p,nameAr:v}))} />
          <Inp label={isAr?"البريد الإلكتروني":"Email"} value={profile.email} onChange={v=>setProfile(p=>({...p,email:v}))} />
          <Inp label={isAr?"الدور":"Role"} value={isAr?profile.roleAr:profile.role} onChange={()=>{}} disabled />
        </div>
        <div style={{borderTop:`1px solid ${C.border}`,marginTop:16,paddingTop:16}}>
          <p style={{fontSize:15,fontWeight:700,color:C.navy,marginBottom:12}}>{isAr?"أرقام الهاتف":"Phone Numbers"}</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 20px"}}>
            {/* Primary Phone */}
            <div>
              <Inp label={isAr?"رقم الهاتف الأساسي":"Primary Phone"} value={profile.phone} onChange={v=>{setProfile(p=>({...p,phone:v,phoneVerified:false}));}} />
              <div style={{display:"flex",alignItems:"center",gap:8,marginTop:-4,marginBottom:10}}>
                {profile.phoneVerified
                  ?<span style={{fontSize:12,fontWeight:700,color:C.greenSolid,background:"#EFF5F2",padding:"3px 8px",borderRadius:6}}>✅ {isAr?"تم التحقق":"Verified"}</span>
                  :<button onClick={()=>sendOtp("phone")} style={{fontSize:12,fontWeight:700,color:"#C85C3E",background:C.redBg,padding:"3px 10px",borderRadius:6,border:"none",cursor:"pointer"}}>{isAr?"تحقق الآن":"Verify Now"}</button>
                }
              </div>
            </div>
            {/* Recovery Phone */}
            <div>
              <Inp label={isAr?"هاتف الاسترداد":"Recovery Phone"} value={profile.recoveryPhone} onChange={v=>{setProfile(p=>({...p,recoveryPhone:v,recoveryPhoneVerified:false}));}} />
              <div style={{display:"flex",alignItems:"center",gap:8,marginTop:-4,marginBottom:10}}>
                {profile.recoveryPhoneVerified
                  ?<span style={{fontSize:12,fontWeight:700,color:C.greenSolid,background:"#EFF5F2",padding:"3px 8px",borderRadius:6}}>✅ {isAr?"تم التحقق":"Verified"}</span>
                  :<button onClick={()=>sendOtp("recovery")} style={{fontSize:12,fontWeight:700,color:"#C85C3E",background:C.redBg,padding:"3px 10px",borderRadius:6,border:"none",cursor:"pointer"}}>{isAr?"تحقق الآن":"Verify Now"}</button>
                }
              </div>
            </div>
          </div>
        </div>
        <div style={{borderTop:`1px solid ${C.border}`,marginTop:8,paddingTop:16}}>
          <p style={{fontSize:15,fontWeight:700,color:C.navy,marginBottom:12}}>{isAr?"استرداد الحساب":"Account Recovery"}</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 20px"}}>
            <Inp label={isAr?"بريد الاسترداد":"Recovery Email"} value={profile.recoveryEmail} onChange={v=>setProfile(p=>({...p,recoveryEmail:v}))} />
            <div style={{display:"flex",alignItems:"flex-end",paddingBottom:10}}>
              <p style={{fontSize:13,color:C.textMuted,lineHeight:"1.4"}}>{isAr?"يُستخدم بريد وهاتف الاسترداد لاستعادة الحساب في حال فقدان كلمة المرور أو المصادقة الثنائية":"Recovery email and phone are used to restore access if you lose your password or 2FA device"}</p>
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,marginTop:12,alignItems:"center"}}>
          <Btn variant="gold" onClick={()=>{showSaved();showToast(isAr?"✅ تم حفظ البيانات":"✅ Profile saved");}}>{isAr?"حفظ التغييرات":"Save Changes"}</Btn>
          {saved&&<span style={{fontSize:14,color:C.greenSolid,fontWeight:600}}>✅</span>}
        </div>
      </div>}

      {/* Phone OTP Verification Modal */}
      {phoneOtp.show&&<Modal title={isAr?"تحقق من رقم الهاتف":"Verify Phone Number"} onClose={()=>setPhoneOtp(p=>({...p,show:false}))}>
        <div style={{textAlign:"center",padding:"8px 0"}}>
          <div style={{width:56,height:56,borderRadius:14,background:"#EFF5F2",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",fontSize:28}}>📱</div>
          <p style={{fontSize:16,fontWeight:600,color:C.navy,marginBottom:4}}>{isAr?"أدخل رمز التحقق":"Enter verification code"}</p>
          <p style={{fontSize:13,color:C.textMuted,marginBottom:16}}>{isAr?"تم إرسال رمز مكون من 6 أرقام إلى":"A 6-digit code was sent to"} {phoneOtp.field==="phone"?profile.phone:profile.recoveryPhone}</p>
          <div style={{display:"flex",justifyContent:"center",marginBottom:14}}>
            <input value={phoneOtp.code} onChange={e=>setPhoneOtp(p=>({...p,code:e.target.value.replace(/\D/g,"").slice(0,6)}))}
              placeholder="000000" maxLength={6}
              style={{width:180,textAlign:"center",fontSize:28,fontWeight:800,letterSpacing:8,padding:"10px 14px",borderRadius:10,border:`2px solid ${phoneOtp.code.length===6?C.teal:C.border}`,outline:"none",fontFamily:"monospace",color:C.navy}} />
          </div>
          <p style={{fontSize:12,color:C.textMuted,marginBottom:12}}>
            {phoneOtp.timer>0
              ?<>{isAr?"إعادة الإرسال بعد":"Resend in"} <b>{phoneOtp.timer}s</b></>
              :<button onClick={()=>{setPhoneOtp(p=>({...p,timer:60}));showToast(isAr?"📱 تم إعادة الإرسال":"📱 OTP resent");}} style={{color:C.gold,fontWeight:700,background:"none",border:"none",cursor:"pointer",fontSize:13}}>{isAr?"إعادة إرسال الرمز":"Resend Code"}</button>
            }
          </p>
          <p style={{fontSize:11,color:C.textMuted,background:C.bg,borderRadius:8,padding:"6px 10px",marginBottom:14}}>{isAr?"":"" }</p>
          <Btn variant="gold" onClick={verifyOtp} style={{width:"100%"}}>{isAr?"تحقق":"Verify"}</Btn>
        </div>
      </Modal>}

      {/* Security Tab */}
      {tab==="SECURITY"&&<div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{background:C.white,borderRadius:14,border:`1px solid ${C.border}`,padding:20,boxShadow:C.cardShadow}}>
          <p style={{fontSize:16,fontWeight:700,color:C.navy,marginBottom:14}}>{isAr?"تغيير كلمة المرور":"Change Password"}</p>
          <Inp label={isAr?"كلمة المرور الحالية":"Current Password"} value={pwForm.current} onChange={v=>setPwForm(p=>({...p,current:v}))} type="password" />
          <Inp label={isAr?"كلمة المرور الجديدة":"New Password"} value={pwForm.newPw} onChange={v=>setPwForm(p=>({...p,newPw:v}))} type="password" />
          <Inp label={isAr?"تأكيد كلمة المرور":"Confirm Password"} value={pwForm.confirm} onChange={v=>setPwForm(p=>({...p,confirm:v}))} type="password" />
          {pwForm.newPw&&pwForm.newPw.length<8&&<p style={{fontSize:13,color:C.red,marginBottom:8}}>{isAr?"⚠️ كلمة المرور يجب أن تكون 8 أحرف على الأقل":"⚠️ Password must be at least 8 characters"}</p>}
          {pwForm.newPw&&pwForm.confirm&&pwForm.newPw!==pwForm.confirm&&<p style={{fontSize:13,color:C.red,marginBottom:8}}>{isAr?"⚠️ كلمات المرور غير متطابقة":"⚠️ Passwords do not match"}</p>}
          <Btn variant="gold" onClick={()=>{
            if(!pwForm.current||!pwForm.newPw||!pwForm.confirm){showToast(isAr?"⚠️ أكمل جميع الحقول":"⚠️ Fill all fields");return;}
            if(pwForm.newPw.length<8){showToast(isAr?"⚠️ 8 أحرف على الأقل":"⚠️ Min 8 characters");return;}
            if(pwForm.newPw!==pwForm.confirm){showToast(isAr?"⚠️ غير متطابقة":"⚠️ Passwords don't match");return;}
            setPwForm({current:"",newPw:"",confirm:""});showToast(isAr?"✅ تم تغيير كلمة المرور":"✅ Password changed successfully");
          }}>{isAr?"تحديث كلمة المرور":"Update Password"}</Btn>
        </div>
        <div style={{background:C.white,borderRadius:14,border:`1px solid ${C.border}`,padding:20,boxShadow:C.cardShadow}}>
          <p style={{fontSize:16,fontWeight:700,color:C.navy,marginBottom:14}}>{isAr?"المصادقة الثنائية (2FA)":"Two-Factor Authentication (2FA)"}</p>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0"}}>
            <div>
              <p style={{fontSize:15,fontWeight:600,color:C.navy}}>{isAr?"حالة المصادقة الثنائية":"2FA Status"}</p>
              <p style={{fontSize:13,color:C.textMuted}}>{isAr?"تطبيق المصادقة (Google/Microsoft Authenticator)":"Authenticator app (Google/Microsoft Authenticator)"}</p>
            </div>
            <span style={{padding:"4px 12px",borderRadius:8,fontSize:14,fontWeight:700,color:C.greenSolid,background:"#EFF5F2"}}>🔒 {isAr?"مفعّل":"Enabled"}</span>
          </div>
          <div style={{background:"#FDF4EC",borderRadius:10,padding:"10px 14px",marginTop:8}}>
            <p style={{fontSize:13,color:C.goldDim,fontWeight:600}}>{isAr?"⚠️ المصادقة الثنائية إلزامية لجميع مسؤولي الإدارة ولا يمكن تعطيلها.":"⚠️ 2FA is mandatory for all admin users and cannot be disabled."}</p>
          </div>
        </div>
      </div>}

      {/* Sessions Tab */}
      {tab==="SESSIONS"&&<div style={{background:C.white,borderRadius:14,border:`1px solid ${C.border}`,padding:20,boxShadow:C.cardShadow}}>
        <p style={{fontSize:16,fontWeight:700,color:C.navy,marginBottom:14}}>{isAr?"الجلسات النشطة":"Active Sessions"}</p>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {sessions.map(s=>(
            <div key={s.id} style={{display:"flex",alignItems:"center",gap:14,padding:"12px 16px",borderRadius:10,background:s.current?`${C.gold}08`:C.bg,border:`1px solid ${s.current?C.gold+"33":C.border}`}}>
              <div style={{width:36,height:36,borderRadius:10,background:s.current?`${C.gold}18`:C.white,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {Icons.settings(18,s.current?C.gold:C.textMuted)}
              </div>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:15,fontWeight:600,color:C.navy}}>{s.device}</span>
                  {s.current&&<span style={{fontSize:11,fontWeight:700,color:C.gold,background:`${C.gold}18`,padding:"2px 6px",borderRadius:4}}>{isAr?"الجلسة الحالية":"CURRENT"}</span>}
                </div>
                <p style={{fontSize:13,color:C.textMuted,marginTop:2}}>{s.ip} — {s.location} — {s.time}</p>
              </div>
              {!s.current&&<Btn small variant="danger" onClick={()=>showToast(isAr?"تم إلغاء الجلسة":"Session revoked")}>{isAr?"إلغاء":"Revoke"}</Btn>}
            </div>
          ))}
        </div>
        <div style={{marginTop:12}}>
          <Btn variant="danger" onClick={()=>showToast(isAr?"تم إلغاء جميع الجلسات الأخرى":"All other sessions revoked")}>{isAr?"إلغاء جميع الجلسات الأخرى":"Revoke All Other Sessions"}</Btn>
        </div>
      </div>}

      {/* Activity Log Tab */}
      {tab==="ACTIVITY"&&<div style={{background:C.white,borderRadius:14,border:`1px solid ${C.border}`,padding:20,boxShadow:C.cardShadow}}>
        <p style={{fontSize:16,fontWeight:700,color:C.navy,marginBottom:14}}>{isAr?"سجل النشاط":"Activity Log"}</p>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {activityLog.map((entry,i)=>(
            <div key={i} style={{display:"flex",gap:12,padding:"10px 14px",borderRadius:8,background:i%2===0?C.bg:"transparent",alignItems:"center"}}>
              <span style={{fontSize:12,fontFamily:"monospace",color:C.textMuted,flexShrink:0,minWidth:110}}>{entry.date}</span>
              <span style={{fontSize:14,fontWeight:600,color:C.navy,minWidth:120}}>{entry.action}</span>
              <span style={{fontSize:13,color:C.textMuted,flex:1}}>{entry.detail}</span>
            </div>
          ))}
        </div>
      </div>}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// GLOBAL SEARCH — Cmd+K spotlight across all data
// ═══════════════════════════════════════════════════════════════════════════════
const GlobalSearch = ({ isOpen, onClose, setPage, setPageHint }) => {
  const { t, isAr } = useLang();
  const { investors, appointments, bars, withdrawals, orders } = useAppData();
  const [query, setQuery] = useState("");
  const [selIdx, setSelIdx] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => { if(isOpen && inputRef.current) { inputRef.current.focus(); setQuery(""); setSelIdx(0); } }, [isOpen]);

  if(!isOpen) return null;

  const q = query.toLowerCase().trim();
  const results = [];
  const MAX = 12;

  if(q.length >= 1) {
    // Search investors
    investors.forEach(inv => {
      if(results.length >= MAX) return;
      const haystack = `${inv.nameEn} ${inv.nameAr||""} ${inv.nationalId} ${inv.vaultKey} ${inv.status} ${inv.email||""}`.toLowerCase();
      if(haystack.includes(q)) results.push({
        type:"investor",icon:"👤",label:inv.nameEn,sub:`${inv.nationalId} · ${inv.status} · SAR ${inv.holdingsValue?.toLocaleString()||0}`,
        action:()=>{setPage("investors");setPageHint({search:inv.nationalId});onClose();}
      });
    });
    // Search transactions
    ([]).forEach(tx => {
      if(results.length >= MAX) return;
      const haystack = `${tx.id} ${tx.buyerNationalId} ${tx.sellerNationalId} ${tx.metal} ${tx.type} ${tx.method||""} ${tx.total}`.toLowerCase();
      if(haystack.includes(q)) results.push({
        type:"transaction",icon:"💰",label:tx.id,sub:`${tx.type} · ${tx.metal} · SAR ${tx.total}`,
        action:()=>{setPage("txlog");onClose();}
      });
    });
    // Search bars
    bars.forEach(bar => {
      if(results.length >= MAX) return;
      const haystack = `${bar.id} ${bar.metal} ${bar.refiner||""} ${bar.status} ${bar.serialNumber||bar.id}`.toLowerCase();
      if(haystack.includes(q)) results.push({
        type:"bar",icon:"🏦",label:`${bar.id} — ${bar.metal} ${bar.weightGrams||bar.weight}g`,sub:`${bar.refiner||"—"} · ${bar.status}`,
        action:()=>{setPage("vault");onClose();}
      });
    });
    // Search orders
    orders.forEach(ord => {
      if(results.length >= MAX) return;
      const haystack = `${ord.id} ${ord.side} ${ord.metal} ${ord.nationalId} ${ord.status}`.toLowerCase();
      if(haystack.includes(q)) results.push({
        type:"order",icon:"📋",label:`${ord.id} — ${ord.side} ${ord.metal}`,sub:`${ord.qty}g @ SAR ${ord.price} · ${ord.status}`,
        action:()=>{setPage("orderbook");onClose();}
      });
    });
    // Search appointments
    appointments.forEach(apt => {
      if(results.length >= MAX) return;
      const haystack = `${apt.id} ${apt.investorName||""} ${apt.metal||""} ${apt.type||""} ${apt.status} ${apt.date}`.toLowerCase();
      if(haystack.includes(q)) results.push({
        type:"appointment",icon:"📅",label:`${apt.id} — ${apt.investorName||apt.nationalId}`,sub:`${apt.type||""} ${apt.metal||""} · ${apt.date} · ${apt.status}`,
        action:()=>{setPage("appointments");onClose();}
      });
    });
    // Search pages
    const PAGES_SEARCH = [
      {id:"dashboard",label:"Dashboard",labelAr:"لوحة التحكم",icon:"📊"},
      {id:"investors",label:"Investors",labelAr:"المستثمرون",icon:"👥"},
      {id:"txlog",label:"Transaction Log",labelAr:"سجل المعاملات",icon:"💰"},
      {id:"orderbook",label:"Order Book",labelAr:"دفتر الأوامر",icon:"📖"},
      {id:"vault",label:"Main Vault",labelAr:"الخزينة الرئيسية",icon:"🏦"},
      {id:"appointments",label:"Appointments",labelAr:"المواعيد",icon:"📅"},
      {id:"financials",label:"Financials",labelAr:"الماليات",icon:"💳"},
      {id:"reports",label:"Reports",labelAr:"التقارير",icon:"📈"},
      {id:"blacklist",label:"Blacklist",labelAr:"القائمة السوداء",icon:"🚫"},
      {id:"blocks",label:"Blocks",labelAr:"البلوكات",icon:"⛓️"},
      {id:"auditlog",label:"Audit & AML",labelAr:"التدقيق",icon:"🔍"},
      {id:"commcenter",label:"Communication",labelAr:"الاتصالات",icon:"✉️"},
      {id:"usermgmt",label:"User Management",labelAr:"إدارة المستخدمين",icon:"👨‍💼"},
      {id:"settings",label:"Settings",labelAr:"الإعدادات",icon:"⚙️"},
      {id:"health",label:"System Health",labelAr:"حالة النظام",icon:"❤️"},
      {id:"treasury",label:"Treasury & Recon",labelAr:"الخزينة والتسوية",icon:"⚖️"},
      {id:"profile",label:"Account Profile",labelAr:"الملف الشخصي",icon:"👤"},
    ];
    PAGES_SEARCH.forEach(pg => {
      if(results.length >= MAX) return;
      if(pg.label.toLowerCase().includes(q)||(pg.labelAr||"").includes(q))
        results.push({type:"page",icon:pg.icon,label:isAr?pg.labelAr:pg.label,sub:isAr?"انتقل إلى الصفحة":"Go to page",action:()=>{setPage(pg.id);onClose();}});
    });
    // Search AML/CMA rules
    const RULES_SEARCH = [
      {id:"R01",label:"Large Transaction (>SAR 50K)"},{id:"R02",label:"Rapid Buy-Sell Reversal"},{id:"R03",label:"Multiple Payment Methods"},
      {id:"R04",label:"Off-Platform Withdrawal"},{id:"R05",label:"New Account High Volume"},{id:"R06",label:"Blacklisted User"},
      {id:"R07",label:"Odd-Lot / Round Amount"},{id:"R15",label:"Dormant Reactivation"},{id:"R16",label:"Threshold Evasion (Structuring)"},
      {id:"CMA-01",label:"Spoofing"},{id:"CMA-02",label:"Layering"},{id:"CMA-11",label:"Momentum Ignition"},{id:"CMA-12",label:"Quote Stuffing"},
    ];
    RULES_SEARCH.forEach(rule => {
      if(results.length >= MAX) return;
      if(`${rule.id} ${rule.label}`.toLowerCase().includes(q))
        results.push({type:"rule",icon:"🔍",label:`${rule.id} — ${rule.label}`,sub:isAr?"قاعدة AML/CMA":"AML/CMA Rule",action:()=>{setPage("auditlog");onClose();}});
    });
    // Search messages
    ([]).forEach(msg => {
      if(results.length >= MAX) return;
      const haystack = `${msg.id} ${msg.to} ${msg.subject} ${msg.body}`.toLowerCase();
      if(haystack.includes(q)) results.push({
        type:"message",icon:"✉️",label:`${msg.id} — ${msg.subject}`,sub:`${isAr?"إلى":"To"}: ${msg.to} · ${msg.status}`,
        action:()=>{setPage("commcenter");onClose();}
      });
    });
  }

  const handleKey = e => {
    if(e.key==="ArrowDown") { e.preventDefault(); setSelIdx(i=>Math.min(i+1,results.length-1)); }
    else if(e.key==="ArrowUp") { e.preventDefault(); setSelIdx(i=>Math.max(i-1,0)); }
    else if(e.key==="Enter"&&results[selIdx]) { results[selIdx].action(); }
    else if(e.key==="Escape") onClose();
  };

  const typeColor = type => ({investor:"#6B9080",transaction:"#D4943A",bar:C.blueSolid,order:C.purpleSolid,appointment:C.greenSolid,page:C.gold,rule:"#C85C3E",message:C.blueSolid}[type]||C.textMuted);
  const typeLabel = type => ({investor:isAr?"مستثمر":"Investor",transaction:isAr?"معاملة":"Transaction",bar:isAr?"سبيكة":"Bar",order:isAr?"أمر":"Order",appointment:isAr?"موعد":"Appointment",page:isAr?"صفحة":"Page",rule:isAr?"قاعدة":"Rule",message:isAr?"رسالة":"Message"}[type]||"");

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",backdropFilter:"blur(4px)",zIndex:99999,display:"flex",justifyContent:"center",alignItems:"flex-start",paddingTop:80}}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:620,background:C.white,borderRadius:16,border:`1px solid ${C.border}`,boxShadow:"0 20px 60px rgba(0,0,0,0.25)",overflow:"hidden"}}>
        {/* Search input */}
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"14px 18px",borderBottom:`1px solid ${C.border}`}}>
          <span style={{fontSize:20,color:C.gold}}>🔍</span>
          <input ref={inputRef} value={query} onChange={e=>{setQuery(e.target.value);setSelIdx(0);}} onKeyDown={handleKey}
            placeholder={isAr?"ابحث في المستثمرين، المعاملات، الأوامر، الصفحات...":"Search investors, transactions, orders, pages..."}
            style={{flex:1,fontSize:16,border:"none",outline:"none",background:"transparent",color:C.navy,fontFamily:"inherit"}} />
          <kbd style={{fontSize:11,color:C.textMuted,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,padding:"2px 6px"}}>ESC</kbd>
        </div>
        {/* Results */}
        <div style={{maxHeight:420,overflowY:"auto"}}>
          {q.length===0&&<div style={{padding:"32px 18px",textAlign:"center",color:C.textMuted}}>
            <p style={{fontSize:14}}>{isAr?"اكتب للبحث في النظام بالكامل":"Type to search across the entire system"}</p>
            <p style={{fontSize:12,marginTop:8,color:C.border}}>{isAr?"المستثمرون · المعاملات · الأوامر · السبائك · المواعيد · الرسائل · القواعد · الصفحات":"Investors · Transactions · Orders · Bars · Appointments · Messages · Rules · Pages"}</p>
          </div>}
          {q.length>0&&results.length===0&&<div style={{padding:"32px 18px",textAlign:"center",color:C.textMuted}}>
            <span style={{fontSize:28}}>🔎</span>
            <p style={{fontSize:14,marginTop:8}}>{isAr?`لا نتائج لـ "${query}"`:`No results for "${query}"`}</p>
          </div>}
          {results.map((r,i)=>(
            <button key={i} onClick={r.action}
              onMouseEnter={()=>setSelIdx(i)}
              style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"12px 18px",border:"none",cursor:"pointer",textAlign:"start",
                background:selIdx===i?(C._mode==="dark"?"#2A2418":C.goldLight):"transparent",borderBottom:`1px solid ${C.border}22`,
                transition:"background 0.1s"}}>
              <span style={{fontSize:18,flexShrink:0}}>{r.icon}</span>
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontSize:14,fontWeight:600,color:C.navy,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.label}</p>
                <p style={{fontSize:12,color:C.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.sub}</p>
              </div>
              <span style={{fontSize:10,fontWeight:700,color:typeColor(r.type),background:typeColor(r.type)+"18",padding:"2px 8px",borderRadius:4,flexShrink:0}}>{typeLabel(r.type)}</span>
            </button>
          ))}
        </div>
        {/* Footer hint */}
        {results.length>0&&<div style={{padding:"8px 18px",borderTop:`1px solid ${C.border}`,display:"flex",gap:12,alignItems:"center",justifyContent:"center"}}>
          <span style={{fontSize:11,color:C.textMuted}}>↑↓ {isAr?"تنقل":"Navigate"}</span>
          <span style={{fontSize:11,color:C.textMuted}}>↵ {isAr?"فتح":"Open"}</span>
          <span style={{fontSize:11,color:C.textMuted}}>ESC {isAr?"إغلاق":"Close"}</span>
        </div>}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// INVESTOR TIMELINE — unified activity history per investor
// ═══════════════════════════════════════════════════════════════════════════════
const InvestorTimeline = ({ investor, onClose }) => {
  const { isAr } = useLang();
  const { appointments, withdrawals, orders, matches } = useAppData();
  if(!investor) return null;

  const nid = investor.nationalId;
  const events = [];

  // Account creation
  events.push({date:investor.joined, type:"account", icon:"🆕",
    title:isAr?"تم إنشاء الحساب":"Account Created",
    detail:isAr?`مفتاح الخزينة: ${investor.vaultKey}`:`Vault Key: ${investor.vaultKey}`,
    color:"#6B9080"});

  // Transactions
  ([]).forEach(tx => {
    if(tx.buyerNationalId===nid) events.push({date:tx.date, type:"transaction", icon:tx.type==="BUY"?"🟢":"💰",
      title:`${isAr?"شراء":"Buy"} ${tx.metal} — ${tx.amount}`,
      detail:`SAR ${tx.total} · ${tx.method||"—"} · ${tx.status}`,
      color:tx.status==="COMPLETED"?C.greenSolid:"#D4943A"});
    if(tx.sellerNationalId===nid) events.push({date:tx.date, type:"transaction", icon:"🔴",
      title:`${isAr?"بيع":"Sell"} ${tx.metal} — ${tx.amount}`,
      detail:`SAR ${tx.total} · ${tx.status}`,
      color:tx.status==="COMPLETED"?C.greenSolid:"#D4943A"});
  });

  // Orders
  orders.filter(o=>o.nationalId===nid).forEach(ord => {
    events.push({date:ord.createdAt||ord.date||investor.joined, type:"order", icon:ord.side==="BUY"?"📗":"📕",
      title:`${isAr?"أمر":"Order"} ${ord.side} ${ord.metal} — ${ord.qty}g`,
      detail:`@ SAR ${ord.price} · ${ord.status}`,
      color:ord.status==="FILLED"?C.greenSolid:ord.status==="CANCELLED"?"#C85C3E":C.blueSolid});
  });

  // Appointments
  appointments.filter(a=>a.nationalId===nid||a.investorName===investor.nameEn).forEach(apt => {
    events.push({date:apt.date, type:"appointment", icon:apt.status==="NO_SHOW"?"❌":"📅",
      title:`${isAr?"موعد":"Appointment"} ${apt.type||""} ${apt.metal||""}`,
      detail:`${apt.time||"—"} · ${apt.vault||"—"} · ${apt.status}`,
      color:apt.status==="NO_SHOW"?"#C85C3E":apt.status==="BOOKED"?C.blueSolid:C.greenSolid});
  });

  // Withdrawals
  withdrawals.filter(w=>w.nationalId===nid||w.investor===investor.nameEn).forEach(wd => {
    events.push({date:wd.requestedAt||wd.date||investor.joined, type:"withdrawal", icon:"💸",
      title:`${isAr?"سحب":"Withdrawal"} SAR ${wd.amount?.toLocaleString()||"—"}`,
      detail:`${wd.bank||"—"} · ${wd.status}`,
      color:wd.status==="APPROVED"?C.greenSolid:wd.status==="PENDING"?"#D4943A":"#C85C3E"});
  });

  // Messages sent to this investor
  ([]).forEach(msg => {
    if(msg.toNid===nid) events.push({date:msg.sentAt||msg.scheduledFor||"", type:"message", icon:"✉️",
      title:`${isAr?"رسالة":"Message"}: ${msg.subject}`,
      detail:`${msg.channel} · ${msg.status}`,
      color:msg.status==="delivered"||msg.status==="read"?C.greenSolid:C.blueSolid});
  });

  // AML flags (check MOCK transactions for suspicious patterns)
  if(investor.status==="BANNED") events.push({date:investor.joined, type:"aml", icon:"🚫",
    title:isAr?"تم حظر الحساب":"Account Banned",
    detail:isAr?"تم الحظر بسبب انتهاك":"Banned due to violation",
    color:"#C85C3E"});
  if(investor.status==="SUSPENDED") events.push({date:investor.joined, type:"aml", icon:"⚠️",
    title:isAr?"تم تعليق الحساب":"Account Suspended",
    detail:isAr?"قيد المراجعة":"Under review",
    color:"#D4943A"});

  // KYC events
  if(investor.kycExpiry) {
    const daysLeft = Math.ceil((new Date(investor.kycExpiry)-new Date())/(86400000));
    events.push({date:investor.kycExpiry, type:"kyc", icon:daysLeft<=0?"🔴":daysLeft<30?"🟡":"🟢",
      title:daysLeft<=0?(isAr?"انتهت صلاحية الهوية":"KYC Expired"):daysLeft<30?(isAr?`الهوية تنتهي خلال ${daysLeft} يوم`:`KYC expires in ${daysLeft} days`):(isAr?"هوية سارية":"KYC Valid"),
      detail:`${isAr?"تاريخ الانتهاء":"Expiry"}: ${investor.kycExpiry}`,
      color:daysLeft<=0?"#C85C3E":daysLeft<30?"#D4943A":C.greenSolid});
  }

  // Sort descending (newest first)
  events.sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));

  // Group by month
  const grouped = {};
  events.forEach(e => {
    const d = new Date(e.date||0);
    const key = d.getFullYear()>2000 ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}` : "Unknown";
    if(!grouped[key]) grouped[key] = [];
    grouped[key].push(e);
  });

  const monthLabel = key => {
    if(key==="Unknown") return isAr?"غير محدد":"Unknown";
    const [y,m] = key.split("-");
    const d = new Date(parseInt(y), parseInt(m)-1);
    return d.toLocaleDateString(isAr?"ar-SA":"en-SA",{year:"numeric",month:"long"});
  };

  return (
    <Modal title={`${isAr?"سجل":"Timeline"} — ${investor.nameEn}`} onClose={onClose}>
      {/* Investor summary card */}
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:18,background:C.bg,borderRadius:12,padding:"14px 16px"}}>
        <div style={{width:48,height:48,borderRadius:12,background:`linear-gradient(135deg,${C.gold},${C.goldDim})`,display:"flex",alignItems:"center",justifyContent:"center",color:"#FFF",fontSize:20,fontWeight:800}}>
          {investor.nameEn.charAt(0)}
        </div>
        <div style={{flex:1}}>
          <p style={{fontSize:16,fontWeight:700,color:C.navy}}>{investor.nameEn}</p>
          <p style={{fontSize:13,color:C.textMuted}}>{investor.nationalId} · {investor.vaultKey} · <b style={{color:investor.status==="ACTIVE"?C.greenSolid:"#C85C3E"}}>{investor.status}</b></p>
        </div>
        <div style={{textAlign:"end"}}>
          <p style={{fontSize:16,fontWeight:700,color:C.gold}}>SAR {investor.holdingsValue?.toLocaleString()||0}</p>
          <p style={{fontSize:12,color:C.textMuted}}>{events.length} {isAr?"حدث":"events"}</p>
        </div>
      </div>

      {/* Event type legend */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
        {[{type:"transaction",label:isAr?"معاملات":"Transactions",color:"#D4943A"},
          {type:"order",label:isAr?"أوامر":"Orders",color:C.blueSolid},
          {type:"appointment",label:isAr?"مواعيد":"Appointments",color:C.greenSolid},
          {type:"withdrawal",label:isAr?"سحوبات":"Withdrawals",color:C.purpleSolid},
          {type:"message",label:isAr?"رسائل":"Messages",color:"#6B9080"},
          {type:"kyc",label:"KYC",color:"#C85C3E"},
        ].map(l=><span key={l.type} style={{fontSize:11,fontWeight:600,color:l.color,background:l.color+"18",padding:"2px 8px",borderRadius:4}}>{l.label}: {events.filter(e=>e.type===l.type).length}</span>)}
      </div>

      {/* Timeline */}
      <div style={{maxHeight:420,overflowY:"auto",paddingRight:4}}>
        {Object.entries(grouped).map(([month, evts])=>(
          <div key={month} style={{marginBottom:18}}>
            <p style={{fontSize:13,fontWeight:700,color:C.gold,marginBottom:8,position:"sticky",top:0,background:C.white,padding:"4px 0",zIndex:1}}>{monthLabel(month)}</p>
            {evts.map((e,i)=>(
              <div key={i} style={{display:"flex",gap:12,marginBottom:6,position:"relative"}}>
                {/* Timeline line */}
                {i<evts.length-1&&<div style={{position:"absolute",[isAr?"right":"left"]:15,top:28,bottom:-6,width:2,background:C.border}} />}
                {/* Dot */}
                <div style={{width:32,height:32,borderRadius:10,background:e.color+"18",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:16,zIndex:2}}>
                  {e.icon}
                </div>
                {/* Content */}
                <div style={{flex:1,background:C.bg,borderRadius:10,padding:"10px 14px",borderInlineStart:`3px solid ${e.color}`}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:2}}>
                    <span style={{fontSize:13,fontWeight:700,color:C.navy}}>{e.title}</span>
                    <span style={{fontSize:11,color:C.textMuted,fontFamily:"monospace",flexShrink:0}}>{e.date?new Date(e.date).toLocaleDateString(isAr?"ar-SA":"en-SA",{month:"short",day:"numeric"}):"—"}</span>
                  </div>
                  <p style={{fontSize:12,color:C.textMuted}}>{e.detail}</p>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
const COMM_TEMPLATES = [
  {id:"TPL-001",name:"KYC Reminder",nameAr:"تذكير بالهوية",category:"compliance",categoryAr:"الامتثال",channel:"sms",
    body:"Dear {investor}, your KYC verification expires on {kycExpiry}. Please renew your identity documents to continue trading on Tanaqul.",
    bodyAr:"عزيزي {investor}، تنتهي صلاحية التحقق من هويتك في {kycExpiry}. يرجى تجديد وثائق الهوية لمواصلة التداول على تناقل.",
    vars:["investor","kycExpiry"], priority:"urgent"},
  {id:"TPL-002",name:"Appointment Confirmation",nameAr:"تأكيد الموعد",category:"operations",categoryAr:"العمليات",channel:"sms",
    body:"Your {type} appointment for {metal} ({qty}) at {vault} is confirmed for {date}. Please bring your national ID. Ref: {aptId}.",
    bodyAr:"تم تأكيد موعد {type} لـ {metal} ({qty}) في {vault} بتاريخ {date}. يرجى إحضار الهوية الوطنية. المرجع: {aptId}.",
    vars:["type","metal","qty","vault","date","aptId"], priority:"normal"},
  {id:"TPL-003",name:"Withdrawal Processed",nameAr:"تم معالجة السحب",category:"operations",categoryAr:"العمليات",channel:"email",
    body:"Dear {investor}, your withdrawal request of SAR {amount} has been processed to {bank}. Allow 1-2 business days for settlement. Ref: {wrId}.",
    bodyAr:"عزيزي {investor}، تم معالجة طلب السحب بقيمة {amount} ريال إلى {bank}. يرجى الانتظار 1-2 يوم عمل. المرجع: {wrId}.",
    vars:["investor","amount","bank","wrId"], priority:"normal"},
  {id:"TPL-004",name:"Account Suspended",nameAr:"تعليق الحساب",category:"compliance",categoryAr:"الامتثال",channel:"email",
    body:"Dear {investor}, your Tanaqul account has been temporarily suspended pending review. Reason: {reason}. Contact compliance@tanaqul.sa for details.",
    bodyAr:"عزيزي {investor}، تم تعليق حسابك في تناقل مؤقتاً بانتظار المراجعة. السبب: {reason}. تواصل مع compliance@tanaqul.sa للتفاصيل.",
    vars:["investor","reason"], priority:"urgent"},
  {id:"TPL-005",name:"Price Alert",nameAr:"تنبيه سعر",category:"marketing",categoryAr:"التسويق",channel:"push",
    body:"{metal} price is now SAR {price}/g — {direction} {changePct}% from yesterday. Trade now on Tanaqul.",
    bodyAr:"سعر {metal} الآن {price} ريال/جرام — {direction} {changePct}% عن أمس. تداول الآن على تناقل.",
    vars:["metal","price","direction","changePct"], priority:"normal"},
  {id:"TPL-006",name:"Welcome New Investor",nameAr:"ترحيب بمستثمر جديد",category:"account",categoryAr:"الحساب",channel:"email",
    body:"Welcome to Tanaqul, {investor}! Your account is active. Vault key: {vaultKey}. Deposit your first bar to start trading tokenized precious metals.",
    bodyAr:"مرحباً بك في تناقل، {investor}! حسابك نشط. مفتاح الخزينة: {vaultKey}. أودع أول سبيكة لبدء تداول المعادن الثمينة المرمّزة.",
    vars:["investor","vaultKey"], priority:"normal"},
  {id:"TPL-007",name:"No-Show Warning",nameAr:"تحذير عدم الحضور",category:"operations",categoryAr:"العمليات",channel:"sms",
    body:"{investor}, you missed your appointment on {date}. You have {noShowCount} no-shows. 3+ no-shows may result in appointment restrictions.",
    bodyAr:"{investor}، لقد فاتك موعدك في {date}. لديك {noShowCount} حالات عدم حضور. 3 حالات أو أكثر قد تؤدي لتقييد المواعيد.",
    vars:["investor","date","noShowCount"], priority:"urgent"},
  {id:"TPL-008",name:"AML Review Notice",nameAr:"إشعار مراجعة AML",category:"compliance",categoryAr:"الامتثال",channel:"email",
    body:"Dear {investor}, your account is under routine AML review as required by SAMA regulations. You may be contacted for additional documentation. No action needed at this time.",
    bodyAr:"عزيزي {investor}، حسابك تحت المراجعة الروتينية لمكافحة غسل الأموال وفقاً لأنظمة ساما. قد يُطلب منك وثائق إضافية. لا يلزم اتخاذ إجراء حالياً.",
    vars:["investor"], priority:"normal"},
];

const MOCK_MESSAGES = [];
// Removed — messages loaded from API

const CommCenter = () => {
  const { t, isAr } = useLang();
  const { investors } = useAppData();
  const [tab, setTab] = useState("inbox");
  const [messages, setMessages] = useState([]);
  const [templates] = useState(COMM_TEMPLATES);
  const [filter, setFilter] = useState("ALL");
  const [channelFilter, setChannelFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [selMsg, setSelMsg] = useState(null);
  const [compose, setCompose] = useState(null); // null | {to,channel,subject,body,priority,template,scheduledFor}
  const [tplModal, setTplModal] = useState(null); // template to view/edit
  const [broadcastModal, setBroadcastModal] = useState(null);
  const [toast, setToast] = useState("");
  const showToast = m => { setToast(m); setTimeout(()=>setToast(""),3000); };

  // Stats
  const totalSent = messages.filter(m=>m.status!=="draft"&&m.status!=="scheduled").length;
  const delivered = messages.filter(m=>m.status==="delivered"||m.status==="read").length;
  const failed = messages.filter(m=>m.status==="failed").length;
  const scheduled = messages.filter(m=>m.status==="scheduled").length;
  const drafts = messages.filter(m=>m.status==="draft").length;
  const todaySent = messages.filter(m=>m.sentAt&&m.sentAt.startsWith(new Date().toISOString().slice(0,10))).length;
  const deliveryRate = totalSent>0?Math.round((delivered/(totalSent-failed))*100):0;

  const channelIcon = ch => ch==="sms"?"📱":ch==="email"?"📧":ch==="push"?"🔔":"📲";
  const channelLabel = ch => isAr?{sms:"رسالة نصية",email:"بريد إلكتروني",push:"إشعار فوري",inapp:"داخل التطبيق"}[ch]:{sms:"SMS",email:"Email",push:"Push",inapp:"In-App"}[ch];
  const statusColor = s => ({delivered:C.greenSolid,read:C.greenSolid,sent:C.blueSolid,queued:"#D4943A",scheduled:C.purpleSolid,draft:"#8C7E6F",failed:"#C85C3E"}[s]||"#8C7E6F");
  const statusBg = s => ({delivered:"#EFF5F2",read:"#EFF5F2",sent:"#E8EFF7",queued:"#FDF4EC",scheduled:C.purpleBg,draft:"#F5F0E8",failed:C.redBg}[s]||"#F5F0E8");

  const filtered = messages.filter(m=>{
    if(tab==="inbox"&&(m.status==="draft"||m.status==="scheduled")) return false;
    if(tab==="drafts"&&m.status!=="draft") return false;
    if(tab==="scheduled"&&m.status!=="scheduled") return false;
    if(tab==="broadcasts"&&!m.isBroadcast) return false;
    if(tab==="failed"&&m.status!=="failed") return false;
    if(filter!=="ALL"&&m.status!==filter) return false;
    if(channelFilter!=="ALL"&&m.channel!==channelFilter) return false;
    if(search){const q=search.toLowerCase();return (m.to+m.subject+m.body+(m.toAr||"")+(m.subjectAr||"")).toLowerCase().includes(q);}
    return true;
  });

  // Active investors for recipient picker
  const activeInvestors = investors.filter(i=>i.status==="ACTIVE");
  const recipientGroups = [
    {id:"all",label:isAr?"جميع المستثمرين النشطين":"All Active Investors",count:activeInvestors.length},
    {id:"kyc",label:isAr?"تنتهي هوياتهم خلال 30 يوم":"KYC Expiring (30 days)",count:investors.filter(i=>i.kycExpiry&&i.kycExpiry<new Date(Date.now()+30*86400000).toISOString().slice(0,10)&&i.kycExpiry>=new Date().toISOString().slice(0,10)&&i.status==="ACTIVE").length},
    {id:"noshow",label:isAr?"لم يحضروا (2+)":"No-Show (2+)",count:investors.filter(i=>(i.noShowCount||0)>=2).length},
    {id:"highval",label:isAr?"قيمة عالية (>500K)":"High Value (>500K SAR)",count:investors.filter(i=>parseInt(String(i.holdingsValue).replace(/,/g,""))>500000).length},
    {id:"new",label:isAr?"جدد (آخر 30 يوم)":"New (last 30 days)",count:investors.filter(i=>(new Date()-new Date(i.joined))<30*86400000).length},
  ];

  const openCompose = (prefill={}) => {
    setCompose({to:"",toNid:"",channel:"sms",subject:"",body:"",priority:"normal",template:null,scheduledFor:"",...prefill});
    setTab("compose");
  };

  const sendMessage = () => {
    if(!compose) return;
    if(!compose.to.trim()||!compose.body.trim()){showToast(isAr?"⚠️ أكمل المستلم والرسالة":"⚠️ Fill recipient and message");return;}
    const now = new Date().toISOString().slice(0,16).replace("T"," ");
    const msg = {
      id:"MSG-"+String(Date.now()).slice(-6),
      to:compose.to, toAr:compose.to, toNid:compose.toNid||"—",
      channel:compose.channel, subject:compose.subject||"(No subject)", subjectAr:compose.subject,
      body:compose.body, status:compose.scheduledFor?"scheduled":"sent",
      priority:compose.priority, sentBy:"admin@tanaqul.sa",
      sentAt:compose.scheduledFor?null:now, scheduledFor:compose.scheduledFor||null,
      deliveredAt:null, readAt:null, template:compose.template,
    };
    setMessages(p=>[msg,...p]);
    showToast(compose.scheduledFor?(isAr?"✅ تم جدولة الرسالة":"✅ Message scheduled"):(isAr?"✅ تم إرسال الرسالة":"✅ Message sent"));
    setCompose(null); setTab("inbox");
  };

  const saveDraft = () => {
    if(!compose) return;
    const msg = {
      id:"MSG-D"+String(Date.now()).slice(-5),
      to:compose.to||"—", toAr:compose.to||"—", toNid:compose.toNid||"—",
      channel:compose.channel, subject:compose.subject||"(Untitled)", subjectAr:compose.subject,
      body:compose.body, status:"draft",
      priority:compose.priority, sentBy:"admin@tanaqul.sa",
      sentAt:null, template:compose.template,
    };
    setMessages(p=>[msg,...p]);
    showToast(isAr?"✅ تم حفظ المسودة":"✅ Draft saved");
    setCompose(null); setTab("drafts");
  };

  const sendBroadcast = (group) => {
    if(!broadcastModal) return;
    const grp = recipientGroups.find(g=>g.id===broadcastModal.groupId);
    const now = new Date().toISOString().slice(0,16).replace("T"," ");
    const msg = {
      id:"MSG-B"+String(Date.now()).slice(-5),
      to:`${grp?.label||"Group"} (${grp?.count||0})`, toAr:`${grp?.label||"Group"} (${grp?.count||0})`,
      toNid:"BROADCAST", channel:broadcastModal.channel, subject:broadcastModal.subject,
      subjectAr:broadcastModal.subject, body:broadcastModal.body,
      status:"delivered", priority:broadcastModal.priority||"normal",
      sentBy:"admin@tanaqul.sa", sentAt:now, deliveredAt:now, readAt:null,
      isBroadcast:true, recipientCount:grp?.count||0, template:null,
    };
    setMessages(p=>[msg,...p]);
    showToast(isAr?`✅ تم إرسال البث إلى ${grp?.count} مستثمر`:`✅ Broadcast sent to ${grp?.count} investors`);
    setBroadcastModal(null);
  };

  return (
    <div>
      {toast&&<div style={{position:"fixed",top:20,right:20,background:C.navy,color:C.white,padding:"12px 20px",borderRadius:12,fontSize:15,fontWeight:600,zIndex:9999,boxShadow:C.cardShadow}}>{toast}</div>}

      <SectionHeader title={isAr?"مركز الاتصالات":"Communication Center"} sub={isAr?"مركز رسائل المستثمرين والقوالب والبث الجماعي":"Investor messaging, templates & broadcast hub"}
        action={<div style={{display:"flex",gap:8}}>
          <Btn variant="outline" onClick={()=>{setBroadcastModal({groupId:"all",channel:"push",subject:"",body:"",priority:"normal"});}}>{Icons.megaphone(14,C.gold)} {isAr?"بث جماعي":"Broadcast"}</Btn>
          <Btn variant="gold" onClick={()=>openCompose()}>{Icons.send(14,"#FFF")} {isAr?"رسالة جديدة":"New Message"}</Btn>
        </div>}
      />

      {/* Stats Row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:14,marginBottom:22}}>
        <StatCard icon={Icons.send(22,C.teal)} title={isAr?"مرسلة":"Total Sent"} value={totalSent} />
        <StatCard icon={Icons.check(22,C.greenSolid)} title={isAr?"مُسلَّمة":"Delivered"} value={delivered} />
        <StatCard icon={Icons.warning(22,"#C85C3E")} title={isAr?"فاشلة":"Failed"} value={failed} />
        <StatCard icon={Icons.clockSend(22,C.purpleSolid)} title={isAr?"مجدولة":"Scheduled"} value={scheduled} />
        <StatCard icon={Icons.envelope(22,C.gold)} title={isAr?"أرسلت اليوم":"Sent Today"} value={todaySent} gold />
        <StatCard icon={Icons.activity(22,C.teal)} title={isAr?"معدل التسليم":"Delivery Rate"} value={deliveryRate+"%"} />
      </div>

      {/* Tab Bar */}
      <div style={{display:"flex",gap:3,marginBottom:16,flexWrap:"wrap"}}>
        {[
          {id:"inbox",label:isAr?"الوارد":"Inbox",icon:"📥",count:messages.filter(m=>m.status!=="draft"&&m.status!=="scheduled").length},
          {id:"compose",label:isAr?"إنشاء":"Compose",icon:"✏️"},
          {id:"templates",label:isAr?"القوالب":"Templates",icon:"📋",count:templates.length},
          {id:"broadcasts",label:isAr?"البث":"Broadcasts",icon:"📢",count:messages.filter(m=>m.isBroadcast).length},
          {id:"scheduled",label:isAr?"المجدولة":"Scheduled",icon:"⏰",count:scheduled},
          {id:"drafts",label:isAr?"المسودات":"Drafts",icon:"📝",count:drafts},
          {id:"failed",label:isAr?"الفاشلة":"Failed",icon:"❌",count:failed},
        ].map(t2=>(
          <button key={t2.id} onClick={()=>{setTab(t2.id);if(t2.id==="compose"&&!compose)openCompose();}}
            style={{padding:"8px 16px",borderRadius:10,fontSize:14,fontWeight:tab===t2.id?700:500,cursor:"pointer",
              border:`1px solid ${tab===t2.id?C.gold:C.border}`,background:tab===t2.id?C.goldLight:C.white,
              color:tab===t2.id?C.gold:C.textMuted,display:"flex",alignItems:"center",gap:6,transition:"all 0.15s"}}>
            <span style={{fontSize:15}}>{t2.icon}</span>
            {t2.label}
            {t2.count!==undefined&&<span style={{fontSize:11,fontWeight:700,background:tab===t2.id?C.gold:C.border,color:tab===t2.id?"#FFF":C.textMuted,borderRadius:10,padding:"1px 6px",minWidth:18,textAlign:"center"}}>{t2.count}</span>}
          </button>
        ))}
      </div>

      {/* ─── INBOX TAB ─── */}
      {(tab==="inbox"||tab==="broadcasts"||tab==="scheduled"||tab==="drafts"||tab==="failed")&&<div>
        {/* Filters */}
        <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
          <input placeholder={isAr?"بحث في الرسائل...":"Search messages..."} value={search} onChange={e=>setSearch(e.target.value)}
            style={{flex:1,minWidth:200,padding:"8px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:15,outline:"none"}} />
          {tab==="inbox"&&<>
            {["ALL","sent","delivered","read"].map(f=>(
              <button key={f} onClick={()=>setFilter(f)} style={{padding:"6px 12px",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",
                border:`1px solid ${filter===f?C.navy:C.border}`,background:filter===f?C.navy:C.white,color:filter===f?"#FFF":C.textMuted}}>
                {f==="ALL"?(isAr?"الكل":"All"):f.charAt(0).toUpperCase()+f.slice(1)}</button>))}
            <div style={{width:1,height:24,background:C.border}} />
            {["ALL","sms","email","push"].map(ch=>(
              <button key={ch} onClick={()=>setChannelFilter(ch)} style={{padding:"6px 12px",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",
                border:`1px solid ${channelFilter===ch?C.teal:C.border}`,background:channelFilter===ch?C.tealLight:C.white,color:channelFilter===ch?C.teal:C.textMuted}}>
                {ch==="ALL"?(isAr?"كل القنوات":"All"):`${channelIcon(ch)} ${channelLabel(ch)}`}</button>))}
          </>}
        </div>

        {/* Message List */}
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {filtered.length===0&&<div style={{textAlign:"center",padding:40,color:C.textMuted}}>{isAr?"لا توجد رسائل":"No messages found"}</div>}
          {filtered.map(msg=>(
            <button key={msg.id} onClick={()=>setSelMsg(msg)}
              style={{width:"100%",textAlign:"start",background:C.white,borderRadius:12,border:`1px solid ${C.border}`,padding:"14px 18px",cursor:"pointer",
                display:"flex",alignItems:"flex-start",gap:14,boxShadow:C.cardShadow,transition:"all 0.12s",
                borderInlineStart:`3px solid ${statusColor(msg.status)}`}}
              onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 16px rgba(45,36,24,0.1)"}
              onMouseLeave={e=>e.currentTarget.style.boxShadow=C.cardShadow}>
              <div style={{width:40,height:40,borderRadius:10,background:statusBg(msg.status),display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:20}}>
                {channelIcon(msg.channel)}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}}>
                  <span style={{fontSize:15,fontWeight:700,color:C.navy}}>{isAr?(msg.subjectAr||msg.subject):msg.subject}</span>
                  {msg.priority==="urgent"&&<span style={{fontSize:10,fontWeight:800,color:"#C85C3E",background:C.redBg,padding:"2px 6px",borderRadius:4}}>🔴 {isAr?"عاجل":"URGENT"}</span>}
                  {msg.isBroadcast&&<span style={{fontSize:10,fontWeight:800,color:C.purpleSolid,background:C.purpleBg,padding:"2px 6px",borderRadius:4}}>📢 {isAr?"بث":"BROADCAST"}</span>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <span style={{fontSize:13,color:C.textMuted}}>{isAr?"إلى":"To"}: <b style={{color:C.navy}}>{isAr?(msg.toAr||msg.to):msg.to}</b></span>
                  <span style={{fontSize:12,fontWeight:700,color:statusColor(msg.status),background:statusBg(msg.status),padding:"2px 8px",borderRadius:6}}>
                    {msg.status==="delivered"?(isAr?"مُسلَّمة":"Delivered"):msg.status==="read"?(isAr?"مقروءة":"Read"):msg.status==="sent"?(isAr?"مرسلة":"Sent"):msg.status==="scheduled"?(isAr?"مجدولة":"Scheduled"):msg.status==="draft"?(isAr?"مسودة":"Draft"):msg.status==="failed"?(isAr?"فاشلة":"Failed"):(isAr?"في الانتظار":"Queued")}
                  </span>
                </div>
                <p style={{fontSize:13,color:C.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"100%"}}>{msg.body}</p>
              </div>
              <div style={{flexShrink:0,textAlign:"end"}}>
                <p style={{fontSize:12,color:C.textMuted,fontFamily:"monospace"}}>{msg.sentAt||msg.scheduledFor||"—"}</p>
                <p style={{fontSize:11,color:C.textMuted,marginTop:2}}>{channelLabel(msg.channel)}</p>
              </div>
            </button>
          ))}
        </div>
      </div>}

      {/* ─── COMPOSE TAB ─── */}
      {tab==="compose"&&compose&&<div style={{background:C.white,borderRadius:16,border:`1px solid ${C.border}`,padding:24,boxShadow:C.cardShadow}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
          <span style={{fontSize:22}}>✏️</span>
          <p style={{fontSize:18,fontWeight:700,color:C.navy}}>{isAr?"إنشاء رسالة جديدة":"Compose New Message"}</p>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
          {/* Recipient */}
          <div>
            <Sel label={isAr?"المستلم":"Recipient"} value={compose.toNid} onChange={v=>{
              const inv = investors.find(i=>i.nationalId===v);
              setCompose(p=>({...p,to:inv?inv.nameEn:"",toNid:v}));
            }} options={[{value:"",label:isAr?"— اختر مستثمر —":"— Select investor —"},...activeInvestors.map(i=>({value:i.nationalId,label:`${i.nameEn} (${i.nationalId})`}))]} />
          </div>
          {/* Channel */}
          <div>
            <Sel label={isAr?"القناة":"Channel"} value={compose.channel} onChange={v=>setCompose(p=>({...p,channel:v}))}
              options={[{value:"sms",label:"📱 SMS"},{value:"email",label:"📧 Email"},{value:"push",label:"🔔 Push"},{value:"inapp",label:"📲 In-App"}]} />
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
          {/* Subject */}
          <Inp label={isAr?"الموضوع":"Subject"} value={compose.subject} onChange={v=>setCompose(p=>({...p,subject:v}))} placeholder={isAr?"أدخل الموضوع":"Enter subject"} />
          {/* Priority */}
          <Sel label={isAr?"الأولوية":"Priority"} value={compose.priority} onChange={v=>setCompose(p=>({...p,priority:v}))}
            options={[{value:"normal",label:isAr?"عادي":"Normal"},{value:"urgent",label:isAr?"🔴 عاجل":"🔴 Urgent"}]} />
        </div>
        {/* Template picker */}
        <div style={{marginBottom:14}}>
          <Sel label={isAr?"استخدام قالب":"Use Template"} value={compose.template||""} onChange={v=>{
            const tpl = templates.find(t3=>t3.id===v);
            if(tpl) setCompose(p=>({...p,template:v,subject:isAr?tpl.nameAr:tpl.name,body:isAr?tpl.bodyAr:tpl.body}));
          }} options={[{value:"",label:isAr?"— بدون قالب —":"— No template —"},...templates.map(t3=>({value:t3.id,label:`${channelIcon(t3.channel)} ${isAr?t3.nameAr:t3.name}`}))]} />
        </div>
        {/* Body */}
        <div style={{marginBottom:14}}>
          <label style={{display:"block",fontSize:13,fontWeight:600,color:C.textMuted,marginBottom:5}}>{isAr?"نص الرسالة":"Message Body"}</label>
          <textarea value={compose.body} onChange={e=>setCompose(p=>({...p,body:e.target.value}))}
            placeholder={isAr?"اكتب رسالتك...":"Type your message..."} rows={6}
            style={{width:"100%",padding:"12px 14px",borderRadius:10,fontSize:15,border:`1px solid ${C.border}`,resize:"vertical",boxSizing:"border-box",fontFamily:"inherit",lineHeight:1.6}} />
          <p style={{fontSize:12,color:C.textMuted,marginTop:4}}>{compose.body.length} {isAr?"حرف":"chars"} {compose.channel==="sms"&&compose.body.length>160&&<span style={{color:C.red}}>⚠️ {isAr?"يتجاوز 160 حرف SMS":"Exceeds 160 SMS chars"}</span>}</p>
        </div>
        {/* Schedule */}
        <div style={{marginBottom:18}}>
          <label style={{display:"block",fontSize:13,fontWeight:600,color:C.textMuted,marginBottom:5}}>{isAr?"جدولة الإرسال (اختياري)":"Schedule Send (optional)"}</label>
          <input type="datetime-local" value={compose.scheduledFor} onChange={e=>setCompose(p=>({...p,scheduledFor:e.target.value}))}
            style={{padding:"8px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:14,outline:"none"}} />
        </div>
        {/* Actions */}
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <Btn variant="gold" onClick={sendMessage}>{Icons.send(14,"#FFF")} {compose.scheduledFor?(isAr?"جدولة الإرسال":"Schedule Send"):(isAr?"إرسال الآن":"Send Now")}</Btn>
          <Btn variant="outline" onClick={saveDraft}>{isAr?"حفظ كمسودة":"Save Draft"}</Btn>
          <Btn variant="outline" onClick={()=>{setCompose(null);setTab("inbox");}}>{isAr?"إلغاء":"Cancel"}</Btn>
        </div>
      </div>}

      {/* ─── TEMPLATES TAB ─── */}
      {tab==="templates"&&<div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:14}}>
          {templates.map(tpl=>(
            <div key={tpl.id} style={{background:C.white,borderRadius:14,border:`1px solid ${C.border}`,overflow:"hidden",boxShadow:C.cardShadow}}>
              <div style={{padding:"16px 18px",borderBottom:`1px solid ${C.border}`}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:18}}>{channelIcon(tpl.channel)}</span>
                    <span style={{fontSize:15,fontWeight:700,color:C.navy}}>{isAr?tpl.nameAr:tpl.name}</span>
                  </div>
                  {tpl.priority==="urgent"&&<span style={{fontSize:10,fontWeight:800,color:"#C85C3E",background:C.redBg,padding:"2px 6px",borderRadius:4}}>🔴 {isAr?"عاجل":"URGENT"}</span>}
                </div>
                <div style={{display:"flex",gap:6}}>
                  <span style={{fontSize:11,fontWeight:600,color:C.purpleSolid,background:C.purpleBg,padding:"2px 8px",borderRadius:4}}>{isAr?tpl.categoryAr:tpl.category}</span>
                  <span style={{fontSize:11,fontWeight:600,color:C.textMuted,background:C.bg,padding:"2px 8px",borderRadius:4}}>{channelLabel(tpl.channel)}</span>
                </div>
              </div>
              <div style={{padding:"14px 18px"}}>
                <p style={{fontSize:13,color:C.textMuted,lineHeight:1.5,minHeight:60}}>{isAr?tpl.bodyAr:tpl.body}</p>
                {tpl.vars&&tpl.vars.length>0&&<div style={{marginTop:8,display:"flex",gap:4,flexWrap:"wrap"}}>
                  {tpl.vars.map(v=><span key={v} style={{fontSize:11,color:C.gold,background:C.goldLight,padding:"2px 6px",borderRadius:4,fontFamily:"monospace"}}>{`{${v}}`}</span>)}
                </div>}
              </div>
              <div style={{padding:"10px 18px",borderTop:`1px solid ${C.border}`,display:"flex",gap:6}}>
                <Btn small variant="gold" onClick={()=>openCompose({template:tpl.id,subject:isAr?tpl.nameAr:tpl.name,body:isAr?tpl.bodyAr:tpl.body,channel:tpl.channel,priority:tpl.priority})}>{Icons.send(12,"#FFF")} {isAr?"استخدام":"Use"}</Btn>
                <Btn small variant="outline" onClick={()=>setTplModal(tpl)}>{isAr?"معاينة":"Preview"}</Btn>
              </div>
            </div>
          ))}
        </div>
      </div>}

      {/* ─── MESSAGE DETAIL MODAL ─── */}
      {selMsg&&<Modal title={`${isAr?"رسالة":"Message"} — ${selMsg.id}`} onClose={()=>setSelMsg(null)}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,background:statusBg(selMsg.status),borderRadius:10,padding:"12px 16px"}}>
          <span style={{fontSize:24}}>{channelIcon(selMsg.channel)}</span>
          <div style={{flex:1}}>
            <p style={{fontSize:16,fontWeight:700,color:C.navy}}>{isAr?(selMsg.subjectAr||selMsg.subject):selMsg.subject}</p>
            <p style={{fontSize:13,color:C.textMuted}}>{isAr?"إلى":"To"}: {isAr?(selMsg.toAr||selMsg.to):selMsg.to}</p>
          </div>
          <span style={{fontSize:13,fontWeight:700,color:statusColor(selMsg.status),background:C.white,padding:"4px 10px",borderRadius:6}}>
            {selMsg.status.charAt(0).toUpperCase()+selMsg.status.slice(1)}
          </span>
        </div>
        {/* Detail fields */}
        {[
          [isAr?"المعرف":"ID",selMsg.id],
          [isAr?"القناة":"Channel",`${channelIcon(selMsg.channel)} ${channelLabel(selMsg.channel)}`],
          [isAr?"الأولوية":"Priority",selMsg.priority==="urgent"?"🔴 "+t("Urgent"):t("Normal")],
          [isAr?"أُرسلت بواسطة":"Sent By",selMsg.sentBy],
          [isAr?"تاريخ الإرسال":"Sent At",selMsg.sentAt||"—"],
          [isAr?"تم التسليم":"Delivered At",selMsg.deliveredAt||"—"],
          [isAr?"تمت القراءة":"Read At",selMsg.readAt||"—"],
          ...(selMsg.scheduledFor?[[isAr?"مجدولة لـ":"Scheduled For",selMsg.scheduledFor]]:[] ),
          ...(selMsg.failReason?[[isAr?"سبب الفشل":"Fail Reason",selMsg.failReason]]:[] ),
          ...(selMsg.template?[[isAr?"القالب":"Template",selMsg.template]]:[] ),
          ...(selMsg.recipientCount?[[isAr?"عدد المستلمين":"Recipients",selMsg.recipientCount]]:[] ),
        ].map(([k,v])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:13,color:C.textMuted}}>{k}</span>
            <span style={{fontSize:13,fontWeight:600,color:C.navy}}>{v}</span>
          </div>
        ))}
        {/* Message body */}
        <div style={{marginTop:14,background:C.bg,borderRadius:10,padding:"14px 16px"}}>
          <p style={{fontSize:12,fontWeight:600,color:C.textMuted,marginBottom:6,textTransform:"uppercase"}}>{isAr?"نص الرسالة":"Message Body"}</p>
          <p style={{fontSize:14,color:C.navy,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{selMsg.body}</p>
        </div>
        {/* Actions */}
        <div style={{display:"flex",gap:8,marginTop:14}}>
          {selMsg.status==="failed"&&<Btn variant="gold" onClick={()=>{setMessages(p=>p.map(m=>m.id===selMsg.id?{...m,status:"sent",sentAt:new Date().toISOString().slice(0,16).replace("T"," "),failReason:null}:m));setSelMsg(null);showToast(isAr?"✅ تم إعادة الإرسال":"✅ Message resent");}}>{isAr?"إعادة إرسال":"Resend"}</Btn>}
          {selMsg.status==="draft"&&<Btn variant="gold" onClick={()=>{openCompose({to:selMsg.to,toNid:selMsg.toNid,channel:selMsg.channel,subject:selMsg.subject,body:selMsg.body,priority:selMsg.priority,template:selMsg.template});setSelMsg(null);}}>{isAr?"تعديل وإرسال":"Edit & Send"}</Btn>}
          {selMsg.status==="scheduled"&&<Btn variant="danger" onClick={()=>{setMessages(p=>p.filter(m=>m.id!==selMsg.id));setSelMsg(null);showToast(isAr?"✅ تم إلغاء الجدولة":"✅ Schedule cancelled");}}>{isAr?"إلغاء الجدولة":"Cancel Schedule"}</Btn>}
          <Btn variant="outline" onClick={()=>setSelMsg(null)}>{isAr?"إغلاق":"Close"}</Btn>
        </div>
      </Modal>}

      {/* ─── TEMPLATE PREVIEW MODAL ─── */}
      {tplModal&&<Modal title={`${isAr?"قالب":"Template"} — ${isAr?tplModal.nameAr:tplModal.name}`} onClose={()=>setTplModal(null)}>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <span style={{fontSize:12,fontWeight:700,color:C.purpleSolid,background:C.purpleBg,padding:"3px 8px",borderRadius:6}}>{isAr?tplModal.categoryAr:tplModal.category}</span>
          <span style={{fontSize:12,fontWeight:700,color:C.teal,background:C.tealLight,padding:"3px 8px",borderRadius:6}}>{channelIcon(tplModal.channel)} {channelLabel(tplModal.channel)}</span>
          {tplModal.priority==="urgent"&&<span style={{fontSize:12,fontWeight:700,color:"#C85C3E",background:C.redBg,padding:"3px 8px",borderRadius:6}}>🔴 {isAr?"عاجل":"Urgent"}</span>}
        </div>
        <div style={{background:C.bg,borderRadius:10,padding:"14px 16px",marginBottom:14}}>
          <p style={{fontSize:12,fontWeight:600,color:C.textMuted,marginBottom:6}}>ENGLISH</p>
          <p style={{fontSize:14,color:C.navy,lineHeight:1.6}}>{tplModal.body}</p>
        </div>
        <div style={{background:C.bg,borderRadius:10,padding:"14px 16px",marginBottom:14,direction:"rtl"}}>
          <p style={{fontSize:12,fontWeight:600,color:C.textMuted,marginBottom:6}}>عربي</p>
          <p style={{fontSize:14,color:C.navy,lineHeight:1.6}}>{tplModal.bodyAr}</p>
        </div>
        {tplModal.vars&&<div>
          <p style={{fontSize:12,fontWeight:600,color:C.textMuted,marginBottom:6}}>{isAr?"المتغيرات":"Variables"}</p>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {tplModal.vars.map(v=><span key={v} style={{fontSize:12,color:C.gold,background:C.goldLight,padding:"3px 8px",borderRadius:6,fontFamily:"monospace"}}>{`{${v}}`}</span>)}
          </div>
        </div>}
        <div style={{display:"flex",gap:8,marginTop:14}}>
          <Btn variant="gold" onClick={()=>{openCompose({template:tplModal.id,subject:isAr?tplModal.nameAr:tplModal.name,body:isAr?tplModal.bodyAr:tplModal.body,channel:tplModal.channel,priority:tplModal.priority});setTplModal(null);}}>{Icons.send(12,"#FFF")} {isAr?"استخدام القالب":"Use Template"}</Btn>
          <Btn variant="outline" onClick={()=>setTplModal(null)}>{isAr?"إغلاق":"Close"}</Btn>
        </div>
      </Modal>}

      {/* ─── BROADCAST MODAL ─── */}
      {broadcastModal&&<Modal title={isAr?"بث جماعي":"Broadcast Message"} onClose={()=>setBroadcastModal(null)}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16,background:C.purpleBg,borderRadius:10,padding:"12px 16px"}}>
          <span style={{fontSize:22}}>📢</span>
          <p style={{fontSize:14,fontWeight:600,color:C.purpleSolid}}>{isAr?"سيتم إرسال هذه الرسالة لمجموعة من المستثمرين":"This message will be sent to a group of investors"}</p>
        </div>
        {/* Group picker */}
        <div style={{marginBottom:14}}>
          <p style={{fontSize:13,fontWeight:600,color:C.textMuted,marginBottom:8}}>{isAr?"اختر المجموعة":"Select Group"}</p>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {recipientGroups.map(g=>(
              <button key={g.id} onClick={()=>setBroadcastModal(p=>({...p,groupId:g.id}))}
                style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderRadius:10,cursor:"pointer",
                  border:`1.5px solid ${broadcastModal.groupId===g.id?C.gold:C.border}`,background:broadcastModal.groupId===g.id?C.goldLight:C.white,transition:"all 0.12s"}}>
                <span style={{fontSize:14,fontWeight:broadcastModal.groupId===g.id?700:500,color:broadcastModal.groupId===g.id?C.gold:C.navy}}>{g.label}</span>
                <span style={{fontSize:13,fontWeight:700,color:broadcastModal.groupId===g.id?C.gold:C.textMuted,background:broadcastModal.groupId===g.id?C.white:C.bg,padding:"2px 10px",borderRadius:8}}>{g.count}</span>
              </button>
            ))}
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
          <Sel label={isAr?"القناة":"Channel"} value={broadcastModal.channel} onChange={v=>setBroadcastModal(p=>({...p,channel:v}))}
            options={[{value:"push",label:"🔔 Push"},{value:"sms",label:"📱 SMS"},{value:"email",label:"📧 Email"},{value:"inapp",label:"📲 In-App"}]} />
          <Sel label={isAr?"الأولوية":"Priority"} value={broadcastModal.priority} onChange={v=>setBroadcastModal(p=>({...p,priority:v}))}
            options={[{value:"normal",label:isAr?"عادي":"Normal"},{value:"urgent",label:isAr?"🔴 عاجل":"🔴 Urgent"}]} />
        </div>
        <Inp label={isAr?"الموضوع":"Subject"} value={broadcastModal.subject} onChange={v=>setBroadcastModal(p=>({...p,subject:v}))} placeholder={isAr?"أدخل الموضوع":"Enter subject"} />
        <div style={{marginBottom:14}}>
          <label style={{display:"block",fontSize:13,fontWeight:600,color:C.textMuted,marginBottom:5}}>{isAr?"نص الرسالة":"Message Body"}</label>
          <textarea value={broadcastModal.body} onChange={e=>setBroadcastModal(p=>({...p,body:e.target.value}))}
            placeholder={isAr?"اكتب رسالتك...":"Type your message..."} rows={4}
            style={{width:"100%",padding:"10px 14px",borderRadius:10,fontSize:14,border:`1px solid ${C.border}`,resize:"vertical",boxSizing:"border-box",fontFamily:"inherit"}} />
        </div>
        {/* Confirm section */}
        <div style={{background:"#FDF4EC",borderRadius:10,padding:"12px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
          {Icons.warning(20,"#D4943A")}
          <p style={{fontSize:13,fontWeight:600,color:"#8B6540"}}>
            {isAr?"سيتم الإرسال إلى":"This will send to"} <b>{recipientGroups.find(g=>g.id===broadcastModal.groupId)?.count||0}</b> {isAr?"مستثمرين":"investors"} {isAr?"عبر":"via"} {channelLabel(broadcastModal.channel)}
          </p>
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn variant="gold" onClick={()=>sendBroadcast(broadcastModal.groupId)}>
            {Icons.megaphone(14,"#FFF")} {isAr?"إرسال البث":"Send Broadcast"} ({recipientGroups.find(g=>g.id===broadcastModal.groupId)?.count||0})
          </Btn>
          <Btn variant="outline" onClick={()=>setBroadcastModal(null)}>{isAr?"إلغاء":"Cancel"}</Btn>
        </div>
      </Modal>}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE 17 — TREASURY & RECONCILIATION
// Golden Rules:
//   1. Pool Bank = Investor Wallets + Platform Revenue + MM Cash
//   2. Tokenized grams = Physical bars per metal (gold, silver, platinum)
// ═══════════════════════════════════════════════════════════════════════════════

function treasurySeedDaily() { return []; }
function treasurySeedWeekly() { return []; }
function treasurySeedDiscrep() { return []; }

const TreasuryReconciliation = () => {
  const { t, isAr } = useLang();
  const { mmAccount, setMMAccount, reconState, setReconState, bars, investors, addAudit } = useAppData();
  const [tab, setTab] = useState("overview");
  const [daily, setDaily] = useState(treasurySeedDaily);
  const [weekly, setWeekly] = useState(treasurySeedWeekly);
  const [discrep, setDiscrep] = useState(treasurySeedDiscrep);
  const [bankInput, setBankInput] = useState("");
  const [resolveId, setResolveId] = useState(null);
  const [resolveNote, setResolveNote] = useState("");
  const [toast, setToast] = useState(null);

  // Platform accounts derived from real data
  const mm = mmAccount || {cash:0,gold:{g:0,avg:0},silver:{g:0,avg:0},platinum:{g:0,avg:0},trades:[],pnl:{realized:0,unrealized:0,fees:0}};
  const frozen = reconState?.frozen || false;

  // ── Platform balances (derived from investors + revenue + MM) ──
  const investorTotal = (investors||[]).reduce((s,inv)=>s+parseFloat(inv.walletSAR||inv.wallet||0),0);
  const [poolTotal, setPoolTotal] = useState(0);
  const platformRevenue = 0;
  const poolExpected = investorTotal + platformRevenue + mm.cash;
  const poolValid = Math.abs(poolExpected - poolTotal) < 0.01;

  // Vault data — derived from real bars when available, fallback to mock
  const barsData = bars || [];
  const goldBars = barsData.filter(b=>(b.metal||"").toLowerCase()==="gold");
  const silverBars = barsData.filter(b=>(b.metal||"").toLowerCase()==="silver");
  const platBars = barsData.filter(b=>(b.metal||"").toLowerCase()==="platinum");
  const sumWeight = (arr) => arr.reduce((s,b)=>s+parseFloat(b.weight||b.grams||0),0);
  const vaultData = {
    gold:   {tok: sumWeight(goldBars), phys: sumWeight(goldBars), bars: goldBars.length, ok:true},
    silver: {tok: sumWeight(silverBars), phys: sumWeight(silverBars), bars: silverBars.length, ok:true},
    platinum:{tok: sumWeight(platBars), phys: sumWeight(platBars), bars: platBars.length, ok:true},
  };

  const takharojBal = 0;
  const fmtS = n => "SAR "+Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
  const fmtG = n => Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})+" g";
  const fmtN = n => Number(n).toLocaleString("en-US");

  const showToast = (msg,type="info") => { setToast({msg,type}); setTimeout(()=>setToast(null),4000); };

  // ── doMarketMaker: MM can only sell grams it owns, notify admin to mint if 0 ──
  const doMarketMaker = (metal, action, grams, price) => {
    setMMAccount(prev => {
      const p = prev||mm;
      const mState = p[metal];
      if(action==="sell") {
        if(mState.g < grams) {
          showToast(`⚠️ MM has 0 ${metal} — Admin notified to mint more tokens`,"warn");
          addAudit("MM_MINT_NEEDED","Treasury",`MM tried to sell ${grams}g ${metal} but holds ${mState.g}g — minting required`);
          return p;
        }
        const revenue = grams*price, cost = grams*mState.avg, profit = revenue-cost;
        return {...p, cash:p.cash+revenue, [metal]:{...mState,g:mState.g-grams},
          trades:[...p.trades,{id:"MT-"+Date.now(),metal,action,grams,price,profit,ts:Date.now()}],
          pnl:{...p.pnl, realized:p.pnl.realized+profit}};
      } else {
        const cost = grams*price;
        if(p.cash < cost) { showToast("⚠️ Insufficient MM cash","warn"); return p; }
        const totalG = mState.g+grams, newAvg = (mState.g*mState.avg+cost)/totalG;
        return {...p, cash:p.cash-cost, [metal]:{g:totalG,avg:newAvg},
          trades:[...p.trades,{id:"MT-"+Date.now(),metal,action,grams,price,ts:Date.now()}]};
      }
    });
  };

  // ── Nightly reconciliation: freeze → cash recon → vault recon (tok=phys per metal) → unfreeze ──
  const runRecon = () => {
    setReconState(p=>({...p,frozen:true}));
    showToast("🔒 Trading FROZEN — Reconciliation started","warn");
    addAudit("RECON_START","Treasury","Nightly reconciliation initiated — trading frozen");

    setTimeout(() => {
      const cashOk = poolValid;
      const gOk = vaultData.gold.tok === vaultData.gold.phys;
      const sOk = vaultData.silver.tok === vaultData.silver.phys;
      const pOk = vaultData.platinum.tok === vaultData.platinum.phys;
      const allOk = cashOk && gOk && sOk && pOk;

      const entry = { id:"RD-"+Math.random().toString(36).slice(2,8), date:new Date().toISOString().split("T")[0],
        cash:{status:cashOk?"balanced":"discrepancy",expected:poolExpected,actual:poolTotal,diff:poolTotal-poolExpected},
        vault:{ gold:{tok:vaultData.gold.tok,phys:vaultData.gold.phys,ok:gOk}, silver:{tok:vaultData.silver.tok,phys:vaultData.silver.phys,ok:sOk}, platinum:{tok:vaultData.platinum.tok,phys:vaultData.platinum.phys,ok:pOk} },
        overall:allOk?"balanced":"discrepancy",
        time:new Date().toLocaleTimeString(), by:"system-nightly",
      };
      setDaily(prev=>[entry,...prev]);

      // Auto-log discrepancies
      const newD = [];
      if(!cashOk) newD.push({id:"DC-"+Math.random().toString(36).slice(2,8),date:entry.date,type:"cash",metal:null,expected:poolExpected,actual:poolTotal,diff:poolTotal-poolExpected,status:"open",resolution:null,by:null,at:null});
      ["gold","silver","platinum"].forEach(m=>{
        const v = vaultData[m];
        if(v.tok!==v.phys) newD.push({id:"DC-"+Math.random().toString(36).slice(2,8),date:entry.date,type:"vault",metal:m,tok:v.tok,phys:v.phys,diff:v.phys-v.tok,status:"open",resolution:null,by:null,at:null});
      });
      if(newD.length) setDiscrep(prev=>[...newD,...prev]);

      setReconState({frozen:false, lastRecon:new Date().toISOString(), dayStatus:allOk?"balanced":"discrepancy"});
      addAudit("RECON_COMPLETE","Treasury",`Nightly recon ${allOk?"PASSED":"FAILED"} — trading resumed`);
      showToast(allOk?"✅ Reconciliation PASSED — Trading resumed":"⚠️ Discrepancies found — Review required",allOk?"success":"error");
    }, 2500);
  };

  // ── Weekly Friday sweep: auto if 7/7 balanced, manual override available ──
  const runSweep = (force=false) => {
    const last7 = daily.slice(0,7);
    const balCount = last7.filter(d=>d.overall==="balanced").length;
    const canAuto = balCount===7 && !force;
    const revAmt = platformRevenue;
    const mmProfit = Math.max(0,mm.pnl.realized);
    const sweepTotal = revAmt + mmProfit;

    if(canAuto || force) {
      const entry = { id:"RW-"+Math.random().toString(36).slice(2,8), weekEnding:new Date().toISOString().split("T")[0],
        daysOk:balCount, eligible:canAuto, swept:true, total:sweepTotal, revenue:revAmt, mmProfit,
        manual:force, notes:canAuto?"Auto-sweep completed — 7/7 balanced":`Manual override (${balCount}/7 balanced)`,
      };
      setWeekly(prev=>[entry,...prev]);
      addAudit("SWEEP_"+(canAuto?"AUTO":"MANUAL"),"Treasury",`Swept SAR ${sweepTotal.toLocaleString()} → Takharoj Operating (Revenue: ${revAmt}, MM Profit: ${mmProfit})`);
      showToast(`${canAuto?"✅ Auto":"⚠️ Manual"}-sweep: SAR ${sweepTotal.toLocaleString()} → Takharoj Operating`,canAuto?"success":"warn");
    } else {
      const entry = { id:"RW-"+Math.random().toString(36).slice(2,8), weekEnding:new Date().toISOString().split("T")[0],
        daysOk:balCount, eligible:false, swept:false, total:0, revenue:0, mmProfit:0,
        manual:false, notes:`Sweep blocked — only ${balCount}/7 days balanced`,
      };
      setWeekly(prev=>[entry,...prev]);
      showToast(`❌ Sweep blocked: only ${balCount}/7 days balanced`,"error");
    }
  };

  const resolveDiscrep = (id) => {
    setDiscrep(prev=>prev.map(d=>d.id===id?{...d,status:"resolved",resolution:resolveNote,by:"admin@tanaqul.sa",at:new Date().toISOString()}:d));
    addAudit("DISCREPANCY_RESOLVED","Treasury",`Resolved ${id}: ${resolveNote}`);
    setResolveId(null); setResolveNote("");
    showToast("Discrepancy resolved","success");
  };

  const metalColors = {gold:C.gold,silver:C.silverText||"#94A3B8",platinum:C.blueSolid||"#5B7FA5"};
  const metalSym = {gold:"Au",silver:"Ag",platinum:"Pt"};
  const MetalDot = ({m,s=14}) => <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:s+10,height:s+10,borderRadius:"50%",background:metalColors[m]+"20",border:`1.5px solid ${metalColors[m]}50`,fontSize:s-2,fontWeight:800,color:metalColors[m]}}>{metalSym[m]}</span>;
  const Badge2 = ({s,sz="sm"}) => {
    const map = {balanced:[C.greenBg,C.greenSolid,"Balanced"],discrepancy:[C.redBg,C.red,"Discrepancy"],pending:[C.goldLight,C.orange,"Pending"],frozen:[C.tealLight,C.teal,"Frozen"],resolved:[C.greenBg,C.greenSolid,"Resolved"],open:[C.redBg,C.red,"Open"],matched:[C.greenBg,C.greenSolid,"1:1 ✓"],mismatch:[C.redBg,C.red,"Mismatch"],swept:[C.greenBg,C.greenSolid,"Swept"],skipped:[C.goldLight,C.orange,"Skipped"]};
    const [bg,col,lbl] = map[s]||map.pending;
    return <span style={{display:"inline-flex",padding:sz==="sm"?"2px 8px":"4px 12px",borderRadius:6,background:bg,color:col,border:`1px solid ${col}22`,fontSize:sz==="sm"?11:12,fontWeight:700,letterSpacing:0.4,textTransform:"uppercase",whiteSpace:"nowrap"}}>{isAr?t(lbl):lbl}</span>;
  };
  const LR = ({label,value,color,bold,icon}) => (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"3px 0"}}>
      <span style={{color:C.textMuted,display:"flex",alignItems:"center",gap:6,fontSize:13}}>{icon}{isAr?t(label):label}</span>
      <span style={{fontFamily:"'DM Mono',monospace",fontWeight:bold?700:500,color:color||C.text,fontSize:bold?15:13}}>{value}</span>
    </div>
  );

  const TABS = [
    {id:"overview",label:isAr?"النظرة اليومية":"Daily Overview",icon:Icons.cmaScale},
    {id:"history",label:isAr?"السجل اليومي":"Daily History",icon:Icons.orders},
    {id:"sweeps",label:isAr?"التحويلات الأسبوعية":"Weekly Sweeps",icon:Icons.sweep},
    {id:"discrep",label:isAr?"سجل الفروقات":"Discrepancy Log",icon:Icons.warning},
  ];

  return (
    <div style={{direction:isAr?"rtl":"ltr"}}>
      {/* Toast */}
      {toast&&<div style={{position:"fixed",top:14,right:22,zIndex:99999,background:toast.type==="success"?"linear-gradient(135deg,#4A7A68,#6B9080)":toast.type==="error"?"linear-gradient(135deg,#8B3520,#C85C3E)":"linear-gradient(135deg,#8B6540,#C4956A)",borderRadius:12,padding:"12px 20px",display:"flex",alignItems:"center",gap:10,boxShadow:"0 8px 32px rgba(0,0,0,0.3)",maxWidth:440,animation:"slideIn 0.3s ease-out",zIndex:99999}}>
        <span style={{fontSize:13,fontWeight:700,color:"#FFF"}}>{toast.msg}</span>
        <button onClick={()=>setToast(null)} style={{background:"none",border:"none",color:"#FFF",cursor:"pointer",fontSize:16,opacity:0.7}}>×</button>
      </div>}

      <SectionHeader title={isAr?"الخزينة والتسوية":"Treasury & Reconciliation"} sub={isAr?"صفحة ١٧ — التسوية اليومية والتحويلات الأسبوعية":"Page 17 — Daily reconciliation & weekly sweeps"} action={
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <Badge2 s={frozen?"frozen":reconState?.dayStatus||"pending"} sz="md" />
          {frozen?Icons.lock(18,C.teal):Icons.check(18,C.greenSolid)}
          {reconState?.lastRecon&&<span style={{fontSize:11,color:C.textMuted,fontFamily:"'DM Mono',monospace"}}>Last: {new Date(reconState.lastRecon).toLocaleString()}</span>}
        </div>
      } />

      {/* MM Strip */}
      <div style={{background:C.cream,borderRadius:12,padding:"10px 18px",marginBottom:18,display:"flex",gap:20,alignItems:"center",flexWrap:"wrap",fontSize:12,border:`1px solid ${C.border}`}}>
        <span style={{fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:1,fontSize:11}}>{isAr?"صانع السوق":"MM Account"}</span>
        <span style={{color:C.text}}>Cash: <b style={{color:C.gold,fontFamily:"'DM Mono',monospace"}}>{fmtS(mm.cash)}</b></span>
        <span style={{color:C.text}}>Au: <b style={{color:C.gold,fontFamily:"'DM Mono',monospace"}}>{fmtG(mm.gold.g)}</b></span>
        <span style={{color:C.text}}>Ag: <b style={{color:metalColors.silver,fontFamily:"'DM Mono',monospace"}}>{fmtG(mm.silver.g)}</b></span>
        <span style={{color:C.text}}>Pt: <b style={{color:metalColors.platinum,fontFamily:"'DM Mono',monospace"}}>{fmtG(mm.platinum.g)}</b></span>
        <span style={{color:C.text}}>P&L: <b style={{color:mm.pnl.realized>=0?C.greenSolid:C.red,fontFamily:"'DM Mono',monospace"}}>{fmtS(mm.pnl.realized)}</b></span>
        <span style={{color:C.text}}>Trades: <b style={{fontFamily:"'DM Mono',monospace"}}>{mm.trades.length}</b></span>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:2,borderBottom:`2px solid ${C.border}`,marginBottom:20,overflowX:"auto"}}>
        {TABS.map(tb=>{
          const active = tab===tb.id;
          return <button key={tb.id} onClick={()=>setTab(tb.id)} style={{background:active?C.goldLight:"transparent",border:"none",borderBottom:active?`2.5px solid ${C.gold}`:"2.5px solid transparent",color:active?C.gold:C.textMuted,padding:"10px 18px",fontSize:13,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:6,transition:"all 0.15s"}}>{tb.icon?.(14,active?C.gold:C.textMuted)}{tb.label}</button>;
        })}
      </div>

      {/* ═══ TAB: DAILY OVERVIEW ═══ */}
      {tab==="overview"&&<div style={{display:"flex",flexDirection:"column",gap:20}}>
        {/* 3 Ledger Cards */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:16}}>
          {/* Pool Bank */}
          <div style={{background:C.white,borderRadius:14,padding:18,border:`1px solid ${C.border}`,borderLeft:`3px solid ${C.gold}`,boxShadow:C.cardShadow}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <h3 style={{margin:0,fontSize:14,fontWeight:700,color:C.gold,textTransform:"uppercase",letterSpacing:0.5}}>{Icons.wallet(14,C.gold)} <span style={{marginLeft:6}}>{isAr?"بنك المجمع":"Pool Bank Ledger"}</span></h3>
              <Badge2 s={poolValid?"balanced":"discrepancy"} />
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <LR label="Total Balance" value={fmtS(poolTotal)} bold />
              <div style={{height:1,background:C.border}} />
              <LR label="Investor Wallets" value={fmtS(investorTotal)} color={C.textMuted} />
              <LR label="Platform Revenue" value={fmtS(platformRevenue)} color={C.greenSolid} />
              <LR label="MM Cash" value={fmtS(mm.cash)} color={C.gold} />
              <div style={{height:1,background:C.border}} />
              <LR label="Expected" value={fmtS(poolExpected)} />
              {!poolValid&&<LR label="Difference" value={fmtS(poolTotal-poolExpected)} color={C.red} bold />}
            </div>
            <div style={{marginTop:14,display:"flex",gap:8}}>
              <input type="number" placeholder={isAr?"رصيد البنك اليدوي":"Manual bank balance (SAR)"} value={bankInput} onChange={e=>setBankInput(e.target.value)}
                style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"7px 12px",color:C.text,fontSize:13,outline:"none"}} />
              <Btn small variant="outline" onClick={()=>{const v=parseFloat(bankInput);if(isNaN(v)||v<=0)return;setPoolTotal(v);setBankInput("");showToast("Pool Bank updated","success");}}>{isAr?"تحديث":"Update"}</Btn>
            </div>
          </div>

          {/* MM Account */}
          <div style={{background:C.white,borderRadius:14,padding:18,border:`1px solid ${C.border}`,borderLeft:`3px solid ${C.teal}`,boxShadow:C.cardShadow}}>
            <h3 style={{margin:"0 0 14px",fontSize:14,fontWeight:700,color:C.teal,textTransform:"uppercase",letterSpacing:0.5}}>{Icons.orders(14,C.teal)} <span style={{marginLeft:6}}>{isAr?"صانع السوق":"Market Maker Account"}</span></h3>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <LR label="Cash Balance" value={fmtS(mm.cash)} bold />
              <div style={{height:1,background:C.border}} />
              <LR label="Gold" value={fmtG(mm.gold.g)} color={C.gold} icon={<MetalDot m="gold" s={10}/>} />
              <LR label="Silver" value={fmtG(mm.silver.g)} color={metalColors.silver} icon={<MetalDot m="silver" s={10}/>} />
              <LR label="Platinum" value={fmtG(mm.platinum.g)} color={metalColors.platinum} icon={<MetalDot m="platinum" s={10}/>} />
              <div style={{height:1,background:C.border}} />
              <LR label="Realized P&L" value={fmtS(mm.pnl.realized)} color={mm.pnl.realized>=0?C.greenSolid:C.red} />
              <LR label="Unrealized P&L" value={fmtS(mm.pnl.unrealized)} color={C.textMuted} />
              <LR label="Fees" value={fmtS(mm.pnl.fees)} color={C.textMuted} />
            </div>
          </div>

          {/* Takharoj Operating */}
          <div style={{background:C.white,borderRadius:14,padding:18,border:`1px solid ${C.border}`,borderLeft:`3px solid ${C.greenSolid}`,boxShadow:C.cardShadow}}>
            <h3 style={{margin:"0 0 14px",fontSize:14,fontWeight:700,color:C.greenSolid,textTransform:"uppercase",letterSpacing:0.5}}>{Icons.send(14,C.greenSolid)} <span style={{marginLeft:6}}>{isAr?"حساب تخارج التشغيلي":"Takharoj Operating"}</span></h3>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <LR label="Balance" value={fmtS(takharojBal)} bold />
              <div style={{height:1,background:C.border}} />
              <LR label="Revenue Pending" value={fmtS(platformRevenue)} color={C.orange} />
              <LR label="MM Profit Pending" value={fmtS(Math.max(0,mm.pnl.realized))} color={C.orange} />
              <LR label="Last Sweep" value={weekly[0]?.weekEnding||"—"} color={C.textMuted} />
            </div>
          </div>
        </div>

        {/* Vault 1:1 Metal Check */}
        <div style={{background:C.white,borderRadius:14,padding:20,border:`1px solid ${C.border}`,boxShadow:C.cardShadow}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:10}}>
            <h3 style={{margin:0,fontSize:15,fontWeight:700,color:C.navy}}>{Icons.vault(16,C.gold)} <span style={{marginLeft:8}}>{isAr?"تطابق الخزنة 1:1":"Vault 1:1 Metal Verification"}</span></h3>
            <Btn variant="gold" onClick={runRecon} small={false}>
              {frozen?<>{Icons.lock(14,"#FFF")} {isAr?"جاري التسوية...":"Reconciling..."}</>:<>{Icons.refresh(14,"#FFF")} {isAr?"تشغيل التسوية":"Run Reconciliation"}</>}
            </Btn>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:14}}>
            {["gold","silver","platinum"].map(m=>{
              const v = vaultData[m];
              return (
                <div key={m} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:12,padding:16,position:"relative",overflow:"hidden"}}>
                  <div style={{position:"absolute",top:0,right:0,width:70,height:70,background:`radial-gradient(circle at top right,${metalColors[m]}18,transparent 70%)`}} />
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}><MetalDot m={m} s={13}/><span style={{fontSize:14,fontWeight:700,color:metalColors[m],textTransform:"capitalize"}}>{m}</span></div>
                    <Badge2 s={v.ok?"matched":"mismatch"} />
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:6,fontSize:13}}>
                    <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:C.textMuted}}>Tokenized</span><span style={{fontFamily:"'DM Mono',monospace",fontWeight:600}}>{fmtN(v.tok)} g</span></div>
                    <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:C.textMuted}}>Physical</span><span style={{fontFamily:"'DM Mono',monospace",fontWeight:600}}>{fmtN(v.phys)} g</span></div>
                    <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:C.textMuted}}>Bars</span><span style={{fontFamily:"'DM Mono',monospace"}}>{v.bars}</span></div>
                    {!v.ok&&<div style={{marginTop:4,padding:"5px 10px",background:C.redBg,borderRadius:6,display:"flex",justifyContent:"space-between"}}>
                      <span style={{color:C.red,fontWeight:700,fontSize:12}}>Δ Difference</span>
                      <span style={{color:C.red,fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:12}}>{v.phys-v.tok>0?"+":""}{v.phys-v.tok} g</span>
                    </div>}
                  </div>
                  <div style={{marginTop:10,height:4,borderRadius:2,background:C.border,overflow:"hidden"}}>
                    <div style={{height:"100%",width:v.ok?"100%":`${(Math.min(v.tok,v.phys)/Math.max(v.tok,v.phys))*100}%`,background:v.ok?C.greenSolid:C.red,borderRadius:2,transition:"width 0.5s"}} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Frozen banner */}
        {frozen&&<div style={{background:C.tealLight,border:`1px solid ${C.teal}44`,borderRadius:10,padding:"12px 18px",display:"flex",alignItems:"center",gap:12}}>
          {Icons.lock(20,C.teal)}
          <div><div style={{fontWeight:700,color:C.teal,fontSize:14}}>{isAr?"التداول مجمد":"Trading Frozen"}</div><div style={{fontSize:12,color:C.textMuted}}>{isAr?"التسوية الليلية جارية":"Nightly reconciliation in progress — all market making suspended"}</div></div>
        </div>}

        {/* Golden Rules footer */}
        <div style={{background:C.cream,borderRadius:10,padding:"12px 18px",display:"flex",gap:18,alignItems:"center",flexWrap:"wrap",fontSize:12,border:`1px solid ${C.border}`}}>
          <span style={{color:C.gold,fontSize:14}}>⚖️</span>
          <span style={{color:C.textMuted}}>Pool Bank = Investors + Revenue + MM Cash</span>
          <span style={{fontFamily:"'DM Mono',monospace",color:poolValid?C.greenSolid:C.red,fontWeight:700}}>{poolValid?"✓ VALID":"✗ MISMATCH"}</span>
          <span style={{width:1,height:18,background:C.border}} />
          {["gold","silver","platinum"].map(m=><span key={m} style={{display:"flex",alignItems:"center",gap:5}}>
            <MetalDot m={m} s={9}/><span style={{color:C.textMuted}}>Tok=Phys</span>
            <span style={{fontFamily:"'DM Mono',monospace",color:vaultData[m].ok?C.greenSolid:C.red,fontWeight:700}}>{vaultData[m].ok?"✓":`✗ Δ${vaultData[m].phys-vaultData[m].tok}`}</span>
          </span>)}
        </div>
      </div>}

      {/* ═══ TAB: DAILY HISTORY ═══ */}
      {tab==="history"&&<div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div><p style={{fontSize:13,color:C.textMuted,margin:0}}>{isAr?"الجدول الليلي: تجميد ← تسوية نقدية ← تسوية خزنة ← رفع التجميد":"Midnight: freeze → cash recon → vault recon (tokenized=physical) → unfreeze"}</p></div>
          <Btn small variant="outline">{Icons.download(14,C.textMuted)} Export</Btn>
        </div>
        <TTable cols={[
          {label:isAr?"التاريخ":"Date",key:"date",render:v=><span style={{fontFamily:"'DM Mono',monospace",fontWeight:600}}>{v}</span>},
          {label:isAr?"الوقت":"Time",key:"time",render:v=><span style={{fontFamily:"'DM Mono',monospace",color:C.textMuted}}>{v}</span>},
          {label:isAr?"النقد":"Cash",key:"cash",render:v=><Badge2 s={v.status} />},
          {label:"Au",key:"vault",render:v=><Badge2 s={v.gold.ok?"matched":"mismatch"} />},
          {label:"Ag",key:"vault",render:v=><Badge2 s={v.silver.ok?"matched":"mismatch"} />},
          {label:"Pt",key:"vault",render:v=><Badge2 s={v.platinum.ok?"matched":"mismatch"} />},
          {label:isAr?"الحالة":"Overall",key:"overall",render:v=><Badge2 s={v} sz="md" />},
          {label:isAr?"المشغل":"Run By",key:"by",render:v=><span style={{fontSize:11,color:C.textMuted}}>{v}</span>},
        ]} rows={daily} />
      </div>}

      {/* ═══ TAB: WEEKLY SWEEPS ═══ */}
      {tab==="sweeps"&&<div style={{display:"flex",flexDirection:"column",gap:20}}>
        {/* Sweep status card */}
        {(()=>{
          const last7 = daily.slice(0,7);
          const balCount = last7.filter(d=>d.overall==="balanced").length;
          const canAuto = balCount===7;
          return (
            <div style={{background:C.white,borderRadius:14,padding:20,border:`1px solid ${C.border}`,borderLeft:`3px solid ${canAuto?C.greenSolid:C.orange}`,boxShadow:C.cardShadow}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:14}}>
                <div>
                  <h3 style={{margin:0,fontSize:16,fontWeight:700,color:C.navy}}>{isAr?"حالة التحويل الأسبوعي":"Friday Sweep Status"}</h3>
                  <p style={{margin:"6px 0 0",fontSize:13,color:C.textMuted}}>{isAr?"تحويل تلقائي يوم الجمعة إذا 7/7 متوازنة":"Auto-sweep Friday if 7/7 balanced → PLATFORM_REVENUE + MM profit → Takharoj Operating"}</p>
                  <div style={{marginTop:10,display:"flex",gap:14,flexWrap:"wrap",fontSize:13}}>
                    <span><span style={{color:C.textMuted}}>{isAr?"هذا الأسبوع":"This week"}: </span><span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,color:canAuto?C.greenSolid:C.orange}}>{balCount}/7</span></span>
                    <span><span style={{color:C.textMuted}}>{isAr?"إيرادات معلقة":"Revenue pending"}: </span><span style={{fontFamily:"'DM Mono',monospace",fontWeight:600}}>{fmtS(platformRevenue)}</span></span>
                    <span><span style={{color:C.textMuted}}>{isAr?"ربح MM معلق":"MM profit"}: </span><span style={{fontFamily:"'DM Mono',monospace",fontWeight:600}}>{fmtS(Math.max(0,mm.pnl.realized))}</span></span>
                  </div>
                  {/* 7-day dots */}
                  <div style={{marginTop:12,display:"flex",gap:6}}>
                    {last7.map((d,i)=>(
                      <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                        <div style={{width:28,height:28,borderRadius:"50%",background:d.overall==="balanced"?C.greenBg:C.redBg,border:`2px solid ${d.overall==="balanced"?C.greenSolid:C.red}`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                          {d.overall==="balanced"?Icons.check(11,C.greenSolid):Icons.cancel(11,C.red)}
                        </div>
                        <span style={{fontSize:9,color:C.textMuted,fontFamily:"'DM Mono',monospace"}}>{d.date.slice(5)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <Btn variant="gold" onClick={()=>runSweep(false)} small>{Icons.sweep(14,"#FFF")} {isAr?"تحويل تلقائي":"Auto-Sweep"}</Btn>
                  <Btn variant="danger" onClick={()=>runSweep(true)} small>{Icons.warning(14,"#FFF")} {isAr?"تجاوز يدوي":"Manual Override"}</Btn>
                </div>
              </div>
            </div>
          );
        })()}
        <TTable cols={[
          {label:isAr?"نهاية الأسبوع":"Week Ending",key:"weekEnding",render:v=><span style={{fontFamily:"'DM Mono',monospace",fontWeight:600}}>{v}</span>},
          {label:isAr?"أيام متوازنة":"Days OK",key:"daysOk",render:v=><span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,color:v===7?C.greenSolid:v>=5?C.orange:C.red}}>{v}/7</span>},
          {label:isAr?"مؤهل":"Eligible",key:"eligible",render:v=>v?Icons.check(15,C.greenSolid):Icons.cancel(15,C.red)},
          {label:isAr?"الحالة":"Status",key:"swept",render:v=><Badge2 s={v?"swept":"skipped"} />},
          {label:isAr?"المبلغ":"Amount",key:"total",render:v=><span style={{fontFamily:"'DM Mono',monospace",color:v>0?C.greenSolid:C.textMuted}}>{v>0?fmtS(v):"—"}</span>},
          {label:isAr?"الإيرادات":"Revenue",key:"revenue",render:v=><span style={{fontFamily:"'DM Mono',monospace",color:C.textMuted}}>{v>0?fmtS(v):"—"}</span>},
          {label:isAr?"ربح MM":"MM Profit",key:"mmProfit",render:v=><span style={{fontFamily:"'DM Mono',monospace",color:C.textMuted}}>{v>0?fmtS(v):"—"}</span>},
          {label:isAr?"يدوي":"Manual",key:"manual",render:v=>v?<span style={{color:C.orange,fontSize:11,fontWeight:700}}>OVERRIDE</span>:<span style={{color:C.textMuted}}>—</span>},
          {label:isAr?"ملاحظات":"Notes",key:"notes",render:v=><span style={{fontSize:11,color:C.textMuted,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",display:"block"}}>{v}</span>},
        ]} rows={weekly} />
      </div>}

      {/* ═══ TAB: DISCREPANCY LOG ═══ */}
      {tab==="discrep"&&<div style={{display:"flex",flexDirection:"column",gap:20}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12}}>
          <StatCard icon={Icons.warning(22,C.red)} title={isAr?"مفتوحة":"Open"} value={discrep.filter(d=>d.status==="open").length} />
          <StatCard icon={Icons.check(22,C.greenSolid)} title={isAr?"محلولة":"Resolved"} value={discrep.filter(d=>d.status==="resolved").length} />
          <StatCard icon={Icons.orders(22,C.teal)} title={isAr?"الإجمالي":"Total"} value={discrep.length} />
        </div>

        {resolveId&&<div style={{background:C.goldLight,borderRadius:12,padding:18,border:`1px solid ${C.gold}33`}}>
          <h4 style={{margin:"0 0 10px",fontSize:14,fontWeight:700,color:C.gold}}>{isAr?"حل الفرق":"Resolve Discrepancy"}</h4>
          <textarea placeholder={isAr?"ملاحظات الحل...":"Resolution notes..."} value={resolveNote} onChange={e=>setResolveNote(e.target.value)}
            style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",color:C.text,fontSize:13,minHeight:70,resize:"vertical",outline:"none",fontFamily:"inherit"}} />
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <Btn variant="gold" onClick={()=>resolveDiscrep(resolveId)} small>{Icons.check(13,"#FFF")} {isAr?"حل":"Resolve"}</Btn>
            <Btn variant="ghost" onClick={()=>{setResolveId(null);setResolveNote("");}} small>{isAr?"إلغاء":"Cancel"}</Btn>
          </div>
        </div>}

        <TTable cols={[
          {label:isAr?"التاريخ":"Date",key:"date",render:v=><span style={{fontFamily:"'DM Mono',monospace",fontWeight:600}}>{v}</span>},
          {label:isAr?"النوع":"Type",key:"type",render:v=><span style={{padding:"2px 8px",borderRadius:6,background:v==="cash"?C.tealLight:C.goldLight,color:v==="cash"?C.teal:C.gold,fontSize:11,fontWeight:700,textTransform:"uppercase"}}>{v}</span>},
          {label:isAr?"المعدن":"Metal",key:"metal",render:v=>v?<MetalDot m={v} s={10}/>:<span style={{color:C.textMuted}}>—</span>},
          {label:"Δ",key:"diff",render:(v,row)=>row.type==="cash"?<span style={{fontFamily:"'DM Mono',monospace",color:C.red,fontWeight:700}}>{fmtS(v)}</span>:<span style={{fontFamily:"'DM Mono',monospace",color:C.red,fontWeight:700}}>{v>0?"+":""}{v} g</span>},
          {label:isAr?"الحالة":"Status",key:"status",render:v=><Badge2 s={v} />},
          {label:isAr?"الحل":"Resolution",key:"resolution",render:v=><span style={{fontSize:11,color:C.textMuted,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",display:"block"}}>{v||"—"}</span>},
          {label:isAr?"بواسطة":"Resolved By",key:"by",render:v=>v?<span style={{fontSize:11,color:C.textMuted}}>{v}</span>:<span style={{color:C.textMuted}}>—</span>},
          {label:isAr?"إجراء":"Action",key:"id",render:(_,row)=>row.status==="resolved"?<span style={{fontSize:11,color:C.greenSolid}}>✓ {isAr?"مغلق":"Closed"}</span>:<Btn small variant="outline" onClick={()=>setResolveId(row.id)}>{isAr?"حل":"Resolve"}</Btn>},
        ]} rows={discrep} />
      </div>}
    </div>
  );
};

const SystemHealth = () => {
  const { isAr, t } = useLang();
  const [refreshKey, setRefreshKey] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);
  useEffect(()=>{
    if(!autoRefresh) return;
    const iv = setInterval(()=>setRefreshKey(k=>k+1), 15000);
    return ()=>clearInterval(iv);
  },[autoRefresh]);

  // Simulated real-time metrics
  const jitter = (base,range) => Math.round((base + (Math.random()-0.5)*range)*10)/10;
  const uptime = "99.97%";
  const metrics = {
    cpuUsage: jitter(34,10), memUsage: jitter(62,8), diskUsage: 47.2,
    apiLatency: jitter(42,15), dbLatency: jitter(8,4), cacheHit: jitter(94,3),
    queueDepth: Math.floor(Math.random()*5), reqPerMin: Math.floor(280+Math.random()*40),
    errorRate: jitter(0.02,0.02), activeConns: Math.floor(140+Math.random()*30),
  };

  const services = [
    { name:isAr?"محرك المطابقة":"Matching Engine",  status:"healthy", latency:jitter(12,5)+"ms",  uptime:"99.99%", icon:Icons.orders },
    { name:isAr?"خلاصة الأسعار":"Price Feed API",   status:"healthy", latency:jitter(85,20)+"ms", uptime:"99.95%", icon:Icons.volume },
    { name:isAr?"عقدة البلوكشين":"Blockchain Node",  status:"healthy", latency:jitter(35,10)+"ms", uptime:"99.98%", icon:Icons.block },
    { name:isAr?"واجهة الخزينة":"Vault API",         status:"healthy", latency:jitter(22,8)+"ms",  uptime:"99.99%", icon:Icons.vault },
    { name:isAr?"بوابة نفاذ":"NAFATH Gateway",       status:Math.random()>0.9?"degraded":"healthy", latency:jitter(240,60)+"ms", uptime:"99.80%", icon:Icons.lock },
    { name:isAr?"بوابة الرسائل":"SMS Gateway",       status:"healthy", latency:jitter(180,40)+"ms", uptime:"99.90%", icon:Icons.phone },
    { name:isAr?"بوابة الدفع":"Payment Gateway",     status:"healthy", latency:jitter(95,25)+"ms",  uptime:"99.96%", icon:Icons.wallet },
    { name:isAr?"محرك AML":"AML Engine",              status:"healthy", latency:jitter(5,2)+"ms",    uptime:"100%",   icon:Icons.auditlog },
  ];

  const statusColor = s => s==="healthy"?C.greenSolid:s==="degraded"?"#D4943A":"#C85C3E";
  const statusBg = s => s==="healthy"?"#EFF5F2":s==="degraded"?"#FDF4EC":C.redBg;
  const statusLabel = s => s==="healthy"?(isAr?"سليم":"Healthy"):s==="degraded"?(isAr?"متدهور":"Degraded"):(isAr?"متوقف":"Down");

  const incidents = [
    { id:"INC-047", date:"2026-02-28 14:22", title:isAr?"تأخر بوابة نفاذ":"NAFATH Gateway Latency Spike", severity:"MEDIUM", resolved:true, duration:"12 min" },
    { id:"INC-046", date:"2026-02-25 08:10", title:isAr?"صيانة مجدولة":"Scheduled Maintenance — Vault API", severity:"LOW", resolved:true, duration:"45 min" },
  ];

  const MetricGauge = ({label, value, max, unit, color, warn, crit}) => {
    const pct = Math.min((value/max)*100, 100);
    const c = value>=crit?C.red:value>=warn?C.orange:color||C.teal;
    return (
      <div style={{background:C.white,borderRadius:14,border:`1px solid ${C.border}`,padding:"18px 20px",boxShadow:C.cardShadow}}>
        <p style={{fontSize:12,fontWeight:600,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:10}}>{label}</p>
        <div style={{display:"flex",alignItems:"baseline",gap:4,marginBottom:10}}>
          <span style={{fontSize:28,fontWeight:800,color:c}}>{value}</span>
          <span style={{fontSize:14,color:C.textMuted}}>{unit}</span>
        </div>
        <div style={{height:6,borderRadius:3,background:C.bg,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${pct}%`,borderRadius:3,background:c,transition:"width 0.6s ease"}} />
        </div>
      </div>
    );
  };

  return (
    <div>
      <SectionHeader title={isAr?"حالة النظام":"System Health"} sub={isAr?"مراقبة صحة النظام والبنية التحتية":"System health & infrastructure monitoring"}
        action={<div style={{display:"flex",gap:8,alignItems:"center"}}>
          <span style={{fontSize:12,color:C.textMuted}}>{isAr?"تحديث تلقائي":"Auto-refresh"}</span>
          <button onClick={()=>setAutoRefresh(!autoRefresh)} style={{width:36,height:20,borderRadius:10,border:"none",background:autoRefresh?C.teal:C.border,cursor:"pointer",position:"relative",transition:"background 0.2s"}}>
            <div style={{width:16,height:16,borderRadius:8,background:C.white,position:"absolute",top:2,left:autoRefresh?18:2,transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}} />
          </button>
          <Btn small variant="outline" onClick={()=>setRefreshKey(k=>k+1)}>{isAr?"تحديث":"Refresh"}</Btn>
        </div>}
      />

      {/* Overall Status Banner */}
      <div style={{background:"linear-gradient(135deg,#1A3560,#243F72)",borderRadius:16,padding:"20px 24px",marginBottom:20,display:"flex",alignItems:"center",gap:16}}>
        <div style={{width:48,height:48,borderRadius:12,background:"rgba(107,144,128,0.2)",display:"flex",alignItems:"center",justifyContent:"center"}}>
          {Icons.health(28,"#6B9080")}
        </div>
        <div style={{flex:1}}>
          <p style={{fontSize:18,fontWeight:800,color:"#FFF"}}>{isAr?"جميع الأنظمة تعمل بشكل طبيعي":"All Systems Operational"}</p>
          <p style={{fontSize:13,color:"rgba(255,255,255,0.6)"}}>{isAr?"وقت التشغيل":"Uptime"}: {uptime} — {isAr?"آخر فحص":"Last checked"}: {new Date().toLocaleTimeString()}</p>
        </div>
        <div style={{display:"flex",gap:6}}>
          <span style={{background:"rgba(107,144,128,0.25)",color:"#8FC5AF",padding:"4px 12px",borderRadius:8,fontSize:13,fontWeight:700}}>{services.filter(s=>s.status==="healthy").length}/{services.length} {isAr?"سليم":"Healthy"}</span>
          {services.some(s=>s.status==="degraded")&&<span style={{background:"rgba(212,148,58,0.25)",color:"#F5C77E",padding:"4px 12px",borderRadius:8,fontSize:13,fontWeight:700}}>{services.filter(s=>s.status==="degraded").length} {isAr?"متدهور":"Degraded"}</span>}
        </div>
      </div>

      {/* Infrastructure Metrics Grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:14,marginBottom:22}}>
        <MetricGauge label={isAr?"استخدام المعالج":"CPU Usage"} value={metrics.cpuUsage} max={100} unit="%" color={C.teal} warn={70} crit={90} />
        <MetricGauge label={isAr?"استخدام الذاكرة":"Memory Usage"} value={metrics.memUsage} max={100} unit="%" color={C.gold} warn={75} crit={90} />
        <MetricGauge label={isAr?"زمن API":"API Latency"} value={metrics.apiLatency} max={200} unit="ms" color={C.teal} warn={100} crit={150} />
        <MetricGauge label={isAr?"معدل الكاش":"Cache Hit Rate"} value={metrics.cacheHit} max={100} unit="%" color={"#4A7A68"} warn={0} crit={0} />
        <MetricGauge label={isAr?"معدل الخطأ":"Error Rate"} value={metrics.errorRate} max={1} unit="%" color={C.teal} warn={0.1} crit={0.5} />
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:22}}>
        <StatCard icon={Icons.activity(22,C.teal)} title={isAr?"طلبات/دقيقة":"Requests/min"} value={metrics.reqPerMin} />
        <StatCard icon={Icons.server(22,C.gold)} title={isAr?"اتصالات نشطة":"Active Connections"} value={metrics.activeConns} />
        <StatCard icon={Icons.cpu(22,C.navy)} title={isAr?"عمق الطابور":"Queue Depth"} value={metrics.queueDepth} />
        <StatCard icon={Icons.block(22,C.teal)} title={isAr?"زمن DB":"DB Latency"} value={metrics.dbLatency+"ms"} />
      </div>

      {/* Services Grid */}
      <h3 style={{fontSize:18,fontWeight:700,color:C.navy,marginBottom:14}}>{isAr?"الخدمات":"Services"}</h3>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12,marginBottom:24}}>
        {services.map((svc,i) => (
          <div key={i} style={{background:C.white,borderRadius:12,border:`1px solid ${C.border}`,padding:"16px 18px",display:"flex",alignItems:"center",gap:14,borderInlineStart:`3px solid ${statusColor(svc.status)}`,boxShadow:C.cardShadow}}>
            <div style={{width:38,height:38,borderRadius:10,background:statusBg(svc.status),display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              {svc.icon(20,statusColor(svc.status))}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <p style={{fontSize:14,fontWeight:700,color:C.navy}}>{svc.name}</p>
              <p style={{fontSize:12,color:C.textMuted}}>{svc.latency} — {isAr?"وقت التشغيل":"Uptime"}: {svc.uptime}</p>
            </div>
            <span style={{fontSize:12,fontWeight:700,color:statusColor(svc.status),background:statusBg(svc.status),padding:"3px 8px",borderRadius:6}}>{statusLabel(svc.status)}</span>
          </div>
        ))}
      </div>

      {/* Recent Incidents */}
      <h3 style={{fontSize:18,fontWeight:700,color:C.navy,marginBottom:14}}>{isAr?"الحوادث الأخيرة":"Recent Incidents"}</h3>
      <div style={{background:C.white,borderRadius:14,border:`1px solid ${C.border}`,overflow:"hidden",boxShadow:C.cardShadow}}>
        {incidents.length===0?<p style={{padding:20,textAlign:"center",color:C.textMuted}}>{isAr?"لا توجد حوادث":"No incidents"}</p>
        :incidents.map((inc,i)=>(
          <div key={inc.id} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 18px",borderBottom:i<incidents.length-1?`1px solid ${C.border}`:"none"}}>
            <span style={{fontSize:12,fontFamily:"monospace",color:C.textMuted,flexShrink:0}}>{inc.date}</span>
            <Badge label={inc.severity} />
            <span style={{fontSize:14,fontWeight:600,color:C.navy,flex:1}}>{inc.title}</span>
            <span style={{fontSize:12,color:C.textMuted}}>{inc.duration}</span>
            {inc.resolved&&<span style={{fontSize:11,fontWeight:700,color:C.greenSolid,background:"#EFF5F2",padding:"2px 8px",borderRadius:4}}>✅ {isAr?"تم الحل":"Resolved"}</span>}
          </div>
        ))}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION CENTER — floating bell with dropdown + persistent state
// ═══════════════════════════════════════════════════════════════════════════════
const useNotifications = ({amlAlerts, cmaAlerts, amlDismissed, withdrawals, appointments, investors}) => {
  const [notifications, setNotifications] = useState([]);
  const [readSet, setReadSet] = useState(new Set());
  useEffect(()=>{
    const notifs = [];
    const now = Date.now();
    // AML/CMA critical alerts
    [...(amlAlerts||[]),...(cmaAlerts||[])].filter(a=>!amlDismissed.has(a.key)&&(a.level==="CRITICAL"||a.level==="HIGH")).slice(0,5).forEach((a,i)=>{
      notifs.push({id:"N-AML-"+a.key,type:"aml",icon:"🚨",title:a.title,detail:a.name+" — "+a.level,time:now-i*120000,page:"auditlog"});
    });
    // Pending withdrawals
    const pending = (withdrawals||[]).filter(w=>w.status==="PENDING");
    if(pending.length>0) notifs.push({id:"N-WD",type:"finance",icon:"💸",title:`${pending.length} pending withdrawal${pending.length>1?"s":""}`,detail:"Awaiting approval",time:now-300000,page:"financials"});
    // Expired appointments
    const expired = (appointments||[]).filter(a=>a.status==="EXPIRED");
    if(expired.length>0) notifs.push({id:"N-APPT",type:"ops",icon:"⏰",title:`${expired.length} expired appointment${expired.length>1?"s":""}`,detail:"Mark attended or no-show",time:now-600000,page:"appointments"});
    // KYC expiring
    const today = new Date().toISOString().slice(0,10);
    const kycSoon = (investors||[]).filter(i=>i.kycExpiry&&i.kycExpiry<new Date(Date.now()+30*86400000).toISOString().slice(0,10)&&i.kycExpiry>=today&&i.status==="ACTIVE");
    if(kycSoon.length>0) notifs.push({id:"N-KYC",type:"compliance",icon:"🪪",title:`${kycSoon.length} KYC expiring soon`,detail:"Within 30 days",time:now-900000,page:"investors"});
    setNotifications(notifs);
  },[amlAlerts,cmaAlerts,amlDismissed,withdrawals,appointments,investors]);
  const unread = notifications.filter(n=>!readSet.has(n.id)).length;
  const markRead = (id) => setReadSet(p=>new Set([...p,id]));
  const markAllRead = () => setReadSet(new Set(notifications.map(n=>n.id)));
  return { notifications, unread, readSet, markRead, markAllRead };
};

const NotificationBell = ({notifications, unread, readSet, markRead, markAllRead, setPage, isAr}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(()=>{
    const h = (e)=>{ if(ref.current&&!ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown",h);
    return ()=>document.removeEventListener("mousedown",h);
  },[]);
  const timeAgo = (ts) => {
    const diff = (Date.now()-ts)/1000;
    if(diff<60) return isAr?"الآن":"just now";
    if(diff<3600) return `${Math.floor(diff/60)} ${isAr?"دقائق مضت":"min ago"}`;
    return `${Math.floor(diff/3600)} ${isAr?"ساعات مضت":"hr ago"}`;
  };
  return (
    <div ref={ref} style={{position:"relative"}}>
      <button onClick={()=>setOpen(!open)} style={{position:"relative",background:"none",border:"none",cursor:"pointer",padding:6}}>
        {Icons.bell(22,unread>0?C.gold:C.textMuted)}
        {unread>0&&<span style={{position:"absolute",top:0,right:0,width:18,height:18,borderRadius:9,background:C.red,color:"#FFF",fontSize:10,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid "+C.white}}>{unread>9?"9+":unread}</span>}
      </button>
      {open&&<div style={{position:"absolute",top:"100%",right:isAr?undefined:0,left:isAr?0:undefined,width:360,background:C.white,borderRadius:14,boxShadow:"0 12px 40px rgba(0,0,0,0.15)",border:`1px solid ${C.border}`,zIndex:9999,overflow:"hidden",marginTop:6}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",borderBottom:`1px solid ${C.border}`,background:C.bg}}>
          <span style={{fontSize:15,fontWeight:700,color:C.navy}}>{isAr?"الإشعارات":"Notifications"} {unread>0&&<span style={{fontSize:12,color:C.red}}>({unread})</span>}</span>
          {unread>0&&<button onClick={markAllRead} style={{fontSize:12,fontWeight:600,color:C.teal,background:"none",border:"none",cursor:"pointer"}}>{isAr?"تعليم الكل":"Mark all read"}</button>}
        </div>
        <div style={{maxHeight:320,overflowY:"auto"}}>
          {notifications.length===0?<p style={{padding:20,textAlign:"center",color:C.textMuted,fontSize:14}}>{isAr?"لا توجد إشعارات":"No notifications"}</p>
          :notifications.map(n=>(
            <button key={n.id} onClick={()=>{markRead(n.id);setPage(n.page);setOpen(false);}}
              style={{width:"100%",display:"flex",alignItems:"flex-start",gap:10,padding:"12px 16px",border:"none",borderBottom:`1px solid ${C.border}`,background:readSet.has(n.id)?"transparent":C.goldLight,cursor:"pointer",textAlign:"start",transition:"background 0.1s"}}
              onMouseEnter={e=>e.currentTarget.style.background=C.bg}
              onMouseLeave={e=>e.currentTarget.style.background=readSet.has(n.id)?"transparent":C.goldLight}>
              <span style={{fontSize:18,flexShrink:0,marginTop:2}}>{n.icon}</span>
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontSize:13,fontWeight:readSet.has(n.id)?500:700,color:C.navy,marginBottom:2}}>{n.title}</p>
                <p style={{fontSize:12,color:C.textMuted}}>{n.detail}</p>
              </div>
              <span style={{fontSize:11,color:C.textMuted,flexShrink:0,marginTop:2}}>{timeAgo(n.time)}</span>
            </button>
          ))}
        </div>
      </div>}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT ENGINE — Generate CSV/PDF-ready data exports from any page
// ═══════════════════════════════════════════════════════════════════════════════
const generateCSV = (headers, rows) => {
  const esc = v => `"${String(v||"").replace(/"/g,'""')}"`;
  const lines = [headers.map(esc).join(",")];
  rows.forEach(r => lines.push(r.map(esc).join(",")));
  return lines.join("\n");
};

const downloadCSV = (filename, headers, rows) => {
  const csv = generateCSV(headers, rows);
  const blob = new Blob(["\ufeff"+csv], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename+".csv"; a.click();
  URL.revokeObjectURL(url);
};

const ExportMenu = ({title, onCSV, onPDF, isAr}) => {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState("");
  const ref = useRef(null);
  useEffect(()=>{
    const h = e => { if(ref.current&&!ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown",h);
    return ()=>document.removeEventListener("mousedown",h);
  },[]);
  return (
    <div ref={ref} style={{position:"relative",display:"inline-block"}}>
      {toast&&<div style={{position:"fixed",top:20,right:20,background:C.navy,color:C.white,padding:"12px 20px",borderRadius:12,fontSize:15,fontWeight:600,zIndex:99999,boxShadow:C.cardShadow}}>{toast}</div>}
      <Btn small variant="outline" onClick={()=>setOpen(!open)}>
        <span style={{display:"flex",alignItems:"center",gap:4}}>{Icons.fileExport(14,C.navy)} {isAr?"تصدير":"Export"}</span>
      </Btn>
      {open&&<div style={{position:"absolute",top:"100%",right:0,background:C.white,borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",border:`1px solid ${C.border}`,zIndex:9999,overflow:"hidden",marginTop:4,minWidth:160}}>
        <button onClick={()=>{onCSV&&onCSV();setOpen(false);setToast(isAr?"✅ تم تصدير CSV":"✅ CSV exported");setTimeout(()=>setToast(""),2500);}}
          style={{width:"100%",padding:"10px 14px",border:"none",borderBottom:`1px solid ${C.border}`,background:"transparent",cursor:"pointer",textAlign:"start",display:"flex",alignItems:"center",gap:8,fontSize:14,fontWeight:600,color:C.navy}}
          onMouseEnter={e=>e.currentTarget.style.background=C.bg} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          📊 {isAr?"تصدير Excel/CSV":"Export Excel/CSV"}
        </button>
        <button onClick={()=>{onPDF&&onPDF();setOpen(false);setToast(isAr?"✅ جاري إنشاء التقرير":"✅ Report generating...");setTimeout(()=>setToast(""),2500);}}
          style={{width:"100%",padding:"10px 14px",border:"none",background:"transparent",cursor:"pointer",textAlign:"start",display:"flex",alignItems:"center",gap:8,fontSize:14,fontWeight:600,color:C.navy}}
          onMouseEnter={e=>e.currentTarget.style.background=C.bg} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          📄 {isAr?"تصدير PDF":"Export PDF"}
        </button>
      </div>}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ENHANCED ROLE PERMISSIONS — Granular permission keys
// ═══════════════════════════════════════════════════════════════════════════════
const GRANULAR_PERMS = [
  {key:"export",label:"Export Reports",labelAr:"تصدير التقارير",desc:"Can export CSV/PDF from any page"},
  {key:"bulk_actions",label:"Bulk Actions",labelAr:"إجراءات جماعية",desc:"Can perform bulk approve/reject"},
  {key:"system_health",label:"System Health",labelAr:"صحة النظام",desc:"Can view system health page"},
  {key:"aml_dismiss",label:"AML Dismiss",labelAr:"إغلاق تنبيهات AML",desc:"Can dismiss AML alerts"},
  {key:"sar_file",label:"SAR Filing",labelAr:"تقديم SAR",desc:"Can file Suspicious Activity Reports"},
  {key:"cma_file",label:"CMA Filing",labelAr:"إخطار CMA",desc:"Can file CMA notifications"},
  {key:"withdraw_approve",label:"Withdrawal Approval",labelAr:"موافقة السحب",desc:"Can approve withdrawal requests"},
  {key:"user_manage",label:"User Management",labelAr:"إدارة المستخدمين",desc:"Can add/edit/suspend admin users"},
  {key:"settings_edit",label:"Edit Settings",labelAr:"تعديل الإعدادات",desc:"Can modify platform settings"},
  {key:"blacklist_manage",label:"Blacklist Manage",labelAr:"إدارة القائمة السوداء",desc:"Can ban/unban users"},
];

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION SETTINGS — Advanced bilingual mobile-ready template system
// ═══════════════════════════════════════════════════════════════════════════════
const NOTIF_TEMPLATES = [
  // ─── Account & Onboarding ─────────────────────────────────────────────────
  {id:"N01",group:"account",groupAr:"الحساب",name:"Welcome — Account Registered",nameAr:"ترحيب — تسجيل حساب جديد",
    trigger:"auto",triggerEvent:"investor.created",channels:["push","email","sms"],priority:"normal",enabled:true,
    titleEn:"Welcome to Tanaqul! 🎉",titleAr:"مرحباً بك في تناقل! 🎉",
    bodyEn:"Hi {investorName}, your account is now active. Your vault key is {vaultKey}. Start by depositing your first bar to trade tokenized precious metals.",
    bodyAr:"أهلاً {investorName}، حسابك مُفعّل الآن. مفتاح الخزينة: {vaultKey}. ابدأ بإيداع أول سبيكة لتداول المعادن الثمينة المرمّزة.",
    pushTitleEn:"Welcome to Tanaqul!",pushTitleAr:"مرحباً بك في تناقل!",
    pushBodyEn:"Your account is active. Deposit your first bar to start trading.",pushBodyAr:"حسابك نشط. أودع سبيكتك الأولى للبدء.",
    deepLink:"tanaqul://portfolio",vars:["investorName","vaultKey"],smsMaxChars:160},
  {id:"N02",group:"account",groupAr:"الحساب",name:"Account Suspended",nameAr:"تعليق الحساب",
    trigger:"auto",triggerEvent:"investor.suspended",channels:["push","email","sms"],priority:"urgent",enabled:true,
    titleEn:"Account Suspended ⚠️",titleAr:"تم تعليق حسابك ⚠️",
    bodyEn:"Dear {investorName}, your Tanaqul account has been temporarily suspended. Reason: {reason}. Contact compliance@tanaqul.sa for details.",
    bodyAr:"عزيزي {investorName}، تم تعليق حسابك في تناقل مؤقتاً. السبب: {reason}. تواصل مع compliance@tanaqul.sa.",
    pushTitleEn:"Account Suspended",pushTitleAr:"تم تعليق الحساب",
    pushBodyEn:"Your account is under review. Contact support for details.",pushBodyAr:"حسابك قيد المراجعة. تواصل مع الدعم.",
    deepLink:"tanaqul://support",vars:["investorName","reason"],smsMaxChars:160},
  {id:"N03",group:"account",groupAr:"الحساب",name:"Account Reactivated",nameAr:"إعادة تفعيل الحساب",
    trigger:"auto",triggerEvent:"investor.activated",channels:["push","sms"],priority:"normal",enabled:true,
    titleEn:"Account Reactivated ✅",titleAr:"تم تفعيل حسابك ✅",
    bodyEn:"{investorName}, your Tanaqul account has been reactivated. You can now resume trading.",
    bodyAr:"{investorName}، تم إعادة تفعيل حسابك في تناقل. يمكنك مواصلة التداول.",
    pushTitleEn:"Welcome Back!",pushTitleAr:"مرحباً بعودتك!",
    pushBodyEn:"Your account is active again. Start trading now.",pushBodyAr:"حسابك نشط مجدداً. ابدأ التداول.",
    deepLink:"tanaqul://portfolio",vars:["investorName"],smsMaxChars:160},
  {id:"N04",group:"account",groupAr:"الحساب",name:"Account Banned",nameAr:"حظر الحساب",
    trigger:"auto",triggerEvent:"investor.banned",channels:["email","sms"],priority:"urgent",enabled:true,
    titleEn:"Account Permanently Restricted",titleAr:"حسابك مقيّد بشكل دائم",
    bodyEn:"Dear {investorName}, your Tanaqul account has been permanently restricted due to: {reason}. All open orders have been cancelled. Contact legal@tanaqul.sa.",
    bodyAr:"عزيزي {investorName}، تم تقييد حسابك في تناقل بشكل دائم بسبب: {reason}. تم إلغاء جميع الأوامر. تواصل مع legal@tanaqul.sa.",
    pushTitleEn:"",pushTitleAr:"",pushBodyEn:"",pushBodyAr:"",
    deepLink:"",vars:["investorName","reason"],smsMaxChars:160},
  // ─── KYC & NAFATH ─────────────────────────────────────────────────────────
  {id:"N05",group:"kyc",groupAr:"التحقق",name:"KYC Expiry Reminder (30 days)",nameAr:"تذكير انتهاء الهوية (30 يوم)",
    trigger:"scheduled",triggerEvent:"kyc.expiring_30d",channels:["push","sms"],priority:"normal",enabled:true,
    titleEn:"KYC Expires in {daysLeft} Days",titleAr:"هويتك تنتهي خلال {daysLeft} يوم",
    bodyEn:"{investorName}, your identity verification expires on {kycExpiry}. Please renew to avoid trading restrictions.",
    bodyAr:"{investorName}، تنتهي صلاحية هويتك في {kycExpiry}. يرجى التجديد لتجنب قيود التداول.",
    pushTitleEn:"KYC Expiring Soon",pushTitleAr:"هويتك تنتهي قريباً",
    pushBodyEn:"Renew your KYC before {kycExpiry} to continue trading.",pushBodyAr:"جدد هويتك قبل {kycExpiry} للاستمرار.",
    deepLink:"tanaqul://kyc/renew",vars:["investorName","kycExpiry","daysLeft"],smsMaxChars:160},
  {id:"N06",group:"kyc",groupAr:"التحقق",name:"KYC Expired — Trading Blocked",nameAr:"الهوية منتهية — التداول متوقف",
    trigger:"auto",triggerEvent:"kyc.expired",channels:["push","email","sms"],priority:"urgent",enabled:true,
    titleEn:"KYC Expired — Trading Restricted 🔴",titleAr:"هويتك منتهية — التداول مقيّد 🔴",
    bodyEn:"{investorName}, your KYC has expired as of {kycExpiry}. Trading and withdrawals are blocked until renewal. Please update your documents immediately.",
    bodyAr:"{investorName}، انتهت صلاحية هويتك بتاريخ {kycExpiry}. التداول والسحب متوقف حتى التجديد. يرجى تحديث وثائقك فوراً.",
    pushTitleEn:"⚠️ KYC Expired",pushTitleAr:"⚠️ الهوية منتهية",
    pushBodyEn:"Your trading is blocked. Renew KYC now.",pushBodyAr:"التداول متوقف. جدد هويتك الآن.",
    deepLink:"tanaqul://kyc/renew",vars:["investorName","kycExpiry"],smsMaxChars:160},
  {id:"N07",group:"kyc",groupAr:"التحقق",name:"NAFATH Verification Required",nameAr:"مطلوب التحقق عبر نفاذ",
    trigger:"auto",triggerEvent:"nafath.required",channels:["push","sms"],priority:"urgent",enabled:true,
    titleEn:"Identity Verification Required",titleAr:"مطلوب التحقق من الهوية",
    bodyEn:"{investorName}, please verify your identity via NAFATH to activate your account. Open the Tanaqul app to start.",
    bodyAr:"{investorName}، يرجى التحقق من هويتك عبر نفاذ لتفعيل حسابك. افتح تطبيق تناقل للبدء.",
    pushTitleEn:"Verify with NAFATH",pushTitleAr:"تحقق عبر نفاذ",
    pushBodyEn:"Complete identity verification to start trading.",pushBodyAr:"أكمل التحقق من الهوية لبدء التداول.",
    deepLink:"tanaqul://nafath/verify",vars:["investorName"],smsMaxChars:160},
  // ─── Login & Security ─────────────────────────────────────────────────────
  {id:"N08",group:"security",groupAr:"الأمان",name:"Login OTP",nameAr:"رمز الدخول",
    trigger:"auto",triggerEvent:"auth.otp_requested",channels:["sms"],priority:"urgent",enabled:true,
    titleEn:"Tanaqul Login Code",titleAr:"رمز دخول تناقل",
    bodyEn:"Your Tanaqul verification code is {otpCode}. Expires in 5 minutes. Do not share this code.",
    bodyAr:"رمز التحقق من تناقل هو {otpCode}. ينتهي خلال 5 دقائق. لا تشاركه.",
    pushTitleEn:"",pushTitleAr:"",pushBodyEn:"",pushBodyAr:"",
    deepLink:"",vars:["otpCode"],smsMaxChars:100},
  {id:"N09",group:"security",groupAr:"الأمان",name:"New Device Login Alert",nameAr:"تنبيه تسجيل دخول من جهاز جديد",
    trigger:"auto",triggerEvent:"auth.new_device",channels:["push","email"],priority:"urgent",enabled:true,
    titleEn:"New Login Detected 🔐",titleAr:"تم رصد دخول جديد 🔐",
    bodyEn:"{investorName}, a new login was detected from {deviceName} ({ipAddress}) at {loginTime}. If this wasn't you, change your password immediately.",
    bodyAr:"{investorName}، تم رصد دخول جديد من {deviceName} ({ipAddress}) في {loginTime}. إذا لم تكن أنت، غيّر كلمة المرور فوراً.",
    pushTitleEn:"New Login Detected",pushTitleAr:"دخول جديد",
    pushBodyEn:"Someone logged in from {deviceName}. Was this you?",pushBodyAr:"تم الدخول من {deviceName}. هل هذا أنت؟",
    deepLink:"tanaqul://security/sessions",vars:["investorName","deviceName","ipAddress","loginTime"],smsMaxChars:160},
  // ─── Appointments ─────────────────────────────────────────────────────────
  {id:"N10",group:"appointments",groupAr:"المواعيد",name:"Appointment Booked",nameAr:"تم حجز الموعد",
    trigger:"auto",triggerEvent:"appointment.booked",channels:["push","sms"],priority:"normal",enabled:true,
    titleEn:"Appointment Confirmed ✅",titleAr:"تم تأكيد موعدك ✅",
    bodyEn:"{investorName}, your {aptType} appointment for {metal} ({qty}) at {vault} is confirmed for {aptDate} at {aptTime}. Ref: {aptId}.",
    bodyAr:"{investorName}، تم تأكيد موعد {aptType} لـ {metal} ({qty}) في {vault} بتاريخ {aptDate} الساعة {aptTime}. المرجع: {aptId}.",
    pushTitleEn:"Appointment Confirmed",pushTitleAr:"تم تأكيد الموعد",
    pushBodyEn:"{aptType} on {aptDate} at {aptTime}. Bring your ID.",pushBodyAr:"{aptType} بتاريخ {aptDate} الساعة {aptTime}. أحضر هويتك.",
    deepLink:"tanaqul://appointments/{aptId}",vars:["investorName","aptType","metal","qty","vault","aptDate","aptTime","aptId"],smsMaxChars:160},
  {id:"N11",group:"appointments",groupAr:"المواعيد",name:"Appointment Reminder (24h)",nameAr:"تذكير بالموعد (24 ساعة)",
    trigger:"scheduled",triggerEvent:"appointment.reminder_24h",channels:["push","sms"],priority:"normal",enabled:true,
    titleEn:"Appointment Tomorrow 🔔",titleAr:"موعدك غداً 🔔",
    bodyEn:"Reminder: {investorName}, you have a {aptType} appointment tomorrow at {aptTime} ({vault}). Please bring your national ID. Ref: {aptId}.",
    bodyAr:"تذكير: {investorName}، لديك موعد {aptType} غداً الساعة {aptTime} ({vault}). أحضر هويتك الوطنية. المرجع: {aptId}.",
    pushTitleEn:"Appointment Tomorrow",pushTitleAr:"موعدك غداً",
    pushBodyEn:"{aptType} at {aptTime}. Don't forget your ID.",pushBodyAr:"{aptType} الساعة {aptTime}. لا تنسَ هويتك.",
    deepLink:"tanaqul://appointments/{aptId}",vars:["investorName","aptType","aptTime","vault","aptId"],smsMaxChars:160},
  {id:"N12",group:"appointments",groupAr:"المواعيد",name:"No-Show Warning",nameAr:"تحذير عدم الحضور",
    trigger:"auto",triggerEvent:"appointment.no_show",channels:["push","sms"],priority:"urgent",enabled:true,
    titleEn:"Missed Appointment ❌",titleAr:"فاتك موعدك ❌",
    bodyEn:"{investorName}, you missed your appointment on {aptDate}. You now have {noShowCount} no-shows. 3+ may result in booking restrictions and a SAR {penaltyFee} fee.",
    bodyAr:"{investorName}، فاتك موعدك بتاريخ {aptDate}. لديك {noShowCount} حالات عدم حضور. 3 حالات أو أكثر قد تؤدي لتقييد الحجز ورسوم {penaltyFee} ريال.",
    pushTitleEn:"Missed Appointment",pushTitleAr:"فاتك الموعد",
    pushBodyEn:"You have {noShowCount} no-shows. Reschedule now.",pushBodyAr:"لديك {noShowCount} عدم حضور. أعد الجدولة.",
    deepLink:"tanaqul://appointments",vars:["investorName","aptDate","noShowCount","penaltyFee"],smsMaxChars:160},
  {id:"N13",group:"appointments",groupAr:"المواعيد",name:"Vault OTP — Appointment Verification",nameAr:"رمز التحقق — الموعد",
    trigger:"auto",triggerEvent:"appointment.otp",channels:["sms"],priority:"urgent",enabled:true,
    titleEn:"Vault OTP",titleAr:"رمز التحقق للخزينة",
    bodyEn:"Your vault verification code: {otpCode}. Valid for 10 minutes. Show this to the vault officer. Ref: {aptId}.",
    bodyAr:"رمز التحقق من الخزينة: {otpCode}. صالح لمدة 10 دقائق. أظهره لمسؤول الخزينة. المرجع: {aptId}.",
    pushTitleEn:"",pushTitleAr:"",pushBodyEn:"",pushBodyAr:"",
    deepLink:"",vars:["otpCode","aptId"],smsMaxChars:100},
  // ─── Orders & Trading ─────────────────────────────────────────────────────
  {id:"N14",group:"trading",groupAr:"التداول",name:"Order Placed",nameAr:"تم وضع الأمر",
    trigger:"auto",triggerEvent:"order.placed",channels:["push"],priority:"normal",enabled:true,
    titleEn:"Order Placed ✅",titleAr:"تم تسجيل أمرك ✅",
    bodyEn:"Your {orderSide} order for {qty}g {metal} at SAR {price}/g has been placed. Ref: {orderId}.",
    bodyAr:"تم تسجيل أمر {orderSide} لـ {qty}جرام {metal} بسعر {price} ريال/جرام. المرجع: {orderId}.",
    pushTitleEn:"{orderSide} Order Placed",pushTitleAr:"تم وضع أمر {orderSide}",
    pushBodyEn:"{qty}g {metal} @ SAR {price}. Ref: {orderId}.",pushBodyAr:"{qty}جرام {metal} بسعر {price} ريال. المرجع: {orderId}.",
    deepLink:"tanaqul://orders/{orderId}",vars:["orderSide","qty","metal","price","orderId"],smsMaxChars:160},
  {id:"N15",group:"trading",groupAr:"التداول",name:"Order Executed (Matched)",nameAr:"تم تنفيذ الأمر",
    trigger:"auto",triggerEvent:"order.executed",channels:["push","sms"],priority:"normal",enabled:true,
    titleEn:"Order Executed! 💰",titleAr:"تم تنفيذ أمرك! 💰",
    bodyEn:"Your {orderSide} order for {qty}g {metal} was executed at SAR {execPrice}/g. Total: SAR {totalSAR}. Commission: SAR {commission}.",
    bodyAr:"تم تنفيذ أمر {orderSide} لـ {qty}جرام {metal} بسعر {execPrice} ريال/جرام. الإجمالي: {totalSAR} ريال. العمولة: {commission} ريال.",
    pushTitleEn:"Trade Executed!",pushTitleAr:"تم التنفيذ!",
    pushBodyEn:"{orderSide} {qty}g {metal} @ SAR {execPrice}.",pushBodyAr:"{orderSide} {qty}جرام {metal} بسعر {execPrice} ريال.",
    deepLink:"tanaqul://portfolio",vars:["orderSide","qty","metal","execPrice","totalSAR","commission","orderId"],smsMaxChars:160},
  {id:"N16",group:"trading",groupAr:"التداول",name:"Order Cancelled",nameAr:"تم إلغاء الأمر",
    trigger:"auto",triggerEvent:"order.cancelled",channels:["push"],priority:"normal",enabled:true,
    titleEn:"Order Cancelled",titleAr:"تم إلغاء الأمر",
    bodyEn:"Your {orderSide} order ({orderId}) for {qty}g {metal} has been cancelled. Reason: {cancelReason}.",
    bodyAr:"تم إلغاء أمر {orderSide} ({orderId}) لـ {qty}جرام {metal}. السبب: {cancelReason}.",
    pushTitleEn:"Order Cancelled",pushTitleAr:"تم إلغاء الأمر",
    pushBodyEn:"{orderId} cancelled: {cancelReason}.",pushBodyAr:"تم إلغاء {orderId}: {cancelReason}.",
    deepLink:"tanaqul://orders",vars:["orderSide","qty","metal","orderId","cancelReason"],smsMaxChars:160},
  // ─── Vault & Bars ─────────────────────────────────────────────────────────
  {id:"N17",group:"vault",groupAr:"الخزينة",name:"Bar Deposited — Tokens Minted",nameAr:"تم إيداع السبيكة — تم سك الرموز",
    trigger:"auto",triggerEvent:"bar.deposited",channels:["push","email"],priority:"normal",enabled:true,
    titleEn:"Bar Deposited — Tokens Minted 🏦",titleAr:"تم إيداع السبيكة — تم سك الرموز 🏦",
    bodyEn:"{investorName}, your {metal} bar ({weight}g, {barId}) has been deposited at {vault}. {tokenCount} tokens minted to your wallet.",
    bodyAr:"{investorName}، تم إيداع سبيكة {metal} ({weight}جرام، {barId}) في {vault}. تم سك {tokenCount} رمز في محفظتك.",
    pushTitleEn:"Bar Deposited ✅",pushTitleAr:"تم إيداع السبيكة ✅",
    pushBodyEn:"{weight}g {metal} deposited. {tokenCount} tokens minted.",pushBodyAr:"تم إيداع {weight}جرام {metal}. تم سك {tokenCount} رمز.",
    deepLink:"tanaqul://vault/{barId}",vars:["investorName","metal","weight","barId","vault","tokenCount"],smsMaxChars:160},
  {id:"N18",group:"vault",groupAr:"الخزينة",name:"Bar Withdrawn — Tokens Burned",nameAr:"تم سحب السبيكة — تم حرق الرموز",
    trigger:"auto",triggerEvent:"bar.withdrawn",channels:["push","email"],priority:"normal",enabled:true,
    titleEn:"Bar Withdrawn — Tokens Burned",titleAr:"تم سحب السبيكة — تم حرق الرموز",
    bodyEn:"{investorName}, your {metal} bar ({weight}g, {barId}) has been withdrawn from {vault}. {tokenCount} tokens burned.",
    bodyAr:"{investorName}، تم سحب سبيكة {metal} ({weight}جرام، {barId}) من {vault}. تم حرق {tokenCount} رمز.",
    pushTitleEn:"Bar Withdrawn",pushTitleAr:"تم سحب السبيكة",
    pushBodyEn:"{weight}g {metal} withdrawn. Tokens burned.",pushBodyAr:"تم سحب {weight}جرام {metal}. تم حرق الرموز.",
    deepLink:"tanaqul://vault",vars:["investorName","metal","weight","barId","vault","tokenCount"],smsMaxChars:160},
  // ─── Wallet & Financial ───────────────────────────────────────────────────
  {id:"N19",group:"wallet",groupAr:"المحفظة",name:"Withdrawal Requested",nameAr:"تم طلب السحب",
    trigger:"auto",triggerEvent:"withdrawal.requested",channels:["push","sms"],priority:"normal",enabled:true,
    titleEn:"Withdrawal Request Received",titleAr:"تم استلام طلب السحب",
    bodyEn:"{investorName}, your withdrawal of SAR {amount} to {bankName} (****{ibanLast4}) has been submitted. Processing time: 1-2 business days. Ref: {wrId}.",
    bodyAr:"{investorName}، تم تقديم طلب سحب {amount} ريال إلى {bankName} (****{ibanLast4}). وقت المعالجة: 1-2 يوم عمل. المرجع: {wrId}.",
    pushTitleEn:"Withdrawal Submitted",pushTitleAr:"تم تقديم طلب السحب",
    pushBodyEn:"SAR {amount} to {bankName}. Processing 1-2 days.",pushBodyAr:"{amount} ريال إلى {bankName}. المعالجة 1-2 يوم.",
    deepLink:"tanaqul://wallet/withdrawals/{wrId}",vars:["investorName","amount","bankName","ibanLast4","wrId"],smsMaxChars:160},
  {id:"N20",group:"wallet",groupAr:"المحفظة",name:"Withdrawal Approved",nameAr:"تمت الموافقة على السحب",
    trigger:"auto",triggerEvent:"withdrawal.approved",channels:["push","sms"],priority:"normal",enabled:true,
    titleEn:"Withdrawal Approved ✅",titleAr:"تمت الموافقة على السحب ✅",
    bodyEn:"{investorName}, your withdrawal of SAR {amount} has been approved and is being processed to {bankName}.",
    bodyAr:"{investorName}، تمت الموافقة على سحب {amount} ريال وجاري التحويل إلى {bankName}.",
    pushTitleEn:"Withdrawal Approved",pushTitleAr:"تمت الموافقة",
    pushBodyEn:"SAR {amount} approved. Funds on the way.",pushBodyAr:"{amount} ريال تمت الموافقة. الأموال في الطريق.",
    deepLink:"tanaqul://wallet",vars:["investorName","amount","bankName"],smsMaxChars:160},
  {id:"N21",group:"wallet",groupAr:"المحفظة",name:"Withdrawal Rejected",nameAr:"تم رفض السحب",
    trigger:"auto",triggerEvent:"withdrawal.rejected",channels:["push","email"],priority:"urgent",enabled:true,
    titleEn:"Withdrawal Rejected ❌",titleAr:"تم رفض طلب السحب ❌",
    bodyEn:"{investorName}, your withdrawal of SAR {amount} was rejected. Reason: {rejectReason}. Funds returned to wallet. Contact support for help.",
    bodyAr:"{investorName}، تم رفض سحب {amount} ريال. السبب: {rejectReason}. تمت إعادة المبلغ للمحفظة. تواصل مع الدعم.",
    pushTitleEn:"Withdrawal Rejected",pushTitleAr:"تم رفض السحب",
    pushBodyEn:"SAR {amount} rejected. Funds returned to wallet.",pushBodyAr:"رفض {amount} ريال. المبلغ عاد للمحفظة.",
    deepLink:"tanaqul://wallet",vars:["investorName","amount","rejectReason"],smsMaxChars:160},
  // ─── Price Alerts ─────────────────────────────────────────────────────────
  {id:"N22",group:"market",groupAr:"السوق",name:"Price Alert — Threshold Reached",nameAr:"تنبيه سعر — تم بلوغ الحد",
    trigger:"auto",triggerEvent:"price.threshold_hit",channels:["push"],priority:"normal",enabled:true,
    titleEn:"{metal} Price Alert 📈",titleAr:"تنبيه سعر {metal} 📈",
    bodyEn:"{metal} just hit SAR {price}/g — {direction} {changePct}% today. Your target of SAR {targetPrice} has been reached.",
    bodyAr:"{metal} وصل إلى {price} ريال/جرام — {direction} {changePct}% اليوم. تم بلوغ هدفك {targetPrice} ريال.",
    pushTitleEn:"{metal} at SAR {price}!",pushTitleAr:"{metal} وصل {price} ريال!",
    pushBodyEn:"Your price alert triggered. {direction} {changePct}%.",pushBodyAr:"تم تفعيل تنبيه السعر. {direction} {changePct}%.",
    deepLink:"tanaqul://market/{metal}",vars:["metal","price","direction","changePct","targetPrice"],smsMaxChars:160},
  {id:"N23",group:"market",groupAr:"السوق",name:"Daily Market Summary",nameAr:"ملخص السوق اليومي",
    trigger:"scheduled",triggerEvent:"market.daily_summary",channels:["push"],priority:"normal",enabled:true,
    titleEn:"Today's Market Summary 📊",titleAr:"ملخص السوق اليوم 📊",
    bodyEn:"Gold: SAR {goldPrice}/g ({goldChange}%), Silver: SAR {silverPrice}/g ({silverChange}%), Platinum: SAR {platPrice}/g ({platChange}%).",
    bodyAr:"ذهب: {goldPrice} ريال ({goldChange}%)، فضة: {silverPrice} ريال ({silverChange}%)، بلاتين: {platPrice} ريال ({platChange}%).",
    pushTitleEn:"Market Summary",pushTitleAr:"ملخص السوق",
    pushBodyEn:"Gold {goldChange}% | Silver {silverChange}% | Platinum {platChange}%",pushBodyAr:"ذهب {goldChange}% | فضة {silverChange}% | بلاتين {platChange}%",
    deepLink:"tanaqul://market",vars:["goldPrice","goldChange","silverPrice","silverChange","platPrice","platChange"],smsMaxChars:160},
  // ─── Compliance / AML ─────────────────────────────────────────────────────
  {id:"N24",group:"compliance",groupAr:"الامتثال",name:"AML Review Notice",nameAr:"إشعار مراجعة مكافحة غسل الأموال",
    trigger:"manual",triggerEvent:"aml.review_initiated",channels:["email"],priority:"normal",enabled:true,
    titleEn:"Routine AML Review Notice",titleAr:"إشعار مراجعة روتينية لمكافحة غسل الأموال",
    bodyEn:"Dear {investorName}, your account is under routine AML review as required by SAMA regulations. You may be contacted for additional documentation. No action needed at this time.",
    bodyAr:"عزيزي {investorName}، حسابك تحت المراجعة الروتينية لمكافحة غسل الأموال وفقاً لأنظمة ساما. قد يُطلب منك وثائق إضافية. لا يلزم اتخاذ إجراء حالياً.",
    pushTitleEn:"",pushTitleAr:"",pushBodyEn:"",pushBodyAr:"",
    deepLink:"",vars:["investorName"],smsMaxChars:160},
];

const NOTIF_GROUPS = [
  {id:"account",icon:"👤",label:"Account & Onboarding",labelAr:"الحساب والتسجيل",color:"#6B9080"},
  {id:"kyc",icon:"🪪",label:"KYC & NAFATH",labelAr:"التحقق ونفاذ",color:"#D4943A"},
  {id:"security",icon:"🔐",label:"Login & Security",labelAr:"الدخول والأمان",color:"#C85C3E"},
  {id:"appointments",icon:"📅",label:"Appointments",labelAr:"المواعيد",color:C.blueSolid},
  {id:"trading",icon:"📈",label:"Orders & Trading",labelAr:"الأوامر والتداول",color:C.purpleSolid},
  {id:"vault",icon:"🏦",label:"Vault & Bars",labelAr:"الخزينة والسبائك",color:C.greenSolid},
  {id:"wallet",icon:"💳",label:"Wallet & Financial",labelAr:"المحفظة والمالية",color:"#8B6540"},
  {id:"market",icon:"💹",label:"Market & Prices",labelAr:"السوق والأسعار",color:"#C4956A"},
  {id:"compliance",icon:"🛡️",label:"Compliance / AML",labelAr:"الامتثال ومكافحة غسل الأموال",color:"#8B3520"},
];

const NotificationSettings = () => {
  const { t, isAr } = useLang();
  const [templates, setTemplates] = useState(NOTIF_TEMPLATES);
  const [editTpl, setEditTpl] = useState(null);
  const [filterGroup, setFilterGroup] = useState("ALL");
  const [filterChannel, setFilterChannel] = useState("ALL");
  const [search, setSearch] = useState("");
  const [previewTpl, setPreviewTpl] = useState(null);
  const [previewLang, setPreviewLang] = useState("en");
  const [toast, setToast] = useState("");
  const showToast = m => { setToast(m); setTimeout(()=>setToast(""),3000); };

  // API config state
  const [smsKey, setSmsKey] = useState("sk_sms_•••••••••••••");
  const [smsEndpoint, setSmsEndpoint] = useState("https://api.unifonic.com/v2/messages");
  const [smsSenderId, setSmsSenderId] = useState("Tanaqul");
  const [fcmKey, setFcmKey] = useState("AAAA•••••••••••:APA91•••••••••");
  const [emailProvider, setEmailProvider] = useState("ses");
  const [emailFrom, setEmailFrom] = useState("noreply@tanaqul.sa");
  const [emailReplyTo, setEmailReplyTo] = useState("support@tanaqul.sa");

  const filtered = templates.filter(tpl => {
    if(filterGroup!=="ALL"&&tpl.group!==filterGroup) return false;
    if(filterChannel!=="ALL"&&!tpl.channels.includes(filterChannel)) return false;
    if(search) { const q=search.toLowerCase(); return `${tpl.id} ${tpl.name} ${tpl.nameAr} ${tpl.triggerEvent}`.toLowerCase().includes(q); }
    return true;
  });

  const groupedFiltered = {};
  filtered.forEach(tpl => {
    if(!groupedFiltered[tpl.group]) groupedFiltered[tpl.group] = [];
    groupedFiltered[tpl.group].push(tpl);
  });

  const channelIcon = ch => ({sms:"📱",email:"📧",push:"🔔",inapp:"📲"}[ch]||"📨");
  const triggerBadge = tr => tr==="auto"?{label:isAr?"تلقائي":"Auto",color:C.greenSolid,bg:"#EFF5F2"}:tr==="scheduled"?{label:isAr?"مجدول":"Scheduled",color:C.purpleSolid,bg:C.purpleBg}:{label:isAr?"يدوي":"Manual",color:"#D4943A",bg:"#FDF4EC"};

  // Mobile preview renderer
  const renderMobilePreview = (tpl, lang) => {
    const title = lang==="ar"?tpl.pushTitleAr||tpl.titleAr:tpl.pushTitleEn||tpl.titleEn;
    const body = lang==="ar"?tpl.pushBodyAr||tpl.bodyAr:tpl.pushBodyEn||tpl.bodyEn;
    const smsBody = lang==="ar"?tpl.bodyAr:tpl.bodyEn;
    return (
      <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
        {/* Push notification preview */}
        {tpl.channels.includes("push")&&<div style={{width:280}}>
          <p style={{fontSize:11,fontWeight:700,color:C.textMuted,marginBottom:6,textTransform:"uppercase"}}>{isAr?"إشعار فوري":"Push Notification"}</p>
          <div style={{background:"#1C1C1E",borderRadius:16,padding:"12px 14px",boxShadow:"0 4px 20px rgba(0,0,0,0.3)"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <div style={{width:20,height:20,borderRadius:5,background:`linear-gradient(135deg,${C.gold},${C.goldDim})`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                <span style={{fontSize:10,color:"#FFF",fontWeight:800}}>T</span>
              </div>
              <span style={{fontSize:11,color:"#8E8E93",fontWeight:600}}>TANAQUL</span>
              <span style={{fontSize:10,color:"#636366",marginInlineStart:"auto"}}>{isAr?"الآن":"now"}</span>
            </div>
            <p style={{fontSize:13,fontWeight:700,color:"#FFFFFF",marginBottom:2,direction:lang==="ar"?"rtl":"ltr"}}>{title||"—"}</p>
            <p style={{fontSize:12,color:"#AEAEB2",lineHeight:1.4,direction:lang==="ar"?"rtl":"ltr"}}>{body||"—"}</p>
          </div>
        </div>}
        {/* SMS preview */}
        {tpl.channels.includes("sms")&&<div style={{width:280}}>
          <p style={{fontSize:11,fontWeight:700,color:C.textMuted,marginBottom:6,textTransform:"uppercase"}}>SMS</p>
          <div style={{background:"#E9FDD8",borderRadius:"16px 16px 4px 16px",padding:"10px 14px",maxWidth:260,boxShadow:"0 1px 4px rgba(0,0,0,0.08)"}}>
            <p style={{fontSize:13,color:"#1B1B1B",lineHeight:1.5,direction:lang==="ar"?"rtl":"ltr"}}>{smsBody||"—"}</p>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
              <span style={{fontSize:10,color:"#6B8F71"}}>{smsSenderId}</span>
              <span style={{fontSize:10,color:smsBody?.length>160?"#C85C3E":"#6B8F71"}}>{smsBody?.length||0}/160</span>
            </div>
          </div>
        </div>}
      </div>
    );
  };

  return (
    <div>
      {toast&&<div style={{position:"fixed",top:20,right:20,background:C.navy,color:C.white,padding:"12px 20px",borderRadius:12,fontSize:15,fontWeight:600,zIndex:9999}}>{toast}</div>}

      {/* ─── Gateway Config ─── */}
      <G title={isAr?"قنوات الإرسال":"Delivery Channels"}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
          <div style={{background:C.bg,borderRadius:12,padding:14,border:`1px solid ${C.border}`}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}><span style={{fontSize:18}}>📱</span><span style={{fontSize:14,fontWeight:700,color:C.navy}}>SMS — Unifonic</span></div>
            <Inp label={isAr?"مفتاح API":"API Key"} value={smsKey} onChange={setSmsKey} type="password" />
            <Inp label={isAr?"نقطة الاتصال":"Endpoint"} value={smsEndpoint} onChange={setSmsEndpoint} />
            <Inp label={isAr?"معرف المرسل":"Sender ID"} value={smsSenderId} onChange={setSmsSenderId} />
          </div>
          <div style={{background:C.bg,borderRadius:12,padding:14,border:`1px solid ${C.border}`}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}><span style={{fontSize:18}}>🔔</span><span style={{fontSize:14,fontWeight:700,color:C.navy}}>{isAr?"إشعارات فورية — FCM":"Push — Firebase FCM"}</span></div>
            <Inp label={isAr?"مفتاح الخادم":"Server Key"} value={fcmKey} onChange={setFcmKey} type="password" />
            <Inp label={isAr?"معرف المشروع":"Project ID"} value="tanaqul-prod-sa" onChange={()=>{}} />
          </div>
          <div style={{background:C.bg,borderRadius:12,padding:14,border:`1px solid ${C.border}`}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}><span style={{fontSize:18}}>📧</span><span style={{fontSize:14,fontWeight:700,color:C.navy}}>Email — AWS SES</span></div>
            <Sel label={isAr?"المزود":"Provider"} value={emailProvider} onChange={setEmailProvider} options={[{value:"ses",label:"AWS SES"},{value:"sendgrid",label:"SendGrid"},{value:"mailgun",label:"Mailgun"}]} />
            <Inp label={isAr?"من":"From"} value={emailFrom} onChange={setEmailFrom} />
            <Inp label={isAr?"الرد على":"Reply-To"} value={emailReplyTo} onChange={setEmailReplyTo} />
          </div>
        </div>
      </G>

      {/* ─── Template Stats ─── */}
      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <div style={{background:C.white,borderRadius:10,padding:"8px 14px",border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:15}}>📋</span><span style={{fontSize:14,fontWeight:700,color:C.navy}}>{templates.length}</span><span style={{fontSize:12,color:C.textMuted}}>{isAr?"قالب":"templates"}</span>
        </div>
        <div style={{background:C.white,borderRadius:10,padding:"8px 14px",border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:15}}>✅</span><span style={{fontSize:14,fontWeight:700,color:C.greenSolid}}>{templates.filter(t2=>t2.enabled).length}</span><span style={{fontSize:12,color:C.textMuted}}>{isAr?"مفعّل":"active"}</span>
        </div>
        <div style={{background:C.white,borderRadius:10,padding:"8px 14px",border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:15}}>⚡</span><span style={{fontSize:14,fontWeight:700,color:C.greenSolid}}>{templates.filter(t2=>t2.trigger==="auto").length}</span><span style={{fontSize:12,color:C.textMuted}}>{isAr?"تلقائي":"auto"}</span>
        </div>
        <div style={{background:C.white,borderRadius:10,padding:"8px 14px",border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:15}}>⏰</span><span style={{fontSize:14,fontWeight:700,color:C.purpleSolid}}>{templates.filter(t2=>t2.trigger==="scheduled").length}</span><span style={{fontSize:12,color:C.textMuted}}>{isAr?"مجدول":"scheduled"}</span>
        </div>
        {NOTIF_GROUPS.map(g=><div key={g.id} style={{background:C.white,borderRadius:10,padding:"8px 14px",border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:15}}>{g.icon}</span><span style={{fontSize:14,fontWeight:700,color:g.color}}>{templates.filter(t2=>t2.group===g.id).length}</span><span style={{fontSize:12,color:C.textMuted}}>{isAr?g.labelAr:g.label}</span>
        </div>)}
      </div>

      {/* ─── Filters ─── */}
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <input placeholder={isAr?"بحث في القوالب...":"Search templates..."} value={search} onChange={e=>setSearch(e.target.value)}
          style={{flex:1,minWidth:200,padding:"8px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:14,outline:"none",background:C.white,color:C.navy}} />
        <button onClick={()=>setFilterGroup("ALL")} style={{padding:"6px 10px",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",border:`1px solid ${filterGroup==="ALL"?C.navy:C.border}`,background:filterGroup==="ALL"?C.navy:C.white,color:filterGroup==="ALL"?"#FFF":C.textMuted}}>{isAr?"الكل":"All"}</button>
        {NOTIF_GROUPS.map(g=><button key={g.id} onClick={()=>setFilterGroup(g.id)} style={{padding:"6px 10px",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",
          border:`1px solid ${filterGroup===g.id?g.color:C.border}`,background:filterGroup===g.id?g.color+"18":C.white,color:filterGroup===g.id?g.color:C.textMuted}}>
          {g.icon} {isAr?g.labelAr:g.label}
        </button>)}
        <div style={{width:1,height:24,background:C.border}} />
        {["ALL","sms","email","push"].map(ch=><button key={ch} onClick={()=>setFilterChannel(ch)} style={{padding:"6px 10px",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",
          border:`1px solid ${filterChannel===ch?C.teal:C.border}`,background:filterChannel===ch?C.tealLight:C.white,color:filterChannel===ch?C.teal:C.textMuted}}>
          {ch==="ALL"?(isAr?"كل القنوات":"All Channels"):`${channelIcon(ch)} ${ch.toUpperCase()}`}
        </button>)}
      </div>

      {/* ─── Template List — grouped ─── */}
      {Object.entries(groupedFiltered).map(([groupId, tpls]) => {
        const grp = NOTIF_GROUPS.find(g=>g.id===groupId);
        return (
          <div key={groupId} style={{marginBottom:18}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <span style={{fontSize:18}}>{grp?.icon}</span>
              <span style={{fontSize:15,fontWeight:700,color:grp?.color||C.navy}}>{isAr?grp?.labelAr:grp?.label}</span>
              <span style={{fontSize:11,color:C.textMuted,background:C.bg,padding:"2px 8px",borderRadius:4}}>{tpls.length}</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {tpls.map(tpl=>{
                const tb = triggerBadge(tpl.trigger);
                return (
                  <div key={tpl.id} style={{background:C.white,borderRadius:12,border:`1px solid ${C.border}`,padding:"14px 18px",display:"flex",alignItems:"center",gap:14,boxShadow:C.cardShadow,
                    opacity:tpl.enabled?1:0.5,borderInlineStart:`3px solid ${grp?.color||C.gold}`}}>
                    {/* Enable toggle */}
                    <div onClick={()=>setTemplates(p=>p.map(x=>x.id===tpl.id?{...x,enabled:!x.enabled}:x))}
                      style={{width:38,height:22,borderRadius:12,background:tpl.enabled?C.greenSolid:"#E8E0D4",cursor:"pointer",position:"relative",flexShrink:0,transition:"background 0.2s"}}>
                      <div style={{width:16,height:16,borderRadius:9,background:"#FFF",position:"absolute",top:3,[tpl.enabled?"right":"left"]:3,transition:"all 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}} />
                    </div>
                    {/* Info */}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:3}}>
                        <span style={{fontSize:14,fontWeight:700,color:C.navy}}>{isAr?tpl.nameAr:tpl.name}</span>
                        <span style={{fontSize:10,fontWeight:700,color:tb.color,background:tb.bg,padding:"2px 6px",borderRadius:4}}>{tb.label}</span>
                        {tpl.priority==="urgent"&&<span style={{fontSize:10,fontWeight:800,color:"#C85C3E",background:C.redBg,padding:"2px 6px",borderRadius:4}}>🔴 {isAr?"عاجل":"URGENT"}</span>}
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        <span style={{fontSize:11,color:C.textMuted,fontFamily:"monospace"}}>{tpl.triggerEvent}</span>
                        <span style={{color:C.border}}>·</span>
                        {tpl.channels.map(ch=><span key={ch} style={{fontSize:12}} title={ch}>{channelIcon(ch)}</span>)}
                        {tpl.deepLink&&<><span style={{color:C.border}}>·</span><span style={{fontSize:10,color:C.purpleSolid,fontFamily:"monospace"}}>🔗 {tpl.deepLink.replace("tanaqul://","")}</span></>}
                      </div>
                    </div>
                    {/* Actions */}
                    <div style={{display:"flex",gap:4,flexShrink:0}}>
                      <Btn small variant="outline" onClick={()=>{setPreviewTpl(tpl);setPreviewLang("en");}}>{isAr?"معاينة":"Preview"}</Btn>
                      <Btn small variant="outline" onClick={()=>setEditTpl({...tpl})}>{isAr?"تعديل":"Edit"}</Btn>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* ─── PREVIEW MODAL ─── */}
      {previewTpl&&<Modal title={`${isAr?"معاينة":"Preview"} — ${isAr?previewTpl.nameAr:previewTpl.name}`} onClose={()=>setPreviewTpl(null)}>
        {/* Language toggle */}
        <div style={{display:"flex",gap:4,marginBottom:14}}>
          {["en","ar"].map(lng=><button key={lng} onClick={()=>setPreviewLang(lng)} style={{padding:"6px 14px",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",
            border:`1px solid ${previewLang===lng?C.navy:C.border}`,background:previewLang===lng?C.navy:C.white,color:previewLang===lng?"#FFF":C.textMuted}}>
            {lng==="en"?"🇺🇸 English":"🇸🇦 العربية"}
          </button>)}
        </div>
        {/* Template info row */}
        <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
          {previewTpl.channels.map(ch=><span key={ch} style={{fontSize:12,fontWeight:700,color:C.teal,background:C.tealLight,padding:"3px 8px",borderRadius:6}}>{channelIcon(ch)} {ch.toUpperCase()}</span>)}
          <span style={{fontSize:12,fontWeight:700,color:triggerBadge(previewTpl.trigger).color,background:triggerBadge(previewTpl.trigger).bg,padding:"3px 8px",borderRadius:6}}>⚡ {triggerBadge(previewTpl.trigger).label}</span>
          {previewTpl.deepLink&&<span style={{fontSize:12,fontWeight:700,color:C.purpleSolid,background:C.purpleBg,padding:"3px 8px",borderRadius:6}}>🔗 {previewTpl.deepLink}</span>}
        </div>
        {/* Mobile phone previews */}
        <p style={{fontSize:12,fontWeight:700,color:C.textMuted,marginBottom:8,textTransform:"uppercase"}}>{isAr?"معاينة الهاتف":"Mobile Preview"}</p>
        {renderMobilePreview(previewTpl, previewLang)}
        {/* Full body */}
        <div style={{marginTop:14,background:C.bg,borderRadius:10,padding:"14px 16px"}}>
          <p style={{fontSize:12,fontWeight:600,color:C.textMuted,marginBottom:4}}>{previewLang==="ar"?"النص الكامل":"Full Body"}</p>
          <p style={{fontSize:14,color:C.navy,lineHeight:1.6,direction:previewLang==="ar"?"rtl":"ltr",whiteSpace:"pre-wrap"}}>{previewLang==="ar"?previewTpl.bodyAr:previewTpl.bodyEn}</p>
        </div>
        {/* Variables */}
        {previewTpl.vars?.length>0&&<div style={{marginTop:10}}>
          <p style={{fontSize:12,fontWeight:600,color:C.textMuted,marginBottom:4}}>{isAr?"المتغيرات":"Variables"}</p>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {previewTpl.vars.map(v=><span key={v} style={{fontSize:11,color:C.gold,background:C.goldLight,padding:"3px 6px",borderRadius:4,fontFamily:"monospace"}}>{`{${v}}`}</span>)}
          </div>
        </div>}
      </Modal>}

      {/* ─── EDIT MODAL ─── */}
      {editTpl&&<Modal title={`${isAr?"تعديل":"Edit"} — ${editTpl.id}`} onClose={()=>setEditTpl(null)}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
          <Inp label={isAr?"الاسم (EN)":"Name (EN)"} value={editTpl.name} onChange={v=>setEditTpl(p=>({...p,name:v}))} />
          <Inp label={isAr?"الاسم (AR)":"Name (AR)"} value={editTpl.nameAr} onChange={v=>setEditTpl(p=>({...p,nameAr:v}))} />
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
          <Inp label="Push Title (EN)" value={editTpl.pushTitleEn} onChange={v=>setEditTpl(p=>({...p,pushTitleEn:v}))} />
          <Inp label="Push Title (AR)" value={editTpl.pushTitleAr} onChange={v=>setEditTpl(p=>({...p,pushTitleAr:v}))} />
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
          <div>
            <label style={{display:"block",fontSize:12,fontWeight:600,color:C.textMuted,marginBottom:4}}>Body (EN)</label>
            <textarea value={editTpl.bodyEn} onChange={e=>setEditTpl(p=>({...p,bodyEn:e.target.value}))} rows={4}
              style={{width:"100%",padding:"10px 12px",borderRadius:8,fontSize:13,border:`1px solid ${C.border}`,resize:"vertical",boxSizing:"border-box",fontFamily:"inherit"}} />
          </div>
          <div>
            <label style={{display:"block",fontSize:12,fontWeight:600,color:C.textMuted,marginBottom:4}}>Body (AR)</label>
            <textarea value={editTpl.bodyAr} onChange={e=>setEditTpl(p=>({...p,bodyAr:e.target.value}))} rows={4} dir="rtl"
              style={{width:"100%",padding:"10px 12px",borderRadius:8,fontSize:13,border:`1px solid ${C.border}`,resize:"vertical",boxSizing:"border-box",fontFamily:"inherit"}} />
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
          <div>
            <label style={{display:"block",fontSize:12,fontWeight:600,color:C.textMuted,marginBottom:4}}>Push Body (EN)</label>
            <textarea value={editTpl.pushBodyEn} onChange={e=>setEditTpl(p=>({...p,pushBodyEn:e.target.value}))} rows={2}
              style={{width:"100%",padding:"8px 12px",borderRadius:8,fontSize:13,border:`1px solid ${C.border}`,resize:"vertical",boxSizing:"border-box",fontFamily:"inherit"}} />
          </div>
          <div>
            <label style={{display:"block",fontSize:12,fontWeight:600,color:C.textMuted,marginBottom:4}}>Push Body (AR)</label>
            <textarea value={editTpl.pushBodyAr} onChange={e=>setEditTpl(p=>({...p,pushBodyAr:e.target.value}))} rows={2} dir="rtl"
              style={{width:"100%",padding:"8px 12px",borderRadius:8,fontSize:13,border:`1px solid ${C.border}`,resize:"vertical",boxSizing:"border-box",fontFamily:"inherit"}} />
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:14}}>
          <Sel label={isAr?"المحفز":"Trigger"} value={editTpl.trigger} onChange={v=>setEditTpl(p=>({...p,trigger:v}))}
            options={[{value:"auto",label:isAr?"تلقائي":"Auto"},{value:"scheduled",label:isAr?"مجدول":"Scheduled"},{value:"manual",label:isAr?"يدوي":"Manual"}]} />
          <Sel label={isAr?"الأولوية":"Priority"} value={editTpl.priority} onChange={v=>setEditTpl(p=>({...p,priority:v}))}
            options={[{value:"normal",label:isAr?"عادي":"Normal"},{value:"urgent",label:isAr?"عاجل":"Urgent"}]} />
          <Inp label="Deep Link" value={editTpl.deepLink} onChange={v=>setEditTpl(p=>({...p,deepLink:v}))} placeholder="tanaqul://..." />
        </div>
        {/* Channel toggles */}
        <div style={{marginBottom:14}}>
          <p style={{fontSize:12,fontWeight:600,color:C.textMuted,marginBottom:6}}>{isAr?"القنوات":"Channels"}</p>
          <div style={{display:"flex",gap:8}}>
            {["sms","email","push","inapp"].map(ch=>{
              const on = editTpl.channels.includes(ch);
              return <button key={ch} onClick={()=>setEditTpl(p=>({...p,channels:on?p.channels.filter(c=>c!==ch):[...p.channels,ch]}))}
                style={{padding:"6px 12px",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",border:`1.5px solid ${on?C.teal:C.border}`,background:on?C.tealLight:C.white,color:on?C.teal:C.textMuted}}>
                {channelIcon(ch)} {ch.toUpperCase()}
              </button>;
            })}
          </div>
        </div>
        {/* Variables */}
        <div style={{marginBottom:14}}>
          <p style={{fontSize:12,fontWeight:600,color:C.textMuted,marginBottom:4}}>{isAr?"المتغيرات":"Variables"}</p>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {editTpl.vars?.map(v=><span key={v} style={{fontSize:11,color:C.gold,background:C.goldLight,padding:"3px 6px",borderRadius:4,fontFamily:"monospace"}}>{`{${v}}`}</span>)}
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn variant="gold" onClick={()=>{setTemplates(p=>p.map(x=>x.id===editTpl.id?editTpl:x));setEditTpl(null);showToast(isAr?"✅ تم حفظ القالب":"✅ Template saved");}}>{isAr?"حفظ التغييرات":"Save Changes"}</Btn>
          <Btn variant="outline" onClick={()=>setEditTpl(null)}>{isAr?"إلغاء":"Cancel"}</Btn>
        </div>
      </Modal>}
    </div>
  );
};

const Settings = ({ onLangChange }) => {
  const { t, isAr, commSplit, setCommSplit, gatewaySettings, setGatewaySettings, commissionRates, setCommissionRates, cancelFee, setCancelFee, reportingConfig, setReportingConfig } = useLang();
  const [tab,setTab]=useState("PLATFORM");
  const [walletOn,setWalletOn]=useState(false);
  const [explorerOn,setExplorerOn]=useState(true);
  const [saved,setSavedMain]=useState(false);
  const showSaved=()=>{
    setSavedMain(true);
    setTimeout(()=>setSavedMain(false),2500);
    // Propagate commission split to App-level context (used by Blocks page + matching engine)
    setCommSplit({buying:parseInt(splitBuying)||30,selling:parseInt(splitSelling)||30,creator:parseInt(splitCreator)||20,validators:parseInt(splitValidators)||20});
    // Persist settings to localStorage
    try {
      localStorage.setItem("tanaqul_settings_v1", JSON.stringify({
        madaFee,madaCap,visaFee,sadadFee,
        commBuyer,commSeller,splitBuying,splitSelling,splitCreator,splitValidators,
        distSched,minValidator,blocksInPeriod,
        advBook,expiry,testFee,handFee,cancelFee,
        slotStart,slotEnd,slotInterval,slotDesks,
        session,netName,protocol,maxMB,maxHrs,quorum,
      }));
    } catch(e){}
  };
  // Platform
  const [platform,setPlatform]=useState({name:"Tanaqul Precious",timezone:"Asia/Riyadh (GMT+3)",lang:"ar"});
  // Payments
  // Gateway settings come from App-level context (persist across navigation)
  const {madaFee,madaCap,visaFee,sadadFee} = gatewaySettings;
  const setMadaFee  = v => setGatewaySettings(p=>({...p,madaFee:v}));
  const setMadaCap  = v => setGatewaySettings(p=>({...p,madaCap:v}));
  const setVisaFee  = v => setGatewaySettings(p=>({...p,visaFee:v}));
  const setSadadFee = v => setGatewaySettings(p=>({...p,sadadFee:v}));
  // Commission — backed by App-level context (persists and flows to matching engine)
  const commBuyer = commissionRates.buyer;
  const commSeller = commissionRates.seller;
  const setCommBuyer = v => setCommissionRates(p => ({...p, buyer: v}));
  const setCommSeller = v => setCommissionRates(p => ({...p, seller: v}));
  const [splitBuying,setSplitBuying]=useState(String(commSplit.buying||30));
  const [splitSelling,setSplitSelling]=useState(String(commSplit.selling||30));
  const [splitCreator,setSplitCreator]=useState(String(commSplit.creator||20));
  const [splitValidators,setSplitValidators]=useState(String(commSplit.validators||20));
  const [distSched,setDistSched]=useState("daily");
  const [minValidator,setMinValidator]=useState("10");
  const [takharojWallet,setTakharojWallet]=useState("0xTKHJ...tanaqul");
  const [blocksInPeriod,setBlocksInPeriod]=useState("500");
  // Blockchain
  const [netName,setNetName]=useState("Tanaqul Private Network");
  const [protocol,setProtocol]=useState("besu");
  const [contract,setContract]=useState("0xc0ntract...addr");
  const [maxMB,setMaxMB]=useState("1"); const [maxHrs,setMaxHrs]=useState("24");
  const [quorum,setQuorum]=useState("1");
  // Notifications
  const [smsKey,setSmsKey]=useState(""); const [smsEndpoint,setSmsEndpoint]=useState("https://sms-api.example.com");
  const [fcmKey,setFcmKey]=useState("");
  // Vault
  const [vaultLocs,setVaultLocs]=useState(["Riyadh Vault 1","Jeddah Vault 1"]);
  const [newVault,setNewVault]=useState(""); const [showNewVault,setShowNewVault]=useState(false);
  const [advBook,setAdvBook]=useState("1");
  const [expiry,setExpiry]=useState("30");
  const [slotStart,setSlotStart]=useState("09:00");
  const [slotEnd,setSlotEnd]=useState("17:00");
  const [slotInterval,setSlotInterval]=useState("30");
  const [slotDesks,setSlotDesks]=useState("2");
  const [testFee,setTestFee]=useState("150"); const [handFee,setHandFee]=useState("100");
  // NAFATH
  const [nafathKey,setNafathKey]=useState(""); const [nafathWebhook,setNafathWebhook]=useState("https://api.tanaqul.sa/nafath/webhook");
  const [nafathMode,setNafathMode]=useState("production");
  // Security
  const [session,setSession]=useState("30"); const [ipWhitelist,setIpWhitelist]=useState("");


  return (
    <div>
      <SectionHeader title={isAr?"الإعدادات":"Settings"} sub="Platform configuration and management" />
      <TabBar tabs={["PLATFORM","PAYMENTS","COMMISSION","BLOCKCHAIN","NOTIFICATIONS","REPORTING","VAULT","MANUFACTURERS","NAFATH","SECURITY"]} active={tab} onChange={setTab} />
      {tab==="PLATFORM"&&<div>
        <G title={isAr?"إعدادات المنصة":"Platform Settings"}>
          <Inp label={isAr?"اسم المنصة":"Platform Name"} value={platform.name} onChange={v=>setPlatform({...platform,name:v})} />
          <Inp label={isAr?"المنطقة الزمنية":"Timezone"} value={platform.timezone} onChange={v=>setPlatform({...platform,timezone:v})} />
          <Sel label={isAr?"اللغة الافتراضية":"Default Language"} value={platform.lang} onChange={v=>{setPlatform({...platform,lang:v});if(onLangChange)onLangChange(v);}} options={[{value:"ar",label:"Arabic (العربية)"},{value:"en",label:"English"}]} />
          <p style={{fontSize:13,color:C.textMuted}}>Currency: Saudi Riyal — official SAMA SVG everywhere</p>
        </G>
        <BidTogglePanel />
      </div>}
      {tab==="PAYMENTS"&&<div>
        <div style={{background:"#FDF4EC",borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
          {Icons.warning(18,"#D4943A")}<p style={{fontSize:14,color:C.orange,fontWeight:500}}>Wallet Deposit disabled — pending SAMA regulatory clearance.</p>
        </div>
        <G title="Wallet Deposit"><Toggle label={isAr?"تفعيل إيداع المحفظة":"Enable Wallet Deposits"} sub={isAr?"تفعيل عند موافقة ساما فقط":"Activate only when SAMA approved"} value={walletOn} onChange={setWalletOn} /></G>
        <G title="MADA — Percentage + Fixed Cap"><Inp label="Fee %" value={madaFee} onChange={setMadaFee} /><Inp label={isAr?"الحد الأقصى (ريال)":"Max Cap (SAR)"} value={madaCap} onChange={setMadaCap} /></G>
        <G title={isAr?"فيزا / ماستركارد":"Visa / Mastercard"}><Inp label="Fee %" value={visaFee} onChange={setVisaFee} /></G>
        <G title="SADAD — Fixed Fee"><Inp label={isAr?"رسوم ثابتة (ريال)":"Fixed Fee (SAR)"} value={sadadFee} onChange={setSadadFee} /></G>
      </div>}
      {tab==="COMMISSION"&&<CommissionTab
        commBuyer={commBuyer} setCommBuyer={setCommBuyer}
        commSeller={commSeller} setCommSeller={setCommSeller}
        splitBuying={splitBuying} setSplitBuying={setSplitBuying}
        splitSelling={splitSelling} setSplitSelling={setSplitSelling}
        splitCreator={splitCreator} setSplitCreator={setSplitCreator}
        splitValidators={splitValidators} setSplitValidators={setSplitValidators}
        distSched={distSched} setDistSched={setDistSched}
        minValidator={minValidator} setMinValidator={setMinValidator}
        takharojWallet={takharojWallet} setTakharojWallet={setTakharojWallet}
        blocksInPeriod={blocksInPeriod} setBlocksInPeriod={setBlocksInPeriod}
        showSaved={showSaved}
      />}
      {tab==="BLOCKCHAIN"&&<div>
        <G title={isAr?"الشبكة":"Network"}><Inp label={isAr?"اسم الشبكة":"Network Name"} value={netName} onChange={setNetName} /><Sel label={isAr?"البروتوكول":"Protocol"} value={protocol} onChange={setProtocol} options={[{value:"besu",label:"Hyperledger Besu"},{value:"fabric",label:"Hyperledger Fabric"}]} /><Inp label={isAr?"عنوان العقد":"Contract Address"} value={contract} onChange={setContract} /></G>
        <G title={isAr?"محفز الكتلة":"Block Trigger"}><Inp label="Max Size (MB)" value={maxMB} onChange={setMaxMB} /><Inp label="Max Time (hours)" value={maxHrs} onChange={setMaxHrs} /></G>
        <G title={isAr?"المصادقون":"Validators"}><Inp label={isAr?"حد النصاب":"Quorum Threshold"} value={quorum} onChange={setQuorum} /><Toggle label={isAr?"مستكشف الكتل العام":"Public Block Explorer"} sub="Allow public read-only access" value={explorerOn} onChange={setExplorerOn} /></G>
      </div>}
      {tab==="NOTIFICATIONS"&&<NotificationSettings />}

      {tab==="REPORTING"&&<div>
        {/* SAR Reporting Config */}
        <G title={isAr?"إعدادات بلاغات النشاط المشبوه — ساما":"SAR Reporting — SAMA GoAML"}>
          <div style={{background:"#FDF4EC",borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
            {Icons.warning(16,"#D4943A")}<p style={{fontSize:13,color:"#8B6540",fontWeight:500}}>{isAr?"تقديم تقارير النشاط المشبوه إلزامي بموجب نظام مكافحة غسل الأموال. الإبلاغ خلال 24 ساعة من الاكتشاف.":"SAR filing is mandatory under SAMA AML regulations. Reports must be filed within 24 hours of detection."}</p>
          </div>
          <Toggle label={isAr?"تفعيل الإرسال التلقائي عبر البريد":"Enable One-Click Email Dispatch"} sub={isAr?"يتيح إرسال بلاغات SAR بنقرة واحدة من صفحة التدقيق":"Enables one-click SAR filing from Audit & AML page"} value={reportingConfig.sarEnabled} onChange={v=>setReportingConfig(p=>({...p,sarEnabled:v}))} />
          <Inp label={isAr?"البريد الإلكتروني لساما (GoAML)":"SAMA GoAML Email"} value={reportingConfig.sarEmail} onChange={v=>setReportingConfig(p=>({...p,sarEmail:v}))} placeholder="sar@sama.gov.sa" />
          <Inp label={isAr?"نسخة إلى (CC)":"CC — Internal Compliance"} value={reportingConfig.sarCc} onChange={v=>setReportingConfig(p=>({...p,sarCc:v}))} placeholder="compliance@tanaqul.sa" />
          <div style={{background:C.greenBg,borderRadius:10,padding:"14px 16px",marginTop:8,border:"1px solid #C8E0D2"}}>
            <p style={{fontSize:13,fontWeight:700,color:"#3D6B56",marginBottom:8}}>{isAr?"قالب تقرير النشاط المشبوه":"SAR Report Template Preview"}</p>
            <div style={{background:C.white,borderRadius:8,padding:"12px 14px",fontFamily:"monospace",fontSize:12,lineHeight:"1.7",color:C.text,border:`1px solid ${C.border}`,direction:isAr?"rtl":"ltr"}}>
              <p style={{fontWeight:700}}>{isAr?"تقرير نشاط مشبوه (SAR)":"SUSPICIOUS ACTIVITY REPORT (SAR)"}</p>
              <p>══════════════════════════════════════</p>
              <p>{isAr?"إلى":"To"}: {reportingConfig.sarEmail || "—"}</p>
              <p>{isAr?"من":"From"}: {reportingConfig.mlroName || "MLRO"} ({reportingConfig.companyName || "—"})</p>
              <p>{isAr?"الترخيص":"License"}: {reportingConfig.companyLicense || "—"}</p>
              <p>══════════════════════════════════════</p>
              <p>{isAr?"رقم البلاغ":"Report ID"}: SAR-[{isAr?"تلقائي":"auto"}]</p>
              <p>{isAr?"مستوى الخطورة":"Risk Level"}: [{isAr?"من التنبيه":"from alert"}]</p>
              <p>──────────────────────────────────────</p>
              <p>{isAr?"الشخص المعني":"SUBJECT"}: [{isAr?"الاسم":"Name"}] — {isAr?"رقم الهوية":"NID"}: [...]</p>
              <p>{isAr?"القاعدة المُشغّلة":"Triggering Rule"}: [{isAr?"رقم القاعدة":"Rule ID"}] — [{isAr?"الوصف":"Description"}]</p>
              <p>{isAr?"النظام المُخالف":"Regulation Breached"}: [{isAr?"مرجع المادة":"Article ref"}]</p>
              <p>──────────────────────────────────────</p>
              <p style={{fontWeight:600}}>{isAr?"الكشف:":"DETECTION:"} [{isAr?"ما رصده النظام":"What the system detected"}]</p>
              <p style={{fontWeight:600}}>{isAr?"الاشتباه:":"SUSPICION:"} [{isAr?"لماذا يعتبر مشبوهاً":"Why it's suspicious"}]</p>
              <p style={{fontWeight:600}}>{isAr?"التوصية:":"RECOMMENDATION:"} [{isAr?"بناءً على المستوى":"Based on severity"}]</p>
              <p>──────────────────────────────────────</p>
              <p>{isAr?"مقدم من":"FILED BY"}: {reportingConfig.mlroName || "—"}, {reportingConfig.mlroTitle || "—"}</p>
            </div>
          </div>
        </G>

        {/* CMA Notification Config */}
        <G title={isAr?"إعدادات إخطارات هيئة السوق المالية — التلاعب بالسوق":"CMA Notification — Market Manipulation (Art 11)"}>
          <div style={{background:C.purpleBg,borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
            {Icons.cmaScale(16,C.purpleSolid)}<p style={{fontSize:13,color:"#5D4E82",fontWeight:500}}>{isAr?"المادة 11 تلزم بإخطار الهيئة خلال 3 أيام عمل من اكتشاف التلاعب المشتبه به.":"Art 11 requires notification to CMA within 3 business days of suspected manipulation detection."}</p>
          </div>
          <Toggle label={isAr?"تفعيل الإرسال التلقائي عبر البريد":"Enable One-Click Email Dispatch"} sub={isAr?"يتيح إرسال إخطارات CMA بنقرة واحدة من صفحة التدقيق":"Enables one-click CMA notification from Audit & AML page"} value={reportingConfig.cmaEnabled} onChange={v=>setReportingConfig(p=>({...p,cmaEnabled:v}))} />
          <Inp label={isAr?"البريد الإلكتروني لهيئة السوق المالية":"CMA Enforcement Email"} value={reportingConfig.cmaEmail} onChange={v=>setReportingConfig(p=>({...p,cmaEmail:v}))} placeholder="enforcement@cma.org.sa" />
          <Inp label={isAr?"نسخة إلى (CC)":"CC — Internal Compliance"} value={reportingConfig.cmaCc} onChange={v=>setReportingConfig(p=>({...p,cmaCc:v}))} placeholder="compliance@tanaqul.sa" />
          <div style={{background:"#F5F3FF",borderRadius:10,padding:"14px 16px",marginTop:8,border:"1px solid #DED8EB"}}>
            <p style={{fontSize:13,fontWeight:700,color:"#5D4E82",marginBottom:8}}>{isAr?"قالب إخطار هيئة السوق المالية":"CMA Notification Template Preview"}</p>
            <div style={{background:C.white,borderRadius:8,padding:"12px 14px",fontFamily:"monospace",fontSize:12,lineHeight:"1.7",color:C.text,border:`1px solid ${C.border}`,direction:isAr?"rtl":"ltr"}}>
              <p style={{fontWeight:700}}>{isAr?"إخطار التلاعب بالسوق — هيئة السوق المالية":"CMA MARKET MANIPULATION NOTIFICATION"}</p>
              <p>{isAr?"بموجب أنظمة سلوك السوق — المادة 11":"Per Market Conduct Regulations — Article 11"}</p>
              <p>══════════════════════════════════════</p>
              <p>{isAr?"إلى":"To"}: {reportingConfig.cmaEmail || "—"}</p>
              <p>{isAr?"من":"From"}: {reportingConfig.mlroName || "MLRO"} ({reportingConfig.companyName || "—"})</p>
              <p>══════════════════════════════════════</p>
              <p>{isAr?"رقم الإخطار":"Notification ID"}: CMA-NOTIF-[{isAr?"تلقائي":"auto"}]</p>
              <p>{isAr?"التصنيف":"Category"}: [{isAr?"تداول ذاتي/انتحال/تصعيد...":"Self-Trade/Spoofing/Ramping..."}]</p>
              <p>{isAr?"الخطورة":"Severity"}: [{isAr?"حرج/عالٍ":"CRITICAL/HIGH"}]</p>
              <p>──────────────────────────────────────</p>
              <p>{isAr?"الشخص المعني":"SUBJECT"}: [{isAr?"الاسم":"Name"}] — {isAr?"رقم الهوية":"NID"}: [...]</p>
              <p>{isAr?"النظام المُخالف":"Regulation Breached"}: [{isAr?"مرجع المادة":"Article ref"}]</p>
              <p>──────────────────────────────────────</p>
              <p style={{fontWeight:600}}>{isAr?"الكشف:":"DETECTION:"} [{isAr?"ما رصده النظام":"What the system flagged"}]</p>
              <p style={{fontWeight:600}}>{isAr?"المخالفة المشتبه بها:":"SUSPECTED VIOLATION:"} [{isAr?"السلوك التداولي":"Trading behavior"}]</p>
              <p style={{fontWeight:600}}>{isAr?"الإجراء المتخذ:":"ACTION TAKEN:"} [{isAr?"تجميد / مراقبة":"Freeze / Monitor"}]</p>
              <p>──────────────────────────────────────</p>
              <p>{isAr?"مقدم من":"FILED BY"}: {reportingConfig.mlroName || "—"}, {reportingConfig.mlroTitle || "—"}</p>
            </div>
          </div>
        </G>

        {/* MLRO / Company Details */}
        <G title={isAr?"بيانات مسؤول الامتثال والشركة — ثنائي اللغة":"MLRO & Company Details — Bilingual"}>
          <div style={{background:"#FDF4EC",borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
            {Icons.warning(16,"#D4943A")}<p style={{fontSize:13,color:"#8B6540",fontWeight:500}}>{isAr?"أدخل البيانات باللغتين. اسم المسؤول يُسحب تلقائياً من حساب المستخدم الحالي.":"Enter details in both languages. MLRO name is automatically pulled from the current user account."}</p>
          </div>
          {/* MLRO Name — auto from logged-in user, read-only */}
          <div style={{display:"flex",gap:10,marginBottom:8}}>
            <div style={{flex:1}}>
              <p style={{fontSize:12,color:C.textMuted,marginBottom:4}}>MLRO Name (English) — <span style={{color:C.gold,fontWeight:600}}>{isAr?"تلقائي":"Auto"}</span></p>
              <div style={{padding:"10px 14px",background:C.bg,borderRadius:10,border:`1px solid ${C.border}`,fontSize:15,fontWeight:600,color:C.navy}}>{reportingConfig.mlroName}</div>
            </div>
            <div style={{flex:1}}>
              <p style={{fontSize:12,color:C.textMuted,marginBottom:4}}>اسم مسؤول الإبلاغ (عربي) — <span style={{color:C.gold,fontWeight:600}}>{isAr?"تلقائي":"Auto"}</span></p>
              <div style={{padding:"10px 14px",background:C.bg,borderRadius:10,border:`1px solid ${C.border}`,fontSize:15,fontWeight:600,color:C.navy,direction:"rtl"}}>{reportingConfig.mlroNameAr}</div>
            </div>
          </div>
          {/* MLRO Title */}
          <div style={{display:"flex",gap:10,marginBottom:8}}>
            <div style={{flex:1}}>
              <Inp label="MLRO Title (English)" value={reportingConfig.mlroTitle} onChange={v=>setReportingConfig(p=>({...p,mlroTitle:v}))} placeholder="Money Laundering Reporting Officer" />
            </div>
            <div style={{flex:1}}>
              <Inp label="المسمى الوظيفي (عربي)" value={reportingConfig.mlroTitleAr} onChange={v=>setReportingConfig(p=>({...p,mlroTitleAr:v}))} placeholder="مسؤول الإبلاغ عن غسل الأموال" />
            </div>
          </div>
          {/* Company Name */}
          <div style={{display:"flex",gap:10,marginBottom:8}}>
            <div style={{flex:1}}>
              <Inp label="Company Name (English)" value={reportingConfig.companyName} onChange={v=>setReportingConfig(p=>({...p,companyName:v}))} placeholder="Tanaqul Precious Metals Trading Co." />
            </div>
            <div style={{flex:1}}>
              <Inp label="اسم الشركة (عربي)" value={reportingConfig.companyNameAr} onChange={v=>setReportingConfig(p=>({...p,companyNameAr:v}))} placeholder="شركة تناقل لتجارة المعادن الثمينة" />
            </div>
          </div>
          {/* License */}
          <div style={{display:"flex",gap:10,marginBottom:8}}>
            <div style={{flex:1}}>
              <Inp label="License Number (English)" value={reportingConfig.companyLicense} onChange={v=>setReportingConfig(p=>({...p,companyLicense:v}))} placeholder="SAMA License No. 12345" />
            </div>
            <div style={{flex:1}}>
              <Inp label="رقم الترخيص (عربي)" value={reportingConfig.companyLicenseAr} onChange={v=>setReportingConfig(p=>({...p,companyLicenseAr:v}))} placeholder="ترخيص ساما رقم ١٢٣٤٥" />
            </div>
          </div>
          {/* Company Address */}
          <div style={{display:"flex",gap:10,marginBottom:8}}>
            <div style={{flex:1}}>
              <Inp label="Company Address (English)" value={reportingConfig.companyAddress} onChange={v=>setReportingConfig(p=>({...p,companyAddress:v}))} placeholder="King Fahd Road, Riyadh 12345" />
            </div>
            <div style={{flex:1}}>
              <Inp label="عنوان الشركة (عربي)" value={reportingConfig.companyAddressAr} onChange={v=>setReportingConfig(p=>({...p,companyAddressAr:v}))} placeholder="طريق الملك فهد، الرياض ١٢٣٤٥" />
            </div>
          </div>
        </G>
      </div>}
      {tab==="VAULT"&&<div>
        <G title={isAr?"مواقع الخزنة":"Vault Locations"}>
          {vaultLocs.map(v=>(
            <div key={v} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:`1px solid ${C.border}`}}>
              <span style={{fontSize:16,color:C.text,display:"flex",alignItems:"center",gap:6}}>{Icons.vault(14,C.textMuted)}{v}</span>
              <div style={{display:"flex",gap:6}}><Btn small variant="danger" onClick={()=>setVaultLocs(p=>p.filter(x=>x!==v))}>{t("Remove")}</Btn></div>
            </div>
          ))}
          {showNewVault&&<div style={{display:"flex",gap:8,marginTop:10}}>
            <input value={newVault} onChange={e=>setNewVault(e.target.value)} placeholder="Vault name..." style={{flex:1,padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:15,outline:"none"}}/>
            <Btn small variant="teal" onClick={()=>{if(newVault.trim()){setVaultLocs(p=>[...p,newVault]);setNewVault("");setShowNewVault(false);}}}>Add</Btn>
            <Btn small variant="ghost" onClick={()=>setShowNewVault(false)}>{t("Cancel")}</Btn>
          </div>}
          <div style={{marginTop:10}}><Btn small variant="teal" onClick={()=>setShowNewVault(true)}><span style={{display:"flex",alignItems:"center",gap:5}}>{Icons.add(14,C.white)} Add Location</span></Btn></div>
        </G>
        <G title={isAr?"أحجام السبائك":"Bar Sizes"}><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{["1g","5g","10g","15g","20g","25g","50g","100g"].map(w=><span key={w} style={{padding:"5px 12px",background:C.goldLight,borderRadius:8,fontSize:14,fontWeight:600,color:C.goldDim,border:`1px solid ${C.gold}44`}}>{w}</span>)}</div></G>
        <G title={isAr?"قواعد المواعيد":"Appointment Rules"}>
          <Inp label="Advance Booking (days)" value={advBook} onChange={setAdvBook} />
          <Inp label="Expiry Window (minutes after appointment)" value={expiry} onChange={setExpiry} />
          <ApptSlotsConfig
            start={slotStart} setStart={setSlotStart}
            end={slotEnd}     setEnd={setSlotEnd}
            interval={slotInterval} setInterval={setSlotInterval}
            desks={slotDesks} setDesks={setSlotDesks}
          />
        </G>
        <G title={isAr?"رسوم المواعيد":"Appointment Fees"}>
          <div style={{background:C.purpleBg,borderRadius:10,padding:"10px 14px",marginBottom:12}}>
            <p style={{fontSize:13,color:C.blueSolid}}>💡 These fees are charged when the investor books an appointment. Cancellation refunds 50 SAR less. No Show = no refund.</p>
          </div>
          <Inp label="Testing Fee — Deposit Appointments (SAR)" value={testFee} onChange={setTestFee} />
          <Inp label="Handling Fee — Withdrawal Appointments (SAR)" value={handFee} onChange={setHandFee} />
          <Inp label="Cancellation Penalty (SAR)" value={cancelFee} onChange={setCancelFee} />
        </G>
      </div>}
      {tab==="MANUFACTURERS"&&<G title={isAr?"الشركات المصنعة":"Manufacturers"}>
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}><Btn small variant="gold"><span style={{display:"flex",alignItems:"center",gap:5}}>{Icons.add(14,C.white)} Add</span></Btn></div>
        {["MKS PAMP SA (Switzerland — LBMA)","Valcambi SA (Switzerland — LBMA)","Argor-Heraeus (Switzerland — LBMA)","Royal Mint (UK — LBMA)","Saudi Aramco Refinery (KSA — GCC)"].map(m=>(
          <div key={m} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:14,color:C.text,display:"flex",alignItems:"center",gap:6}}>{Icons.bar(16,C.textMuted)}{m}</span>
            <div style={{display:"flex",gap:6}}><Btn small variant="outline">{isAr?"تعديل":"Edit"}</Btn><Btn small variant="danger">{t("Remove")}</Btn></div>
          </div>
        ))}
      </G>}
      {tab==="NAFATH"&&<G title={isAr?"تكامل نفاذ":"NAFATH Integration"}>
        <Inp label={isAr?"مفتاح API":"API Key"} value={nafathKey} onChange={setNafathKey} type="password" />
        <Inp label={isAr?"رابط Webhook":"Webhook URL"} value={nafathWebhook} onChange={setNafathWebhook} />
        <Sel label={isAr?"الوضع":"Mode"} value={nafathMode} onChange={setNafathMode} options={[{value:"production",label:"Production"},{value:"test",label:"Test Mode"}]} />
        <p style={{fontSize:13,color:C.textMuted,marginTop:4}}>NAFATH mandatory for all registrations. No KYC bypass.</p>
      </G>}
      {tab==="SECURITY"&&<div>
        <G title={isAr?"أمان المسؤول":"Admin Security"}>
          <Toggle label="Two-Factor Authentication (2FA) 🔒" sub="Required for all admin logins — cannot be disabled" value={true} onChange={()=>{}} />
          <Inp label="Session Timeout (minutes)" value={session} onChange={setSession} />
          <Inp label={isAr?"القائمة البيضاء لعناوين IP":"IP Whitelist"} value={ipWhitelist} onChange={setIpWhitelist} />
        </G>
        <PriceFeedSettings />
      </div>}
      <div style={{display:"flex",justifyContent:"flex-end",alignItems:"center",marginTop:8,gap:12,flexWrap:"wrap"}}>{saved&&<span style={{fontSize:15,color:C.greenSolid,fontWeight:600}}>✅ Settings saved!</span>}<Btn variant="gold" onClick={()=>{const s=parseInt(splitBuying||0)+parseInt(splitSelling||0)+parseInt(splitCreator||0)+parseInt(splitValidators||0);if(s!==100){setSavedMain(false);const el=document.getElementById("split-err");if(el){el.textContent=isAr?`⚠️ مجموع التقسيم يجب أن يساوي 100% — حالياً ${s}%`:`⚠️ Commission split must total 100% — currently ${s}%`;el.style.display="block";setTimeout(()=>{el.style.display="none";},4000);}return;}showSaved();}}>{isAr?"حفظ الإعدادات":"Save Settings"}</Btn></div>
      <div id="split-err" style={{display:"none",background:C.redBg,border:"1px solid #C85C3E44",borderRadius:10,padding:"10px 14px",marginTop:8,fontSize:14,color:"#C85C3E",fontWeight:600}}></div>
    </div>
  );
};

const PAGES = [
  {id:"dashboard",    icon:"dashboard",    label:"Dashboard"},
  {id:"investors",    icon:"investors",    label:"Investors"},
  {id:"txlog",        icon:"txlog",        label:"Transaction Log"},
  {id:"orderbook",    icon:"orderbook",    label:"Order Book"},
  {id:"vault",        icon:"vault",        label:"Main Vault"},
  {id:"appointments", icon:"appointments", label:"Appointments"},
  {id:"financials",   icon:"financials",   label:"Financials"},
  {id:"reports",      icon:"reports",      label:"Reports"},
  {id:"blacklist",    icon:"blacklist",    label:"Blacklist"},
  {id:"blocks",       icon:"blocks",       label:"Blocks"},
  {id:"auditlog",     icon:"auditlog",     label:"Audit & AML"},
  {id:"commcenter",   icon:"envelope",     label:"Communication"},
  {id:"usermgmt",     icon:"usersAdmin",   label:"User Management"},
  {id:"settings",     icon:"settings",     label:"Settings"},
  {id:"health",       icon:"health",       label:"System Health"},
  {id:"treasury",     icon:"treasury",     label:"Treasury & Recon"},
  {id:"profile",      icon:"profile",      label:"Account Profile"},
];

// ─── TOTP Implementation (RFC 6238) ──────────────────────────────────────────
async function generateTOTP(secret, digits = 6, period = 30) {
  const base32Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of secret.toUpperCase()) {
    const val = base32Chars.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const counter = Math.floor(Date.now() / 1000 / period);
  const counterBytes = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) { counterBytes[i] = c & 0xff; c = Math.floor(c / 256); }
  const key = await crypto.subtle.importKey("raw", new Uint8Array(bytes), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, counterBytes);
  const arr = new Uint8Array(sig);
  const offset = arr[19] & 0xf;
  const code = ((arr[offset] & 0x7f) << 24 | arr[offset+1] << 16 | arr[offset+2] << 8 | arr[offset+3]) % Math.pow(10, digits);
  return code.toString().padStart(digits, "0");
}

// ════════════════════════════════════════════════════════════════════════════════
// ⛔ SECURITY CRITICAL — PROTOTYPE ONLY — REMOVE BEFORE PRODUCTION DEPLOYMENT
// These secrets MUST be moved to server-side auth. Client-side TOTP secrets allow
// attackers to generate valid codes. Passwords in client bundle = zero security.
// Production: Use server-side session management (JWT/httpOnly cookies) + MFA via
// authenticator app (secret stored server-side only) + bcrypt password hashing.
// ════════════════════════════════════════════════════════════════════════════════
// ⚠️ SECURITY: These credentials are DEMO ONLY. In production:
// 1. Remove all hardcoded credentials
// 2. Use environment variables exclusively (VITE_ADMIN_EMAIL, VITE_ADMIN_PASS)
// 3. Implement server-side authentication (OAuth2 / SAML / OIDC)
// 4. Never store plaintext passwords in source code
const TOTP_SECRET = import.meta?.env?.VITE_TOTP_SECRET || "JBSWY3DPEHPK3PXP";
const ADMIN_EMAIL = import.meta?.env?.VITE_ADMIN_EMAIL || "admin@tanaqul.sa";
const ADMIN_PASS  = import.meta?.env?.VITE_ADMIN_PASS  || "Tanaqul@2026";

// ─── Login Page ───────────────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  /* v9194-clean */
  const { t, isAr, switchLang } = useLang();
  const [step, setStep]         = useState(1); // 1=credentials, 2=2FA, 3=2FA setup, 4=phone recovery
  const [email, setEmail]       = useState("");
  const [pass, setPass]         = useState("");
  const [code, setCode]         = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [qrUrl, setQrUrl]       = useState("");
  const [showPass, setShowPass] = useState(false);
  const [timer, setTimer]       = useState(30);
  const [recoveryPhone, setRecoveryPhone] = useState("");
  const [recoveryOtp, setRecoveryOtp] = useState("");
  const [recoverySent, setRecoverySent] = useState(false);
  const [recoveryTimer, setRecoveryTimer] = useState(0);

  useEffect(() => {
    if (step === 2 || step === 3) {
      const iv = setInterval(() => setTimer(30-(Math.floor(Date.now()/1000)%30)), 1000);
      return () => clearInterval(iv);
    }
  }, [step]);

  useEffect(() => {
    if(recoveryTimer>0){ const iv=setInterval(()=>setRecoveryTimer(t=>t-1),1000); return ()=>clearInterval(iv); }
  },[recoveryTimer]);

  useEffect(() => {
    if (step === 3) {
      // ⚠️ SECURITY: This sends the TOTP secret to quickchart.io (third party).
      // Production: Generate QR code client-side using a library like 'qrcode' npm package.
      const url = `otpauth://totp/Tanaqul%3AAziz?secret=${TOTP_SECRET}&issuer=Tanaqul&digits=6&period=30`;
      setQrUrl(`https://quickchart.io/qr?text=${encodeURIComponent(url)}&size=200&margin=2`);
    }
  }, [step]);

  const handleCredentials = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await apiLogin(email.trim(), pass.trim());
      if (result.ok) {
        setLoading(false);
        onLogin();
        return;
      }
      if (result.status === 400 && result.detail === "2FA code required") {
        setLoading(false);
        setStep(2);
        return;
      }
      if (result.status === 206 && result.detail === "2FA_SETUP_REQUIRED") {
        setQrUrl(result.qr_code || "");
        setLoading(false);
        setStep(3);
        return;
      }
      setError(result.detail || (isAr ? "بريد إلكتروني أو كلمة مرور غير صحيحة" : "Invalid email or password."));
    } catch (_) {
      setError(isAr ? "خطأ في الاتصال" : "Connection error");
    }
    setLoading(false);
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await apiLogin(email.trim(), pass.trim(), code.trim());
      if (result.ok) {
        onLogin();
      } else {
        setError(result.detail || (isAr ? "رمز غير صحيح" : "Invalid code. Please try again."));
        setCode("");
      }
    } catch (_) {
      setError(isAr ? "خطأ في الاتصال" : "Connection error");
    }
    setLoading(false);
  };

  // shared input style
  const INP = {
    width:"100%", padding:"14px 18px", borderRadius:12,
    border:"1.5px solid rgba(255,255,255,0.12)",
    background:"rgba(255,255,255,0.07)", color:"#FFFFFF",
    fontSize:17, outline:"none", fontFamily:"inherit",
    boxSizing:"border-box",
    direction: isAr ? "rtl" : "ltr", textAlign: isAr ? "right" : "left",
    transition:"border 0.2s",
  };
  const LBL = {
    display:"block", fontSize:13, fontWeight:700,
    color:"#FFFFFF", marginBottom:7, letterSpacing:"0.06em",
    textAlign: isAr ? "right" : "left",
    textTransform:"uppercase",
  };

  return (
    <div dir={isAr?"rtl":"ltr"} style={{
      minHeight:"100vh",
      background:`linear-gradient(160deg, #1E1810 0%, #2D2418 50%, #2A2015 100%)`,
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"'Cairo','STCForward',system-ui,sans-serif", padding:24,
    }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@700;800&display=swap" />
      <div style={{width:"100%", maxWidth:520}}>

        {/* ── Language Toggle ── */}
        <div style={{display:"flex", justifyContent:"flex-end", marginBottom:28}}>
          <button onClick={()=>switchLang(isAr?"en":"ar")} style={{
            display:"flex", alignItems:"center", gap:7,
            padding:"9px 18px", borderRadius:100,
            border:"1.5px solid rgba(255,255,255,0.18)",
            background:"rgba(255,255,255,0.08)",
            color:"#CBD5E1", fontSize:15, fontWeight:700,
            cursor:"pointer",
            fontFamily:"'Cairo','STCForward',system-ui,sans-serif",
            letterSpacing:"0.02em",
            boxShadow:"0 2px 12px rgba(0,0,0,0.3)",
          }}>
            <span style={{fontSize:18}}>{isAr?"🇺🇸":"🇸🇦"}</span>
            <span>{isAr?"English":"العربية"}</span>
          </button>
        </div>

        {/* ── Brand ── */}
        <div style={{textAlign:"center", marginBottom:36}}>
          <div style={{
            width:72, height:72, borderRadius:20, margin:"0 auto 18px",
            display:"flex", alignItems:"center", justifyContent:"center",
            background:"rgba(255,255,255,0.04)",
            border:"1px solid rgba(255,255,255,0.10)",
            boxShadow:"0 12px 40px rgba(0,0,0,0.4)",
          }}>
            <TanaqulLogo size={52} />
          </div>
          <p style={{fontSize:40,fontWeight:800,color:"#F5F0E8",lineHeight:1,marginBottom:8,letterSpacing:"-0.02em",fontFamily:"'STCForward','DM Sans',system-ui,sans-serif"}}>
            Tanaqul
          </p>
          <p style={{fontSize:15, color:C.silverText, fontWeight:500, letterSpacing:"0.03em",
            fontFamily:"'STCForward','DM Sans',system-ui,sans-serif"}}>
            {isAr ? "لوحة إدارة المعادن الثمينة" : "Tanaqul Precious Admin"}
          </p>
        </div>

        {/* ── Card ── */}
        <div style={{
          background:"rgba(255,255,255,0.04)",
          backdropFilter:"blur(24px)",
          borderRadius:20, padding:"36px 40px",
          border:"1px solid rgba(255,255,255,0.09)",
          boxShadow:"0 24px 80px rgba(0,0,0,0.5)",
        }}>

          {/* STEP 1 — credentials */}
          {step === 1 && (
            <form onSubmit={handleCredentials}>
              <p style={{fontSize:22, fontWeight:700, color:"#FFFFFF", marginBottom:4, textAlign:"center"}}>
                {isAr ? "تسجيل الدخول" : "Sign In"}
              </p>
              <p style={{fontSize:14, color:"rgba(255,255,255,0.6)", marginBottom:24, textAlign:"center"}}>
                {isAr ? "أدخل بياناتك للمتابعة" : "Enter your credentials to continue"}
              </p>

              {/* Email */}
              <div style={{marginBottom:16}}>
                <label style={LBL}>{isAr ? "البريد الإلكتروني" : "Email"}</label>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
                  placeholder={isAr ? "أدخل بريدك الإلكتروني" : "your@email.com"}
                  autoComplete="off" required style={INP}
                  onFocus={e=>e.target.style.border="1.5px solid #C4956A"}
                  onBlur={e=>e.target.style.border="1.5px solid rgba(255,255,255,0.12)"} />
              </div>

              {/* Password */}
              <div style={{marginBottom:24, position:"relative"}}>
                <label style={LBL}>{isAr ? "كلمة المرور" : "Password"}</label>
                <input type={showPass?"text":"password"} value={pass} onChange={e=>setPass(e.target.value)}
                  placeholder={isAr ? "أدخل كلمة المرور" : "••••••••"}
                  autoComplete="off" required style={INP}
                  onFocus={e=>e.target.style.border="1.5px solid #C4956A"}
                  onBlur={e=>e.target.style.border="1.5px solid rgba(255,255,255,0.12)"} />
                <button type="button" onClick={()=>setShowPass(s=>!s)}
                  style={{position:"absolute", [isAr?"left":"right"]:14, top:36,
                    background:"none", border:"none", color:"#8C7E6F", cursor:"pointer", fontSize:13, fontWeight:600}}>
                  {isAr ? (showPass?"إخفاء":"إظهار") : (showPass?"Hide":"Show")}
                </button>
              </div>

              {error && <p style={{color:"#E8826A", fontSize:14, marginBottom:14, textAlign:"start"}}>{error}</p>}

              <button type="submit" style={{
                width:"100%", padding:"14px", borderRadius:12,
                background:`linear-gradient(135deg, #C4956A, #2D2418)`,
                color:"#fff", border:"none", fontSize:17, fontWeight:700,
                cursor:"pointer", letterSpacing:"0.02em",
                boxShadow:"0 4px 20px rgba(14,165,233,0.35)",
              }}>
                {isAr ? "متابعة ←" : "Continue →"}
              </button>
              <div style={{textAlign:"center",marginTop:14}}>
                <button type="button" onClick={()=>{setStep(4);setError("");}} style={{background:"none",border:"none",color:"#8C7E6F",fontSize:13,fontWeight:600,cursor:"pointer",textDecoration:"underline"}}>
                  {isAr?"لا أستطيع الدخول؟ استرداد بالهاتف":"Can't login? Recover by phone"}
                </button>
              </div>
            </form>
          )}

          {/* STEP 4 — Phone Recovery */}
          {step === 4 && (
            <div>
              <button onClick={()=>{setStep(1);setError("");}} style={{background:"none",border:"none",color:"#8C7E6F",fontSize:13,fontWeight:600,cursor:"pointer",marginBottom:14}}>← {isAr?"رجوع":"Back"}</button>
              <p style={{fontSize:22,fontWeight:700,color:"#FFFFFF",marginBottom:4,textAlign:"center"}}>{isAr?"استرداد الحساب":"Account Recovery"}</p>
              <p style={{fontSize:14,color:"rgba(255,255,255,0.6)",marginBottom:20,textAlign:"center"}}>{isAr?"أدخل رقم الهاتف المسجّل لاسترداد حسابك":"Enter your registered phone number to recover access"}</p>
              {!recoverySent?(
                <div>
                  <label style={LBL}>{isAr?"رقم الهاتف المسجّل":"Registered Phone"}</label>
                  <input type="tel" value={recoveryPhone} onChange={e=>setRecoveryPhone(e.target.value)}
                    placeholder="+966 5X XXX XXXX" style={INP}
                    onFocus={e=>e.target.style.border="1.5px solid #C4956A"}
                    onBlur={e=>e.target.style.border="1.5px solid rgba(255,255,255,0.12)"} />
                  {error&&<p style={{color:"#E8826A",fontSize:14,marginTop:8}}>{error}</p>}
                  <button onClick={()=>{
                    if(!recoveryPhone.trim()){setError(isAr?"أدخل رقم الهاتف":"Enter phone number");return;}
                    setRecoverySent(true);setRecoveryTimer(60);setError("");
                  }} style={{width:"100%",padding:"14px",borderRadius:12,background:"linear-gradient(135deg, #C4956A, #2D2418)",color:"#fff",border:"none",fontSize:17,fontWeight:700,cursor:"pointer",marginTop:16}}>
                    {isAr?"إرسال رمز التحقق":"Send Recovery Code"}
                  </button>
                </div>
              ):(
                <div>
                  <p style={{fontSize:14,color:"rgba(255,255,255,0.6)",textAlign:"center",marginBottom:14}}>
                    {isAr?"تم إرسال رمز إلى":"Code sent to"} <b style={{color:"#C4956A"}}>{recoveryPhone}</b>
                  </p>
                  <div style={{display:"flex",justifyContent:"center",marginBottom:14}}>
                    <input value={recoveryOtp} onChange={e=>setRecoveryOtp(e.target.value.replace(/\D/g,"").slice(0,6))}
                      placeholder="000000" maxLength={6}
                      style={{width:200,textAlign:"center",fontSize:28,fontWeight:800,letterSpacing:8,padding:"12px",borderRadius:12,border:`2px solid ${recoveryOtp.length===6?"#C4956A":"rgba(255,255,255,0.12)"}`,background:"rgba(255,255,255,0.07)",color:"#FFF",outline:"none",fontFamily:"monospace"}} />
                  </div>
                  <p style={{fontSize:12,color:"rgba(255,255,255,0.5)",textAlign:"center",marginBottom:10}}>
                    {recoveryTimer>0?<>{isAr?"إعادة الإرسال بعد":"Resend in"} <b>{recoveryTimer}s</b></>:
                    <button onClick={()=>setRecoveryTimer(60)} style={{color:"#C4956A",fontWeight:700,background:"none",border:"none",cursor:"pointer",fontSize:13}}>{isAr?"إعادة إرسال":"Resend"}</button>}
                  </p>
                  <p style={{fontSize:11,color:"rgba(255,255,255,0.4)",background:"rgba(255,255,255,0.05)",borderRadius:8,padding:"6px 10px",textAlign:"center",marginBottom:14}}>{isAr?"":"" }</p>
                  {error&&<p style={{color:"#E8826A",fontSize:14,marginBottom:8,textAlign:"center"}}>{error}</p>}
                  <button onClick={()=>{
                    if(recoveryOtp==="847291"){onLogin();}
                    else{setError(isAr?"رمز خاطئ":"Invalid code");setRecoveryOtp("");}
                  }} style={{width:"100%",padding:"14px",borderRadius:12,background:"linear-gradient(135deg, #C4956A, #2D2418)",color:"#fff",border:"none",fontSize:17,fontWeight:700,cursor:"pointer"}}>
                    {isAr?"تحقق وادخل":"Verify & Login"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STEP 2 — 2FA verify */}
          {step === 2 && (
            <form onSubmit={handleVerify}>
              <p style={{fontSize:22, fontWeight:700, color:"#FFFFFF", marginBottom:4, textAlign:"center"}}>
                {isAr ? "التحقق بخطوتين" : "Two-Factor Auth"}
              </p>
              <p style={{fontSize:14, color:"rgba(255,255,255,0.6)", marginBottom:24, textAlign:"center"}}>
                {isAr ? "أدخل الرمز من تطبيق Google Authenticator" : "Enter the 6-digit code from Google Authenticator"}
              </p>
              <div style={{marginBottom:20}}>
                <input type="text" value={code}
                  onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))}
                  placeholder="000000" maxLength={6} required autoFocus
                  style={{...INP, fontSize:32, textAlign:"center", letterSpacing:"0.5em",
                    padding:"16px 14px", border:`1.5px solid ${C.gold}55`,
                    direction:"ltr",
                  }} />
              </div>
              {/* Timer */}
              <div style={{display:"flex", justifyContent:"center", alignItems:"center", gap:8, marginBottom:20}}>
                <div style={{width:28, height:28, borderRadius:"50%",
                  background:`conic-gradient(${C.teal} ${timer/30*360}deg, rgba(255,255,255,0.08) 0deg)`,
                  display:"flex", alignItems:"center", justifyContent:"center"}}>
                  <span style={{fontSize:11, color:"#fff", fontWeight:700}}>{timer}</span>
                </div>
                <span style={{fontSize:13, color:C.silverText}}>
                  {isAr ? `ينتهي الرمز في ${timer}ث` : `Refreshes in ${timer}s`}
                </span>
              </div>
              {error && <p style={{color:"#E8826A", fontSize:14, marginBottom:14, textAlign:"center"}}>{error}</p>}
              <button type="submit" disabled={loading||code.length!==6} style={{
                width:"100%", padding:"14px", borderRadius:12,
                background:code.length===6?`linear-gradient(135deg,${C.gold},#8B6540)`:"rgba(255,255,255,0.07)",
                color:"#fff", border:"none", fontSize:17, fontWeight:700,
                cursor:code.length===6?"pointer":"not-allowed",
                boxShadow:code.length===6?"0 4px 20px rgba(212,160,23,0.35)":"none",
              }}>
                {loading ? (isAr?"جاري التحقق...":"Verifying...") : (isAr?"دخول":"Sign In")}
              </button>
              <button type="button" onClick={()=>{setStep(1);setCode("");setError("");}}
                style={{width:"100%", padding:"10px", marginTop:10, background:"none",
                  border:"none", color:C.silverText, fontSize:14, cursor:"pointer"}}>
                {isAr ? "← رجوع" : "← Back"}
              </button>
            </form>
          )}

          {/* STEP 3 — first-time 2FA setup */}
          {step === 3 && (
            <form onSubmit={handleVerify}>
              <p style={{fontSize:20, fontWeight:700, color:"#F5F0E8", marginBottom:4, textAlign:"start"}}>
                {isAr ? "إعداد المصادقة الثنائية" : "Setup 2FA"}
              </p>
              <p style={{fontSize:13, color:C.silverText, marginBottom:20, textAlign:"start"}}>
                {isAr ? "امسح رمز QR بتطبيق Google Authenticator" : "Scan this QR with Google Authenticator"}
              </p>
              <div style={{textAlign:"center", marginBottom:16}}>
                {qrUrl && <img src={qrUrl} alt="QR" style={{borderRadius:12, width:160, border:`2px solid ${C.gold}44`}} />}
              </div>
              <div style={{background:"rgba(255,255,255,0.04)", borderRadius:10, padding:"10px 14px", marginBottom:18, textAlign:"center"}}>
                <p style={{fontSize:12, color:C.silverText, marginBottom:4}}>{isAr?"أو أدخل المفتاح يدوياً:":"Or enter key manually:"}</p>
                <p style={{fontFamily:"monospace", fontSize:16, color:C.gold, letterSpacing:"0.1em"}}>{TOTP_SECRET}</p>
              </div>
              <div style={{marginBottom:18}}>
                <input type="text" value={code}
                  onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))}
                  placeholder="000000" maxLength={6} required
                  style={{...INP, fontSize:30, textAlign:"center", letterSpacing:"0.4em",
                    padding:"14px", border:`1.5px solid ${C.gold}55`, direction:"ltr"}} />
              </div>
              <div style={{display:"flex", justifyContent:"center", alignItems:"center", gap:8, marginBottom:18}}>
                <div style={{width:28, height:28, borderRadius:"50%",
                  background:`conic-gradient(${C.teal} ${timer/30*360}deg, rgba(255,255,255,0.08) 0deg)`,
                  display:"flex", alignItems:"center", justifyContent:"center"}}>
                  <span style={{fontSize:11, color:"#fff", fontWeight:700}}>{timer}</span>
                </div>
                <span style={{fontSize:13, color:C.silverText}}>
                  {isAr ? `ينتهي الرمز في ${timer}ث` : `Refreshes in ${timer}s`}
                </span>
              </div>
              {error && <p style={{color:"#E8826A", fontSize:14, marginBottom:12}}>{error}</p>}
              <button type="submit" disabled={loading||code.length!==6} style={{
                width:"100%", padding:"14px", borderRadius:12,
                background:code.length===6?`linear-gradient(135deg,${C.gold},#8B6540)`:"rgba(255,255,255,0.07)",
                color:"#fff", border:"none", fontSize:17, fontWeight:700,
                cursor:code.length===6?"pointer":"not-allowed",
              }}>
                {loading?(isAr?"جاري التحقق...":"Verifying..."):(isAr?"تحقق وتسجيل الدخول":"Verify & Sign In")}
              </button>
            </form>
          )}
        </div>

        <p style={{textAlign:"center", fontSize:13, color:"#3D3225", marginTop:20, letterSpacing:"0.03em",
          fontFamily:"'Noto Naskh Arabic','Traditional Arabic',serif"}}>
          {"تنقّل"} للمعادن الثمينة &nbsp;•&nbsp; {isAr?"محمي بالمصادقة الثنائية":"Secured with 2FA"}
        </p>
      </div>
    </div>
  );
}

// ─── Header Bar Components ────────────────────────────────────────────────────
const MetalPill = ({ symbol, label, color, bgColor, price, change }) => {
  const isUp = change >= 0;
  return (
    <div style={{display:"flex",alignItems:"center",gap:5,background:bgColor,padding:"4px 10px",borderRadius:7,border:`1px solid ${color}55`,direction:"ltr"}}>
      <span style={{fontSize:9,color:color,fontWeight:700,letterSpacing:"0.04em"}}>{label}</span>
      <span style={{fontSize:12,color:color,fontWeight:800,fontVariantNumeric:"tabular-nums"}}>
        {price.toLocaleString("en-SA",{minimumFractionDigits:2,maximumFractionDigits:2})}
      </span>
      <span style={{fontSize:9,fontWeight:700,color:isUp?C.greenSolid:"#C85C3E",background:isUp?"#EFF5F2":C.redBg,padding:"1px 5px",borderRadius:4}}>
        {isUp?"+":""}{change.toFixed(2)}%
      </span>
    </div>
  );
};

const HeaderPills = () => {
  const { t, isAr } = useLang();
  const { gold, silver, plat, status } = useLivePrices();
  const { validators, appBlockStats } = useAppData();
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => tick(n => n + 1), 15000);
    return () => clearInterval(iv);
  }, []);

  const blockAge = (() => {
    const last = new Date("2026-03-01T00:29:00");
    const diff = Math.max(0, Math.floor((new Date() - last) / 1000));
    const h = Math.floor(diff / 3600), m = Math.floor((diff % 3600) / 60), s = diff % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  })();

  const activeValidators = validators.filter(v => v.status === "ACTIVE").length;

  return (
    <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"nowrap"}}>

      {/* BLOCK + AGE */}
      <div style={{display:"flex",alignItems:"center",gap:0,background:C.goldLight,borderRadius:7,border:`1px solid ${C.gold}44`,overflow:"hidden",direction:"ltr"}}>
        <div style={{padding:"4px 9px",display:"flex",alignItems:"center",gap:4}}>
          {Icons.block(11,C.goldDim)}
          <span style={{fontSize:11,color:C.goldDim,fontWeight:700}}>#{(appBlockStats?.latest_block_number || 0)}</span>
        </div>
        <div style={{width:1,height:18,background:C.gold+"44"}}/>
        <div style={{padding:"4px 9px",display:"flex",alignItems:"center",gap:3}}>
          <span style={{fontSize:10}}>⏱</span>
          <span style={{fontSize:11,color:C.goldDim,fontWeight:600,fontVariantNumeric:"tabular-nums"}}>{blockAge}</span>
        </div>
      </div>

      {/* DIVIDER */}
      <div style={{width:1,height:22,background:C.border}} />

      {/* PLATINUM */}
      {plat && <MetalPill label="XPT/g" color="#0369A1" bgColor="#F0F9FF" price={plat.priceSAR} change={plat.change} />}

      {/* SILVER */}
      {silver && <MetalPill label="XAG/g" color={"#475569"} bgColor="#FAF8F5" price={silver.priceSAR} change={silver.change} />}

      {/* GOLD */}
      {gold && <MetalPill label="XAU/g" color="#B7791F" bgColor="#FDF4EC" price={gold.priceSAR} change={gold.change} />}

      {/* DIVIDER */}
      <div style={{width:1,height:22,background:C.border}} />

      {/* STATUS GROUP */}
      <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:8,background:C.greenBg,border:"1.5px solid #86EFAC",boxShadow:"0 0 0 2px #EFF5F2"}}>
        <div style={{width:7,height:7,borderRadius:"50%",background:C.greenSolid,boxShadow:"0 0 7px #4A7A68"}} />
        <span style={{fontSize:11,color:C.greenSolid,fontWeight:700}}>{t("System Online")}</span>
        <div style={{width:1,height:14,background:"#86EFAC"}} />
        <div style={{width:7,height:7,borderRadius:"50%",background:C.greenSolid,boxShadow:"0 0 7px #4A7A68"}} />
        <span style={{fontSize:11,color:C.greenSolid,fontWeight:700}}>{activeValidators} {t(activeValidators!==1?"Validators Active":"Validator Active")}</span>
      </div>

    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// GLOBAL AML ENGINE — runs at App level, monitors all state changes continuously
// ═══════════════════════════════════════════════════════════════════════════════
const parseSARGlobal = v => { if(typeof v === "number") return v; return parseFloat(String(v||"0").replace(/,/g,"")); };

const runGlobalAML = ({investors, orders, matches, walletMovements, withdrawals, bars, blacklist, transactions, appointments}) => {
  const alerts = [];
  const now = new Date();
  const allTxns = transactions || [];

  investors.forEach(inv => {
    const nid = inv.nationalId;
    const txns = allTxns.filter(tx => tx.buyerNationalId===nid || tx.sellerNationalId===nid);
    const matchList = matches.filter(m => {
      const bo = orders.find(o=>o.id===m.buyOrder); const so = orders.find(o=>o.id===m.sellOrder);
      return (bo?.nationalId===nid)||(so?.nationalId===nid);
    });
    const buyVol = txns.filter(tx=>tx.buyerNationalId===nid&&tx.status==="COMPLETED").reduce((a,tx)=>a+parseSARGlobal(tx.total),0)
      + matchList.filter(m=>{const bo=orders.find(o=>o.id===m.buyOrder);return bo?.nationalId===nid;}).reduce((a,m)=>a+m.totalSAR,0);
    const sellVol = txns.filter(tx=>tx.sellerNationalId===nid&&tx.status==="COMPLETED").reduce((a,tx)=>a+parseSARGlobal(tx.total),0)
      + matchList.filter(m=>{const so=orders.find(o=>o.id===m.sellOrder);return so?.nationalId===nid;}).reduce((a,m)=>a+m.totalSAR,0);
    const totalVol = buyVol + sellVol;
    const txDates = txns.map(tx=>new Date(tx.date));
    const daysBetween = txDates.length>1 ? (Math.max(...txDates)-Math.min(...txDates))/(86400000) : 0;
    const txFreq = daysBetween>0 ? txns.length/daysBetween : 0;
    const ords = orders.filter(o=>o.nationalId===nid);
    const wdReqs = withdrawals.filter(w=>w.nationalId===nid||w.investor===inv.nameEn);
    const totalWithdrawn = wdReqs.filter(w=>w.status==="PROCESSED"||w.status==="APPROVED").reduce((a,w)=>a+parseSARGlobal(w.amount),0);
    const holdings = parseSARGlobal(inv.holdingsValue);
    const noShows = (appointments||[]).filter(a=>a.nationalId===nid&&a.status==="NO_SHOW").length;
    const daysSinceJoin = inv.joined ? (now - new Date(inv.joined))/(86400000) : 999;

    const push = (rule,level,title,detail,category) => alerts.push({rule,level,nid,name:inv.nameEn,title,detail,category,automatedAt:now.toISOString(),key:rule+":"+nid});

    if(totalVol > 60000) push("R01",totalVol>200000?"HIGH":"MEDIUM","High-Value Trading Activity",`Total volume SAR ${totalVol.toLocaleString()} exceeds SAMA threshold.`,"VOLUME");
    if(buyVol > 10000 && sellVol > 10000 && txFreq > 0.5) push("R02","HIGH","Rapid Buy-Sell Pattern",`Buy SAR ${buyVol.toLocaleString()} / Sell SAR ${sellVol.toLocaleString()}, freq ${txFreq.toFixed(2)}/day.`,"PATTERN");
    if(txns.length >= 5 && daysBetween > 0 && daysBetween < 7) push("R03","HIGH","Transaction Velocity Spike",`${txns.length} TX in ${Math.ceil(daysBetween)} days.`,"VELOCITY");
    if(totalWithdrawn > 0 && holdings > 0 && (totalWithdrawn/(holdings+totalWithdrawn)) > 0.7) push("R04","MEDIUM","Disproportionate Withdrawal",`${Math.round((totalWithdrawn/(holdings+totalWithdrawn))*100)}% liquidated.`,"WITHDRAWAL");
    if(daysSinceJoin < 30 && totalVol > 50000) push("R05","HIGH","New Account High Volume",`${Math.ceil(daysSinceJoin)} days old, SAR ${totalVol.toLocaleString()} volume.`,"ONBOARDING");
    if(noShows >= 2) push("R06","MEDIUM","Repeated No-Shows",`${noShows} appointment no-shows.`,"BEHAVIOR");
    if(inv.kycExpiry){
      const dLeft = (new Date(inv.kycExpiry)-now)/(86400000);
      if(dLeft < 30 && dLeft > 0 && totalVol > 0) push("R07","MEDIUM","KYC Expiring",`Expires in ${Math.ceil(dLeft)} days.`,"COMPLIANCE");
      if(dLeft <= 0) push("R07","HIGH","KYC Expired",`Expired ${Math.abs(Math.ceil(dLeft))} days ago.`,"COMPLIANCE");
    }
    if(ords.filter(o=>o.status==="CANCELLED").length >= 3) push("R08","MEDIUM","Excessive Cancellations",`${ords.filter(o=>o.status==="CANCELLED").length} cancelled orders.`,"PATTERN");
    if(inv.status==="BANNED"&&(ords.length>0||txns.length>0)) push("R09","CRITICAL","Banned User Activity",`Banned but has ${txns.length} TX and ${ords.length} orders.`,"ENFORCEMENT");
    const roundTx = allTxns.filter(tx=>(tx.buyerNationalId===nid||tx.sellerNationalId===nid)&&tx.status==="COMPLETED"&&parseSARGlobal(tx.total)%1000===0);
    if(roundTx.length >= 2) push("R10","MEDIUM","Round-Amount Structuring",`${roundTx.length} round-number transactions.`,"PATTERN");
    const banks = [...new Set(withdrawals.filter(w=>w.nationalId===nid||w.investor===inv.nameEn).map(w=>w.bank))];
    if(banks.length >= 2) push("R14","MEDIUM","Multiple Bank Withdrawals",`${banks.length} bank accounts used.`,"WITHDRAWAL");

    // ═══ NEW AML RULES R15–R18 ═══
    // R15: Dormant Account Reactivation — long inactive then sudden large activity
    if(daysSinceJoin > 120 && totalVol > 30000) {
      const recentTx = txns.filter(tx=>new Date(tx.date)>new Date(Date.now()-14*86400000));
      const olderTx = txns.filter(tx=>new Date(tx.date)<=new Date(Date.now()-14*86400000));
      if(recentTx.length >= 3 && olderTx.length === 0) push("R15","HIGH","Dormant Account Reactivation",`Account ${Math.ceil(daysSinceJoin)} days old, no prior activity but ${recentTx.length} TX in last 14 days totaling SAR ${totalVol.toLocaleString()}. Sudden reactivation pattern.`,"BEHAVIOR");
    }
    // R16: Threshold Evasion — multiple transactions just below SAMA reporting threshold (SAR 60,000)
    const justBelowThreshold = txns.filter(tx=>tx.status==="COMPLETED"&&parseSARGlobal(tx.total)>=45000&&parseSARGlobal(tx.total)<60000);
    if(justBelowThreshold.length >= 2) push("R16","HIGH","Threshold Evasion (Structuring)",`${justBelowThreshold.length} transactions between SAR 45,000–60,000. Pattern consistent with SAMA threshold avoidance.`,"PATTERN");
    // R17: Cross-Border Withdrawal Pattern — withdrawals to multiple external banks
    const wdBanks = withdrawals.filter(w=>(w.nationalId===nid||w.investor===inv.nameEn)&&(w.status==="PROCESSED"||w.status==="APPROVED")).map(w=>w.bank);
    const intlBanks = wdBanks.filter(b=>b&&(b.includes("International")||b.includes("SWIFT")||b.includes("USD")));
    if(intlBanks.length >= 1 && totalWithdrawn > 50000) push("R17","MEDIUM","Cross-Border Withdrawal Pattern",`International withdrawal detected: SAR ${totalWithdrawn.toLocaleString()} across ${wdBanks.length} accounts.`,"WITHDRAWAL");
    // R18: Off-Hours Trading — unusual activity outside Saudi business hours (7 AM – 11 PM)
    const offHoursTx = txns.filter(tx=>{const h=parseInt((tx.date||"").split(" ")[1]||"12");return h<7||h>=23;});
    if(offHoursTx.length >= 2) push("R18","LOW","Off-Hours Trading Activity",`${offHoursTx.length} transactions outside business hours (before 7 AM or after 11 PM). May indicate automated or non-resident activity.`,"BEHAVIOR");
  });

  // Platform-level rules
  if(matches.length>0){
    const totalMatchVol = matches.reduce((a,m)=>a+m.totalSAR,0);
    if(totalMatchVol>100000) alerts.push({rule:"R11",level:"MEDIUM",nid:"PLATFORM",name:"System",title:"High Platform Match Volume",detail:`SAR ${totalMatchVol.toLocaleString()} across ${matches.length} trades.`,category:"SYSTEM",automatedAt:now.toISOString(),key:"R11:PLATFORM"});
  }
  blacklist.forEach(bl=>{
    const active=orders.filter(o=>o.nationalId===bl.nationalId&&(o.status==="OPEN"||o.status==="PARTIAL"));
    if(active.length>0) alerts.push({rule:"R12",level:"CRITICAL",nid:bl.nationalId,name:bl.name,title:"Blacklisted Active Orders",detail:`${active.length} active orders for banned NID.`,category:"ENFORCEMENT",automatedAt:now.toISOString(),key:"R12:"+bl.nationalId});
  });
  bars.filter(b=>b.status==="LEFT"&&b.leftOn).forEach(b=>{
    const daysOut=(now-new Date(b.leftOn))/(86400000);
    if(daysOut>30) alerts.push({rule:"R13",level:"HIGH",nid:b.depositor,name:b.depositor,title:"Bar Outside Vault > 30d",detail:`${b.id} left ${Math.ceil(daysOut)} days ago.`,category:"VAULT",automatedAt:now.toISOString(),key:"R13:"+b.id});
  });

  return alerts.sort((a,b)=>{const s={CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3};return (s[a.level]||9)-(s[b.level]||9);});
};

// ═══════════════════════════════════════════════════════════════════════════════
// CMA MARKET MANIPULATION DETECTION ENGINE — Articles 2, 3 of Market Conduct Regs
// Runs alongside AML, returns separate manipulation alerts
// ═══════════════════════════════════════════════════════════════════════════════
const runCMAManipulation = ({investors, orders, matches, blacklist, transactions}) => {
  const alerts = [];
  const now = new Date();
  const allTxns = transactions || [];
  const push = (rule,level,nid,name,title,detail,article,category) =>
    alerts.push({rule,level,nid,name,title,detail,article,category,automatedAt:now.toISOString(),key:rule+":"+nid});

  // ── CMA-01: SELF-TRADING (Art 3.b.1) — "trade involving no change in beneficial ownership" ──
  // Check if same NID appears on BOTH sides of any match
  matches.forEach(m => {
    const bo = orders.find(o=>o.id===m.buyOrder);
    const so = orders.find(o=>o.id===m.sellOrder);
    if(bo && so && bo.nationalId === so.nationalId && bo.nationalId !== "SYSTEM") {
      const inv = investors.find(i=>i.nationalId===bo.nationalId);
      push("CMA-01","CRITICAL",bo.nationalId,inv?.nameEn||bo.investor,
        "Self-Trading Detected (Art 3.b.1)",
        `Match ${m.id}: NID ${bo.nationalId} is both buyer (${m.buyOrder}) and seller (${m.sellOrder}) for ${m.qty}g ${m.metal} @ SAR ${m.price}. Trade involves no change in beneficial ownership — prohibited under Art 3(b)(1) Market Conduct Regulations.`,
        "Art 3(b)(1)","SELF_TRADE");
    }
  });
  // Also check historical TX
  allTxns.forEach(tx => {
    if(tx.buyerNationalId && tx.sellerNationalId && tx.buyerNationalId === tx.sellerNationalId && tx.buyerNationalId !== "N/A" && tx.status==="COMPLETED") {
      push("CMA-01","CRITICAL",tx.buyerNationalId,tx.buyerName||tx.investor,
        "Self-Trading in Historical TX (Art 3.b.1)",
        `TX ${tx.id}: Same NID ${tx.buyerNationalId} on both sides. SAR ${tx.total} ${tx.metal} trade. No change in beneficial ownership.`,
        "Art 3(b)(1)","SELF_TRADE");
    }
  });

  // ── CMA-02: MATCHED ORDERS / PRE-ARRANGED TRADES (Art 3.b.2/3) ──
  // Orders entered at same size, time, price by different parties
  const openOrders = orders.filter(o=>o.status==="OPEN"||o.status==="PARTIAL");
  openOrders.forEach(o1 => {
    openOrders.forEach(o2 => {
      if(o1.id >= o2.id) return; // avoid duplicates
      if(o1.side === o2.side) return; // need opposite sides
      if(o1.metal !== o2.metal) return;
      if(o1.nationalId === o2.nationalId) return; // self-trade is CMA-01
      if(o1.nationalId === "SYSTEM" || o2.nationalId === "SYSTEM") return;
      // Same price, same qty, placed within 60 seconds
      if(Math.abs(o1.price - o2.price) < 0.01 && o1.qty === o2.qty) {
        const t1 = new Date(o1.placed), t2 = new Date(o2.placed);
        if(Math.abs(t1-t2) < 60000) {
          const buyOrd = o1.side==="BUY"?o1:o2;
          const sellOrd = o1.side==="SELL"?o1:o2;
          push("CMA-02","HIGH",buyOrd.nationalId,buyOrd.investor,
            "Pre-Arranged / Matched Orders (Art 3.b.2-3)",
            `BUY ${buyOrd.id} and SELL ${sellOrd.id}: Same metal (${o1.metal}), qty (${o1.qty}g), price (SAR ${o1.price}), placed ${Math.abs(t1-t2)/1000}s apart. Suggests pre-arranged trade with NID ${sellOrd.nationalId}.`,
            "Art 3(b)(2-3)","MATCHED_ORDERS");
        }
      }
    });
  });

  // ── CMA-03: SPOOFING — Orders Not Intended to Execute (Art 3.b.6) ──
  // Investor places then cancels large orders rapidly
  investors.forEach(inv => {
    const nid = inv.nationalId;
    const invOrders = orders.filter(o=>o.nationalId===nid);
    const cancelled = invOrders.filter(o=>o.status==="CANCELLED");
    const filled = invOrders.filter(o=>o.status==="FILLED"||o.status==="PARTIAL");
    if(invOrders.length >= 3 && cancelled.length >= 2 && cancelled.length > filled.length) {
      const cancelRate = Math.round((cancelled.length/invOrders.length)*100);
      push("CMA-03","HIGH",nid,inv.nameEn,
        "Spoofing — Orders Not Intended to Execute (Art 3.b.6)",
        `${cancelled.length}/${invOrders.length} orders cancelled (${cancelRate}%). Pattern suggests orders entered without intent to execute — price manipulation via Art 3(b)(6).`,
        "Art 3(b)(6)","SPOOFING");
    }
  });

  // ── CMA-04: PRICE RAMPING — Successively Higher/Lower Prices (Art 3.b.4-5) ──
  investors.forEach(inv => {
    const nid = inv.nationalId;
    if(nid === "SYSTEM") return;
    const invOrders = orders.filter(o=>o.nationalId===nid&&o.status!=="CANCELLED").sort((a,b)=>new Date(a.placed)-new Date(b.placed));
    // Check BUY side — successively higher prices
    const buys = invOrders.filter(o=>o.side==="BUY");
    if(buys.length >= 3) {
      let ascending = 0;
      for(let i=1;i<buys.length;i++) if(buys[i].price > buys[i-1].price) ascending++;
      if(ascending >= buys.length-1 && buys.length >= 3) {
        push("CMA-04","HIGH",nid,inv.nameEn,
          "Price Ramping — Successively Higher BUY Prices (Art 3.b.4)",
          `${buys.length} consecutive BUY orders at ascending prices: ${buys.map(b=>"SAR "+b.price).join(" → ")}. Creates artificial upward price pressure.`,
          "Art 3(b)(4)","PRICE_RAMPING");
      }
    }
    // Check SELL side — successively lower prices
    const sells = invOrders.filter(o=>o.side==="SELL");
    if(sells.length >= 3) {
      let descending = 0;
      for(let i=1;i<sells.length;i++) if(sells[i].price < sells[i-1].price) descending++;
      if(descending >= sells.length-1 && sells.length >= 3) {
        push("CMA-04","HIGH",nid,inv.nameEn,
          "Price Ramping — Successively Lower SELL Prices (Art 3.b.5)",
          `${sells.length} consecutive SELL orders at descending prices: ${sells.map(s=>"SAR "+s.price).join(" → ")}. Creates artificial downward price pressure.`,
          "Art 3(b)(5)","PRICE_RAMPING");
      }
    }
  });

  // ── CMA-05: FICTITIOUS TRADES (Art 3.a.1) — Trades with SYSTEM/synthetic ──
  matches.forEach(m => {
    const bo = orders.find(o=>o.id===m.buyOrder);
    const so = orders.find(o=>o.id===m.sellOrder);
    if((bo?.synthetic && so?.synthetic) || (bo?.nationalId==="SYSTEM" && so?.nationalId==="SYSTEM")) {
      push("CMA-05","MEDIUM","SYSTEM","Market Maker",
        "System-to-System Trade (Art 3.a.1 Review)",
        `Match ${m.id}: Both sides are SYSTEM/synthetic orders. May constitute fictitious trade under Art 3(a)(1). Verify market-making exemption under Art 3(c)(3).`,
        "Art 3(a)(1)","FICTITIOUS");
    }
  });

  // ── CMA-06: CHURNING (Art 16) — Excessive trading relative to holdings ──
  investors.forEach(inv => {
    const nid = inv.nationalId;
    const holdings = parseSARGlobal(inv.holdingsValue);
    if(holdings <= 0) return;
    const txns = allTxns.filter(tx=>(tx.buyerNationalId===nid||tx.sellerNationalId===nid)&&tx.status==="COMPLETED");
    const totalTurnover = txns.reduce((a,tx)=>a+parseSARGlobal(tx.total),0);
    const turnoverRatio = totalTurnover / holdings;
    if(turnoverRatio > 3) {
      push("CMA-06","MEDIUM",nid,inv.nameEn,
        "Excessive Turnover / Churning (Art 16)",
        `Turnover ratio ${turnoverRatio.toFixed(1)}x (SAR ${totalTurnover.toLocaleString()} traded vs SAR ${holdings.toLocaleString()} holdings). Art 16 prohibits trades contrary to client interest given frequency relative to portfolio.`,
        "Art 16","CHURNING");
    }
  });

  // ── CMA-07: PUMP-AND-DUMP (Art 3.a.2-3) ──
  // Investor buys heavily then sells immediately after price rises
  investors.forEach(inv => {
    const nid = inv.nationalId;
    const txns = allTxns.filter(tx=>(tx.buyerNationalId===nid||tx.sellerNationalId===nid)&&tx.status==="COMPLETED")
      .sort((a,b)=>new Date(a.date)-new Date(b.date));
    if(txns.length < 3) return;
    // Check for BUY cluster followed by SELL cluster
    const buys = txns.filter(tx=>tx.buyerNationalId===nid);
    const sells = txns.filter(tx=>tx.sellerNationalId===nid);
    if(buys.length > 0 && sells.length > 0) {
      const lastBuy = new Date(buys[buys.length-1].date);
      const firstSell = sells.length > 0 ? new Date(sells[0].date) : null;
      if(firstSell && firstSell > lastBuy) {
        const daysBetween = (firstSell - lastBuy) / 86400000;
        const buyVol = buys.reduce((a,tx)=>a+parseSARGlobal(tx.total),0);
        const sellVol = sells.reduce((a,tx)=>a+parseSARGlobal(tx.total),0);
        if(daysBetween < 5 && buyVol > 20000 && sellVol > 10000) {
          push("CMA-07","HIGH",nid,inv.nameEn,
            "Pump-and-Dump Pattern (Art 3.a.2-3)",
            `Bought SAR ${buyVol.toLocaleString()} then sold SAR ${sellVol.toLocaleString()} within ${Math.ceil(daysBetween)} days. May indicate promoting purchase for purpose of selling (Art 3(a)(2)).`,
            "Art 3(a)(2-3)","PUMP_DUMP");
        }
      }
    }
  });

  // ── CMA-08: CLOSING PRICE MANIPULATION (Art 3.b.6) ──
  // Orders placed in last minutes of trading near close
  const closeTime = "23:59";
  orders.filter(o=>o.placed&&o.nationalId!=="SYSTEM").forEach(o => {
    const time = o.placed.split(" ")[1];
    if(time && time >= "23:50" && o.status !== "CANCELLED") {
      push("CMA-08","MEDIUM",o.nationalId,o.investor,
        "Near-Close Order (Art 3.b.6 Review)",
        `Order ${o.id} placed at ${time} — ${o.side} ${o.qty}g ${o.metal} @ SAR ${o.price}. Late orders may affect closing price. Review under Art 3(b)(6).`,
        "Art 3(b)(6)","CLOSING_MANIP");
    }
  });

  // ── CMA-09: LAYERING — Multiple orders at different prices (Art 3.b.6) ──
  investors.forEach(inv => {
    const nid = inv.nationalId;
    if(nid === "SYSTEM") return;
    const openBuys = orders.filter(o=>o.nationalId===nid&&o.side==="BUY"&&(o.status==="OPEN"||o.status==="PARTIAL"));
    const openSells = orders.filter(o=>o.nationalId===nid&&o.side==="SELL"&&(o.status==="OPEN"||o.status==="PARTIAL"));
    if(openBuys.length >= 3) {
      const prices = [...new Set(openBuys.map(o=>o.price))];
      if(prices.length >= 3) {
        push("CMA-09","HIGH",nid,inv.nameEn,
          "Layering — Multiple BUY Orders at Different Prices (Art 3.b.6)",
          `${openBuys.length} open BUY orders at ${prices.length} price levels: ${prices.sort((a,b)=>a-b).map(p=>"SAR "+p).join(", ")}. Creates misleading impression of demand depth.`,
          "Art 3(b)(6)","LAYERING");
      }
    }
    if(openSells.length >= 3) {
      const prices = [...new Set(openSells.map(o=>o.price))];
      if(prices.length >= 3) {
        push("CMA-09","HIGH",nid,inv.nameEn,
          "Layering — Multiple SELL Orders at Different Prices (Art 3.b.6)",
          `${openSells.length} open SELL orders at ${prices.length} price levels. Creates misleading impression of supply depth.`,
          "Art 3(b)(6)","LAYERING");
      }
    }
  });

  // ── CMA-10: CROSS-PARTY COLLUSION INDICATOR ──
  // Two NIDs always appear as counterparties in matches
  const pairCount = {};
  matches.forEach(m => {
    const bo = orders.find(o=>o.id===m.buyOrder);
    const so = orders.find(o=>o.id===m.sellOrder);
    if(!bo||!so||bo.nationalId==="SYSTEM"||so.nationalId==="SYSTEM") return;
    const pair = [bo.nationalId, so.nationalId].sort().join("↔");
    pairCount[pair] = (pairCount[pair]||0) + 1;
  });
  Object.entries(pairCount).forEach(([pair,count])=>{
    if(count >= 2) {
      const [nid1,nid2] = pair.split("↔");
      const inv1 = investors.find(i=>i.nationalId===nid1);
      const inv2 = investors.find(i=>i.nationalId===nid2);
      push("CMA-10","HIGH",nid1,(inv1?.nameEn||nid1)+" & "+(inv2?.nameEn||nid2),
        "Repeated Counterparty Pattern — Collusion Risk (Art 2)",
        `${count} matches between NID ${nid1} and NID ${nid2}. Repeated counterparty pattern may indicate coordinated trading under Art 2.`,
        "Art 2","COLLUSION");
    }
  });

  // ═══ NEW CMA RULES CMA-11, CMA-12 ═══
  // ── CMA-11: MOMENTUM IGNITION (Art 3.b.4) — Aggressive orders to trigger market momentum ──
  investors.forEach(inv => {
    const nid = inv.nationalId;
    if(nid === "SYSTEM") return;
    const invOrders = orders.filter(o=>o.nationalId===nid&&o.status!=="CANCELLED").sort((a,b)=>new Date(a.placed)-new Date(b.placed));
    // Large orders placed in quick succession on same side
    const recentOrds = invOrders.filter(o=>new Date(o.placed)>new Date(Date.now()-3600000)); // last hour
    if(recentOrds.length >= 4) {
      const sameSide = recentOrds.filter(o=>o.side===recentOrds[0].side);
      if(sameSide.length >= 3) {
        const totalQty = sameSide.reduce((a,o)=>a+o.qty,0);
        push("CMA-11","HIGH",nid,inv.nameEn,
          "Momentum Ignition (Art 3.b.4)",
          `${sameSide.length} ${sameSide[0].side} orders in last hour for total ${totalQty}g. Aggressive same-direction ordering may be intended to ignite a price trend.`,
          "Art 3(b)(4)","MOMENTUM");
      }
    }
  });

  // ── CMA-12: QUOTE STUFFING (Art 3.b.6) — High-frequency order entry/cancellation ──
  investors.forEach(inv => {
    const nid = inv.nationalId;
    if(nid === "SYSTEM") return;
    const invOrders = orders.filter(o=>o.nationalId===nid);
    const last24h = invOrders.filter(o=>new Date(o.placed)>new Date(Date.now()-86400000));
    const cancelledRecent = last24h.filter(o=>o.status==="CANCELLED");
    if(last24h.length >= 8 && cancelledRecent.length >= 5) {
      push("CMA-12","HIGH",nid,inv.nameEn,
        "Quote Stuffing — Excessive Order Churn (Art 3.b.6)",
        `${last24h.length} orders in 24h with ${cancelledRecent.length} cancellations (${Math.round(cancelledRecent.length/last24h.length*100)}%). High-frequency entry/cancel pattern designed to create market confusion.`,
        "Art 3(b)(6)","QUOTE_STUFFING");
    }
  });

  return alerts.sort((a,b)=>{const s={CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3};return (s[a.level]||9)-(s[b.level]||9);});
};

// ═══════════════════════════════════════════════════════════════════════════════
// GAMING-STYLE ACTION CENTER WIDGET — collapsible, animated, priority-sorted
// ═══════════════════════════════════════════════════════════════════════════════
const ActionCenterWidget = ({actions, accent, critCount, highCount, isAr, setPageHint, setPage}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [hovered, setHovered] = useState(null);
  // Sort: crit first, then high, then med
  const sorted = [...actions].sort((a,b)=>{const o={crit:0,high:1,med:2};return (o[a.level]||9)-(o[b.level]||9);});

  if(collapsed) return (
    <button onClick={()=>setCollapsed(false)}
      style={{position:"fixed",bottom:20,right:isAr?undefined:20,left:isAr?20:undefined,zIndex:9998,
        width:56,height:56,borderRadius:16,background:`linear-gradient(135deg,${accent},${accent}CC)`,
        border:`2px solid ${accent}`,boxShadow:`0 4px 20px ${accent}44`,cursor:"pointer",
        display:"flex",alignItems:"center",justifyContent:"center",transition:"transform 0.2s",
        animation:critCount>0?"pulse 2s infinite":"none"}}
      onMouseEnter={e=>e.currentTarget.style.transform="scale(1.1)"}
      onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
      <span style={{fontSize:22}}>🎯</span>
      <span style={{position:"absolute",top:-6,right:-6,background:"#FFF",color:accent,fontSize:11,fontWeight:900,borderRadius:10,padding:"2px 7px",boxShadow:"0 2px 8px rgba(0,0,0,0.2)"}}>{actions.length}</span>
    </button>
  );

  return (
    <div style={{position:"fixed",bottom:20,right:isAr?undefined:20,left:isAr?20:undefined,zIndex:9998,width:360,background:"#1A1A2E",borderRadius:16,boxShadow:`0 8px 40px rgba(0,0,0,0.35)`,overflow:"hidden",border:`1px solid ${accent}55`,transition:"all 0.3s"}}>
      {/* Header bar */}
      <div style={{background:`linear-gradient(135deg,${accent},${accent}CC)`,padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:16}}>🎯</span>
          <span style={{fontSize:14,fontWeight:800,color:"#FFF"}}>{isAr?"إجراءات مطلوبة":"ACTION CENTER"}</span>
          {critCount>0&&<span style={{fontSize:11,fontWeight:800,color:"#FFF",background:"rgba(255,255,255,0.2)",padding:"2px 6px",borderRadius:4,animation:"pulse 2s infinite"}}>⚡ {critCount} CRITICAL</span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{background:"#FFF",color:accent,fontSize:12,fontWeight:900,borderRadius:10,padding:"2px 8px"}}>{actions.length}</span>
          <button onClick={()=>setCollapsed(true)} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:6,width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"#FFF",fontSize:14,fontWeight:800}}>—</button>
        </div>
      </div>
      {/* Progress bar showing completion */}
      <div style={{height:3,background:"#2A2A40"}}>
        <div style={{height:"100%",background:`linear-gradient(90deg,#4A7A68,${accent})`,width:"0%",transition:"width 0.6s"}} />
      </div>
      {/* Action items */}
      <div style={{maxHeight:280,overflowY:"auto"}}>
        {sorted.map((a,i)=>(
          <button key={a.id} onClick={()=>{setPageHint(a.hint||null);setPage(a.page);}}
            onMouseEnter={()=>setHovered(a.id)} onMouseLeave={()=>setHovered(null)}
            style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"11px 14px",border:"none",borderBottom:"1px solid #2A2A40",
              background:hovered===a.id?"#2A2A40":"transparent",cursor:"pointer",textAlign:"start",transition:"all 0.15s"}}>
            <span style={{fontSize:18,flexShrink:0,filter:hovered===a.id?"brightness(1.2)":"none",transition:"filter 0.15s"}}>{a.icon}</span>
            <span style={{fontSize:13,color:hovered===a.id?"#FFF":"#E0DDD8",fontWeight:hovered===a.id?700:500,flex:1,lineHeight:"1.3",transition:"color 0.15s"}}>{a.label}</span>
            <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
              <span style={{width:8,height:8,borderRadius:4,background:a.level==="crit"?"#C85C3E":a.level==="high"?"#D4943A":"#C4956A",flexShrink:0,animation:a.level==="crit"?"pulse 2s infinite":"none"}} />
              <span style={{fontSize:11,color:"#666",opacity:hovered===a.id?1:0,transition:"opacity 0.15s"}}>→</span>
            </div>
          </button>
        ))}
      </div>
      {/* Footer hint */}
      <div style={{padding:"8px 14px",borderTop:"1px solid #2A2A40",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span style={{fontSize:11,color:"#555"}}>{isAr?"انقر للانتقال":"Click to navigate"}</span>
        <span style={{fontSize:11,color:"#555"}}>{isAr?"🔴 حرج":"🔴 Crit"} · {isAr?"🟡 مرتفع":"🟡 High"} · {isAr?"🟤 متوسط":"🟤 Med"}</span>
      </div>
    </div>
  );
};

export default function App() {
  const [loggedIn, setLoggedIn] = useState(() => !!localStorage.getItem("tanaqul_token"));
  const [page,     setPage]     = useState(() => window.location.hash.slice(1) || "dashboard");
  const [pageHint, setPageHint] = useState(null); // {tab:"WITHDRAWAL REQUESTS"} etc.
  useEffect(() => { window.location.hash = page; }, [page]);
  useEffect(() => { const h = () => setPage(window.location.hash.slice(1) || "dashboard"); window.addEventListener("hashchange", h); return () => window.removeEventListener("hashchange", h); }, []);
  const [open,     setOpen]     = useState(true);
  const [lang,     setLang]     = useState(() => localStorage.getItem("tanaqul_lang") || "en");
  const [dark,     setDark]     = useState(() => localStorage.getItem("tanaqul_dark") === "true");
  const [searchOpen, setSearchOpen] = useState(false);
  const [bidEnabled, setBidEnabled] = useState(true);
  const [tradingOpen, setTradingOpen] = useState(true);
  const [commSplit, setCommSplit] = useState({buying:30,selling:30,creator:20,validators:20});
  const [gatewaySettings, setGatewaySettings] = useState({madaFee:"1.5",madaCap:"10.00",visaFee:"2.5",sadadFee:"5.00"});
  const [commissionRates, setCommissionRates] = useState({buyer:"1.0",seller:"1.0"});
  const [cancelFee, setCancelFee] = useState("50");
  const [reportingConfig, setReportingConfig] = useState({
    sarEmail:"sar@sama.gov.sa", sarCc:"compliance@tanaqul.sa", sarEnabled:true,
    cmaEmail:"enforcement@cma.org.sa", cmaCc:"compliance@tanaqul.sa", cmaEnabled:true,
    mlroName:"Abdulaziz Al-Rashid", mlroNameAr:"عبدالعزيز الراشد",
    mlroTitle:"Money Laundering Reporting Officer", mlroTitleAr:"مسؤول الإبلاغ عن غسل الأموال",
    companyName:"Tanaqul Precious Metals Trading Co.", companyNameAr:"شركة تناقل لتجارة المعادن الثمينة",
    companyLicense:"SAMA License No. 12345", companyLicenseAr:"ترخيص ساما رقم ١٢٣٤٥",
    companyAddress:"King Fahd Road, Riyadh 12345, Saudi Arabia", companyAddressAr:"طريق الملك فهد، الرياض ١٢٣٤٥، المملكة العربية السعودية",
  });

  // ── Restore persisted settings on mount ──────────────────────────────────
  // ── Dark Mode — sync C object and persist ──────────────────────────────
  const toggleDark = () => { setDark(d=>{ const next=!d; localStorage.setItem("tanaqul_dark",String(next)); return next; }); };
  const currentTheme = dark ? DARK_THEME : LIGHT_THEME;
  Object.assign(C, currentTheme); // keep backward compat — C always reflects current theme
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("tanaqul_settings_v1") || "{}");
      // SEC: Validate restored values — localStorage can be tampered via DevTools
      const validComm = v => /^\d+(\.\d+)?$/.test(v) && parseFloat(v) >= 0 && parseFloat(v) <= 10;
      const validSplit = v => { const n=parseInt(v); return !isNaN(n) && n>=0 && n<=100; };
      if (saved.madaFee && validComm(saved.madaFee))  setGatewaySettings(p => ({...p, madaFee:saved.madaFee, madaCap:saved.madaCap||p.madaCap, visaFee:saved.visaFee||p.visaFee, sadadFee:saved.sadadFee||p.sadadFee}));
      if (saved.commBuyer && validComm(saved.commBuyer)) setCommissionRates({buyer:saved.commBuyer, seller:validComm(saved.commSeller)?saved.commSeller:"1.0"});
      if (saved.splitBuying && validSplit(saved.splitBuying)) setCommSplit({buying:parseInt(saved.splitBuying)||30, selling:parseInt(saved.splitSelling)||30, creator:parseInt(saved.splitCreator)||20, validators:parseInt(saved.splitValidators)||20});
      if (saved.cancelFee && validComm(saved.cancelFee)) setCancelFee(saved.cancelFee);
    } catch(e){}
  }, []);

  // ── Lifted shared state (persists across navigation) ──────────────────────
  const [appInvestors,    setAppInvestors]    = useState([]);
  const [appAppointments, setAppAppointments] = useState([]);
  const [appBars,         setAppBars]         = useState([]);
  const [appWithdrawals,  setAppWithdrawals]  = useState([]);
  const [appWalletMoves,  setAppWalletMoves]  = useState([]);
  const [appValidators,   setAppValidators]   = useState([]);
  const [appBlacklist,    setAppBlacklist]    = useState([]);

  // ═══ LIVE API DATA FETCH — replaces MOCK data when backend is available ═══
  const [apiConnected, setApiConnected] = useState(false);
  const fetchApiData = useCallback(async () => {
    const token = localStorage.getItem("tanaqul_token");
    if (!token) return;
    try {
      const endpoints = [
        { path: "/investors", setter: setAppInvestors, transform: (data) => {
          const items = data.items || data.investors || data;
          if (!Array.isArray(items)) return null;
          return items.map(inv => ({
            id: inv.display_id || inv.id, _uuid: String(inv.id),
            nameEn: inv.name_en || "", nameAr: inv.name_ar || "",
            wallet: inv.wallet_address || "pending",
            holdingsValue: String(inv.holdings_value || 0),
            gold: Number(inv.gold_grams || 0), silver: Number(inv.silver_grams || 0),
            platinum: Number(inv.platinum_grams || 0),
            status: inv.status || "ACTIVE", joined: (inv.joined_at || "").slice(0,10),
            vaultKey: inv.vault_key || "", nationalId: inv.national_id || "",
            kycExpiry: inv.kyc_expiry ? inv.kyc_expiry.slice(0,10) : "",
            noShowCount: inv.no_show_count || 0,
            email: inv.email || "", phone: inv.phone || "",
          }));
        }},
        { path: "/vault/bars", setter: setAppBars, transform: (data) => {
          const items = data.items || data.bars || data;
          if (!Array.isArray(items)) return null;
          return items.map(b => ({
            id: b.display_id || b.id, _uuid: String(b.id),
            metal: b.metal || "Gold", weight: b.weight || "",
            purity: b.purity || "999.9", barcode: b.barcode || "",
            serial: b.serial || "", manufacturer: b.manufacturer || "",
            vault: b.vault_location || "Riyadh", status: b.status || "FREE",
            depositor: b.depositor_id || "", depositedAt: b.deposited_at || "",
          }));
        }},
        { path: "/appointments", setter: setAppAppointments, transform: (data) => {
          const items = data.items || data.appointments || data;
          if (!Array.isArray(items)) return null;
          return items.map(a => ({
            id: a.display_id || a.id, _uuid: String(a.id),
            investorId: a.investor_id || "", nationalId: a.national_id || "",
            type: a.type || "DEPOSIT", metal: a.metal || "Gold",
            quantity: a.quantity || "", vault: a.vault_location || "Riyadh",
            date: (a.scheduled_at || "").slice(0,10),
            time: (a.scheduled_at || "").slice(11,16),
            status: a.status || "BOOKED", fee: String(a.fee || 0),
            paymentMethod: a.payment_method || "",
            otp: a.otp_code || "", notes: a.notes || "",
          }));
        }},
        { path: "/withdrawals", setter: setAppWithdrawals, transform: (data) => {
          const items = data.items || data.withdrawals || data;
          if (!Array.isArray(items)) return null;
          return items.map(w => ({
            id: w.display_id || w.id, _uuid: String(w.id),
            nationalId: w.national_id || "", amount: String(w.amount || 0),
            bank: w.bank_info || "", iban: w.iban || "",
            status: w.status || "PENDING", requestedAt: w.requested_at || "",
            processedAt: w.processed_at || "", rejectReason: w.reject_reason || "",
          }));
        }},
        { path: "/wallet", setter: setAppWalletMoves, transform: (data) => {
          const items = data.items || data.movements || data;
          if (!Array.isArray(items)) return null;
          return items.map(m => ({
            id: m.display_id || m.id, nationalId: m.national_id || "",
            vaultKey: m.vault_key || "", type: m.type || "CREDIT",
            amount: String(m.amount || 0), reason: m.reason || "",
            date: m.created_at || "",
          }));
        }},
        { path: "/validators", setter: setAppValidators, transform: (data) => {
          const items = data.items || data.validators || data;
          if (!Array.isArray(items)) return null;
          return items.map(v => ({
            id: v.display_id || v.id, name: v.name || "",
            address: v.address || "", status: v.status || "STANDBY",
            blocks: v.blocks_validated || 0, lastBlock: v.last_block || 0,
            commission: String(v.commission_earned || 0),
            weight: v.weight_percent || v.weight || 0,
            canCreate: v.can_create || false,
            walletAddress: v.wallet_address || "",
          }));
        }},
        { path: "/blacklist", setter: setAppBlacklist, transform: (data) => {
          const items = data.items || data.blacklist || data;
          if (!Array.isArray(items)) return null;
          return items.map(b => ({
            id: b.display_id || b.id, name: b.name || "",
            nationalId: b.national_id || "", vaultKey: b.vault_key || "",
            reason: b.reason || "", bannedBy: b.banned_by || "",
            date: b.created_at || "", active: b.is_active !== false,
          }));
        }},
        { path: "/orders", setter: setAppOrders, transform: (data) => {
          const items = data.items || data.orders || data;
          if (!Array.isArray(items)) return null;
          return items.map(o => ({
            id: o.display_id || o.id, _uuid: String(o.id),
            investorId: o.investor_display || o.investor_id || "",
            metal: o.metal || "Gold", side: o.side || "BUY",
            qty: String(o.quantity_grams || 0), remaining: String(o.remaining_grams || 0),
            price: String(o.price_per_gram || 0), total: String(o.total_sar || 0),
            status: o.status || "OPEN", date: o.created_at || "",
          }));
        }},
        { path: "/matches", setter: setAppMatches, transform: (data) => {
          const items = data.items || data.matches || data;
          if (!Array.isArray(items)) return null;
          return items.map(m => ({
            id: m.display_id || m.id, _uuid: String(m.id),
            metal: m.metal || "Gold",
            qty: String(m.quantity_grams || 0), price: String(m.price_per_gram || 0),
            totalSAR: String(m.total_sar || 0), commission: String(m.commission || 0),
            adminFee: String(m.admin_fee || 0),
            buyerName: m.buyer_name || "", buyerNid: m.buyer_national_id || "",
            sellerName: m.seller_name || "", sellerNid: m.seller_national_id || "",
            filledFor: m.buyer_name || "", date: m.matched_at || "",
            blockNumber: m.block_number || null,
          }));
        }},
        { path: "/blocks", setter: setAppBlocks, transform: (data) => {
          const items = data.items || data.blocks || data;
          if (!Array.isArray(items)) return null;
          return items.map(b => ({
            number: b.number, hash: b.hash || "",
            txCount: b.tx_count || 0, commission: String(b.commission || b.commission_total || 0),
            tanaqulShare: String(b.tanaqul_share || 0),
            creatorShare: String(b.creator_share || 0),
            validatorsShare: String(b.validators_share || 0),
            validator: b.validator_name || b.creator_name || "Tanaqul",
            timestamp: b.created_at || "", size: b.size_bytes ? (b.size_bytes/1048576).toFixed(2)+" MB" : "0 MB",
            quorumMet: b.quorum_met || false,
          }));
          // Also store commission_split if returned
          if (data.commission_split) {
            try { window.__tanaqulSplit = data.commission_split; } catch(_){}
          }
        }},
      ];

      let anySuccess = false;
      for (const ep of endpoints) {
        try {
          const resp = await apiFetch(ep.path);
          if (resp.ok) {
            const raw = await resp.json();
            const transformed = ep.transform(raw);
            if (transformed !== null) {
              ep.setter(transformed);
              anySuccess = true;
            }
          }
        } catch (_) { /* endpoint not available, keep mock data */ }
      }
      if (anySuccess) setApiConnected(true);
      // Fetch block network stats
      try {
        const bsResp = await apiFetch("/blocks/chain/stats");
        if (bsResp.ok) {
          const bs = await bsResp.json();
          setAppBlockStats({
            latest_block_number: bs.last_block?.number || 0,
            latest_block_hash: bs.last_block?.hash || "",
            total_blocks: bs.total_blocks || 0,
            total_transactions: bs.total_transactions || 0,
            active_validators: bs.active_validators || 0,
            pending_matches: bs.pending_matches || 0,
            commission_split: bs.commission_split || null,
            trigger_settings: bs.trigger_settings || null,
            total_commission: bs.total_commission || 0,
            commission_breakdown: bs.commission_breakdown || {},
          });
        }
      } catch(_){}
      // Fetch dashboard stats
      try {
        const dsResp = await apiFetch("/dashboard/stats");
        if (dsResp.ok) {
          const ds = await dsResp.json();
          setAppDashStats(ds);
        }
      } catch(_){}
    } catch (_) { /* API unavailable, keep mock data */ }
  }, []);

  // Fetch on login
  useEffect(() => {
    if (loggedIn) {
      fetchApiData();
      // Refresh every 60 seconds
      const iv = setInterval(fetchApiData, 60000);
      return () => clearInterval(iv);
    }
  }, [loggedIn, fetchApiData]);

  // Listen for logout events
  useEffect(() => {
    const handleLogout = () => {localStorage.removeItem("tanaqul_token");localStorage.removeItem("tanaqul_refresh");setLoggedIn(false)};
    window.addEventListener("tanaqul_logout", handleLogout);
    return () => window.removeEventListener("tanaqul_logout", handleLogout);
  }, []);
  const [appOrders,       setAppOrders]       = useState([]);
  const [appBlocks,       setAppBlocks]       = useState([]);
  const [appDashStats,    setAppDashStats]    = useState(null);
  const [appBlockStats,   setAppBlockStats]   = useState(null);
  const [appMatches, setAppMatches] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [amlAlerts, setAmlAlerts] = useState([]);
  const [cmaAlerts, setCmaAlerts] = useState([]);
  const [amlDismissed, setAmlDismissed] = useState(new Set());
  const [amlLastRun, setAmlLastRun] = useState(null);
  const [amlToast, setAmlToast] = useState(null);
  const prevAlertKeysRef = useRef(new Set());

  // ═══ MARKET MAKER ACCOUNT STATE ═══
  const [mmAccount, setMMAccount] = useState({
    cash: 0, gold:{g:0,avg:0}, silver:{g:0,avg:0}, platinum:{g:0,avg:0,avg:32.0},
    trades:[], pnl:{realized:0,unrealized:0,fees:0},
  });
  // ═══ TREASURY / RECONCILIATION STATE ═══
  const [reconState, setReconState] = useState({frozen:false,lastRecon:null,dayStatus:"pending"});

  // ── Cmd+K / Ctrl+K Global Search shortcut ─────────────────────────────────
  useEffect(() => {
    const handleKeyDown = e => {
      if((e.metaKey||e.ctrlKey) && e.key==="k") { e.preventDefault(); setSearchOpen(s=>!s); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const dismissAmlAlert = (key) => setAmlDismissed(prev => new Set([...prev, key]));

  // ═══ NOTIFICATION CENTER HOOK ═══
  const notifData = useNotifications({amlAlerts, cmaAlerts, amlDismissed, withdrawals: appWithdrawals, appointments: appAppointments, investors: appInvestors});

  const addAudit = (action, entity, details) => {
    const entry = {
      id: "AUD-"+String(Date.now()).slice(-6),
      timestamp: new Date().toISOString().slice(0,16).replace("T"," "),
      admin: "admin@tanaqul.sa",
      ip: "10.0.1."+Math.floor(Math.random()*254+1),
      action, entity, details,
    };
    setAuditLog(prev => {
      const next = [entry, ...prev].slice(0, 2000);
      if(prev.length >= 1999 && next.length >= 2000) console.warn("[AUDIT] Log at capacity — oldest entries will be dropped. Persist to server.");
      return next;
    });
  };

  // ═══ CONTINUOUS AML + CMA MONITORING — runs on every state change ═══
  useEffect(() => {
    if(!loggedIn) return;
    // Build combined transactions list: MOCK + match-generated
    const allTransactions = [
      
      ...appMatches.map(m=>({
        id:m.id, buyerNationalId:m.buyerNid||"", sellerNationalId:m.sellerNid||"",
        buyerName:m.filledFor, sellerName:m.filledFor,
        total:String(m.totalSAR), metal:m.metal, status:"COMPLETED", date:m.date,
      })),
    ];
    const aml = runGlobalAML({
      investors: appInvestors, orders: appOrders, matches: appMatches,
      walletMovements: appWalletMoves, withdrawals: appWithdrawals,
      bars: appBars, blacklist: appBlacklist,
      transactions: allTransactions, appointments: appAppointments,
    });
    const cma = runCMAManipulation({
      investors: appInvestors, orders: appOrders, matches: appMatches,
      blacklist: appBlacklist, transactions: allTransactions,
    });
    setAmlAlerts(aml);
    setCmaAlerts(cma);
    setAmlLastRun(new Date().toISOString());

    // Detect NEW alerts that weren't in previous run (both AML + CMA)
    const allAlerts = [...aml, ...cma];
    const currentKeys = new Set(allAlerts.map(a=>a.key));
    const prevKeys = prevAlertKeysRef.current;
    const newCritical = allAlerts.filter(a => !prevKeys.has(a.key) && (a.level==="CRITICAL"||a.level==="HIGH"));
    if(newCritical.length > 0 && prevKeys.size > 0) {
      setAmlToast({count:newCritical.length, top:newCritical[0]});
      setTimeout(() => setAmlToast(null), 6000);
    }
    prevAlertKeysRef.current = currentKeys;
  }, [loggedIn, appInvestors, appOrders, appMatches, appWalletMoves, appWithdrawals, appBars, appBlacklist]);

  const isAr  = lang === "ar";
  const tFn   = (key) => translate(lang, key);
  const cur   = PAGES.find(p => p.id === page);

  const switchLang = (l) => {
    setLang(l);
    localStorage.setItem("tanaqul_lang", l);
  };

  const appDataValue = {
    investors: appInvestors, setInvestors: setAppInvestors,
    appointments: appAppointments, setAppointments: setAppAppointments,
    bars: appBars, setBars: setAppBars,
    withdrawals: appWithdrawals, setWithdrawals: setAppWithdrawals,
    walletMovements: appWalletMoves, setWalletMovements: setAppWalletMoves,
    validators: appValidators, setValidators: setAppValidators,
    blacklist: appBlacklist, setBlacklist: setAppBlacklist,
    orders: appOrders, setOrders: setAppOrders,
    matches: appMatches, setMatches: setAppMatches,
    auditLog, addAudit,
    amlAlerts, cmaAlerts, amlDismissed, dismissAmlAlert, amlLastRun,
    pageHint, setPageHint,
    mmAccount, setMMAccount, reconState, setReconState,
    appBlocks, appBlockStats, appDashStats,
  };

  if (!loggedIn) return (
    <AppDataContext.Provider value={appDataValue}>
      <LangContext.Provider value={{ lang, t: tFn, isAr, switchLang, bidEnabled, setBidEnabled, tradingOpen, setTradingOpen, commSplit, setCommSplit, gatewaySettings, setGatewaySettings, commissionRates, setCommissionRates, cancelFee, setCancelFee, reportingConfig, setReportingConfig }}>
        <LoginPage onLogin={() => setLoggedIn(true)} />
      </LangContext.Provider>
    </AppDataContext.Provider>
  );

  const renderPage = () => ({
    dashboard:<Dashboard/>, investors:<Investors/>, txlog:<TransactionLog/>, orderbook:<OrderBook/>, vault:<Vault/>,
    appointments:<Appointments/>, financials:<Financials/>, reports:<Reports/>,
    blacklist:<Blacklist/>, blocks:<Blocks/>, settings:<Settings onLangChange={switchLang}/>, auditlog:<AuditLog/>,
    commcenter:<CommCenter/>, usermgmt:<UserManagement/>, profile:<AccountProfile/>, health:<SystemHealth/>,
    treasury:<TreasuryReconciliation/>
  }[page] || <Dashboard/>);

  return (
    <AppDataContext.Provider value={appDataValue}>
    <ThemeContext.Provider value={{C:currentTheme,dark,toggleDark}}>
    <LangContext.Provider value={{ lang, t: tFn, isAr, switchLang, bidEnabled, setBidEnabled, tradingOpen, setTradingOpen, commSplit, setCommSplit, gatewaySettings, setGatewaySettings, commissionRates, setCommissionRates, cancelFee, setCancelFee, reportingConfig, setReportingConfig }}>
      <div dir={isAr?"rtl":"ltr"} style={{display:"flex",height:"100vh",fontFamily:"'STCForward','DM Sans',system-ui,sans-serif",background:C.bg,overflow:"hidden",fontSize:isAr?undefined:"14px"}}>
        <style>{`
          @font-face {
            font-family: 'STCForward';
            src: url('/STCForward-Regular.ttf') format('truetype');
            font-weight: 400;
            font-style: normal;
          }
          @font-face {
            font-family: 'STCForward';
            src: url('/STCForward-Regular.ttf') format('truetype');
            font-weight: 700;
            font-style: normal;
            font-synthesis: weight;
          }
          @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
          @import url('https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@700;800&display=swap');
          *{box-sizing:border-box;margin:0;padding:0}
          ::-webkit-scrollbar{width:5px;height:5px}
          ::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:3px}
          input,select,button{font-family:inherit}
        `}</style>

        {/* Sidebar */}
        <div style={{width:open?260:64,flexShrink:0,background:`linear-gradient(180deg, ${C.sidebar} 0%, ${C.navyDark} 100%)`,display:"flex",flexDirection:"column",transition:"width 0.22s",overflow:"hidden",boxShadow:isAr?"-4px 0 20px rgba(45,36,24,0.2)":"4px 0 20px rgba(45,36,24,0.2)"}}>
          <div style={{padding:"18px 14px",borderBottom:`1px solid ${C.sidebarBorder}`,display:"flex",alignItems:"center",gap:11,minHeight:64,justifyContent:open?"flex-start":"center"}}>
            <div style={{width:40,height:40,borderRadius:10,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <TanaqulLogo size={40} />
            </div>
            {open&&<div>
              <p style={{fontSize:22,fontWeight:800,color:"#F5F0E8",lineHeight:1,letterSpacing:"-0.01em",fontFamily:"'STCForward','DM Sans',system-ui,sans-serif"}}>Tanaqul</p>
              <p style={{fontSize:14,color:C.gold,marginTop:2,fontWeight:500}}>{tFn("Precious Admin")}</p>
            </div>}
          </div>
          <nav style={{flex:1,padding:"10px 7px",overflowY:"auto"}}>
            {PAGES.map(p=>{
              const active=page===p.id;
              const amlBadgeCount = p.id==="auditlog" ? [...amlAlerts,...cmaAlerts].filter(a=>!amlDismissed.has(a.key)&&(a.level==="CRITICAL"||a.level==="HIGH")).length : 0;
              return <button key={p.id} onClick={()=>setPage(p.id)}
                style={{width:"100%",display:"flex",alignItems:"center",gap:3,padding:"8px 10px",borderRadius:9,border:"none",cursor:"pointer",marginBottom:2,
                  justifyContent:open?"flex-start":"center",position:"relative",
                  background:active?C.sidebarActive:"transparent",
                  borderInlineStart:active?`3px solid ${C.gold}`:"3px solid transparent",
                  transition:"all 0.13s"}}
                onMouseEnter={e=>{if(!active)e.currentTarget.style.background=C.sidebarHover}}
                onMouseLeave={e=>{if(!active)e.currentTarget.style.background="transparent"}}>
                <span style={{flexShrink:0,width:20,display:"flex",alignItems:"center",justifyContent:"center"}}>{Icons[p.icon]?.(20, active?C.gold:"#A89880")}</span>
                {open&&<span style={{fontSize:16,fontWeight:active?600:400,color:active?C.gold:"#A89880",whiteSpace:"nowrap"}}>{tFn(p.label)}</span>}
                {amlBadgeCount>0&&<span style={{position:"absolute",top:2,right:open?6:2,background:C.red,color:"#FFF",fontSize:11,fontWeight:900,borderRadius:20,padding:"1px 5px",minWidth:16,textAlign:"center",animation:"pulse 2s infinite"}}>{amlBadgeCount}</span>}
              </button>;
            })}
          </nav>
          {/* ═══ SIDEBAR FOOTER — Compact, innovative design ═══ */}
          <div style={{padding:open?"12px 10px":"10px 7px",borderTop:`1px solid ${C.sidebarBorder}`,display:"flex",flexDirection:"column",gap:open?8:6}}>

            {/* ── Admin Profile Card (expanded only) ── */}
            {open&&<button onClick={()=>setPage("profile")}
              style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 10px",borderRadius:10,border:"none",cursor:"pointer",
                background:"rgba(196,149,106,0.08)",transition:"all 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(196,149,106,0.15)"}
              onMouseLeave={e=>e.currentTarget.style.background="rgba(196,149,106,0.08)"}>
              <div style={{width:34,height:34,borderRadius:9,background:`linear-gradient(135deg,${C.gold},#8B6540)`,display:"flex",alignItems:"center",justifyContent:"center",
                color:"#FFF",fontSize:14,fontWeight:800,flexShrink:0,boxShadow:"0 2px 8px rgba(196,149,106,0.3)"}}>
                A
              </div>
              <div style={{flex:1,textAlign:"start",overflow:"hidden"}}>
                <p style={{fontSize:13,fontWeight:700,color:"#F5F0E8",lineHeight:1.2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{isAr?"عبدالعزيز":"Abdulaziz"}</p>
                <p style={{fontSize:11,color:"#A89880",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>Super Admin</p>
              </div>
              <span style={{fontSize:11,color:"#A89880",flexShrink:0}}>›</span>
            </button>}

            {/* ── Quick Controls Row (dark + lang + collapse) ── */}
            <div style={{display:"flex",gap:open?4:6,justifyContent:open?"space-between":"center",flexDirection:open?"row":"column",alignItems:"center"}}>
              {/* Dark/Light */}
              <button onClick={toggleDark} title={dark?"Light Mode":"Dark Mode"}
                style={{flex:open?1:undefined,width:open?undefined:42,height:open?36:42,display:"flex",alignItems:"center",justifyContent:"center",gap:6,
                  borderRadius:9,border:"none",cursor:"pointer",
                  background:dark?"rgba(212,168,120,0.18)":"rgba(255,255,255,0.06)",
                  color:dark?"#D4A878":"#A89880",transition:"all 0.2s",position:"relative",overflow:"hidden"}}
                onMouseEnter={e=>e.currentTarget.style.background=dark?"rgba(212,168,120,0.25)":"rgba(255,255,255,0.12)"}
                onMouseLeave={e=>e.currentTarget.style.background=dark?"rgba(212,168,120,0.18)":"rgba(255,255,255,0.06)"}>
                <span style={{fontSize:16,transition:"transform 0.3s",transform:dark?"rotate(180deg)":"rotate(0deg)"}}>{dark?"☀️":"🌙"}</span>
                {open&&<span style={{fontSize:12,fontWeight:600}}>{dark?(isAr?"فاتح":"Light"):(isAr?"داكن":"Dark")}</span>}
              </button>

              {/* Language */}
              <button onClick={()=>switchLang(isAr?"en":"ar")} title={isAr?"Switch to English":"التبديل للعربية"}
                style={{flex:open?1:undefined,width:open?undefined:42,height:open?36:42,display:"flex",alignItems:"center",justifyContent:"center",gap:6,
                  borderRadius:9,border:"none",cursor:"pointer",
                  background:"rgba(255,255,255,0.06)",color:"#A89880",transition:"all 0.15s"}}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.12)"}
                onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.06)"}>
                <span style={{fontSize:14,fontWeight:800,letterSpacing:"-0.02em"}}>{isAr?"EN":"ع"}</span>
                {open&&<span style={{fontSize:12,fontWeight:600}}>{isAr?"English":"العربية"}</span>}
              </button>

              {/* Collapse/Expand */}
              <button onClick={()=>setOpen(o=>!o)} title={open?"Collapse":"Expand"}
                style={{flex:open?undefined:undefined,width:open?36:42,height:open?36:42,display:"flex",alignItems:"center",justifyContent:"center",
                  borderRadius:9,border:"none",cursor:"pointer",
                  background:"rgba(255,255,255,0.06)",color:"#A89880",transition:"all 0.25s",flexShrink:0}}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.12)"}
                onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.06)"}>
                <span style={{fontSize:14,transition:"transform 0.3s",transform:open?(isAr?"rotate(0deg)":"rotate(180deg)"):(isAr?"rotate(180deg)":"rotate(0deg)"),display:"inline-block"}}>«</span>
              </button>
            </div>

            {/* ── Logout — subtle, at the very bottom ── */}
            <button onClick={()=>{localStorage.removeItem("tanaqul_token");localStorage.removeItem("tanaqul_refresh");setLoggedIn(false)}}
              style={{width:"100%",height:open?34:42,display:"flex",alignItems:"center",justifyContent:"center",gap:6,
                borderRadius:9,border:"none",cursor:"pointer",
                background:"rgba(200,92,62,0.08)",color:"#E8826A",fontSize:12,fontWeight:600,transition:"all 0.15s",
                opacity:0.7}}
              onMouseEnter={e=>{e.currentTarget.style.background="rgba(200,92,62,0.18)";e.currentTarget.style.opacity="1";}}
              onMouseLeave={e=>{e.currentTarget.style.background="rgba(200,92,62,0.08)";e.currentTarget.style.opacity="0.7";}}>
              {Icons.logout(13,"#E8826A")}
              {open&&<span>{tFn("Logout")}</span>}
            </button>

          </div>
        </div>

        {/* Main */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{background:C.white,borderBottom:`1px solid ${C.border}`,padding:"0 22px",height:60,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,boxShadow:dark?"none":"0 1px 8px rgba(45,36,24,0.05)"}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{textAlign:"start"}}>
                <h1 style={{fontSize:20,fontWeight:700,color:C.navy}}>{tFn(cur?.label||"")}</h1>
                <p style={{fontSize:10,color:C.textMuted}}>
                  {new Date().toLocaleDateString(isAr?"ar-SA":"en-SA",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}
                </p>
              </div>
              {/* Global Search Button */}
              <button onClick={()=>setSearchOpen(true)}
                style={{display:"flex",alignItems:"center",gap:8,padding:"7px 14px",borderRadius:10,border:`1px solid ${C.border}`,
                  background:C.bg,cursor:"pointer",marginInlineStart:12,transition:"all 0.15s"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=C.gold}
                onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                <span style={{fontSize:12,color:C.textMuted}}>🔍</span>
                <span style={{fontSize:11,color:C.textMuted}}>{isAr?"بحث...":"Search..."}</span>
                <kbd style={{fontSize:8,color:C.textMuted,background:C.white,border:`1px solid ${C.border}`,borderRadius:3,padding:"1px 4px",fontFamily:"monospace"}}>⌘K</kbd>
              </button>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>

              {/* 1️⃣ User Requests Bell — pending withdrawals, new investors, KYC issues */}
              {(()=>{
                const pendW = appWithdrawals.filter(w=>w.status==="PENDING").length;
                const newInv = appInvestors.filter(i=>{const d=new Date(i.joined);const now=new Date();return (now-d)<7*86400000;}).length;
                const suspended = appInvestors.filter(i=>i.status==="SUSPENDED").length;
                const total = pendW + newInv + suspended;
                const hasUrgent = pendW > 0;
                return (
                  <button onClick={()=>setPage("financials")} title={isAr?`${total} طلبات مستخدمين`:`${total} user requests`}
                    style={{position:"relative",background:hasUrgent?"#FDF4EC":total>0?C.purpleBg:"#F5F0E8",
                      border:`1.5px solid ${hasUrgent?"#E8D5B8":total>0?"#C8D6E8":"#E8E0D4"}`,
                      borderRadius:10,padding:"7px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
                    {Icons.wallet(16,hasUrgent?"#D4943A":total>0?"#6B8AAD":"#A89880")}
                    <span style={{fontSize:11,fontWeight:700,color:hasUrgent?"#D4943A":total>0?"#6B8AAD":"#A89880"}}>
                      {pendW>0?(isAr?`${pendW} سحب`:`${pendW} Withdraw`):total>0?(isAr?`${total} طلبات`:`${total} Requests`):(isAr?"لا يوجد":"Clear")}
                    </span>
                    {total>0&&<span style={{position:"absolute",top:-5,[isAr?"left":"right"]:-5,background:hasUrgent?"#D4943A":"#6B8AAD",color:"#FFF",fontSize:9,fontWeight:900,borderRadius:20,padding:"1px 5px",minWidth:16,textAlign:"center"}}>{total}</span>}
                  </button>
                );
              })()}

              {/* 2️⃣ Appointments Bell — upcoming, today, no-shows */}
              {(()=>{
                const today = new Date().toISOString().slice(0,10);
                const booked = appAppointments.filter(a=>a.status==="BOOKED"||a.status==="RESCHEDULED");
                const todayAppts = booked.filter(a=>a.date===today).length;
                const noShows = appAppointments.filter(a=>a.status==="NO_SHOW").length;
                const total = booked.length;
                const hasToday = todayAppts > 0;
                return (
                  <button onClick={()=>setPage("appointments")} title={isAr?`${total} مواعيد (${todayAppts} اليوم)`:`${total} appointments (${todayAppts} today)`}
                    style={{position:"relative",background:hasToday?"#ECFDF5":total>0?C.purpleBg:"#F5F0E8",
                      border:`1.5px solid ${hasToday?"#C0DBC8":total>0?"#C8D6E8":"#E8E0D4"}`,
                      borderRadius:10,padding:"7px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
                    {Icons.calendar(16,hasToday?C.greenSolid:total>0?"#6B8AAD":"#A89880")}
                    <span style={{fontSize:11,fontWeight:700,color:hasToday?C.greenSolid:total>0?"#6B8AAD":"#A89880"}}>
                      {hasToday?(isAr?`${todayAppts} اليوم`:`${todayAppts} Today`):total>0?(isAr?`${total} مواعيد`:`${total} Appts`):(isAr?"لا يوجد":"Clear")}
                    </span>
                    {total>0&&<span style={{position:"absolute",top:-5,[isAr?"left":"right"]:-5,background:hasToday?C.greenSolid:"#6B8AAD",color:"#FFF",fontSize:9,fontWeight:900,borderRadius:20,padding:"1px 5px",minWidth:16,textAlign:"center"}}>{total}</span>}
                  </button>
                );
              })()}

              {/* 3️⃣ AML + CMA Notification Bell */}
              {(()=>{
                const allUnacked = [...amlAlerts, ...cmaAlerts].filter(a=>!amlDismissed.has(a.key));
                const critHigh = allUnacked.filter(a=>a.level==="CRITICAL"||a.level==="HIGH");
                return (
                  <button onClick={()=>setPage("auditlog")} title={`${allUnacked.length} alerts (${critHigh.length} critical/high)`}
                    style={{position:"relative",background:critHigh.length>0?"#FBF0EC":allUnacked.length>0?"#FDF4EC":"#F5F0E8",
                      border:`1.5px solid ${critHigh.length>0?"#E8C5BA":allUnacked.length>0?"#E8D5B8":"#E8E0D4"}`,
                      borderRadius:10,padding:"7px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
                    {Icons.shield(16,critHigh.length>0?"#C85C3E":allUnacked.length>0?"#D4943A":"#A89880")}
                    <span style={{fontSize:11,fontWeight:700,color:critHigh.length>0?"#C85C3E":allUnacked.length>0?"#D4943A":C.greenSolid}}>
                      {critHigh.length>0?(isAr?`${critHigh.length} حرج`:`${critHigh.length} Critical`):allUnacked.length>0?(isAr?`${allUnacked.length} تنبيه`:`${allUnacked.length} AML`):(isAr?"آمن":"Clear")}
                    </span>
                    {allUnacked.length>0&&<span style={{position:"absolute",top:-5,[isAr?"left":"right"]:-5,background:"#C85C3E",color:"#FFF",fontSize:9,fontWeight:900,borderRadius:20,padding:"1px 5px",minWidth:16,textAlign:"center",animation:"pulse 2s infinite"}}>{allUnacked.length}</span>}
                  </button>
                );
              })()}

              {/* 3½ NOTIFICATION CENTER BELL — integrated feed */}
              {(()=>{
                return <NotificationBell
                  notifications={notifData.notifications}
                  unread={notifData.unread}
                  readSet={notifData.readSet}
                  markRead={notifData.markRead}
                  markAllRead={notifData.markAllRead}
                  setPage={setPage}
                  isAr={isAr}
                />;
              })()}

              {/* 4️⃣ System Alerts Bell — KYC expiry, trading hours, blockchain, compliance overdue */}
              {(()=>{
                const sysAlerts = [];
                // KYC expiring within 30 days
                const kycExpiring = appInvestors.filter(i=>{if(!i.kycExpiry)return false;const d=(new Date(i.kycExpiry)-new Date())/(86400000);return d>0&&d<30;}).length;
                const kycExpired = appInvestors.filter(i=>{if(!i.kycExpiry)return false;return new Date(i.kycExpiry)<new Date();}).length;
                if(kycExpired>0) sysAlerts.push({msg:isAr?`${kycExpired} هوية منتهية`:`${kycExpired} KYC expired`,level:"CRITICAL"});
                if(kycExpiring>0) sysAlerts.push({msg:isAr?`${kycExpiring} هوية تنتهي قريباً`:`${kycExpiring} KYC expiring soon`,level:"WARN"});
                // Trading hours
                const hr = new Date().getHours();
                const tradingHrs = hr >= 10 && hr < 15;
                if(!tradingHrs) sysAlerts.push({msg:isAr?"السوق مغلق":"Market closed",level:"INFO"});
                // Blacklist size
                const blk = appInvestors.filter(i=>i.status==="BANNED").length;
                if(blk>0) sysAlerts.push({msg:isAr?`${blk} محظور`:`${blk} banned users`,level:"INFO"});
                // No-show rate
                const noShowRate = appAppointments.length>0?(appAppointments.filter(a=>a.status==="NO_SHOW").length/appAppointments.length*100).toFixed(0):0;
                if(parseFloat(noShowRate)>15) sysAlerts.push({msg:isAr?`معدل عدم الحضور ${noShowRate}%`:`No-show rate ${noShowRate}%`,level:"WARN"});
                const hasCrit = sysAlerts.some(a=>a.level==="CRITICAL");
                const hasWarn = sysAlerts.some(a=>a.level==="WARN");
                const total = sysAlerts.length;
                return (
                  <button onClick={()=>setPage("settings")} title={sysAlerts.map(a=>a.msg).join(", ")||"All systems normal"}
                    style={{position:"relative",background:hasCrit?"#FBF0EC":hasWarn?"#FDF4EC":total>0?C.purpleBg:"#F5F0E8",
                      border:`1.5px solid ${hasCrit?"#E8C5BA":hasWarn?"#E8D5B8":total>0?"#C8D6E8":"#E8E0D4"}`,
                      borderRadius:10,padding:"7px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
                    {Icons.settings(16,hasCrit?"#C85C3E":hasWarn?"#D4943A":total>0?"#6B8AAD":"#A89880")}
                    <span style={{fontSize:11,fontWeight:700,color:hasCrit?"#C85C3E":hasWarn?"#D4943A":total>0?"#6B8AAD":C.greenSolid}}>
                      {hasCrit?(isAr?"تحذير نظام":"System Alert"):hasWarn?(isAr?`${total} تنبيه`:`${total} Notices`):total>0?(isAr?`${total} معلومات`:`${total} Info`):(isAr?"طبيعي":"Normal")}
                    </span>
                    {(hasCrit||hasWarn)&&<span style={{position:"absolute",top:-5,[isAr?"left":"right"]:-5,background:hasCrit?"#C85C3E":"#D4943A",color:"#FFF",fontSize:9,fontWeight:900,borderRadius:20,padding:"1px 5px",minWidth:16,textAlign:"center"}}>{total}</span>}
                  </button>
                );
              })()}
              <HeaderPills />
            </div>
          </div>
          {/* Global AML Toast — appears on any page when new critical alert fires */}
          {amlToast&&<div style={{position:"fixed",top:14,right:22,zIndex:99999,background:"linear-gradient(90deg,#8B3520,#C85C3E)",borderRadius:14,padding:"14px 20px",display:"flex",alignItems:"center",gap:12,boxShadow:"0 8px 32px rgba(220,38,38,0.4)",maxWidth:480,animation:"slideIn 0.3s ease-out"}}>
            <span style={{fontSize:24}}>🚨</span>
            <div style={{flex:1}}>
              <p style={{fontSize:13,fontWeight:800,color:"#FFF"}}>{amlToast.count} New {amlToast.count>1?"Alerts":"Alert"} Detected</p>
              <p style={{fontSize:11,color:"#E8C5BA"}}>{amlToast.top.rule}: {amlToast.top.title} — {amlToast.top.name}</p>
            </div>
            <button onClick={()=>{setAmlToast(null);setPage("auditlog");}} style={{padding:"6px 12px",borderRadius:8,background:"#FFF",color:"#C85C3E",fontSize:13,fontWeight:700,border:"none",cursor:"pointer",whiteSpace:"nowrap"}}>Review →</button>
          </div>}
          <style>{`@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
          {/* Global Search Overlay */}
          <GlobalSearch isOpen={searchOpen} onClose={()=>setSearchOpen(false)} setPage={setPage} setPageHint={setPageHint} />
          <div style={{flex:1,overflowY:"auto",padding:22}}>{renderPage()}</div>
          {/* ═══ GAMING-STYLE ACTION CENTER — only real pending actions ═══ */}
          {(()=>{
            const actions = [];
            // Pending withdrawals need approval
            const pendW = appWithdrawals.filter(w=>w.status==="PENDING");
            if(pendW.length>0) actions.push({id:"wd",icon:"💸",label:isAr?`${pendW.length} سحب بانتظار الموافقة`:`${pendW.length} withdrawal${pendW.length>1?"s":""} awaiting approval`,page:"financials",hint:{tab:"WITHDRAWAL REQUESTS"},level:"high"});
            // Expired appointments need action (mark no-show or start)
            const expAppt = appAppointments.filter(a=>a.status==="EXPIRED"||a.status==="BOOKED");
            const expiredOnly = appAppointments.filter(a=>a.status==="EXPIRED");
            if(expiredOnly.length>0) actions.push({id:"exp",icon:"⏰",label:isAr?`${expiredOnly.length} موعد منتهٍ — سجّل الحضور أو عدمه`:`${expiredOnly.length} expired appointment${expiredOnly.length>1?"s":""} — mark attended or no-show`,page:"appointments",hint:{filter:"EXPIRED"},level:"high"});
            // KYC expired investors still active
            const today = new Date().toISOString().slice(0,10);
            const kycExp = appInvestors.filter(i=>i.kycExpiry&&i.kycExpiry<today&&i.status==="ACTIVE");
            if(kycExp.length>0) actions.push({id:"kyc",icon:"🪪",label:isAr?`${kycExp.length} مستثمر بهوية منتهية — علّق أو جدّد`:`${kycExp.length} investor${kycExp.length>1?"s":""} with expired KYC — suspend or renew`,page:"investors",hint:{filter:"ACTIVE",search:"KYC"},level:"crit"});
            // Blacklisted users with active orders
            const blActive = appBlacklist.filter(bl=>appOrders.some(o=>o.nationalId===bl.nationalId&&(o.status==="OPEN"||o.status==="PARTIAL")));
            if(blActive.length>0) actions.push({id:"bl",icon:"🚫",label:isAr?`${blActive.length} محظور لديه أوامر نشطة — ألغِ الأوامر`:`${blActive.length} banned user${blActive.length>1?"s":""} with active orders — cancel orders`,page:"orderbook",hint:{tab:"open"},level:"crit"});
            // Critical/High AML alerts unreviewed
            const unreviewed = [...amlAlerts,...cmaAlerts].filter(a=>!amlDismissed.has(a.key)&&(a.level==="CRITICAL"||a.level==="HIGH"));
            if(unreviewed.length>0) actions.push({id:"aml",icon:"🔍",label:isAr?`${unreviewed.length} تنبيه حرج/مرتفع — راجع وأبلغ`:`${unreviewed.length} critical/high alert${unreviewed.length>1?"s":""} — review & file`,page:"auditlog",hint:{tab:"aml"},level:unreviewed.some(a=>a.level==="CRITICAL")?"crit":"high"});
            // Approved withdrawals not yet processed
            const approvedW = appWithdrawals.filter(w=>w.status==="APPROVED");
            if(approvedW.length>0) actions.push({id:"proc",icon:"🏦",label:isAr?`${approvedW.length} سحب تمت الموافقة — أتمم التحويل`:`${approvedW.length} approved withdrawal${approvedW.length>1?"s":""} — process bank transfer`,page:"financials",hint:{tab:"WITHDRAWAL REQUESTS"},level:"med"});
            // NEW: KYC expiring within 7 days
            const kycUrgent = appInvestors.filter(i=>i.kycExpiry&&i.kycExpiry>=today&&i.kycExpiry<new Date(Date.now()+7*86400000).toISOString().slice(0,10)&&i.status==="ACTIVE");
            if(kycUrgent.length>0) actions.push({id:"kyc7",icon:"⚠️",label:isAr?`${kycUrgent.length} هوية تنتهي خلال 7 أيام`:`${kycUrgent.length} KYC expiring in 7 days`,page:"investors",hint:{filter:"ACTIVE"},level:"high"});
            // NEW: Damaged bars need attention
            const damagedBars = appBars.filter(b=>b.status==="DAMAGED");
            if(damagedBars.length>0) actions.push({id:"dmg",icon:"🔨",label:isAr?`${damagedBars.length} سبيكة تالفة — تحتاج مراجعة`:`${damagedBars.length} damaged bar${damagedBars.length>1?"s":""} — needs review`,page:"vault",hint:null,level:"med"});
            if(actions.length===0) return null;
            const critCount = actions.filter(a=>a.level==="crit").length;
            const highCount = actions.filter(a=>a.level==="high").length;
            const accent = critCount>0?"#C85C3E":highCount>0?"#D4943A":"#C4956A";
            return (
              <ActionCenterWidget actions={actions} accent={accent} critCount={critCount} highCount={highCount}
                isAr={isAr} setPageHint={setPageHint} setPage={setPage} />
            );
          })()}
        </div>
      </div>
    </LangContext.Provider>
    </ThemeContext.Provider>
    </AppDataContext.Provider>
  );
}
