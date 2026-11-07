# Sign-in and accounts (mobile app)

The app signs people in with Supabase Auth on the EU project `xgikdabgdqmbdgagowva`.

## How it works

| Piece | File |
| --- | --- |
| Client config (URL + publishable key, env overrides) | `src/lib/config.ts`, `.env.example` |
| Supabase client, PKCE flow, auto refresh in foreground only | `src/lib/supabase.ts` |
| Session stored in Keychain / Keystore (chunked, values > 2 KB) | `src/lib/secureStorage.ts` |
| Google sign-in (system browser) and deep link code exchange | `src/lib/authLinks.ts` |
| Session + profile + current journey, sign out | `src/lib/auth.tsx` |
| All queries (profiles, routes, stages, journeys, stamps, posts) | `src/lib/api.ts` |
| Route guard (`Stack.Protected`) | `app/_layout.tsx` |
| Welcome, sign up, sign in, forgot password | `app/(auth)/*` |
| Deep link landing, new password | `app/auth-callback.tsx`, `app/reset-password.tsx` |
| Onboarding: name, route, starting stage | `app/onboarding.tsx` |

Flow: signed out goes to **Welcome**. After sign-in the `on_auth_user_created` trigger has already
created `profiles`, `user_settings`, storage and subscription rows. If the user has no `journeys`
row yet they see **Onboarding**, which saves the display name, creates a journey on the chosen route
and a `journey_days` plan from the chosen stage onward. Then the five tabs open. Sign out is the round
button at the top right of **Settings**, which opens from the gear at the top right of Me. Everything goes through RLS with the publishable key; no service key is in
the app.

Email links (confirm, reset) and Google return to `caminoplus://auth-callback` (a build) or
`exp://<host>/--/auth-callback` (Expo Go). PKCE means a link must be opened on the same phone that
asked for it. The callback accepts only a one-time `code` (or an error). Raw `access_token` /
`refresh_token` values in a link are rejected on purpose: any web page or app can open
`caminoplus://auth-callback#access_token=...`, and accepting tokens would sign the phone into someone
else's account. The new-password screen only opens after a verified recovery code.

**PKCE needs WebCrypto, and React Native has none.** supabase-js builds the S256 challenge with
`crypto.subtle.digest('SHA-256')` and the verifier with `crypto.getRandomValues`. Without them it logs
`WebCrypto API is not supported. Code challenge method will default to use plain instead of sha256` and sends
the verifier itself as the challenge, so anyone who can see the request can replay the code. `src/lib/cryptoPolyfill.ts`
fills the two functions in from `expo-crypto` on iOS and Android (browsers have their own), and
`src/lib/__tests__/cryptoPolyfill.test.ts` checks the result against the RFC 7636 test vector. `expo-crypto` is a
native module: Expo Go already contains it, a development build needs to be rebuilt once after this change.
If that warning ever shows up in the Metro log again, sign-in is on the weak method.

## Starting without signal

The app has to open on the trail, so it never waits for the network to decide what to show:

- The session is read straight from the Keychain / Keystore (`readStoredSession`, `src/lib/supabase.ts`).
  supabase-js cannot answer `getSession()` while an expired access token is being refreshed without a
  network (it retries for about 30 s and then reports no session although the refresh token is still
  stored). Storage decides whether someone is signed in; a real sign-out or a revoked refresh token
  clears it.
- The account (profile + current journey) is saved per user on the phone (`u.<userId>.account`, see
  `src/lib/localStore.ts`) and shown immediately, then refreshed from the server. The Me tab data is cached
  the same way (`useMeData`).
- A load error is never treated as "no journey". With nothing saved and no signal the app shows
  `AccountUnavailable` (try again / log out); only a successful load that returns no journey goes to onboarding.
- `src/lib/net.ts` fails fast when the phone is offline (instead of waiting for the refresh retries) and
  `startJourney` is one idempotent RPC with a client generated id, so a retry never creates a second journey.
- Signing out also wipes everything saved for that user (`clearUserData`: every key that starts with `u.<userId>.`).
  The one thing it keeps is the private diary (two keys, `diary.<userId>.a` and `diary.<userId>.b`, so that a write
  cut off half way cannot take the whole diary with it; `src/features/diary/store.ts`): that is the pilgrim's own
  writing and exists only on this phone, so it is there again when the same person signs in. The keys deliberately
  do not start with `u.`; `src/features/diary/__tests__/diary.test.ts` fails if that changes.

## Deleting an account

Me > gear > Settings > Account > Delete account (also under Edit account; `app/delete-account.tsx`). The pilgrim types DELETE;
the app calls the `delete-account` edge function (service role: removes the user's files, then the auth
user; the database cascades the rest), then deletes the diary pages on this phone (`clearDiary`, only after the
server said yes) and signs out. Subscriptions are billed by the stores and are not cancelled by deletion; the
screen says so.

## Owner setup (Supabase and Google), one time

1. **Redirect URLs.** Supabase Dashboard > Authentication > URL Configuration.
   - Site URL: `https://camino.plus` (use `https://caminoplus-web.vercel.app` until the domain is live).
   - Redirect URLs, add: `caminoplus://auth-callback`, `caminoplus://**` and, for testing in
     Expo Go only, `exp://**`.
2. **Email.** Authentication > Sign In / Providers > Email: enabled, "Confirm email" on.
   Set custom SMTP (Resend) so emails come from camino.plus and are not rate limited
   (the built-in sender allows only a few emails per hour).
3. **Google.**
   1. Google Cloud Console > APIs & Services > OAuth consent screen: External, app name
      CaminoPlus, support email, add the `email` and `profile` scopes, publish.
   2. Credentials > Create credentials > OAuth client ID > **Web application**.
      Authorized redirect URI: `https://xgikdabgdqmbdgagowva.supabase.co/auth/v1/callback`
   3. Supabase > Authentication > Sign In / Providers > **Google**: enable, paste the Web client ID
      and client secret, save.

   The app opens Google in the system browser, so only the Web client is needed. Native Google
   Sign-In (iOS/Android client IDs + `signInWithIdToken`) can be added later in a dev build.

## Run it

```sh
cd mobile
npm install
npx expo start        # scan with Expo Go, or press i / a
```

Sign up with a real email, open the confirmation link on the phone, pick a route and stage.
