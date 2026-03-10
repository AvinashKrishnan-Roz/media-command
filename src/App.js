import { useState, useEffect, useCallback } from "react";

const META_TOKEN = process.env.REACT_APP_META_TOKEN;
const API = "https://graph.facebook.com/v19.0";
const FIELDS = "name,amount_spent,budget_remaining,impressions,clicks,ctr,cpm,actions,action_values,reach";

async function metaGet(path, params = {}) {
  const qs = new URLSearchParams({ access_token: META_TOKEN, ...params }).toString();
  const res = await fetch(`${API}${path}?${qs}`);
  if (!res.ok) throw new Error(`Meta API error: ${res.status}`);
  return res.json();
}

async function fetchAdAccounts() {
  // Try /me/adaccounts first (user token), fall back to business accounts (system user token)
  try {
    const data = await metaGet("/me/adaccounts", { fields: "id,name,account_status,business", limit: 200 });
    if (data.data && data.data.length > 0) return data.data;
  } catch (e) { /* try next */ }

  // System user: fetch all businesses then their ad accounts
  try {
    const biz = await metaGet("/me/businesses", { fields: "id,name" });
    if (biz.data && biz.data.length > 0) {
      const allAccounts = [];
      for (const b of biz.data) {
        try {
          const accs = await metaGet(`/${b.id}/owned_ad_accounts`, { fields: "id,name,account_status,business", limit: 200 });
          if (accs.data) allAccounts.push(...accs.data.map(a => ({ ...a, business: { name: b.name } })));
          const client = await metaGet(`/${b.id}/client_ad_accounts`, { fields: "id,name,account_status,business", limit: 200 });
          if (client.data) allAccounts.push(...client.data.map(a => ({ ...a, business: { name: b.name } })));
        } catch (e) { /* skip this business */ }
      }
      if (allAccounts.length > 0) return allAccounts;
    }
  } catch (e) { /* try next */ }

  throw new Error("No ad accounts found. Check that your token has ads_read permission and accounts are assigned to this user/system user.");
}

async function fetchAccountInsights(accountId, datePreset) {
  try {
    const data = await metaGet(`/${accountId}/insights`, {
      fields: FIELDS,
      date_preset: datePreset,
      level: "account",
    });
    return data.data?.[0] || null;
  } catch {
    return null;
  }
}

function extractLeads(actions) {
  const a = (actions || []).find(x => x.action_type === "lead" || x.action_type === "offsite_conversion.lead");
  return a ? parseInt(a.value) : 0;
}

function extractRevenue(action_values) {
  const a = (action_values || []).find(x => x.action_type === "offsite_conversion.fb_pixel_purchase" || x.action_type === "purchase");
  return a ? parseFloat(a.value) : 0;
}

const BM_NAMES = ["BM Alpha", "BM Beta", "BM Gamma", "BM Delta"];
const MOCK_BUYERS = [
  { id: 1, name: "Alex Rivera", avatar: "AR" },
  { id: 2, name: "Jordan Kim", avatar: "JK" },
  { id: 3, name: "Sam Patel", avatar: "SP" },
  { id: 4, name: "Taylor Morgan", avatar: "TM" },
  { id: 5, name: "Casey Chen", avatar: "CC" },
  { id: 6, name: "Drew Williams", avatar: "DW" },
  { id: 7, name: "Blake Johnson", avatar: "BJ" },
];

