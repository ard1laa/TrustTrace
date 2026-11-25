# Google and Apple sign-in: setup

TrustTrace verifies Google and Apple identity tokens itself, checking the signature, issuer, audience and expiry against the providers' published keys. It does not use Firebase or need a client secret. The buttons work as soon as the right client IDs are in `.env`.

## Why you couldn't see the buttons

1. **No client IDs were configured.** `GOOGLE_CLIENT_ID` and `APPLE_SERVICE_ID` are empty in `.env`, so the server reported both providers as disabled. The web and app screens then hid the buttons completely.
2. **On Sign Up, the buttons only appeared on the wizard's last step.** So even a configured server showed nothing on the first screen.

### What changed

- **Development servers** (`NODE_ENV` not `production`) now always show both buttons. Unconfigured ones are greyed out, with a note naming the setting to add.
- **Production** hides a provider until it's configured.
- **Sign In** shows the buttons at the top, with "or sign in with email" below them.
- **Sign Up** shows them on the first step, with "or sign up faster with".

## Security rules

| Situation | What happens |
| --- | --- |
| First time with Google/Apple | No account is created yet. The user picks an account type and completes the normal sign-up steps; email and name are pre-filled and no password is needed. |
| Student | Account is active immediately. |
| Recruiter / university staff | Same rules as email sign-up: a company or university email, or an uploaded ID. The account stays **pending** until a registrar approves it. Choosing a role never grants it. |
| Email already belongs to an account | Refused with "sign in the usual way, then link Google/Apple in Profile → Security → Sign-in methods". This stops anyone who pre-registered (or switched to) your email from sharing your account. |
| Account a registrar created for your email that you haven't claimed yet | Linked automatically (Google/Apple proves you own the email). |
| A Google/Apple account already linked to a different TrustTrace account | Refused. |
| Token for another app, expired, tampered, or with an unverified email | Refused (401/400). |

## The settings

| Setting | Where | Example | Secret? |
| --- | --- | --- | --- |
| `GOOGLE_CLIENT_ID` | `.env` (and on your hosting platform) | `123…-abc.apps.googleusercontent.com` (**Web** client) | No: public identifier |
| `GOOGLE_IOS_CLIENT_ID` | `.env` | `123…-ios.apps.googleusercontent.com` (**iOS** client) | No |
| `GOOGLE_REVERSED_CLIENT_ID` | `flutter_app/ios/Flutter/GoogleSignIn.xcconfig` | `com.googleusercontent.apps.123…-ios` | No |
| `APPLE_SERVICE_ID` | `.env` | `com.yourname.trusttrace.web` (web) | No |
| `APPLE_BUNDLE_ID` | `.env` | `com.yourname.trusttrace` (iPhone app) | No |
| `APPLE_REDIRECT_URI` | `.env` (optional) | `https://your-domain/api/auth/oauth/apple/callback` | No |

None of these are secrets: they end up inside the web page or the app. Still keep them in `.env`, which git ignores, rather than in code. TrustTrace never needs a Google client secret or an Apple private key.

After changing `.env`, restart the server (Ctrl+C, then `npm run dev`).

---

## Google

You need a Google account. It's free.

1. Open <https://console.cloud.google.com/> and create a project (top bar → **New project** → "TrustTrace").
2. **APIs & Services → OAuth consent screen**:
   - Choose **External**.
   - Fill in the app name (TrustTrace), a support email and a developer email.
   - Add the scopes `email`, `profile` and `openid`.
   - While the app is in *Testing*, add your own Google address under **Test users**.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, twice:

   **a. Web application** (website, and the server checks this audience)
   - Authorised JavaScript origins:
     - `http://localhost:5173` (dev website)
     - `http://localhost:3001` (built site served by the API)
     - your real domain later, e.g. `https://trusttrace.onrender.com`
   - Redirect URIs: none needed (the button uses a pop-up).
   - Copy the **Client ID** into `.env` as `GOOGLE_CLIENT_ID=…`.

   **b. iOS** (iPhone app)
   - Bundle ID: the same as the Xcode project, currently `com.miyadila.trusttrace`.
   - Copy the **Client ID** into `.env` as `GOOGLE_IOS_CLIENT_ID=…`.
   - Copy `flutter_app/ios/Flutter/GoogleSignIn.xcconfig.example` to `GoogleSignIn.xcconfig` in the same folder, and set `GOOGLE_REVERSED_CLIENT_ID` to the iOS client ID with its parts reversed: `123-ios.apps.googleusercontent.com` becomes `com.googleusercontent.apps.123-ios`. The `.apps.googleusercontent.com` ending moves to the front and must **not** stay at the end too. Run `./start.sh check` to compare it with `.env`.
   - Rebuild the app (`flutter run`). The value is baked in at build time.
   - Rebuild the app (`flutter run`). Without this file the app shows a clear message instead of crashing, because Google's SDK aborts the app when its URL scheme is missing.

   The Flutter project currently targets iOS only (there is no `android/` folder), so no Android client is needed.

