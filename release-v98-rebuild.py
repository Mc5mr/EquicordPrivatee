import base64, gzip, hashlib, json
from pathlib import Path
old = b''.join(p.read_bytes() for p in sorted(Path('release-v89-parts').glob('part-*')))
assert hashlib.sha256(old).hexdigest() == '360dfee6184435484e5034c277bec1a49d5e0d2277875f5a710c82d9214569cf'
patch = b''.join(p.read_bytes() for p in sorted(Path('release-v98-parts').glob('part-*')))
ops = json.loads(gzip.decompress(patch))
new = b''.join(base64.b64decode(op[1]) if op[0] == 'd' else old[op[1]:op[1]+op[2]] for op in ops)
assert len(new) == 64397312
assert hashlib.sha256(new).hexdigest() == '341ce27ec7cbe7a72b6f393ed2a0e43d823e51fb05ab020a85c9cfb9ead2de69'
out = Path('release-v98')
out.mkdir(exist_ok=True)
(out/'Mc5mr-Equicord-Installer.exe').write_bytes(new)
asar = new[11902242:11902242+52032149]
assert hashlib.sha256(asar).hexdigest() == '0e16512c1033a12c209f55b15f1f7761c90e9dee11290c613b25113b8956a2dd'
(out/'desktop.asar').write_bytes(asar)
(out/'desktop.sha256').write_text('0e16512c1033a12c209f55b15f1f7761c90e9dee11290c613b25113b8956a2dd\n')
(out/'Mc5mr-Equicord-Installer.exe.sha256').write_text('341ce27ec7cbe7a72b6f393ed2a0e43d823e51fb05ab020a85c9cfb9ead2de69\n')
