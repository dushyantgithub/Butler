# Butler — your local AI office

Butler is a company office you run like a game. 115 LEGO-style employees — each with a name, a personality and a role-specific skill set drawn from 501 built-in skills — work on a 3D ring campus inspired by Apple Park: a circular glass building around an orchard courtyard, with your CEO pavilion in the middle. You set up the company once, Butler staffs it, and your team does real work: research, plans, copy, campaigns, analysis, legal checklists and more. Nothing leaves the office — no post, email, purchase or new claim — without your approval.

It runs locally on Mac or Windows as a packaged Electron app or in your browser. The AI engine is local (Qwen through Ollama) by default, with an optional cloud boost using your own Anthropic or OpenAI key. It is not a hosted service.

**Scout, the researcher**, still runs the AI news desk: reads approved publisher feeds, fetches original articles, checks dates and domains, and hands evidence to **Quinn, the social media manager**, who drafts LinkedIn and X posts and publishes only after your approval.

## Desktop app (Mac and Windows)

The Electron app includes Butler, Chromium, Node.js, and a verified Ollama runtime. Users do not need Node, npm, a terminal, a separate Ollama installation, or a launcher shortcut. Open **Butler.app** on Mac or install **Butler** with the Windows installer. Closing the office window quits the app, cancels current work, unloads the model, and stops the Ollama service if Butler started it. Cleanup can take a moment when work is active. A second launch focuses the existing window.

On first use, open **Office settings → Your local engine → Download** to download the selected model (approximately 2.5 GB for Qwen3 4B or 1.4 GB for Qwen3 1.7B). Downloads can be paused and resumed. Model weights are not included in the installer. If Ollama is already running, Butler uses that service and its model storage, and leaves the service running when the app closes.

The app keeps its writable files outside the installation so upgrades do not overwrite the office:

- Mac: `~/Library/Application Support/Butler/`
- Windows: `%APPDATA%/Butler/`
- Within that folder: `data/` holds the database, `.env` holds private credentials, and `runtime/` holds engine logs and downloaded models when Butler starts the bundled engine.

**File → Open Butler data folder** reveals this location. The packaged app starts with a separate office from the source checkout; it does not silently move or bundle your existing projects, credentials, imported skills, or model downloads. With both versions stopped, you can copy the checkout's `data/` directory and `.env` into the app-data folder to transfer your office. Copy optional `agents/` and `skills/` there too if needed. Back up any existing destination office before replacing it.

The server remains private to `127.0.0.1:4310` so existing OAuth callbacks keep working. Stop the browser/terminal version before opening the desktop app. Social sign-in opens your normal browser using a short-lived, one-use handoff and a browser-bound callback cookie. The app picks up the saved connection on its next refresh.

### Native access and future computer features

