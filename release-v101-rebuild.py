import base64, gzip, hashlib, json
from pathlib import Path
old = b''.join(p.read_bytes() for p in sorted(Path('release-v89-parts').glob('part-*')))
assert hashlib.sha256(old).hexdigest() == '360dfee6184435484e5034c277bec1a49d5e0d2277875f5a710c82d9214569cf'
patch = b''.join(p.read_bytes() for p in sorted(Path('release-v101-parts').glob('part-*')))
ops = json.loads(gzip.decompress(patch))
new = b''.join(base64.b64decode(op[1]) if op[0] == 'd' else old[op[1]:op[1]+op[2]] for op in ops)
assert len(new) == 64990720
assert hashlib.sha256(new).hexdigest() == 'a884f9f57b4cfc682e21409eeb6b76b0e3f75fea6b2b06d5b08172c1a2a19006'
out = Path('release-v101')
out.mkdir(exist_ok=True)
(out/'Mc5mr-Equicord-Installer.exe').write_bytes(new)
asar = new[11902242:11902242+52625534]
assert hashlib.sha256(asar).hexdigest() == 'd5260c4c6f79d7af738eaa276e7a77aaa44f3312d7b3fb705cdd1038708d2afc'
(out/'desktop.asar').write_bytes(asar)
(out/'desktop.sha256').write_text('d5260c4c6f79d7af738eaa276e7a77aaa44f3312d7b3fb705cdd1038708d2afc\n')
(out/'Mc5mr-Equicord-Installer.exe.sha256').write_text('a884f9f57b4cfc682e21409eeb6b76b0e3f75fea6b2b06d5b08172c1a2a19006\n')
source = b''.join(p.read_bytes() for p in sorted(Path('release-v101-source-parts').glob('part-*')))
assert hashlib.sha256(source).hexdigest() == '74af87ab30935b2dca1fe9194ac3d2055a1a5cd16a1a52fc11b0bc76ed007ce7'
(out/'Equicord-v101-source.tar.gz').write_bytes(source)
