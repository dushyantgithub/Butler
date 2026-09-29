# Butler — your local AI office

Butler is a local marketing and research office with 114 configurable employees, 501 built-in skills, and you as CEO. Its lightweight 3D office has brick-style employees, desks, a coffee corner, a lounge, and your own glass-walled chamber. It runs on a Mac or Windows computer and opens in your browser. It is not a hosted service or a packaged native installer.

**Scout, the researcher**, reads approved AI publisher feeds, fetches original articles, checks dates and domains, and produces a brief with supporting evidence. **Quinn, the social media manager**, prepares LinkedIn and X drafts, checks their lengths, and publishes after your approval. Every post requires your explicit approval; background research never publishes on its own.

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

### Start and stop from a terminal

**Start an already-installed office (Mac or Windows):** open a terminal in the Butler project folder and run:

```sh
npm start
```

On a Mac, you can enter the folder first with `cd "/path/to/Butler"` (replace that example with your actual folder). Then open **http://127.0.0.1:4310/** in your browser. Keep the terminal open. After pulling frontend changes, run `npm run build` before starting; alternatively, `npm run launch` rebuilds and opens the office for you.

**Stop normally:** press **Ctrl+C** in the terminal running Butler. This lets Butler shut down gracefully. Closing the browser tab alone does not stop the app.

**Stop an existing background instance on a Mac:** this stops the server listening on Butler's default port, **4310**:

```sh
lsof -tiTCP:4310 -sTCP:LISTEN | xargs kill -TERM
```

If nothing is running on that port, there is nothing to stop. To restart, stop the existing instance and run `npm start` again. Your drafts, settings, and saved connections remain on disk.

### Using the office

Click **Research news** or speak to Scout to start a news round. Scout carries a folder to Quinn, who works at her computer and brings drafts to your chamber. Click her visit bubble, your character, or **Your desk** to read the brief, key points and posts. Give editorial direction and select **Ask Quinn to rewrite** for a new version, or edit the posts yourself. **Approve & publish** approves the current saved version and sends it to the selected connected accounts.

Drag to rotate the office, scroll to zoom, and click employees or their desks to talk. Idle employees walk to the coffee corner, window or lounge. The top-right **Office journal** holds real task statuses, dates, durations and results; the book opens Scout’s source library. Forms open over the office only when needed. **Gentle motion** reduces character bobbing and gestures.

Movement is a visual representation of real workflow events, not a separate AI simulation. Animation may finish after the underlying task. Publishing success always comes from API receipts, never from an animation. The help menu has an explicitly labeled handoff animation preview; it creates no tasks, drafts or posts.

The office starts with no active employees; no mock news, fake work, or fabricated publishing receipts are seeded. A real round can legitimately produce no drafts if nothing is recent, reachable, or readable enough.

## Employees, departments and skills

Open **Employees** to search the roster, inspect skills, give assignments, and manage individual employees or an entire department:

- **In the office:** appears at a department desk and can receive work.
- **On the bench:** counted in the reserve lounge, with skills and history retained; cannot receive work.
- **Undeployed:** removed from the floor; cannot receive work. Redeploy anytime.

The eight sections cover research, marketing, creative content, analytics, technology, operations, compliance, and personal development. The office starts with no employees deployed. Open the **Employees** side drawer to see designations and skills, then drag an employee onto the office floor to deploy them in their department. A **Deploy** button supports keyboard and touch use. Use **Assign work** on a deployed employee to start an assignment, or **Manage team & bench** for the full roster. Deploy Scout and Quinn before news rounds; deploy Quinn before publishing. Deployment and skill changes are saved across restarts. Changes wait until the current assignment completes so a worker cannot disappear during a publishing operation.

All 114 employees and 501 skills work without external folders. The built-in capability catalog contains occupational/task names; Butler supplies original specialty instructions and reusable departmental methods. These are Butler implementations, **not embedded copies of purchased prompt bundles**, and do not claim to reproduce every technique in another library. Skill coverage starts with the employee's department; **Skills & work** lets you change it. Each assignment uses up to two explicitly selected skills, or chooses from assigned skills by relevance to the brief. Instructions are sent to the local model; they do not grant shell, browsing, account or sending privileges.

