#!/usr/bin/env bash
# TrustTrace: start everything on a Mac with one command.
#
#   ./start.sh          API server + website with live reload  (http://localhost:5173)
#   ./start.sh pwa      production build: installable PWA      (http://localhost:3001)
#   ./start.sh check    only run the checks below, start nothing
#
# Stop with Ctrl+C. This script never creates, prints or edits .env.
# The iPhone/iPad app runs in a second terminal; the command is printed below.
set -euo pipefail
cd "$(dirname "$0")"
mode="${1:-dev}"

fail() { printf '\n✖ %s\n\n' "$1" >&2; exit 1; }
ok() { printf '✓ %s\n' "$1"; }
warn() { printf '⚠ %s\n' "$1"; }

case "$mode" in dev | pwa | check) ;; *) fail "Unknown option '$mode'. Use: ./start.sh, ./start.sh pwa or ./start.sh check" ;; esac

# 1. Node.js 18+
command -v node >/dev/null 2>&1 || fail "Node.js is not installed. Install the LTS version from https://nodejs.org, then run ./start.sh again."
node_major=$(node -p 'process.versions.node.split(".")[0]')
[ "$node_major" -ge 18 ] || fail "Node.js $(node -v) is too old. TrustTrace needs version 18 or newer (https://nodejs.org)."
ok "Node.js $(node -v)"

# 2. Settings file (checked, never created or shown)
if [ ! -f .env ]; then
  fail ".env is missing. Create it from the template, then run ./start.sh again:
    cp -n .env.example .env
  (-n never overwrites an existing file.) See README_LOCAL_SETUP.md, step 3."
fi
ok ".env found"

# 3. Packages
if [ ! -d node_modules ]; then
  echo "Installing packages (first run, about a minute)…"
  npm install || fail "npm install failed. Read the error above; README_LOCAL_SETUP.md → Common problems."
fi
ok "npm packages installed"

# 4. Disk space (Xcode and the iOS Simulator need a lot)
free_gb=$(df -g . | awk 'NR==2 {print $4}')
if [ "$free_gb" -lt 10 ]; then
  warn "Only ${free_gb} GB of disk space free. The website is fine, but iPhone builds can fail and an iOS Simulator needs ~10 GB. See README_LOCAL_SETUP.md → Free up disk space."
else
  ok "${free_gb} GB disk space free"
fi

# 5. Google sign-in in the iPhone/iPad app: the URL scheme baked into the app
#    must be GOOGLE_IOS_CLIENT_ID reversed. Compared here; neither value is printed.
ios_id=$(grep -E '^GOOGLE_IOS_CLIENT_ID=' .env | tail -1 | cut -d= -f2- | tr -d "\"' \r" || true)
xc=flutter_app/ios/Flutter/GoogleSignIn.xcconfig
if [ -n "$ios_id" ]; then
  want=$(printf '%s' "$ios_id" | awk -F. '{for (i = NF; i > 0; i--) printf "%s%s", $i, (i > 1 ? "." : "")}')
  have=$( [ -f "$xc" ] && grep -E '^[[:space:]]*GOOGLE_REVERSED_CLIENT_ID' "$xc" | tail -1 | sed -E 's/^[^=]*=[[:space:]]*//' | tr -d ' \r' || true)
  if [ -z "$have" ]; then
    warn "Google sign-in in the iPhone app: $xc is missing. Copy GoogleSignIn.xcconfig.example next to it (README_LOCAL_SETUP.md → Google sign-in on iPhone/iPad)."
  elif [ "$have" != "$want" ]; then
    warn "Google sign-in in the iPhone app: $xc doesn't match GOOGLE_IOS_CLIENT_ID in .env. It must be that ID reversed: com.googleusercontent.apps.<numbers-letters> with no .apps.googleusercontent.com at the end. Fix it, then rebuild the app."
  else
    ok "Google sign-in URL scheme matches GOOGLE_IOS_CLIENT_ID"
  fi
fi

# 6. How to run the iPhone/iPad app against this server
mac_ip=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
echo
echo "iPhone or iPad app: plug the device in by USB, open a SECOND terminal and run"
echo "  cd \"$PWD/flutter_app\""
echo "  flutter devices                       # find the device id (iPhone or iPad)"
if [ -n "$mac_ip" ]; then
  echo "  flutter run -d <device id> --dart-define=API_BASE_URL=http://$mac_ip:3001/api"
else
  echo "  flutter run -d <device id> --dart-define=API_BASE_URL=http://<your Mac's IP>:3001/api   (Wi-Fi is off, so no IP was found)"
fi
echo

case "$mode" in
  check)
    ok "All checks passed. Start with ./start.sh"
    ;;
  dev)
    echo "Starting the API server (port 3001) and website (port 5173). Open http://localhost:5173 — stop with Ctrl+C."
    echo
    exec npm run dev
    ;;
  pwa)
    echo "Building the production website…"
    npm run build || fail "The website build failed. Read the error above."
    echo
    echo "Serving the installable app on http://localhost:3001 — stop with Ctrl+C."
    echo
    exec npm start
    ;;
esac
