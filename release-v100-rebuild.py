import base64, gzip, hashlib, json
from pathlib import Path
old = b''.join(p.read_bytes() for p in sorted(Path('release-v89-parts').glob('part-*')))
assert hashlib.sha256(old).hexdigest() == '360dfee6184435484e5034c277bec1a49d5e0d2277875f5a710c82d9214569cf'
patch = b''.join(p.read_bytes() for p in sorted(Path('release-v100-parts').glob('part-*')))
ops = json.loads(gzip.decompress(patch))
new = b''.join(base64.b64decode(op[1]) if op[0] == 'd' else old[op[1]:op[1]+op[2]] for op in ops)
assert len(new) == 67026432
assert hashlib.sha256(new).hexdigest() == '02ffb347d1dd375377627d45fcfc58b534037f81fdc3c1b62193c5399fb50f95'
out = Path('release-v100')
out.mkdir(exist_ok=True)
(out/'Mc5mr-Equicord-Installer.exe').write_bytes(new)
asar = new[11902242:11902242+54661104]
assert hashlib.sha256(asar).hexdigest() == '939bb464ff630df77ecdff1a1a826c0bc6f72bfa764dc8c29eaa65c887d3e323'
(out/'desktop.asar').write_bytes(asar)
(out/'desktop.sha256').write_text('939bb464ff630df77ecdff1a1a826c0bc6f72bfa764dc8c29eaa65c887d3e323\n')
(out/'Mc5mr-Equicord-Installer.exe.sha256').write_text('02ffb347d1dd375377627d45fcfc58b534037f81fdc3c1b62193c5399fb50f95\n')
source = b''.join(p.read_bytes() for p in sorted(Path('release-v100-source-parts').glob('part-*')))
assert hashlib.sha256(source).hexdigest() == 'b2e2a21e68193dcd10e38267e0401e6f5d2847ff62e3d6d1079a2ed2e58a95d8'
(out/'Equicord-v100-source.tar.gz').write_bytes(source)
