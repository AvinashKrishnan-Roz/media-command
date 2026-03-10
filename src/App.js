import { useState, useEffect, useCallback } from "react";

const META_TOKEN = process.env.REACT_APP_META_TOKEN;
const API = "https://graph.facebook.com/v19.0";

async function metaGet(path, params = {}) {
  const qs = new URLSearchParams({ access_token: META_TOKEN, ...params }).toString();
  const res = await fetch(`${API}${path}?${qs}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json;
}

async function fetchAllAccounts() {
  const all = [];
  try {
    const d = await metaGet("/me/adaccounts", { fields: "id,name,account_status,business", limit: 200 });
    if (d.data?.length) all.push(...d.data);
  } catch {}
  try {
    const biz = await metaGet("/me/businesses", { fields: "id,name", limit: 50 });
    for (const b of biz.data || []) {
      try {
        const owned = await metaGet(`/${b.id}/owned_ad_accounts`, { fields: "id,name,account_status,business", limit: 200 });
        for (const a of owned.data || []) if (!all.find(x => x.id === a.id)) all.push({ ...a, business: { name: b.name } });
      } catch {}
      try {
        const client = await metaGet(`/${b.id}/client_ad_accounts`, { fields: "id,name,account_status,business", limit: 200 });
        for (const a of client.data || []) if (!all.find(x => x.id === a.id)) all.push({ ...a, business: { name: b.name } });
      } catch {}
    }
  } catch {}
  return all;
}

async function fetchInsights(accountId, datePreset) {
  try {
    const fields = "spend,impressions,clicks,ctr,cpm,actions,action_values,reach,frequency";
    const d = await metaGet(`/${accountId}/insights`, { fields, date_preset: datePreset, level: "account" });
    return d.data?.[0] || null;
  } catch { return null; }
}

function getLeads(actions) {
  return parseInt((actions || []).find(x => ["lead","offsite_conversion.lead","onsite_conversion.lead_grouped"].includes(x.action_type))?.value || 0);
}
function getRevenue(vals) {
  return parseFloat((vals || []).find(x => ["purchase","offsite_conversion.fb_pixel_purchase"].includes(x.action_type))?.value || 0);
}
function getResults(actions) {
  const priority = ["lead","offsite_conversion.lead","purchase","offsite_conversion.fb_pixel_purchase","complete_registration","subscribe"];
  for (const p of priority) { const a = (actions||[]).find(x=>x.action_type===p); if (a) return {value: parseInt(a.value), type: p.split(".").pop().replace("fb_pixel_","") }; }
  const total = (actions||[]).reduce((s,a)=>s+parseInt(a.value||0),0);
  return { value: total, type: "actions" };
}

function f(n, t) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  n = Number(n);
  if (t === "$") return n >= 1000 ? `$${(n/1000).toFixed(1)}k` : `$${n.toFixed(0)}`;
  if (t === "%") return n.toFixed(2) + "%";
  if (t === "x") return n.toFixed(2) + "x";
  if (t === "n") return n >= 1000000 ? (n/1000000).toFixed(1)+"M" : n >= 1000 ? (n/1000).toFixed(1)+"k" : n.toLocaleString();
  return n;
}

const DATE_OPTS = [
  { l: "Today", v: "today" }, { l: "Yesterday", v: "yesterday" },
  { l: "7d", v: "last_7d" }, { l: "14d", v: "last_14d" },
  { l: "30d", v: "last_30d" }, { l: "This Month", v: "this_month" },
  { l: "Last Month", v: "last_month" },
];

const MOCK = Array.from({ length: 14 }, (_, i) => {
  const spend = Math.random() * 9000 + 200;
  const impr = Math.floor(Math.random() * 800000 + 20000);
  const clicks = Math.floor(impr * (0.01 + Math.random() * 0.04));
  const leads = Math.floor(clicks * (0.05 + Math.random() * 0.2));
  const revenue = spend * (0.8 + Math.random() * 3.5);
  const names = ["Rozana Marketplace K6","Rozana MP K9 Truliyo","Rozana MP 04 Truliyo","Rozana.in","Rozana MP K2 Kgtel","Rozana MP Ad Account","Rozana MP 01","Rozana MP K1 Saurabh","Rozana MP 02 PhotonX","Rozana MP K5 Hemant","Headrun Ads","Rozana MP K3 Alpha","Rozana MP K4 Beta","Rozana MP K7 Gamma"];
  const bms = ["Rozana","Headrun Technologies","Karthik Bala's Business","Rozana MP"];
  return { id: `mock-${i}`, name: names[i] || `Account ${i+1}`, bm: bms[i%4], spend, impr, clicks, leads, revenue, ctr: (clicks/impr)*100, cpm: (spend/impr)*1000, cpl: leads>0?spend/leads:0, roas: revenue/spend, results: leads, resultType: "leads", status: "ACTIVE" };
});

export default function App() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [date, setDate] = useState("last_7d");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "spend", dir: -1 });
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const load = useCallback(async (dp) => {
    if (!META_TOKEN) { setAccounts(MOCK); setIsLive(false); setLoading(false); return; }
    try {
      setLoading(true); setError(null);
      const raw = await fetchAllAccounts();
      const insights = await Promise.all(raw.map(a => fetchInsights(a.id, dp)));
      const mapped = raw.map((a, i) => {
        const ins = insights[i];
        const spend = parseFloat(ins?.spend || 0);
        const impr = parseInt(ins?.impressions || 0);
        const clicks = parseInt(ins?.clicks || 0);
        const leads = getLeads(ins?.actions);
        const revenue = getRevenue(ins?.action_values);
        const res = getResults(ins?.actions);
        return { id: a.id, name: a.name, bm: a.business?.name || "—", spend, impr, clicks, leads, revenue, ctr: parseFloat(ins?.ctr||0), cpm: parseFloat(ins?.cpm||0), cpl: leads>0?spend/leads:0, roas: spend>0?revenue/spend:0, results: res.value, resultType: res.type, status: a.account_status===1?"ACTIVE":"INACTIVE" };
      });
      setAccounts(mapped); setIsLive(true); setLastUpdated(new Date());
    } catch (e) { setError(e.message); setAccounts(MOCK); setIsLive(false); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(date); }, [date, load]);
  useEffect(() => { const t = setInterval(() => load(date), 5*60*1000); return () => clearInterval(t); }, [date, load]);

  const handleSort = (key) => setSort(s => ({ key, dir: s.key===key ? -s.dir : -1 }));
  const filtered = accounts.filter(a => a.name.toLowerCase().includes(search.toLowerCase()) || a.bm.toLowerCase().includes(search.toLowerCase())).sort((a,b) => (a[sort.key]>b[sort.key]?1:-1)*sort.dir);
  const T = { spend: accounts.reduce((s,a)=>s+a.spend,0), impr: accounts.reduce((s,a)=>s+a.impr,0), clicks: accounts.reduce((s,a)=>s+a.clicks,0), results: accounts.reduce((s,a)=>s+a.results,0), revenue: accounts.reduce((s,a)=>s+a.revenue,0) };
  T.ctr = T.impr>0?(T.clicks/T.impr)*100:0; T.cpm = T.impr>0?(T.spend/T.impr)*1000:0; T.roas = T.spend>0?T.revenue/T.spend:0; T.cpl = T.results>0?T.spend/T.results:0;

  const TH = ({label,k,right}) => (
    <th onClick={()=>handleSort(k)} style={{padding:"10px 14px",fontSize:11,fontWeight:600,letterSpacing:"0.5px",color:sort.key===k?"#fff":"#94a3b8",cursor:"pointer",textAlign:right?"right":"left",whiteSpace:"nowrap",borderBottom:"1px solid #1e293b",background:"#0f172a",userSelect:"none"}}>
      {label}<span style={{marginLeft:4,opacity:sort.key===k?1:0.3,fontSize:10}}>{sort.key===k?(sort.dir===-1?"↓":"↑"):"↕"}</span>
    </th>
  );

  return (
    <div style={{minHeight:"100vh",background:"#080f1e",color:"#e2e8f0",fontFamily:"'IBM Plex Mono',monospace"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=Anybody:wght@700;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:#080f1e}::-webkit-scrollbar-thumb{background:#1e293b;border-radius:3px}
        tr.row:hover td{background:#0f1f3d!important} tr.row td{transition:background 0.12s}
        .dp{transition:all 0.15s;cursor:pointer;border:none}.dp:hover{background:rgba(99,179,237,0.12)!important;color:#93c5fd!important}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}.fu{animation:fadeUp 0.35s ease forwards}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}.pulse{animation:pulse 1.5s infinite}
        input::placeholder{color:#334155}input:focus{outline:none;border-color:#3b82f6!important}
      `}</style>

      {/* HEADER */}
      <div style={{background:"#0a1628",borderBottom:"1px solid #1e293b",padding:"0 24px",display:"flex",alignItems:"center",justifyContent:"space-between",height:54,flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:28,height:28,background:"linear-gradient(135deg,#3b82f6,#06b6d4)",borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>📊</div>
          <span style={{fontFamily:"'Anybody',sans-serif",fontWeight:900,fontSize:15,color:"#fff",letterSpacing:"-0.5px"}}>ADSPEND</span>
          <span style={{fontSize:9,color:"#1e3a5f",letterSpacing:"3px"}}>TRACKER</span>
        </div>
        <div style={{display:"flex",gap:3,background:"#0d1b2e",border:"1px solid #1e293b",borderRadius:9,padding:"3px 4px"}}>
          {DATE_OPTS.map(o=>(
            <button key={o.v} className="dp" onClick={()=>setDate(o.v)} style={{background:date===o.v?"rgba(59,130,246,0.2)":"transparent",border:date===o.v?"1px solid rgba(59,130,246,0.4)":"1px solid transparent",color:date===o.v?"#93c5fd":"#475569",padding:"4px 10px",borderRadius:6,fontSize:11,fontFamily:"inherit"}}>{o.l}</button>
          ))}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          {error && <span style={{fontSize:10,color:"#f87171",background:"rgba(239,68,68,0.1)",padding:"3px 10px",borderRadius:5,maxWidth:300,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={error}>⚠ {error}</span>}
          <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11}}>
            <span className={loading?"pulse":""} style={{width:7,height:7,borderRadius:"50%",background:isLive?"#22c55e":"#f59e0b",display:"inline-block"}}/>
            <span style={{color:"#475569"}}>{isLive?"LIVE":"DEMO"} · {lastUpdated.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
          </div>
          <button onClick={()=>load(date)} style={{background:"rgba(59,130,246,0.1)",border:"1px solid rgba(59,130,246,0.25)",color:"#60a5fa",padding:"5px 12px",borderRadius:7,fontSize:11,fontFamily:"inherit",cursor:"pointer"}}>↺ Refresh</button>
        </div>
      </div>

      <div style={{padding:"20px 24px"}}>
        {/* KPI STRIP */}
        <div className="fu" style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",gap:8,marginBottom:20}}>
          {[
            {label:"TOTAL SPEND",value:f(T.spend,"$"),accent:"#60a5fa"},
            {label:"REVENUE",value:f(T.revenue,"$"),accent:"#34d399"},
            {label:"ROAS",value:f(T.roas,"x"),accent:T.roas>=2?"#34d399":T.roas>=1?"#fbbf24":"#f87171"},
            {label:"RESULTS",value:f(T.results,"n"),accent:"#a78bfa"},
            {label:"CPL",value:f(T.cpl,"$"),accent:"#fb923c"},
            {label:"IMPRESSIONS",value:f(T.impr,"n"),accent:"#38bdf8"},
            {label:"CLICKS",value:f(T.clicks,"n"),accent:"#e2e8f0"},
            {label:"CTR",value:f(T.ctr,"%"),accent:"#fbbf24"},
          ].map((c,i)=>(
            <div key={i} style={{background:"#0a1628",border:"1px solid #1e293b",borderRadius:10,padding:"12px 14px"}}>
              <div style={{fontSize:9,color:"#334155",letterSpacing:"1.5px",marginBottom:6}}>{c.label}</div>
              <div style={{fontSize:17,fontWeight:600,color:c.accent,fontFamily:"'Anybody',sans-serif"}}>{c.value}</div>
              <div style={{fontSize:9,color:"#1e3a5f",marginTop:3}}>{accounts.length} accs</div>
            </div>
          ))}
        </div>

        {/* SEARCH */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search account or BM…" style={{background:"#0a1628",border:"1px solid #1e293b",color:"#e2e8f0",padding:"7px 13px",borderRadius:8,fontSize:12,fontFamily:"inherit",width:250}}/>
            {search && <button onClick={()=>setSearch("")} style={{background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:18,lineHeight:1}}>×</button>}
          </div>
          <div style={{fontSize:11,color:"#334155"}}>{filtered.length} of {accounts.length} accounts · {DATE_OPTS.find(d=>d.v===date)?.l}</div>
        </div>

        {/* TABLE */}
        <div className="fu" style={{background:"#0a1628",border:"1px solid #1e293b",borderRadius:12,overflow:"hidden"}}>
          {loading ? (
            <div style={{padding:60,textAlign:"center"}}>
              <div className="pulse" style={{fontSize:26,marginBottom:10}}>📊</div>
              <div style={{color:"#334155",fontSize:12,letterSpacing:"2px"}}>FETCHING DATA…</div>
            </div>
          ) : (
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr>
                    <th style={{padding:"10px 14px",fontSize:11,color:"#334155",borderBottom:"1px solid #1e293b",background:"#0f172a",width:36}}>#</th>
                    <TH label="ACCOUNT" k="name"/>
                    <TH label="BM" k="bm"/>
                    <TH label="SPEND" k="spend" right/>
                    <TH label="RESULTS" k="results" right/>
                    <TH label="CPL" k="cpl" right/>
                    <TH label="ROAS" k="roas" right/>
                    <TH label="IMPRESSIONS" k="impr" right/>
                    <TH label="CLICKS" k="clicks" right/>
                    <TH label="CTR" k="ctr" right/>
                    <TH label="CPM" k="cpm" right/>
                    <th style={{padding:"10px 14px",fontSize:11,color:"#334155",borderBottom:"1px solid #1e293b",background:"#0f172a",textAlign:"center"}}>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {/* TOTALS */}
                  <tr style={{borderBottom:"2px solid #1e3a5f"}}>
                    <td style={{padding:"11px 14px",background:"#0d1b2e"}}/>
                    <td style={{padding:"11px 14px",background:"#0d1b2e",fontSize:11,fontWeight:600,color:"#60a5fa",letterSpacing:"1px"}}>TOTAL · {accounts.length} ACCOUNTS</td>
                    <td style={{padding:"11px 14px",background:"#0d1b2e"}}/>
                    {[
                      {v:f(T.spend,"$"),c:"#60a5fa"},{v:f(T.results,"n"),c:"#a78bfa"},
                      {v:f(T.cpl,"$"),c:"#fb923c"},{v:f(T.roas,"x"),c:T.roas>=2?"#34d399":T.roas>=1?"#fbbf24":"#f87171"},
                      {v:f(T.impr,"n"),c:"#38bdf8"},{v:f(T.clicks,"n"),c:"#e2e8f0"},
                      {v:f(T.ctr,"%"),c:"#fbbf24"},{v:f(T.cpm,"$"),c:"#94a3b8"},
                    ].map((x,i)=>(
                      <td key={i} style={{padding:"11px 14px",background:"#0d1b2e",textAlign:"right",fontSize:13,fontWeight:600,color:x.c}}>{x.v}</td>
                    ))}
                    <td style={{padding:"11px 14px",background:"#0d1b2e"}}/>
                  </tr>

                  {filtered.length===0 ? (
                    <tr><td colSpan={12} style={{padding:40,textAlign:"center",color:"#334155",fontSize:12}}>No accounts match</td></tr>
                  ) : filtered.map((acc,i)=>{
                    const bg = i%2===0?"#0a1628":"#0b1a30";
                    return (
                      <tr key={acc.id} className="row">
                        <td style={{padding:"11px 14px",fontSize:11,color:"#334155",background:bg}}>{i+1}</td>
                        <td style={{padding:"11px 14px",background:bg}}>
                          <div style={{fontSize:12,color:"#e2e8f0",fontWeight:500}}>{acc.name}</div>
                        </td>
                        <td style={{padding:"11px 14px",fontSize:11,color:"#475569",background:bg,whiteSpace:"nowrap"}}>{acc.bm}</td>
                        <td style={{padding:"11px 14px",textAlign:"right",background:bg}}>
                          <span style={{fontSize:13,fontWeight:600,color:"#60a5fa"}}>{f(acc.spend,"$")}</span>
                        </td>
                        <td style={{padding:"11px 14px",textAlign:"right",background:bg}}>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:4}}>
                            <span style={{fontSize:12,color:"#a78bfa"}}>{f(acc.results,"n")}</span>
                            <span style={{fontSize:9,color:"#334155",textTransform:"uppercase"}}>{acc.resultType}</span>
                          </div>
                        </td>
                        <td style={{padding:"11px 14px",textAlign:"right",fontSize:12,color:"#fb923c",background:bg}}>{f(acc.cpl,"$")}</td>
                        <td style={{padding:"11px 14px",textAlign:"right",background:bg}}>
                          <span style={{fontSize:12,color:acc.roas>=2?"#34d399":acc.roas>=1?"#fbbf24":"#f87171",fontWeight:600}}>{f(acc.roas,"x")}</span>
                        </td>
                        <td style={{padding:"11px 14px",textAlign:"right",fontSize:12,color:"#38bdf8",background:bg}}>{f(acc.impr,"n")}</td>
                        <td style={{padding:"11px 14px",textAlign:"right",fontSize:12,color:"#e2e8f0",background:bg}}>{f(acc.clicks,"n")}</td>
                        <td style={{padding:"11px 14px",textAlign:"right",fontSize:12,color:"#fbbf24",background:bg}}>{f(acc.ctr,"%")}</td>
                        <td style={{padding:"11px 14px",textAlign:"right",fontSize:12,color:"#94a3b8",background:bg}}>{f(acc.cpm,"$")}</td>
                        <td style={{padding:"11px 14px",textAlign:"center",background:bg}}>
                          <span style={{fontSize:9,fontWeight:600,letterSpacing:"1px",padding:"3px 8px",borderRadius:4,background:acc.status==="ACTIVE"?"rgba(34,197,94,0.1)":"rgba(148,163,184,0.1)",color:acc.status==="ACTIVE"?"#22c55e":"#475569",border:`1px solid ${acc.status==="ACTIVE"?"rgba(34,197,94,0.25)":"rgba(148,163,184,0.15)"}`}}>{acc.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div style={{marginTop:10,fontSize:10,color:"#1e3a5f",textAlign:"right"}}>
          Auto-refreshes every 5 min · {isLive?"Connected to Meta Ads API":"Demo mode — add REACT_APP_META_TOKEN to Vercel to go live"}
        </div>
      </div>
    </div>
  );
}
