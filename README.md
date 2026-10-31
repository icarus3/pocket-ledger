# Pocket Ledger

A local personal expense tracker designed for an 11-inch Android tablet, including Lenovo Idea Tab. The interface adapts to landscape and portrait. The Android app packages the entire interface and document parsers locally in a secure-origin WebView. It requires no account or server.

For the complete maintainer handoff, exact tool versions and archive checksums, extraction steps, fresh-machine setup, offline builds, tests and signing/release procedures, read [AGENTS.md](AGENTS.md).

**Delivery status:** Version **1.2.0 (versionCode 4)** is built and signed at [releases/Pocket-Ledger-release.apk](releases/Pocket-Ledger-release.apk), with a versioned copy at [releases/Pocket-Ledger-1.2.0.apk](releases/Pocket-Ledger-1.2.0.apk). Package identity, version, original signing certificate and bundled web assets were verified on **2026-10-31**. Android compilation and lint pass with no errors; 35 HTML screens and 35 PNG screenshots are refreshed. The application ID remains `com.pocketledger.local` for installation over the existing release. No tablet is connected here; installation, native file picking, Android process-death behavior and capacity for 500,000 records still need an on-device check.

**Latest changes:** Valuation records monthly account values with editable account types, subtypes and categories, plus a pivot builder. Investment plan tracks monthly contributions and actual investments with month/year views. Home loan organizes costs, repayment demands and dated loan-status snapshots. Statement imports accept up to 500,000 transaction rows per worksheet; CSV/TSV files can be up to 128 MB. All rows start selected, including repeated values; duplicate detection no longer excludes or blocks rows. Select all and Deselect all apply across every review page. The review displays 100 rows at a time. Large-ledger progress saves use a separate encrypted draft record to avoid resealing the complete ledger after every form change.

Existing behavior is preserved: amount fields select their contents on first focus, optional category/subcategory dropdowns assign matching parents, unresolved imported amounts retain raw values and stay excluded from totals, encrypted drafts resume after unlocking, and PIN/recovery changes preserve the ledger. Appearance supports Light, Dark and System. INR, CHF and USD remain separate, with **Debit → Final debit → Credit** ordering.

## Open the visual previews

- [Interactive preview](previews/interactive-demo.html): double-click this file to explore the screens and forms using temporary fictional data. It does not access your real ledger. PDF imports and encrypted storage should be tested through the localhost version or installed Android app, not a file URL.
- [Screen gallery](previews/index.html): 35 HTML screens and forms, including the planning sections, transaction, category, report, budget, family and milestone forms, statement mapping and editable statement review.
- [PNG screenshots](previews/images/): actual screenshots of the browser-rendered interface.

The sample family, balances, budgets, goals, account references and planning records are fictional. A newly created real ledger starts with no transactions, budgets, reports, family members, milestones, valuations, investment plans or home-loan records. Editable option lists include starter values.

## Build once, then install directly on the tablet

You do not need an app-store account or a hosted website.

**Single-folder setup without Android Studio:** double-click [Prepare-Android-Tools.cmd](Prepare-Android-Tools.cmd) in your normal Windows session. It downloads verified Java 21, Gradle 8.11.1 and Android command-line tools into `build-tools/`, then asks you to review SDK licenses, installs SDK Platform 35 / Build Tools 35.0.0 / Platform Tools, and runs a preliminary release build with lint to populate the project dependency cache. All installed tools and build caches stay under `build-tools/`. It does not change system-wide environment variables. The preparation step needs internet access outside this workspace's restricted shell.

