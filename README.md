# CareLedger

A complete React and Node healthcare workspace with role-based doctor and patient portals, encrypted medical records, consent management, care tasks, appointment scheduling, and an append-only Solidity commitment registry. Bright minimal clinical interface, responsive layouts, self-hosted fonts, keyboard-accessible drawers, and a live blockchain explorer.

## Run on this computer

Requires Node.js 24 LTS. In PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

```powershell
Set-Location -LiteralPath 'C:\Users\rahul_welhz6c\OneDrive\Desktop\joker pro\VIT\blockchain'
npm.cmd ci
npm.cmd run seed
npm.cmd run dev
```

Open **http://localhost:5173**. Seed is opt-in, restricted to the local chain, and runs once. The current workspace has already been seeded. Omit the seed command on subsequent starts.

| Local evaluation account | Email                   | Password            |
| ------------------------ | ----------------------- | ------------------- |
| Doctor                   | doctor@careledger.test  | CareLedger!Demo2026 |
| Patient                  | patient@careledger.test | CareLedger!Demo2026 |

All seeded people and clinical notes are synthetic. Development sign-in includes account autofill; production builds omit those controls. Public registration always creates patients. Verified doctors are provisioned by a trusted administrator with `npm.cmd run doctor`; name, email, specialty, and a hidden password are entered interactively. There is no public endpoint that grants a doctor role.

On the first local start, the server generates a unique AES encryption key, lookup HMAC key, and local wallet seed in the ignored `.env` file. Protect and back up this file separately from the database. Losing the encryption key makes stored clinical content unrecoverable. The wallet seed is for local Anvil only and is never a Sepolia wallet.

## Ethereum Sepolia

The requested deployment target is Ethereum Sepolia, chain ID **11155111**. A configured Sepolia RPC and funded operator wallet were not supplied, so public deployment has not been attempted. The runnable evaluation uses Anvil, an actual local EVM, rather than simulated blockchain responses.

Stop the running application before changing networks. Then run:

```powershell
npm.cmd run configure:sepolia
npm.cmd run dev
```

The configuration command asks for an HTTPS Sepolia RPC URL, an operator private key with input hidden, and the application origin. It verifies the chain ID and that the operator has test ETH, then writes local ignored configuration. Never paste keys into application source or commit `.env`. Use a dedicated testnet operator. A startup with a configured RPC deploys the included contract if none is saved for that chain; deployment consumes test ETH. Subsequent starts reuse the saved address. `CONTRACT_ADDRESS` can select a previously deployed contract whose operator matches the configured signer.

Use a new `DATA_DIR` for Sepolia instead of reusing seeded local clinical data. Commitments belong to the network on which they were originally submitted. Changing the network does not migrate or re-anchor previously confirmed records. The deployment configuration defaults to three confirmations. Calls can remain pending while the required confirmation depth is reached; the durable retry worker reconciles them.

The explorer reads actual block headers, transaction hashes, gas usage, height, commitment count, and optional peer telemetry from the RPC. Hosted providers often do not expose peer counts; the interface displays unavailable rather than inventing validators. The connection diagram describes the application-to-contract route. It does not claim to discover the entire Ethereum peer topology.

## Build, test, and serve

```powershell
npm.cmd test
npm.cmd run build
npm.cmd start
```

The built client and API are served together at **http://localhost:3001** in development mode. Tests create an isolated temporary database and local EVM. They exercise encryption authentication, metadata tampering, password hashing, session/CSRF boundaries, role escalation prevention, consent grant/revoke, record verification, idempotent recovery, task assignment, scheduling conflicts, contract permissions, and logout.

`npm.cmd audit` verifies the complete dependency tree. The `tmp` transitive override selects the patched 0.2.7 release. Anvil platform binaries are optional dependencies; each host installs its matching binary. Docker production images omit optional development-chain binaries.

With the seeded development app running and Microsoft Edge installed on Windows, run `npm.cmd run check:browser` for the end-to-end browser checks. On other platforms, install Playwright's Chromium with `npx playwright install chromium` first. The browser checks create explicitly synthetic record/task entries and save screenshots under `artifacts/`. [Verification evidence](artifacts/verification.md) records the checks and deployment limits.

## Data and security model

