import base64, gzip, hashlib, json
from pathlib import Path
old = b''.join(p.read_bytes() for p in sorted(Path('release-v89-parts').glob('part-*')))
assert hashlib.sha256(old).hexdigest() == '360dfee6184435484e5034c277bec1a49d5e0d2277875f5a710c82d9214569cf'
patch = b''.join(p.read_bytes() for p in sorted(Path('release-v96-parts').glob('part-*')))
ops = json.loads(gzip.decompress(patch))
new = b''.join(base64.b64decode(op[1]) if op[0] == 'd' else old[op[1]:op[1]+op[2]] for op in ops)
assert len(new) == 64354304
assert hashlib.sha256(new).hexdigest() == '7a73bbf53ecf2ab8948b04ddf6363ac352afed471d40f5e8953e855f8fa0f215'
out = Path('release-v96')
out.mkdir(exist_ok=True)
(out/'Mc5mr-Equicord-Installer.exe').write_bytes(new)
asar = new[11902242:11902242+51989352]
assert hashlib.sha256(asar).hexdigest() == '4e3de280765bb1c75b28ae501115b9f8d8fc68162f7e944f094240a1e7856d8a'
(out/'desktop.asar').write_bytes(asar)
(out/'desktop.sha256').write_text('4e3de280765bb1c75b28ae501115b9f8d8fc68162f7e944f094240a1e7856d8a\n')
(out/'Mc5mr-Equicord-Installer.exe.sha256').write_text('7a73bbf53ecf2ab8948b04ddf6363ac352afed471d40f5e8953e855f8fa0f215\n')
