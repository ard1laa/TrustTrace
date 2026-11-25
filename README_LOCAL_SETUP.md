# Running TrustTrace on your MacBook Air, iPhone and iPad

This guide matches this repository and your devices (checked 25 Nov 2026). Every command here was run on this Mac.

TrustTrace has three parts:

| Part | Folder | Runs on | Started by |
| --- | --- | --- | --- |
| API server (Node/Express) | `server/` | your Mac, port **3001** | `./start.sh` |
| Website + installable PWA (React/Vite) | `src/` | your Mac, port **5173** (or 3001 for the built PWA) | `./start.sh` |
| Mobile app (Flutter) | `flutter_app/` | your **iPhone** and **iPad** | `flutter run` or a release install, in a second terminal |

Your devices:

| Device | Name | Device id (for `-d`) |
| --- | --- | --- |
| iPhone 13 | miyaw ✌︎ | `00008110-001049D91E38401E` |
| iPad Air (5th gen) | miyaw ♪ | `00008103-001224103CD3C01E` |

Data is kept in `server/data/trusttrace_db.json` (unless `MONGODB_URI` is set). That file holds your real accounts. It's ignored by git; don't delete it.

### Three ways to use TrustTrace on the iPhone/iPad (they are different things)

| | What it is | How you get it | Good for |
| --- | --- | --- | --- |
| **Native app** | The Flutter app in `flutter_app/` | Installed from your Mac (§6) | Camera QR scanning, certificate camera, Google sign-in |
| **Website in Safari** | The React site in a browser tab | Open `http://<Mac IP>:5173` (or `:3001`) | Quick checks; nothing to install |
| **Installed PWA** | The same website, saved to the Home Screen | Safari → Share → **Add to Home Screen** (§8) | Full-screen website with its own icon |

---

## The short version

```bash
# Terminal 1: server + website (leave running; Ctrl+C stops it)
cd ~/Downloads/TrustTrace
./start.sh
# → open http://localhost:5173

# Terminal 2: the app on your iPhone (plugged in by USB; q stops it)
cd ~/Downloads/TrustTrace/flutter_app
flutter run -d 00008110-001049D91E38401E --dart-define=API_BASE_URL=http://$(ipconfig getifaddr en0):3001/api
# iPad: same command with -d 00008103-001224103CD3C01E
```

Everything below explains these commands and fixes what can go wrong.

---

## 1. Software you need (one time)

| Tool | Check with | Needed | This Mac has |
| --- | --- | --- | --- |
| Node.js | `node -v` | 18 or newer | 22.20 ✓ |
| npm | `npm -v` | comes with Node | 10.9 ✓ |
| Xcode | `xcodebuild -version` | for the mobile app | 27.2 ✓ |
| CocoaPods | `pod --version` | for the mobile app | 1.17 ✓ |
| Flutter | `flutter --version` | 3.29 or newer | 3.44 ✓ (3.50.1 available, see §9) |
| VS Code | optional | for editing | — |

You do **not** need Android Studio, MongoDB or Docker. In `flutter doctor`:
- The Android warnings don't matter (this app targets iPhone and iPad).
- The "Unable to get list of installed Simulator runtimes" warning only means no simulator is installed (§7).

**Disk space matters.** Keep at least **10 GB free** (`df -h /`). Xcode silently copies 6–10 GB of debug files the first time each iPhone/iPad is connected, and a release build needs 3–4 GB while it runs. A full disk makes builds fail in confusing ways (§11).

## 2. Open the project and install its packages (one time, and after pulling new code)

Open the project:
- **VS Code:** File → Open Folder… → `Downloads/TrustTrace`. Its built-in terminal (Terminal → New Terminal) already starts in the right folder.
- **Terminal app:** `cd ~/Downloads/TrustTrace`

Install packages:

```bash
cd ~/Downloads/TrustTrace
npm install
cd flutter_app && flutter pub get && cd ..
```

## 3. Settings file `.env` (one time)

There is **one** settings file, `.env`, in the project root. You already have one; never replace it. If it's ever missing:

```bash
cp -n .env.example .env      # -n = never overwrite an existing file
open -e .env                 # edit in TextEdit
```

What the settings mean:

