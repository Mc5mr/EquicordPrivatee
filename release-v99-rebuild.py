import base64, gzip, hashlib, json, shutil
from pathlib import Path
old = b''.join(p.read_bytes() for p in sorted(Path('release-v89-parts').glob('part-*')))
assert hashlib.sha256(old).hexdigest() == '360dfee6184435484e5034c277bec1a49d5e0d2277875f5a710c82d9214569cf'
patch = b''.join(p.read_bytes() for p in sorted(Path('release-v99-parts').glob('part-*')))
ops = json.loads(gzip.decompress(patch))
new = b''.join(base64.b64decode(op[1]) if op[0] == 'd' else old[op[1]:op[1]+op[2]] for op in ops)
assert len(new) == 65050112
assert hashlib.sha256(new).hexdigest() == 'fb9b40c79eb676a6e2012b233dea7007cf2c5c20f9efb429b1aa101aeb29d008'
out = Path('release-v99')
out.mkdir(exist_ok=True)
(out/'Mc5mr-Equicord-Installer.exe').write_bytes(new)
asar = new[11902242:11902242+52685110]
assert hashlib.sha256(asar).hexdigest() == '775aa6fcec6d53c3321b5e16c3a4b321481a7dc42faf41534071fefc22810120'
(out/'desktop.asar').write_bytes(asar)
(out/'desktop.sha256').write_text('775aa6fcec6d53c3321b5e16c3a4b321481a7dc42faf41534071fefc22810120\n')
(out/'Mc5mr-Equicord-Installer.exe.sha256').write_text('fb9b40c79eb676a6e2012b233dea7007cf2c5c20f9efb429b1aa101aeb29d008\n')
source = b''.join(p.read_bytes() for p in sorted(Path('release-v99-source-parts').glob('part-*')))
assert hashlib.sha256(source).hexdigest() == '139927889e8e6a4f66d14cb6fa3322428d7d38c5f252e81e151b83e1b65836cd'
(out/'Equicord-v99-source.tar.gz').write_bytes(source)
helper = Path('release-v99-helper.zip').read_bytes()
assert hashlib.sha256(helper).hexdigest() == '1af0e048c450ac86de2dd05954307da94f3d91ce084314e0d0475dfe268c4e49'
(out/'AFKPanel-local-service.zip').write_bytes(helper)
