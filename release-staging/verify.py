import hashlib
import json
from pathlib import Path

root = Path('release-staging')
feed = json.loads((root / 'latest.json').read_text())
for asset in feed['assets']:
    data = (root / asset['name']).read_bytes()
    assert len(data) == asset['size']
    assert hashlib.sha256(data).hexdigest() == asset['sha256']
