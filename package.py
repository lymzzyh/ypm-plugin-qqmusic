#!/usr/bin/env python3
"""只打包明确列出的插件文件，不收集临时测试数据或凭据。"""
import hashlib
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent
manifest = json.loads((root / 'plugin.json').read_text())
out = root / 'dist'
out.mkdir(exist_ok=True)
archive = out / f"YesPlayMusic-qqmusic-{manifest['version']}.zip"
files = [root / name for name in [
    'plugin.json', 'icon.png', 'index.js', 'client.js', 'login.js', 'crypto.js',
    'mqtt.js', 'qr.js', 'routing.js', 'models.js', 'lyrics.js', 'i18n.js', 'LICENSE',
    'THIRD_PARTY_MIT_LICENSE', 'THIRD_PARTY_NOTICES.md', 'README.md',
    'README.zh-CN.md', 'build-helper.sh', 'package.py',
]]
for directory in ['bin', 'vendor', 'locales', 'helper', 'test']:
    files.extend(p for p in (root / directory).rglob('*') if p.is_file())
for program in manifest['permissions']['process']:
    if program.startswith('bin/') and not (root / program).is_file():
        raise SystemExit(f'缺少通道程序：{program}')
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for file in sorted(files):
        z.write(file, 'ypm-plugin-qqmusic/' + file.relative_to(root).as_posix())
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(out / 'SHA256SUMS.txt').write_text(f'{digest}  {archive.name}\n')
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert sum(f.file_size for f in z.infolist()) < 200 * 1024 * 1024
assert archive.stat().st_size < 50 * 1024 * 1024
print(f'{archive} ({archive.stat().st_size / 1024 / 1024:.1f} MiB)')
