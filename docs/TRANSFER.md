# Mail-safe transfer

## Files in the top-level deliverables folder

- `NexusForge-PRIVATE-mailsafe.zip`: full project and PDF plus **encrypted** `.env`, including both supplied API keys.
- `NexusForge-PUBLIC-mailsafe.zip`: same project/PDF, no credentials or encrypted private configuration. Suitable as source transfer after your final review; not a substitute for the required public repository.
- `TRANSFER_PASSWORD.txt`: separate private passphrase. **Do not attach it to the same email as the private ZIP.** Send it through a different secure channel.
- `SHA256SUMS.txt`: archive integrity hashes. Hashes detect accidental change, not authenticity against an attacker who replaces both archive and hashes.

No source file embeds keys. The private configuration uses AES-256-GCM with a randomly generated passphrase and scrypt-derived key. Decryption happens locally. Rotate the shared credentials after transfer; encryption cannot undo earlier exposure in chat/original files.

## Second laptop

1. Extract the whole ZIP into a new local folder.
2. The pitch PDF is immediately readable in `PRESENTATION/`.
3. Install Node.js 24+ if not already present. No `npm install` is required.
4. Show file extensions. Rename `RESTORE.cjs.txt` to `RESTORE.cjs`.
5. Open a terminal in the extracted folder and run `node RESTORE.cjs`.
6. For the private variant, enter the separately received passphrase. Enter without a passphrase skips credentials and uses `.env.example` for demo-only operation.
7. Run `cd nexusforge`, `npm test`, then `npm start`. Open `http://localhost:8000`.
8. Follow `START_HERE.md` and test the full interaction. On the connected laptop run `npm run verify:live`; real Evolus setup is still required.

The restorer verifies every payload file against SHA-256 before writing. It refuses modified destination files. Use `node RESTORE.cjs --dest=/another/new/folder` for a fresh restore. It preserves an existing `.env`; private configuration is then placed in `.env.transfer` for manual review.

## Offline fallback

Restore normally and open `nexusforge/NexusForge-demo.html`. Alternatively, **copy** `payload/NexusForge-demo.html.txt` to a file named `NexusForge-demo.html` and open it. Keep the original payload in place if you will restore later: removing/renaming a payload breaks its integrity check.

The PDF, generated samples and offline app require no network. Live API calls require network, a working key, model access and actual workspace IDs/contracts; credentials alone cannot provision those prerequisites.

## Rebuild on the development laptop

Run `npm test`, `npm run evaluate`, `npm run build:demo`, optionally regenerate the PDF, then `npm run package:transfer`. It generates a **new passphrase** each time. Do not mix archives and passphrases from different builds. The source scanner refuses to package plaintext supplied keys in other files.

The `.txt` payload convention avoids directly attaching executable source. Some email systems still reject ZIPs; mail-safe naming is not a delivery guarantee. Do not disguise the private archive as public or publish the original archive, which may contain plaintext credentials.
