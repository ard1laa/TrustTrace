# Real certificate samples (private, not committed)

Synthetic samples (`npm run eval:scanner`) prove the scanner behaves as designed.
Only real certificates can tell you how accurate it is in practice. Put your own
samples here — everything in this folder except this README and the example
manifest is git-ignored, so personal certificates never get committed.

1. Copy files here: genuine certificates you trust, and edited copies you made
   yourself (change a name or date in an image editor, save as JPEG).
2. Copy `manifest.example.json` to `manifest.json` and describe each file:
   - `holder` — the account name the upload will be checked against
   - `category` — `genuine`, `forged` or `degraded`
   - `expect` — `verified`, `review`, `inconclusive`, `rejected`, or
     `not-verified` (forged: rejected or review are both a catch)
   - `fields` (optional) — what is printed: `title`, `date` (YYYY-MM-DD),
     `result`, `type` (Competition/Hackathon/Workshop/Seminar/Other), `issuer`
3. Run `npm run eval:scanner -- --real`.

Aim for at least 30 genuine and 30 edited certificates from different issuers
before quoting an accuracy figure.
