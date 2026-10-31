# Pocket Ledger: maintainer and build guide

This file is the handoff for humans and coding agents. Read it before changing the app or producing an APK. Commands below use Windows PowerShell from the repository root unless stated otherwise. Do not substitute a new signing key, application ID, or empty vault to make an error disappear.

## Project and verified baseline

- Repository: `https://github.com/icarus3/pocket-ledger.git`; working branch: `main`.
- Prepared workspace: `C:\Ashish\android`. Scripts resolve the repository from their own location, so another checkout path is supported.
- Verified on **2026-10-31**: version **1.2.0**, Android `versionCode 4`, application ID and namespace **`com.pocketledger.local`**.
- Original release: 1.0.0 / code 1. The nine import, session, security and UI fixes shipped as 1.1.0 / code 2 (`9e5ebaf`). Amount replacement on focus and preserving import-row clicks shipped as 1.1.1 / code 3 (`ca04864`). These fixes are saved in Git; do not restart from the earlier report that none were saved.
- Current local signed APK: `releases/Pocket-Ledger-release.apk`; versioned copy: `releases/Pocket-Ledger-1.2.0.apk`. APKs, tool installations, caches and signing files are intentionally not tracked. A fresh clone will not contain them.
- Last full validation: 22 core/model tests, 36 browser workflows (26 existing plus 10 new), three scalability tests, one isolated encrypted-storage test, 500,000-row engine/import/save/reopen checks, 35 HTML screens with 35 PNG screenshots, responsive checks at 390/800/1280 CSS pixels, Android release compilation and lint. Lint reported one `SetJavaScriptEnabled` warning and no errors. APK package/version/certificate and bundled web assets were verified.
- No physical Android device was connected. Installation over an existing release, native file pickers and actual Android process death still need device verification. Browser lifecycle tests do not establish these device results.

Version **1.2.0 / versionCode 4** adds Valuation, Investment plan and Home loan plus 500,000-row statement handling and all-selected import review. The full desktop-browser stress flow verified 501,210 cumulative transactions after import and authenticated reopening. Physical-device capacity at 500,000 records is unverified.

Update this baseline when making a release. The source configuration is authoritative if version numbers change.

## First checks in an existing workspace

```powershell
Set-Location -LiteralPath C:\Ashish\android
git status --short
git branch --show-current
git log -3 --oneline
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-android.ps1 -CheckOnly
```

The check reports whether local Java, Gradle, SDK Manager, Platform 35, Build Tools 35 and `build-tools/READY.txt` exist. It does not prove every dependency is cached or that a release is signed. An offline build is the actual cache check.

A previous runner failed before shell startup with **`setup refresh had errors`**. This was an execution-environment failure, not evidence that the repository was damaged. In the current session, authorized elevated execution worked and ordinary file patches worked. If it recurs, use an available authorized execution path; do not weaken filesystem permissions or bypass an approval rejection. Verify access with a uniquely named temporary file inside the workspace, read it back, then remove only that file. Preserve unrelated edits and untracked files; never use a broad cleanup to resolve a setup failure.

## Architecture and files

| Path | Responsibility |
| --- | --- |
| `src/app.js` | Screens, event handlers, mutations, queued encrypted saves, import/edit drafts, auth/PIN flows, appearance and lifecycle handling. |
| `src/core.js` | Data validation, integer amounts, classification, CSV, aggregation, budgets, reports and timeline calculations. |
| `src/planning-model.js`, `src/planning.js`, `src/planning.css` | Backward-compatible planning data/validation, valuation pivots, investment month/year calculations, home-loan summaries, option management and section forms. |
| `src/imports.js` | CSV/TSV, XLSX ZIP/XML and local PDF parsing. |
| `src/vault.js` | IndexedDB, Web Crypto, legacy password vaults, PIN/recovery key wrapping. |
| `src/ui.js`, `src/styles.css`, `src/index.html` | Shared UI/charts, responsive themes and document shell. |
| `src/demo.js`, `samples/` | Fictional preview data and sample imports. Never put real financial data here. |
| `android/app/src/main/java/com/pocketledger/local/MainActivity.java` | Secure-origin WebView, native file import/export, background/resume and Android appearance bridge. |
| `android/app/src/main/AndroidManifest.xml` | Android configuration; no Internet permission, backups disabled. |
| `android/app/build.gradle` | App ID, version, SDK levels, Java language level and private signing configuration. |
| `scripts/build.mjs` | esbuild bundle, parser assets/licenses and copies into Android assets. |
| `scripts/serve.mjs` | Loopback-only preview server on port 4173, serving `dist/`. |
| `scripts/prepare-android.ps1` | Download verification, extraction, SDK installation and dependency-cache preparation. |
| `scripts/build-apk.ps1` | Native build/lint, existing-key checks and copy to `releases/`. |
| `tests/core.test.mjs` | Pure calculation, validation and import rules. |
| `tests/planning.test.mjs`, `tests/planning-ui.mjs` | Planning math/validation, section workflows, option lists, duplicate selection, saved drafts and optional 500,000-row browser stress. |
| `tests/scalability.test.mjs`, `tests/workspace.test.mjs` | 500,000-row import/calculation/encryption checks and isolated encrypted-workspace compatibility/tamper checks. |
| `tests/ui.mjs`, `tests/update-ui.mjs`, `tests/fixtures.mjs` | Browser workflows and generated fixtures. |
| `scripts/previews.mjs` | Interactive fictional demo, screen HTML, PNGs and responsive checks. |
| `scripts/package.py` | Source/preview ZIPs, APK copy and SHA-256 manifest; excludes signing credentials. |

