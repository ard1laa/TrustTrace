# TrustTrace Companion Flutter App (iOS & Android)

Cross-platform Flutter mobile client for **TrustTrace: Blockchain-Based Micro-Credential Verification with Social-Link Visualization**, matching the LinkedIn-style Light (`#F4F2EE` / `#FFFFFF` / `#0A66C2`) and Dark (`#0D1117` / `#1B1F23`) colour scheme of the web app.

## Features
- **Role-Specific Sign-Up & 1-Click Demo Login** (`lib/screens/auth_screen.dart`): Register as Student, Recruiter, or University Admin, or use the 1-click Supervisor Demo buttons.
- **Student Soulbound Wallet** (`lib/screens/student_wallet_screen.dart`): Upload & AI-verify certificates, share QR codes, toggle Selective Disclosure, and view progressive-disclosure Cryptographic Proofs.
- **Recruiter QR Verifier** (`lib/screens/qr_verifier_screen.dart`): Scan QR codes using `mobile_scanner` or inspect registered student portfolios.
- **University Admin Portal** (`lib/screens/admin_portal_screen.dart`): Approve queued student uploads or directly issue & mint Soulbound badges.
- **Profile & PDPA Erasure** (`lib/screens/profile_settings_screen.dart`): 3-Way Theme Switcher, Wallet Seed Phrase recovery, configurable `API_BASE_URL`, and 1-click Delete Account & Wipe All Data.

## Running the Flutter App
```bash
cd flutter_app
flutter pub get
flutter run --dart-define=API_BASE_URL=http://localhost:3001/api
```
*(Or point `API_BASE_URL` to your deployed Render / Vercel cloud URL for 24/7 mobile access).*
