import base64, gzip, hashlib, json
from pathlib import Path
old = b''.join(p.read_bytes() for p in sorted(Path('release-v89-parts').glob('part-*')))
assert hashlib.sha256(old).hexdigest() == '360dfee6184435484e5034c277bec1a49d5e0d2277875f5a710c82d9214569cf'
patch = b''.join(p.read_bytes() for p in sorted(Path('release-v90-parts').glob('part-*')))
ops = json.loads(gzip.decompress(patch))
new = b''.join(base64.b64decode(op[1]) if op[0] == 'd' else old[op[1]:op[1]+op[2]] for op in ops)
assert len(new) == 64203776
assert hashlib.sha256(new).hexdigest() == 'c4fbf0d2b73d8717bd69d323b9a0412cd54fec6ea39ea06d13d5943fb0a0a1ca'
out = Path('release-v90')
out.mkdir(exist_ok=True)
(out/'Mc5mr-Equicord-Installer.exe').write_bytes(new)
asar = new[11902242:11902242+51838659]
assert hashlib.sha256(asar).hexdigest() == '000213c1c245c730c741cd0341d41d5c545461f5f9b58fee4ad120543d42bd4e'
(out/'desktop.asar').write_bytes(asar)
(out/'desktop.sha256').write_text('000213c1c245c730c741cd0341d41d5c545461f5f9b58fee4ad120543d42bd4e\n')
(out/'Mc5mr-Equicord-Installer.exe.sha256').write_text('c4fbf0d2b73d8717bd69d323b9a0412cd54fec6ea39ea06d13d5943fb0a0a1ca\n')