This is plain JavaScript bundled with esbuild, inside a native Java Android WebView. There is no hosted backend, account, cloud sync or runtime dependency download. Native content loads from `https://appassets.androidplatform.net/assets/www/index.html` using AndroidX WebViewAssetLoader. Keep that origin stable because WebView storage belongs to the origin. JavaScript targets Chromium 110; use a compatible Android System WebView/Chrome.

`npm run build` writes `dist/` and copies it into **tracked** `android/app/src/main/assets/www/`. It bundles JavaScript, combines `styles.css` and `planning.css`, and copies HTML, samples, clawpdf/PDFium WASM and third-party licenses. Edit `src/`, then rebuild; do not hand-edit the minified Android bundle. `dist/` is ignored. The native assets and `previews/` are tracked so a checkout can build an APK without Node.js and open visual previews.

## Behavior that must be preserved

### Money, classification and import review

- Keep INR, CHF and USD separate in data, totals, budgets, reports and timeline plans. Do not introduce implicit currency conversion.
- Preserve **Debit → Final debit → Credit** ordering in forms, tables and exports. Amounts are integer minor units. `finalDebit = debit - credit + adjustment`; a negative result represents money received. Importing exported final debit must preserve the adjustment.
- Category and subcategory are optional. Ledger rows have dropdowns directly in the table. Selecting a subcategory assigns its parent category. Repeated subcategory names are distinguished by parent; UI option values encode `[categoryId, subcategory]` rather than relying on a globally unique name.
- Preserve imported `rawValues` and source-row information even after correction. Unknown, invalid, unsafe or fractional-cent amounts stay unresolved (`null`), never silently become zero. Explicitly recognized empty/dash bank conventions are handled by the parser; do not use a blanket `Number(value) || 0` conversion.
- Users can finalize imported rows before fixing them. Flag them with `needsReview`, show the reason, exclude unresolved rows from calculated totals, and allow later edits. CSV exports retain raw values and review status.
- Unknown or ambiguous imported classification remains available for review. Only a unique subcategory match, or a match with a valid parent hint, may infer the parent. Defaults must not override supplied unresolved subcategories.
- Both transaction and category XLSX uploads support worksheet selection. Keep namespace-aware XML handling, normalized relationship paths, shared and inline strings, and the Excel 1904 date system. Cell errors and formulas without cached values must remain reviewable.
- Supported formats are CSV/TSV, `.xlsx` and selectable-text PDF, including password-protected PDF. Legacy `.xls` must be resaved as `.xlsx`; image-only PDFs require external OCR. PDF parsing is local through clawpdf/PDFium.
- Limits: 128 MB per CSV/TSV input; 20 MB per XLSX or PDF; up to 500,000 transaction rows plus a header per statement worksheet; 60 MB expanded XLSX contents; 150 PDF pages; category imports accept 1–1,000 rows. Encrypted backup restores accept up to 512 MB. These limits replace the old 10,000-row/20-MB-everywhere policy; retain the format-specific limits when changing parsing.
- Import review starts with every row selected. Do not automatically detect, exclude or block duplicate-looking rows. Select all and Deselect all apply across every page, including repeated rows. Render 100 review rows per page and preserve edits using absolute source indexes. Finalization includes every selected row, including unresolved rows flagged for later review.
- Large ledgers must avoid rendering entire statements, spreading hundreds of thousands of function arguments, or allocating a string per base64 byte. Preserve the separate encrypted workspace-save path so changing a filter or draft does not repeatedly clone and reseal a 500,000-record ledger. Desktop/browser stress checks do not establish memory/storage capacity on a physical tablet.
- Decimal points are decimal separators; commas are grouping separators. ISO dates and Excel serial dates work; the INR default date convention is day/month/year. Do not infer a bank balance from statement headings or totals.

