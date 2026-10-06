/* Ember Night — scroll-driven motion layer. Pure presentation; hooks into shared/app.js via afterRender. */
(function () {
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- illustrations (inline SVG, no external images) ----------
  const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    <linearGradient id="gOr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffa35c"/><stop offset=".55" stop-color="#ff6a1f"/><stop offset="1" stop-color="#c9380d"/></linearGradient>
    <linearGradient id="gSil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6ece5"/><stop offset=".5" stop-color="#b9a89d"/><stop offset="1" stop-color="#6e5f56"/></linearGradient>
    <linearGradient id="gShoe" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a2820"/><stop offset="1" stop-color="#1b1210"/></linearGradient>
  </defs></svg>`;

  const SHOE = `<svg viewBox="0 0 270 130" class="art" aria-label="Running shoe">
    <g class="speed" stroke="url(#gOr)" stroke-width="3.5" stroke-linecap="round" opacity=".55"><path d="M4 44h44M0 62h54M10 80h38"/></g>
    <path d="M56 100c0-8 8-10 18-10h168c16 0 22 8 20 16-1 6-6 8-12 8H70c-8 0-14-4-14-14Z" fill="#f4e8e0"/>
    <path d="M56 105h206" stroke="#d3c0b3" stroke-width="2"/>
    <rect x="150" y="96" width="62" height="8" rx="4" fill="url(#gOr)"/>
    <path d="M58 92l2-34c0-8 6-12 14-12h18c6 0 10-4 14-10 4-6 12-8 20-5l8 4c8 11 20 21 40 27 28 8 66 10 82 28Z" fill="url(#gShoe)" stroke="#ff7a2f" stroke-opacity=".35"/>
    <path d="M60 58c0-8 6-12 14-12h18" fill="none" stroke="#ff7a2f" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M92 86c34 2 80-4 122-16" fill="none" stroke="url(#gOr)" stroke-width="7" stroke-linecap="round"/>
    <g stroke="#f4e8e0" stroke-width="3.2" stroke-linecap="round"><path d="M112 42l12 10"/><path d="M125 48l12 10"/><path d="M138 54l12 9"/><path d="M152 60l12 8"/></g>
  </svg>`;

  const DUMBBELL = `<svg viewBox="0 0 260 130" class="art" aria-label="Dumbbell">
    <rect x="44" y="52" width="172" height="26" rx="8" fill="#2b1d17"/>
    <rect x="62" y="58" width="136" height="14" rx="7" fill="url(#gSil)"/>
    <rect x="34" y="40" width="20" height="50" rx="7" fill="#2b1d17" stroke="#ff7a2f" stroke-opacity=".55"/>
    <rect x="206" y="40" width="20" height="50" rx="7" fill="#2b1d17" stroke="#ff7a2f" stroke-opacity=".55"/>
    <rect x="56" y="24" width="24" height="82" rx="9" fill="url(#gOr)"/>
    <rect x="180" y="24" width="24" height="82" rx="9" fill="url(#gOr)"/>
    <path d="M63 32v66M187 32v66" stroke="#fff" stroke-opacity=".38" stroke-width="3" stroke-linecap="round"/>
    <path d="M70 32v66M194 32v66" stroke="#000" stroke-opacity=".18" stroke-width="2"/>
  </svg>`;

  // ---------- scrollytelling blocks ----------
  const trail = (n) => Array.from({ length: n }, () => "<i></i>").join("");

  const stepsStory = () => `
    <section class="story" data-kind="steps">
      <div class="story-sticky">
        <div class="story-top"><span class="tag">Steps · from your Watch</span><span class="chk">✓</span></div>
        <h3>Walk. It counts itself.</h3>
        <div class="stage"><div class="trail">${trail(14)}</div><div class="actor">${SHOE}</div></div>
        <div class="readout"><div><b data-num>0</b><span>steps today</span></div><div class="mini"><b data-pay>₹0</b><span>released</span></div></div>
        <div class="bar"><i data-bar></i></div>
        <p class="cap" data-cap></p>
      </div>
    </section>`;

  const gymStory = () => `
    <section class="story gym" data-kind="gym">
      <div class="story-sticky">
        <div class="story-top"><span class="tag">Gym · Watch workout</span><span class="chk">✓</span></div>
        <h3>Lift. The Watch is watching.</h3>
        <div class="stage"><div class="actor">${DUMBBELL}</div><div class="floor"></div></div>
        <div class="readout"><div><b data-num>0</b><span>minutes</span></div><div class="mini"><b data-hr>92</b><span>avg bpm</span></div></div>
        <div class="bar"><i data-bar></i></div>
        <p class="cap" data-cap></p>
      </div>
    </section>`;

  function wireStory(el, sheet) {
    const kind = el.dataset.kind, sticky = el.querySelector(".story-sticky"), actor = el.querySelector(".actor"),
      stage = el.querySelector(".stage"), num = el.querySelector("[data-num]"), bar = el.querySelector("[data-bar]"),
      cap = el.querySelector("[data-cap]"), dots = [...el.querySelectorAll(".trail i")];
    const pay = el.querySelector("[data-pay]"), hr = el.querySelector("[data-hr]");
    function update() {
      const travel = el.offsetHeight - sticky.offsetHeight;
      const top = el.getBoundingClientRect().top - sheet.getBoundingClientRect().top - 8;
      const p = clamp(-top / Math.max(1, travel));
      const done = p > 0.96;
      el.classList.toggle("done", done);
      bar.style.width = p * 100 + "%";
      if (kind === "steps") {
        const w = stage.clientWidth - actor.offsetWidth - 6, s = Math.sin(p * Math.PI * 30);
        actor.style.transform = `translate(${p * w}px, ${s * 3 - 2}px) rotate(${s * 2.2 - 1}deg)`;
        dots.forEach((d, i) => d.classList.toggle("on", i / dots.length < p));
        num.textContent = Math.round(p * 10000).toLocaleString("en-IN");
        pay.textContent = done ? "₹100" : "₹0";
        cap.textContent = p < 0.3 ? "Warm-up. Your Watch is counting quietly." : p < 0.96 ? "In the zone. Samples sync every hour." : "10,000 hit. ₹100 moves from escrow to your wallet.";
      } else {
        const lift = Math.abs(Math.sin(p * Math.PI * 7));
        actor.style.transform = `translateY(${26 - lift * 52}px) rotate(${(lift - 0.5) * 9}deg) scale(${1 + lift * 0.05})`;
        actor.style.filter = `drop-shadow(0 ${10 + lift * 8}px ${14 + lift * 26}px rgba(255,122,47,${0.25 + lift * 0.4}))`;
        el.style.setProperty("--lift", lift.toFixed(3));
        const mins = Math.round(p * 35);
        num.textContent = mins;
        hr.textContent = Math.round(92 + p * 58);
        cap.textContent = p < 0.3 ? "Strength training detected." : mins < 30 ? "Heart rate is up. Keep going to 30 min." : "30+ min with heart rate. Workout verified.";
      }
    }
    sheet.addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update);
    requestAnimationFrame(update);
  }

  // ---------- generic effects ----------
  function countUp(el) {
    const m = el.textContent.match(/^(\D*)([\d,]+)(.*)$/); if (!m || reduce) return;
    const target = parseInt(m[2].replace(/,/g, ""), 10), t0 = performance.now();
    (function tick(t) {
      const k = clamp((t - t0) / 900), e = 1 - Math.pow(1 - k, 3);
      el.textContent = m[1] + Math.round(target * e).toLocaleString("en-IN") + m[3];
      if (k < 1) requestAnimationFrame(tick);
    })(t0);
  }
  function reveal(sheet) {
    const items = [...sheet.querySelectorAll(".card, .sec > .label, .note, .btn, .stat2")];
    items.forEach((el, i) => { el.classList.add("rv"); el.style.transitionDelay = Math.min(i, 6) * 60 + "ms"; });
    if (!("IntersectionObserver" in window)) return items.forEach((e) => e.classList.add("in"));
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { root: sheet, threshold: 0.12 });
    items.forEach((e) => io.observe(e));
  }
  function ringDraw(root) {
    root.querySelectorAll(".ring circle:nth-child(2)").forEach((c) => {
      const to = c.getAttribute("stroke-dasharray"); c.style.strokeDasharray = "0 999";
      requestAnimationFrame(() => requestAnimationFrame(() => { c.style.strokeDasharray = to; }));
    });
  }

  window.GRINDLY_THEME = {
    name: "B · Ember Night",
    blurb: "Charcoal, orange glow, scroll-driven shoe and dumbbell scenes.",
    afterRender(route, root) {
      const screen = root.querySelector(".screen"), sheet = root.querySelector(".sheet");
      screen.insertAdjacentHTML("afterbegin", DEFS);
      root.querySelector(".hero").insertAdjacentHTML("afterbegin", '<span class="orb o1"></span><span class="orb o2"></span>');
      root.querySelectorAll(".dots i").forEach((d, i) => d.style.setProperty("--i", i % 40));

      if (route === "home" || route === "daily") {
        const html = route === "home" ? stepsStory() + gymStory() : stepsStory();
        const anchor = route === "home" ? sheet.querySelector(".sec") : sheet.lastElementChild;
        anchor.insertAdjacentHTML("afterend", '<div class="sec"><div class="label">Scroll to see how a day counts</div></div>' + html);
        sheet.querySelectorAll(".story").forEach((s) => wireStory(s, sheet));
      }
      if (route === "create") {
        const prev = `<div class="goalprev"><div class="gp-art">${SHOE}</div><div><b>10,000 steps a day</b><span>Your Watch counts. You just walk.</span></div></div>`;
        sheet.insertAdjacentHTML("afterbegin", prev);
        sheet.insertAdjacentHTML("afterbegin", ""); // keep handle ::before first
        const gp = sheet.querySelector(".goalprev"), art = gp.querySelector(".gp-art");
        root.querySelector("#g-goal").addEventListener("click", (e) => {
          const b = e.target.closest("button"); if (!b) return;
          const gym = b.dataset.v === "gym";
          art.innerHTML = gym ? DUMBBELL : SHOE; gp.classList.toggle("gym", gym);
          gp.querySelector("b").textContent = gym ? "Gym workout, 30+ min" : "10,000 steps a day";
          gp.querySelector("span").textContent = gym ? "Strength, HIIT and more. Heart rate required." : "Your Watch counts. You just walk.";
        });
        sheet.addEventListener("scroll", () => { art.style.transform = `translateY(${sheet.scrollTop * 0.25}px) rotate(${sheet.scrollTop * -0.04}deg)`; }, { passive: true });
      }
      sheet.addEventListener("scroll", () => screen.style.setProperty("--sp", clamp(sheet.scrollTop / 160).toFixed(3)), { passive: true });
      reveal(sheet); ringDraw(root);
      root.querySelectorAll(".bigbal, .ring .mid b").forEach(countUp);
    },
  };
})();
