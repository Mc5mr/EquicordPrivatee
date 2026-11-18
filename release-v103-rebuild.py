import base64, gzip, hashlib, json
from pathlib import Path
old = b''.join(p.read_bytes() for p in sorted(Path('release-v89-parts').glob('part-*')))
assert hashlib.sha256(old).hexdigest() == '360dfee6184435484e5034c277bec1a49d5e0d2277875f5a710c82d9214569cf'
patch = b''.join(p.read_bytes() for p in sorted(Path('release-v103-parts').glob('part-*')))
ops = json.loads(gzip.decompress(patch))
new = b''.join(base64.b64decode(op[1]) if op[0] == 'd' else old[op[1]:op[1]+op[2]] for op in ops)
assert len(new) == 64985600
assert hashlib.sha256(new).hexdigest() == 'dddc521b9b9ed116a20311d7e16a86eee83fd6782bf2b924370e52ca8a466d07'
out = Path('release-v103')
out.mkdir(exist_ok=True)
(out/'Mc5mr-Equicord-Installer.exe').write_bytes(new)
asar = new[11901218:11901218+52621281]
assert hashlib.sha256(asar).hexdigest() == '18ce9a1e0a8e336abd657808dea97c798206cfa9be7562c7190b15ad70be2370'
(out/'desktop.asar').write_bytes(asar)
(out/'desktop.sha256').write_text('18ce9a1e0a8e336abd657808dea97c798206cfa9be7562c7190b15ad70be2370\n')
(out/'Mc5mr-Equicord-Installer.exe.sha256').write_text('dddc521b9b9ed116a20311d7e16a86eee83fd6782bf2b924370e52ca8a466d07\n')
source = b''.join(p.read_bytes() for p in sorted(Path('release-v103-source-parts').glob('part-*')))
assert hashlib.sha256(source).hexdigest() == 'b89add43904d71b4485a0f6c42ca5f7baf89d3b0c34c17b14501dd74b8083da1'
(out/'Equicord-v103-source.tar.gz').write_bytes(source)