Optional local imports can be placed in `agents/subagents/<category>/*.md` and `skills/<category>/<skill>/SKILL.md`; restart to load them. Plain frontmatter names/descriptions and Markdown instructions are supported, not arbitrary YAML execution or tool declarations. These folders are ignored by Git. Only import content you are entitled to use; keep restricted libraries private. The app never needs a paid bundle to start.

## Private projects and campaign work

1. Open **Projects** and create a brief with the company, website, products, audience, voice, research interests, confirmed claims and restrictions. No company or product is seeded in the public code.
2. Add up to eight public HTTPS source pages. Each assignment reads the website plus up to three additional pages; redirects are revalidated, private network destinations blocked, and response size/time bounded. This is source reading, not general web search. Failed reads are reported.
3. Save the brief, select a deployed employee, and request either a specialist report or **Campaign posts & visual brief**. Use reports for customer/competitor research, content planning or analysis. Completed reports are available under **Skills & work → Recent work** and in the journal.
4. Campaigns create separate LinkedIn/X copy, supporting source excerpts, an original project snapshot, the shortened model brief, visual direction, and a downloadable 1200 × 1200 PNG graphic. The graphic uses the campaign headline and project name; it is a designed text card, not generated product photography. Put essential facts first: local model prompts use bounded excerpts and may not include every long field.
5. Review the source material and claims at **Your desk**, edit if necessary, and choose **Approve & publish**. This sends **text only** to selected connected accounts. Download the graphic separately; image upload and paid ad placement are not connected. No post is sent just by running a campaign or completing a review report.

Project profiles, source snapshots, research results and campaign drafts are stored only in ignored local `data/`. Existing drafts retain their evidence when a profile is edited or removed. No project text or social credentials is committed to GitHub. The browser is still a trusted local interface: keep the app bound to loopback, and do not put it on a public server.

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

News writing and review use a 4,096-token context; specialist and campaign assignments use 8,192 tokens for project evidence and skills and may use more memory. All passes disable thinking and bound output. Every inference sends `keep_alive: 0`, plus an explicit unload in cleanup. The settings panel checks Ollama's actual loaded-model list. **Weights remain on disk but should not stay in RAM between jobs.** Ollama's small service can still use some memory while the office is open. Other applications using Ollama can load their own models independently.

Turn off **Use the local language model** for a zero-LLM workflow. If Ollama is missing, fails, or produces invalid output, Scout records that event and falls back to a labeled extractive brief. This is a real source excerpt, not simulated LLM output. Basic fallback drafts are held for your review and cannot be automatically published.

## How trust works—and its limits

- **156 curated source feeds:** 19 publisher/research blogs and 137 official AI project release feeds. Examples include OpenAI, Google Research, Microsoft Research, AWS Machine Learning, Apple Machine Learning, MIT, Berkeley AI Research, PyTorch, Hugging Face, Ollama, vLLM, and LangChain. These are source feeds, not 156 independent news organizations. The Sources library has search, type filters, individual switches, and an Enable all button.
- The original five feeds plus 151 added feeds were checked for availability in September 2026. The catalog lives in `server/sources.js` and `server/source-catalog.js`. Availability changes; run `npm run check:sources` for a current public-feed audit. Reaching a feed does not guarantee its articles are readable or factually correct.
- Broad technology blogs are filtered for AI topics. GitHub sources are restricted to the named project's release feed and release paths, not the entire GitHub domain. The release API must confirm the exact tag, a non-prerelease public release, and its actual publication date. Editing an old release does not make it fresh. DeepMind's official redirects to `blog.google` are permitted.
- Hugging Face community and organization-hosted blog paths are excluded. Hosting on a reputable platform does not verify the author. Publisher policy is checked again before delivery; older noncompliant drafts are withheld on startup.
- HTTPS only, with publisher-specific domain checks on every redirect. No arbitrary web-fetching tool is exposed to the LLM.
- A **72-hour** default freshness window; undated, stale, future-dated, duplicate, and unreadable articles are skipped. Previously rejected stories remain handled, so another scan does not recreate them.
- Scout fetches at most four feeds concurrently, checks publisher news before project releases, and gives different sources a turn. Up to 40 new articles can be tried per round regardless of the requested draft count. Blocked pages no longer exhaust a one-draft search after just four attempts. Scout's conversation and the journal report attempted articles, duplicates, blocked pages and other failures.
- Project-release verification uses the public GitHub API without an account token and is subject to its unauthenticated rate limit. A small ten-minute memory cache reduces repeated requests; publication freshness is always checked again. Rate-limited entries are skipped and recorded, never reconstructed.
- Article text is fetched before drafting. Blocked/paywalled articles are skipped rather than reconstructed from the model's memory.
- Each supporting excerpt is a complete sentence of at most 24 words and is checked against the fetched text.
- Quinn writes a detailed briefing, specific key points, a LinkedIn post with a factual opening and supporting paragraphs, plus a separate concise X post. Both posts link to the original. The short exact excerpt stays in the evidence panel.
- A second local model pass compares the claims with the article. Deterministic checks reject invented links, unsupported numeric strings, invented quoted names, copied first-person publisher voice, long copied passages, accidental language switching, and overlong X posts. Quinn makes at most one corrective rewrite. Unresolved concerns are shown beside a draft marked **Editor flagged details** and require careful CEO review.
- Model review is **not independent verification** and can miss errors or produce false alarms. The boss can correct a flagged draft and approve it. A rewrite keeps the previous version in local storage and clears approval; the interface displays the newest version.
- Manual edits clear approval. Every publishing path requires CEO approval. Legacy automatic-publishing preferences are ignored, and the API refuses enabling them.

