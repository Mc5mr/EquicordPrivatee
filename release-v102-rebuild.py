import base64, gzip, hashlib, json
from pathlib import Path
old = b''.join(p.read_bytes() for p in sorted(Path('release-v89-parts').glob('part-*')))
assert hashlib.sha256(old).hexdigest() == '360dfee6184435484e5034c277bec1a49d5e0d2277875f5a710c82d9214569cf'
patch = b''.join(p.read_bytes() for p in sorted(Path('release-v102-parts').glob('part-*')))
ops = json.loads(gzip.decompress(patch))
new = b''.join(base64.b64decode(op[1]) if op[0] == 'd' else old[op[1]:op[1]+op[2]] for op in ops)
assert len(new) == 64984064
assert hashlib.sha256(new).hexdigest() == 'cf90bccc730b8240e4ba5d5a74db9d389e5e67ab362a06e6d5f755e40207ed24'
out = Path('release-v102')
out.mkdir(exist_ok=True)
(out/'Mc5mr-Equicord-Installer.exe').write_bytes(new)
asar = new[11901218:11901218+52620128]
assert hashlib.sha256(asar).hexdigest() == 'a7d9f9081e797ba1d93070db6c208b1c839124cf6c3b85c54f386057465058d9'
(out/'desktop.asar').write_bytes(asar)
(out/'desktop.sha256').write_text('a7d9f9081e797ba1d93070db6c208b1c839124cf6c3b85c54f386057465058d9\n')
(out/'Mc5mr-Equicord-Installer.exe.sha256').write_text('cf90bccc730b8240e4ba5d5a74db9d389e5e67ab362a06e6d5f755e40207ed24\n')
source = b''.join(p.read_bytes() for p in sorted(Path('release-v102-source-parts').glob('part-*')))
assert hashlib.sha256(source).hexdigest() == '24c66f10f22a6580ce894a7902b7a180464782a88651682577cf76f9fc25cae1'
(out/'Equicord-v102-source.tar.gz').write_bytes(source)
