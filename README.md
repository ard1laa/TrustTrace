# TrustTrace

Blockchain-anchored co-curricular micro-credentials with skill visualizations.
React web app + Node/Express API + Flutter mobile app, all sharing one API.

- **Credentials:** W3C Verifiable Credentials signed with ECDSA P-256, anchored as ERC-5192 Soulbound Tokens (simulated IBFT ledger, `contracts/TrustTraceSBT.sol`).
- **Certificate scanner:** eight checks before minting, with four honest outcomes (verified / needs review / unable to verify / rejected) and a reason for every flag.
- **Skill maps:** radar chart and force-directed graph whose axes follow the student's field of study (`shared/skillTaxonomy.js`).
- **QR verification:** short-link QR codes (`/v/<code>`) that scan from a distance; signatures are checked on the recruiter's device. An Offline QR option works with no connection.

**New here? Follow [README_LOCAL_SETUP.md](README_LOCAL_SETUP.md)** for a step-by-step setup and daily routine (or just run `./start.sh`).
Google/Apple sign-in setup: [docs/SOCIAL_SIGN_IN.md](docs/SOCIAL_SIGN_IN.md).

## Run locally

```bash
npm install
cp .env.example .env          # optional
npm run dev                   # web on :5173, API on :3001
```

Without `MONGODB_URI`, data is stored in `server/data/trusttrace_db.json` (git-ignored).
`npm run db:reset` wipes it back to the two demo accounts.

### Recruiter & university staff accounts

New recruiter and staff accounts start as **pending verification**. They must sign up with a
company / university email, or upload a staff or corporate ID (personal addresses like Gmail need the
ID; disposable inboxes are refused). A verified registrar approves or declines them under
**Account requests** in the registrar portal; the pending screen updates live when they do.

### Developer mode (demo accounts)

The demo accounts are hidden from the sign-in screen and locked in production.

1. Set `DEVELOPER_ACCESS_KEY` (and optionally `DEVELOPER_EMAILS`) in `.env`.
2. On the sign-in screen (web or app), tap the **TrustTrace v…** version label at the bottom 7 times.
3. Enter the key. The two demo accounts appear; tap one to sign in.

Signing in with an address listed in `DEVELOPER_EMAILS` unlocks the same panel without a key. During
`npm run dev` (not production) no key is needed.

| Role | Email | Password |
| --- | --- | --- |
| Recruiter | recruiter@company.com | recruiter123 |
| Registrar | registrar@university.edu | admin123 |

### Exhibition / offline laptop

```bash
npm run build && npm start    # serves the built app and API on :3001
```

The web app is an installable PWA (`vite-plugin-pwa` + Workbox): use the browser's *Install* /
*Add to Home Screen*. Open it once while online. Workbox then precaches the app shell, and IndexedDB
keeps the last dashboard data and the registrar's public key. The portal opens instantly on patchy
Wi-Fi, and Offline QR codes verify with no connection. After a deploy, users get a "New version ·
Refresh" prompt instead of a reload mid-task.

### Sessions

Sign-in returns a 2-hour access token and a 30-day rotating refresh token (`ACCESS_TOKEN_TTL_MINUTES`,
`REFRESH_TOKEN_TTL_DAYS`). Web (`src/lib/api.js`) and mobile (`ApiService`) refresh shortly before
expiry and after any `401 SESSION_EXPIRED`, then retry the request once. If the session can't be
renewed, the app returns to sign-in with "Session expired. Please log in again." Signing out ends the
session on the server. Changing your password signs out your other devices.

### QR codes

QR codes carry only a short link, `https://<host>/v/<code>` (e.g. `/v/4mrb9md7`). That gives a
sparse 29×29 code that scans from a distance. The scanner resolves the code through `/api/verify`,
downloads the signed credentials, and checks each ECDSA signature locally against the issuer DID.
Codes are derived from record IDs (`server/services/shareLinks.js`), so they survive restarts and
need no migration. The share sheet also offers an **Offline QR**, which embeds the signed claims for
recruiters with no connection. Older QR codes still scan.

## Database

MongoDB (via Mongoose) is the primary store when `MONGODB_URI` is set: users, credentials, the
admin approval queue, ledger logs, and registries. The first time the app connects to an empty
cluster, it migrates the local JSON data. Writes are diffed and only changed documents are written.