function generateMockAccounts(buyerId) {
  const accounts = [];
  for (let bm = 0; bm < 4; bm++) {
    for (let acc = 0; acc < 5; acc++) {
      const spend = Math.random() * 8000 + 500;
      const budget = spend * (Math.random() * 0.6 + 1.1);
      const revenue = spend * (Math.random() * 3 + 0.8);
      const impressions = Math.floor(Math.random() * 900000 + 100000);
      const clicks = Math.floor(impressions * (Math.random() * 0.04 + 0.01));
      const leads = Math.floor(clicks * (Math.random() * 0.15 + 0.05));
      const roas = revenue / spend;
      accounts.push({
        id: `${buyerId}-${bm}-${acc}`, bm: BM_NAMES[bm], bmIndex: bm,
        name: `Account ${acc + 1}`, spend, budget, revenue, impressions, clicks, leads, roas,
        ctr: (clicks / impressions) * 100, cpm: (spend / impressions) * 1000,
        cpl: leads > 0 ? spend / leads : 0,
        status: roas < 1.2 ? "poor" : roas < 2 ? "ok" : "good",
      });
    }
  }
  return accounts;
}

function fmt(n, type) {
  if (isNaN(n) || n === null || n === undefined) return "—";
  if (type === "currency") return "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (type === "pct") return Number(n).toFixed(2) + "%";
  if (type === "x") return Number(n).toFixed(2) + "x";
  if (type === "num") return Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n;
}

function summarize(accounts) {
  if (!accounts.length) return { spend: 0, budget: 0, revenue: 0, impressions: 0, clicks: 0, leads: 0, roas: 0, ctr: 0, cpm: 0, cpl: 0, budgetUsed: 0 };
  const spend = accounts.reduce((s, a) => s + (a.spend || 0), 0);
  const budget = accounts.reduce((s, a) => s + (a.budget || 0), 0);
  const revenue = accounts.reduce((s, a) => s + (a.revenue || 0), 0);
  const impressions = accounts.reduce((s, a) => s + (a.impressions || 0), 0);
  const clicks = accounts.reduce((s, a) => s + (a.clicks || 0), 0);
  const leads = accounts.reduce((s, a) => s + (a.leads || 0), 0);
  return {
    spend, budget, revenue, impressions, clicks, leads,
    roas: spend > 0 ? revenue / spend : 0,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    cpl: leads > 0 ? spend / leads : 0,
    budgetUsed: budget > 0 ? (spend / budget) * 100 : 0,
  };
}

const STATUS_COLOR = { good: "#00e5a0", ok: "#f5c542", poor: "#ff4d6d" };
const STATUS_BG = { good: "rgba(0,229,160,0.1)", ok: "rgba(245,197,66,0.1)", poor: "rgba(255,77,109,0.1)" };
const DATE_OPTIONS = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 3d", value: "last_3d" },
  { label: "Last 7d", value: "last_7d" },
  { label: "Last 14d", value: "last_14d" },
  { label: "Last 30d", value: "last_30d" },
  { label: "This Month", value: "this_month" },
  { label: "Last Month", value: "last_month" },
];

