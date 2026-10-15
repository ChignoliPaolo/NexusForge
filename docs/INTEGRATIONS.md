# Live integration guide

## Verification status

The private archive encrypts the supplied API keys and base URLs, but there are no confirmed Evolus workspace/agent IDs or building-block paths. Provider DNS/network access failed here. **Actual provider compatibility and AMD GPU execution remain unverified.** Configuration presence is not connection success.

Base URLs and headers below come from the local hackathon brief. Verify schemas inside your Evolus workspace. The application deliberately does not invent a model ID or a workspace path.

Rotate both original keys: they were embedded in source and duplicated in a text file. Those copies were removed; the private `.env` is untouched. Do not publish it or the original ZIP. The standalone build never reads secrets.

## AMD

Set `AMD_API_KEY` and `AMD_BASE_URL` (including `/v1` where required) to the actual approved service. `AMD_DEFAULT_MODEL` may be blank: authenticated `GET {AMD_BASE_URL}/models` discovers and caches an actual returned chat-model candidate. Discovery does not prove chat capability; set an explicit available model if necessary. No model ID is invented.

Run `npm run verify:live` on the connected laptop. It discovers Evolus MCP tool schemas using read-only catalog calls, then performs at most one synthetic live investigation if a model is available. It never approves a work order or executes a business workflow. Receipts are written to `evidence/live-verification.json`; private workspace/schema details go to `runtime/evolus-discovery.json`. `npm run verify:live -- --save-discovered-model` saves a discovered model only after successful inference.

```text
POST {AMD_BASE_URL}/chat/completions
Authorization: Bearer {AMD_API_KEY}
```

Requests use system/user messages, temperature 0.15, and normally a 650-token output cap. For the documented Radeon shared host, JSON-object mode is requested; Qwen3.6/GLM-5 models also receive low reasoning effort and a 2,048-token cap because reasoning can consume the output budget. These host-specific parameters are not imposed on an unknown Evolus or custom deployment. The adapter expects `choices[0].message.content`, optional `usage`, and this model JSON:

```json
{
  "hypothesis": "A bounded, evidence-based hypothesis.",
  "rationale": "Why this candidate plan merits review.",
  "uncertainty": "What a qualified technician must still verify.",
  "evidenceIds": ["OBS-01", "REF-01"],
  "recommendedPlanId": "inspect",
  "nextObservationId": "leak"
}
```

Plan/source IDs must exist, the plan must be feasible, and any next-observation ID must identify a real candidate. Invalid JSON, empty uncertainty, blocked actions and invented references fail validation. Text is escaped. The model cannot alter costs or approve execution. Its proposal is distinct from the **computed** choice, which applies feasibility and goal priority before numerical ranking.

Timing is client-observed API round-trip, not GPU kernel time. Tokens/second, when present, divides returned completion tokens by full round-trip duration, not steady-state decoding time. GPU model and utilization are not inferred.

Endpoint reference checked against the AMD Radeon Cloud documentation: `https://amd-aim.github.io/radeon-cloud-docs/quickstart/`, `https://amd-aim.github.io/radeon-cloud-docs/api/chat-completions/`, and `https://amd-aim.github.io/radeon-cloud-docs/api/models/`. This confirms the documented request shape, **not** successful authentication or inference with this project's key.

## Evolus main agent

Set `EVOLUS_API_KEY`, `EVOLUS_APPLICATION_ID`, and `EVOLUS_AGENT_ID`; connect your AMD-hosted model in the event workspace. With these values present, the agent call uses:

```text
POST https://api.evolus.ai/v1/chat/completions
Authorization: Bearer {EVOLUS_API_KEY}
model: {EVOLUS_APPLICATION_ID}:{EVOLUS_AGENT_ID}
```

Without those agent settings, live reasoning calls AMD directly. Neither route proves Evolus track eligibility until the workspace and actual AMD-hosted model are verified.

## Building-block contracts

Configure verified relative paths from the interactive API reference, or a workspace-side workflow wrapper matching these contracts. Alternatively adapt `server/integrations.mjs` to the actual schema. **The following payloads are application contracts, not asserted official Evolus API schemas.**

Requests use `X-ApiKey`, `X-Application-Id`, and JSON content type at `EVOLUS_BASE_URL` plus the configured path. Cross-origin paths and redirects are rejected.

