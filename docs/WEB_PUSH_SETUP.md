# Web push reminders — setup for Sean (D-28)

Owner: Sean Balsiger · Version 2 · Updated 2026-10-14 · Decision [D-28](DECISIONS.md)

**Status: built and tested locally, nothing switched on.** The code is on `main` once its pull request merges. The migration is **not applied** to the hosted project, `gtl-push-reminders` is **not deployed**, `gtl-api` does not yet carry the push routes, no VAPID key exists and no cron job is registered. Until you finish the steps below, nobody can turn reminders on. **Push guard (redesign stage 2, October 14):** `/community/read` carries `pushConfigured`, true only when `gtl-api` holds a valid `VAPID_PUBLIC_KEY` (the key itself is never in that reply). While it is false the picks-due card and Settings & setup show no reminder control at all, so nobody meets a "Remind me" button that fails.

## What it does

- **One reminder, web push only.** A player whose Spread or Total ballot for the open week is neither submitted nor sat out (D-23) gets one notification 2 hours before that week's deadline (TNF kickoff, D-24). No email, no SMS, no line-movement alerts.
- **Text on the lock screen:** `Week 6 picks are due 5:15 PM PT. Spread still open.` (or `Total`, or `Spread and Total`; D-39: "due", not "lock"). It never shows a pick, a line, a score or another player. Tapping it opens the app at the Picks screen (`/#picks`).
- **Opt-in per device.** Settings & setup → **Pick reminders**, next to Install app, or the one line **Remind me 2 hours before picks lock** on the Community picks-due card. Nothing is registered and nothing is sent to the server until the player taps it. **Turn off reminders** unsubscribes the device, deletes its server row and unregisters the service worker.
- **At most once.** Each reminder is written to `gtl_push_reminders_sent` (player, season, week, mode, kind) before it is sent, so a retry or an overlapping run never sends it twice. A push service answer of 404/410 removes the dead subscription; five failures in a row disable it.
- **iPhone and iPad:** iOS 16.4 or later, and only from the Home Screen app (Safari → Share → Add to Home Screen, then open Guess The Line from the Home Screen). In a Safari tab the app explains this instead of offering the button.

## Pieces

| Piece | Where | Notes |
|---|---|---|
| Service worker | `web/public/sw.js` | `push` and `notificationclick` only. No fetch handler, no cache. Registered only on opt-in; served with `Cache-Control: no-cache` |
| CSP | `web/public/_headers`, `server/index.mjs` | `worker-src 'self'` added; nothing else changed |
| Opt-in UI | `web/src/PushReminders.jsx`, `web/src/webPush.js` | Settings panel and picks-due line |
| Storage | migration `20261013030000_gtl_web_push_reminders.sql` | `gtl_push_subscriptions`, `gtl_push_reminders_sent`, `gtl_push_reminder_schedule` (row disabled by default), `gtl_push_reminder_runs`. RLS on, no browser grants, every function security invoker and service-only |
| API | `gtl-api`: `POST /push/status`, `/push/subscribe`, `/push/unsubscribe` | Signed-in and email-confirmed like every other route; endpoint must be https on a known push service (FCM, Mozilla, Windows, Apple); keys and sizes checked in the handler and again in SQL; at most 10 devices per player |
| Sender | Edge Function `gtl-push-reminders` → `cloud/push-reminders.mjs`, `cloud/web-push.mjs` | D-24 pattern: pg_cron → one-run capability → claim in SQL. VAPID (ES256) and aes128gcm encryption with WebCrypto, no extra dependency. Reads `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` from Edge Function secrets at run time |
| Cron | `supabase/admin/web_push_reminders_cron.sql` | Not a migration. Every 15 minutes; outside the 2-hour window the dispatcher writes nothing and calls nothing |

## Sean's steps, in order