### Amount-field interaction

On first mouse/touch focus or keyboard focus, a monetary field selects its existing contents so typing `233` replaces `0.00` or a previous amount. Subsequent clicks within that focused field must still allow editing individual digits. Test with real typing/clicks, not only Playwright `.fill()`, which bypasses this interaction.

Import review uses `refreshReview()` to update totals, warnings and counts in place. Re-rendering the entire table on a field's blur/change can remove the control the user is clicking and swallow the next action. Preserve focus and clicks when editing a number and then selecting a category, excluding a row or finalizing an import.

### Session, drafts, PIN and recovery

- Brief app switches retain the unlocked session. Backgrounding requests an encrypted progress save. The default inactivity timeout is five minutes; supported choices are 1, 2, 5, 10 and 15 minutes. Explicit lock and expiry save first, then clear active plaintext/key references and form contents.
- `data.workspace` holds the saved screen/filter state, import worksheet/header/mapping/review/exclusions and unfinished form fields. Capture changes while typing as well as at lifecycle boundaries; the OS may kill a background process before a last-minute asynchronous save finishes.
- Large-ledger/draft progress can be stored separately under key `workspace` in the same IndexedDB `vault` store, encrypted with the active nonextractable data key, a fresh 12-byte IV and authenticated label `PocketLedger:workspace:v1`. Its `baseIv` binds it to the current primary envelope. Apply it only when the primary IV matches; a full envelope save removes it atomically. Keep the original `primary` envelope and backup format compatible. Backup creation consolidates current workspace progress into the encrypted payload before export. Never treat a damaged matching workspace record as an empty draft.
- Chromium imposes a serialized-size limit on each IndexedDB value. Large `primary` and `workspace` ciphertexts use transparent chunks of at most 4,194,304 base64 characters (4 MiB ASCII text), with `_ciphertextChunks` metadata and keys `<record>:ciphertext:<index>`. Commit each record's metadata/chunks and removal of its prior chunks atomically; reject missing or invalid chunks. `readEnvelope()` reassembles the original envelope and strips internal chunk metadata before callers decrypt or export it. Read existing unchunked records directly. This is a local storage layout detail, not a v1/v2 encryption-envelope migration; backup envelopes retain their original format.
- Reopening after process termination requires authentication, then restores saved progress. Do not drop an in-memory import when locking. Preserve pending forms across the PIN-recovery flow (`suspendedDraft` handling).
- Password and file inputs are not persisted as form drafts. No ledger, import contents or edit draft belongs in plaintext localStorage or logs.
- New ledgers use a user-chosen four-digit PIN plus a recovery password of at least ten characters. Existing password vaults remain readable. Migrate only after successful authentication; the original password becomes the recovery password when setting up a PIN.
- PIN changes and recovery must preserve transactions and drafts. An authentication/decryption error must never silently initialize or replace the vault. If both PIN and recovery password are lost, there is no remote reset that can recover the data.
- Encrypted backups retain the credentials used at backup creation. Restore previews the contents and explicitly replaces the current ledger. Do not silently merge or overwrite on a failed restore.
- Android uses `FLAG_SECURE`, disables Android backup and has a five-minute native file-picker timeout. Keep these protections and test the native lifecycle separately from browser events.

Encryption details for compatibility work: IndexedDB database `pocket-ledger-secure`, store `vault`, key `primary`. Payload encryption is AES-256-GCM with a random 12-byte IV and authenticated-data string `PocketLedger:v1`. Legacy envelope version 1 uses PBKDF2-HMAC-SHA256 with a 16-byte salt, normally 600,000 iterations; supported stored iteration counts are validated between 100,000 and 2,000,000. Version 2 uses a random data key independently wrapped by the PIN and recovery password, each with a fresh salt, PBKDF2 at 600,000 iterations and authenticated key-slot labels. Imported active keys are nonextractable; transient raw key bytes are cleared. Envelope version and payload schema version are distinct concepts. Change formats only with explicit migration and compatibility tests.

### Other UI and calculation rules

