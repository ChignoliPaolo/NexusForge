# Delivery validation — October 13, 2026

## Passed

- **51/52 automated tests:** CSV and planning provenance; active diagnosis; stock, deadlines, contradictions and safety holds; source-matched extraction; AMD model discovery; bounded model outputs; service approval/idempotency; real HTTP handlers; SQLite restart/audit tampering; standalone browser-adapter logic; procedural mesh geometry.
- **44/44 synthetic decision-contract checks:** authored cases, twelve seeded perturbations, policy outcomes and cost reconciliation. JSON receipts and reproducible samples are in `evidence/` and `samples/`.
- Standalone build and JavaScript syntax. The offline bundle uses the same evidence/decision/service implementation, not a separately scripted animation.
- Six-slide 16:9 PDF generated from actual app geometry and computed case numbers; preview images visually inspected. Markdown speaker notes supply a transcript.

Provider tests explicitly use mocks. Contract checks share assumptions with the implementation. Neither represents independent scientific validation, field accuracy, provider compatibility or GPU performance.

## Transfer validation

Run `python3 scripts/validate-transfer.py` after creating the archives. Its receipt is `evidence/transfer-validation.json`: archive CRC/hash checks, no plaintext keys/passphrase, exact private `.env` decryption, wrong-password rejection, existing-env preservation, symlink rejection, tamper rejection, and tests/build from restored source. Python is only needed to rerun this development check, not to restore or run the app.

## Blocked or not demonstrated here

| Check | Observed result / boundary |
|---|---|
| `npm start` | Sandbox rejected loopback listening with `EPERM`. Server is **not left running**. |
| Chrome smoke | Chrome exited with `SIGABRT` before rendering. No browser/mobile screenshots or interaction success is claimed. |
| Opening offline HTML automatically | macOS launch service returned no compatible executable (`-10661`) in this environment. Open it manually on the target laptop. |
| AMD inference | Provider unreachable during the real verification attempt; no live success or hardware metrics. |
| Evolus discovery/blocks | Network/DNS failure; actual workspace IDs and contracts still required. No external workflow executed. |
| Docker | Configuration supplied; container not built/run here. |
| Public repo/hosting/video/event form | Not created or submitted. See `SUBMISSION.md`. |

Run `npm start`, `npm run test:browser` and `npm run verify:live` in a normal connected terminal on the target laptop. Complete actual workspace configuration; do not treat a green local test suite as sponsor qualification.

## Production limitations

The server is a single-process, loopback-default prototype with no authenticated operator identities. Audit hashes are locally verifiable, not externally anchored. Model text is untrusted; source validity and physical tests are not independently established. Stock is a simplified single planning field, not an ERP inventory integration. No hardware command or certified safety function exists. Production use requires access control, durable workflow reconciliation, source validation, independent evaluation and qualified plant review.
