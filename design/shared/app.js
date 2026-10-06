/* =====================================================================
   FRONTEND · shared/app.js   (all three looks use this file)
   WHAT IT DOES: draws the 6 screens and handles taps. Uses made-up sample data.
   WHAT IT IS NOT: no server, no real money, no real Apple Watch data.
   LATER: the real version will be Next.js; money and day-verification will
   live in the BACKEND, never in the browser.
   Sections below: MONEY FORMAT · ICONS · SAMPLE DATA · SCREENS · NAV · CREATE-GOAL CALCULATOR · SHELL
   ===================================================================== */
(function () {
  const $ = (s, r = document) => r.querySelector(s);

  // ---- [MONEY FORMAT] shows paise (whole numbers) as rupees. Never uses decimals for maths ----
  const inr = (paise) => {
    const sign = paise < 0 ? "-" : "";
    const abs = Math.abs(paise);
    const r = Math.floor(abs / 100), p = abs % 100;
    return sign + "₹" + r.toLocaleString("en-IN") + (p ? "." + String(p).padStart(2, "0") : "");
  };

  // ---- [ICONS] small drawings used on buttons and cards ----
  const I = {
    flame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c.5 3-1.5 4.5-3 6.5C7.7 11.2 7 12.7 7 14.5a5 5 0 0 0 10 0c0-1.6-.6-2.8-1.5-4-.4 1-1 1.6-1.8 2 .3-3-.7-6.5-1.7-9.5Z"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    watch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6.5" y="6.5" width="11" height="11" rx="3.5"/><path d="M9 6.5 9.6 3h4.8l.6 3.5M9 17.5l.6 3.5h4.8l.6-3.5M12 10v2.2l1.4 1"/></svg>',
    wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3"/><rect x="4" y="8" width="16" height="11" rx="3"/><circle cx="16" cy="13.5" r="1.1"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><path d="M16 5.6a3 3 0 0 1 0 5.8M17.5 14.3c1.7.6 2.7 2 3 4.2"/></svg>',
    steps: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4c2 0 3 1.6 3 3.6S10 11 8.5 11 5 9.6 5 7.4 6 4 8 4ZM16 11c2 0 3 1.6 3 3.6S18 18 16.5 18 13 16.6 13 14.4 14 11 16 11Z"/><path d="M8 14v1.5M16 21.5V21"/></svg>',
    dumbbell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v13M6.5 11.5 12 17l5.5-5.5M5 20h14"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V7M6.5 12.5 12 7l5.5 5.5M5 4h14"/></svg>',
    pool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9c3-2 6 2 9 0s6-2 9 0M3 14c3-2 6 2 9 0s6-2 9 0M3 19c3-2 6 2 9 0s6-2 9 0"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  };

  // ---- [SAMPLE DATA] fake contracts. The forfeit rule here copies PLAN.md §3.4; the real one will live in packages/domain ----
  const mustForfeit = (R, v, W, d) => Math.max(0, (R - v) - (W - d));
  const mk = (W, d, v) => { // dot states: first d days, v verified, rest rest-days, then future
    const missed = d - v, a = [];
    let vv = v, mm = missed;
    for (let i = 0; i < d; i++) {
      if (mm > 0 && i % 7 === 3) { a.push("r"); mm--; } else if (vv > 0) { a.push("v"); vv--; } else { a.push("r"); mm--; }
    }
    while (a.length < W) a.push("");
    return a;
  };
  const C = {
    steps: { id: "steps", name: "10,000 steps a day", icon: "steps", W: 30, d: 22, v: 19, u: 10000 },
    gym: { id: "gym", name: "Gym workout, 30+ min", icon: "dumbbell", W: 20, d: 9, v: 7, u: 10000 },
  };
  Object.values(C).forEach((c) => {
    c.slack = Math.floor(0.1 * c.W); c.R = c.W - c.slack; c.S = c.u * c.R;
    c.forfeited = mustForfeit(c.R, c.v, c.W, c.d); c.released = c.v * c.u;
    c.remaining = c.S - c.released - c.forfeited * c.u;
    c.cells = mk(c.W, c.d, c.v);
  });
  const dots = (c, big) => {
    const cols = c.W <= 20 ? 10 : 10;
    return `<div class="dots${big ? " big" : ""}" style="grid-template-columns:repeat(${cols},auto)">${c.cells.map((s) => `<i class="${s}"></i>`).join("")}</div>`;
  };
  const legend = `<div class="legend"><span><i style="background:var(--dot-on)"></i>Verified</span><span><i style="background:var(--dot-rest)"></i>Rest day</span><span><i style="background:var(--dot-off)"></i>Upcoming</span></div>`;

  // ---- [SCREENS] one function per screen: home, create, daily, norisk, wallet, watch ----
  const hero = (hello, head, extra = "") => `
    <div class="hero">
      <div class="top"><div class="avatar">A</div><div class="spacer"></div>
        <div class="pill">${I.flame}16</div><div class="roundbtn">${I.bell}</div></div>
      <div class="hello">${hello}</div><div class="headline">${head}</div>${extra}
    </div>`;
  const contractCard = (c) => `
    <div class="card link" data-go="daily">
      <div class="row"><span class="tag">${I[c.icon]}${c.W - c.d} days left</span><span class="check ${c.v ? "on" : ""}">${I.check}</span></div>
      <h3>${c.name}</h3>
      <div class="cardgrid"><div class="meta"><b>${c.v}/${c.R}</b> days verified<br>${inr(c.S)} staked · ${inr(c.u)}/day</div>${dots(c)}</div>
    </div>`;

  const S = {};

  S.home = () => hero("Good morning, Ayush", "Keep the streak alive,<br>show up for your stake.") + `
    <div class="sheet">
      <div class="row" style="display:flex;justify-content:space-between;align-items:center"><h2>Your contracts</h2><span class="badge ok">Watch linked</span></div>
      <div class="sub">Verified automatically from your Apple Watch.</div>
      <div class="sec">${contractCard(C.steps)}${contractCard(C.gym)}
        <div class="card link" data-go="norisk"><div class="row"><span class="tag">${I.users}No Risk · with Riya</span><span class="badge">Waiting for Riya</span></div>
        <h3>Gym, 30 days, ₹1,620 each</h3><div class="meta">Miss a day and your unit goes to Riya's wallet.</div></div>
      </div>
      <button class="btn" data-go="create">Start a new contract</button>
    </div>`;

  S.create = () => hero("New contract", "Pick a goal.<br>Put something on it.") + `
    <div class="sheet" id="create">
      <div class="sec" style="margin-top:4px"><div class="label">Goal</div>
        <div class="seg" id="g-goal"><button class="on" data-v="steps">${I.steps.replace("<svg", '<svg width="20" height="20"')}<small>10k steps / day</small></button><button data-v="gym">${I.dumbbell.replace("<svg", '<svg width="20" height="20"')}<small>Gym 30+ min</small></button></div></div>
      <div class="sec"><div class="label">Mode</div>
        <div class="seg" id="g-mode"><button class="on" data-v="stake">Stake<small>Forfeits join the pool</small></button><button data-v="friend">No Risk<small>Forfeits go to a friend</small></button></div></div>
      <div class="sec"><div class="label">Window (days)</div>
        <div class="seg wrap" id="g-w"><button data-v="7">7</button><button data-v="14">14</button><button data-v="20">20</button><button class="on" data-v="30">30</button></div></div>
      <div class="sec"><div class="label">Value of each verified day</div>
        <div class="seg wrap" id="g-u"><button data-v="5000">₹50</button><button class="on" data-v="10000">₹100</button><button data-v="20000">₹200</button><button data-v="50000">₹500</button></div></div>
      <div class="card sec" style="margin-top:18px">
        <div class="kv"><span>Rest days (10%)</span><b id="o-slack"></b></div>
        <div class="kv"><span>Required days</span><b id="o-R"></b></div>
        <div class="kv"><span>Total stake</span><b id="o-S"></b></div>
        <div class="kv"><span>Held in escrow</span><b>until each day is verified</b></div>
      </div>
      <div class="note" id="o-note"></div>
      <div style="height:12px"></div><button class="btn" id="o-go">Continue to test payment</button>
    </div>`;

  S.daily = () => {
    const c = C.steps, p = 7412 / 10000;
    return hero("Tuesday · day 22 of 30", "Today needs<br>2,588 more steps.") + `
    <div class="sheet">
      <div class="card"><div class="week">
        ${[["Sun", "v"], ["Mon", "v"], ["Tue", "today"], ["Wed", ""], ["Thu", ""], ["Fri", ""], ["Sat", ""]].map(([d, s], i) =>
          `<div class="d">${d}<div class="c ${s}">${s === "v" ? I.flame : 14 + i}</div></div>`).join("")}
      </div></div>
      <div class="card">
        <div class="ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="var(--dot-off)" stroke-width="11"/>
          <circle cx="60" cy="60" r="52" fill="none" stroke="var(--accent)" stroke-width="11" stroke-linecap="round" stroke-dasharray="${(2 * Math.PI * 52 * p).toFixed(1)} 999"/></svg>
          <div class="mid"><b>7,412</b><span>of 10,000 steps</span></div></div>
        <div class="meta" style="text-align:center">Counted from <b>Apple Watch Series 9</b> · synced 12 min ago</div>
      </div>
      <div class="stat2"><div><div class="n">${c.R}<small>days</small></div><div class="l">Required</div></div><div><div class="n">${c.v}<small>days</small></div><div class="l">Verified</div></div></div>
      <div class="card" style="margin-top:12px">
        <div class="row"><b>${c.name}</b><span class="badge ok">On track</span></div>
        <div class="meta" style="margin:6px 0 12px">${c.slack} rest days allowed · 3 used · 0 forfeited</div>
        ${dots(c, true)}${legend}
        <div class="note">Today settles at 06:00 tomorrow, so a late overnight sync still counts. Verified days pay ${inr(c.u)} from escrow to your wallet.</div>
      </div>
    </div>`;
  };

  S.norisk = () => hero("No Risk mode", "Same stakes.<br>Your friend gets the misses.") + `
    <div class="sheet">
      <div class="card"><div class="friend"><div class="avatar">R</div><div style="flex:1"><b>Riya Sharma</b><div class="meta">Invited 3 h ago · expires in 45 h</div></div><span class="badge">Pending</span></div>
        <div class="flow"><div class="node">You<br><span class="meta">₹1,620 stake</span></div><div class="arrow">⇄</div><div class="node">Riya<br><span class="meta">₹1,620 stake</span></div></div></div>
      <div class="card"><b>Contract terms</b>
        <div class="kv"><span>Goal</span><b>Gym, 30+ min</b></div><div class="kv"><span>Window / required</span><b>30 days / 27 days</b></div>
        <div class="kv"><span>Per verified day</span><b>${inr(162000 / 27)}</b></div>
        <div class="kv"><span>On a forfeit</span><b>Goes to friend's wallet</b></div>
        <div class="kv"><span>Pool bonus</span><b>None in this mode</b></div></div>
      <div class="card"><b>Status</b>
        <div class="led"><div class="ic">${I.check}</div><div class="t">You accepted<small>Stake funded in test mode</small></div></div>
        <div class="led"><div class="ic">${I.lock}</div><div class="t">Waiting for Riya<small>Both must accept before activation. Full refund if it expires.</small></div></div></div>
      <div class="note">No cancelling once active. Watch data is the only judge, so there is nothing to dispute.</div>
      <div style="height:12px"></div><button class="btn ghost">Resend invite</button>
    </div>`;

  S.wallet = () => {
    const bal = C.steps.released + C.gym.released, esc = C.steps.remaining + C.gym.remaining;
    const L = (ic, t, s, a) => `<div class="led"><div class="ic">${I[ic]}</div><div class="t">${t}<small>${s}</small></div><div class="a ${a >= 0 ? "pos" : "neg"}">${a >= 0 ? "+" : ""}${inr(a)}</div></div>`;
    return hero("Wallet", "Money you've<br>earned back.") + `
    <div class="sheet">
      <div class="card"><div class="meta">Available balance</div><div class="bigbal">${inr(bal)}</div>
        <div class="kv" style="margin-top:8px"><span>In escrow</span><b>${inr(esc)}</b></div>
        <div class="kv"><span>Pool bonus (est.)</span><b>${inr(34000)}</b></div>
        <div class="kv"><span>Simulated interest, 6% APY</span><b>${inr(1260)}</b></div>
        <div style="height:10px"></div><button class="btn">Withdraw (simulated)</button></div>
      <div class="sec" style="margin-top:6px"><div class="label">Ledger</div><div class="card" style="padding:4px 16px">
        ${L("down", "Verified day 22", "10k steps · escrow → wallet", 10000)}
        ${L("down", "Verified day 8", "Gym · escrow → wallet", 10000)}
        ${L("up", "Funded contract", "Test payment · gateway → escrow", -180000)}
        ${L("pool", "Pool bonus", "Closes 31 Oct · completers only", 34000)}
      </div><div class="meta" style="font-size:12px;margin-top:4px">Every entry is double-entry and sums to zero. Entries are never edited.</div></div>
    </div>`;
  };

  S.watch = () => hero("Apple Watch", "Your Watch is the<br>only referee.") + `
    <div class="sheet">
      <div class="card"><div class="row"><div style="display:flex;gap:12px;align-items:center"><div class="led" style="padding:0"><div class="ic" style="width:46px;height:46px">${I.watch}</div></div><div><b>Apple Watch Series 9</b><div class="meta">Watch7,3 · last sync 12 min ago</div></div></div><span class="badge ok">Linked</span></div></div>
      <div class="sec"><div class="label">Link another device</div>
        <div class="card"><div style="font-weight:700">1. Open Grindly Sync on your iPhone<br>2. Enter this code</div>
          <div class="pair"><b>4</b><b>8</b><b>2</b><b>9</b><b>1</b><b>7</b></div>
          <div class="meta" style="text-align:center">Expires in 4:41 · single use</div></div></div>
      <div class="card"><b>What counts</b>
        <div class="kv"><span>Steps</span><b>≥ 10,000 from Watch</b></div><div class="kv"><span>Workout</span><b>≥ 30 min, heart rate</b></div>
        <div class="kv"><span>Typed-in / iPhone data</span><b>Ignored</b></div></div>
      <div class="note">Contracts need a sync within the last 24 h. You can revoke a device any time.</div>
    </div>`;

  // [NAV] the 5 round buttons at the bottom
  const NAV = [["home", "flame"], ["daily", "steps"], ["create", "plus"], ["wallet", "wallet"], ["watch", "watch"]];
  const LABEL = { home: "Home", create: "Create goal", daily: "Daily status", norisk: "No Risk", wallet: "Wallet & ledger", watch: "Link Watch" };

  // ---- [CREATE-GOAL CALCULATOR] rest days = 10% of window; required days = window - rest days; stake = value per day x required days ----
  function wireCreate(root) {
    const st = { goal: "steps", mode: "stake", w: 30, u: 10000 };
    const upd = () => {
      const slack = Math.floor(0.1 * st.w), R = st.w - slack, Stot = st.u * R;
      $("#o-slack", root).textContent = slack + (slack === 0 ? " (every miss costs " + inr(st.u) + ")" : " days");
      $("#o-R", root).textContent = R + " of " + st.w + " days";
      $("#o-S", root).textContent = inr(Stot);
      $("#o-note", root).textContent = st.mode === "stake"
        ? `Miss more than ${slack} days and ${inr(st.u)} per extra miss joins the monthly pool. Finish clean and you share it, plus simulated interest.`
        : `Miss more than ${slack} days and ${inr(st.u)} per extra miss goes straight to your friend. Both must accept first.`;
      $("#o-go", root).textContent = st.mode === "stake" ? "Continue to test payment" : "Invite a friend";
    };
    [["g-goal", "goal"], ["g-mode", "mode"], ["g-w", "w"], ["g-u", "u"]].forEach(([id, key]) => {
      $("#" + id, root).addEventListener("click", (e) => {
        const b = e.target.closest("button"); if (!b) return;
        [...b.parentNode.children].forEach((x) => x.classList.toggle("on", x === b));
        st[key] = key === "w" || key === "u" ? Number(b.dataset.v) : b.dataset.v; upd();
      });
    });
    $("#o-go", root).addEventListener("click", () => go(st.mode === "friend" ? "norisk" : "home"));
    upd();
  }

  // ---- [SHELL + NAV] phone frame, left menu, bottom nav bar, and switching screens by the # in the URL ----
  const theme = window.GRINDLY_THEME || { name: "Direction", blurb: "" };
  function render(route) {
    if (!S[route]) route = "home";
    const navOn = route === "norisk" ? "home" : route;
    $("#app").innerHTML = `
      <div class="stage">
        <div class="switcher"><h1>Grindly</h1><p>${theme.name}. ${theme.blurb}</p>
          ${Object.keys(LABEL).map((k) => `<button data-go="${k}" class="${k === route ? "on" : ""}">${LABEL[k]}</button>`).join("")}
          <a class="back" href="../index.html">← All directions</a></div>
        <div class="phone"><div class="viewport"><div class="screen fade">
          <div class="statusbar"><span>9:41</span><span>●●● ▮</span></div>
          <div class="testbanner"><i></i>TEST MODE · no real money</div>
          ${S[route]()}
          <div class="nav">${NAV.map(([k, ic]) => `<button data-go="${k}" class="${k === navOn ? "on" : ""}" aria-label="${LABEL[k]}">${I[ic]}</button>`).join("")}</div>
        </div></div></div>
      </div>`;
    if (route === "create") wireCreate($(".phone"));
    if (theme.afterRender) theme.afterRender(route, $(".phone"));
  }
  function go(r) { if (location.hash.slice(1) === r) render(r); else location.hash = r; }
  document.addEventListener("click", (e) => { const t = e.target.closest("[data-go]"); if (t) go(t.dataset.go); });
  window.addEventListener("hashchange", () => render(location.hash.slice(1)));
  render(location.hash.slice(1) || "home");
})();