Do these from the Mac mini on an up-to-date `main` (`git pull && npm ci`). Never run `npx supabase db push` as-is against this project (see step 2 of the [release checklist](SOCIAL_COMMUNITY.md#release-checklist--october-9-2026)).

1. **Generate the VAPID keys on your machine.**
   ```sh
   npx web-push generate-vapid-keys
   ```
   It prints a Public Key and a Private Key. Keep the private key out of the repo, chat, tickets and screenshots. Save both in your password manager. If the private key is ever exposed, generate a new pair and repeat steps 2 and 7: every device then has to turn reminders on again.

2. **Set the three Edge Function secrets yourself** in the Supabase dashboard → project `onmrgvcehkflfaizvedl` → Edge Functions → Secrets (Manage secrets):
   - `VAPID_PUBLIC_KEY` = the Public Key
   - `VAPID_PRIVATE_KEY` = the Private Key
   - `VAPID_SUBJECT` = `mailto:` followed by an address you read (an `https://` URL also works). Push services use it to contact the sender.

   Both functions read them at run time: `gtl-api` hands the public key to the browser; `gtl-push-reminders` signs with the private key.

   `VAPID_PUBLIC_KEY` is also the switch for the reminder controls (push guard): once `gtl-api` reads a valid one, the picks-due card and Settings & setup offer "Remind me". To keep them hidden until steps 3 to 6 are done, set `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` now and `VAPID_PUBLIC_KEY` after step 6.

3. **Apply the migration** through the Supabase MCP (`apply_migration`, name `gtl_web_push_reminders`, with the contents of `supabase/migrations/20261013030000_gtl_web_push_reminders.sql`) or paste it into the SQL editor. Apply files in repo order: it is numbered after the D-27 file `20261012230000_gtl_submit_with_line_at_guess.sql` and the other October 12–13 files, so apply those first. It reads only a ballot's `submittedAt`, the D-23 opt-outs and the published slate, and changes none of them. The hosted version will differ from the filename; add it to the two `migration repair` lists in the release checklist.

4. **Deploy both functions.**
   ```sh
   npx supabase functions deploy gtl-api
   npx supabase functions deploy gtl-push-reminders
   ```
   `supabase/config.toml` keeps `verify_jwt = true` for `gtl-api` and sets `verify_jwt = false` for `gtl-push-reminders` (its one-run capability is checked in SQL, like `gtl-week-open`).

5. **Deploy the frontend** (adds `sw.js`, the CSP change and the opt-in UI):
   ```sh
   npm run build:cloud
   npm run check:cloud
   npm run cloudflare -- pages deploy .local/cloud-dist --project-name guess-the-line --branch main --commit-dirty=true
   ```
   `check:cloud` and `node scripts/check-cloud-boundary.mjs` now also probe the four push tables, the eight push RPCs, the three `/push/*` routes and `gtl-push-reminders`; they report `unexpected 404` until steps 3 and 4 are done.

6. **Register the cron job with the schedule row disabled.** Open `supabase/admin/web_push_reminders_cron.sql`, replace `<project-ref>` with `onmrgvcehkflfaizvedl`, and run its steps 1–3 in the SQL editor. The dry run must return `{"status":"disabled"}`.

7. **Test on your iPhone before enabling for everyone.**
   1. iOS 16.4 or later. In Safari open https://guess-the-line.pages.dev, Share → **Add to Home Screen**, then open Guess The Line from the Home Screen and sign in.
   2. Settings & setup → Pick reminders → **Remind me 2 hours before picks lock** → Allow. The panel says "This device: On". Check the row exists (counts only): `select count(*) from public.gtl_push_subscriptions;`
   3. Trigger a test send during a real window, or make one: leave one of your ballots unsubmitted, enable the schedule row (`update public.gtl_push_reminder_schedule set enabled=true where id='deadline-2h';`) and, inside the two hours before the deadline, run `select public.gtl_dispatch_push_reminders();`. It returns `queued`; within a minute the phone shows the reminder. Outside the window it returns `{"status":"not_due"}` and sends nothing.
   4. Check the run: `select slot_start,status,reason,sent,failed from public.gtl_push_reminder_runs order by slot_start desc limit 5;` (`succeeded` with `sent` ≥ 1, or a named `skipped`/`failed` reason). A second dispatch in the same window sends nothing: the sent log already has your row.
   5. Tap the notification: the app opens at the Picks screen.

   To repeat the test for the same week you would have to delete your row from `gtl_push_reminders_sent`; it is append-only for the service role, so that needs the SQL editor (postgres). Prefer waiting for the next week.

8. **Enable it** (if you did not in step 7): `update public.gtl_push_reminder_schedule set enabled=true where id='deadline-2h';`

## Turning it off

- **One device:** Settings & setup → Pick reminders → **Turn off reminders**. Also: removing the Home Screen app or blocking notifications for the site stops delivery; the next send gets 404/410 and deletes the row.
- **Everyone, keep the data:** `update public.gtl_push_reminder_schedule set enabled=false where id='deadline-2h';`
- **Remove the job:** `select cron.unschedule('gtl-push-reminders-15m');`
- **Rotate keys:** new pair (step 1), replace the secrets (step 2); old subscriptions fail with 401/403 and are disabled after five failures, so players turn reminders on again.

## What is verified and what is not

Verified locally on October 12, 2026 (no hosted project touched): unit tests for due-player selection (incomplete, submitted, sat out, already reminded, not-open week, closed), the spoiler-free payload, subscribe/unsubscribe validation, the VAPID JWT and aes128gcm encryption (decrypted by an independent receiver written from RFC 8291 and cross-checked once with Python `cryptography`), PGlite tests for the tables, grants and scheduler, and browser tests for the opt-in UI at 320/390/1440 in Light and Dark with PushManager mocked, plus a real-browser check that no service worker is registered before opt-in.

Not verified until Sean's steps: delivery through Apple, Google, Mozilla or Microsoft push services, the iPhone Home Screen permission prompt and notification tap, the hosted cron run, and `check:cloud` against the new objects.
