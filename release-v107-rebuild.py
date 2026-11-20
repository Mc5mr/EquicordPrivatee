import base64, gzip, hashlib, json
from pathlib import Path
old = b''.join(p.read_bytes() for p in sorted(Path('release-v89-parts').glob('part-*')))
assert hashlib.sha256(old).hexdigest() == '360dfee6184435484e5034c277bec1a49d5e0d2277875f5a710c82d9214569cf'
patch = b''.join(p.read_bytes() for p in sorted(Path('release-v107-parts').glob('part-*')))
ops = json.loads(gzip.decompress(patch))
new = b''.join(base64.b64decode(op[1]) if op[0] == 'd' else old[op[1]:op[1]+op[2]] for op in ops)
assert len(new) == 64998400
assert hashlib.sha256(new).hexdigest() == '67aaeea06a7af9e2806bd843ef1cc04901bb6ffd2433ad002456c5204cf95e5d'
out = Path('release-v107')
out.mkdir(exist_ok=True)
(out/'Mc5mr-Equicord-Installer.exe').write_bytes(new)
asar = new[11901218:11901218+52634435]
assert hashlib.sha256(asar).hexdigest() == 'c28dac687f5294d0e7b1993589c5121f581941cab969422150d2c3e2dfc7e8ae'
(out/'desktop.asar').write_bytes(asar)
(out/'desktop.sha256').write_text('c28dac687f5294d0e7b1993589c5121f581941cab969422150d2c3e2dfc7e8ae\n')
(out/'Mc5mr-Equicord-Installer.exe.sha256').write_text('67aaeea06a7af9e2806bd843ef1cc04901bb6ffd2433ad002456c5204cf95e5d\n')
source = b''.join(p.read_bytes() for p in sorted(Path('release-v107-source-parts').glob('part-*')))
assert hashlib.sha256(source).hexdigest() == 'cce0ce19906bd744983bd4bb2ebc652ad9d5e19929066b8485b49ecb46918ca8'
(out/'Equicord-v107-source.tar.gz').write_bytes(source)
