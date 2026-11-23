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
`npm run db:reset` wipes it back to the two demo accounts:

| Role | Email | Password |
| --- | --- | --- |
| Recruiter | recruiter@company.com | recruiter123 |
| Registrar | registrar@university.edu | admin123 |

New university-admin accounts need `ADMIN_VERIFICATION_CODE` (default `ADMIN-VERIFY-2026`).

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
npm run test:flutter   # crypto parity with the server + small-screen layout checks
```

## Scanner notes

- Name matching (gate 2) needs readable text. It uses the macOS Vision helper
  (`server/crypto/mac_vision_ocr`) when the server runs on a Mac, or Gemini when `GEMINI_API_KEY` is
  set. Without either, it can't read the recipient name and binds the credential to the signed-in
  account instead.
- Gate 1 flags only clearly skewed "certificate on a desk" scenes. Flat scans, PDFs and bordered
  designs pass.
