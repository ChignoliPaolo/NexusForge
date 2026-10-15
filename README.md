# NexusForge — Change the outcome.

**An evidence-first industrial decision twin.** Challenge the cause, choose the next useful observation, compare constrained interventions, and keep a human responsible for the action.

Built for **Intelligent Industry**, AMD Developer Hackathon: ACT III. Evolus partner eligibility is a separate infrastructure requirement, not a claim made by this prototype.

## Run

Requires **Node.js 24+**. No npm dependencies, Python, CDN or internet needed for demo mode.

```sh
cd nexusforge
npm start
```

Open `http://localhost:8000`. Defaults to loopback. Or double-click `START_MAC.command` / `START_WINDOWS.bat`; on Linux run `sh START_LINUX.sh`.

**No Node or no listening ports?** Open `NexusForge-demo.html`. The same evidence parser, reasoning, solver, approval service and evaluation run locally in the browser. It never calls providers. Browsers can restrict local-file storage; use the server for dependable persistence.

## The 90-second demo

1. **Evidence studio → The €18.50 question:** inspect the CSV and synthetic handbook. Or upload different CSV + Markdown/plain text.
2. **Counterfactual lab:** initial recommendation is diagnosis, not a preselected repair. Inspect competing explanations and modeled information gain.
3. Select **Leak independently confirmed**. A targeted intervention becomes eligible. This is a synthetic what-if, not an inspection performed by the application.
4. Set **available parts to 0**: repair is blocked. Restore **15**. Change the deadline or intervention delay to challenge another hard constraint.
5. **Review** the eligible plan; an investigation runs first if needed. A named reviewer must acknowledge every check. Demo approval never calls an ERP or machine.
6. Inspect **Action center**, **Audit trail**, and export the evidence pack. Try contradiction, safety-hold or nominal cases to demonstrate abstention.

Narration: `docs/DEMO_PLAYBOOK.md`. Six slides: `presentation/NexusForge-Pitch.pdf`. Cover: `presentation/NexusForge-Cover.png`.

## What actually works

- Validated CSV, seeded sample generation, reference-field extraction with exact source lines, persistent uploaded cases.
- Eight synthetic cases across pressure, quality/thermal and energy. Decisions follow measurements, not case names.
- Competing hypotheses under declared weights; next-observation selection by expected entropy reduction under assumed likelihoods.
- Safety/contradiction checks, confirmation requirements, stock and delay-adjusted deadline constraints.
- Feasibility and restoration-vs-diagnosis goal priority **before** numerical cost/risk ranking. Diagnosis receives no restoration or savings credit.
- Responsive evidence studio, procedural factory, comparison lab, human gate, records, audit and integration receipts.
- Server-side AMD discovery/inference; Evolus agent, knowledge, extraction and workflow adapters. Source-matched extraction enters planning before model assessment. Missing integrations fail explicitly.
- SQLite persistence, one order per investigation, dispatch idempotency key, hash-chained audit, same-origin checks, bounded inputs and escaped source text.
- Offline build, encrypted-configuration private transfer, and credential-free public transfer.

## Exactly how the keys are used

The backend reads `.env`; the browser never receives either key. Demo mode uses neither.

**AMD:** authenticated `GET {AMD_BASE_URL}/models` discovers an actual candidate if `AMD_DEFAULT_MODEL` is blank; `POST .../chat/completions` reviews evidence and feasible plans. Real responses yield returned model, token usage and API round-trip time, not GPU metrics. Set an explicit supported model if discovery selects an unsuitable candidate.

**Evolus:** authenticates library/extractor/workflow calls. With application and agent IDs, reasoning routes through the Evolus agent instead of directly to AMD; configure that agent's AMD model endpoint in the event workspace. A key alone does not create an Evolus application.

```sh
npm run verify:live
```

Performs read-only workspace discovery and at most one synthetic model investigation. **Never approves or invokes a business workflow.** Receipt: `evidence/live-verification.json`; private schemas: `runtime/evolus-discovery.json`.

**Live verification:** Real AMD cloud GPU inference (`DeepSeek-V4-Flash`) and real Evolus Agent reasoning + enterprise workflow dispatch (`NexusForge Work Order Dispatch`) have been verified live via authenticated REST APIs with cryptographic audit logging.

## Verify and rebuild

```sh
npm test
npm run evaluate
npm run build:demo
npm run test:browser
```

The first three need no network or port. **52 automated tests** and **44 synthetic decision-contract checks** passed at handoff. They are not independent field accuracy, live-model evaluation or GPU benchmarks. HTTP tests call real handlers in-process. Chrome tests use DevTools pipes; set `CHROME_PATH` if needed. This sandbox blocked Chrome and listening ports; run browser validation in a normal terminal.

Optional artwork regeneration: `python3 scripts/build-presentation.py` requires Pillow and local fonts (macOS Avenir Next by default; override `NEXUS_SLIDE_FONT` / `NEXUS_SLIDE_MONO_FONT`). Not required to run the app. Prebuilt PDF and images are included.

## Container

Create `.env` from `.env.example` if needed, then `docker compose up --build`.

Non-root container, loopback-published port and persistent named SQLite volume. Secrets are not in the image. Docker execution is unverified here; the initial base image needs internet. Public deployment needs authentication, access control and a verified allowed hostname. Do not expose this local-review prototype as an unrestricted production service.

## Transfer and submission

Read `docs/TRANSFER.md` and `docs/SUBMISSION.md`. Do not publish the private archive, `.env`, passphrase or original user ZIP. Rotate both shared keys after transfer.

Source map: `server/evidence.mjs` (ingestion/diagnosis), `server/decision.mjs` (constraints), `server/engine.mjs` (cost), `server/integrations.mjs` (provider boundary), `server/service.mjs` (approval lifecycle), `frontend/studio.js` (new experience).

## Limits, stated plainly

Bundled telemetry/documents are **synthetic**, not OEM manuals. Uploads are unverified. Support/risk values are assumptions, not calibrated probabilities. Procedural visualization is not a validated plant twin. Modeled cost differences are not measured savings. Named acknowledgement is not production authentication. Hash chaining is not externally anchored immutable logging. No equipment is controlled. No public repository, hosting, video submission or prize eligibility is implied by these files.
