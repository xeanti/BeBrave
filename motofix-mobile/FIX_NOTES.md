# MotoFix mobile session fix and feature review

Updated from the uploaded BeBrave-main.zip, source snapshot e778aaecab323d0ea820019bbcfdc3a40297c805.

## Apply and run

1. Extract the updated archive. Use its `motofix-mobile` folder, including the two new auth files and tests. Preserve any local environment configuration you maintain separately.
2. In a terminal:

   ```bash
   cd BeBrave-main/motofix-mobile
   npm ci
   npx expo start --clear
   ```

3. Open it with a client compatible with Expo SDK 54, or rebuild your existing development/release app. An already installed APK needs a new build (or your existing update delivery process) to receive these source changes.
4. Run the automated checks with Node.js 22.13+:

   ```bash
   npm test
   ```

No new app dependencies or database migrations are required for these client fixes. Expo remains at SDK 54. This archive contains source code, not a built APK. Changes have not been pushed to GitHub or deployed to the backend.

## Why login failed after reopening

- The root navigator always started on Login and never restored a saved session into the correct customer/mechanic home screen.
- Cart loading and push-token registration awaited Supabase database requests inside `onAuthStateChange`. Those requests can wait for the same authentication lock that is waiting for the callback, causing login or later API calls to hang.
- Login first called `signOut`, and later signed out again on user/profile query errors. A temporary failure therefore destroyed a valid saved session. The default sign-out scope could also affect other sessions.
- Native token refresh had no app foreground/background lifecycle handling.

## Changes included

| Area | Updated behavior |
| --- | --- |
| Session restoration | A shared AuthProvider loads the saved session before selecting the initial route. Customer/user accounts open Main; mechanic accounts open MechanicMain. |
| Auth listeners | The one auth listener is synchronous. Profile work is deferred until after the callback returns; cart and push registration run separately. |
| Token refresh | Foreground activity resumes auto-refresh; background activity pauses it. Token refresh updates the session without rebuilding navigation or reloading the role. |
| Temporary errors | Profile/restore errors show Retry. A profile/network failure does not call signOut. Missing profiles are blocked instead of defaulting to customer. |
| Roles | Roles are normalized and read from profiles. Editable auth metadata is not trusted for role routing. Admin/staff/unknown accounts cannot open mobile content. |
| Logout | Explicit logout requests use local scope and rely on auth state to remove protected routes. A failed logout shows an error instead of pretending it succeeded. |
| Cart | Cart loading no longer runs under the auth callback. Late responses from an old account or older refresh cannot replace the current cart. A temporary fetch failure keeps the last displayed cart. |
| Registration | Removed unconditional signOut; errors always release the loading state. Confirmation-required registrations still ask the user to verify email; immediate sessions use the shared auth flow. |
| Booking and checkout account errors | A failed account lookup asks the user to retry rather than navigating to an unavailable Login route inside an authenticated navigator. |
| Mechanic certificate upload | Sends ArrayBuffer data instead of Blob, consistent with the existing profile photo upload path. Storage permissions still require a device/backend check. |
| Receipt download/share | Uses expo-file-system/legacy for the legacy copy/read/write and Android StorageAccessFramework methods used by this SDK 54 code. |
| Online checkout | Payment-link creation/opening failures after the order was saved are reported as payment pending. The customer is told the order exists, rather than being prompted by a generic Checkout Failed message to submit it again. Online order notifications now describe pending online payment. |
| Shared error text utility | Fixed escaped characters and whitespace regexes that removed the letter s from messages. The active AI preview screen currently uses the separate aiPreviewError utility; its backend image generation was not run. |
| Web auth storage | Browser builds use Supabase's browser storage instead of native SecureStore. A full web build was not verified. |

Saved native sessions still use the existing SecureStore keys, so the change does not intentionally reset stored login data. Closing or backgrounding the app does not call signOut. Revoked/invalid refresh tokens, server-enforced session limits, reinstalling, or clearing app data can still require login. Do not disable backend authentication controls to keep a session alive.

## Verification completed

