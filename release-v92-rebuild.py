import base64, gzip, hashlib, json
from pathlib import Path
old = b''.join(p.read_bytes() for p in sorted(Path('release-v89-parts').glob('part-*')))
assert hashlib.sha256(old).hexdigest() == '360dfee6184435484e5034c277bec1a49d5e0d2277875f5a710c82d9214569cf'
patch = b''.join(p.read_bytes() for p in sorted(Path('release-v92-parts').glob('part-*')))
ops = json.loads(gzip.decompress(patch))
new = b''.join(base64.b64decode(op[1]) if op[0] == 'd' else old[op[1]:op[1]+op[2]] for op in ops)
assert len(new) == 64314880
assert hashlib.sha256(new).hexdigest() == '075289fd4282c51e0915c6826bbd8180bf8c8b4e49df3412ac8836daa56a49e3'
out = Path('release-v92')
out.mkdir(exist_ok=True)
(out/'Mc5mr-Equicord-Installer.exe').write_bytes(new)
asar = new[11902242:11902242+51949733]
assert hashlib.sha256(asar).hexdigest() == '19cdf951ca9705d4b1da025d3c707984ffbf2b1f16d6a87892c7a813008dc7bb'
(out/'desktop.asar').write_bytes(asar)
(out/'desktop.sha256').write_text('19cdf951ca9705d4b1da025d3c707984ffbf2b1f16d6a87892c7a813008dc7bb\n')
(out/'Mc5mr-Equicord-Installer.exe.sha256').write_text('075289fd4282c51e0915c6826bbd8180bf8c8b4e49df3412ac8836daa56a49e3\n')
