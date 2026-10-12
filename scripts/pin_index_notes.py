"""Move each section's index note (00_INDEX.md) to the top of that section in the exported data/index.json.

The exporter sorts notes by file name, and "00_" sorts after "001_" because '_' comes after the digits. Without this
step every new numbered note pushes the index further down the sidebar, and the category card on the home page (which
opens the first note) opens a regular note instead of the index.
"""
import json
import re
import sys

INDEX_NOTE = re.compile(r"(^|/)00_INDEX\.md$", re.IGNORECASE)


def is_index(note):
    return bool(INDEX_NOTE.search(note.get("relativePath", ""))) or note.get("slug", "").endswith("-00_index")


def main(path):
    with open(path, encoding="utf-8") as f:
        index = json.load(f)

    moved = 0
    for category in index["categories"]:
        for section in category["sections"]:
            notes = section["notes"]
            pinned = sorted(notes, key=lambda note: not is_index(note))  # stable: other notes keep their order
            if pinned != notes:
                section["notes"] = pinned
                moved += 1

    with open(path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Pinned the index note to the top in {moved} section(s).")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "data/index.json")
