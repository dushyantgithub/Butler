# Butler — your local AI office

Butler is a local browser game for a small AI team, with you as the boss. Its lightweight 3D office has brick-style employees, desks, a coffee corner, a lounge, and your own glass-walled chamber. It runs on a Mac or Windows computer and opens in your browser. It is not a hosted service or a packaged native installer.

**Scout, the researcher**, reads approved AI publisher feeds, fetches original articles, checks dates and domains, and produces a brief with supporting evidence. **Quinn, the social media manager**, prepares LinkedIn and X drafts, checks their lengths, and publishes after your approval. An optional automatic mode publishes new, unchanged drafts only after the local editorial checks pass.

## Open the office

Requires **Node.js 24 or newer**. Download it from [nodejs.org](https://nodejs.org/).

- **Mac:** double-click `Start Butler.command`.
- **Windows:** double-click `Start Butler.bat`.
- Or use a terminal in this project:

```sh
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:4310**. `npm run launch` builds, starts the server, and opens your browser. Keep its terminal open while the office works. Press Ctrl+C to close the office gracefully. Closing only the browser tab does not stop the server.

Click **New assignment** or speak to Scout to start a news round. Scout carries a folder to Quinn, who works at her computer and brings drafts to your chamber. Click her visit bubble, your character, or **Your desk** to read the brief, key points and posts. Give editorial direction and select **Ask Quinn to rewrite** for a new version, or edit the posts yourself. **Approve & publish** approves the current saved version and sends it to the selected connected accounts.

Drag to rotate the office, scroll to zoom, and click employees or their desks to talk. Idle employees walk to the coffee corner, window or lounge. The top-right **Office journal** holds real task statuses, dates, durations and results; the book opens Scout’s source library. Forms open over the office only when needed. **Gentle motion** reduces character bobbing and gestures.

Movement is a visual representation of real workflow events, not a separate AI simulation. Animation may finish after the underlying task. Publishing success always comes from API receipts, never from an animation. The help menu has an explicitly labeled handoff animation preview; it creates no tasks, drafts or posts.

The office starts empty; no mock news, fake work, or fabricated publishing receipts are seeded. A real round can legitimately produce no drafts if nothing is recent, reachable, or readable enough.

## Small local LLM for an 8 GB computer

Default: **Qwen3 4B through Ollama**, a roughly **2.5 GB download**, selected for better writing. In a live comparison on this 8 GB Mac, Ollama reported a peak loaded-model size of about **3 GB**; a write, review and corrective rewrite took about **82 seconds**. This is one measured example, not a speed guarantee. The operating system, browser and other apps need additional memory. **Qwen3 1.7B** remains available as a faster, lighter 1.4 GB option, with weaker writing and more review needed. Install that option with `npm run setup:model -- qwen3:1.7b` and select it in settings.

1. Install [Ollama for Mac or Windows](https://ollama.com/download).
2. In this project folder, run:

   ```sh
   npm run setup:model
   ```

3. Start Butler. Check **Office settings → Your local engine**.

This checkout also supports a project-local Ollama executable at `.runtime/ollama` (Mac) or `.runtime/ollama.exe` (Windows). When present, Butler stores its model files in `.runtime/models`. Otherwise it uses your installed Ollama and its normal model storage. The optional runtime and downloaded model are not included in Git or npm dependencies.

Butler starts a local Ollama service if needed. A service started by Butler exits with Butler. An already-running Ollama service is left running because it may belong to another application. Model requests always use `127.0.0.1:11434`, with no cloud model option. A service started by Butler has cloud features disabled, one model slot, and one inference request at a time.

Each writing or review pass uses a 4,096-token context, disabled thinking, and a bounded output. Every inference sends `keep_alive: 0`, plus an explicit unload in cleanup. The settings panel checks Ollama's actual loaded-model list. **Weights remain on disk but should not stay in RAM between jobs.** Ollama's small service can still use some memory while the office is open. Other applications using Ollama can load their own models independently.

Turn off **Use the local language model** for a zero-LLM workflow. If Ollama is missing, fails, or produces invalid output, Scout records that event and falls back to a labeled extractive brief. This is a real source excerpt, not simulated LLM output. Basic fallback drafts are held for your review and cannot be automatically published.

## How trust works—and its limits

- Fixed, reviewed publisher allowlist: OpenAI, Google AI, Google DeepMind, Hugging Face, NVIDIA. DeepMind's official redirects to `blog.google` are permitted.
- Hugging Face community and organization-hosted blog paths are excluded. Hosting on a reputable platform does not verify the author. Publisher policy is checked again before delivery; older noncompliant drafts are withheld on startup.
- HTTPS only, with publisher-specific domain checks on every redirect. No arbitrary web-fetching tool is exposed to the LLM.
- Published-date freshness window; undated, stale, future-dated, duplicate, and unreadable articles are skipped.
- Article text is fetched before drafting. Blocked/paywalled articles are skipped rather than reconstructed from the model's memory.
- Each supporting excerpt is a complete sentence of at most 24 words and is checked against the fetched text.
- Quinn writes a detailed briefing, specific key points, a LinkedIn post with a factual opening and supporting paragraphs, plus a separate concise X post. Both posts link to the original. The short exact excerpt stays in the evidence panel.
- A second local model pass compares the claims with the article. Deterministic checks reject invented links, unsupported numeric strings, invented quoted names, copied first-person publisher voice, long copied passages, accidental language switching, and overlong X posts. Quinn makes at most one corrective rewrite. Unresolved concerns are shown beside a draft marked **Editor flagged details** and prevent automatic publishing.
- Model review is **not independent verification** and can miss errors or produce false alarms. The boss can correct a flagged draft and approve it. A rewrite keeps the previous version in local storage and clears approval; the interface displays the newest version.
- Manual edits clear approval. Automatic publishing accepts only new unchanged canonical posts with matching source evidence, a current publication date, and a successful editorial review. This is an optional convenience, not a guarantee of accuracy.

**“Source checked” does not mean independently fact-checked.** A primary publisher can make mistakes, exaggerate, or use AI to write an announcement. Butler cannot prove an article is true or human-authored. It does not claim reliable AI-text detection or independent corroboration. Read the original before approval, especially for benchmarks, financial claims, allegations, or consequential news.

This first version covers curated official announcements rather than the entire AI news ecosystem. Arbitrary web search, independent secondary-source corroboration, media generation, and custom employee creation are not implemented.

## Social accounts

In **Office settings → Connect your audience**, save tokens from your own developer applications. Credentials are never passed to the LLM, returned to the browser after saving, or included in activity logs. “Credentials saved” is not a successful authorization test; access is checked at publishing time.

### LinkedIn

Use a LinkedIn developer application with the appropriate product/access tier and OAuth permission: `w_member_social` for a member or `w_organization_social` for an organization with a permitted page role. Supply the user access token and author URN, such as `urn:li:person:YOUR_ID` or `urn:li:organization:YOUR_ID`.

Publishing uses the official `POST /rest/posts` API, not browser automation. The API version defaults to `202603` and is editable because LinkedIn versions expire. Your account must have access to this API; saving a token does not grant that access. See [LinkedIn Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-03) and [OAuth authorization flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow).

### X / Twitter

Use an **OAuth 2.0 user access token**, with `tweet.write`, `tweet.read`, and `users.read` scopes. An application-only bearer token cannot post for a user. Publishing uses `POST https://api.x.com/2/tweets` and validates the standard 280-character weighted limit, including Unicode and shortened URLs.

X API usage can require paid credits. Set spending limits in your developer account. See [X OAuth setup](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code), [create posts](https://docs.x.com/x-api/posts/create-post), and [current pricing](https://docs.x.com/x-api/getting-started/pricing).

The first version accepts tokens you obtain yourself. Interactive OAuth login, automatic token refresh, image/video publishing, threads, and scheduled individual posts are not implemented. Replace expired tokens in Settings.

### Delivery safety

The app records a receipt independently for each platform. A retry sends only platforms that have not succeeded. If a request times out or its success cannot be determined, it is marked **Check account** and will not be resent automatically. Check the actual account, then record either its post ID or that nothing was published. This also applies after a crash during delivery. No client can guarantee exactly-once delivery when a remote API accepts a request but loses its response.

## Scheduling and local data

News rounds can run manually or every 1, 3, 6, 12, or 24 hours. The scheduler lives in the local server; the computer must be awake and Butler running. After a missed interval it runs one catch-up round. There are no OS background jobs or cloud workers. Automatic publishing is off by default; enabling it applies to new drafts, not a backlog of old ones.

Task history includes employee, status, start/end timestamps, elapsed duration, and outcome. SQLite persists settings, drafts, receipts, tasks, and events in `data/butler.sqlite`. The UI shows the latest 500 tasks/drafts and 150 timeline events; older records remain in the database. Dates are stored in UTC and displayed in your local timezone. Task durations are elapsed wall time, including waiting for a publisher or LLM.

Credentials are encrypted with AES-256-GCM in `data/credentials.enc`. The key is in `data/vault.key`. File permissions are restricted where supported. **This is not an OS keychain**: someone with access to both files can decrypt the credentials. Do not share `data/`, `.runtime/`, or backups of them. Windows filesystem permissions inherit from your user directory. Use your OS disk encryption/account protections. Disconnecting clears the app's token; revoke a token in the provider account when needed.

Back up `data/` only when Butler has stopped, keeping the database, encrypted credentials, and key together. `BUTLER_DATA_DIR` can point to another private local directory. The HTTP server binds only to `127.0.0.1`; it checks hosts, origins, and a custom header on writes. Do not expose it through a public tunnel or reverse proxy. It is a single-user local application, without multi-user authentication.

## Development and checks

```sh
npm run dev      # local API on 4310 + Vite on 5173
npm test         # isolated workflow, API, model-lifecycle, and delivery tests
npm run build    # production frontend
npm run format  # format source files
```

`server/` contains the local SQLite store, source reader, Ollama adapter, agent coordinator, encrypted credential store, and official publishing adapters. `src/game/` contains the Three.js office, character routines and walking routes; `src/OfficeGame.jsx` connects it to real workflow events. The React desk panels hold drafts, preferences and history. The scene caps rendering at about 30 fps, pauses rendering in hidden tabs, and shares geometry to keep the office light on an 8 GB computer. `test/` uses disposable databases and mocked publishing transports: running tests cannot publish to social media. The game and local writing flow have been exercised on this Mac; Windows launch scripts are supplied but have not been tested on a Windows machine. Live publishing still requires validation with your own authorized developer accounts.

Model references: [Qwen3 4B](https://ollama.com/library/qwen3:4b) and [Qwen3 1.7B](https://ollama.com/library/qwen3:1.7b). Memory lifecycle: [Ollama chat API](https://docs.ollama.com/api/chat) and [local-only configuration](https://docs.ollama.com/faq).