The isolated renderer gets a narrow `window.butlerDesktop` bridge: native text-file open/save dialogs (2 MB limit), folder selection, reveal app data, account sign-in, and model downloads. File operations act only on files chosen in the OS dialog. Native calls validate the owning window, main frame and local origin; external links allow HTTPS only. The renderer has no Node integration, raw IPC, arbitrary filesystem path API, or command runner. This follows [Electron's security guidance](https://www.electronjs.org/docs/latest/tutorial/security).

Future filesystem and computer automation should add named main-process operations through this bridge. Screen recording, microphone, accessibility and automation permissions are **not granted in advance**; those features are not implemented yet and will require the appropriate OS permissions when added.

### Build and verify desktop packages

Development/building requires Node.js 24 or newer; installed apps do not.

```sh
npm ci
node node_modules/electron/install.js  # only needed if npm blocked Electron's install script
npm run desktop:prepare             # download and verify this platform's Ollama runtime
npm run desktop                     # build frontend and run Electron
npm run test:desktop                # isolated profile; close any running Butler first
npm run desktop:mac                 # Mac .app/.dmg for the build machine architecture
npm run desktop:win                 # Windows x64 installer
```

Outputs go to ignored `release/`. `electron-builder.yml` uses an explicit source allowlist; `.env`, `data/`, `.runtime/`, optional private libraries and local model weights are excluded. Runtime downloads are pinned to Ollama 0.35.0 and verified against the release SHA-256 digests before extraction; licenses travel with the runtime. The Windows distribution is larger because it includes the engine's accelerator libraries.

The **Desktop packages** GitHub Actions workflow builds Apple Silicon, Intel Mac and Windows x64 packages on manual dispatch or a `desktop-v*` tag. Windows ARM is not a configured target. Building Mac installers requires macOS. The pinned NSIS toolset supports Apple Silicon cross-builds. For an unsigned Windows build on Mac, use `npx electron-builder --win --x64 --publish never -c.win.signExecutable=false` after runtime preparation. Test the installer on Windows before distribution.

These are local, **unsigned/unnotarized builds** until signing credentials are configured. macOS Gatekeeper and Windows SmartScreen may warn on distribution. Public releases need an Apple Developer signing/notarization setup and Windows code signing; the workflow does not publish releases or contain signing credentials. No auto-updater is enabled.

## Open the office in a browser

Requires **Node.js 24 or newer**. Download it from [nodejs.org](https://nodejs.org/).

- **Mac:** double-click `Start Butler.command`.
- **Windows:** double-click `Start Butler.bat`.
- Or use a terminal in this project:

```sh
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:4310**. `npm run launch` builds, starts the server, and opens your browser. Keep its terminal open while the office works. Close that terminal window or press Ctrl+C to stop Butler and any local model service it started. During startup or active work, cleanup may take a moment. Closing only the browser tab does not stop the server. If another instance is already running, the launcher asks you to close it first so this window owns the instance it stops.

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

### First run: set up your company

The first launch opens a short questionnaire (9 steps, about three minutes):

1. **You** — your name and a CEO minifig (skin tone, hair, facial hair, glasses).
2. **Company** — name, website, industry, stage, tagline, what the company does, mission.
3. **Products** — one card per product or service: what it does, who it's for, price, link.
4. **Customers & market** — audience, regions, competitors.
5. **Goals** — what Butler should do for you (social, SEO, leads, launch, email, ads, PR, video, research, pricing, fundraising, analytics, engineering, support, legal, operations, hiring, personal productivity, job search, AI news desk), specific needs, channels you use.
6. **Voice, facts & boundaries** — voice tags, confirmed facts, things never to claim, research pages.
7. **House rules** — publishing always needs approval (locked); choose whether outreach, spending and new claims also do; pick a team size.
8. **AI engine** — local, or cloud with your own key.
9. **Meet your team** — Butler recommends people for your goals (department heads included, plus the Legal & Trust head whenever you publish), explains why, and can give each a first task. Untick anyone; hire more later.

Everything is editable any time under **Company**, which also re-plans the team when your goals change. The profile is mirrored into a `company` project that every assignment uses as context.

### Playing the office

- **Campus:** drag to orbit, scroll to zoom, right-drag to pan. Click a studio label to fly there, an employee to open their character sheet, or the pavilion to see what's waiting for you. **Home** returns to the whole campus.
- **Thought bubbles** rotate across the floor and always reflect real state: what someone is working on, what's queued, what they're waiting on you for, or what they could do next with their skills. The 💭 button hides them.
- **Movement means something:** working employees type at their desks (screens light up), queued ones think, employees with a request walk to your pavilion carrying a blue folder and wait there, and free employees take breaks at the café, the Forum, the library or the orchard. Rings under their feet show status: green working, amber queued, blue waiting for you. The folders on your desk show how many decisions are pending.
- **Character sheet:** personality, level (one level per three deliverables), status, queue with cancel, pending requests with inline approve/decline, recent work, skills, and **task ideas** tailored to the role, the company profile and the person's skills — one tap assigns. Or write your own brief. Free employees can be sent on a coffee break or called to your office (visual only).
- **Hire & deploy:** the person-plus button opens the roster drawer; drag someone onto the campus to give them a desk in their studio.
- **Mission:** describe an outcome ("Launch Brewly on LinkedIn next week"). Butler picks the best-fit specialists across studios, writes a brief for each, and shows the plan for you to edit before launching. With the AI engine it can let the Chief of Staff plan; the built-in planner is the fallback.
- **Tabs:** Office, Team (roster, skills, deployment), Work (live queue, deliverable library with Markdown viewer and download, history), Approvals, Company, and More (news desk & posts, journal, projects, job search, news sources, settings).

Movement is a visual layer over real events; publishing success always comes from API receipts. The office starts with nobody deployed and no fake work, drafts or receipts.

## Employees, departments and skills

All 115 employees have a human name, a LEGO look (seven skin tones, fourteen hair styles, glasses, headphones and outfits), two personality traits, a work style, a favourite drink, a hobby and a catchphrase. Names are drawn from many backgrounds and appearance is assigned independently of names. Everything is deterministic, so the same person always looks and sounds the same.

Eight studios, each led by a head:

| Studio | Head | Skill categories the head owns |
| --- | --- | --- |
| Strategy & Research | Head of Strategy & Research | Sales & Funnels, Finance & Pricing, Client & Consulting |
| Marketing & Growth | Head of Marketing | Ads, E-commerce, Email, Events, SEO, Social Media, Community |
| Content & Creative | Creative Director | Content & Copywriting, Branding & Design |
| Data & Insights | Head of Data | Analytics & Data |
| Engineering | CTO | AI & Technology plus a shared technical toolkit |
| Operations | Head of Operations | Operations & Systems, Launch & Growth (customer success), Industry-specific |
| Legal & Trust | Head of Legal & Trust | Legal & Compliance |
| People & Growth | Head of People & Learning | HR & Team, Courses & Education |

**Skills follow roles.** A department head knows every skill in their studio's categories (the Head of Marketing holds all 172 marketing skills). Specialists get a focused set from the categories their role draws on, ranked by relevance to the role — the SEO Strategist gets keyword research, technical SEO, schema, site architecture and so on, the NDA Reviewer gets contract and confidentiality skills. Every one of the 501 skills has at least one owner. **Team → Skills & work** lets you customise any employee; customised lists are kept, default lists update with Butler. Each assignment focuses on up to two relevant skills (three when you pick them).

- **In the office:** has a desk in their studio and can receive work.
- **On the bench:** relaxes in the Talent Lounge; keeps skills and history; cannot receive work.
- **Undeployed:** off campus. Redeploy anytime.

You can't bench someone mid-task: cancel their work or let it finish first.

All employees and skills work without external folders. The built-in capability catalog contains occupational/task names; Butler supplies original specialty instructions and departmental methods — **not embedded copies of purchased prompt bundles**. Instructions describe a specialty; they never grant shell, browsing, account or sending privileges. Job hunter uses its separate, restricted Job search workflow.

Optional local imports can be placed in `agents/subagents/<category>/*.md` and `skills/<category>/<skill>/SKILL.md`; restart to load them. Plain frontmatter names/descriptions and Markdown instructions are supported, not arbitrary YAML execution or tool declarations. These folders are ignored by Git. Only import content you are entitled to use.

## Work, deliverables and approvals

Every assignment goes into a persistent queue. The engine decides how many run at once: **one at a time on the local engine**, up to eight in parallel on the cloud engine (you choose). An employee never works two tasks at once, waiting work survives a restart, and interrupted work rejoins the queue (specialist work has no external side effects). Cancel single tasks from the Work tab or a character sheet; **Stop all work** cancels everything and discards late output.

Each finished task produces a **deliverable** — a complete Markdown document with title, summary, next steps, the skills used and the engine used — in **Work → Library**, downloadable as `.md`. Anyone can be asked to build on a deliverable. Campaign tasks also put LinkedIn/X drafts on the news desk for final approval.

Employees can't publish, send, buy, sign or contact anyone, and are instructed never to claim they did. When work needs an external step or a fact only you can confirm, they file a request in **Approvals**:

- **Verify a fact** — approve and it joins your confirmed facts; decline and it's added to "never claim".
- **Publish** — approve and Quinn (or the author) drafts final posts; you approve those again before anything goes live.
- **Send / contact** — approve to get the final message with Copy and Open-in-Mail buttons. Butler never sends email itself.
- **Spend, legal, other** — your decision is recorded; optionally the employee prepares the execution-ready version and a checklist of what you must do personally.

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

Butler starts a local Ollama service if needed. A service started by Butler exits with Butler. An already-running Ollama service is left running because it may belong to another application. Local model requests always use `127.0.0.1:11434`. A service started by Butler has cloud features disabled, one model slot, and one inference request at a time.

News writing and review use a 4,096-token context; specialist and campaign assignments use 8,192 tokens for project evidence and skills and may use more memory. All passes disable thinking and bound output. Every inference sends `keep_alive: 0`, plus an explicit unload in cleanup. The settings panel checks Ollama's actual loaded-model list. **Weights remain on disk but should not stay in RAM between jobs.** Ollama's small service can still use some memory while the office is open. Other applications using Ollama can load their own models independently.

Turn off **Use the local language model** for a zero-LLM workflow. If Ollama is missing, fails, or produces invalid output, Scout records that event and falls back to a labeled extractive brief. This is a real source excerpt, not simulated LLM output. Basic fallback drafts are held for your review and cannot be automatically published.

## Optional cloud engine

**Company → AI engine** (or **Settings → AI engine**) switches between:

- **Local & private** (default): Qwen through Ollama as described above. One employee writes at a time; the rest wait in the queue.
- **Cloud boost**: your own **Anthropic** (default model `claude-sonnet-5-5`; also `claude-opus-5-5`, `claude-haiku-4-5`) or **OpenAI** (default `gpt-6.1-sol`; also `gpt-6-astra`, `gpt-6-luna`) API key, with 1–8 employees working in parallel. Any model ID can be typed. Keys are saved only in the private `.env` (`BUTLER_ANTHROPIC_API_KEY`, `BUTLER_OPENAI_API_KEY`), are never returned to the browser, logged or sent anywhere except the provider's fixed HTTPS endpoint. Without a key, Butler stays on the local engine and says so.

With cloud on, assignment briefs, your company profile and bounded source excerpts go to the provider you chose, billed to your key. The news desk and campaign checks run on whichever engine is active; every rule about approval and evidence applies unchanged.

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

`server/` contains the local SQLite store, source reader, Ollama adapter and optional cloud engine (`engine.js`), the office coordinator and work queue (`workflow.js`), company profile, staffing, suggestions and missions (`company.js`), encrypted credential store, and official publishing adapters. `shared/roster.js` defines studios, role placement, personalities, looks and thought bubbles for both server and browser. `src/game/` contains the Three.js ring campus (`world.js`), its layout and walking routes (`campus.js`) and the LEGO figures (`employee-figure.js`); `src/OfficeGame.jsx` is the Liquid Glass HUD that connects the campus to real workflow events. The React desk panels hold drafts, preferences and history. The scene renders at about 30 fps (60 while the camera moves), drops to 1 fps behind full-screen pages, pauses in hidden tabs, instances furniture and trees, and merges each figure into eight meshes to keep 115 employees light on an 8 GB computer. `test/` uses disposable databases and mocked publishing transports: running tests cannot publish to social media. The game and local writing flow have been exercised on this Mac; Windows launch scripts are supplied but have not been tested on a Windows machine. Live publishing still requires validation with your own authorized developer accounts.

Model references: [Qwen3 4B](https://ollama.com/library/qwen3:4b) and [Qwen3 1.7B](https://ollama.com/library/qwen3:1.7b). Memory lifecycle: [Ollama chat API](https://docs.ollama.com/api/chat) and [local-only configuration](https://docs.ollama.com/faq).

## Job hunter

Open **Jobs**, deploy **Job hunter**, and upload a PDF, DOCX, or TXT résumé (up to 5 MB; scanned PDFs need OCR before upload). Save target titles, multiple cities/countries/regions, remote/WFH, hybrid or office/WFO arrangements, employment types, exclusions, posting age, and application contact details. Saved salary and eligibility/experience notes are review guidance, not verified eligibility or salary filters. Missing listing details are visible and can be excluded.

**Find matching jobs** reads Remotive's remote feed, the latest three Arbeitnow pages (mostly Europe), and optional Lever employer boards such as the company segment of `https://jobs.lever.co/company-name`. Use `eu:company-name` for an EU board. Each Lever board is capped at 1,000 listings. This is source-limited discovery, not an exhaustive search across the internet. Remotive listings are delayed by 24 hours and cached locally in memory for six hours; other source caches are shorter. Source failures and result counts are shown, and unknown publication dates are flagged. Changing a résumé or preferences requires a fresh search before applying.

Ranking uses saved title/location/work-arrangement filters and résumé skill overlap (common skills are detected when the skills preference is empty). The score is a keyword heuristic, not a hiring prediction. **Review with Qwen** adds a local evidence-based assessment, including gaps and saved salary/eligibility notes. The review receives bounded excerpts of long résumés/descriptions. Search and applications do not require a model; reviews use the existing local Ollama model. There is no cloud/subscription token integration, no credential import from Codex, and no change to other employees' model access.

Select up to 30 matches and click **Apply to selected jobs** to authorize sending your saved details and original résumé to those employers, sequentially. The visible browser adapter uses an installed Google Chrome, Microsoft Edge, or Playwright Chromium browser, in that order. For a development machine without Chrome or Edge, run `npm run setup:jobs-browser` once. Automatic application currently supports recognized Lever-hosted forms. It fills known contact fields, attaches the original résumé, and uses exact saved text/select answers. Unknown required questions, consent choices, CAPTCHA, changed forms, and unsupported sites need your input through the listing link. It does not bypass site challenges. The adapter only allows known provider/browser resources and restricts application writes to the chosen posting and Lever's résumé parsing endpoint.

A submission is marked **Submitted** only after an explicit confirmation on the expected employer posting, or when you explicitly mark a manual application submitted. Missing confirmations become **Check submission**, stop the queue, and cannot retry until you confirm no application was submitted. Restarting never resubmits an in-flight job automatically. Queued items return to review; in-flight items become uncertain. Stop cancels the active browser and leaves remaining items unsubmitted. Success history prevents duplicate submissions to the same normalized listing URL.

The résumé, contact details, preferences, and application history live in separate tables in the existing private local SQLite database, excluded from Git and desktop distribution. They are not included in the general office state, task log, or model prompts for other employees. The database is permission-restricted, not encrypted at rest. **Clear private job data** removes the saved job records; it does not withdraw applications already sent or erase external backups. Job pages are treated as untrusted content, and model prose cannot grant browser actions or invent application facts.

Provider references: [Lever Postings API](https://github.com/lever/postings-api), [Remotive API](https://github.com/remotive-io/remote-jobs-api), [Arbeitnow API](https://www.arbeitnow.com/blog/job-board-api). Employer-side submission APIs require employer credentials, so Butler uses the applicant-facing Lever form rather than asking applicants for employer API keys.

### Additional job portals

Under **Jobs → Where to look → Additional portals**, enable LinkedIn, Indeed, Handshake, ZipRecruiter, Google Jobs, Wonderin.ai, Instahyre, Foundit, Atlassian, and/or Protocoljobs, then save preferences. Existing source choices remain unchanged until you enable these portals.

- **Atlassian:** public careers listings are read directly, including descriptions and locations. An update date is not treated as a publication date. Apply through Atlassian’s hiring site.
- **LinkedIn:** reads public search cards and attempts up to six full descriptions. Summary-only results are flagged. Tracking parameters and regional LinkedIn hosts normalize to the same job ID.
- **Indeed, ZipRecruiter, Foundit:** attempt public HTML/structured listings. If a portal blocks requests or changes its page structure, Butler reports a browser handoff instead of claiming there are no jobs. Foundit uses its India site.
- **Handshake, Google Jobs, Wonderin.ai, Instahyre:** browser searches/account workflows. These are not server-side feeds or automatic-application integrations. Google search links include your selected role and location; account-based portals show the query to enter manually. Wonderin remains a separate service; Butler never enrolls you, uploads your résumé to it, or uses its subscription.
- **Protocoljobs:** enter its exact HTTPS website address in preferences. No domain is assumed. Once configured it works as a browser portal with listing import.

The **Your job portals** panel provides each saved role/location combination. Automatic public searches are limited to the first four combinations per portal per run, with an hour of in-memory caching; all other combinations can be opened in the browser. Atlassian reads up to 2,000 feed records. Browser-only or blocked portals are listed explicitly in source coverage, without fabricated counts or dates.

Use **Import a chosen job into Butler** to paste a specific job URL. **Read listing** extracts public `JobPosting` structured data where available. If a page requires login or does not expose structured details, paste the title, company, location and job description yourself and save it. For Google Jobs, use the original employer listing. Imported jobs participate in local matching, Qwen review, duplicate detection and application tracking, and are re-evaluated on future searches. Jobs outside your preferences remain visible under **All saved jobs**.

These additions do **not** enable automatic submissions on the new portals. Only the existing recognized Lever adapter can submit; other applications are completed on the relevant site and explicitly marked submitted by you. Login cookies, passwords, API keys and subscription credentials are not collected. Public page reads use the same private-network and redirect protections as project research; pasted details never grant browser or model privileges.

Portal references: [Atlassian careers](https://www.atlassian.com/company/careers/all-jobs), [LinkedIn jobs](https://www.linkedin.com/jobs), [Indeed integrations](https://docs.indeed.com/api-guides/), [Handshake](https://joinhandshake.com/find-jobs/), [Google Jobs help](https://support.google.com/websearch/answer/7498276), [Instahyre opportunities](https://help.instahyre.com/en/article/explore-matching-opportunities-1s98q42/), [Wonderin](https://wonderin.ai/).
