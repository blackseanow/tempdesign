#!/usr/bin/env bash
# Package only runtime assets. Run from any directory; source files are untouched.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
python3 - "$ROOT" <<'PY'
from pathlib import Path
import shutil, sys
root = Path(sys.argv[1])
site = root / 'site'
if site.is_symlink():
    raise SystemExit('Refusing to replace a symlink at site/')
if site.exists():
    shutil.rmtree(site)
pano = site / 'home-pano'
pano.mkdir(parents=True)
files = ['index.html', 'scene.json', 'anchors.json', 'mock.json']
dirs = ['css', 'src', 'vendor', 'fonts', 'icons', 'audio', 'img/tiles', 'img/door', 'img/patches']
for name in files:
    shutil.copy2(root / 'home-pano' / name, pano / name)
for name in dirs:
    shutil.copytree(root / 'home-pano' / name, pano / name)
shutil.copytree(root / 'anatomy', site / 'anatomy')
(site / 'index.html').write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/home-pano/"><title>咸鱼把脉了预览</title><a href="/home-pano/">打开预览</a></html>\n')
for p in site.rglob('*'):
    if p.is_symlink():
        raise SystemExit(f'Symlinks are not permitted: {p}')
for forbidden in ['img/src', 'checks', 'shots', 'tools', 'work']:
    assert not (pano / forbidden).exists(), forbidden
assert not list((pano / 'img').glob('pano*.png'))
assert not (pano / 'img/door.png').exists()
assets = [p for p in site.rglob('*') if p.is_file()]
print(f'Built site/: {len(assets)} files, {sum(p.stat().st_size for p in assets)/1024/1024:.2f} MiB')
PY
