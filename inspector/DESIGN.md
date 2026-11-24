# SEPBox Inspector — Design System V2 (Stripe Workbench / Vercel Logs Architecture)

Goal: Indistinguishable from a senior-designed developer instrument. Zero dead voids, strict visual hierarchy (Primary Stream leads; Control Bay supports subtly), crisp sans-vs-mono typography separation, and tactile affordances on every interactive control.

## 1. Surface Elevation & Color Hierarchy (3 Distinct Layers)
- Layer 0 (Deep Chrome / Recessed Tracks / Top Bar): `#09090B`
- Layer 1 (Secondary Sidebars — Control Bay & Inspector Pane): `#0D0D10`
- Layer 2 (Primary Focus Stage — Center Live Traffic Stream): `#111115`
- Layer 3 (Interactive Controls / Elevated Cards / Active Segments): `#18181E`
- Layer 4 (Hover / Selected Row): `#202028`
- Hairline Dividers: `#1E1E24` (structural panes), `#292932` (interactive control borders), `#3A3A47` (hover/focus border)
- Tactile Micro-Highlight (Key Craft Detail): Apply subtle top specular highlight `shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]` on elevated buttons, active segmented pills, and primary cards so controls feel physical rather than flat.
- Typography Colors:
  - Primary: `#F2F2EE`
  - Secondary: `#A0A0AD`
  - Muted: `#646472`
- Semantic Accents (STRICT RESTRAINT):
  - Connected / 2xx: `#34D399` (6px dot or text tint only)
  - Chaos Armed / 4xx: `#F59E0B` (NEVER show orange/amber text on presets when Chaos is disabled/standby!)
  - Error / 5xx / Offline: `#F87171`
- FORBIDDEN: Any `slate-*`, `cyan-*`, `sky-*`, `purple-*`, `violet-*`, `indigo-*` classes, native `<select>`, unstyled checkboxes, or loud full-width bright white CTA bars in secondary panels.

## 2. Typography Separation (Crucial)
- **UI Sans (`font-sans`)**: ALL section titles, labels, helper copy, tab names, button text (`Apply Rules`, `Run Probe Suite`, `Copy cURL`), empty-state headings.
- **Technical Mono (`font-mono tabular-nums`)**: ONLY routes (`/sep24/info`), HTTP methods (`GET`, `POST`), status codes (`200`, `503`), timestamps (`12:34:02`), latencies (`6.2ms`), counters, Stellar `G...` keys, and response payloads.

## 3. Spatial Layout (Full Viewport, Zero Dead Voids)
1. **Top Command Bar (`h-12`, `bg-[#09090B]`, `border-b border-[#1E1E24]`):**
   - 2px `#F59E0B` top edge accent ONLY when Chaos is armed.
   - Left: Crisp geometric SVG mark + `SEPBox` (sans semibold) + subtle divider + `Inspector` + live status pill (`ONLINE` with 6px green dot) + compact network badge (`Testnet`).
   - Right: Copyable Anchor Signer key (`G...` with copy icon + check state) + Global Chaos indicator pill (`Chaos Standby` neutral vs `Chaos Armed` amber).