Keep `REGISTRAR_PRIVATE_SEED` the same across deployments; credentials signed under one seed won't
verify under another.

## Google & Apple sign-in

Full setup: [docs/SOCIAL_SIGN_IN.md](docs/SOCIAL_SIGN_IN.md). In short:
- Set `GOOGLE_CLIENT_ID` (+ `GOOGLE_IOS_CLIENT_ID`) and/or `APPLE_SERVICE_ID` / `APPLE_BUNDLE_ID`. Until you do, development servers show the buttons greyed out with a setup note, and production hides them.
- The server verifies every identity token (signature, issuer, audience, expiry).
- New users choose their account type in the normal sign-up steps. Recruiter and staff roles still need registrar approval.
- An email that already has an account is never linked silently: sign in, then link from Profile → Security.

## Mobile app

```bash
cd flutter_app
flutter run --dart-define=API_BASE_URL=http://<computer-ip>:3001/api
```

The server address can also be changed in the app (Profile → Server connection). The wallet,
portfolio QR and recruiter verification all work offline from the Hive cache. Changes made on the
web appear on mobile immediately via `GET /api/events` (server-sent events).

## Tests

```bash
npm test               # API end-to-end: sessions, roles, Google/Apple (signed test tokens), scanner, QR privacy
npm run eval:scanner   # scanner accuracy on labelled samples (add your own in test-data/scanner/real/)
npm run test:flutter   # crypto parity, taxonomy, session refresh, sign-in buttons, layouts
```

The API tests start their own server with a throwaway data folder, so `server/data/` is never touched.

## Shared data

`shared/skillTaxonomy.js` (fields of study and radar axes) and `shared/emailDomains.js` are the source
of truth. After editing either, run `npm run gen:taxonomy` to regenerate the Dart copies.

## Scanner notes

| # | Check | Can lead to |
| --- | --- | --- |
| 1 | Image quality & readability: resolution, blur, contrast, readable text | Unable to verify |
| 2 | Document layout: photographed at an angle or in a 3D scene (`sceneDetector.js`) | Review |
| 3 | Recipient name vs. the account | Rejected (clearly different), Review (partly matches), Unable to verify (unreadable) |
| 4 | AI-template content (known fake issuers and signatories); a vision model's opinion only triggers review | Rejected / Review |
| 5 | Issuer & event: online cross-check, websites that don't exist | Rejected (known fictional) / Review |
| 6 | File metadata: AI image-generator signatures | Rejected |
| 7 | Tamper forensics on the **name, date and title**: multi-quality error level analysis, sensor-noise mismatch, pasted background patches; name alignment, tilt and in-sentence font size; PDFs: editor tools, incremental edits, overlaid text boxes | Rejected (strong) / Review (moderate) / Unable to verify (name region not analysable) |
| 8 | Consistency & registry: future dates, date vs. title year, same file or certificate number already registered to another student | Rejected (same file) / Review |

Outcomes:
- **Verified** means every check ran and found nothing. It is not proof of authenticity.
- **Review** and **Unable to verify** go to the registrar queue with the reasons listed.
- Changing the auto-filled title, issuer, date or result before submitting also sends it to the registrar, with the edit recorded.
- Scan results travel as an HMAC-signed scan token (24 h), so issuing works after a long pause or a server restart.

Notes:
- Text positions come from Google Cloud Vision (`GOOGLE_VISION_API_KEY`), the macOS Vision helper (`server/ocr/vision_layout`, rebuild with `npm run build:ocr`), or Gemini. Without any of them, region forensics can't run and uploads come back as "Unable to verify automatically".
- On some macOS releases Apple's *accurate* text model is unreliable: it can fail (`e5rtError`) or silently drop whole lines. The helper runs both the accurate and the *fast* recogniser and merges them: accurate lines first (better on script names), with the fast reader filling any lines that were dropped. If accurate fails outright, fast mode is used and remembered for 24 hours.
- Known blind spot: a name pasted on a patch exactly matching its background, in a different font, saved only once, leaves no pixel evidence. The optional Gemini check is the only signal for that case.