4. Restart the server. **Continue with Google** is now live on the website and in the app.

## Apple

Sign in with Apple requires a **paid Apple Developer Program membership** (US$99/year). A free "Personal Team" can't enable the capability.

1. **Bundle ID.** The project already uses a unique one, `com.miyadila.trusttrace` (Xcode → Runner target → **Signing & Capabilities**). Your team must be a **paid** one: the current free "Personal Team" can't add this capability, and its profiles expire every 7 days.
2. **iPhone app:**
   - In the same **Signing & Capabilities** tab, click **+ Capability → Sign in with Apple**. Xcode creates `Runner.entitlements` and registers the App ID for you.
   - Put the bundle ID in `.env` as `APPLE_BUNDLE_ID=com.miyadila.trusttrace`.
3. **Website** (optional): at <https://developer.apple.com/account> → Certificates, IDs & Profiles:
   - **Identifiers → + → Services IDs**: create, for example, `com.yourname.trusttrace.web`. Enable *Sign in with Apple*, then **Configure**:
     - Primary App ID: the App ID from step 2.
     - Domains: your real domain, e.g. `trusttrace.onrender.com`. Apple does **not** accept `localhost`, so test Apple web sign-in on a deployed HTTPS site.
     - Return URL: `https://your-domain/api/auth/oauth/apple/callback`.
   - In `.env`: `APPLE_SERVICE_ID=com.yourname.trusttrace.web` and `APPLE_REDIRECT_URI=https://your-domain/api/auth/oauth/apple/callback`.
4. Restart the server.

Apple only shares the user's name the first time they authorise the app. TrustTrace keeps it, and asks for it in the sign-up form if it's missing.

## Check it works

1. `curl http://localhost:3001/api/auth/providers` should show `"google":{"enabled":true,…}` and/or `"apple":{"enabled":true,…}`.
2. Website: open <http://localhost:5173/login>. Google's own button and a black Apple button should replace the greyed-out ones.
3. Click **Continue with Google** and pick a test user.
   - A new person lands on "Create your account" with the email filled in.
   - Choose Student, finish the steps, and you arrive in the wallet.
4. Sign out, then **Continue with Google** again: you're signed straight in.
5. iPhone app: Sign In → **Continue with Google / Apple**.
   - Apple sign-in needs a real device or a simulator signed into an Apple ID.
6. Linking an existing account: sign in with email and password → Profile → **Security** → **Sign-in methods** → **Link Google**.

## Troubleshooting

| Message | Fix |
| --- | --- |
| Buttons greyed out with "Developer note: not set up on this server" | Add the client ID(s) to `.env` and restart the server. |
| Google pop-up says "The given client ID is not found" / `origin_mismatch` | The website's address isn't in the Web client's *Authorised JavaScript origins*. |
| "Token was issued for a different app" | The client ID in `.env` doesn't match the one the button used, e.g. the iOS client ID was put in `GOOGLE_CLIENT_ID`. |
| App: "This app build's Google URL scheme doesn't match the server's GOOGLE_IOS_CLIENT_ID" | `GoogleSignIn.xcconfig` is missing or not exactly the reversed iOS client ID (a common slip: `com.googleusercontent.apps.123-ios.apps.googleusercontent.com`). `./start.sh check` says which; fix it and rebuild. |
| App: Google button does nothing useful / "Can't reach the TrustTrace server" | The app gets its Google settings from the server. Check the server is running and the phone uses the right address (rerun the `flutter run` line from `./start.sh`). |
| App: "Sign in with Apple isn't enabled for this app build" | Add the *Sign in with Apple* capability in Xcode (paid membership required). |
| "An account with … already exists" | Sign in with your password, then link Google/Apple from Profile → Security. |