### Knowledge: `EVOLUS_KNOWLEDGE_PATH`

Input: `{"query":"Scenario hypothesis","scenario_id":"pressure"}`.

Required response:

```json
{"results":[{"title":"Actual document", "text":"Retrieved passage", "section":"Actual section/page"}]}
```

`sources` may replace `results`. Valid sources receive `LIVE-*` IDs and join the explicitly synthetic local evidence. Empty/malformed results do not generate invented citations.

### Extraction: `EVOLUS_EXTRACTOR_PATH`

Input contains `text` with serialized incident/evidence, and `schema` describing `scenario_id`, `asset_id`, `summary` and typed `planning_fields`.

Required response:

```json
{
  "data": {
    "scenario_id": "pressure",
    "asset_id": "pressure",
    "summary": "Values extracted from the supplied source record.",
    "planning_fields": {
      "stock_on_hand": 15,
      "part_lead_minutes": 180,
      "repair_minutes": 28,
      "downtime_eur_per_minute": 48,
      "production_deadline_minutes": 90
    }
  }
}
```

Scenario, asset and every extracted planning value must match the source record exactly; unknown fields or changed values fail closed. Top-level fields are also accepted. Validated values enter the constrained solver **before** the main model receives plans. The example is the synthetic pressure case, not a constant response template: changed source values must produce changed extraction. This is structured-text extraction; PDF/image parsing is not claimed. Markdown/plain text documents are accepted; arbitrary prose without typed fields is context only and uses disclosed conservative defaults.

### Workflow: `EVOLUS_WORKFLOW_PATH`

Input contains the recorded work order, plan, reviewer acknowledgement, timestamp, mode, and `idempotency_key`. The receiving workflow must deduplicate that key. Use a sandbox ticket destination, not real procurement or equipment controls.

Non-2xx responses, `success:false`, `error`, and failed/error/rejected statuses fail. Accepted JSON becomes **submitted**, not completed. A timeout becomes **dispatch_unconfirmed**: the remote side may already have accepted it. There is no automatic retry. Repeated local approval returns the existing order; inspect the remote workspace before reconciliation.

Live dispatch requires validated knowledge and extraction results and explicit approval. Neither a configured workflow nor an LLM can bypass that gate.

## General AMD eligibility versus Evolus partner eligibility

The supplied dashboard explicitly accepts the AMD Token Factory API for the main event, provided AMD does meaningful work in the demonstrated product. A local rule engine alone does not satisfy this. The separate **Evolus prize** requires your **own AMD Developer Cloud vLLM endpoint**, an open model, event workspace and at least two real building blocks. Connecting only a Token Factory key does not establish that additional eligibility. Confirm any rule updates with organizers.

## Before the Evolus prize submission

- [ ] Own AMD Developer Cloud instance, open model, vLLM deployment evidence.
- [ ] Evolus event workspace connected to that AMD model.
- [ ] At least two actual building-block calls visible in workspace usage.
- [ ] Knowledge/extraction response contracts validated.
- [ ] Main agent uses existing evidence IDs and an actual candidate plan.
- [ ] Human-approved workflow creates a sandbox ticket exactly once.
- [ ] Failures visibly stay unavailable/unconfirmed.
- [ ] Actual inference and workflow receipts exported with secrets redacted.
- [ ] Organizer rules and deadline confirmed.

Offline mocked tests prove none of the infrastructure requirements by themselves.

## Hosting and numerical details

The local server accepts `localhost`, `127.0.0.1`, and `[::1]` Host headers to reduce DNS-rebinding exposure. A deliberately configured reverse proxy needs its exact hostname in `NEXUS_ALLOWED_HOSTS` (comma-separated); this is not a substitute for authentication. Keep the demo private by default.

Delay is a declared what-if assumption: targeted plans accrue 1.35 extra interruption minutes per minute of delay; other plans accrue 1. Scrap increases by floor(delay × 0.3) units, and assumed risk increases by delay × 0.002, capped at 0.95. These coefficients are illustrative, not fitted to industrial data. Sensitivity half-width is cost × (0.12 + risk × 0.2). The recovery-chart shape is schematic and is not used as evidence for the cost calculation.
