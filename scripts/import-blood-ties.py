"""Import ONLY the first worksheet; no hand-authored connections or extra sheets.

Usage: python3 scripts/import-blood-ties.py workbook.xlsm --effective-date YYYY-MM-DD
Uses the XLSX XML directly so catalogue updates need no Python dependencies.
"""
import argparse
import datetime
import hashlib
import json
import pathlib
import posixpath
import unicodedata
import zipfile
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser(description="Import the first Blood Ties worksheet as a future content version; preserve issued puzzles.")
parser.add_argument("workbook", type=pathlib.Path)
parser.add_argument("--effective-date", required=True, help="First UTC day using the new categories; must be in the future")
parser.add_argument("--root", type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[1], help=argparse.SUPPRESS)
args = parser.parse_args()
source = args.workbook
try:
    effective = datetime.date.fromisoformat(args.effective_date)
    assert effective.isoformat() == args.effective_date
    assert effective > datetime.datetime.now(datetime.timezone.utc).date()
except (ValueError, AssertionError):
    parser.error("--effective-date must be a valid future UTC date. Issued puzzles cannot be overwritten.")

def read_export(filename):
    return json.loads(filename.read_text().split(" = ", 1)[1].rstrip(";\n"))

js = args.root / "js"
output = js / "blood-ties-catalogue.js"
previous = read_export(output)
previous_connections = {g["id"]: g for g in previous["connections"]}
previous_boards = read_export(js / "blood-ties-boards.js")
if args.effective_date <= previous["effectiveDate"]:
    parser.error("Choose an effective date after the current content version.")
