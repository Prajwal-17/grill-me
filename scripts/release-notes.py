"""Extract exactly the tagged version's changelog entry; fail if absent."""
import re
import sys
from pathlib import Path

version = re.escape(sys.argv[1])
text = Path("CHANGELOG.md").read_text()
match = re.search(rf"^## \[?(?:desktop-v)?{version}\]?(?:\s+-[^\n]*)?\s*\n(.*?)(?=^## |\Z)", text, re.M | re.S)
if not match or not match[1].strip():
    sys.exit("Missing nonempty CHANGELOG.md entry for the release version")
print(match[1].strip())
