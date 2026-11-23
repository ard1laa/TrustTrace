# TrustTrace

Blockchain-anchored co-curricular micro-credentials with skill visualizations.
React web app + Node/Express API + Flutter mobile app, all sharing one API.

- **Credentials:** W3C Verifiable Credentials signed with ECDSA P-256, anchored as ERC-5192 Soulbound Tokens (simulated IBFT ledger, `contracts/TrustTraceSBT.sol`).
- **Certificate scanner:** six automatic checks before minting (layout, recipient name, AI-template content, issuer, file metadata, verdict).
- **Skill maps:** radar chart and force-directed graph whose axes follow the student's field of study (`shared/skillTaxonomy.js`).
- **Offline:** portfolio QR codes carry signed claims, so recruiters can verify them with no connection.

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
2. On the sign-in screen (web or app), tap **TrustTrace v2.1.0** at the bottom 7 times.
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

Open the app once while online. The service worker then caches the app, and IndexedDB keeps the
last dashboard data and the registrar's public key, so the portal opens and QR codes verify
if the Wi-Fi drops.

## Database

MongoDB (via Mongoose) is the primary store when `MONGODB_URI` is set: users, credentials, the
admin approval queue, ledger logs, and registries. The first time the app connects to an empty
cluster, it migrates the local JSON data. Writes are diffed and only changed documents are written.

Keep `REGISTRAR_PRIVATE_SEED` the same across deployments; credentials signed under one seed won't
verify under another.

## Single sign-on

Set `GOOGLE_CLIENT_ID` and/or `APPLE_SERVICE_ID` / `APPLE_BUNDLE_ID` and the buttons appear on web
and mobile automatically. The server verifies provider ID tokens against Google's and Apple's
published keys. Accounts are matched by provider ID, then by email.

Mobile setup:
- **Google (iOS):** set `GOOGLE_IOS_CLIENT_ID`, and add its reversed client ID as a URL scheme in
  `flutter_app/ios/Runner/Info.plist` (`CFBundleURLTypes`).
- **Apple:** enable the *Sign in with Apple* capability for the Runner target in Xcode.

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
npm run test:flutter   # crypto parity, taxonomy, camera crop, small-screen layout checks
```

## Shared data

`shared/skillTaxonomy.js` (fields of study and radar axes) and `shared/emailDomains.js` are the source
of truth. After editing either, run `npm run gen:taxonomy` to regenerate the Dart copies.

## Scanner notes

| Gate | Checks |
| --- | --- |
| 1 Layout | 3D desk/table renders (flat scans and PDFs pass) |
| 2 Recipient | Fuzzy match of the printed name against the account |
| 3 AI template | Known AI-generated template content |
| 4 Issuer & event | Online cross-check: Wikipedia + DNS (no key), plus Brave/Google search if configured |
| 5 Metadata | AI image-generator signatures |
| 6 Tamper forensics | Edited names: multi-quality error level analysis (JPEG ghosts), sensor-noise mismatch, alignment/skew, in-sentence font metrics; PDFs: editor tools, incremental edits, overlaid text boxes |

Strong evidence rejects the certificate; moderate evidence sends it to a registrar ("Needs review").
The scanner also auto-fills the form: title (largest/centred text + event keywords), issuer, date,
type (Competition / Hackathon / Workshop / Seminar) and result ("1st Place", "CGPA 3.85").

- Text positions come from Google Cloud Vision (`GOOGLE_VISION_API_KEY`), the macOS Vision helper
  (`server/ocr/vision_layout`, rebuild with `npm run build:ocr`), or Gemini. Without any of them the
  name-region forensics are skipped and file-level checks still run.
- Gate 1 flags only clearly skewed "certificate on a desk" scenes. Flat scans, PDFs and bordered
  designs pass.
