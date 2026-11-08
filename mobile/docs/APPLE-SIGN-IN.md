# Sign in with Apple

The app offers Google sign-in, so the App Store asks for Sign in with Apple too (App Review Guideline 4.8). This page says
what the app does and what you set up once, step by step. You need a paid Apple Developer account.

## What the pilgrim sees

- **iPhone and iPad, build 1.2.0 or newer:** a black **Continue with Apple** button (white in dark mode) right above
  **Continue with Google**, the same size, on Welcome, Sign in and Create account. One button for both: the first time it
  makes the account, after that it signs in.
- **Android, the web, and any iPhone build older than 1.2.0:** no Apple button at all. Nothing breaks.
- Apple's sheet asks for the name and the email. The pilgrim may hide the email; Apple then gives a private relay address
  (something like `x7kq2m9pzt@privaterelay.appleid.com`).
- Closing Apple's sheet does nothing (no message). Other problems show a short sentence, never a code.

### Why only iOS in v1

On iOS the system does the whole sign-in and the app's bundle id is enough. On Android and the web, Apple's sign-in runs
through a web page: that needs a separate **Services ID**, a return address on camino.plus, and a client secret (a token
you sign with your key) that **Apple makes expire every six months**, so someone would have to renew it twice a year or
Android sign-in stops. Android has no App Store rule that asks for Apple, so v1 leaves it out.

## How it works (for whoever maintains it)