| Setting | Needed? | Secret? | What it does |
| --- | --- | --- | --- |
| `PORT` | keep `3001` | no | API port. The website and app expect 3001. |
| `JWT_SECRET` | **when deployed** | **yes** | Signs sign-in sessions. Use a long random value: `openssl rand -hex 32`. |
| `REGISTRAR_PRIVATE_SEED` | **when deployed** | **yes** | Registrar signing key. Never change it after issuing credentials. |
| `MONGODB_URI` | when deployed | **yes** | Cloud database instead of the local file. |
| `DEVELOPER_ACCESS_KEY`, `DEVELOPER_EMAILS` | optional | yes / private | Unlock demo accounts (tap the version number 7×). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID` | for Google sign-in | no (public IDs) | See §5a and [docs/SOCIAL_SIGN_IN.md](docs/SOCIAL_SIGN_IN.md). |
| `APPLE_SERVICE_ID`, `APPLE_BUNDLE_ID` | for Apple sign-in | no | Needs a paid Apple Developer account; see the doc above. |
| `GOOGLE_VISION_API_KEY` | **when deployed** | **yes** | Certificate text reading on non-Mac servers (§10). |
| `GEMINI_API_KEY`, search keys | optional | **yes** | Extra scanner checks. |
| `EVENT_CROSSCHECK` | optional | no | `off` for offline demos. |

The website and the app have no `.env` of their own; they get their settings from the server. The one exception is the Google URL scheme baked into the app (§5a).

## 4. Start the server and website

```bash
cd ~/Downloads/TrustTrace
./start.sh
```

`start.sh` checks (it never creates, shows or edits `.env`):
- Node 18+;
- that `.env` exists;
- that packages are installed (runs `npm install` if `node_modules` is missing);
- free disk space;
- that the app's Google URL scheme matches `GOOGLE_IOS_CLIENT_ID` (without printing either).

It also prints the exact `flutter run` command with your Mac's current IP, then starts:
- the **API** on <http://localhost:3001/api> (check: `curl http://localhost:3001/api/status` → `"ok":true`);
- the **website** on <http://localhost:5173>.

If either one crashes, both stop and the reason is printed, so a dead server can't hide behind a working website.

| Command | What it does |
| --- | --- |
| `./start.sh check` | Run the checks only. |
| `./start.sh pwa` | Production build + installable PWA on <http://localhost:3001> (§8). |
| `npm run dev` | Same as `./start.sh`, without the checks. |

**Logs** appear in this terminal. **Stop** with **Ctrl+C**. The first certificate scan after a restart can take ~45 s while macOS prepares its text recogniser.

## 5. iPhone and iPad: one-time setup

The app is signed with your free Apple ID team (bundle ID `com.miyadila.trusttrace`). Do this **once per device**:

1. **Developer Mode:** Settings → Privacy & Security → Developer Mode → On. The device restarts; tap **Turn On** and enter your passcode.
2. **Plug it into the Mac with a USB cable** and tap **Trust This Computer** if asked. Keep it unlocked.
3. **Run the app once with `flutter run`** (§6). This also registers a new device with your Apple team; until then a release install fails with "This provisioning profile cannot be installed on this device".
4. On the device:
   - Settings → General → **VPN & Device Management** → *Apple Development: …* → **Trust**.
   - When TrustTrace asks to **find devices on your local network**, tap **Allow**. Without it the app can't reach your Mac.
5. On the Mac, if asked whether Terminal (or VS Code) may **control Xcode**, click **OK** (System Settings → Privacy & Security → **Automation** if you clicked "Don't Allow" before).

### 5a. Google sign-in in the app (already set up on this Mac)

Google sign-in needs two values that must match:
- `GOOGLE_IOS_CLIENT_ID` in `.env` (the **iOS** client from Google Cloud Console), e.g. `123-abc.apps.googleusercontent.com`;
- `flutter_app/ios/Flutter/GoogleSignIn.xcconfig`, containing that ID **reversed**: `GOOGLE_REVERSED_CLIENT_ID = com.googleusercontent.apps.123-abc`.

Run `./start.sh check`: it says ✓ when they match. After changing either one, rebuild the app (§6). The app reads the value at build time. Full setup from scratch: [docs/SOCIAL_SIGN_IN.md](docs/SOCIAL_SIGN_IN.md).

## 6. Run the app on the iPhone or iPad

Keep `./start.sh` running in terminal 1. The device and the Mac must be on the **same Wi-Fi**; the app talks to the server at your Mac's IP (`localhost` on a phone means the phone itself).

### A. While you're developing: `flutter run` (debug mode)

```bash
cd ~/Downloads/TrustTrace/flutter_app
flutter devices        # lists both devices with their ids
flutter run -d 00008110-001049D91E38401E --dart-define=API_BASE_URL=http://$(ipconfig getifaddr en0):3001/api   # iPhone
flutter run -d 00008103-001224103CD3C01E --dart-define=API_BASE_URL=http://$(ipconfig getifaddr en0):3001/api   # iPad
```

