# Pocket Ledger

A local personal expense tracker designed for an 11-inch Android tablet, including Lenovo Idea Tab. The interface adapts to landscape and portrait. The Android app packages the entire interface and document parsers locally in a secure-origin WebView. It requires no account or server.

**Delivery status:** The signed Android APK is built at [releases/Pocket-Ledger-release.apk](releases/Pocket-Ledger-release.apk). Android compilation and lint passed (zero errors; warnings for the pinned WebKit dependency and required JavaScript support). The browser workflows, interactive HTML preview and 19 screen/form screenshots are verified. Installation and native file-picker/background-lock behavior still need checking on the Lenovo tablet.

**Latest changes:** Select a subcategory for each transaction and its main category fills automatically. Transaction entry, statement review, the ledger and CSV exports use **Debit → Final debit → Credit**. Final debit remains editable. Main-category totals, budgets and reports follow the selected subcategory's parent.

## Open the visual previews

- [Interactive preview](previews/interactive-demo.html): double-click this file to explore the screens and forms using temporary fictional data. It does not access your real ledger. PDF imports and encrypted storage should be tested through the localhost version or installed Android app, not a file URL.
- [Screen gallery](previews/index.html): 19 HTML screens, including the transaction, category, report, budget, family and milestone forms, statement mapping and editable statement review.
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
5. Open the APK in the tablet's Files app. If Android asks, allow that file source to install apps, then choose Install. Open **Pocket Ledger** and create a password of at least 10 characters.

Keep **`android/personal-release.jks`** and **`android/keystore.properties`** private and backed up. The script generates them once; future updates must use the same signing key. These files are excluded from source packages. To release an update, increase `versionCode` in `android/app/build.gradle`, rebuild, and install over the existing app. Do not uninstall first. Export an encrypted backup before any update.

The project targets Android API 35 and has a minimum of API 26. Use an updated Android System WebView/Chrome (Chromium 110 or newer) for the bundled JavaScript. The intended Lenovo tablet must still be checked on-device.

## What is included

| Area | Behavior |
| --- | --- |
| Currencies | INR, CHF and USD. Each transaction, report, budget and milestone belongs to one currency. The currency selector changes the active view. Totals never mix currencies, and no foreign-exchange rates are assumed. |
| Categories | Custom transaction types with an expense, income or transfer KPI role; editable categories and subcategories. Salary is an income type by default. Upload categories from CSV or the first worksheet of an XLSX file. Existing names are merged after review; conflicting types are rejected. |
| Statement imports | CSV/TSV, Excel XLSX with worksheet selection, and selectable-text PDFs, including password-protected PDFs. Processing happens locally. Choose the header row, map columns, select date and signed-amount conventions, set currency/account, then review and edit the draft table. |
| Import review | Edit dates, descriptions and subcategories; the main category fills automatically. Edit the three amounts in order: debit, final debit, credit. Exclude rows. Possible duplicates are initially excluded. Missing or ambiguous subcategories must be assigned before finalizing selected rows. Nothing is stored until Finalize is selected. |
| Transactions | Add, edit, delete, search and filter transactions. Choose a subcategory and its main category is assigned automatically. The three amount columns are debit, final debit and credit. An edit to final debit records an adjustment without overwriting the original debit or credit. |
| Reports | Multiple saved bar charts, line charts, donut charts and pivot tables. Edit report name, visual type, measure, dimension, pivot column, currency, date range and any category combination. Duplicate and export reports. |
| Budgets | Monthly and annual plans, historical budgets, planned/actual/remaining amounts and side-by-side comparison with a chosen prior year. Monthly plans roll up to the yearly view. An annual and monthly plan cannot overlap for the same category, year and currency. |
| Money Timeline | Add yourself, your wife and any number of children/family members using birth dates. Define dated milestones with a target in today's money, existing savings, monthly contributions, annual return and inflation assumptions. See family ages, date/month/year, future target, projected savings and shortfall. |
| Exports | CSV transactions include date, month, year, currency, transaction type, category, subcategory, account and exactly three amount columns: debit, final debit, credit. Map final debit on reimport to preserve adjustments. Budget comparisons, report tables and the money timeline also export to CSV. |
| Security | Password-protected, encrypted local vault; lock button; inactivity lock; background lock; encrypted backup/restore and password changes. Android backup is disabled and the app requests no Internet permission. |

## Amounts and calculation rules

