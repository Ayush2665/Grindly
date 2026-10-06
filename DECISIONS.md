# DECISIONS

## 2026-10-06 · Phase 1
1. **Reference image vs "3 distinct directions".** The user asked to use the reference UI; CLAUDE.md asks for 3 directions. All three keep the reference's DNA (flame streaks, dot-matrix days, rounded cards, pill nav) and differ in surface and mood: A faithful orange, B dark, C flat cream. Trade-off: less variety than three unrelated styles, but matches the stated taste.
2. **Nested git repo.** `~/Desktop/Grindly` sat inside the home-directory repo, so commits would have gone there. Ran `git init` in Grindly so milestones are committed in their own repo.
3. **Create-goal picks per-day value, not total stake.** PLAN.md §3.1 requires S divisible by R. Choosing u (₹50/100/200/500) and deriving S = u × R guarantees it. Trade-off: users think in "how much am I risking" terms, so the UI shows the total prominently.
4. **No Risk example stake ₹1,620** (R=27, u=₹60) so the sample data respects the divisibility rule.
5. **Static vanilla HTML/CSS/JS, Google Fonts only** (Plus Jakarta Sans). No build step; real UI is built in Next.js in a later phase.
6. **Phone frame on desktop, full-bleed under 760px**, since the product is opened on a laptop first and on a phone later.
7. **Direction B chosen; motion lives in `design/b-night/fx.js`**, hooked through `theme.afterRender` so A and C are untouched. Illustrations are hand-drawn inline SVG (no image files, no libraries). Scroll scenes use `position: sticky` inside the sheet and a scroll listener, so they work without GSAP. Trade-off: hand-drawn art is simpler than photo or 3D assets; swap later if wanted.
8. **Reduced motion respected** via `prefers-reduced-motion`.
