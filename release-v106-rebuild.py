import base64, gzip, hashlib, json
from pathlib import Path
old = b''.join(p.read_bytes() for p in sorted(Path('release-v89-parts').glob('part-*')))
assert hashlib.sha256(old).hexdigest() == '360dfee6184435484e5034c277bec1a49d5e0d2277875f5a710c82d9214569cf'
patch = b''.join(p.read_bytes() for p in sorted(Path('release-v106-parts').glob('part-*')))
ops = json.loads(gzip.decompress(patch))
new = b''.join(base64.b64decode(op[1]) if op[0] == 'd' else old[op[1]:op[1]+op[2]] for op in ops)
assert len(new) == 64990720
assert hashlib.sha256(new).hexdigest() == 'c70dde99c161f9ec40534e0801f6dd65d1d50500acbce2ad93d7691e17f2932b'
out = Path('release-v106')
out.mkdir(exist_ok=True)
(out/'Mc5mr-Equicord-Installer.exe').write_bytes(new)
asar = new[11901218:11901218+52626507]
assert hashlib.sha256(asar).hexdigest() == '916807e57706a9e7ff389907fb7eb80de01a49092c8f129a1cb7f688b2228823'
(out/'desktop.asar').write_bytes(asar)
(out/'desktop.sha256').write_text('916807e57706a9e7ff389907fb7eb80de01a49092c8f129a1cb7f688b2228823\n')
(out/'Mc5mr-Equicord-Installer.exe.sha256').write_text('c70dde99c161f9ec40534e0801f6dd65d1d50500acbce2ad93d7691e17f2932b\n')
source = b''.join(p.read_bytes() for p in sorted(Path('release-v106-source-parts').glob('part-*')))
assert hashlib.sha256(source).hexdigest() == '349cf95db4c4f8542739d5c40829475b52cad019d1d5b239167affecf65cdb89'
(out/'Equicord-v106-source.tar.gz').write_bytes(source)
