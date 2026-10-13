# Google sign-in setup — Continue with Google

Owner: Sean Balsiger · Version 1 · October 12, 2026 · Status: code ready, provider **not switched on**

Sean decided on October 12 that Google sign-in is how new players sign up and recover access. Supabase's built-in mailer only reaches team addresses, so email confirmation and password reset do not reach ordinary players. The app now shows a **Continue with Google** button above the email form on the Sign in and Create account screens. Email sign-in keeps working unchanged.

Until Sean completes the steps below, pressing the button shows "Google sign-in isn't switched on yet. Use email for now." and nothing else happens. The repo, this document and chat never hold the Google client secret. Sean pastes it into the Supabase dashboard himself.

## What the app does

- The button calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })`. That is a full-page redirect: Guess The Line → Supabase Auth → Google → Supabase Auth callback → back to `https://guess-the-line.pages.dev`.
- Before redirecting, the app reads the project's public Auth settings. If Google is off, it shows the plain message above instead of sending the player to a raw error page.
- A pending invitation link (`#invite=…`) is kept in the tab's session storage, never in the redirect URL. It is offered again after the player comes back from Google.
- Google sign-in with the same verified email as an existing email account lands on the **same** Supabase user. Supabase links the identities automatically. Group memberships, picks and the display name are keyed on the user id, so nothing moves. A brand-new Google player sees the usual "First, what should we call you?" step.
- The API still requires a confirmed email. Google accounts arrive with a verified email, so they pass.
- No database migration was needed. The content security policy needs no change: the redirect is a top-level navigation, and the session check after it goes to the Supabase origin already listed in `connect-src`.

## Part 1 — Google Cloud Console (about 10 minutes)

Sign in at <https://console.cloud.google.com/> with the Google account that should own the app.

1. **Project.** Top bar project picker → **New project** → name `Guess The Line` → **Create**, then select it. To reuse an existing project instead, just select it.
2. **Start the consent screen.** Left menu (☰) → **APIs & Services** → **OAuth consent screen**. Newer consoles open **Google Auth Platform** here. Click **Get started**.
   - **App information:** App name `Guess The Line`; User support email: your address → **Next**.
   - **Audience:** choose **External** → **Next**.
   - **Contact information:** your address → **Next**.
   - Tick the Google API Services User Data Policy box → **Continue** → **Create**.
3. **Branding and authorized domains.** Google Auth Platform → **Branding** (older consoles: **Edit app** on the consent screen).
   - Under **Authorized domains** click **Add domain** twice and enter:
     - `guess-the-line.pages.dev`
     - `onmrgvcehkflfaizvedl.supabase.co`
   - Optional: the home page `https://guess-the-line.pages.dev`. Leave the logo empty for now; adding one triggers Google's brand review.
   - **Save**.
4. **Scopes.** Google Auth Platform → **Data Access** → **Add or remove scopes**. Tick only `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile` → **Update** → **Save**. These are non-sensitive scopes, so no Google security review is needed.
5. **Create the OAuth client.** Google Auth Platform → **Clients** (older consoles: **APIs & Services → Credentials → Create credentials → OAuth client ID**) → **Create client**.
   - Application type: **Web application**. Name: `Guess The Line web`.
   - **Authorized JavaScript origins** → **Add URI** → `https://guess-the-line.pages.dev`
   - **Authorized redirect URIs** → **Add URI** → `https://onmrgvcehkflfaizvedl.supabase.co/auth/v1/callback`
   - **Create**. A dialog shows the **Client ID** and **Client secret**. Keep the dialog open, or download the JSON to a private folder outside the repo. Never paste the secret into chat, a commit, an issue or a document.
6. **Testing mode.** A new app starts in **Testing**: only the accounts listed under **Audience → Test users** can sign in, and Google re-asks consent after 7 days. To try it first, add your own Google address there (**Add users**).

### Publish out of Testing so anyone can sign in

Google Auth Platform → **Audience** → **Publishing status: Testing** → **Publish app** → **Confirm**. The status becomes **In production**. With only the three non-sensitive scopes above and no logo, Google does not need to verify the app first, and any Google account can sign in. Until the app is verified, Google may label it as unverified on the consent screen. The consent screen names the Supabase domain (`onmrgvcehkflfaizvedl.supabase.co`) because the callback runs there. Showing `guess-the-line.pages.dev` instead would need a Supabase custom domain, which is a paid add-on and outside the free-only budget.

## Part 2 — Supabase dashboard (about 3 minutes)

Sign in at <https://supabase.com/dashboard> and open project `onmrgvcehkflfaizvedl`.

1. **Authentication** → **Sign In / Providers** → find **Google** in the provider list and open it.
2. Turn on **Enable Sign in with Google**.
3. **Client IDs:** paste the Client ID from Part 1, step 5.
4. **Client Secret (for OAuth):** paste the secret yourself. Do not share it with an agent.
5. Leave **Skip nonce checks** off and **Allow users without an email** off. The app requires a confirmed email.
6. Check that the **Callback URL (for OAuth)** shown on the panel reads `https://onmrgvcehkflfaizvedl.supabase.co/auth/v1/callback`, the same URI as in Part 1, step 5.
7. **Save**.
8. **Authentication** → **URL Configuration**. Confirm:
   - **Site URL** stays `https://guess-the-line.pages.dev`.
   - **Redirect URLs** keeps the one exact entry `https://guess-the-line.pages.dev`. Add `http://127.0.0.1:4173` only if you want to try Google sign-in from the local cloud preview (`npm run preview:cloud`). Add no wildcards.

Turning the provider on before the frontend is deployed is safe. The live site has no Google button until this branch ships.

## Part 3 — Verify after the deploy

Do these after the frontend from this change is deployed, using the normal release checklist in [SOCIAL_COMMUNITY.md](SOCIAL_COMMUNITY.md).

1. In a private browser window, open <https://guess-the-line.pages.dev>. The **Continue with Google** button sits above the email form on both Sign in and Create account.
2. Press it. Google's account chooser opens. Pick a test account (or any account, once published). You return to Guess The Line signed in.
   - A new player sees "First, what should we call you?". Save a name and the Community home opens.
   - An existing email player with the same Gmail address lands in their usual account with their games.
3. Supabase → **Authentication** → **Users**: the player's row lists both providers (`email`, `google`) on **one** user, not two rows.
4. Invitation check: open an invitation link in a private window, press **Continue with Google** using the invited address, and confirm the **You have an invitation link** card appears after you return.
5. Email check: sign out and sign in with email and password. It still works.
6. If the button says "Google sign-in isn't switched on yet", the provider toggle from Part 2 is off or unsaved. If Google shows `redirect_uri_mismatch`, the redirect URI from Part 1, step 5 does not exactly match the Supabase callback URL.

## Limits and notes

- An existing email account that was never confirmed may not link automatically. If a player ends up with two rows in **Users**, stop and decide which account to keep before anyone enters picks. Nothing a player enters is deleted (D-23).
- Players who signed up with a non-Google address (for example iCloud) can still sign in with email and password. Password reset by email remains limited by the Supabase mailer until a free sender is set up.
- The automated tests mock Supabase Auth. They prove the button, redirect parameters, invitation survival and error wording, not a real Google consent. Part 3 is the real-world acceptance.
