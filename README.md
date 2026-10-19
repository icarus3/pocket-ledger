# Pocket Ledger

A local personal expense tracker designed for an 11-inch Android tablet, including Lenovo Idea Tab. The interface adapts to landscape and portrait. The Android app packages the entire interface and document parsers locally in a secure-origin WebView. It requires no account or server.

For the complete maintainer handoff, exact tool versions and archive checksums, extraction steps, fresh-machine setup, offline builds, tests and signing/release procedures, read [AGENTS.md](AGENTS.md).

**Delivery status:** Version **1.1.1 (versionCode 3)** is built at [releases/Pocket-Ledger-release.apk](releases/Pocket-Ledger-release.apk). It retains application ID `com.pocketledger.local` and the original signing certificate for installation over 1.0.0 or 1.1.0. Android compilation and lint pass. The interactive preview and 24 screen/form screenshots are refreshed. No tablet is connected here; installation, native file picking and Android process-death behavior still need an on-device check.

**Latest changes:** Amount fields select their existing value on first tap or focus, so typing `233` replaces `0.00` (or the previous amount). Further taps within the focused field still allow individual-digit edits. Category and subcategory are optional, with dropdowns directly in transaction rows; choosing a subcategory assigns its parent. Import and edit progress saves automatically inside the encrypted vault and resumes after unlocking. Brief app switches keep the session. Excel transaction and category imports both offer worksheet selection and support prefixed XML. CSV rows may be imported before corrections: raw values are preserved, unresolved amounts stay null, and rows needing review are visibly excluded from totals. A user-chosen four-digit PIN supports changes and recovery through a recovery password. Money Timeline has explicit family management and member selection, with separate age columns. Appearance supports Light, Dark and System. INR/CHF/USD and **Debit → Final debit → Credit** remain unchanged.

## Open the visual previews

- [Interactive preview](previews/interactive-demo.html): double-click this file to explore the screens and forms using temporary fictional data. It does not access your real ledger. PDF imports and encrypted storage should be tested through the localhost version or installed Android app, not a file URL.
- [Screen gallery](previews/index.html): 24 HTML screens, including the transaction, category, report, budget, family and milestone forms, statement mapping and editable statement review.
- [PNG screenshots](previews/images/): actual screenshots of the browser-rendered interface.

The sample family, balances, budgets and goals are fictional. A newly created real ledger starts with no transactions, budgets, reports, family members or milestones.

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
| Currencies | INR, CHF and USD. Each transaction, report, budget and milestone belongs to one currency. The currency selector changes the active view. Totals never mix currencies, and no foreign-exchange rates are assumed. |
| Categories | Custom transaction types and editable categories/subcategories. Both are optional on transactions. Upload CSV or XLSX, choose the worksheet, review and merge matching names. Conflicting types are rejected. |
| Statement imports | CSV/TSV, Excel XLSX with worksheet selection, and selectable-text PDFs, including password-protected PDFs. Processing happens locally. Choose the header row, map columns, select date and signed-amount conventions, set currency/account, then review and edit the draft table. |
| Import review | Mapping, worksheet selection, raw values, row edits and exclusions are saved encrypted automatically. Finalize selected rows immediately, including unresolved rows marked Needs review. Correct them later in Transactions. Unresolved rows are excluded from totals until valid; amounts are never silently replaced with zero. |
| Transactions | Add, edit, delete, search and filter. Category/subcategory can remain blank. Both have dropdowns directly on ledger rows; selecting a subcategory assigns its parent. Debit → Final debit → Credit ordering and adjustment semantics are preserved. Unfinished forms restore after unlocking. |
| Reports | Multiple saved bar charts, line charts, donut charts and pivot tables. Edit report name, visual type, measure, dimension, pivot column, currency, date range and any category combination. Duplicate and export reports. |
| Budgets | Monthly and annual plans, historical budgets, planned/actual/remaining amounts and side-by-side comparison with a chosen prior year. Monthly plans roll up to the yearly view. An annual and monthly plan cannot overlap for the same category, year and currency. |
| Money Timeline | Add, edit or delete family members using birth dates. Select whose ages appear in separate timeline columns and exports. Selection persists. Dated milestones show targets, savings, contributions, return/inflation assumptions and shortfalls. |
| Exports | CSV transactions include date, month, year, currency, transaction type, category, subcategory, account and exactly three amount columns: debit, final debit, credit. Map final debit on reimport to preserve adjustments. Budget comparisons, report tables and the money timeline also export to CSV. |
| Security | AES-256-GCM encrypted ledger and drafts; user-selected four-digit PIN; recovery password; credential changes; manual and inactivity lock; encrypted backup/restore. Existing v1 password vaults remain readable and are migrated only after successful authentication. Android backup is disabled and no Internet permission is requested. |
| Appearance | Light, Dark or System, including live Android system-theme changes. The non-sensitive appearance preference is also cached outside the encrypted vault so the unlock screen uses the chosen theme. |

## Amounts and calculation rules

Amounts are stored as integer minor units (paise/cents/rappen) to avoid floating-point drift in transaction totals.

**Final debit = debit − credit + adjustment.** A negative result is money received. For example, debit 100, credit 20 and final debit 75 produce an adjustment of −5. Charts and budgets can therefore include expense refunds correctly. Income KPIs use the opposite sign of final debit for income/salary categories. Transfers contribute to cash flow but not expense or income KPIs.

