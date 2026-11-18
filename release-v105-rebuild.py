import base64, gzip, hashlib, json
from pathlib import Path
old = b''.join(p.read_bytes() for p in sorted(Path('release-v89-parts').glob('part-*')))
assert hashlib.sha256(old).hexdigest() == '360dfee6184435484e5034c277bec1a49d5e0d2277875f5a710c82d9214569cf'
patch = b''.join(p.read_bytes() for p in sorted(Path('release-v105-parts').glob('part-*')))
ops = json.loads(gzip.decompress(patch))
new = b''.join(base64.b64decode(op[1]) if op[0] == 'd' else old[op[1]:op[1]+op[2]] for op in ops)
assert len(new) == 64992256
assert hashlib.sha256(new).hexdigest() == 'c13f8fdf27b16e88d804238732b05d498beb896de5a7f5d69df7d1506278381d'
out = Path('release-v105')
out.mkdir(exist_ok=True)
(out/'Mc5mr-Equicord-Installer.exe').write_bytes(new)
asar = new[11901218:11901218+52628253]
assert hashlib.sha256(asar).hexdigest() == '75a5e5ae3c55e99eafcfdbfa41ddebf02def18f76af4b7e89469d3f51c5a1b4d'
(out/'desktop.asar').write_bytes(asar)
(out/'desktop.sha256').write_text('75a5e5ae3c55e99eafcfdbfa41ddebf02def18f76af4b7e89469d3f51c5a1b4d\n')
(out/'Mc5mr-Equicord-Installer.exe.sha256').write_text('c13f8fdf27b16e88d804238732b05d498beb896de5a7f5d69df7d1506278381d\n')
source = b''.join(p.read_bytes() for p in sorted(Path('release-v105-source-parts').glob('part-*')))
assert hashlib.sha256(source).hexdigest() == '2c3a28deafe8f917702309c8644104bbd97787e3e48fd7ebe8cba98fc1a84fa4'
(out/'Equicord-v105-source.tar.gz').write_bytes(source)
