from pathlib import Path
import hashlib
import zipfile
import json

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text())['version']
release = root / 'release' / version
archive = release / f'Xtrend-{version}-source.zip'
excluded = {'node_modules', '.wxt', '.output', '.git', '.codegraph', '.firecrawl', 'test-results', 'release', 'dist-preview', '__pycache__'}
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as output:
    for path in sorted(root.rglob('*')):
        relative = path.relative_to(root)
        if path.is_file() and not any(part in excluded for part in relative.parts):
            output.write(path, Path('Xtrend') / relative)

lines = []
for path in sorted(release.glob('*.zip')):
    with zipfile.ZipFile(path) as bundle:
        if bundle.testzip() is not None:
            raise RuntimeError(f'Invalid archive: {path.name}')
        if path.name != archive.name and 'manifest.json' not in bundle.namelist():
            raise RuntimeError(f'Missing manifest: {path.name}')
    lines.append(f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}')
(release / 'SHA256SUMS.txt').write_text('\n'.join(lines) + '\n')
print('\n'.join(lines))