All imported amounts use a decimal point; commas are treated as thousands separators. The INR default date format is day/month/year. ISO dates and Excel date serials are supported. Native calendar controls follow the device's locale; ledger dates and CSV dimensions remain unambiguous. No running bank balance is inferred from statement headers or totals.

Money Timeline calculates whole months to the goal date, converts the assumed annual effective return to a monthly rate, and applies contributions at month-end. Inflation increases today's target. Taxes and fees are excluded. Each milestone is an independent plan, so the same savings should not be allocated to multiple goals. These calculations are planning estimates, not guaranteed returns.

## Import boundaries

- Category and subcategory are optional, including categories with no subcategories. Subcategory options include parent names so repeated names remain distinguishable.
- Imported unique subcategory names assign their parent automatically. Repeated names can use a parent hint; unknown/ambiguous values remain available for review. Optional defaults apply only when no subcategory is supplied. Raw source cells remain attached to imported transactions, including after correction.
- Save older `.xls` files as `.xlsx` before importing. Mac Excel workbooks using the 1904 date system are supported.
- Scanned or image-only PDFs need OCR first, or a bank CSV/XLSX export. This app does not contain an OCR engine.
- PDF layouts are not standardized. The parser uses character positions and detected table headers to preserve amount columns. You can correct the extracted tab-separated text, map columns, exclude page headings, and edit rows. Review the imported table and totals against your original statement; your particular bank's statements have not yet been tested.
- Single imports are limited to 20 MB and 10,000 extracted rows; PDFs are limited to 150 pages. Expanded Excel XML is limited to 60 MB.
- Bar/line charts show up to 18 groups with an explicit note; the pivot and CSV contain all groups. Donuts combine groups after the first seven into Other and require nonnegative totals. Use a bar or line chart for a measure with negative totals.
- Historical annual budgets are visible in the yearly view. They are not silently divided into monthly allowances.

## Local encryption and backups

The vault uses Web Crypto AES-256-GCM with a random 12-byte IV for each save. Legacy v1 password vaults continue to use their original PBKDF2-HMAC-SHA256 parameters (normally 600,000 iterations). PIN setup creates a random 256-bit data key and independently wraps it with the four-digit PIN and recovery password, each using PBKDF2-HMAC-SHA256 with a random salt and 600,000 iterations. Version 2 envelopes contain only ciphertext, wrapped keys and derivation parameters; credentials are never stored. Import source rows, mapping choices and unfinished edit forms are saved inside the encrypted payload.

Brief app switches retain the session; backgrounding requests an encrypted progress save. Explicit locking and the configured inactivity timeout clear active plaintext/key references and form contents after saving. Reopening after process termination requires authentication and then restores the saved screen, import review or form. Android FLAG_SECURE protects screenshots/recents. Native file-picker interactions retain the five-minute picker timeout. The browser lifecycle flows are tested; native Android behavior still needs a device check.

Forgotten PINs can be changed using **Forgot PIN? Use recovery password**. Existing users keep their original password as the recovery password when setting up a PIN. Recovery does not erase the ledger or saved drafts. There is no remote reset if both PIN and recovery password are lost. Uninstalling or clearing app data removes the local vault. Save an encrypted `.pocketledger` backup outside the app; restoring previews counts and explicitly replaces the current ledger. Backups retain the PIN/password used when created. CSV exports contain readable raw values and review status.

This implementation has functional encryption tests; it has not received an independent security audit. Device compromise, weak passwords and unprotected exported files are outside the vault's protection.

## Development and verification

The shipped Android project already includes built app assets. For interface development with Node.js 22 or newer:

```powershell
npm install
npm run build
npm start
```

Open `http://localhost:4173` for a real local test vault or `http://localhost:4173/?demo=1` for fictional data. The local server listens only on loopback. Browsers and the Android app use different local vaults; transfer data with an encrypted backup when needed.

```powershell
npm test
npm run test:ui
node scripts/previews.mjs
```

Keep `npm start` running while executing browser checks or preview generation. Browser tests use the installed Chrome at its usual Windows path. Set `CHROME_PATH` for a different location.

Verified in this workspace: 15 automated core tests and 26 browser workflow checks (16 existing workflows plus 10 update scenarios), covering amount replacement using mouse/touch/keyboard, optional classifications, parent assignment, unchanged currency/amount order, unresolved CSV values and later correction, namespaced multi-worksheet Excel uploads, encrypted drafts and reopening, inactivity locking, legacy-vault migration, PIN changes/recovery with a pending draft, family selection, appearance, PDF imports, reports, budgets, exports and backup restore. The 24 previews pass layout checks at 390, 800 and 1280 CSS pixels and representative screenshots were inspected. Android release compilation and lint pass; real-device installation and lifecycle tests remain outstanding.

Dependencies are pinned in `package.json`: fflate 0.8.3 for XLSX ZIP data and clawpdf 0.3.0 / PDFium for local PDF extraction. Third-party licenses are included in the built assets under `licenses/`. Android appearance handling follows [WebView dark-theme guidance](https://developer.android.com/develop/ui/views/layout/webapps/dark-theme). The Android secure local-content approach follows [Android's WebView local-content guidance](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content); build compatibility follows [the AGP 8.9 release documentation](https://developer.android.com/build/releases/agp-8-9-0-release-notes).