**“Source checked” does not mean independently fact-checked.** A primary publisher can make mistakes, exaggerate, or use AI to write an announcement. Butler cannot prove an article is true or human-authored. It does not claim reliable AI-text detection or independent corroboration. Read the original before approval, especially for benchmarks, financial claims, allegations, or consequential news.

News rounds cover curated official announcements. Project assignments can read public HTTPS pages supplied by the owner, but do not search the whole web or independently corroborate claims. Campaigns include a downloadable typographic graphic and a visual production brief; photo generation, paid ad placement and image/video publishing are not implemented.

## Social accounts

In **Office settings → Connect your audience**, save tokens from your own developer applications. Credentials are never passed to the LLM, returned to the browser after saving, or included in activity logs. “Credentials saved” is not a successful authorization test; access is checked at publishing time.

### LinkedIn

Use a LinkedIn developer application with the appropriate product/access tier and OAuth permission: `w_member_social` for a member or `w_organization_social` for an organization with a permitted page role. Supply the user access token and author URN, such as `urn:li:person:YOUR_ID` or `urn:li:organization:YOUR_ID`.

Publishing uses the official `POST /rest/posts` API, not browser automation. The API version defaults to `202603` and is editable because LinkedIn versions expire. Your account must have access to this API; saving a token does not grant that access. See [LinkedIn Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-03) and [OAuth authorization flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow).

### X / Twitter

Use an **OAuth 2.0 user access token**, with `tweet.write`, `tweet.read`, and `users.read` scopes. An application-only bearer token cannot post for a user. Publishing uses `POST https://api.x.com/2/tweets` and validates the standard 280-character weighted limit, including Unicode and shortened URLs.