- `data.planning` is optional for older ledgers/backups; validate it when present without inventing or overwriting an existing vault on errors. Default option lists are created when a new ledger or first planning mutation needs them.
- Valuation uses account type, parent-qualified subtype, month, year and category dropdowns, plus value and currency. Manage those option lists within Valuation. Pivots group by account type, subtype, category, month or year and sum values or count rows in one currency. Values are snapshots; summing months sums snapshots rather than calculating investment returns. Preserve parent-qualified subtype labels and dependent subtype choices when restoring drafts.
- Investment plan manages investment types in the same section. Plans store details, account reference, start/end dates, monthly amount and currency. One contribution is scheduled per active calendar month, including both start and end months; yearly totals count only active months in that year. Actual invested amounts are separate monthly totals; replacing one month must not duplicate it. An empty end date means ongoing. Do not change currency while actual amounts exist.
- Home loan has cost components (type, reference percentage, to-pay and paid), a numbered repayment schedule (payment type, agreement value, reference percentage, to-pay, demand amount, paid and comment), and dated status snapshots (approved, disbursed, cumulative principal and interest paid). Summarize costs by component; keep cost and repayment totals separate. Loan summaries use the latest dated snapshot in the selected currency, never the sum of cumulative snapshots. Outstanding principal is disbursed minus principal paid. Percentages do not silently recalculate entered agreement/demand amounts.

- Money Timeline has explicit family add/edit/delete controls and member selection. `settings.timelineMembers` persists selected IDs. Each selected member gets a separate age column in the timeline and CSV.
- Timeline calculations use whole months, an effective annual-to-monthly return conversion and month-end contributions. Inflation affects the target. Milestones are independent plans, with no automatic allocation of the same savings between goals.
- Appearance choices are Light, Dark and System; system changes include the Android bridge. Only the non-sensitive preference is cached in localStorage (`pocket-ledger-appearance`) to theme the unlock screen.
- Budgets retain historical plans. Monthly and annual plans cannot overlap for the same category/year/currency. Annual budgets are not silently divided into monthly allowances.
- Saved reports support bar, line, donut and pivot forms. Bar/line displays cap at 18 groups with a notice; pivot/CSV retain all groups. Donuts group after seven into Other and require nonnegative totals.

## Toolchain: exact prepared versions

The following is the **installed, tested snapshot**, read from executables, package configuration and SDK `source.properties` on 2026-10-19. It is not a claim about the latest available releases.

| Component | Verified version | Local location or configuration |
| --- | --- | --- |
| Eclipse Temurin JDK, Windows x64 HotSpot | **21.0.12.1+1 LTS** | `build-tools/java/jdk-21.0.12.1+1/` |
| Gradle | **8.11.1** | `build-tools/gradle-8.11.1/bin/gradle.bat` |
| Android Gradle Plugin | **8.9.2** | `android/build.gradle` |
| Android SDK Command-line Tools | **22.0**, ZIP build **15859902** | `build-tools/sdk/cmdline-tools/latest/` |
| Android SDK platform | **API 35 / Android 15, revision 2**, extension level 13 | `build-tools/sdk/platforms/android-35/` |
| Android SDK Build Tools | **35.0.0** | `build-tools/sdk/build-tools/35.0.0/` |
| Android Platform Tools | **37.0.1** | `build-tools/sdk/platform-tools/` |
| AndroidX WebKit | **1.12.1** | `android/app/build.gradle` |
| Node.js | **24.19.0** | Installed on PATH; README baseline is Node 22+ |
| npm | **11.17.0** | Installed on PATH; use `npm.cmd` in PowerShell |
| Python | **3.13.9** | Installed on PATH; used only for packaging |
| Chrome | **155.0.8059.82** | `C:/Program Files/Google/Chrome/Application/chrome.exe` |
| esbuild / Playwright | **0.28.1 / 1.58.2** | Exact direct versions in `package.json` |
| clawpdf / fflate | **0.3.0 / 0.8.3** | Exact direct versions in `package.json` |

Android compiles Java source/target level **17**, even when Gradle runs on JDK 21. `compileSdk` and `targetSdk` are 35; `minSdk` is 26. Gradle uses a 2 GB maximum heap. There is no checked-in Gradle wrapper: use the scripts or the prepared `gradle.bat`.

There is currently **no tracked npm lockfile**. Use `npm.cmd install`, not `npm ci`. Direct versions are pinned; transitive resolution and dynamically downloaded SDK/JDK updates mean a fresh setup is not guaranteed to be byte-for-byte identical. Keep verified archives/caches if exact environment reproduction is needed. The setup script resolves the latest Temurin 21 and Platform Tools at setup time; it reuses an already extracted local JDK.

