import base64, gzip, hashlib, json
from pathlib import Path
old = b''.join(p.read_bytes() for p in sorted(Path('release-v89-parts').glob('part-*')))
assert hashlib.sha256(old).hexdigest() == '360dfee6184435484e5034c277bec1a49d5e0d2277875f5a710c82d9214569cf'
patch = b''.join(p.read_bytes() for p in sorted(Path('release-v104-parts').glob('part-*')))
ops = json.loads(gzip.decompress(patch))
new = b''.join(base64.b64decode(op[1]) if op[0] == 'd' else old[op[1]:op[1]+op[2]] for op in ops)
assert len(new) == 64984064
assert hashlib.sha256(new).hexdigest() == 'b9d3e73d31ba56e72623a6e0a759e5eb2b5f13f5c93ca5939fccf1ced64bc049'
out = Path('release-v104')
out.mkdir(exist_ok=True)
(out/'Mc5mr-Equicord-Installer.exe').write_bytes(new)
asar = new[11901218:11901218+52619664]
assert hashlib.sha256(asar).hexdigest() == '7eafce51a8b78dda31b6e331739d43f11f56ddb98fe83b08a26909da8a8d3b92'
(out/'desktop.asar').write_bytes(asar)
(out/'desktop.sha256').write_text('7eafce51a8b78dda31b6e331739d43f11f56ddb98fe83b08a26909da8a8d3b92\n')
(out/'Mc5mr-Equicord-Installer.exe.sha256').write_text('b9d3e73d31ba56e72623a6e0a759e5eb2b5f13f5c93ca5939fccf1ced64bc049\n')
source = b''.join(p.read_bytes() for p in sorted(Path('release-v104-source-parts').glob('part-*')))
assert hashlib.sha256(source).hexdigest() == '67a87ed2f20770199b1d8e0825829d2440c0cf2ba3064f74312413a283cef697'
(out/'Equicord-v104-source.tar.gz').write_bytes(source)
