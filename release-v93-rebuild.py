import base64, gzip, hashlib, json
from pathlib import Path
old = b''.join(p.read_bytes() for p in sorted(Path('release-v89-parts').glob('part-*')))
assert hashlib.sha256(old).hexdigest() == '360dfee6184435484e5034c277bec1a49d5e0d2277875f5a710c82d9214569cf'
patch = b''.join(p.read_bytes() for p in sorted(Path('release-v93-parts').glob('part-*')))
ops = json.loads(gzip.decompress(patch))
new = b''.join(base64.b64decode(op[1]) if op[0] == 'd' else old[op[1]:op[1]+op[2]] for op in ops)
assert len(new) == 64319488
assert hashlib.sha256(new).hexdigest() == 'af3157317a81acfaafd3af30c21f53ca3624f9341cbdf4f5add10f977612d013'
out = Path('release-v93')
out.mkdir(exist_ok=True)
(out/'Mc5mr-Equicord-Installer.exe').write_bytes(new)
asar = new[11902242:11902242+51954119]
assert hashlib.sha256(asar).hexdigest() == 'dab43c09d7cc9b031d8aac61d3cd847b9252e1ea0602f826c3785cd2d6863a06'
(out/'desktop.asar').write_bytes(asar)
(out/'desktop.sha256').write_text('dab43c09d7cc9b031d8aac61d3cd847b9252e1ea0602f826c3785cd2d6863a06\n')
(out/'Mc5mr-Equicord-Installer.exe.sha256').write_text('af3157317a81acfaafd3af30c21f53ca3624f9341cbdf4f5add10f977612d013\n')
