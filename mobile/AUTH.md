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
and a `journey_days` plan from the chosen stage onward. Then the five tabs open. Sign out is in
**Settings > Account**. Everything goes through RLS with the publishable key; no service key is in
the app.

Email links (confirm, reset) and Google return to `caminoplus://auth-callback` (a build) or
`exp://<host>/--/auth-callback` (Expo Go). PKCE means a link must be opened on the same phone that
asked for it.

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