- While it runs: **r** = reload after a code change, **R** = restart, **q** = quit.
- **A debug build only works while `flutter run` is connected.** If the cable is unplugged, the Mac sleeps or the connection drops, the next tap closes the app. Opening it from the Home Screen then shows *"In iOS 14+, debug mode Flutter apps can only be launched from Flutter tooling…"*. That isn't a TrustTrace bug; use B for anything you want to keep using.

### B. To use and test the app normally: release install (opens from the Home Screen)

```bash
cd ~/Downloads/TrustTrace/flutter_app
flutter build ios --release --dart-define=API_BASE_URL=http://$(ipconfig getifaddr en0):3001/api
xcrun devicectl device install app --device 00008110-001049D91E38401E build/ios/iphoneos/Runner.app   # iPhone
xcrun devicectl device install app --device 00008103-001224103CD3C01E build/ios/iphoneos/Runner.app   # iPad
```

- One build works for both devices. Installing replaces the app in place (your sign-in is kept, and the developer trust is **not** removed).
- Then tap TrustTrace on the Home Screen. It keeps working without the Mac connected; it only needs the server reachable over Wi-Fi.
- `flutter run --release` builds but then fails to launch with Flutter 3.44 + Xcode 27 ("Could not run build/ios/iphoneos/Runner.app"). Use the two commands above instead.
- If your Mac's IP changes (new Wi-Fi), rebuild and reinstall. The app always uses the address from the latest build, unless you typed a different one on its sign-in screen (server icon) for that build.

**Things that will trip you up:**

| Symptom | Why | Fix |
| --- | --- | --- |
| "debug mode Flutter apps can only be launched from Flutter tooling…" | A debug build was opened without `flutter run` connected. | Use the release install (B), or rerun `flutter run`. |
| App closes as soon as you tap something | Same cause: the debug connection dropped. | Same fix. |
| "This provisioning profile cannot be installed on this device" | A new device isn't registered with your Apple team yet. | Run `flutter run -d <device id>` once with the device plugged in, then install again. |
| "Developer App Certificate is not trusted" / "profile has not been explicitly trusted" | iOS **removes the trust whenever the app is deleted** (including by `flutter install`, which uninstalls first). | Settings → General → VPN & Device Management → Trust. Don't use `flutter install`. |
| The app stops opening after a week | Free Apple ID profiles expire after **7 days**. | Plug in and install again (A or B). A paid account (US$99/yr) gives 1-year profiles. |
| "The Dart VM Service was not discovered after 75 seconds" | Debugging over Wi-Fi needs Local Network permission and is slow on iOS 27. | Use the USB cable, unlock the device, allow Local Network (§5). |
| Stuck at "Installing and launching…" | Flutter is waiting to control Xcode. | Allow it (§5, step 5). |
| "Can't reach the TrustTrace server" / cloud icon with a line through it | Wrong IP, different Wi-Fi, or server not running. | Check terminal 1; rebuild with the current IP. |
| "…Google URL scheme doesn't match the server's GOOGLE_IOS_CLIENT_ID" | `GoogleSignIn.xcconfig` is wrong or missing. | `./start.sh check`, fix as in §5a, rebuild. |
| Google/Apple buttons missing on the sign-in screen | The app couldn't reach the server yet (e.g. just after allowing Local Network). | It retries every 5 seconds by itself; check the server is running. |
| Apple button greyed out with a "Developer note" | `APPLE_BUNDLE_ID` isn't set; Apple sign-in also needs a paid Apple Developer account. | See [docs/SOCIAL_SIGN_IN.md](docs/SOCIAL_SIGN_IN.md). |

Camera QR scanning and the certificate camera need a real device (simulators have no camera). They work on both the iPhone and the iPad, upright or sideways.

## 7. iOS Simulator (optional)

A simulator runtime needs about **10 GB** of free space on top of the 10 GB working margin. Once you have it:

```bash
xcodebuild -downloadPlatform iOS          # or Xcode → Settings → Components → iOS → Get
open -a Simulator
cd ~/Downloads/TrustTrace/flutter_app
flutter run                                # picks the simulator; it can use http://localhost:3001/api
```

`flutter build ios --simulator` works in this project. The simulator is fine for screens, sign-in, the wallet and uploads from Photos, but not for the camera.

## 8. The website and installable PWA on the iPad (or iPhone)

1. On the Mac: `./start.sh pwa`. This builds the site and serves everything on port 3001.
2. On the iPad (same Wi-Fi), open **Safari** and go to `http://<your Mac's IP>:3001`. `./start.sh` prints the IP; it's also `ipconfig getifaddr en0`.
3. To install it: tap the **Share** button → **Add to Home Screen** → **Add**. TrustTrace now has its own icon and opens full screen, without Safari's address bar.

What works over `http://192.168.x.x` (your local network) and what needs HTTPS:

