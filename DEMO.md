# TrustLock — 3-Minute Demo Script (target 2:40)

**Product:** TrustLock — escrow-like milestone protection powered by PayPal authorization.
**One-line pitch:** *"Client funds are held in a PayPal authorization. An AI agent inspects the delivered work against the contract's acceptance criteria. A deterministic policy engine releases the money — or refuses to."*

**What makes it win:** PayPal is the money rail (authorize → hold → capture, not a checkout button); the AI verifies evidence criterion-by-criterion; a deterministic policy engine — not the AI — decides whether money moves; and the system is *honest*: when evidence can't establish a criterion, it says INCONCLUSIVE and pays nothing.

## Setup before recording (2 minutes)

1. `npm run build && npm start` (or use the hosted Vercel URL).
2. Sandbox buyer account ready (developer.paypal.com → Accounts → Sandbox → personal account).
3. Two browser windows: the app + the PayPal sandbox approval tab.
4. Use the existing demo data OR create a fresh milestone live (the script below does the **live run** — most convincing).

## The script (2:40)

### 0:00–0:12 — The problem (voiceover over the dashboard)
> "Freelancers wait 45 days and still get stiffed. Clients pay upfront and pray. There's no escrow on the world's biggest wallet."

Show: the TrustLock dashboard (Overview) with the flow line: *Client funds → PayPal authorization → freelancer delivery → AI verification → deterministic policy → PayPal release.*

### 0:12–0:25 — Create the milestone (live)
Click **New milestone**:
- Title: `Website Delivery`
- Amount: `100.00 USD`
- Criteria: *deliverable accessible · homepage deployed · branding present · required content · contact form*

> "The client defines the contract — including the acceptance criteria the AI will verify."

### 0:25–0:55 — Fund the hold (live, sandbox)
Click **Fund** → PayPal button → sandbox buyer logs in → **Approve $100.00** → back in TrustLock: **AUTHORIZED**.

> "The money is authorized — held by PayPal, not captured. The freelancer can see the funds are real."

Show the **PayPal payment panel**: authorization ID, hold expiry (Nov 6, 2026), "held, not captured."

### 0:55–1:10 — Submit evidence (live)
As the freelancer: **Submit delivery evidence** → deliverable URL (`/demo/deliverable` on the hosted URL) → notes.

> "The deliverable is a real, inspectable page — the agent will fetch it server-side."

### 1:10–1:50 — The AI verification (the agentic moment)
The **live agent activity** panel appears (real events, polled from the server):
`Evidence received → Deliverable fetched & inspected → Criterion evaluated ×5 → AI verdict created → Policy evaluated → Release approved → PayPal capture requested → Capture pending settlement`

Then the **AI Verification panel**:
- Verdict: **RELEASE** · Confidence **95%** · 5 / 5 criteria passed · Recommended release $100.00
- Each criterion card: PASS · 90–100% · evidence · rationale

> "The agent doesn't say 'looks good'. It checks every contractual criterion against the fetched evidence — and shows its work."

### 1:50–2:15 — Policy → PayPal release (live)
Policy decision: **AUTO_RELEASE** (confidence 95% ≥ 90%, $100 ≤ $500 cap).
The capture executes: capture ID appears, status **PENDING**.

> "A deterministic policy engine — not the AI — decides money may move. And notice: PayPal reports the capture as PENDING, so TrustLock shows CAPTURE_PENDING. Not PAID."

Show the **lifecycle stepper** at Release, the payment panel with capture status PENDING.

### 2:15–2:35 — The honesty beat (the differentiator)
Open the second milestone: **Landing page for the bakery client** (AUTHORIZED, $100 held).

> "Same system, different evidence. Watch what happens when the evidence *can't* establish a criterion."

Show the AI panel: `responsive — INCONCLUSIVE · 50% — "Actual rendering on a mobile viewport cannot be verified from the available evidence."` → verdict **REQUEST CHANGES** · recommended release **$0.00**.

> "The agent refuses to rubber-stamp. INCONCLUSIVE is not PASS — and no money moves. The client's $100 stays held."

### 2:35–2:45 — Insights + close
Open **Insights** (AG Studio): funds held / captured / pending, AI verdict donut, milestones grid. Optionally switch to **Edit** and ask the AI assistant: *"Show funds by payment state."*

> "TrustLock: the agent checks the work, the policy decides, PayPal moves the money — and every decision is audited. Escrow-like milestone protection, powered by PayPal authorization."

End card: logo + hosted URL + "Built on the PayPal Sandbox — no real money moves."

## Fallback (if the live run is not possible)

Narrate the **existing completed run** (the "Website Delivery" milestone in CAPTURE_PENDING with its full audit trail) + the honesty milestone. Every screen shown is real recorded state — the audit trail, the AI review, the capture — nothing is re-enacted.

## Recording notes

- Record at 1080p, browser zoom 100%, hide bookmarks bar.
- No stock music (Devpost rules: no copyrighted music) — use silence or your own audio.
- Keep the PayPal sandbox login fast (pre-logged-in sandbox buyer session if possible).
- The video must be **under 3 minutes** and public on YouTube.
- Do NOT show the `.env` file, API keys, or the sandbox account password.
