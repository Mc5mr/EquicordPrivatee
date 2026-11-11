import base64, gzip, hashlib, json
from pathlib import Path
old = b''.join(p.read_bytes() for p in sorted(Path('release-v89-parts').glob('part-*')))
assert hashlib.sha256(old).hexdigest() == '360dfee6184435484e5034c277bec1a49d5e0d2277875f5a710c82d9214569cf'
patch = b''.join(p.read_bytes() for p in sorted(Path('release-v94-parts').glob('part-*')))
ops = json.loads(gzip.decompress(patch))
new = b''.join(base64.b64decode(op[1]) if op[0] == 'd' else old[op[1]:op[1]+op[2]] for op in ops)
assert len(new) == 64354304
assert hashlib.sha256(new).hexdigest() == '6bad00b1f39c02b85a94bd7203a43b452edeca9ffdb46157816085bb20348296'
out = Path('release-v94')
out.mkdir(exist_ok=True)
(out/'Mc5mr-Equicord-Installer.exe').write_bytes(new)
asar = new[11902242:11902242+51989220]
assert hashlib.sha256(asar).hexdigest() == 'c0bd6b34aa7f6a7bd68a34e2ad5c3e6d8c2d808afc3f85059f2425e96af32e2a'
(out/'desktop.asar').write_bytes(asar)
(out/'desktop.sha256').write_text('c0bd6b34aa7f6a7bd68a34e2ad5c3e6d8c2d808afc3f85059f2425e96af32e2a\n')
(out/'Mc5mr-Equicord-Installer.exe.sha256').write_text('6bad00b1f39c02b85a94bd7203a43b452edeca9ffdb46157816085bb20348296\n')