Amounts are stored as integer minor units (paise/cents/rappen) to avoid floating-point drift in transaction totals.

**Final debit = debit − credit + adjustment.** A negative result is money received. For example, debit 100, credit 20 and final debit 75 produce an adjustment of −5. Charts and budgets can therefore include expense refunds correctly. Income KPIs use the opposite sign of final debit for income/salary categories. Transfers contribute to cash flow but not expense or income KPIs.

All imported amounts use a decimal point; commas are treated as thousands separators. The INR default date format is day/month/year. ISO dates and Excel date serials are supported. Native calendar controls follow the device's locale; ledger dates and CSV dimensions remain unambiguous. No running bank balance is inferred from statement headers or totals.

Money Timeline calculates whole months to the goal date, converts the assumed annual effective return to a monthly rate, and applies contributions at month-end. Inflation increases today's target. Taxes and fees are excluded. Each milestone is an independent plan, so the same savings should not be allocated to multiple goals. These calculations are planning estimates, not guaranteed returns.

## Import boundaries

- Each new or edited transaction requires a subcategory. Categories without subcategories cannot be assigned until you add one. The subcategory selector includes parent names so identical names under different categories can be distinguished.
- Imported unique subcategory names determine their parent automatically, even when the imported parent differs. Repeated names need a matching parent hint or manual selection. Unknown names remain flagged for review. An optional default subcategory applies only to rows without a supplied subcategory. Older encrypted backups with unassigned subcategories remain readable; assign one when editing those transactions.
- Save older `.xls` files as `.xlsx` before importing. Mac Excel workbooks using the 1904 date system are supported.
- Scanned or image-only PDFs need OCR first, or a bank CSV/XLSX export. This app does not contain an OCR engine.
- PDF layouts are not standardized. The parser uses character positions and detected table headers to preserve amount columns. You can correct the extracted tab-separated text, map columns, exclude page headings, and edit rows. Review the imported table and totals against your original statement; your particular bank's statements have not yet been tested.
- Single imports are limited to 20 MB and 10,000 extracted rows; PDFs are limited to 150 pages. Expanded Excel XML is limited to 60 MB.
- Bar/line charts show up to 18 groups with an explicit note; the pivot and CSV contain all groups. Donuts combine groups after the first seven into Other and require nonnegative totals. Use a bar or line chart for a measure with negative totals.
- Historical annual budgets are visible in the yearly view. They are not silently divided into monthly allowances.

## Local encryption and backups

The vault uses Web Crypto AES-256-GCM with a random 12-byte IV for each save. PBKDF2-HMAC-SHA256 derives a non-extractable key from the password using a random 16-byte salt and 600,000 iterations. IndexedDB contains only the encrypted envelope, salt, IV and KDF parameters; the password is never stored. Imported source files and review drafts are not saved by the app.

Locking clears the active data/key references and form contents. In the Android wrapper, app backgrounding triggers a lock, and `FLAG_SECURE` protects app screenshots/recents. Explicit system file-picker interactions allow importing/exporting, with a five-minute picker timeout. These native lifecycle protections are implemented but not device-tested here.

There is **no password-reset service**. Keep your password safely. Uninstalling the app or clearing its data removes the local vault. Save an encrypted `.pocketledger` backup somewhere outside the app. Restoring requires the password used at backup time, previews record counts, and then explicitly replaces the current ledger. Older backups retain their original password after you change the current app password. CSV exports are not encrypted.

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

Verified in this workspace: 13 automated core tests and 16 browser workflow checks, covering category upload, subcategory-to-parent assignment, repeated subcategory names, required assignment during import review, INR/CHF/USD transactions, adjustment editing and export/reimport, duplicate exclusion, CSV/XLSX/PDF import, saved pivots, budget conflicts/history, timeline family ages, CSV exports, encrypted IndexedDB/backups, reload locking, wrong-password rejection, password rotation and backup restore. Responsive pages were checked at 390, 800 and 1280 CSS pixels. Screenshots were inspected visually. Native Android release compilation and lint passed. Real-device tests remain outstanding.

Dependencies are pinned in `package.json`: fflate 0.8.3 for XLSX ZIP data and clawpdf 0.3.0 / PDFium for local PDF extraction. Third-party licenses are included in the built assets under `licenses/`. The Android secure local-content approach follows [Android's WebView local-content guidance](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content); build compatibility follows [the AGP 8.9 release documentation](https://developer.android.com/build/releases/agp-8-9-0-release-notes).
