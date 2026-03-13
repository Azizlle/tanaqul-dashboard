#!/usr/bin/env python3
"""Translate hardcoded English strings to isAr?Arabic:English pattern in TanaqulDashboard.jsx lines 3000-5800"""

f = 'src/TanaqulDashboard.jsx'
with open(f, 'r', encoding='utf-8') as fh:
    content = fh.read()

replacements = [
    # === ALERT BANNER (line ~3495-3498) ===
    (
        '{critCount + cmaCritCount} CRITICAL Alert{(critCount+cmaCritCount)>1?"s":""} — {critCount>0?`${critCount} AML`:""}',
        '{critCount + cmaCritCount} {isAr?"تنبيه حرج":"CRITICAL Alert"}{(critCount+cmaCritCount)>1&&!isAr?"s":""} — {critCount>0?`${critCount} ${isAr?"غسل أموال":"AML"}`:""}',
    ),
    (
        '{cmaCritCount>0?`${cmaCritCount} Market Manipulation`:""}',
        '{cmaCritCount>0?`${cmaCritCount} ${isAr?"تلاعب بالسوق":"Market Manipulation"}`:""}',
    ),
    (
        '{cmaCritCount>0?"CMA Market Conduct Regulations require immediate investigation of manipulation alerts. ":""}SAMA regulations require escalation within 24 hours.',
        '{cmaCritCount>0?(isAr?"تتطلب أنظمة سلوك السوق التحقيق الفوري في تنبيهات التلاعب. ":"CMA Market Conduct Regulations require immediate investigation of manipulation alerts. "):""}{isAr?"تتطلب أنظمة ساما التصعيد خلال 24 ساعة.":"SAMA regulations require escalation within 24 hours."}',
    ),

    # === AML FILTERS (line ~3528-3536) ===
    (
        '{showDismissed?"Hide":"Show"} Dismissed ({amlDismissed.size})',
        '{showDismissed?(isAr?"إخفاء":"Hide"):(isAr?"عرض":"Show")} {isAr?"المرفوضة":"Dismissed"} ({amlDismissed.size})',
    ),
    (
        'placeholder="Search alerts..."',
        'placeholder={isAr?"بحث في التنبيهات...":"Search alerts..."}',
    ),
    (
        '>No alerts match the current filter<',
        '>{isAr?"لا توجد تنبيهات تطابق الفلتر الحالي":"No alerts match the current filter"}<',
    ),

    # === AML alert card actions (line ~3560-3561) ===
    (
        'onClick={()=>{dismissAmlAlert(a.key);showToast("Alert dismissed");}}>Dismiss</Btn>',
        'onClick={()=>{dismissAmlAlert(a.key);showToast(isAr?"تم رفض التنبيه":"Alert dismissed");}}>{isAr?"رفض":"Dismiss"}</Btn>',
    ),
    (
        '>✓ Dismissed<',
        '>{isAr?"✓ مرفوض":"✓ Dismissed"}<',
    ),

    # === Self-Trading Violations (line ~3611-3612) ===
    (
        '>⚠️ {selfTrades.length} Self-Trading Violation{selfTrades.length>1?"s":""} — Art 3(b)(1) Market Conduct Regulations<',
        '>{isAr?`⚠️ ${selfTrades.length} مخالفة تداول ذاتي — المادة 3(ب)(1) أنظمة سلوك السوق`:`⚠️ ${selfTrades.length} Self-Trading Violation${selfTrades.length>1?"s":""} — Art 3(b)(1) Market Conduct Regulations`}<',
    ),

    # === CMA self-trade dismiss (line ~3626) ===
    (
        'onClick={()=>{dismissAmlAlert(a.key);showToast("Dismissed");}}>Dismiss</Btn>',
        'onClick={()=>{dismissAmlAlert(a.key);showToast(isAr?"تم الرفض":"Dismissed");}}>{isAr?"رفض":"Dismiss"}</Btn>',
    ),

    # === CMA rules descriptions (line ~3682-3691) - desc fields are English only ===
    (
        'desc:"Trade with no change in beneficial ownership"}',
        'desc:isAr?"صفقة بدون تغيير في الملكية المستفيدة":"Trade with no change in beneficial ownership"}',
    ),
    (
        'desc:"Same size/time/price on both sides"}',
        'desc:isAr?"نفس الحجم/الوقت/السعر على كلا الجانبين":"Same size/time/price on both sides"}',
    ),
    (
        'desc:"Orders not intended to execute"}',
        'desc:isAr?"أوامر لا يُقصد تنفيذها":"Orders not intended to execute"}',
    ),
    (
        'desc:"Successively higher/lower prices"}',
        'desc:isAr?"أسعار متتالية أعلى/أقل":"Successively higher/lower prices"}',
    ),
    (
        'desc:"System-to-system trade review"}',
        'desc:isAr?"مراجعة صفقات النظام":"System-to-system trade review"}',
    ),
    (
        'desc:"Turnover ratio > 3x holdings"}',
        'desc:isAr?"نسبة الدوران > 3 أضعاف الحيازات":"Turnover ratio > 3x holdings"}',
    ),
    (
        'desc:"Buy cluster then rapid sell"}',
        'desc:isAr?"تجميع شراء ثم بيع سريع":"Buy cluster then rapid sell"}',
    ),
    (
        'desc:"Near-close orders affecting price"}',
        'desc:isAr?"أوامر قرب الإغلاق تؤثر على السعر":"Near-close orders affecting price"}',
    ),
    (
        'desc:"Multiple orders at different price levels"}',
        'desc:isAr?"أوامر متعددة بمستويات سعرية مختلفة":"Multiple orders at different price levels"}',
    ),
    (
        'desc:"Repeated counterparty pattern"}',
        'desc:isAr?"نمط طرف مقابل متكرر":"Repeated counterparty pattern"}',
    ),

    # === RISK SCORING TAB (line ~3712-3714) ===
    (
        '>{x.lv} RISK<',
        '>{x.lv} {isAr?"خطر":"RISK"}<',
    ),
    (
        '>{riskScores.length>0?Math.round(riskDistro[x.lv]/riskScores.length*100):0}% of investors<',
        '>{riskScores.length>0?Math.round(riskDistro[x.lv]/riskScores.length*100):0}% {isAr?"من المستثمرين":"of investors"}<',
    ),

    # === Risk table headers (line ~3724) ===
    (
        '{["Rank","Investor","NID","Score","Level","Volume","TX Count","Factors"].map(h=>(',
        '{(isAr?["الترتيب","المستثمر","الهوية","النقاط","المستوى","الحجم","المعاملات","العوامل"]:["Rank","Investor","NID","Score","Level","Volume","TX Count","Factors"]).map(h=>(',
    ),

    # === +N more factors (line ~3762) ===
    (
        '>+{r.factors.length-3} more<',
        '>+{r.factors.length-3} {isAr?"أخرى":"more"}<',
    ),

    # === Behavior Analytics (line ~3793-3825) ===
    (
        '>Score: {risk?.riskScore||0}/100<',
        '>{isAr?"النقاط":"Score"}: {risk?.riskScore||0}/100<',
    ),
    # Behavior metrics labels
    (
        '{label:"Buy Vol"',
        '{label:isAr?"حجم الشراء":"Buy Vol"',
    ),
    (
        '{label:"Sell Vol"',
        '{label:isAr?"حجم البيع":"Sell Vol"',
    ),
    (
        '{label:"Holdings"',
        '{label:isAr?"الحيازات":"Holdings"',
    ),
    (
        '{label:"Transactions"',
        '{label:isAr?"المعاملات":"Transactions"',
    ),
    (
        '{label:"TX Freq"',
        '{label:isAr?"تكرار المعاملات":"TX Freq"',
    ),
    (
        '{label:"Withdrawn"',
        '{label:isAr?"المسحوب":"Withdrawn"',
    ),
    # AML Alert count in behavior cards
    (
        '>⚠️ {pAlerts.length} AML Alert{pAlerts.length>1?"s":""}<',
        '>{isAr?`⚠️ ${pAlerts.length} تنبيه غسل أموال`:`⚠️ ${pAlerts.length} AML Alert${pAlerts.length>1?"s":""}`}<',
    ),
    (
        '>✅ No AML flags — normal behavior profile<',
        '>{isAr?"✅ لا توجد تنبيهات — سلوك طبيعي":"✅ No AML flags — normal behavior profile"}<',
    ),

    # === COMPLIANCE TAB - SAMA Compliance (line ~4000-4012) ===
    (
        '>{Icons.amlVault(16,C.navy)} SAMA AML/CFT Compliance Status<',
        '>{Icons.amlVault(16,C.navy)} {isAr?"حالة الامتثال لمكافحة غسل الأموال — ساما":"SAMA AML/CFT Compliance Status"}<',
    ),
    # Compliance checklist items
    (
        'check:"Customer Due Diligence (CDD)"',
        'check:isAr?"العناية الواجبة للعميل (CDD)":"Customer Due Diligence (CDD)"',
    ),
    (
        'detail:"All investors have verified National ID"',
        'detail:isAr?"جميع المستثمرين لديهم هوية وطنية موثقة":"All investors have verified National ID"',
    ),
    (
        'check:"Enhanced Due Diligence (EDD) for High-Risk"',
        'check:isAr?"العناية الواجبة المعززة (EDD) للمخاطر العالية":"Enhanced Due Diligence (EDD) for High-Risk"',
    ),
    (
        'check:"Transaction Monitoring System"',
        'check:isAr?"نظام مراقبة المعاملات":"Transaction Monitoring System"',
    ),
    (
        'detail:"14-rule automated AML detection engine active"',
        'detail:isAr?"محرك كشف غسل الأموال الآلي بـ 14 قاعدة نشط":"14-rule automated AML detection engine active"',
    ),
    (
        'check:"Suspicious Activity Reporting (SAR)"',
        'check:isAr?"الإبلاغ عن النشاط المشبوه (SAR)":"Suspicious Activity Reporting (SAR)"',
    ),
    (
        'detail:"SAR generation tool available for all alert levels"',
        'detail:isAr?"أداة إنشاء بلاغات SAR متاحة لجميع مستويات التنبيه":"SAR generation tool available for all alert levels"',
    ),
    (
        'check:"KYC Renewal Tracking"',
        'check:isAr?"تتبع تجديد اعرف عميلك":"KYC Renewal Tracking"',
    ),
    (
        'detail:"All active investors must have valid KYC"',
        'detail:isAr?"يجب أن يكون لجميع المستثمرين النشطين KYC صالح":"All active investors must have valid KYC"',
    ),
    (
        'check:"Sanctions Screening"',
        'check:isAr?"فحص العقوبات":"Sanctions Screening"',
    ),
    (
        'check:"Record Retention (5 years)"',
        'check:isAr?"الاحتفاظ بالسجلات (5 سنوات)":"Record Retention (5 years)"',
    ),
    (
        'check:"Staff Training Records"',
        'check:isAr?"سجلات تدريب الموظفين":"Staff Training Records"',
    ),
    (
        'check:"Risk Assessment Methodology"',
        'check:isAr?"منهجية تقييم المخاطر":"Risk Assessment Methodology"',
    ),
    (
        'detail:"Multi-factor scoring model (volume, velocity, behavior, KYC, status)"',
        'detail:isAr?"نموذج تقييم متعدد العوامل (الحجم، السرعة، السلوك، KYC، الحالة)":"Multi-factor scoring model (volume, velocity, behavior, KYC, status)"',
    ),
    (
        'check:"Politically Exposed Persons (PEP) Screening"',
        'check:isAr?"فحص الأشخاص المعرضين سياسياً (PEP)":"Politically Exposed Persons (PEP) Screening"',
    ),

    # === AI Detection Rules (line ~4060) ===
    (
        '>🤖 AI Detection Rules — Active ({14})<',
        '>{isAr?"🤖 قواعد الكشف بالذكاء الاصطناعي — نشطة (14)":"🤖 AI Detection Rules — Active (14)"}<',
    ),
    # AI rule names
    (
        'name:"High-Value Transaction"',
        'name:isAr?"معاملة عالية القيمة":"High-Value Transaction"',
    ),
    (
        'name:"Wash Trading Pattern"',
        'name:isAr?"نمط غسل الأموال":"Wash Trading Pattern"',
    ),
    (
        'name:"Velocity Spike"',
        'name:isAr?"ارتفاع مفاجئ في السرعة":"Velocity Spike"',
    ),
    (
        'name:"Disproportionate Withdrawal"',
        'name:isAr?"سحب غير متناسب":"Disproportionate Withdrawal"',
    ),
    (
        'name:"New Account High Volume"',
        'name:isAr?"حساب جديد بحجم مرتفع":"New Account High Volume"',
    ),
    (
        'name:"Repeated No-Shows"',
        'name:isAr?"تكرار عدم الحضور":"Repeated No-Shows"',
    ),
    (
        'name:"KYC Expiry"',
        'name:isAr?"انتهاء KYC":"KYC Expiry"',
    ),
    (
        'name:"Excessive Cancellations"',
        'name:isAr?"إلغاءات مفرطة":"Excessive Cancellations"',
    ),
    (
        'name:"Banned User Activity"',
        'name:isAr?"نشاط مستخدم محظور":"Banned User Activity"',
    ),
    (
        'name:"Round-Amount Structuring"',
        'name:isAr?"تجزئة بمبالغ مدوّرة":"Round-Amount Structuring"',
    ),
    (
        'name:"Platform Volume Anomaly"',
        'name:isAr?"شذوذ في حجم المنصة":"Platform Volume Anomaly"',
    ),
    (
        'name:"Blacklisted Active Orders"',
        'name:isAr?"أوامر نشطة لمحظور":"Blacklisted Active Orders"',
    ),
    (
        'name:"Bar Outside Vault > 30d"',
        'name:isAr?"سبيكة خارج الخزينة > 30 يوم":"Bar Outside Vault > 30d"',
    ),
    (
        'name:"Multiple Bank Withdrawals"',
        'name:isAr?"سحب من بنوك متعددة":"Multiple Bank Withdrawals"',
    ),

    # === AML Alert Detail Modal (line ~4094) ===
    (
        'title={`AML Alert — ${amlModal.rule}`}',
        'title={isAr?`تنبيه غسل أموال — ${amlModal.rule}`:`AML Alert — ${amlModal.rule}`}',
    ),

    # === Price Feed Settings (line ~4285) ===
    (
        'Live Price Feed\n      </h3>',
        '{isAr?"تغذية الأسعار المباشرة":"Live Price Feed"}\n      </h3>',
    ),

    # === Provider setup (line ~4329) ===
    (
        '>{pInfo.name} — Setup<',
        '>{pInfo.name} — {isAr?"الإعداد":"Setup"}<',
    ),

    # === Sign Up / Docs links (line ~4333, 4337) ===
    (
        'Sign Up →\n            </a>',
        '{isAr?"التسجيل ←":"Sign Up →"}\n            </a>',
    ),
    (
        'Docs\n            </a>',
        '{isAr?"المستندات":"Docs"}\n            </a>',
    ),

    # === Show/Hide key (line ~4362) ===
    (
        '>{showKey?"Hide":"Show"}<',
        '>{showKey?(isAr?"إخفاء":"Hide"):(isAr?"عرض":"Show")}<',
    ),

    # === Min interval (line ~4384) ===
    (
        '>Min interval for {pInfo.name}: {pInfo.minInterval}s<',
        '>{isAr?"الحد الأدنى للفترة لـ":"Min interval for"} {pInfo.name}: {pInfo.minInterval}s<',
    ),

    # === Save & Activate / Test / Clear (line ~4390-4397) ===
    (
        '>{saved?"✅ Saved & Active!":"Save & Activate"}<',
        '>{saved?(isAr?"✅ تم الحفظ والتفعيل!":"✅ Saved & Active!"):(isAr?"حفظ وتفعيل":"Save & Activate")}<',
    ),
    (
        '>{testing?"Testing...":"Test Connection"}<',
        '>{testing?(isAr?"جاري الاختبار...":"Testing..."):(isAr?"اختبار الاتصال":"Test Connection")}<',
    ),
    (
        'Clear Key\n        </button>',
        '{isAr?"مسح المفتاح":"Clear Key"}\n        </button>',
    ),

    # === Recommended Provider (line ~4409) ===
    (
        '>📈 Recommended Provider by Stage<',
        '>{isAr?"📈 المزود الموصى به حسب المرحلة":"📈 Recommended Provider by Stage"}<',
    ),

    # === Selected / Use (line ~4423) ===
    (
        '>{provider===p.id?"Selected":"Use"}<',
        '>{provider===p.id?(isAr?"محدد":"Selected"):(isAr?"استخدام":"Use")}<',
    ),

    # === SELECT PROVIDER label (line ~4299) ===
    (
        '>SELECT PROVIDER — SWITCH ANYTIME, NO CODE CHANGES NEEDED<',
        '>{isAr?"اختر المزود — التبديل في أي وقت بدون تعديل الكود":"SELECT PROVIDER — SWITCH ANYTIME, NO CODE CHANGES NEEDED"}<',
    ),

    # === Slot interval options (line ~4493) ===
    (
        '{[["15","Every 15 min"],["20","Every 20 min"],["30","Every 30 min"],["45","Every 45 min"],["60","Every 1 hour"]]',
        '{(isAr?[["15","كل 15 دقيقة"],["20","كل 20 دقيقة"],["30","كل 30 دقيقة"],["45","كل 45 دقيقة"],["60","كل ساعة"]]:[["15","Every 15 min"],["20","Every 20 min"],["30","Every 30 min"],["45","Every 45 min"],["60","Every 1 hour"]])',
    ),

    # === desk/desks (line ~4503) ===
    (
        '{n==="1"?"desk":"desks"}<',
        '{n==="1"?(isAr?"مكتب":"desk"):(isAr?"مكاتب":"desks")}<',
    ),

    # === Slots/day (line ~4512) ===
    (
        '>Slots/day<',
        '>{isAr?"فترات/يوم":"Slots/day"}<',
    ),

    # === Capacity/day (line ~4520) ===
    (
        '>Capacity/day<',
        '>{isAr?"السعة/يوم":"Capacity/day"}<',
    ),

    # === GENERATED SLOTS label (line ~4528) ===
    (
        'GENERATED SLOTS — {start} to {end}, every {interval} min × {desks} desk{desks>1?"s":""}',
        '{isAr?"الفترات المُنشأة":"GENERATED SLOTS"} — {start} {isAr?"إلى":"to"} {end}, {isAr?"كل":"every"} {interval} {isAr?"دقيقة":"min"} × {desks} {isAr?"مكتب":"desk"}{desks>1&&!isAr?"s":""}',
    ),

    # === No slots warning (line ~4540) ===
    (
        '>⚠️ No slots — closing time must be after opening time<',
        '>{isAr?"⚠️ لا توجد فترات — يجب أن يكون وقت الإغلاق بعد وقت الفتح":"⚠️ No slots — closing time must be after opening time"}<',
    ),

    # === Commission descriptions (line ~4603-4606) ===
    (
        'Commission is charged independently on both sides of every trade.\n            The <strong>buyer pays</strong> trade value + buyer commission.\n            The <strong>seller receives</strong> trade value − seller commission.',
        '{isAr?"تُفرض العمولة بشكل مستقل على كلا طرفي كل صفقة. يدفع المشتري قيمة الصفقة + عمولة المشتري. يستلم البائع قيمة الصفقة − عمولة البائع.":"Commission is charged independently on both sides of every trade."}\n            {!isAr&&<>The <strong>buyer pays</strong> trade value + buyer commission.\n            The <strong>seller receives</strong> trade value − seller commission.</>}',
    ),

    # === BUYER/SELLER COMMISSION labels (line ~4611, 4619) ===
    (
        '>BUYER COMMISSION (%)<',
        '>{isAr?"عمولة المشتري (%)":"BUYER COMMISSION (%)"}<',
    ),
    (
        '>SELLER COMMISSION (%)<',
        '>{isAr?"عمولة البائع (%)":"SELLER COMMISSION (%)"}<',
    ),

    # === LIVE EXAMPLE (line ~4630) ===
    (
        '>LIVE EXAMPLE — 10,000 SAR TRADE<',
        '>{isAr?"مثال حي — صفقة 10,000 ريال":"LIVE EXAMPLE — 10,000 SAR TRADE"}<',
    ),

    # === Total platform commission (line ~4666) ===
    (
        '>Total platform commission collected<',
        '>{isAr?"إجمالي عمولة المنصة المحصّلة":"Total platform commission collected"}<',
    ),

    # === Split validation (line ~4677) ===
    (
        '{splitOk?"✅ Split is valid — totals 100%":`⚠️ Split must total 100% — currently ${totalSplit}%`}',
        '{splitOk?(isAr?"✅ التوزيع صحيح — المجموع 100%":"✅ Split is valid — totals 100%"):(isAr?`⚠️ يجب أن يكون المجموع 100% — حالياً ${totalSplit}%`:`⚠️ Split must total 100% — currently ${totalSplit}%`)}',
    ),

    # === Split labels (line ~4685-4688) ===
    (
        '{label:"Tanaqul — Buying Side"',
        '{label:isAr?"تناقل — جانب الشراء":"Tanaqul — Buying Side"',
    ),
    (
        '{label:"Tanaqul — Selling Side"',
        '{label:isAr?"تناقل — جانب البيع":"Tanaqul — Selling Side"',
    ),
    (
        '{label:"Block Creator"',
        '{label:isAr?"منشئ الكتلة":"Block Creator"',
    ),
    (
        '{label:"Validators (weighted)"',
        '{label:isAr?"المصادقون (مرجّح)":"Validators (weighted)"',
    ),

    # === Example per trade (line ~4701) ===
    (
        'Example: {(splitOf(val)||0).toLocaleString()} SAR per 10,000 SAR trade',
        '{isAr?"مثال:":"Example:"} {(splitOf(val)||0).toLocaleString()} {isAr?"ريال لكل صفقة 10,000 ريال":"SAR per 10,000 SAR trade"}',
    ),

    # === Distribution schedule options (line ~4715) ===
    (
        'options={[{value:"daily",label:"Daily"},{value:"weekly",label:"Weekly"},{value:"perblock",label:"Per Block (instant)"}]}',
        'options={[{value:"daily",label:isAr?"يومي":"Daily"},{value:"weekly",label:isAr?"أسبوعي":"Weekly"},{value:"perblock",label:isAr?"لكل كتلة (فوري)":"Per Block (instant)"}]}',
    ),

    # === BLOCKS PER PERIOD (line ~4718) ===
    (
        '>BLOCKS PER PERIOD (ESTIMATE)<',
        '>{isAr?"الكتل في الفترة (تقدير)":"BLOCKS PER PERIOD (ESTIMATE)"}<',
    ),

    # === MIN BLOCK PARTICIPATION (line ~4725) ===
    (
        '>MIN BLOCK PARTICIPATION TO QUALIFY<',
        '>{isAr?"الحد الأدنى للمشاركة للتأهل":"MIN BLOCK PARTICIPATION TO QUALIFY"}<',
    ),

    # === MUST VALIDATE (line ~4749) ===
    (
        '>MUST VALIDATE ({pct}%)<',
        '>{isAr?"يجب المصادقة":"MUST VALIDATE"} ({pct}%)<',
    ),

    # === Takharoj wallet description (line ~4772-4774) ===
    (
        'Forfeited validator commissions are transferred to this Tanaqul-controlled wallet.\n            Validators who fail to meet the minimum block participation threshold lose their share for that period — no exceptions.',
        '{isAr?"تُحوّل عمولات المصادقين المفقودة إلى هذه المحفظة التي تتحكم بها تناقل. المصادقون الذين لا يستوفون الحد الأدنى من المشاركة في الكتل يفقدون حصتهم لتلك الفترة — بدون استثناءات.":"Forfeited validator commissions are transferred to this Tanaqul-controlled wallet. Validators who fail to meet the minimum block participation threshold lose their share for that period — no exceptions."}',
    ),

    # === What happens to forfeited earnings (line ~4793) ===
    (
        '>What happens to forfeited earnings:<',
        '>{isAr?"ما يحدث للأرباح المفقودة:":"What happens to forfeited earnings:"}<',
    ),

    # === Forfeited earnings steps (line ~4795-4799) ===
    (
        '["1","Block closes → participation recorded on-chain"],',
        '["1",isAr?"إغلاق الكتلة ← تسجيل المشاركة على السلسلة":"Block closes → participation recorded on-chain"],',
    ),
    (
        '["2","Period ends → system checks each validator\'s block count"],',
        '["2",isAr?"انتهاء الفترة ← يتحقق النظام من عدد كتل كل مصادق":"Period ends → system checks each validator\'s block count"],',
    ),
    (
        '["3","Below threshold → their share calculated"],',
        '["3",isAr?"أقل من الحد ← حساب حصتهم":"Below threshold → their share calculated"],',
    ),
    (
        '["4","Amount transferred to Takharoj wallet automatically"],',
        '["4",isAr?"تحويل المبلغ إلى محفظة تخارج تلقائياً":"Amount transferred to Takharoj wallet automatically"],',
    ),
    (
        '["5","Qualifying validators are NOT affected — they receive their full share"],',
        '["5",isAr?"المصادقون المؤهلون لا يتأثرون — يحصلون على حصتهم الكاملة":"Qualifying validators are NOT affected — they receive their full share"],',
    ),

    # === Order Book table column headers (line ~5477-5488) ===
    (
        '{key:"id",      label:"Order ID"}',
        '{key:"id",      label:isAr?"رقم الأمر":"Order ID"}',
    ),
    (
        '{key:"side",    label:"Side"',
        '{key:"side",    label:isAr?"الجانب":"Side"',
    ),
    (
        '{key:"metal",   label:"Metal"',
        '{key:"metal",   label:isAr?"المعدن":"Metal"',
    ),
    (
        '{key:"qty",     label:"Qty"',
        '{key:"qty",     label:isAr?"الكمية":"Qty"',
    ),
    (
        '{key:"price",   label:"Price"',
        '{key:"price",   label:isAr?"السعر":"Price"',
    ),
    (
        '{key:"expiry",  label:"Expiry"',
        '{key:"expiry",  label:isAr?"الصلاحية":"Expiry"',
    ),
    (
        '{key:"status",  label:"Status"',
        '{key:"status",  label:isAr?"الحالة":"Status"',
    ),
    (
        '{key:"placed",  label:"Placed"}',
        '{key:"placed",  label:isAr?"تاريخ الوضع":"Placed"}',
    ),

    # === Matched Trades table headers (line ~5503-5514) ===
    (
        '{key:"id",        label:"Match ID"}',
        '{key:"id",        label:isAr?"رقم المطابقة":"Match ID"}',
    ),
    (
        '{key:"metal",     label:"Metal"',
        '{key:"metal",     label:isAr?"المعدن":"Metal"',
    ),
    (
        '{key:"qty",       label:"Qty"',
        '{key:"qty",       label:isAr?"الكمية":"Qty"',
    ),
    (
        '{key:"price",     label:"Exec Price"',
        '{key:"price",     label:isAr?"سعر التنفيذ":"Exec Price"',
    ),
    (
        '{key:"totalSAR",  label:"Total"',
        '{key:"totalSAR",  label:isAr?"الإجمالي":"Total"',
    ),
    (
        '{key:"commission",label:"Commission"',
        '{key:"commission",label:isAr?"العمولة":"Commission"',
    ),
    (
        '{key:"adminFee",  label:"Admin Fee"',
        '{key:"adminFee",  label:isAr?"رسوم إدارية":"Admin Fee"',
    ),
    (
        '{key:"buyOrder",  label:"Buy Order"}',
        '{key:"buyOrder",  label:isAr?"أمر الشراء":"Buy Order"}',
    ),
    (
        '{key:"sellOrder", label:"Sell Order"}',
        '{key:"sellOrder", label:isAr?"أمر البيع":"Sell Order"}',
    ),
    (
        '{key:"mode",      label:"Mode"',
        '{key:"mode",      label:isAr?"الوضع":"Mode"',
    ),
    (
        '{key:"date",      label:"Executed"}',
        '{key:"date",      label:isAr?"تاريخ التنفيذ":"Executed"}',
    ),

    # === Synthetic order log headers (line ~5560-5568) ===
    (
        '{key:"id",    label:"ID"}',
        '{key:"id",    label:isAr?"المعرّف":"ID"}',
    ),
    (
        '{key:"reason",label:"Trigger"}',
        '{key:"reason",label:isAr?"المُحفّز":"Trigger"}',
    ),
    (
        '{key:"date",  label:"Date"}',
        '{key:"date",  label:isAr?"التاريخ":"Date"}',
    ),

    # === CMA compliance detail strings (line ~4033-4041) ===
    # These detail: fields that are still English
    (
        "detail:\"No trades with unchanged beneficial ownership detected\"",
        "detail:isAr?\"لم يتم اكتشاف صفقات بدون تغيير في الملكية المستفيدة\":\"No trades with unchanged beneficial ownership detected\"",
    ),
    (
        'detail:"AI monitoring for orders not intended to execute"',
        'detail:isAr?"مراقبة ذكية للأوامر التي لا يُقصد تنفيذها":"AI monitoring for orders not intended to execute"',
    ),
    (
        'detail:"Surveillance for successively higher/lower order patterns"',
        'detail:isAr?"مراقبة أنماط الأوامر المتتالية أعلى/أقل":"Surveillance for successively higher/lower order patterns"',
    ),
    (
        'detail:"Multiple orders at different price levels detection"',
        'detail:isAr?"كشف الأوامر المتعددة بمستويات سعرية مختلفة":"Multiple orders at different price levels detection"',
    ),
    (
        'detail:"Turnover ratio monitoring relative to holdings"',
        'detail:isAr?"مراقبة نسبة الدوران مقارنة بالحيازات":"Turnover ratio monitoring relative to holdings"',
    ),
    (
        'detail:"Repeated counterparty pattern analysis"',
        'detail:isAr?"تحليل نمط الطرف المقابل المتكرر":"Repeated counterparty pattern analysis"',
    ),
    (
        'detail:"Late order detection system active"',
        'detail:isAr?"نظام كشف الأوامر المتأخرة نشط":"Late order detection system active"',
    ),
]

count = 0
for old, new in replacements:
    if old in content:
        content = content.replace(old, new, 1)
        count += 1
    else:
        print(f'MISS: {repr(old[:80])}')

with open(f, 'w', encoding='utf-8') as fh:
    fh.write(content)

print(f'Applied {count}/{len(replacements)} replacements')
