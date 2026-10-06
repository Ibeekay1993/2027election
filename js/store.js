// NaijaPVT v2 — multiple reps per polling unit, cross-checked collation
const STATES = ["Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno","Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT","Gombe","Imo","Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa","Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto","Taraba","Yobe","Zamfara"];
const PARTIES = ["APC","PDP","LP","NNPP","APGA","SDP","ADC","PRP","YPP"];
const REPS_PER_PU = 3;               // recruitment model: N reps deployed per polling unit
const BACKEND_READY = false;         // Flip only after Supabase auth, RLS, and RPC are configured.

const DB = {
  read(k, d){ try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch(e){ return d; } },
  write(k, v){ localStorage.setItem(k, JSON.stringify(v)); }
};
const K_RESULTS = "naijapvt_results_v2";   // { puCode: [ {record, ...} ] }
const K_USER    = "naijapvt_user";
const K_OFFICIAL= "naijapvt_official_v2";  // { state: {_acc, APC, PDP, ...} }


function getResults(){ return BACKEND_READY ? DB.read(K_RESULTS, {}) : {}; } // Replace with Supabase service before live use.
function getPU(puCode){ return getResults()[puCode] || []; }
function hasSubmitted(puCode, email){ return getPU(puCode).some(r => r.repEmail === email); }
function allRecords(){ const out=[]; Object.values(getResults()).forEach(a => a.forEach(r => out.push(r))); return out; }
function saveResult(rec){
  if (!BACKEND_READY) return { ok:false, msg:"Report submission is unavailable until the shared reporting service is configured." };
  const all = getResults();
  all[rec.puCode] = all[rec.puCode] || [];
  if (all[rec.puCode].some(r => r.repEmail === rec.repEmail))
    return { ok:false, msg:"You have already submitted for this polling unit. Each rep reports once." };
  if (all[rec.puCode].length >= REPS_PER_PU)
    return { ok:false, msg:"This polling unit already has all 3 reports. Contact the collation team if a correction is needed." };
  all[rec.puCode].push(rec); DB.write(K_RESULTS, all); return { ok:true };
}
function getUser(){ return BACKEND_READY ? DB.read(K_USER, null) : null; }
function setUser(u){ if (BACKEND_READY) DB.write(K_USER, u); }
function logout(){ localStorage.removeItem(K_USER); location.href = "login.html"; }
function getOfficial(){ return BACKEND_READY ? DB.read(K_OFFICIAL, {}) : {}; }
function saveOfficial(state, data){ if (!BACKEND_READY) return false; const o = getOfficial(); o[state] = data; DB.write(K_OFFICIAL, o); return true; }
function fmt(n){ return (n||0).toLocaleString("en-NG"); }
function escapeHTML(value){
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}

// ---- strict consensus: only three identical reports are verified ----
function sameFigures(a,b){
  return a.accredited === b.accredited && a.rejected === b.rejected &&
    PARTIES.every(p => (a.votes[p]||0) === (b.votes[p]||0));
}
function isVerified(puArr){ return puArr.length === REPS_PER_PU && puArr.every(r => sameFigures(r, puArr[0])); }
function puConsensus(puArr){
  const source = isVerified(puArr) ? puArr[0] : { votes:{}, accredited:0, rejected:0 };
  const c = { votes:{}, accredited:source.accredited, rejected:source.rejected, validVotes:0, reps: puArr.length };
  PARTIES.forEach(p => { c.votes[p] = source.votes[p]||0; });
  c.validVotes = PARTIES.reduce((a,p)=>a+c.votes[p],0);
  return c;
}
function puSpread(puArr){
  // Largest difference across any reported figure, including accredited/rejected.
  let maxGap = 0;
  PARTIES.forEach(p => {
    const vals = puArr.map(r => r.votes[p]||0);
    maxGap = Math.max(maxGap, Math.max(...vals) - Math.min(...vals));
  });
  ["accredited","rejected"].forEach(k => {
    const vals = puArr.map(r => r[k]||0);
    if (vals.length) maxGap = Math.max(maxGap, Math.max(...vals)-Math.min(...vals));
  });
  return maxGap;
}
function puStatus(puArr){
  const gap = puSpread(puArr);
  if (puArr.length < REPS_PER_PU) return { cls:"gold",  label:"Awaiting " + (REPS_PER_PU - puArr.length) + " more rep(s)", gap };
  if (isVerified(puArr)) return { cls:"green", label:"Verified — all 3 agree", gap };
  return { cls:"red", label:"Reps disagree — review photos", gap };
}

// ---- verified-result collation ----
function tallyConsensus(list){
  const t = { pus: list.length, verifiedPus:0, reported:0, accredited:0, valid:0, rejected:0, parties:{}, agreed:0, variance:0, pending:0 };
  PARTIES.forEach(p=>t.parties[p]=0);
  list.forEach(r=>{
    const st = puStatus(r);
    t.reported += r.length;
    if (st.cls==="green") {
      const c = puConsensus(r); t.verifiedPus++; t.agreed++;
      t.accredited += c.accredited; t.valid += c.validVotes; t.rejected += c.rejected;
      PARTIES.forEach(p=>t.parties[p]+=c.votes[p]);
    } else if (st.cls==="red") t.variance++;
    else t.pending++;
  });
  return t;
}
function resultsByState(){
  const by = {};
  Object.entries(getResults()).forEach(([pu, arr]) => { const st = arr[0].state; (by[st]=by[st]||[]).push(arr); });
  return by;
}
function renderNav(active){
  const u = getUser();
  const el = document.getElementById("appnav"); if(!el) return;
  const links = [["index.html","Home","home"],["results.html","Results","results"],["compare.html","Compare with INEC","compare"],["dashboard.html","Rep Portal","dashboard"]];
  el.innerHTML = `<div class="topnav-inner">
    <a class="brand" href="index.html"><span class="dot"></span>NaijaPVT</a>
    <nav>${links.map(l=>`<a href="${l[0]}" class="${active===l[2]?"active":""}">${l[1]}</a>`).join("")}
    ${u ? `<a href="#" onclick="logout();return false;" style="color:#e8b93d">Logout (${escapeHTML(String(u.name || "Rep").split(" ")[0])})</a>` : `<a href="login.html" style="color:#e8b93d">Rep Login</a>`}
    </nav></div>`;
}