If you prefer downloading the three ZIPs yourself, put them in `build-tools/downloads/` without extracting or renaming them: the latest Temurin 21 Windows x64 JDK ZIP from [Adoptium](https://adoptium.net/temurin/releases/?version=21&os=windows&arch=x64&package=jdk), [gradle-8.11.1-bin.zip](https://services.gradle.org/distributions/gradle-8.11.1-bin.zip), and [commandlinetools-win-15859902_latest.zip](https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip). The setup script reuses matching files, verifies checksums and obtains the remaining SDK/project dependencies. Leave the internet connected during setup. A successful run creates `build-tools/READY.txt`; failures are logged in `build-tools/setup.log`.

Preparation has been verified in this workspace. No additional downloads are needed for the current build. Rebuild and sign using the prepared tools with `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-apk.ps1 -UseBundledAssets -Offline`. If you change the interface source, run `node scripts/build.mjs` first to refresh the bundled Android assets.

Alternatively, use Android Studio:

1. On a Windows PC, install Android Studio. Use its SDK Manager to install **Android SDK Platform 35** and **Build Tools 35.0.0**. Accept the Android SDK licenses in Android Studio.
2. Use JDK 17 or 21. The build script detects Android Studio's `jbr` directory in its normal installation location. For another installation, set `JAVA_HOME` and `ANDROID_HOME` yourself.
3. Double-click **[Build-Android.cmd](Build-Android.cmd)**. The first build requires internet access to download Gradle 8.11.1 and Android build dependencies. Gradle's downloaded archive is checked against its published SHA-256. The bundled app assets avoid needing Node.js for this build.
4. After a successful build, copy **`releases/Pocket-Ledger-release.apk`** to the tablet using a USB cable or another file-transfer method you trust.
5. Open the APK in the tablet's Files app. If Android asks, allow that file source to install apps, then choose Install. Open **Pocket Ledger**. Existing users unlock with their original password and can set up a PIN in Settings. New users choose a four-digit PIN and a recovery password of at least 10 characters.

Keep **`android/personal-release.jks`** and **`android/keystore.properties`** private and backed up. The update build requires both existing files and refuses to generate a replacement key. Future updates must use the same signing key. These files are excluded from source packages. To release an update, increase `versionCode` in `android/app/build.gradle`, rebuild, and install over the existing app. Do not uninstall first. Export an encrypted backup before any update.

The project targets Android API 35 and has a minimum of API 26. Use an updated Android System WebView/Chrome (Chromium 110 or newer) for the bundled JavaScript. The intended Lenovo tablet must still be checked on-device.

## What is included

| Area | Behavior |
| --- | --- |
| Currencies | INR, CHF and USD. Each transaction, report, budget, milestone and planning record belongs to one currency. The currency selector changes the active view. Totals never mix currencies, and no foreign-exchange rates are assumed. |
| Categories | Custom transaction types and editable categories/subcategories. Both are optional on transactions. Upload CSV or XLSX, choose the worksheet, review and merge matching names. Conflicting types are rejected. |
| Statement imports | CSV/TSV, Excel XLSX with worksheet selection, and selectable-text PDFs, including password-protected PDFs. Processing happens locally. Choose the header row, map columns, select date and signed-amount conventions, set currency/account, then review and edit the draft table. |
| Import review | Mapping, worksheet selection, raw values, row edits and exclusions save encrypted automatically. All rows start selected, including duplicates. Select all/Deselect all work across all pages; each page shows 100 rows. Finalize selected rows immediately, including unresolved rows marked Needs review. Correct them later in Transactions. Unresolved rows are excluded from totals until valid; amounts are never silently replaced with zero. |
| Transactions | Add, edit, delete, search and filter. Category/subcategory can remain blank. Both have dropdowns directly on ledger rows; selecting a subcategory assigns its parent. Debit → Final debit → Credit ordering and adjustment semantics are preserved. Unfinished forms restore after unlocking. |
| Reports | Multiple saved bar charts, line charts, donut charts and pivot tables. Edit report name, visual type, measure, dimension, pivot column, currency, date range and any category combination. Duplicate and export reports. |
| Budgets | Monthly and annual plans, historical budgets, planned/actual/remaining amounts and side-by-side comparison with a chosen prior year. Monthly plans roll up to the yearly view. An annual and monthly plan cannot overlap for the same category, year and currency. |
| Money Timeline | Add, edit or delete family members using birth dates. Select whose ages appear in separate timeline columns and exports. Selection persists. Dated milestones show targets, savings, contributions, return/inflation assumptions and shortfalls. |
| Valuation | Add/edit/delete monthly values using account type, subtype, month, year and category dropdowns. Manage those option lists in the same section. Build pivots by account type, subtype, category, month or year using value sums or record counts, and export the pivot to CSV. |
| Investment plan | Manage investment types and plans with details, account reference, start/end dates and monthly amount. Switch between month and year views. Record actual amounts by month for each investment; yearly actual totals sum those monthly records. |
| Home loan | Add/edit/delete cost components with type, percentage, planned and actual amounts; summarize by component. Maintain a numbered repayment schedule with agreement value, percentage, amount to pay, demand amount, actual paid and comments. Add dated snapshots of approved/disbursed amounts and cumulative principal/interest paid, with a summary. |
| Exports | CSV transactions include date, month, year, currency, transaction type, category, subcategory, account and exactly three amount columns: debit, final debit, credit. Map final debit on reimport to preserve adjustments. Budget comparisons, report tables and the money timeline also export to CSV. |
| Security | AES-256-GCM encrypted ledger and drafts; user-selected four-digit PIN; recovery password; credential changes; manual and inactivity lock; encrypted backup/restore. Existing v1 password vaults remain readable and are migrated only after successful authentication. Android backup is disabled and no Internet permission is requested. |
| Appearance | Light, Dark or System, including live Android system-theme changes. The non-sensitive appearance preference is also cached outside the encrypted vault so the unlock screen uses the chosen theme. |

## Amounts and calculation rules

Amounts are stored as integer minor units (paise/cents/rappen) to avoid floating-point drift in transaction totals.

**Final debit = debit − credit + adjustment.** A negative result is money received. For example, debit 100, credit 20 and final debit 75 produce an adjustment of −5. Charts and budgets can therefore include expense refunds correctly. Income KPIs use the opposite sign of final debit for income/salary categories. Transfers contribute to cash flow but not expense or income KPIs.

All imported amounts use a decimal point; commas are treated as thousands separators. The INR default date format is day/month/year. ISO dates and Excel date serials are supported. Native calendar controls follow the device's locale; ledger dates and CSV dimensions remain unambiguous. No running bank balance is inferred from statement headers or totals.

Money Timeline calculates whole months to the goal date, converts the assumed annual effective return to a monthly rate, and applies contributions at month-end. Inflation increases today's target. Taxes and fees are excluded. Each milestone is an independent plan, so the same savings should not be allocated to multiple goals. These calculations are planning estimates, not guaranteed returns.

Investment plans schedule one contribution for every calendar month touched by the start/end dates, including both boundary months. For example, March 15 through May 3 produces three planned contributions. An empty end date means ongoing. A year view includes only active months in that year. Actual invested amounts are separate monthly totals; saving again for the same month replaces its total. Changing an investment's currency is blocked while actual amounts exist.

Valuation records are snapshots. A pivot across multiple months sums the recorded snapshots; it is not a return calculation. Subtype labels include their parent account type in pivots. Home-loan percentages are reference fields; enter the agreement's actual amount to pay and demand amount explicitly. Cost and repayment totals remain separate. Loan status uses the latest dated snapshot in the selected currency, and outstanding principal is disbursed amount minus cumulative principal paid. Historical snapshots are never added together.

## Import boundaries

- Category and subcategory are optional, including categories with no subcategories. Subcategory options include parent names so repeated names remain distinguishable.
- Imported unique subcategory names assign their parent automatically. Repeated names can use a parent hint; unknown/ambiguous values remain available for review. Optional defaults apply only when no subcategory is supplied. Raw source cells remain attached to imported transactions, including after correction.
- Save older `.xls` files as `.xlsx` before importing. Mac Excel workbooks using the 1904 date system are supported.
- Scanned or image-only PDFs need OCR first, or a bank CSV/XLSX export. This app does not contain an OCR engine.
- PDF layouts are not standardized. The parser uses character positions and detected table headers to preserve amount columns. You can correct the extracted tab-separated text, map columns, exclude page headings, and edit rows. Review the imported table and totals against your original statement; your particular bank's statements have not yet been tested.
- CSV/TSV inputs can be up to 128 MB; XLSX and PDF inputs remain limited to 20 MB. A statement worksheet can contain up to 500,000 transaction rows plus its header. Expanded Excel contents remain limited to 60 MB and PDFs to 150 pages. Category imports accept 1–1,000 rows. Encrypted backup restores accept files up to 512 MB.
- Repeated statement rows are imported when selected. There is no automatic duplicate scan, exclusion or confirmation step. Select all includes every row on every review page, including repeated rows; manually exclude rows you do not want to import.
- Review and ledger tables render bounded pages, and large-ledger encoding avoids oversized function-argument spreads and per-byte base64 string arrays. Actual capacity still depends on the device's memory, WebView and available storage. Browser and desktop stress results do not establish tablet capacity.
- Bar/line charts show up to 18 groups with an explicit note; the pivot and CSV contain all groups. Donuts combine groups after the first seven into Other and require nonnegative totals. Use a bar or line chart for a measure with negative totals.
- Historical annual budgets are visible in the yearly view. They are not silently divided into monthly allowances.

## Local encryption and backups

The vault uses Web Crypto AES-256-GCM with a random 12-byte IV for each save. Legacy v1 password vaults continue to use their original PBKDF2-HMAC-SHA256 parameters (normally 600,000 iterations). PIN setup creates a random 256-bit data key and independently wraps it with the four-digit PIN and recovery password, each using PBKDF2-HMAC-SHA256 with a random salt and 600,000 iterations. Version 2 envelopes contain only ciphertext, wrapped keys and derivation parameters; credentials are never stored. Import source rows, mapping choices and unfinished edit forms are encrypted.

For large ledgers or import drafts, progress can be saved in a separate encrypted IndexedDB workspace record under the same active data key. This record uses its own random IV and authenticated label, and is bound to the current primary vault IV so stale progress cannot override a later save, credential change or restore. The primary envelope and backup format remain compatible. Creating a backup consolidates the current draft into its encrypted payload, so reopening that backup preserves progress too. No ledger or form contents are stored in plaintext localStorage.

Large encrypted ledger and workspace values are stored as transparent 4 MiB base64 ciphertext chunks to stay below Chromium's limit for a single IndexedDB value. Each chunk set and its metadata commit in one transaction; reading reassembles the original ciphertext before decryption. Existing unchunked records remain readable. Exported v1/v2 backup envelopes are unchanged, so this storage detail requires no encryption-format migration.

Brief app switches retain the session; backgrounding requests an encrypted progress save. Explicit locking and the configured inactivity timeout clear active plaintext/key references and form contents after saving. Reopening after process termination requires authentication and then restores the saved screen, import review or form. Android FLAG_SECURE protects screenshots/recents. Native file-picker interactions retain the five-minute picker timeout. The browser lifecycle flows are tested; native Android behavior still needs a device check.

Forgotten PINs can be changed using **Forgot PIN? Use recovery password**. Existing users keep their original password as the recovery password when setting up a PIN. Recovery does not erase the ledger or saved drafts. There is no remote reset if both PIN and recovery password are lost. Uninstalling or clearing app data removes the local vault. Save an encrypted `.pocketledger` backup outside the app; restoring previews counts and explicitly replaces the current ledger. Backups retain the PIN/password used when created. CSV exports contain readable raw values and review status.

This implementation has functional encryption tests; it has not received an independent security audit. Device compromise, weak passwords and unprotected exported files are outside the vault's protection.

## Development and verification

The shipped Android project already includes built app assets. For interface development with Node.js 22 or newer:

```powershell
npm.cmd install --no-audit --no-fund
npm.cmd run build
npm.cmd start
```

Open `http://localhost:4173` for a real local test vault or `http://localhost:4173/?demo=1` for fictional data. The local server listens only on loopback. Browsers and the Android app use different local vaults; transfer data with an encrypted backup when needed.

```powershell
npm.cmd test
npm.cmd run test:ui
node --test tests/workspace.test.mjs
npm.cmd run test:scale
node scripts/previews.mjs
```

Keep `npm.cmd start` running while executing browser checks or preview generation. Browser tests use the installed Chrome at its usual Windows path. Set `CHROME_PATH` for a different location. `test:scale` runs the separate 500,000-row calculation/import/encryption checks; set `$env:PL_STRESS = '1'` before `node tests/planning-ui.mjs` to include the 500,000-row browser import/save/reopen workflow.

Verified on **2026-10-31**: 22 core/model tests, 36 browser workflows (26 existing plus 10 new), three scalability tests and one isolated encrypted-storage test pass. Coverage includes option management and pivots, partial-year investment totals and actuals, home-loan summaries using the latest snapshot, encrypted dependent-dropdown drafts, bulk selection of repeated rows, and the full 500,000-row browser import/save/reopen flow. The 35 HTML/PNG previews were regenerated, and main sections pass responsive checks at 390, 800 and 1280 CSS pixels. Android release compilation, package/version/certificate checks and bundled-asset verification pass. Lint reports no errors and one `SetJavaScriptEnabled` warning.

The full browser stress run uploaded a fictional 15,888,925-byte CSV with 500,000 rows: review took 6.724 seconds, encrypted draft save/lock/reopen 11.037 seconds, final import 5.523 seconds, and authenticated ledger reopen 1.976 seconds. A cumulative 501,210 transactions survived verification. An isolated Chrome engine/IndexedDB save and PIN reopen completed in approximately 7.4 seconds. These are desktop measurements; real-device installation, lifecycle and 500,000-record capacity remain outstanding.

Dependencies are pinned in `package.json`: fflate 0.8.3 for XLSX ZIP data and clawpdf 0.3.0 / PDFium for local PDF extraction. Third-party licenses are included in the built assets under `licenses/`. Android appearance handling follows [WebView dark-theme guidance](https://developer.android.com/develop/ui/views/layout/webapps/dark-theme). The Android secure local-content approach follows [Android's WebView local-content guidance](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content); build compatibility follows [the AGP 8.9 release documentation](https://developer.android.com/build/releases/agp-8-9-0-release-notes).
