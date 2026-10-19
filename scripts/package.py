from pathlib import Path
import hashlib
import zipfile
import shutil

root = Path(__file__).resolve().parent.parent
destination = root / 'deliverables'
destination.mkdir(exist_ok=True)
source_files = ['package.json', 'README.md', 'AGENTS.md', 'Build-Android.cmd', 'Prepare-Android-Tools.cmd', '.gitignore']
trees = ['src', 'samples', 'scripts', 'tests', 'android', 'previews']
excluded = {'.gradle', 'build', 'node_modules', '__pycache__'}

def safe_files():
    for name in source_files:
        yield root / name
    for name in trees:
        for file in (root / name).rglob('*'):
            if not file.is_file() or any(part in excluded for part in file.relative_to(root).parts):
                continue
            if file.name in {'local.properties', 'keystore.properties'} or file.suffix.lower() in {'.jks', '.keystore', '.p12', '.pfx'} or file.name == '.env' or file.name.startswith('.env.'):
                continue
            yield file

source = destination / 'Pocket-Ledger-source-and-previews.zip'
with zipfile.ZipFile(source, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for file in safe_files():
        archive.write(file, 'Pocket-Ledger/' + file.relative_to(root).as_posix())
    apk = root / 'releases' / 'Pocket-Ledger-release.apk'
    if apk.is_file():
        archive.write(apk, 'Pocket-Ledger/releases/' + apk.name)

preview = destination / 'Pocket-Ledger-HTML-previews.zip'
with zipfile.ZipFile(preview, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for file in (root / 'previews').rglob('*'):
        if file.is_file():
            archive.write(file, file.relative_to(root).as_posix())
    archive.write(root / 'README.md', 'README.md')
    archive.write(root / 'AGENTS.md', 'AGENTS.md')

artifacts = [source, preview]
apk = root / 'releases' / 'Pocket-Ledger-release.apk'
if apk.is_file():
    delivered_apk = destination / apk.name
    shutil.copy2(apk, delivered_apk)
    artifacts.append(delivered_apk)

checksums = []
for file in artifacts:
    digest = hashlib.sha256(file.read_bytes()).hexdigest()
    checksums.append(f'{digest}  {file.name}')
    print(f'{file.name}: {file.stat().st_size / 1024 / 1024:.2f} MB')
(destination / 'SHA256SUMS.txt').write_text('\n'.join(checksums) + '\n', encoding='utf-8')
