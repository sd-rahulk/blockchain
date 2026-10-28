# Verification

Validated on Windows with Node.js 24.15.0 and Microsoft Edge through Playwright.

- Production client build: passed.
- API, encryption, authorization, and Solidity integration suite: 12 passed, 0 failed.
- Complete dependency audit: 0 known vulnerabilities at implementation time.
- Browser workflow checks: doctor and patient login, record creation, independent on-chain verification, explorer controls, mobile navigation, patient task creation and completion passed.
- Mobile viewport: 390 × 844; no document-level horizontal overflow.
- Local chain persistence: a previously committed record verified successfully after restarting the application and Anvil.
- Synthetic evaluation data is visibly identified in the workspace. Production startup rejects marked evaluation databases.

The public Sepolia deployment and Docker image execution were not tested in this environment. Sepolia requires an operator key, funded test ETH, and an RPC endpoint. The repository includes an interactive configuration command and a non-root Dockerfile. No independent security audit or clinical compliance certification is claimed.

Re-run `npm test`, `npm run build`, `npm audit`, and, with a seeded local app already running, `npm run check:browser`.