if previous["version"] != previous_boards["version"] or previous["sourceSha256"] != previous_boards["sourceSha256"]:
    parser.error("The current catalogue has not been compiled. Run node scripts/generate-blood-ties.mjs before importing another workbook.")
ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
with zipfile.ZipFile(source) as book:
    strings = []
    if "xl/sharedStrings.xml" in book.namelist():
        strings = ["".join(t.text or "" for t in si.findall(".//s:t", ns)) for si in ET.fromstring(book.read("xl/sharedStrings.xml"))]
    first = ET.fromstring(book.read("xl/workbook.xml")).find("s:sheets/s:sheet", ns)
    rel_id = first.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
    relationships = ET.fromstring(book.read("xl/_rels/workbook.xml.rels"))
    target = next(r.attrib["Target"] for r in relationships if r.attrib["Id"] == rel_id)
    target = target.lstrip("/") if target.startswith("/") else posixpath.normpath("xl/" + target)
    rows = []
    for row in ET.fromstring(book.read(target)).findall("s:sheetData/s:row", ns):
        cells = {}
        for cell in row:
            column = "".join(c for c in cell.attrib["r"] if c.isalpha())
            value = cell.findtext("s:v", default="", namespaces=ns)
            if cell.attrib.get("t") == "s":
                value = strings[int(value)]
            elif cell.attrib.get("t") == "inlineStr":
                value = "".join(t.text or "" for t in cell.findall("s:is//s:t", ns))
            assert cell.find("s:f", ns) is None, "Puzzle data must contain values, not formula caches"
            cells[column] = value.strip()
        rows.append(cells)
    assert rows[0].get("A") == "Connection ID" and rows[0].get("F") == "Eligible tile 01"
    connections = []
    ids = set()
    spellings = {}
    for row in rows[1:]:
        if not row.get("A"):
            continue
        tiles = []
        for i in range(16):
            tile = " ".join(unicodedata.normalize("NFKC", row.get(chr(70 + i), "")).split())
            if not tile:
                continue
            key = tile.lower().replace("’", "'")
            tile = spellings.setdefault(key, tile)
            if tile not in tiles:
                tiles.append(tile)
        assert len(tiles) >= 3, f"Connection {row['A']} needs at least three distinct answers"
        assert row["A"] not in ids and all(row.get(key) for key in ["B", "C", "D", "E"])
        ids.add(row["A"])
        difficulty = float(row["E"])
        assert difficulty in (1, 2, 3), f"Invalid difficulty for {row['A']}"
        group = dict(id=row["A"], name=row["B"], definition=row["C"], family=row["D"], difficulty=int(difficulty), tiles=tiles, researchLink=row.get("V", ""))
        if previous.get("generationPolicy") in ("discovery-v1", "discovery-v2", "discovery-v3"):
            method = row.get("W", "").lower()
            old = previous_connections.get(row["A"], {})
            if method:
                assert method in ("name", "familiar", "specialist"), f"Connection {row['A']}: Discovery (W) must be name, familiar or specialist"
                group["discovery"] = dict(method=method)
                if method == "name":
                    words = list(dict.fromkeys(w.strip() for w in row.get("Y", "").split("|") if w.strip()))
                    assert row.get("X") and words, f"Connection {row['A']}: name clues need Name theme (X) and Clue words (Y), separated by |"
                    group["discovery"].update(theme=row["X"], words=words)
            elif old.get("name") == group["name"] and old.get("definition") == group["definition"] and old.get("discovery"):
                # Existing unclassified copies remain usable until the reviewed
                # classifications have been copied back to the owner's workbook.
                group["discovery"] = dict(old["discovery"])
            else:
                raise AssertionError(f"Connection {row['A']} needs a Discovery classification in W. New or renamed categories cannot silently enter the regular pool.")
            reasoning = row.get("Z", "").lower()
            if reasoning == "none":
                group["discovery"].pop("reasoning", None)
            elif reasoning:
                assert reasoning in ("function", "trait", "weapon-class") and group["discovery"]["method"] != "specialist", f"Connection {row['A']}: Common link (Z) must be function, trait, weapon-class or none; specialist categories cannot use it"
                group["discovery"]["reasoning"] = reasoning
            elif old.get("name") == group["name"] and old.get("definition") == group["definition"] and group["discovery"]["method"] == old.get("discovery", {}).get("method") and old.get("discovery", {}).get("reasoning"):
                group["discovery"].setdefault("reasoning", old["discovery"]["reasoning"])
            pairing = row.get("AA", "").lower()
            if pairing:
                assert pairing in ("effects", "equipment", "mixed"), f"Connection {row['A']}: Pair type (AA) must be effects, equipment or mixed"
                group["discovery"]["pairing"] = pairing
            elif old.get("name") == group["name"] and old.get("definition") == group["definition"] and old.get("discovery", {}).get("pairing"):
                group["discovery"].setdefault("pairing", old["discovery"]["pairing"])
            elif group["family"] == "Gameplay" and previous.get("generationPolicy") == "discovery-v3":
                raise AssertionError(f"Connection {row['A']} needs a Pair type classification in AA; Gameplay alone is not a visible item type.")
        connections.append(group)

assert connections, "The first worksheet has no complete connection rows"
catalogue = dict(version=previous["version"] + 1, effectiveDate=args.effective_date, source=source.name, sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(), worksheet=first.attrib["name"], connections=connections)
if previous.get("generationPolicy"):
    catalogue["generationPolicy"] = previous["generationPolicy"]
# Validate every archive destination before writing anything. Historical content
# is never rewritten, including when importing a corrected copy of a workbook.
archives = [(js / f"blood-ties-{kind}-v{previous['version']}.js", (js / f"blood-ties-{kind}.js").read_text()) for kind in ["catalogue", "boards"]]
for filename, content in archives:
    if filename.exists() and filename.read_text() != content:
        parser.error(f"Historical snapshot differs: {filename.name}. It has not been overwritten.")
for filename, content in archives:
    if not filename.exists():
        filename.write_text(content)
output.write_text("// Generated by scripts/import-blood-ties.py from the first worksheet only.\nexport const bloodTiesCatalogue = " + json.dumps(catalogue, ensure_ascii=False, indent=2) + ";\n")
print(f"Imported {len(connections)} connections as v{catalogue['version']}, effective {catalogue['effectiveDate']}. Previous content archived. Run node scripts/generate-blood-ties.mjs, then review and stage the new release.")