- `npm test`: **25 passed, 0 failed** using mocked authentication, native storage, and native PDF APIs.
- Covered: fresh launch; saved-session reopening; auth callbacks returning immediately; customer/mechanic role routing; blocked roles; token refresh; profile errors and retry; missing profiles; restore errors; explicit sign-out events; stale profile results; account switching; late initialization; cleanup; app-state refresh lifecycle; native persistence adapter; browser storage selection; PDF save/share/fallback behavior; and shared error formatting.
- Parsed and transpiled all **59 mobile JavaScript source files** with JSX support. No syntax errors.
- Checked relative JavaScript module imports. No missing local modules.
- Reviewed booking, checkout, chat, profile/certificate upload, notifications, AI preview, and receipt code. Source review does not establish that live backend services work.
- Full dependency installation/build could not run in this environment: npm package downloads returned HTTP 403. No APK, emulator, live Supabase authentication, live PayMongo request, or real notification delivery was tested. The native tests simulate storage and filesystem behavior; they are not physical-device tests.

## Phone acceptance checklist

Use existing test accounts and sandbox payments where available.

- [ ] Sign in as a customer, force-close the app, reopen: home opens without entering credentials.
- [ ] Repeat after the access token's normal lifetime: the refresh token restores the session.
- [ ] Background the app and return: account remains signed in and requests work.
- [ ] Reopen with an unreliable connection: account/profile errors offer Retry; reconnect and Retry without clearing app data.
- [ ] Explicitly log out, close, reopen: Login appears; signing in again works.
- [ ] Sign in as a different customer: previous customer's cart and navigation are absent.
- [ ] Sign in as a mechanic: mechanic jobs open; certificate upload works for an image and a PDF.
- [ ] Use a web-only account: mobile content stays blocked; Log out allows choosing another account.
- [ ] Add/change/remove cart quantities; confirm stock limits and realtime refresh.
- [ ] Book a service; inspect its appointment details, cancellation/rescheduling, and payment status.
- [ ] Exercise counter/manual/online order paths. Simulate payment-link failure after order creation: one saved order remains visible and the UI reports payment pending.
- [ ] Send and receive a support message; exercise the chatbot and motorcycle AI preview.
- [ ] Verify notification permission denial does not block login; verify delivery on a physical development/release build.
- [ ] Download/share a receipt; try both allowing and declining the Android destination folder.

## Remaining findings that need separate backend/device work

1. **Checkout is not atomic (high priority).** CheckoutScreen inserts the order, inserts items, and decrements each stock quantity in separate API requests. If a middle request fails, an incomplete order or partial stock changes can remain. Concurrent orders can also race the client-side stock check. The client still trusts the submitted total/prices. A database checkout transaction should validate the authenticated customer, lock stock rows, use authoritative prices, create order/items/stock movements together, and accept an idempotency key for retries. The payment-link recovery above does not solve this database issue. No live database schema was changed.
2. **Stock RPC permissions need review (high priority).** The uploaded schema defines decrement_stock as SECURITY DEFINER without a positive-quantity or caller-role check and grants execution to anon/authenticated. Its body subtracts the supplied quantity directly. Confirm the deployed version, restrict execution, validate positive quantities, and move customer stock reservation into the authenticated checkout transaction. The uploaded schema alone does not prove the live project's configuration.
3. **Registration email delivery is backend-dependent.** A Supabase 'Error sending confirmation email' requires checking the project's email provider/SMTP configuration, limits, and Auth logs. The client cannot fix delivery by removing email confirmation, and this patch does not alter confirmation requirements.
4. **Chat, AI preview, push delivery, and payment webhooks require live checks.** Service credentials, deployed Edge Functions, storage/RLS policies, realtime publication, and device permissions were not validated. Chat also initializes from both chat selection and its focus effect; rapid switching/realtime behavior deserves a focused follow-up.
5. **Payment recovery after reopening needs follow-up.** Order confirmation can open a newly created checkout URL, but order history/details currently do not implement a full create/retry-payment action. If link creation fails, the user should contact the shop about the saved order rather than ordering again. A future retry action must use the existing order and the payment provider's idempotency guarantees.

## Primary references consulted

- https://supabase.com/docs/guides/troubleshooting/why-is-my-supabase-api-call-not-returning-PGzXw0
- https://supabase.com/docs/guides/auth/quickstarts/react-native
- https://docs.expo.dev/versions/v54.0.0/
- https://expo.dev/changelog/sdk-54
- https://docs.expo.dev/versions/v54.0.0/sdk/filesystem/
- https://supabase.com/docs/reference/javascript/storage-from-upload

The SDK 54 documentation URLs redirected to the current documentation during review; the project dependencies were kept at their supplied SDK 54 versions.