## Where the tools came from and how they were extracted

`build-tools/READY.txt` records successful preparation at **2026-10-18T11:53:38.9894010-05:00**. The process is encoded in `scripts/prepare-android.ps1`; `build-tools/setup.log` is its local transcript. Archives are retained in `build-tools/downloads/`. No system-wide environment variables are changed.

| Archive retained locally | SHA-256 verified in this workspace |
| --- | --- |
| `OpenJDK21U-jdk_x64_windows_hotspot_21.0.12.1_1.zip` | `f9d6e191ab098c0d416e7d588a24420a8621cd2f4720dab2459b8b7b2d2d8b4e` |
| `gradle-8.11.1-bin.zip` | `f397b287023acdba1e9f6fc5ea72d22dd63669d59ed4a289a29b1a76eee151c6` |
| `commandlinetools-win-15859902_latest.zip` | `90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a` |

The preparation script performs these steps:

1. **Java:** requests the official [Adoptium Temurin 21 Windows x64 metadata](https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse), takes the package URL/name/checksum, downloads the ZIP if missing, and verifies SHA-256 before extraction. `Expand-Archive` extracts into `build-tools/java/`; the ZIP's own `jdk-21.0.12.1+1` directory contains `bin/javac.exe`. Existing extracted Java is reused.
2. **Gradle:** downloads [gradle-8.11.1-bin.zip](https://services.gradle.org/distributions/gradle-8.11.1-bin.zip) and its official `.zip.sha256` metadata, verifies the archive, then extracts into `build-tools/`. The ZIP supplies the `gradle-8.11.1` directory.
3. **Android command-line tools:** downloads Google's [commandlinetools-win-15859902_latest.zip](https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip), verifies the checksum pinned in the script, and extracts into `build-tools/command-line-archive/`. It copies the **contents** of that archive's `cmdline-tools/` into `build-tools/sdk/cmdline-tools/latest/`. The correct result is `latest/bin/sdkmanager.bat`, not `latest/cmdline-tools/bin/sdkmanager.bat`.
4. **SDK packages:** invokes SDK Manager with `--sdk_root` pointing at `build-tools/sdk`, prompts for license review, then installs `platforms;android-35`, `build-tools;35.0.0` and `platform-tools`. SDK Manager downloads/extracts those packages into their standard SDK directories. Enter `y` for licenses only if you agree; do not automate someone else's consent.
5. **Project dependencies:** writes ignored `android/local.properties` with `sdk.dir`, runs Gradle `assembleRelease lint --no-daemon --console=plain`, and caches Android/Maven dependencies in `build-tools/gradle-cache/`. Only after success does it write `READY.txt`. A preliminary release can be unsigned when private signing files are absent; the marker does not certify a distributable APK.

To inspect a retained archive without extracting it:

```powershell
Get-FileHash -LiteralPath build-tools/downloads/gradle-8.11.1-bin.zip -Algorithm SHA256
```

For manual restoration of the exact retained snapshot, first compare **all three** archive hashes with the table. Then the equivalent extraction commands are:

```powershell
Expand-Archive -LiteralPath build-tools/downloads/OpenJDK21U-jdk_x64_windows_hotspot_21.0.12.1_1.zip -DestinationPath build-tools/java -Force
Expand-Archive -LiteralPath build-tools/downloads/gradle-8.11.1-bin.zip -DestinationPath build-tools -Force
Expand-Archive -LiteralPath build-tools/downloads/commandlinetools-win-15859902_latest.zip -DestinationPath build-tools/command-line-archive -Force
New-Item -ItemType Directory -Force -Path build-tools/sdk/cmdline-tools/latest | Out-Null
Get-ChildItem -LiteralPath build-tools/command-line-archive/cmdline-tools | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination build-tools/sdk/cmdline-tools/latest -Recurse -Force
}
```

Extraction alone does not install SDK platforms, accept licenses or populate Gradle dependencies. Run the preparation script afterward to finish those steps. For an entirely offline environment, preserve the prepared SDK including license records and dependency caches as well as the ZIPs. The preparation script itself requires network access for missing packages/metadata; it is not an offline installer.

The build script also has a Gradle-download fallback: it verifies the official checksum and extracts the same Gradle version, but stores its ZIP at `build-tools/gradle-8.11.1-bin.zip` rather than `build-tools/downloads/`. Both locations may exist.

## Fresh-machine setup

Use a Windows x64 machine with Git and PowerShell. Node/npm are needed for source changes, browser tests and preview generation; Python is needed for delivery ZIPs. Building already bundled Android assets does not need Node or Python. Chrome is used for browser tests; no Playwright-managed browser download is required by the current scripts.

```powershell
git clone https://github.com/icarus3/pocket-ledger.git
Set-Location -LiteralPath pocket-ledger
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-android.ps1
```

Alternatively double-click `Prepare-Android-Tools.cmd`. Keep internet available for initial preparation and review the SDK license prompts. Downloads are checksum-verified and reused after a failed attempt. If downloading manually, preserve exact ZIP filenames in `build-tools/downloads/`. A future Temurin metadata response can name a newer ZIP; to restore the exact old JDK, verify/extract the retained archive as above before rerunning preparation.

The scripts use process-local variables:

```text
JAVA_HOME=<repo>/build-tools/java/<extracted JDK directory>
ANDROID_HOME=<repo>/build-tools/sdk
ANDROID_SDK_ROOT=<repo>/build-tools/sdk
ANDROID_USER_HOME=<repo>/build-tools/android-user
GRADLE_USER_HOME=<repo>/build-tools/gradle-cache
```

The APK script also sets `npm_config_cache` to `<repo>/.tools/npm-cache`. `android/local.properties` is generated with the absolute SDK path and must not be committed. Moving the checkout is supported by rerunning the build script, which rewrites that file; the old `READY.txt` paths are merely historical.

Android Studio is an alternative: install SDK Platform 35 and Build Tools 35.0.0, accept licenses, and use JDK 17 or 21. The build script prefers the prepared local JDK/SDK, then existing `JAVA_HOME` and SDK environment variables; for Java it can fall back to the usual Android Studio `jbr` directory. The SDK fallback is `%LOCALAPPDATA%/Android/Sdk`. Set `JAVA_HOME` and `ANDROID_HOME` explicitly for nonstandard installations. Use the tested tool versions when diagnosing compatibility errors.

## Edit, test and refresh previews

Install the JavaScript dependencies once with network access:

```powershell
npm.cmd install --no-audit --no-fund
npm.cmd run build
npm.cmd test
npm.cmd start
```

Leave the last command running in that terminal. In a second PowerShell terminal, enter the same repository directory and run:

```powershell
npm.cmd run test:ui
node --test tests/workspace.test.mjs
npm.cmd run test:scale
node scripts/previews.mjs
```

The sequence matters: `tests/update-ui.mjs` creates `test-results/fixtures/categories-multi.xlsx`, which preview generation uses. Run the browser tests before generating previews in a fresh checkout. Browser tests and previews expect `http://127.0.0.1:4173`; override the Chrome executable if necessary before running them:

```powershell
$env:CHROME_PATH = 'D:\Applications\Chrome\Application\chrome.exe'
```

Use `http://127.0.0.1:4173/?demo=1` for fictional data or the same URL without the query for a separate local encrypted test ledger. `localhost` and `127.0.0.1` are different browser storage origins; the native Android origin is separate again. The file `previews/interactive-demo.html` supports temporary fictional interactions, but encrypted storage/PDF tests need localhost or the native app.

The server serves **`dist/`**, with no automatic source rebuild. After changing source, rerun `npm.cmd run build` before browser checks, previews or an APK using bundled assets. If port 4173 is occupied, first check whether the existing server belongs to this checkout and serves the current bundle. Stop only a process you own; do not blindly terminate unrelated processes.

Check meaningful behavior affected by a change. For releases, run the core/model tests, existing browser suites and planning suite, regenerate previews, inspect representative screenshots, and run native compilation/lint. The 22 core/model tests and existing 26 browser checks cover the original workflows plus planning math/validation. Planning browser checks add option management, valuation pivots/currency separation, investment active-month/year totals and actuals, home-loan cumulative snapshots, encrypted drafts/reopen and bulk selection of duplicate rows. Run `node --test tests/workspace.test.mjs` for isolated encrypted-draft integrity and `npm.cmd run test:scale` for the 500,000-row calculation/import/encryption workload. With the preview server running, set `$env:PL_STRESS = '1'` and run `node tests/planning-ui.mjs` for the full 500,000-row browser import/save/reopen workload. Record observed timings and limits after success; do not claim physical-device capacity from desktop tests. Do not replace these checks with tests that merely repeat implementation details.

During 1.2.0 validation, an isolated Chrome engine/IndexedDB run saved and PIN-reopened 500,000 fictional records in approximately 7.4 seconds after implementing chunked ciphertext storage. The full browser workflow uploaded a fictional 15,888,925-byte CSV containing 500,000 rows: review 6,724 ms; encrypted draft save/lock/reopen 11,037 ms; final import 5,523 ms; authenticated ledger reopen 1,976 ms. It verified 501,210 cumulative transactions. These desktop measurements do not establish physical-tablet capacity.

## Build an APK

### Existing prepared workspace, release update

Both private files must already exist: `android/personal-release.jks` and `android/keystore.properties`. Restore them only from the owner's secure backup. Do not print their contents or put passwords in command lines, documentation or commits.

If source changed, rebuild the web assets first:

```powershell
npm.cmd run build
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-apk.ps1 -UseBundledAssets -Offline
```

For a native-only rebuild of already refreshed assets, just run the second command. `-Offline` prevents Gradle downloads; it works after the SDK and project dependencies have been prepared. Without `-UseBundledAssets`, the script rebuilds the web assets itself and needs installed Node dependencies. Without `-Offline`, missing Gradle/dependencies may be downloaded.

The script runs `assembleRelease` plus `lint`, then copies:

```text
android/app/build/outputs/apk/release/app-release.apk
  -> releases/Pocket-Ledger-release.apk
```

`Build-Android.cmd` runs the same script with **`-UseBundledAssets`** and no offline flag. Double-clicking it does not rebuild source edits. Always refresh assets first when changing the interface.

### Fresh contributor checkout without the private key

After preparation, build a debug APK:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-apk.ps1 -DebugBuild -UseBundledAssets -Offline
```

Output: `releases/Pocket-Ledger-debug.apk`. Use a clean emulator or test device. It uses the same application ID but a debug signing key, so it cannot update the installed private release. Do not uninstall a user's real ledger or clear app data to get around the mismatch.

The release script deliberately refuses to generate a replacement key. Without the existing private signing files, a contributor can build/debug the app but cannot produce a compatible update for existing users. A direct Gradle unsigned release is not a substitute for the verified signed APK.

## Release identity, verification and installation

For every new distributed app update:

1. Increase `versionCode` in `android/app/build.gradle`. Keep its `versionName` and `package.json` version consistent. The current verified baseline is 1.2.0 / code 4. Documentation-only commits do not require an app version bump.
2. Preserve application ID **`com.pocketledger.local`**, native content origin and the existing private signing key.
3. Build/test/refresh assets and previews, then build the signed release as above. Do not distribute an APK built before the final source changes.
4. Verify package identity, version and signing certificate. Compare bundled APK assets with the final web build when releasing UI changes.
5. Keep an encrypted backup outside the app before testing an update. Install over the existing release; do not uninstall first.

The original release's **public signing certificate SHA-256** is:

```text
8700482768fc9127d5c5e75504764264aad26bc7630544e2f024061feb1ee330
```

This fingerprint is public verification information, not a private credential. It must match update APKs. To inspect the APK using prepared tools:

```powershell
$jdkDir = Get-ChildItem -LiteralPath build-tools/java -Directory | Where-Object {
    Test-Path -LiteralPath (Join-Path $_.FullName 'bin/java.exe')
} | Sort-Object Name -Descending | Select-Object -First 1
$env:JAVA_HOME = $jdkDir.FullName
& ./build-tools/sdk/build-tools/35.0.0/apksigner.bat verify --print-certs releases/Pocket-Ledger-release.apk
& ./build-tools/sdk/build-tools/35.0.0/aapt.exe dump badging releases/Pocket-Ledger-release.apk | Select-String '^package:'
Get-FileHash -LiteralPath releases/Pocket-Ledger-release.apk -Algorithm SHA256
```

Stop if signature verification fails or the fingerprint/application ID differs. The verified local **1.2.0** APK is **3,049,823 bytes**, with SHA-256 `c969c5d10bd02031114ccda2aca58c095c9304ffd5d5ead32a51056ba0c193ee`. The historical 1.1.1 APK SHA-256 was `11ee80e840eb9d6e2c8474bc6b131dc3564ad0a93046db663c4f02f61b43ef14`. A later build can have a different file hash; identity, signature, contents and version must still be checked.

The APK is a ZIP. Its `assets/www/app.js`, `assets/www/styles.css` and `assets/www/index.html` should match the corresponding final `dist/` files byte-for-byte. Native build/lint reports live under `android/app/build/outputs/` and `android/app/build/reports/`. The last local release evidence is `releases/verification-1.2.0.json`; it is ignored, so a fresh clone must repeat verification rather than assume that file is present.

Copy the release APK to the tablet and open it in Files, permitting installation from that source when Android asks. With an authorized USB-debugging test device, an alternative is:

```powershell
& ./build-tools/sdk/platform-tools/adb.exe devices
& ./build-tools/sdk/platform-tools/adb.exe install -r releases/Pocket-Ledger-release.apk
```

If more than one device is connected, select the intended device explicitly with `adb -s SERIAL`. Do not run uninstall or clear-data commands as part of an update. Verify on device: old credentials/data survive; PIN setup/change/recovery preserves a pending draft; home/app switch and timeout behave correctly; killing/reopening restores the saved import/form after unlock; CSV/XLSX and category worksheet pickers work through native file selection; exports can be saved; appearance follows System; first tap and typing replaces an amount.

## Package and share deliverables safely

After release verification and preview generation:

```powershell
python scripts/package.py
```

This creates:

```text
deliverables/Pocket-Ledger-source-and-previews.zip
deliverables/Pocket-Ledger-HTML-previews.zip
deliverables/Pocket-Ledger-release.apk       (if the release APK exists)
deliverables/SHA256SUMS.txt
```

The source ZIP includes this `AGENTS.md`, README, source, scripts, tests, native assets and previews, plus the release APK if available. The preview ZIP also includes both documentation files. Packaging deliberately excludes `build-tools/`, `node_modules/`, Gradle/build caches, `local.properties`, `keystore.properties`, private-key extensions and `.env` files. The source ZIP is a source handoff, not a portable offline toolchain; its recipient follows fresh-machine setup. If maintaining the optional root `previews.zip`, copy it explicitly from `deliverables/Pocket-Ledger-HTML-previews.zip`; the packaging script does not update that alias.

Inspect ZIP entries before sharing. Never include signing credentials, real ledger/statement fixtures, local secret files or sensitive logs. Signing files and encrypted user backups need their own owner-controlled secure storage; do not attach them to a repository or public release. Preserve third-party notices under the built app's `licenses/` directory.

## Git handoff and troubleshooting

Before committing, inspect `git status --short` and `git diff --check`. Stage intended files explicitly. For UI releases this normally includes source, tests, version/docs, rebuilt `android/app/src/main/assets/www/` and refreshed `previews/`. Toolchains, credentials, APKs and delivery archives remain ignored. Do not force-add them. Verify staged paths and content before committing. Commit/push to `main` when authorized by the user; do not overwrite someone else's remote changes.

| Symptom | What to check |
| --- | --- |
| `setup refresh had errors` before any command output | Execution helper/sandbox startup. Use an authorized working tool path and verify a reversible workspace write; do not assume the app code failed. |
| `npm.ps1` blocked by execution policy | Use `npm.cmd`. Project scripts use a process-scoped PowerShell execution-policy option; do not change machine policy. |
| `sdkmanager.bat` missing after extraction | Correct layout is `sdk/cmdline-tools/latest/bin/`; remove unintended nesting by restoring the verified extraction layout. |
| Archive checksum mismatch | Stop using that archive. Obtain the exact official archive again and verify it; do not disable verification. |
| SDK licenses/dependencies unavailable | Complete preparation in a network-enabled terminal with the user's license agreement. Preserve useful downloads and read `build-tools/setup.log`. |
| Offline build cannot resolve a dependency | Cache is incomplete. Run preparation or an online build once; `READY.txt` alone is not sufficient proof. |
| APK or preview shows old UI | Rebuild `src/` into `dist/` and native assets. Confirm the port-4173 server serves this checkout, then regenerate previews/rebuild the APK. |
| Preview generation cannot find `categories-multi.xlsx` | Run `npm.cmd run test:ui` first to generate the fixture. |
| Chrome executable cannot be found | Install Chrome or set `CHROME_PATH` to its real executable before tests/previews. |
| Signature mismatch / release files missing | Restore the original private signing files securely. Never generate a new key or uninstall a real ledger as a workaround. |
| Unlock, migration or restore fails | Preserve the existing ciphertext and report the error. Never reset the database or replace unresolved amounts to make validation pass. |

Keep this guide aligned with the actual scripts and observed results. Record tool/version changes and remaining device checks honestly; do not report a build, test, push or installation as successful without its output.