- Clinical events, account profiles, and email addresses are encrypted using AES-256-GCM. Event ciphertext authenticates its ID, actor, patient, kind, and timestamp as associated data. A keyed email digest supports login lookup without storing plaintext email addresses. Role and relational identifiers remain database metadata.
- Passwords use salted scrypt (`N=32768`, `r=8`, `p=1`). Server sessions store a hash of a 32-byte random cookie, expire after eight hours, and use HTTP-only, SameSite Strict cookies. Production also uses Secure and the `__Host-` cookie prefix. Write requests require a session-bound CSRF token and an exact configured origin in production. Auth endpoints are rate-limited.
- Authorization is enforced on every clinical API. Patients can see their own events. Doctors can see events only for patients with an active grant. Revocation prevents future application access; previously downloaded data cannot be recalled. Doctor directories expose name and specialty, not email addresses.
- Records are append-only. Corrections are authored as new records. Task and appointment transitions create new events. Access changes also generate commitments. Reading and exporting records are recorded in a database access log. That operational read log is not itself blockchain-anchored.
- A SHA-256 digest commits to the encrypted event envelope. Only the opaque, hashed event ID and commitment are published. The contract has no update or delete method; only its deployment operator can anchor an event, and duplicate IDs revert. The backend maintains an encrypted durable outbox in SQLite and serializes anchoring operations. A failed submission remains visibly pending and is retried every ten seconds. Verification independently compares the local envelope and on-chain mapping.
- The contract prevents modification of a submitted commitment. It does not prove that a clinician's original statement was accurate, prevent an authorized clinician from writing an incorrect new record, or make encrypted off-chain storage immune to deletion. Chain finality depends on the connected network and confirmation policy. Backups and access controls remain essential.
- The application is designed for a single API writer using a persistent SQLite volume. Use one replica with this release. A multi-writer deployment needs a transactional shared database and coordinated outbox workers.

## Production deployment

The Dockerfile builds a static React client and serves it with the API as a non-root Node process. Configure a persistent writable `/app/data` volume and an HTTPS reverse proxy. Set these runtime environment variables through your deployment secret store:

| Variable               | Requirement                                                            |
| ---------------------- | ---------------------------------------------------------------------- |
| `NODE_ENV`             | `production`                                                           |
| `APP_ORIGIN`           | Exact public HTTPS origin, without trailing slash                      |
| `DATA_KEY`             | 32 cryptographically random bytes encoded as 64 hexadecimal characters |
| `LOOKUP_KEY`           | Separate 32-byte random hexadecimal secret                             |
| `CHAIN_SEED`           | Separate 32-byte random hexadecimal secret; only used in local mode    |
| `RPC_URL`              | HTTPS Sepolia JSON-RPC endpoint                                        |
| `OPERATOR_PRIVATE_KEY` | Dedicated funded Sepolia operator key                                  |
| `CHAIN_ID`             | `11155111`                                                             |
| `CHAIN_CONFIRMATIONS`  | Positive integer; default three in production                          |
| `CONTRACT_ADDRESS`     | Optional existing registry address; omit for automatic deployment      |
| `DATA_DIR`             | Persistent storage directory; defaults to `/app/data` in the image     |
| `HOST` / `PORT`        | Image defaults to `0.0.0.0` / `3001`                                   |
| `TRUST_PROXY`          | Set to `1` only behind exactly one trusted reverse proxy               |

Build with `docker build -t careledger .`. Provision the secrets and persistent volume through the deployment platform before starting the image. Use `npm run doctor` inside an interactive administrative container sharing that volume to provision real verified clinicians. Health checks call `/api/health`; monitoring should also check RPC availability, pending outbox age, disk space, key backups, and contract operator balance.

Do not use seeded local accounts or real medical data on a testnet evaluation. Real clinical deployment requires your organization's security review, jurisdiction-specific privacy assessment, operational incident/recovery procedures, identity verification, and a reviewed key-management strategy. This implementation does not claim healthcare certification, HIPAA compliance, or a completed external audit. Password reset, MFA, and clinician identity verification are operational integrations to establish before clinical release, not silently simulated workflows.

## Project paths

Workspace: `C:\Users\rahul_welhz6c\OneDrive\Desktop\joker pro\VIT\blockchain`

| File                            | Purpose                                                              |
| ------------------------------- | -------------------------------------------------------------------- |
| `src/main.jsx`                  | Doctor/patient workspaces, forms, verification panels, live explorer |
| `src/styles.css`                | Responsive clinical visual system and reduced-motion support         |
| `server/app.mjs`                | Validated authenticated API, role and consent boundaries             |
| `server/security.mjs`           | Encryption, password hashing, and secure token helpers               |
| `server/db.mjs`                 | SQLite schema, encrypted events, and authorization queries           |
| `server/chain.mjs`              | Contract compilation/deployment, anchoring, recovery, verification   |
| `server/local-chain.mjs`        | Local Anvil lifecycle and persisted chain state                      |
| `contracts/CareLedger.sol`      | Append-only medical event commitment registry                        |
| `tests/security.test.mjs`       | Real API, cryptography, and contract tests                           |
| `scripts/configure-sepolia.mjs` | Interactive Sepolia setup with hidden key input                      |
| `Dockerfile`                    | Non-root production container                                        |

Design decisions are recorded in `PRODUCT.md` and `DESIGN.md`. Screenshots of the evaluated desktop, mobile, and network views are in `artifacts/`.
