# AI backend (Part 4A) — Smart Math Calculator

A minimal, dependency-free Node server (`node:http` only) for the **existing**
browser AI fallback in `js/services/ai-math-solver.js`. It is the only place an
AI provider key is ever read, and it is read from an **environment variable**.

```
Browser (no key)                This server (key in process.env)        Provider
  unsupported question
  POST {question, mode}   ->    AI_PROVIDER_API_KEY ----------------->  AI_PROVIDER_URL
                                add prompt + key (server-side)          chat-style JSON
  {answer, steps}         <-    validate + sanitize + normalize    <-   model text
```

Files: `config.js` (env → config) · `provider.js` (provider adapters) ·
`solve.js` (prompt, validation, sanitizing, normalization) · `server.js` (HTTP).

## 1. Run it (no install, no dependencies)

```powershell
# default: AI_PROVIDER=none -> starts fine, /api/health reports aiConfigured false
node server/server.js

# with a local env file (Node 20+; copy server/.env.example first)
node --env-file=server/.env.local server/server.js
```

Default address: `http://127.0.0.1:8787` — `POST /api/solve`, `GET /api/health`.
Environment variables are the only configuration source; `.env` files are read by
Node (`--env-file`), never by the app code.

## 2. Configure a provider (provider-agnostic, no SDK)

| Variable | Purpose |
| --- | --- |
| `AI_PROVIDER` | `none` (default), `generic` or `gemini` |
| `AI_PROVIDER_API_KEY` | **the secret** — server-side only, never sent to the browser |
| `AI_PROVIDER_URL` | the provider endpoint the server POSTs to |
| `AI_PROVIDER_MODEL` | optional model name |
| `AI_PROVIDER_AUTH_HEADER` | default `Authorization` |
| `AI_PROVIDER_AUTH_SCHEME` | default `Bearer` (set empty to send the raw key) |
| `AI_PROVIDER_RESPONSE_PATH` | default `choices.0.message.content` |
| `AI_PROVIDER_EXTRA_JSON` | optional extra body fields, as a JSON object |
| `AI_REQUEST_TIMEOUT_MS` | default `30000` |
| `AI_MAX_QUESTION_LENGTH` | default `2000` (matches the browser cap) |
| `AI_ALLOWED_ORIGIN` | empty = same-origin + local `http://127.0.0.1:*` dev pages (default) |
| `HOST`, `PORT` | default `127.0.0.1`, `8787` |

The request body sent to the provider is
`{ ...AI_PROVIDER_EXTRA_JSON, model?, messages: [{role:'system'},{role:'user'}] }`
and the model text is read from `AI_PROVIDER_RESPONSE_PATH` (dotted path, numeric
segments are array indexes). **No provider is selected for you** — any provider
that satisfies those two rules works, and adding a genuinely different vendor
means adding one adapter function in `provider.js`.

### 2b. Gemini provider (`AI_PROVIDER=gemini`)

The Gemini adapter needs no SDK either. With a key in `AI_PROVIDER_API_KEY` the
server POSTs

```json
{
  "systemInstruction": { "parts": [{ "text": "<server-built math prompt>" }] },
  "contents": [{ "role": "user", "parts": [{ "text": "Mode: ...\nQuestion: ..." }] }]
}
```

to `https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`
(model from `AI_PROVIDER_MODEL`, default `gemini-3.8-flash`), with the key in
the `x-goog-api-key` header. The model text is read from
`candidates.0.content.parts.0.text`. A `400` carrying `API_KEY_INVALID` becomes
a safe `502 provider-auth`, exactly like a 401/403.

## 3. API contract (matches the existing frontend exactly)

```
POST /api/solve      Content-Type: application/json
{ "question": "Find the derivative of x2 + 3x", "mode": "direct" | "full" }

200  { "answer": "2x + 3", "steps": ["d/dx(x2) = 2x", "d/dx(3x) = 3"] }
400  { "error": "...", "code": "invalid-question" | "invalid-mode" | ... }
413  { "error": "...", "code": "question-too-long" | "body-too-large" }
415  { "error": "...", "code": "unsupported-media-type" }
429  { "error": "...", "code": "provider-rate-limit" }
502  { "error": "...", "code": "provider-error" | "provider-auth" | "provider-malformed" | "provider-unusable" }
503  { "error": "...", "code": "not-configured" }
504  { "error": "...", "code": "provider-timeout" }

GET /api/health -> 200 { "status": "ok", "aiConfigured": true|false }
```

`answer`/`steps` are plain text (markup stripped, capped at 4000 chars and
30 × 500 chars) because the UI renders them with `textContent`.

## 4. Security rules enforced here

* The key is read **only** from `process.env.AI_PROVIDER_API_KEY`, used only on the
  outbound provider request, never logged, never returned, never accepted from a
  client. Client-supplied `system`/`user`/key fields are ignored: the prompt is
  built server-side in `solve.js`.
* Errors are generic (no stack traces, no paths, no provider bodies); logs carry
  only method, path, status and duration.
* Bodies are capped (8 KB), JSON-only, size-validated, and the question length is
  capped; CORS is limited to `AI_ALLOWED_ORIGIN` when set, otherwise to this
  machine's own `http://127.0.0.1:*` / `http://localhost:*` and `file://` pages
  (local dev: static page + backend side by side). Responses carry no credential,
  so no origin can reach the key through this endpoint.
* No `eval`, no `new Function`, no `innerHTML`, no dependencies.

## 5. Tests

```powershell
node tests/backend.test.js    # validation, provider failures, sanitizing, HTTP round-trips
```

Every provider call in the tests is a stub — no real AI provider is ever called.