| Feature | Local `http://` | Deployed `https://` |
| --- | --- | --- |
| Sign-in, dashboards, settings, certificate upload, QR **image** upload | ✓ | ✓ |
| Add to Home Screen, full-screen app | ✓ | ✓ |
| **Live camera** QR scanning in the browser | ✗ (Safari only allows the camera on HTTPS) | ✓ |
| Offline mode (service worker) | ✗ | ✓ |

On the Mac, <http://localhost:3001> counts as secure, so Chrome's install icon and offline mode work there (DevTools → Network → Offline → reload shows an amber "can't reach the server" banner).

## 9. Optional: update Flutter

Flutter **3.50.1** (current stable) fixes the Xcode 27 simulator problem at the source. The project works on 3.44 either way.

```bash
flutter upgrade
cd ~/Downloads/TrustTrace/flutter_app && flutter pub get && flutter analyze && flutter test
```

## 10. Deploying (later)

- `render.yaml` (Render) runs the server as one always-on process. It suits TrustTrace best.
- `vercel.json` also exists, but has limits: a 4.5 MB request limit for certificate uploads, no Apple text recognition on Linux, and MongoDB is required.

On **any** Linux host:
- set `GOOGLE_VISION_API_KEY`, or every certificate comes back "Unable to verify" and goes to a registrar;
- set `JWT_SECRET`, `REGISTRAR_PRIVATE_SEED` and `MONGODB_URI`.

## 11. Free up disk space

Check with `df -h /`. These are safe to delete because Xcode/Flutter rebuild them when needed:

```bash
# Xcode build caches (the next build is about a minute slower once)
rm -rf ~/Library/Developer/Xcode/DerivedData
# This app's Flutter build output
cd ~/Downloads/TrustTrace/flutter_app && flutter clean && flutter pub get
# Debug files for iOS versions your devices no longer run (check the names first)
ls ~/Library/Developer/Xcode/iOS\ DeviceSupport/
```

In `iOS DeviceSupport`, only delete folders for an iOS version **none** of your devices runs (both are on 27.2.1 now). The current iPhone and iPad folders (≈7 GB and ≈10 GB) are recreated automatically if deleted, which takes time and the same space again.

## 12. Stopping everything

1. Terminal 2 (`flutter run`): press **q**. A release install keeps working on the device; it just can't reach the server once you stop it.
2. Terminal 1 (server + website): press **Ctrl+C**.
3. If a port is stuck ("already in use"): `lsof -ti tcp:3001 | xargs kill` (and `tcp:5173`).

## 13. Is everything running? (two-minute check)

| Part | How to check | Healthy result |
| --- | --- | --- |
| Settings | `./start.sh check` | All ✓ (a disk warning is OK for the website) |
| API server | `curl http://localhost:3001/api/status` | `"ok":true` |
| Website | open <http://localhost:5173> on the Mac | Sign-in page, no red error |
| Website from the iPad/iPhone | Safari → `http://<Mac IP>:5173` | Same sign-in page |
| Mobile app | open TrustTrace on the device | Google button visible; no crossed-out cloud icon after signing in |

Automated checks:

```bash
cd ~/Downloads/TrustTrace
npm test                     # API tests: sessions, roles, profile, Google/Apple, scanner, QR (~1 min)
npm run build                # production website build
npm run eval:scanner         # scanner accuracy on labelled synthetic samples
cd flutter_app && flutter analyze && flutter test   # includes iPhone and iPad layouts, portrait and landscape
```

## 14. Common problems

| Problem | Fix |
| --- | --- |
| `./start.sh` → "Port 3001 is already in use" | TrustTrace is already running in another terminal, or: `lsof -ti tcp:3001 \| xargs kill`. |
| Website: "Can't reach the TrustTrace server" | Terminal 1 stopped; read its last lines. |
| `zsh: permission denied: ./start.sh` | `chmod +x start.sh` |
| Anything fails with "No space left on device" | Free space (§11), then retry. |
| `flutter run` → CocoaPods error | `cd flutter_app/ios && pod install --repo-update`, then retry. |
| `flutter run` → signing error | Xcode → open `flutter_app/ios/Runner.xcworkspace` → Runner → Signing & Capabilities → pick your Team. |
| Release build: `'Flutter/Flutter.h' file not found` in sign_in_with_apple | Fixed in the Podfile. If it reappears: `cd flutter_app/ios && pod install`, then rebuild. |
| `double-quoted include … in framework header` (Google pods, old error) | Fixed: those Google ML Kit pods are no longer used. If it reappears, run `cd flutter_app && flutter pub get && cd ios && pod install`. |
| Settings / Edit profile showed a blank page | Fixed. If any screen ever fails, you now get a message with Reload instead of a blank page. |
