import base64, gzip, hashlib, json
from pathlib import Path
old = b''.join(p.read_bytes() for p in sorted(Path('release-v89-parts').glob('part-*')))
assert hashlib.sha256(old).hexdigest() == '360dfee6184435484e5034c277bec1a49d5e0d2277875f5a710c82d9214569cf'
patch = b''.join(p.read_bytes() for p in sorted(Path('release-v91-parts').glob('part-*')))
ops = json.loads(gzip.decompress(patch))
new = b''.join(base64.b64decode(op[1]) if op[0] == 'd' else old[op[1]:op[1]+op[2]] for op in ops)
assert len(new) == 64241152
assert hashlib.sha256(new).hexdigest() == 'bd77ec87698419c612fe3679be3957a1c249cd8faa90f4bd3c589d5aa18dda44'
out = Path('release-v91')
out.mkdir(exist_ok=True)
(out/'Mc5mr-Equicord-Installer.exe').write_bytes(new)
asar = new[11902242:11902242+51875816]
assert hashlib.sha256(asar).hexdigest() == '76441f273d6fcb8f7aff474b22030929608b28b992f82dfedcd0c9a5706fc846'
(out/'desktop.asar').write_bytes(asar)
(out/'desktop.sha256').write_text('76441f273d6fcb8f7aff474b22030929608b28b992f82dfedcd0c9a5706fc846\n')
(out/'Mc5mr-Equicord-Installer.exe.sha256').write_text('bd77ec87698419c612fe3679be3957a1c249cd8faa90f4bd3c589d5aa18dda44\n')
