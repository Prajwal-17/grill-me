"""Extract release notes or preview/apply notes to existing GitHub releases."""
import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path


def release_notes(version, changelog, repo):
    match = re.search(
        rf"^## \[?(?:desktop-v)?{re.escape(version)}\]?(?:\s+-[^\n]*)?\s*\n(.*?)(?=^## |\Z)",
        changelog, re.M | re.S,
    )
    if not match or not match[1].strip():
        raise ValueError("Missing nonempty CHANGELOG.md entry for the release version")
    return f"## What's changed\n\n{match[1].strip()}\n\n[View all releases](https://github.com/{repo}/releases)\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("version", nargs="?")
    parser.add_argument("--backfill", action="store_true", help="Preview notes for existing GitHub releases")
    parser.add_argument("--apply", action="store_true", help="Apply the backfill after reviewing its preview")
    parser.add_argument("--repo", default="Prajwal-17/grill-me")
    args = parser.parse_args()
    if bool(args.version) == args.backfill:
        parser.error("Supply a version or --backfill.")
    if args.apply and not args.backfill:
        parser.error("--apply requires --backfill.")
    changelog = (Path(__file__).resolve().parent.parent / "CHANGELOG.md").read_text()
    if args.version:
        print(release_notes(args.version, changelog, args.repo), end="")
        return
    releases = json.loads(subprocess.check_output(
        ["gh", "release", "list", "--repo", args.repo, "--limit", "100", "--json", "tagName"], text=True,
    ))
    # Validate every entry before making any remote change.
    prepared = []
    for release in releases:
        tag = release["tagName"]
        match = re.fullmatch(r"desktop-v(\d+\.\d+\.\d+)", tag)
        if match:
            prepared.append((tag, release_notes(match[1], changelog, args.repo)))
    if not args.apply:
        for tag, notes in prepared:
            print(f"--- {tag} ---\n{notes}")
        print(f"Previewed {len(prepared)} releases. No GitHub changes made. Use --backfill --apply after verification.")
        return
    with tempfile.TemporaryDirectory(prefix="grill-release-notes-") as directory:
        for tag, notes in prepared:
            path = Path(directory) / f"{tag}.md"
            path.write_text(notes)
            subprocess.run(["gh", "release", "edit", tag, "--repo", args.repo, "--notes-file", str(path)], check=True)
            print(f"Updated {tag}")


if __name__ == "__main__":
    try:
        main()
    except ValueError as error:
        sys.exit(str(error))
