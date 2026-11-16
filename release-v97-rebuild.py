import base64, gzip, hashlib, json
from pathlib import Path
old = b''.join(p.read_bytes() for p in sorted(Path('release-v89-parts').glob('part-*')))
assert hashlib.sha256(old).hexdigest() == '360dfee6184435484e5034c277bec1a49d5e0d2277875f5a710c82d9214569cf'
patch = b''.join(p.read_bytes() for p in sorted(Path('release-v97-parts').glob('part-*')))
ops = json.loads(gzip.decompress(patch))
new = b''.join(base64.b64decode(op[1]) if op[0] == 'd' else old[op[1]:op[1]+op[2]] for op in ops)
assert len(new) == 64395776
assert hashlib.sha256(new).hexdigest() == '89a241c6dbbdd04d521b5eb8c284ced3c9a8830f5255f28018481564be2f6066'
out = Path('release-v97')
out.mkdir(exist_ok=True)
(out/'Mc5mr-Equicord-Installer.exe').write_bytes(new)
asar = new[11902242:11902242+52030659]
assert hashlib.sha256(asar).hexdigest() == '0eb2b76116f009f3662f88d2a45d2e7a0902bdeeaf338f3d0e2056a72235e507'
(out/'desktop.asar').write_bytes(asar)
(out/'desktop.sha256').write_text('0eb2b76116f009f3662f88d2a45d2e7a0902bdeeaf338f3d0e2056a72235e507\n')
(out/'Mc5mr-Equicord-Installer.exe.sha256').write_text('89a241c6dbbdd04d521b5eb8c284ced3c9a8830f5255f28018481564be2f6066\n')
