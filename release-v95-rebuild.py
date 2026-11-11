import base64, gzip, hashlib, json
from pathlib import Path
old = b''.join(p.read_bytes() for p in sorted(Path('release-v89-parts').glob('part-*')))
assert hashlib.sha256(old).hexdigest() == '360dfee6184435484e5034c277bec1a49d5e0d2277875f5a710c82d9214569cf'
patch = b''.join(p.read_bytes() for p in sorted(Path('release-v95-parts').glob('part-*')))
ops = json.loads(gzip.decompress(patch))
new = b''.join(base64.b64decode(op[1]) if op[0] == 'd' else old[op[1]:op[1]+op[2]] for op in ops)
assert len(new) == 64353792
assert hashlib.sha256(new).hexdigest() == '0a823c20898cf38491d2782f766fcca8ace494bb39a907cb077180992eb1ab28'
out = Path('release-v95')
out.mkdir(exist_ok=True)
(out/'Mc5mr-Equicord-Installer.exe').write_bytes(new)
asar = new[11902242:11902242+51988547]
assert hashlib.sha256(asar).hexdigest() == '6eee7f64756b789547e17ba0cdc2601f044e3b9405e3b2c00b157c7811479321'
(out/'desktop.asar').write_bytes(asar)
(out/'desktop.sha256').write_text('6eee7f64756b789547e17ba0cdc2601f044e3b9405e3b2c00b157c7811479321\n')
(out/'Mc5mr-Equicord-Installer.exe.sha256').write_text('0a823c20898cf38491d2782f766fcca8ace494bb39a907cb077180992eb1ab28\n')
