// NaijaPVT v2 — multiple reps per polling unit, cross-checked collation
const STATES = ["Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno","Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT","Gombe","Imo","Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa","Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto","Taraba","Yobe","Zamfara"];
const PARTIES = ["APC","PDP","LP","NNPP","APGA","SDP","ADC","PRP","YPP"];
const REPS_PER_PU = 3;               // recruitment model: N reps deployed per polling unit

const DB = {
  read(k, d){ try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch(e){ return d; } },
  write(k, v){ localStorage.setItem(k, JSON.stringify(v)); }
};
const K_RESULTS = "naijapvt_results_v2";   // { puCode: [ {record, ...} ] }
const K_USER    = "naijapvt_user";
const K_OFFICIAL= "naijapvt_official_v2";  // { state: {_acc, APC, PDP, ...} }
const K_SEEDED  = "naijapvt_seeded_v2";

function getResults(){ return DB.read(K_RESULTS, {}); }                    // puCode -> array of submissions
function getPU(puCode){ return getResults()[puCode] || []; }
function hasSubmitted(puCode, email){ return getPU(puCode).some(r => r.repEmail === email); }
function allRecords(){ const out=[]; Object.values(getResults()).forEach(a => a.forEach(r => out.push(r))); return out; }
function saveResult(rec){
  const all = getResults();
  all[rec.puCode] = all[rec.puCode] || [];
  if (all[rec.puCode].some(r => r.repEmail === rec.repEmail))
    return { ok:false, msg:"You have already submitted for this polling unit. Each rep reports once." };
  if (all[rec.puCode].length >= REPS_PER_PU)
    return { ok:false, msg:"This polling unit already has all 3 reports. Contact the collation team if a correction is needed." };
  all[rec.puCode].push(rec); DB.write(K_RESULTS, all); return { ok:true };
}
function getUser(){ return DB.read(K_USER, null); }
function setUser(u){ DB.write(K_USER, u); }
function logout(){ localStorage.removeItem(K_USER); location.href = "login.html"; }
function getOfficial(){ return DB.read(K_OFFICIAL, {}); }
function saveOfficial(state, data){ const o = getOfficial(); o[state] = data; DB.write(K_OFFICIAL, o); }
function fmt(n){ return (n||0).toLocaleString("en-NG"); }

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

// ---- demo seed data ----
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function seedDemo(){
  if (localStorage.getItem(K_SEEDED)) return;
  const rnd = mulberry32(20270225);
  const pick = arr => arr[Math.floor(rnd()*arr.length)];
  const sampleStates = ["Lagos","Kano","Rivers","Kaduna","Oyo","FCT","Borno","Anambra","Edo","Plateau","Delta","Katsina","Ogun","Enugu"];
  const pus = ["Market Square","Primary School I","Town Hall","Health Centre","Secondary School","Community Field","Palace Gate","Market Square II","School Block A","Village Square"];
  const first = ["Adaeze","Emeka","Fatima","Ibrahim","Chidi","Ngozi","Abubakar","Tunde","Blessing","Musa","Kelechi","Aisha","Olumide","Hauwa","Ifeanyi"];
  const last = ["Okafor","Bello","Adeyemi","Eze","Mohammed","Obi","Danladi","Adekunle","Nwosu","Garba","Okonkwo","Yusuf","Balogun","Iheanacho","Sule"];
  const results = {};
  sampleStates.forEach((st, si) => {
    const n = 2 + Math.floor(rnd()*3);
    for (let i=0;i<n;i++){
      const puCode = st.slice(0,3).toUpperCase()+"-"+String(100+si)+"-"+String(10+i)+"-"+String(1+Math.floor(rnd()*9));
      results[puCode] = [];
      const accredited = 120 + Math.floor(rnd()*480);
      const votes = {}; let used = 0;
      PARTIES.forEach((p,pi)=>{ const share = pi<PARTIES.length-1 ? Math.floor(rnd()*(accredited*0.35)) : Math.max(0, accredited-used-2); votes[p]=share; used+=share; });
      if (used > accredited){ const f=accredited/used; PARTIES.forEach(p=>votes[p]=Math.floor(votes[p]*f)); }
      // REPS_PER_PU reps report; usually they agree, occasionally one rep diverges
      for (let r=0;r<REPS_PER_PU;r++){
        const rv = {}; PARTIES.forEach(p=>rv[p]=votes[p]);
        if (r===2 && rnd()<0.35){ const p=pick(PARTIES.slice(0,4)); rv[p]=Math.max(0,rv[p]+Math.floor(rnd()*40-20)); }
        results[puCode].push({
          puCode, state: st, lga: st+" LGA "+(1+Math.floor(rnd()*5)), ward: "Ward "+(1+Math.floor(rnd()*10)),
          puName: "PU "+puCode.split("-")[3]+" - "+pick(pus),
          accredited, validVotes: Object.values(rv).reduce((a,b)=>a+b,0), rejected: Math.floor(rnd()*8),
          votes: rv, imageDataUrl: null,
          submittedAt: new Date(2027,1,25,9+r+Math.floor(rnd()*6),Math.floor(rnd()*60)).toISOString(),
          repName: pick(first)+" "+pick(last), repEmail: "rep"+puCode.replace(/-/g,"")+r+"@demo.ng"
        });
      }
    }
  });
  DB.write(K_RESULTS, results);
  localStorage.setItem(K_SEEDED, "1");
}
// ---- collation based on CONSENSUS figures per PU ----
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
  const links = [["index.html","Home","home"],["results.html","Live Collation","results"],["compare.html","Compare with INEC","compare"],["dashboard.html","Rep Portal","dashboard"]];
  el.innerHTML = `<div class="topnav-inner">
    <a class="brand" href="index.html"><span class="dot"></span>NaijaPVT</a>
    <nav>${links.map(l=>`<a href="${l[0]}" class="${active===l[2]?"active":""}">${l[1]}</a>`).join("")}
    ${u ? `<a href="#" onclick="logout();return false;" style="color:#e8b93d">Logout (${u.name.split(" ")[0]})</a>` : `<a href="login.html" style="color:#e8b93d">Rep Login</a>`}
    </nav></div>`;
}
document.addEventListener("DOMContentLoaded", ()=>{ seedDemo(); });