2. **Full-Width Telemetry Ribbon (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`, `bg-[#0B0B0E]`, `border-b border-[#1E1E24]`, `divide-x divide-[#1E1E24]`):**
   - Must span 100% of viewport width evenly (NO clustering on the left).
   - Each cell: clean sans uppercase muted label (`10px`, `tracking-[0.06em]`) on top, crisp `18px` `font-mono tabular-nums` number below, with subtle inline sub-caption (`registered`, `firm`, `tracked`, `active`, `dispatched`, plus a 2px fill bar for `buffer x/200`).
3. **Main 3-Pane Master-Detail Workspace (`grid-cols-1 lg:grid-cols-[336px_minmax(0,1fr)_360px] xl:grid-cols-[344px_minmax(0,1fr)_400px]`, `min-h-[calc(100vh-104px)]`, `divide-y lg:divide-y-0 lg:divide-x divide-[#1E1E24]`):**
   - **Pane 1 — Left Control Bay (`bg-[#0D0D10]`, Secondary Weight):**
     - Segmented top tab bar (`Chaos` | `Webhooks`) inside a recessed track.
     - **Chaos Tab**:
       - Master `Fault Injection` switch card (neutral when standby; subtle amber border tint ONLY when armed).
       - 3 compact Preset chips (`503 Outage`, `1200ms Delay`, `Corrupt JSON`) — neutral zinc at rest, subtle hover elevation + crisp left icon; NEVER amber unless actively matching current armed config.
       - **Recessed Track Segmented Controls** (`bg-[#08080A] p-1 rounded-md border border-[#1E1E24]`) for Target Prefix (`/sep`, `/sep24`, `/sep38`, `/sep12`, `/auth`) and HTTP Status (`429`, `500`, `502`, `503`, `504`). Active segment gets `bg-[#1E1E26] border border-[#32323E] text-[#F2F2EE] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]`.
       - Sleek custom sliders for Latency and Error Rate with live `tabular-nums` badges.
       - Compact `Truncate / Corrupt JSON` switch row + Error Message input.
       - **Restrained Action Bar**: `Apply Rules` is a subtle elevated zinc button (`bg-[#1C1C22] border border-[#2E2E38]`) when clean, and shifts to crisp bone-white (`bg-[#F2F2EE] text-[#09090B]`) ONLY when the form has unsaved (`dirty`) changes, alongside a quiet `Reset` button.
       - Directly below (NO huge empty vertical gap): compact 3-column inline telemetry box (`Inspected`, `Errors`, `Delays`).
     - **Webhooks Tab**: Clean URL input + subtle subscribe button, one-time secret reveal with copy icon, hairline subscriptions list, and deliveries list with Replay trigger.
   - **Pane 2 — Center Live Traffic Stream (`bg-[#111115]`, Primary Focus Stage):**
     - Header bar: `Live Traffic` title (sans semibold), clickable **Pause / Live** polling toggle pill with dot, compact filter tabs (`All`, `/sep24`, `/sep38`, `/sep12`, `/auth`), search input (`/` shortcut), `Run Suite` primary action button (with play icon), and `Clear` icon button.
     - Compact Quick Probe Action Strip: Tactile buttons with inline Play icon + `GET` badge + route (`/sep24/info`, `/sep38/info`, `stellar.toml`, `/health`) + hover border lift so they unmistakably afford clicking.
     - **Dense Scannable Table**: Compact widths (`TIME`, `METHOD`, `ENDPOINT` flex-grow, `STATUS`, `LATENCY` with mini inline latency bar, `FLAG`). Clicking any row selects it (`bg-[#1C1C24]` with a crisp `2px` left accent bar).
     - **Actionable Empty State (When 0 Events)**: Never leave a giant empty black box! Render a centered, refined **Protocol Quick-Start Card** (`max-w-lg`) with subtle grid framing explaining the engine is listening on `localhost:8000`, featuring:
       - A crisp primary button: **`Run Probe Suite (4 Requests)`** (fires `/.well-known/stellar.toml`, `/health`, `/sep24/info`, `/sep38/info` sequentially so the table & inspector instantly come alive).
       - 3 clickable individual scenario rows with play icons (`Inspect SEP-1 Discovery`, `Check SEP-24 Capabilities`, `Fetch SEP-38 FX Price`).
   - **Pane 3 — Right Docked Inspector Pane (`bg-[#0D0D10]`, Always Populated):**
     - **When a request row IS selected:**
       - Header with `METHOD` + `PATH` + close (`×` / `Esc`) button.
       - Summary grid: Status badge, Latency (`ms`) + visual proportion bar, Timestamp, Chaos Injection status (`Clean` vs `Injected`), Content-Type.
       - Formatted **Response Payload** viewer (pretty-prints JSON automatically if valid JSON, or clean raw monospace for TOML/corrupt chaos JSON) + subtle note if the event came from an external client without captured body.
       - Footer action bar with **`Copy as cURL`** (with copy-check micro-feedback) and **`Replay Request`** (re-fires GET probes directly from the inspector).
     - **When NO request row is selected (Default State — Zero Dead Space):**
       - Displays **`Anchor Directory`** — clean read-only specification of the running local anchor:
         - Anchor Signing Key (full truncated view + Copy), Home Domain, Network Passphrase.
         - Interactive list of live SEP endpoints (`SEP-1 Discovery`, `SEP-10 Web Auth`, `SEP-12 KYC`, `SEP-24 Interactive`, `SEP-38 FX Quotes`) showing exact URLs with 1-click **Copy URL** and (for GET routes) **Fire Probe** icon buttons.
         - Compact keyboard shortcuts legend (`/` Filter · `P` Pause · `Esc` Deselect).