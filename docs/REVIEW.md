# Original implementation review

The original user-provided ZIP is unchanged outside this folder. It contains credentials; do not publish it as a legacy example.

| Finding | Risk | Change |
|---|---|---|
| Embedded keys and duplicate credential file | Accidental exposure | Environment-only loading; duplicate removed; rotate keys |
| `.env` not loaded by the Python configuration | Hardcoded defaults hide broken setup | Native Node environment loading |
| Unknown faults mapped to a default alarm | Unsupported diagnosis | Explicit scenario validation |
| Graph leaf asserted as true root cause | Topology confused with causal proof | Bounded hypothesis and alternative explanation |
| Fixed manual citation after failed retrieval | Fabricated OEM evidence | Authored synthetic fixtures or validated actual sources |
| Failed provider stages marked complete | False confidence | Explicit per-block statuses and schema validation |
| Successful ERP dispatch without a real call | False execution confirmation | Demo-approved / submitted / unconfirmed states |
| Fixed timestamp, “immutable” audit claim | Misleading accountability | Real timestamps, SQLite, hash chain with limits disclosed |
| API latency treated as GPU telemetry | Unsupported hardware claims | Returned tokens/API timing only |
| Arbitrary order approval, no persisted gate | Duplicate or unsupported actions | Valid investigation/plan, mandatory checks, one order per investigation |
| Wildcard credentialed CORS | Unnecessary exposure | Loopback default and same-origin mutations |
| External fonts and decorative cockpit | Fragile offline demo; weak decision hierarchy | No network dependencies; decision-first UI |

## Architecture choice

Node.js 24 built-ins provide HTTP, SQLite, fetch, environment loading, cryptography, and tests. Native Canvas renders the factory without third-party packages. This is an application-layer rewrite, not backward-compatible Python maintenance.

Retained: industrial dependencies, pneumatic cascade, evidence, human approval, AMD/Evolus boundaries. Removed unsupported claims: verified vision ingestion, actual OEM manuals, invented model names, measured savings, GPU utilization, immutable logging, and guaranteed ERP success.

## Validation boundaries

Version 3 replaces fixed narrative decisions with validated CSV/reference intake, competing hypothesis support, expected-information-gain observation selection, eight challenge cases, and constraints on inventory, confirmation, contradictions, safety holds and delay-adjusted deadlines. Validated Evolus extraction is passed into the solver before model assessment. Diagnostic actions are no longer credited as recovered production. See `docs/VALIDATION.md` for the delivery checks and limits.

Automated tests cover costs, validation, service lifecycle, actual HTTP handlers, mocked provider contracts, persistence, and audit tampering. Mocked responses do not verify live services.

The restricted environment returned `EPERM` when the server attempted to listen on loopback port 8000. Chrome also aborted before browser tests could start. These are reported limitations, not passing launch/browser results. Run both commands from a normal terminal.

External network access failed. Actual AMD/Evolus calls, Docker execution, public hosting, production identity, and industrial safety still require separate verification.