| Piece | File |
| --- | --- |
| The one file that talks to Apple: nonce, Apple's sheet, the Supabase sign-in, the name, the link call | `mobile/src/lib/authApple.ts` |
| The plain logic, unit tested (visibility rule, nonce, error words, the name) | `mobile/src/lib/authAppleCore.ts`, `mobile/src/lib/__tests__/authApple.test.ts` |
| The button (Apple's own, drawn by iOS) | `mobile/src/components/auth/AppleButton.tsx` |
| Exchange of Apple's one-time code for a refresh token, kept on the server | `supabase/functions/apple-link/` |
| Revoke at Apple when the account is deleted | `supabase/functions/delete-account/` |
| Client secret (ES256), Apple's two REST calls | `supabase/functions/_shared/apple.ts` |
| The table for the refresh tokens (server only) | `supabase/migrations/20261114020100_apple_sign_in_tokens.sql` |

1. The app makes a random nonce (`expo-crypto`), sends its SHA-256 to Apple and asks for the name and the email.
2. Apple gives back an identity token (with that hash inside) and a one-time authorization code.
3. The app signs in with `supabase.auth.signInWithIdToken({ provider: 'apple', token, nonce })` with the raw nonce;
   Supabase checks the token with Apple's keys, the bundle id and the nonce.
4. Apple sends the full name **only the very first time**. The app saves it as the display name if the profile only has
   the automatic name (the start of the email). A name the pilgrim typed is never replaced.
5. The app sends the one-time code to `apple-link`, which swaps it with Apple for a refresh token and stores it in
   `public.apple_sign_in_tokens` (no app can read that table). The app does not wait for the answer.
6. **Delete account** (App Store 5.1.1(v)): `delete-account` revokes that refresh token at Apple
   (`POST https://appleid.apple.com/auth/revoke`), then deletes the account. If Apple cannot be reached, the account is
   still deleted and the failure is written to the function's log.

The package `expo-apple-authentication` has a native part, so it came with **build 1.2.0**. The app only loads it after
asking whether the installed build has it (`hasNativeModule`, `mobile/src/lib/optionalNative.ts`): an older build simply
shows no Apple button.

Without the four Apple secrets below, sign-in with Apple still works (steps 1 to 4), `apple-link` answers
`not_configured` and nothing is stored, and deleting an account works as before but cannot revoke at Apple. So set the
secrets before you send the build to App Review.

## Set it up once

### 1. Your Team ID

[developer.apple.com/account](https://developer.apple.com/account) > **Membership details** > **Team ID**: 10 letters and
digits. Write it down.

### 2. The App ID with Sign in with Apple

1. **Certificates, Identifiers & Profiles** > **Identifiers**. Open `plus.camino.app` (EAS may have made it already
   during the first iOS build). If it is not there: **+** > **App IDs** > **App** > Bundle ID **Explicit**
   `plus.camino.app`.
2. Under **Capabilities** tick **Sign In with Apple** (leave "Enable as a primary App ID"). **Save.**
3. The app's build already asks for this capability (the `expo-apple-authentication` plugin in `mobile/app.json` adds
   the entitlement). When `eas build` asks to sync capabilities or make a new provisioning profile, say yes.

### 3. The key (.p8) and its Key ID

1. **Keys** > **+**. Name: `CaminoPlus Sign in with Apple`. Tick **Sign in with Apple** > **Configure** > Primary App ID
   `plus.camino.app` > **Save** > **Continue** > **Register**.
2. **Download** the `.p8` file. Apple lets you download it **only once**: keep it in your password manager. Never put it in
   the repository, a chat or an email.
3. The page shows the **Key ID** (10 characters). Write it down.

### 4. Supabase: the Apple provider

Supabase dashboard > **Authentication** > **Sign In / Providers** > **Apple**:

- **Enable** it.
- **Client IDs** (shown as "Authorized Client IDs" in some versions): `plus.camino.app`. This is the bundle id the iPhone
  signs in with. Nothing else is needed for the iOS flow.
- Leave the secret key for OAuth empty (that is the six-month web secret, not used in v1).
- **Save.**

### 5. The function secrets

Supabase dashboard > **Edge Functions** > **Secrets** (or `supabase secrets set` on your computer). Names only here; the
values are yours:

| Secret | Value |
| --- | --- |
| `APPLE_TEAM_ID` | the Team ID of step 1 |
| `APPLE_KEY_ID` | the Key ID of step 3 |
| `APPLE_PRIVATE_KEY` | the whole content of the `.p8` file, including the `BEGIN` and `END` lines |
| `APPLE_BUNDLE_ID` | `plus.camino.app` |

On a computer the easiest way to give the whole file is `supabase secrets set APPLE_PRIVATE_KEY="$(cat AuthKey_XXXXXXXXXX.p8)"`
(type it in your own terminal, not in a chat). The functions make a fresh five-minute client secret for every call, so
nothing here expires.

Then apply the migration and deploy the functions (once you agree):
`20261114020100_apple_sign_in_tokens.sql`, then `supabase functions deploy apple-link` and
`supabase functions deploy delete-account`.

### 6. Emails to private relay addresses

A pilgrim who hides the email has a `@privaterelay.appleid.com` address. Apple forwards mail to it **only from senders you
registered**. Today Supabase sends the auth emails, and an Apple account needs none of them (no confirmation, no password).
If the app ever emails pilgrims (receipts, news), go to **Certificates, Identifiers & Profiles** > **Services** >
**Sign in with Apple for Email Communication** > **Configure**, and add the sending domain (for example `camino.plus`)
and its sending address, with SPF set for that domain. Otherwise those emails never arrive.

## Test it on a phone

1. Make the 1.2.0 build (`mobile/DEPLOY.md`): a development or preview build for iOS. Expo Go cannot test this (its
   bundle id is not yours).
2. On the iPhone, sign in to iCloud with an Apple Account that has two-factor authentication on.
3. Open the app signed out: **Continue with Apple** is above Google. Tap it, choose "Hide My Email" once to see the relay
   address, confirm with Face ID.
4. You land in onboarding with your Apple name filled in. In Supabase > Authentication > Users the user shows provider
   **apple**; in the table editor `apple_sign_in_tokens` has one row (only once the secrets are set).
5. Sign out and sign in again with Apple: the same account opens (Apple sends no name this time; the name stays).
6. Delete the account in the app. On the iPhone, **Settings** > your name > **Sign-In & Security** > **Sign in with Apple**:
   CaminoPlus is gone from the list. That is the revoke working.
7. To repeat the first-time flow (the name), remove CaminoPlus from that same list before you sign in again.

## What App Review sees

- On an iPhone or iPad: Continue with Apple next to Continue with Google, the same size, on every screen that offers Google.
- The reviewer can create an account with Apple, hide the email, and use the app with no extra step.
- Me > gear > Settings > Account > Delete account removes the account and revokes Apple's sign-in. In the review notes
  you may write: "Sign in with Apple is on the Welcome, Sign in and Create account screens. Deleting the account
  (Settings > Account > Delete account) also revokes the Sign in with Apple token."