X API usage can require paid credits. Set spending limits in your developer account. See [X OAuth setup](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code), [create posts](https://docs.x.com/x-api/posts/create-post), and [current pricing](https://docs.x.com/x-api/getting-started/pricing).

For X, configure a native/public OAuth 2.0 app with the exact callback `http://127.0.0.1:4310/api/oauth/x/callback`. Save its public Client ID in Office settings, then choose **Connect with X** from that address. Butler uses PKCE and a short-lived browser-bound state, stores tokens only on the server, and requests `offline.access` alongside the publishing scopes so it can refresh access on demand. Disconnect clears both active and refresh tokens locally; revoke the app at X to remove its provider-side authorization. Manual tokens remain supported but must be replaced when they expire.

For LinkedIn, enable **Share on LinkedIn** and **Sign In with LinkedIn using OpenID Connect** in your developer app. Register `http://127.0.0.1:4310/api/oauth/linkedin/callback`, then save the app Client ID and Client secret in Office settings. **Connect with LinkedIn** requests `openid profile w_member_social`, exchanges the authorization code on the local server, and obtains the personal author ID from LinkedIn’s userinfo endpoint. Tokens and the app secret stay in `.env`; reconnect when LinkedIn access expires. Manual tokens and author URNs remain supported for other approved integrations. Image/video publishing, threads, and scheduled individual posts are not implemented.

### Delivery safety

The app records a receipt independently for each platform. A retry sends only platforms that have not succeeded. If a request times out or its success cannot be determined, it is marked **Check account** and will not be resent automatically. Check the actual account, then record either its post ID or that nothing was published. This also applies after a crash during delivery. No client can guarantee exactly-once delivery when a remote API accepts a request but loses its response.

## Scheduling and local data

News rounds can run manually or every 1, 3, 6, 12, or 24 hours. The scheduler lives in the local server; the computer must be awake and Butler running. After a missed interval it runs one catch-up round. There are no OS background jobs or cloud workers. Scheduled rounds prepare drafts only, and pause when Scout or Quinn is benched or undeployed. Every post still requires CEO approval.

Task history includes employee, status, start/end timestamps, elapsed duration, and outcome. SQLite persists settings, worker deployments and skills, private project briefs, drafts, receipts, tasks, and events in `data/butler.sqlite`. The UI shows the latest 500 tasks/drafts and 150 timeline events; older records remain in the database. Dates are stored in UTC and displayed in your local timezone. Task durations are elapsed wall time, including waiting for a publisher or LLM.

Publishing credentials are stored in the project’s **`.env` file**, as requested. `.env*` and atomic-save temporary files are excluded from Git; `.env.example` contains blank placeholders only. Butler reads only its named credential fields on the server and does not load them into the environment inherited by Ollama. No `.env` variables are exposed by Vite, and credential files are blocked by the local HTTP server. Saved tokens are never returned by the status API, sent to the LLM, or logged.

**`.env` is plaintext, not encryption.** On macOS/Linux Butler restricts it to the current user (`0600`); Windows access depends on your user-folder ACLs. Keep this file and its backups private. Git ignore rules do not protect against manually sharing a file or force-adding it. Existing encrypted-vault credentials are migrated only when an `.env` key is absent; explicitly empty keys mean disconnected. The old encrypted vault is retained for recovery, so protect `data/` as well. Disconnecting clears the active `.env` token; revoke provider access separately when needed.

Use official user OAuth access tokens in `BUTLER_X_ACCESS_TOKEN` and `BUTLER_LINKEDIN_ACCESS_TOKEN`, plus `BUTLER_LINKEDIN_AUTHOR` and `BUTLER_LINKEDIN_VERSION`. Safari login cookies are not API credentials. Each platform needs a developer application with the required publishing access; a saved value alone does not prove the account is connected.

Back up `data/` only when Butler has stopped, keeping the database and any legacy encrypted credentials together. Back up the private `.env` separately. `BUTLER_DATA_DIR` can point to another private local directory. The HTTP server binds only to `127.0.0.1`; it checks hosts, origins, and a custom header on writes. Do not expose it through a public tunnel or reverse proxy. It is a single-user local application, without multi-user authentication.

## Development and checks

```sh
npm run dev      # local API on 4310 + Vite on 5173
npm test         # isolated workflow, API, model-lifecycle, and delivery tests
npm run build    # production frontend
npm run format  # format source files
```

`server/` contains the local SQLite store, source reader, Ollama adapter, agent coordinator, encrypted credential store, and official publishing adapters. `src/game/` contains the Three.js office, character routines and walking routes; `src/OfficeGame.jsx` connects it to real workflow events. The React desk panels hold drafts, preferences and history. The scene caps rendering at about 30 fps, pauses rendering in hidden tabs, and shares geometry to keep the office light on an 8 GB computer. `test/` uses disposable databases and mocked publishing transports: running tests cannot publish to social media. The game and local writing flow have been exercised on this Mac; Windows launch scripts are supplied but have not been tested on a Windows machine. Live publishing still requires validation with your own authorized developer accounts.

Model references: [Qwen3 4B](https://ollama.com/library/qwen3:4b) and [Qwen3 1.7B](https://ollama.com/library/qwen3:1.7b). Memory lifecycle: [Ollama chat API](https://docs.ollama.com/api/chat) and [local-only configuration](https://docs.ollama.com/faq).