export default function App() {
  const [allData, setAllData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [selectedBuyer, setSelectedBuyer] = useState(null);
  const [selectedBM, setSelectedBM] = useState(null);
  const [sortKey, setSortKey] = useState("spend");
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [pulse, setPulse] = useState(false);
  const [datePreset, setDatePreset] = useState("last_7d");

  const loadData = useCallback(async (preset) => {
    const dp = preset || "last_7d";
    if (!META_TOKEN) {
      setAllData(MOCK_BUYERS.map(b => ({ ...b, accounts: generateMockAccounts(b.id) })));
      setIsLive(false); setLoading(false); return;
    }
    try {
      setError(null); setLoading(true);
      const rawAccounts = await fetchAdAccounts();
      const insightsArr = await Promise.all(rawAccounts.map(acc => fetchAccountInsights(acc.id, dp)));
      const flatAccounts = rawAccounts.map((acc, i) => {
        const ins = insightsArr[i];
        const spend = ins ? parseFloat(ins.amount_spent || 0) : 0;
        const budgetRemaining = ins ? parseFloat(ins.budget_remaining || 0) : 0;
        const budget = spend + budgetRemaining;
        const impressions = ins ? parseInt(ins.impressions || 0) : 0;
        const clicks = ins ? parseInt(ins.clicks || 0) : 0;
        const leads = ins ? extractLeads(ins.actions) : 0;
        const revenue = ins ? extractRevenue(ins.action_values) : 0;
        const roas = spend > 0 ? revenue / spend : 0;
        return {
          id: acc.id, name: acc.name || `Account ${i + 1}`,
          bm: acc.business?.name || BM_NAMES[i % 4], bmIndex: i % 4,
          spend, budget, revenue, impressions, clicks, leads, roas,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
          cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
          cpl: leads > 0 ? spend / leads : 0,
          status: roas < 1.2 ? "poor" : roas < 2 ? "ok" : "good",
        };
      });
      const buyers = MOCK_BUYERS.map((buyer, bi) => ({
        ...buyer, accounts: flatAccounts.filter((_, i) => i % 7 === bi),
      }));
      setAllData(buyers); setIsLive(true); setLastUpdated(new Date());
      setPulse(true); setTimeout(() => setPulse(false), 600);
    } catch (e) {
      setError(e.message);
      setAllData(MOCK_BUYERS.map(b => ({ ...b, accounts: generateMockAccounts(b.id) })));
      setIsLive(false);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(datePreset); }, [datePreset, loadData]);
  useEffect(() => {
    const interval = setInterval(() => loadData(datePreset), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [datePreset, loadData]);

  const activeBuyer = selectedBuyer !== null ? allData[selectedBuyer] : null;
  const displayAccounts = activeBuyer
    ? (selectedBM !== null ? activeBuyer.accounts.filter(a => a.bmIndex === selectedBM) : activeBuyer.accounts)
    : null;
  const sorted = displayAccounts ? [...displayAccounts].sort((a, b) => b[sortKey] - a[sortKey]) : null;
  const globalStats = summarize(allData.flatMap(b => b.accounts));

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0a0c10", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Mono', monospace" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>⚡</div>
        <div style={{ color: "#00e5a0", fontSize: 13, letterSpacing: "3px" }}>LOADING MEDIA COMMAND...</div>
        <div style={{ color: "#4a5068", fontSize: 11, marginTop: 8 }}>Fetching Meta Ads data</div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0a0c10", color: "#e8eaf0", fontFamily: "'DM Mono', 'Courier New', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #0a0c10; } ::-webkit-scrollbar-thumb { background: #2a2d3a; border-radius: 2px; }
        .buyer-card { transition: all 0.2s ease; cursor: pointer; } .buyer-card:hover { transform: translateY(-2px); }
        .acc-row:hover { background: rgba(255,255,255,0.04) !important; }
        .sort-btn, .date-btn { transition: all 0.15s ease; cursor: pointer; border: none; } .sort-btn:hover { color: #00e5a0; } .date-btn:hover { color: #fff !important; }
        .pulse { animation: pulseAnim 0.6s ease; } @keyframes pulseAnim { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .live-dot { animation: blink 2s infinite; } @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .fade-in { animation: fadeIn 0.3s ease; } @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* HEADER */}
      <div style={{ background: "#0d0f15", borderBottom: "1px solid #1e2130", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ background: "linear-gradient(135deg,#00e5a0,#0077ff)", width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>⚡</div>
          <div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 17, fontWeight: 800, color: "#fff" }}>MEDIA COMMAND</div>
            <div style={{ fontSize: 9, color: "#4a5068", letterSpacing: "2px" }}>META ADS · PERFORMANCE DASHBOARD</div>
          </div>
        </div>

        {/* DATE RANGE */}
        <div style={{ display: "flex", alignItems: "center", gap: 3, background: "#0a0c10", border: "1px solid #1e2130", borderRadius: 8, padding: "4px 6px" }}>
          {DATE_OPTIONS.map(opt => (
            <button key={opt.value} className="date-btn" onClick={() => setDatePreset(opt.value)}
              style={{
                background: datePreset === opt.value ? "rgba(0,229,160,0.15)" : "transparent",
                border: datePreset === opt.value ? "1px solid rgba(0,229,160,0.4)" : "1px solid transparent",
                color: datePreset === opt.value ? "#00e5a0" : "#4a5068",
                padding: "4px 9px", borderRadius: 5, fontSize: 10, fontFamily: "inherit",
              }}>{opt.label}</button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {error && <div style={{ fontSize: 10, color: "#ff4d6d", background: "rgba(255,77,109,0.1)", padding: "4px 10px", borderRadius: 5, maxWidth: 400, cursor: "pointer" }} title={error}>⚠ {error.length > 60 ? error.slice(0, 60) + "…" : error}</div>}
          {!isLive && !error && <div style={{ fontSize: 10, color: "#f5c542", background: "rgba(245,197,66,0.1)", padding: "4px 10px", borderRadius: 5 }}>DEMO MODE</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#4a5068" }}>
            <div className="live-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: isLive ? "#00e5a0" : "#f5c542" }} />
            {isLive ? "LIVE" : "DEMO"} · {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
          <button onClick={() => loadData(datePreset)} style={{ background: "rgba(0,229,160,0.08)", border: "1px solid rgba(0,229,160,0.2)", color: "#00e5a0", padding: "5px 12px", borderRadius: 6, fontSize: 10, fontFamily: "inherit", cursor: "pointer" }}>↺ REFRESH</button>
        </div>
      </div>

      <div style={{ display: "flex", height: "calc(100vh - 65px)" }}>
        {/* SIDEBAR */}
        <div style={{ width: 215, background: "#0d0f15", borderRight: "1px solid #1e2130", padding: "18px 10px", overflowY: "auto", flexShrink: 0 }}>
          <div style={{ fontSize: 9, letterSpacing: "2px", color: "#4a5068", marginBottom: 10, paddingLeft: 8 }}>MEDIA BUYERS</div>
          <div className="buyer-card" onClick={() => { setSelectedBuyer(null); setSelectedBM(null); }}
            style={{ padding: "10px 12px", borderRadius: 8, marginBottom: 4, background: selectedBuyer === null ? "rgba(0,229,160,0.1)" : "transparent", border: selectedBuyer === null ? "1px solid rgba(0,229,160,0.25)" : "1px solid transparent" }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: selectedBuyer === null ? "#00e5a0" : "#8890a8" }}>ALL BUYERS</div>
            <div style={{ fontSize: 10, color: "#4a5068", marginTop: 2 }}>{allData.flatMap(b => b.accounts).length} accounts</div>
          </div>
          <div style={{ height: 1, background: "#1e2130", margin: "10px 0" }} />
          {allData.map((buyer, i) => {
            const s = summarize(buyer.accounts);
            const isSel = selectedBuyer === i;
            return (
              <div key={buyer.id} className="buyer-card" onClick={() => { setSelectedBuyer(i); setSelectedBM(null); }}
                style={{ padding: "10px 12px", borderRadius: 8, marginBottom: 4, background: isSel ? "rgba(0,229,160,0.08)" : "transparent", border: isSel ? "1px solid rgba(0,229,160,0.2)" : "1px solid transparent" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 6, background: isSel ? "linear-gradient(135deg,#00e5a0,#0077ff)" : "#1e2130", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: isSel ? "#000" : "#8890a8", flexShrink: 0 }}>{buyer.avatar}</div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: isSel ? "#fff" : "#8890a8", lineHeight: 1.2 }}>{buyer.name}</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                  <span style={{ color: "#4a5068" }}>{fmt(s.spend, "currency")}</span>
                  <span style={{ color: s.roas >= 2 ? "#00e5a0" : s.roas >= 1.2 ? "#f5c542" : "#ff4d6d" }}>{fmt(s.roas, "x")}</span>
                </div>
              </div>
            );
          })}
          {activeBuyer && (
            <>
              <div style={{ height: 1, background: "#1e2130", margin: "10px 0" }} />
              <div style={{ fontSize: 9, letterSpacing: "2px", color: "#4a5068", marginBottom: 8, paddingLeft: 8 }}>BUSINESS MANAGERS</div>
              <div className="buyer-card" onClick={() => setSelectedBM(null)}
                style={{ padding: "8px 12px", borderRadius: 6, marginBottom: 3, background: selectedBM === null ? "rgba(0,119,255,0.1)" : "transparent", border: selectedBM === null ? "1px solid rgba(0,119,255,0.25)" : "1px solid transparent", fontSize: 10, color: selectedBM === null ? "#4da6ff" : "#4a5068", cursor: "pointer" }}>ALL BMs</div>
              {BM_NAMES.map((bm, i) => (
                <div key={i} className="buyer-card" onClick={() => setSelectedBM(i)}
                  style={{ padding: "8px 12px", borderRadius: 6, marginBottom: 3, background: selectedBM === i ? "rgba(0,119,255,0.1)" : "transparent", border: selectedBM === i ? "1px solid rgba(0,119,255,0.25)" : "1px solid transparent", fontSize: 10, color: selectedBM === i ? "#4da6ff" : "#4a5068", cursor: "pointer" }}>{bm}</div>
              ))}
            </>
          )}
        </div>

        {/* MAIN */}
        <div style={{ flex: 1, overflowY: "auto", padding: "22px 26px" }}>
          <div className="fade-in" style={{ marginBottom: 22 }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>
              {activeBuyer ? activeBuyer.name : "All Media Buyers"}
              {selectedBM !== null && <span style={{ color: "#4da6ff", fontSize: 16 }}> · {BM_NAMES[selectedBM]}</span>}
            </div>
            <div style={{ fontSize: 11, color: "#4a5068", marginTop: 3 }}>
              {activeBuyer ? `${displayAccounts.length} accounts · ${selectedBM !== null ? BM_NAMES[selectedBM] : "All BMs"}` : `${allData.length} buyers · ${allData.flatMap(b => b.accounts).length} accounts`}
              <span style={{ marginLeft: 8, color: "#00e5a0" }}>· {DATE_OPTIONS.find(d => d.value === datePreset)?.label}</span>
            </div>
          </div>

          {/* KPI CARDS */}
          {(() => {
            const s = activeBuyer ? summarize(displayAccounts) : globalStats;
            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 26 }}>
                {[
                  { label: "TOTAL SPEND", value: fmt(s.spend, "currency"), sub: `of ${fmt(s.budget, "currency")} budget`, pct: s.budgetUsed, color: "#4da6ff" },
                  { label: "REVENUE", value: fmt(s.revenue, "currency"), sub: `ROAS ${fmt(s.roas, "x")}`, color: s.roas >= 2 ? "#00e5a0" : s.roas >= 1.2 ? "#f5c542" : "#ff4d6d" },
                  { label: "LEADS", value: fmt(s.leads, "num"), sub: `CPL ${fmt(s.cpl, "currency")}`, color: "#a78bfa" },
                  { label: "CTR", value: fmt(s.ctr, "pct"), sub: `CPM ${fmt(s.cpm, "currency")}`, color: "#f5c542" },
                  { label: "IMPRESSIONS", value: fmt(s.impressions / 1000, "num") + "K", sub: `${fmt(s.clicks, "num")} clicks`, color: "#ff8c42" },
                ].map((c, i) => (
                  <div key={i} className={pulse ? "pulse" : ""} style={{ background: "#0d0f15", border: "1px solid #1e2130", borderRadius: 12, padding: "15px 16px" }}>
                    <div style={{ fontSize: 9, letterSpacing: "2px", color: "#4a5068", marginBottom: 7 }}>{c.label}</div>
                    <div style={{ fontSize: 19, fontWeight: 500, color: c.color, fontFamily: "'Syne', sans-serif", letterSpacing: "-0.5px" }}>{c.value}</div>
                    <div style={{ fontSize: 10, color: "#4a5068", marginTop: 3 }}>{c.sub}</div>
                    {c.pct !== undefined && (
                      <div style={{ marginTop: 7, background: "#1e2130", borderRadius: 4, height: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.min(c.pct || 0, 100)}%`, background: (c.pct || 0) > 90 ? "#ff4d6d" : "#4da6ff", borderRadius: 4, transition: "width 0.8s ease" }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* ALL BUYERS GRID */}
          {!activeBuyer && (
            <div className="fade-in">
              <div style={{ fontSize: 9, letterSpacing: "2px", color: "#4a5068", marginBottom: 12 }}>BUYER PERFORMANCE GRID</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10, marginBottom: 26 }}>
                {allData.map((buyer, i) => {
                  const s = summarize(buyer.accounts);
                  return (
                    <div key={i} className="buyer-card" onClick={() => setSelectedBuyer(i)}
                      style={{ background: "#0d0f15", border: "1px solid #1e2130", borderRadius: 10, padding: "13px 11px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 9 }}>
                        <div style={{ width: 26, height: 26, borderRadius: 6, background: "#1e2130", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#8890a8" }}>{buyer.avatar}</div>
                        <div style={{ fontSize: 10, color: "#fff" }}>{buyer.name.split(" ")[0]}</div>
                      </div>
                      {[
                        { l: "Spend", v: fmt(s.spend, "currency"), c: "#4da6ff" },
                        { l: "ROAS", v: fmt(s.roas, "x"), c: s.roas >= 2 ? "#00e5a0" : s.roas >= 1.2 ? "#f5c542" : "#ff4d6d" },
                        { l: "Leads", v: fmt(s.leads, "num"), c: "#a78bfa" },
                        { l: "CTR", v: fmt(s.ctr, "pct"), c: "#f5c542" },
                      ].map((row, j) => (
                        <div key={j} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 4 }}>
                          <span style={{ color: "#4a5068" }}>{row.l}</span>
                          <span style={{ color: row.c, fontWeight: 500 }}>{row.v}</span>
                        </div>
                      ))}
                      <div style={{ marginTop: 7, background: "#1e2130", borderRadius: 4, height: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.min(s.budgetUsed || 0, 100)}%`, background: (s.budgetUsed || 0) > 90 ? "#ff4d6d" : "#4da6ff", borderRadius: 4 }} />
                      </div>
                      <div style={{ fontSize: 9, color: "#4a5068", marginTop: 3 }}>{fmt(s.budgetUsed, "pct")} budget used</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 9, letterSpacing: "2px", color: "#4a5068", marginBottom: 12 }}>BM BREAKDOWN · ALL BUYERS</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                {BM_NAMES.map((bm, bmIdx) => {
                  const accs = allData.flatMap(b => b.accounts.filter(a => a.bmIndex === bmIdx));
                  const s = summarize(accs);
                  return (
                    <div key={bmIdx} style={{ background: "#0d0f15", border: "1px solid #1e2130", borderRadius: 10, padding: "13px 15px" }}>
                      <div style={{ fontSize: 11, color: "#4da6ff", fontWeight: 500, marginBottom: 9 }}>{bm}</div>
                      {[
                        { l: "Spend", v: fmt(s.spend, "currency") },
                        { l: "Revenue", v: fmt(s.revenue, "currency") },
                        { l: "ROAS", v: fmt(s.roas, "x"), c: s.roas >= 2 ? "#00e5a0" : s.roas >= 1.2 ? "#f5c542" : "#ff4d6d" },
                        { l: "Leads", v: fmt(s.leads, "num") },
                        { l: "CPL", v: fmt(s.cpl, "currency") },
                        { l: "CTR", v: fmt(s.ctr, "pct") },
                      ].map((row, j) => (
                        <div key={j} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 5 }}>
                          <span style={{ color: "#4a5068" }}>{row.l}</span>
                          <span style={{ color: row.c || "#e8eaf0", fontWeight: 500 }}>{row.v}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ACCOUNT TABLE */}
          {activeBuyer && sorted && (
            <div className="fade-in">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: 9, letterSpacing: "2px", color: "#4a5068" }}>AD ACCOUNTS · {sorted.length} RESULTS</div>
                <div style={{ display: "flex", gap: 5 }}>
                  {["spend", "roas", "leads", "ctr", "cpm", "cpl"].map(k => (
                    <button key={k} className="sort-btn" onClick={() => setSortKey(k)}
                      style={{ background: sortKey === k ? "rgba(0,229,160,0.1)" : "transparent", border: sortKey === k ? "1px solid rgba(0,229,160,0.3)" : "1px solid #1e2130", color: sortKey === k ? "#00e5a0" : "#4a5068", padding: "4px 10px", borderRadius: 5, fontSize: 10, fontFamily: "inherit", textTransform: "uppercase" }}>{k}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "160px 110px 1fr 90px 90px 75px 75px 75px 75px 55px", padding: "8px 14px", background: "#0d0f15", borderRadius: "8px 8px 0 0", border: "1px solid #1e2130", borderBottom: "none" }}>
                {["ACCOUNT", "BM", "BUDGET USE", "SPEND", "REVENUE", "ROAS", "CTR", "CPM", "CPL", "LEADS"].map((h, i) => (
                  <div key={i} style={{ fontSize: 9, letterSpacing: "1.5px", color: "#4a5068", textAlign: i > 1 ? "right" : "left" }}>{h}</div>
                ))}
              </div>
              <div style={{ border: "1px solid #1e2130", borderRadius: "0 0 8px 8px", overflow: "hidden" }}>
                {sorted.map((acc, i) => {
                  const bp = acc.budget > 0 ? (acc.spend / acc.budget) * 100 : 0;
                  return (
                    <div key={acc.id} className="acc-row" style={{ display: "grid", gridTemplateColumns: "160px 110px 1fr 90px 90px 75px 75px 75px 75px 55px", padding: "10px 14px", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)", borderBottom: i < sorted.length - 1 ? "1px solid #1e2130" : "none", alignItems: "center" }}>
                      <div style={{ fontSize: 11, color: "#e8eaf0" }}>{acc.name}</div>
                      <div style={{ fontSize: 10, color: "#4a5068" }}>{acc.bm}</div>
                      <div style={{ paddingRight: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#4a5068", marginBottom: 3 }}>
                          <span>{fmt(acc.spend, "currency")}</span><span>{fmt(bp, "pct")}</span>
                        </div>
                        <div style={{ background: "#1e2130", borderRadius: 3, height: 4, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.min(bp, 100)}%`, background: bp > 90 ? "#ff4d6d" : bp > 70 ? "#f5c542" : "#4da6ff", borderRadius: 3 }} />
                        </div>
                      </div>
                      <div style={{ textAlign: "right", fontSize: 11, color: "#4da6ff" }}>{fmt(acc.spend, "currency")}</div>
                      <div style={{ textAlign: "right", fontSize: 11, color: "#e8eaf0" }}>{fmt(acc.revenue, "currency")}</div>
                      <div style={{ textAlign: "right", fontSize: 11, color: STATUS_COLOR[acc.status], fontWeight: 500 }}>{fmt(acc.roas, "x")}</div>
                      <div style={{ textAlign: "right", fontSize: 11, color: "#f5c542" }}>{fmt(acc.ctr, "pct")}</div>
                      <div style={{ textAlign: "right", fontSize: 11, color: "#e8eaf0" }}>{fmt(acc.cpm, "currency")}</div>
                      <div style={{ textAlign: "right", fontSize: 11, color: "#e8eaf0" }}>{fmt(acc.cpl, "currency")}</div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ background: STATUS_BG[acc.status], color: STATUS_COLOR[acc.status], padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 500 }}>{fmt(acc.leads, "num")}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
