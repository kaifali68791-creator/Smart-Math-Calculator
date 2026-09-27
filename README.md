# Smart Math Calculator

A fast, mobile-first calculator that runs **completely inside the browser**.
No build step, no framework, no dependencies, no server calls — open `index.html`
and it works.

> **Current scope:** Part 1 (foundation + normal calculator), Part 2 (scientific
> calculator), Part 3A (Smart Solver UI), Part 3B-1 (local deterministic
> solver) and Part 3B-2 (AI-powered Smart Math Solver — an optional fallback
> that needs your own backend) are done. Accounts, admin panel, statistics and
> multi-language support are intentionally **not** implemented yet.
> See [Not implemented yet](#10-not-implemented-yet).

---

## 1. Run it

**Option A — just open the file**

Double-click `index.html` (or drag it into a browser). All scripts are plain
classic scripts, so it also works from `file://`.

**Option B — tiny local server** (useful for phone testing on the same Wi-Fi)

```powershell
# from the project folder
python -m http.server 8080
# then open http://localhost:8080
```

## 2. Features (Part 1)

| Area | What works |
| --- | --- |
| Calculator | `+ − × ÷`, `%`, brackets `( )`, decimal point, `C` (clear), `⌫` (backspace), `=` |
| Percentage | `10% of 500 → 50`, `500 + 10% → 550`, `500 − 10% → 450`, `8 × 25% → 2` |
| Brackets | `(2 + 3) × 4 → 20`, implicit multiplication like `2(3 + 4) → 14` |
| Live preview | shows `= 5` under the expression while you type (instant, local) |
| History | every `=` is stored locally, newest first, reusable with one tap |
| Errors | `Cannot divide by zero`, `Invalid expression`, `Expression is incomplete`, `Result is too large` |
| Storage | `localStorage` with an in-memory fallback when storage is blocked |
| Theme | Auto (system) / Light / Dark, remembered between visits |
| Navigation | `Calculator` tab and a working `Smart Solver` tab (Part 3A UI + Part 3B-1 local solver + Part 3B-2 optional AI fallback) |
| Keyboard (desktop) | `0-9 . + - * / % ( ) Enter Backspace Esc` |

### Speed

* Every key press only touches in-memory JavaScript — **no fetch, no XHR, no API**.
* The result/preview is recalculated synchronously, so the display updates in the
  same frame as the press.
* The only CSS transition is a 60 ms background change on `:active`, so buttons
  never feel delayed. There are no loading spinners, ripples or key animations.
* `touch-action: manipulation` removes the double-tap zoom delay on phones.

### Percentage rules

| Expression | Result | Reason |
| --- | --- | --- |
| `50%` | `0.5` | a bare percentage is a fraction |
| `10% of 500` | `50` | percentage of a value |
| `500 + 10%` | `550` | adds 10% of the running value |
| `500 − 10%` | `450` | subtracts 10% of the running value |
| `200 ÷ 10%` | `2000` | divides by the fraction `0.1` |
| `8 × 25%` | `2` | multiplies by the fraction `0.25` |

## 3. Project structure

```
Smart-Math-Calculator/
├── index.html                    # app shell, views, script order
├── css/
│   ├── base.css                  # design tokens, dark theme, header/footer, placeholder view
│   ├── calculator.css            # display + keypad (mobile first)
│   ├── history.css               # history panel
│   └── solver.css                # Smart Solver view (incl. AI loading state)
├── js/
│   ├── core/                     # pure logic, no DOM -> unit tested
│   │   ├── expression-engine.js  # tokenizer + parser + evaluator (never uses eval)
│   │   ├── format.js             # number formatting / rounding helpers
│   │   └── calculator-model.js   # key-press state machine + display snapshots
│   ├── services/                 # browser services
│   │   ├── storage.js            # localStorage wrapper + memory fallback
│   │   ├── history-store.js      # local calculation history
│   │   ├── settings-store.js     # key/value settings (theme today, more later)
│   │   ├── math-solver.js        # Part 3B-1: local deterministic question solver
│   │   └── ai-math-solver.js     # Part 3B-2: AI fallback provider (endpoint only, no keys)
│   ├── config.js                 # Part 4A: optional endpoint URL only (never a key)
│   ├── ui/                       # DOM layer
│   │   ├── dom.js                # tiny helpers (qs, delegate, setText, ...)
│   │   ├── theme.js              # system/light/dark controller
│   │   ├── calculator-view.js    # basic + scientific keypads, display, keyboard bindings
│   │   ├── calculator-modes.js   # Part 2: Basic|Scientific and DEG|RAD switches (settings-backed)
│   │   ├── history-view.js       # history list rendering (with DEG/RAD badges)
│   │   ├── solver-view.js        # Part 3A UI + two-stage wiring (local -> AI), modes, result
│   │   └── navigation.js         # generic view switcher (data-view-* attributes)
│   └── app.js                    # bootstrap: wires everything into SMC.app
├── server/                       # Part 4A: minimal secure AI backend (node:http only)
│   ├── server.js                 # HTTP server: POST /api/solve, GET /api/health
│   ├── solve.js                  # validation, server-side prompt, sanitizing, normalization
│   ├── provider.js               # provider adapters (none | generic | gemini) - key stays here
│   ├── config.js                 # environment -> config (AI_PROVIDER_API_KEY, never logged)
│   ├── .env.example              # template with EMPTY values (no secrets)
│   └── README.md                 # how to run and configure the backend
├── assets/favicon.svg
├── .gitignore                    # ignores .env* so real keys are never committed
└── tests/
    ├── engine.test.js            # Part 1 + Part 2 checks, runs in Node
    ├── math-solver.test.js       # Part 3B-1 solver checks, runs in Node
    ├── solver.test.js            # Smart Solver UI checks (DOM stub), runs in Node
    ├── ai-solver.test.js         # Part 3B-2: two-stage flow + security scans (all mocked)
    ├── backend.test.js           # Part 4A: backend validation/errors/scans (all mocked)
    ├── browser-check.html        # integration harness for real browsers
    └── browser-check.js          # real clicks/keys, both modes, mocked AI fallback
```

### Load order and namespacing

Every file attaches itself to the single global `SMC` namespace
(`SMC.ExpressionEngine`, `SMC.Format`, `SMC.createHistoryStore`, `SMC.app`, ...).
`index.html` loads them in dependency order: `core → services → ui → app`.
There are no modules/bundlers, so the app also works straight from `file://`.

`js/core` files are UMD-style: the browser gets `SMC.*` and Node can `require()` them
directly, which is how the unit tests run without any tooling.

## 4. Tests

```powershell
# 1) logic tests (engine, formatting, model, stores)
node tests/engine.test.js

# 2) Part 3B-1 local solver tests (supported answers, steps, unsupported cases)
node tests/math-solver.test.js

# 3) Smart Solver UI tests (question, modes, result panel)
node tests/solver.test.js

# 4) Part 3B-2 AI solver tests (two-stage flow, mocked AI backend, security scans)
node tests/ai-solver.test.js

# 5) Part 4A secure backend tests (validation, provider errors, sanitizing,
#    HTTP round-trips, secret scans - every provider call is mocked)
node tests/backend.test.js

# 6) browser integration test - open this file in any browser
tests/browser-check.html          # prints PASS/FAIL on the page and in the tab title

# ... or run it headless (Chrome/Edge), mobile viewport:
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu `
  --window-size=390,844 --virtual-time-budget=9000 `
  --dump-dom "file:///<path-to-project>/tests/browser-check.html"
```

Last results on this machine: `249/249` core checks (`engine.test.js`),
`173/173` local-solver checks (`math-solver.test.js`), `50/50` Smart Solver UI
checks (`solver.test.js`), `139/139` Part 3B-2 AI checks (`ai-solver.test.js`,
AI fully mocked), `233/233` Part 4A backend checks (`backend.test.js`, provider
fully mocked) and `202/202` browser checks (headless) — no console errors. The
Part 1/2 checks are kept untouched inside those totals.

## 5. Local storage keys

| Key | Contents |
| --- | --- |
| `smc:history:v1` | `[{ id, expression, result, resultText, timestamp, angleMode? }, ...]` (max 100) |
| `smc:settings:v1` | `{ "theme": "...", "calculatorMode": "basic" \| "scientific", "angleMode": "deg" \| "rad" }` |

Everything is namespaced with `smc:` and `SMC.createStorage().clearAll()` only
removes this app's keys.

## 6. Part 2 - scientific calculator

The Basic calculator is fully preserved. A **Scientific** switch in the toolbar
reveals a 5-column scientific panel above the normal keys; the angle unit switch
**DEG | RAD** (default DEG) sits next to it and is used by `sin/cos/tan` and
`asin/acos/atan`. Both choices are remembered in `localStorage`.

| Area | Examples |
| --- | --- |
| Trig (DEG) | `sin(30) → 0.5`, `cos(60) → 0.5`, `tan(45) → 1` |
| Trig (RAD) | `sin(π ÷ 2) → 1`, `cos(π) → −1` |
| Inverse trig | `asin(0.5) → 30` (DEG) or `π ÷ 6` (RAD) |
| Hyperbolic | `sinh(1)`, `cosh(1)`, `tanh(1)` |
| Log | `log(100) → 2`, `ln(e) → 1` |
| Roots | `√(25) → 5` (the `√` key types `√(`), `∛27 → 3`, `√25` works without brackets by design |
| Power | `2^5 → 32` (right associative: `2^3^2 → 512`), `−2^2 → −4`, `2^(−1) → 0.5` via the `1/x` key |
| Factorial | `5! → 120`, `0! → 1`; only integers `0..170` are allowed (`171!` reports `Result is too large`) |
| Constants | `π`, `e` (the key types `2 × e` after a number, so no exponent confusion) |
| Modulo | `10 mod 3 → 1` |
| Notation | the `EXP` key inserts `× 10^`, and `1e3` is accepted as input |
| Sign | the `+/−` key flips the value being typed (`25` → `−25`) |

### Precision and errors

* Scientific results use the same 12-significant-digit display as Part 1, so
  `sin(30)` shows `0.5`, not `0.49999999999999994`.
* New safe messages on top of the existing ones: `Invalid function input`
  (`sqrt(−1)`, `log(0)`, `asin(2)`, `tan(90°)` in DEG) and `Invalid factorial`
  (negative or fractional factorials).
* Nothing ever crashes: huge power/factorial inputs report `Result is too large`.

### Speed

Part 2 adds no network, no delays, no animations and no extra parsing for Basic
input — the scientific tokens only activate when scientific characters appear.
The DEG/RAD switch re-evaluates the live preview in the same frame.

## 7. Part 3A + 3B-1 - Smart Solver

The `Smart Solver` tab is fully wired: a question textarea, three **example**
buttons, a **Direct Answer | Full Explanation** mode switch, `Solve` and
`Clear`, and a result panel (title + body) with a `data-result-kind` attribute
(`answer` / `loading` / `unsupported` / `error`) and a `data-result-source`
badge that says **Local Solver** or **AI Solver**.

Part 3B-1 connects that UI to `js/services/math-solver.js`
(`SMC.createMathSolver({ engine, format, getAngleMode })` → `solveMathQuestion(question)`),
a **local, deterministic, offline** solver. It never touches the network and
never uses `eval`/`new Function`; arithmetic, fractions, powers, roots and trig
all go through the existing `expression-engine.js`.

| Family | Examples |
| --- | --- |
| Arithmetic | `2 + 2 → 4`, `What is 15 * 4? → 60`, `10 / 4 → 2.5` |
| Fractions | `1/2 + 1/4 → 0.75` (`3/4 → 0.75` answer, step shows the fraction) |
| Powers / roots | `2^10 → 1024`, `sqrt(81) → 9`, `cube root of 27 → 3` |
| Trigonometry | `sin(30) → 0.5` in DEG, `-0.988031624093` in RAD (respects the toolbar switch) |
| Percentages | `25% of 800 → 200`, `increase 500 by 10% → 550`, `decrease 500 by 10% → 450` |
| `of` fractions | `1/2 of 60 → 30` |
| Linear equations | `2x + 5 = 15 → x = 5` (also `x/3 + 1 = 4`, decimal coefficients) |
| Quadratics | `x^2 - 5x + 6 = 0 → x = 2, 3`; negative discriminant reports "no real solutions" |
| Geometry | circle area/circumference (`A = 49π ≈ 153.938`), rectangle, square, triangle |

**Modes.** Direct Answer renders only `answer`; Full Explanation renders the
solver's structured explanation as labeled sections — `Question`, `Given`,
`To Find`, `Concept`, `Formula`, `Substitution`, `Calculation`, optional
`Step n - …` steps and `Final Answer` (only the filled sections are shown, so
nothing is ever invented). Every family above returns those sections, geometry
included. Unsupported questions (derivatives,
integrals, matrices, statistics, volumes, multi-variable systems, degree > 2)
show an honest **"Not solvable locally yet"** state — the solver never guesses.
Errors (`Cannot divide by zero`, `Invalid expression`) are reported in the same
panel and never crash the app.

**No persistence is added** — questions/results are not written to
`localStorage`, history, or the URL. The result panel has the `aria-live="polite"`
region from Part 3A, and Clear empties only the question.

The two-stage architecture and the optional AI fallback are documented next, in
[§8 Part 3B-2](#8-part-3b-2---ai-powered-smart-solver).

## 8. Part 3B-2 - AI-powered Smart Solver

A **local-first, two-stage** flow (`js/ui/solver-view.js`):

```
User question
   ↓
Stage 1 — local solver (js/services/math-solver.js, synchronous, offline)
   supported   → answer + steps        source: "local"
   hard error  → honest error (5 / 0)  source: "local"
   unsupported → Stage 2 (only when an AI endpoint is configured)
   ↓
Stage 2 — AI provider (js/services/ai-math-solver.js)
   "AI is solving..."  → { success, source: "ai", answer, steps }
   failure             → friendly error, never a fabricated answer
```

* Locally supported questions (`2x + 5 = 15`, `25% of 800`, `x² - 5x + 6 = 0`,
  trig, geometry, …) are answered on the device and **never call the AI
  service** — fast, cheap, deterministic, offline. The Basic and Scientific
  calculators never touch the AI code path at all.
* The Part 3B-1 contract is untouched: `js/services/math-solver.js` still
  returns `{ status, answer, steps }` and its behavior did not change.
* The provider is UI-independent: `SMC.createAIMathSolver(config)` →
  `solveWithAI(question, mode)` resolving to
  `{ success: true, source: "ai", mode, answer, steps }` or
  `{ success: false, source: "ai", error, code }` — it never rejects.
  `mode` is `"direct"` (the bare result) or `"full"` (a complete beginner
  lesson), mirroring the UI switch.
* Only `unsupported` results reach Stage 2, and only when `isConfigured()` is
  true. Otherwise the honest "Not solvable locally yet" state from 3B-1 shows,
  exactly as before.

### Backend configuration (needed for the AI fallback)

The browser holds **no secret**. It posts to a backend/edge-function endpoint
that owns the provider key:

| Where | Variable | Value |
| --- | --- | --- |
| **Backend only** (edge function / server, never the frontend) | `AI_PROVIDER_API_KEY` | your AI provider's key — stays server-side |
| Frontend (optional, endpoint **URL** only) | `window.SMC_CONFIG = { aiEndpoint: 'https://…/api/solve' }` | set by an extra `<script>` before `js/app.js`, or pass `{ endpoint }` to `createAIMathSolver` |

A minimal ready-to-run backend ships with this repository (`server/`,
dependency-free, Part 4A) — see [§12 Part 4A](#12-part-4a--secure-ai-backend-server) for
start-up and configuration.

Default: the bundled local backend (`js/config.js` → `http://127.0.0.1:8787/api/solve`).
With that backend stopped (or the value set to `''`) `isConfigured()` is `false`
and Stage 2 never succeeds — the UI then says so in plain language instead of
inventing an answer, and everything else keeps working from `file://`.

Contract (also documented in the `ai-math-solver.js` header):

* `POST aiEndpoint`, `Content-Type: application/json`, body
  `{ question, mode: "direct"|"full", system, user }` (`system` is the built-in
  math-assistant prompt, `user` the composed `Mode/Question` text).
* `200 → { "answer": "…", "steps": ["…", "…"] }` (`steps` optional; non-empty
  strings only, capped at 30 steps × 500 chars, answer ≤ 4000 chars). In `full`
  mode the model is asked to return a labeled lesson — one section per step
  (`Understand the problem`, `Given`, `Find`, `Concept`, `Formula`, `Substitute`,
  `Work it out`, `Simplify`, `Check`, `Common mistake`, optional `Where this is
  used`) — so the browser contract never changes: the lesson simply travels
  inside `steps`.
* Any other outcome (401/403 auth, 429 rate limit, 5xx, timeout ≥ 30 s,
  offline, DNS/network failure, invalid JSON, missing/empty `answer`) maps to
  the friendly message: *"AI solver is currently unavailable. You can still
  use the local calculator and supported offline solver."* The app never
  crashes and never invents an answer.
### How `full` mode renders an AI lesson

The prompt asks the model for a labeled lesson — one section per step. When every
AI step carries a `Label: text` prefix, `js/ui/solver-view.js` renders it as titled
sections (blank line between them) followed by the final `Answer:` line, which
mirrors the structured explanation the local solver already produces. If any step
is unlabeled (an older or simpler provider), the view falls back to the classic
numbered `Step 1: …` layout, so earlier replies render exactly as before.
Everything stays plain text: the panel writes `textContent` into a
`white-space: pre-wrap` box and never uses `innerHTML`.

### Security rules

### Security rules

* **No API key in the frontend** — not in `index.html`, `js/`, `css/`, not in
  `localStorage`, not in the URL, not in any browser-visible config. Only the
  endpoint URL is configured client-side. `tests/ai-solver.test.js` scans all
  frontend sources and fails on any `API_KEY = "…"` assignment or `sk-…`
  style key literal.
* No `eval()` / `new Function()` anywhere; no `Authorization` header leaves the
  browser.
* AI output is **untrusted text**: it is rendered with `textContent` only —
  HTML/JavaScript in a reply shows as literal text and is never executed.
* Questions/results are never persisted (no `localStorage`, no history, no
  URL) — same rule as Part 3B-1.
* One AI request at a time: while pending, repeated Solve clicks reuse the
  same promise (no duplicate requests) and the panel shows **"AI is solving…"**;
  the calculator keeps working. Clear discards an in-flight answer.

### What works where

| LOCAL — works offline, no configuration | ONLINE — needs internet + a configured backend |
| --- | --- |
| Basic & scientific calculator, history, themes, DEG/RAD | AI fallback for questions the local solver reports as `unsupported` |
| All Part 3B-1 families: arithmetic, fractions, percentages, linear & quadratic equations, powers/roots, trigonometry, geometry | Broader natural-language questions: derivatives, integrals, average-speed / discount word problems, "explain Pythagoras theorem" |
| Direct Answer / Full Explanation rendering, validation, Clear, source badges | Backend-dependent error paths (auth/rate limit/timeout → friendly offline message) |
| Honest "Not solvable locally yet" when no AI endpoint is configured | |

### Testing the AI integration locally

```powershell
# unit + security tests — the AI backend is fully mocked, no real API is called:
node tests/ai-solver.test.js

# browser integration — the harness swaps in a mock AI provider and asserts
# loading state, duplicates, failures and safe text rendering:
tests/browser-check.html
```

To try a **real** backend: deploy an edge function/server with
`AI_PROVIDER_API_KEY` set in its environment, expose it as `aiEndpoint`
(e.g. an extra `<script>window.SMC_CONFIG = { aiEndpoint: '…' }</script>`
before `js/app.js`), then ask a question the local solver cannot handle, e.g.
`Find the derivative of x² + 3x`. Never paste a provider key into any
frontend file.

## 9. Extension points for later parts

The structure was chosen so the next parts can be added without a rewrite:

| Future feature | Where it plugs in |
| --- | --- |
| Smart Math Question Solver | **done (Part 3A UI + 3B-1 local + 3B-2 AI)** — `js/ui/solver-view.js` (two-stage flow) + `js/services/math-solver.js` + `js/services/ai-math-solver.js`; keep the `solveMathQuestion()` and `solveWithAI()` contracts |
| AI-backed solver (Part 3B-2) | **done** — `js/services/ai-math-solver.js` exposes `solveWithAI(question, mode)` behind the endpoint placeholder; to change providers, change only the backend behind `aiEndpoint` (or the service file), never the UI |
| English / Hindi / Telugu + Roman output | a `js/services/i18n.js` reading/writing `settings.get('language')`; today all user-visible strings live in the view/model files (`describeError`, button labels) |
| Language output in Roman letters | another value of the same `language` setting handled by the i18n module |
| Offline-first | add a `manifest.webmanifest` + service worker (`sw.js`) and register it in `js/app.js`; the calculator and supported solver questions never need the network — only the optional AI fallback does |
| User registration / automatic login | `js/services/auth.js` using the existing `storage` service (or a future API adapter) + a `settings` key such as `session` |
| Cloud database | swap/extend `js/services/storage.js` — every persistence call already goes through it |
| AI / API integration | **done for the solver (Part 3B-2)** — any new API should go through `js/services/ai-math-solver.js`-style services called only from the solver view, never from the calculator, so the calculator stays instant and offline |
| Usage statistics | count events into `smc:stats:v1` via the storage service, or send them from the future API adapter |
| Private admin panel | new `[data-view-panel="admin"]` section + tab; navigation is attribute-driven so it needs no JavaScript change |
| User management | build on the future auth service + settings store |

Rules that keep Part 2+ easy:

* Add features as new `core` / `services` / `ui` files instead of editing the engine.
* New UI states should follow the "model emits a snapshot, view renders it" pattern
  used by `calculator-model.js` + `calculator-view.js`.
* New views/tabs only need `data-view-panel` / `data-view-target` attributes.
* New settings only need `settings.set('yourKey', value)`.

## 10. Not implemented yet

Confirmed **not implemented** (no code, no placeholders pretending to work):

* Login / registration / automatic login — nothing.
* Admin panel, user management, usage statistics — nothing (a plain text note in
  the "Smart Solver" tab mentions they are planned).
* A live AI service — the frontend ships the **provider interface only**
  (`js/services/ai-math-solver.js` + the two-stage flow), and Part 4A ships a
  backend implementation (`server/`, see §12) that stays **inactive until you
  configure it** (`AI_PROVIDER=none` by default; set `AI_PROVIDER=gemini` plus
  your own key in the git-ignored `server/.env.local`). The frontend endpoint in
  `js/config.js` points at that local backend by default (set it to `''` to make
  the app purely offline). Anything the local solver cannot handle is either
  answered by your provider or reported honestly.
  **No fake AI answers, no fake API responses, no API key in the frontend**
  (enforced by the source scans in `tests/ai-solver.test.js` and
  `tests/backend.test.js`).
* Derivatives, integrals, matrices, statistics, volumes, multi-variable systems
  — the local solver still reports these as honest `unsupported` (it never
  guesses); with Part 3B-2 configured they are exactly the questions the AI
  fallback is for.
* Cloud database, sync — nothing; `fetch` exists only inside the optional AI
  fallback (and is never reached without an endpoint), no `XMLHttpRequest`, no
  third-party `<script>` or CDN links.
* Multi-language system (English/Hindi/Telugu, Roman output) — not implemented.
* No hardcoded fake users, no government data, no analytics, no cookies.

## 11. Notes and known choices

* Numbers are displayed with up to 12 significant digits and thousands
  separators; floating point noise is removed (`0.1 + 0.2 → 0.3`).
* Very large/small values switch to exponential notation (`1e+21`, `1e-12`).
  Exponential literals are accepted as input too (e.g. `1e3 + 1`).
* Expressions are limited to 200 characters (engine cap 400) and numbers to 15
  digits, to keep typing predictable on a phone.
* Unclosed brackets are closed automatically when `=` is pressed
  (`2 × (3 + 4` → `14`); a trailing operator reports `Expression is incomplete`.
* History keeps the newest 100 calculations; older ones are dropped on write.
* Browsers: any current Chrome, Edge, Firefox or Safari (uses `const`/`let`,
  `class`, `String.prototype.repeat`, `localStorage`).

## 12. Part 4A — secure AI backend (server/)

A **minimal, dependency-free** Node server (`node:http` + the built-in `fetch`,
Node 18+, tested on Node 24) that owns the AI provider credential for the
existing Part 3B-2 fallback. No framework, no npm packages, no `package.json`
was added, and nothing was deployed.

```
Browser (never holds a key)              server/ (holds AI_PROVIDER_API_KEY)         Provider
  local solver → "unsupported"
  POST /api/solve {question, mode}  →    validate → build math prompt  →           AI_PROVIDER_URL
                                         add key (outbound, server-side)            chat-style JSON
  {answer, steps}                    ←    sanitize + normalize           ←          model text
```
With `AI_PROVIDER=gemini` the outgoing request is instead Gemini's
`generateContent` body and the credential travels in the `x-goog-api-key` header
(see `server/README.md` §2b). The browser contract above never changes.

### Files

| File | Role |
| --- | --- |
| `server/server.js` | HTTP routes (`POST /api/solve`, `GET /api/health`), body cap, CORS, security headers, safe logging |
| `server/solve.js` | request validation, **server-built** mathematics prompt, sanitizing, `{answer, steps}` normalization |
| `server/provider.js` | provider adapters: `none` (default), `generic` (configurable chat-style JSON POST) and `gemini` (Google Gemini generateContent REST, `x-goog-api-key`); `fetchImpl` injectable |
| `server/config.js` | environment → config; the only secret read (`AI_PROVIDER_API_KEY`) and a log-safe summary |
| `server/.env.example` | template with **empty** values; `.gitignore` ignores every real `.env*` file |
| `server/README.md` | short run/configure guide for the backend |
| `js/config.js` | frontend endpoint **URL** only (defaults to the local backend, `''` = offline), loaded before `js/app.js` |

### Running it

```powershell
node server/server.js                              # AI_PROVIDER=none -> honest 503 until configured
node --env-file=server/.env.local server/server.js # with your own (ignored) env file
node tests/backend.test.js                         # 312 checks, provider fully mocked (incl. gemini)
```

Defaults: `127.0.0.1:8787`, CORS limited to the configured origin plus this
machine's own `http://127.0.0.1:*` and `file://` pages, question ≤ 2000 chars,
body ≤ 8 KB, provider timeout 15 s.

### Configuration (server-side only)

`AI_PROVIDER` (`none` | `generic` | `gemini`), `AI_PROVIDER_API_KEY` (**the secret**),
`AI_PROVIDER_URL`, `AI_PROVIDER_MODEL`, `AI_PROVIDER_AUTH_HEADER`,
`AI_PROVIDER_AUTH_SCHEME`, `AI_PROVIDER_RESPONSE_PATH`,
`AI_PROVIDER_EXTRA_JSON`, `AI_REQUEST_TIMEOUT_MS`, `AI_MAX_QUESTION_LENGTH`,
`AI_ALLOWED_ORIGIN`, `HOST`, `PORT`. Full table: `server/README.md`. With
`AI_PROVIDER=gemini` the endpoint is derived from `AI_PROVIDER_MODEL`
(default `gemini-3.8-flash`), the key travels in the `x-goog-api-key` header,
and `AI_PROVIDER_RESPONSE_PATH` is fixed to
`candidates.0.content.parts.0.text`.

**No provider is chosen for you.** With the defaults the backend starts, reports
`aiConfigured: false` on `/api/health`, and every solve returns a friendly 503 —
so no billing, account or vendor is implied by this codebase. Point
`AI_PROVIDER_URL`/`AI_PROVIDER_API_KEY` at any endpoint that accepts a
chat-style JSON body and returns the model text at `AI_PROVIDER_RESPONSE_PATH`,
or add an adapter function in `server/provider.js`.

### API contract (identical to what the frontend already posts)

* `POST /api/solve` with `{ "question": "...", "mode": "direct" | "full" }`
  (the client `system`/`user` fields are accepted but **ignored** — the prompt is
  built server-side).
* `200 → { "answer": "…", "steps": ["…"] }` — plain text only: markup stripped,
  control characters removed, answer ≤ 4000 chars, steps ≤ 30 × 500 chars.
* Validation: `400` (body/question/mode/JSON), `413` (size), `415` (content
  type), `405` (method, with `Allow`), `404`.
* Provider outcomes: `503` not configured, `429` provider rate limit,
  `502` provider error/auth/malformed/unusable, `504` timeout — each with
  `{ "error": "<safe message>", "code": "<machine code>" }`.
* `GET /api/health → { "status": "ok", "aiConfigured": <bool> }`.

### Security guarantees (enforced by `tests/backend.test.js`)

* The key comes from `process.env.AI_PROVIDER_API_KEY`, is attached only to the
  outbound provider request, and is never logged, never returned, never accepted
  from a client (client `apiKey`/`api_key`/`system`/`user` fields are ignored).
* No hardcoded key, no `sk-…` literal, no private key, no remote `<script>`, no
  `eval()`/`new Function()` in any shipped file; the env template keeps an empty
  key and `.gitignore` covers `.env*`, so `server/.env.local` can never be
  committed (asserted by the test suite).
* Provider replies are untrusted: tags stripped, `javascript:`/`onerror=`-style
  content rejected (502), length-capped, and the UI still renders with
  `textContent` only.
* Errors never contain stack traces, paths, provider bodies or configuration;
  logs carry method/path/status/duration only — never the question.

### What you must do to enable a live AI provider

1. Choose a provider **yourself** and obtain its key (this project deliberately
   does not pick or configure one). For Google Gemini this is an AI Studio key
   used with `AI_PROVIDER=gemini` (endpoint and model default are built in).
2. Copy `server/.env.example` → `server/.env.local` (git-ignored), set
   `AI_PROVIDER=gemini` (or `generic` with `AI_PROVIDER_URL`/`AI_PROVIDER_MODEL`)
   and `AI_PROVIDER_API_KEY`, then start the server.
3. Point the frontend at it: `js/config.js` already defaults to
   `http://127.0.0.1:8787/api/solve` (URL only — never a key), so nothing else is
   needed when the backend runs on this machine. Change that value only if the
   backend runs elsewhere (`''` disables the AI fallback entirely).
4. Ask something the local solver reports as unsupported, e.g.
   `Find the derivative of x2 + 3x`.

No login, accounts, admin, analytics, language system, PWA or deployment
configuration was added — those remain future parts. Nothing has been deployed
and Part 4B has not been started.

