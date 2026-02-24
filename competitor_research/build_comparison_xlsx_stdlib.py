# -*- coding: utf-8 -*-
"""Create .xlsx with one sheet per destination - standard library only (no pip).
Run: python build_comparison_xlsx_stdlib.py
"""
import json
import zipfile
from pathlib import Path
from xml.etree.ElementTree import Element, SubElement, tostring

BASE = Path(__file__).resolve().parent
COMPARISON_PATH = BASE / "comparison_by_destination.json"
FULL_SCAN_PATH = BASE / "full_scan_results.json"
XLSX_PATH = BASE / "השוואת_טיולים_לפי_יעד.xlsx"

SHEET_NAMES = {
    "שייט נהרות – רון, סיין, דורדון, ריין": "שייט נהרות",
}


def escape_xml(s):
    if s is None:
        return ""
    s = str(s)
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;").replace("'", "&apos;")


def col_letter(i):
    if i < 26:
        return chr(65 + i)
    return col_letter(i // 26 - 1) + chr(65 + i % 26)


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def build_sheet_rows(dest_data, strings):
    """Append strings to list, return list of rows (each row = list of string indices)."""
    def si(s):
        idx = len(strings)
        strings.append(escape_xml(s))
        return idx

    rows = []
    rows.append([si("תרבותו")])
    rows.append([si("שם הטיול"), si("ימים"), si("מחיר"), si("תאריך")])
    for t in dest_data["tarbutu"]:
        rows.append([
            si(t.get("name", "")),
            si(str(t.get("days", ""))),
            si(str(t.get("price", ""))),
            si(str(t.get("date", ""))),
        ])
    rows.append([])
    rows.append([si("מתחרים")])
    rows.append([si("חברה"), si("שם הטיול"), si("ימים"), si("מחיר"), si("תאריך"), si("הערות")])
    for t in dest_data["competitors"]:
        note = t.get("note") or ""
        if t.get("guaranteed"):
            note = "מובטח" + ("; " + note if note else "")
        rows.append([
            si(str(t.get("company", ""))),
            si(str(t.get("name", ""))),
            si(str(t.get("days", ""))),
            si(str(t.get("price", ""))),
            si(str(t.get("date", ""))),
            si(note),
        ])
    return rows


def sheet_to_xml(rows, ns):
    worksheet = Element("{%s}worksheet" % ns, attrib={"xmlns": ns})
    sheetData = SubElement(worksheet, "{%s}sheetData" % ns)
    for r_idx, row in enumerate(rows, 1):
        if not row:
            continue
        row_el = SubElement(sheetData, "{%s}row" % ns, attrib={"r": str(r_idx)})
        for c_idx, s_idx in enumerate(row):
            if isinstance(s_idx, int):
                c_el = SubElement(row_el, "{%s}c" % ns, attrib={"r": f"{col_letter(c_idx)}{r_idx}", "t": "s"})
                v = SubElement(c_el, "{%s}v" % ns)
                v.text = str(s_idx)
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + tostring(worksheet, encoding="unicode", default_namespace=ns)


def main():
    data = load_json(COMPARISON_PATH)
    full = load_json(FULL_SCAN_PATH)
    ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    strings = []
    all_sheets = []

    for dest_key, dest_data in data["destinations"].items():
        title = SHEET_NAMES.get(dest_key, dest_key[:31])
        rows = build_sheet_rows(dest_data, strings)
        all_sheets.append((title, rows))

    # Summary sheet - all Tarbutu
    summary_rows = []
    def si(s):
        idx = len(strings)
        strings.append(escape_xml(s))
        return idx
    summary_rows.append([si("סיכום תרבותו"), si(""), si(""), si("")])
    summary_rows.append([])
    summary_rows.append([si("טיולים יבשתיים")])
    summary_rows.append([si("שם הטיול"), si("ימים"), si("תאריך"), si("יעד"), si("מחיר")])
    for t in full["tarbutu"]["land_tours"]:
        summary_rows.append([si(t["name"]), si(str(t.get("days") or "")), si(str(t.get("date") or "")), si(str(t.get("destination") or "")), si("לפי פנייה")])
    summary_rows.append([])
    summary_rows.append([si("קרוז ים")])
    summary_rows.append([si("שם הטיול"), si("ימים"), si("תאריך"), si("יעד"), si("מחיר")])
    for t in full["tarbutu"]["sea_cruises"]:
        summary_rows.append([si(t["name"]), si(str(t.get("days") or "")), si(str(t.get("date") or "")), si(str(t.get("destination") or t.get("category") or "")), si("לפי פנייה")])
    summary_rows.append([])
    summary_rows.append([si("שייט נהרות")])
    summary_rows.append([si("שם הטיול"), si("ימים"), si("תאריך"), si("ספינה"), si("מחיר")])
    for t in full["tarbutu"]["river_cruises"]:
        summary_rows.append([si(t["name"]), si(str(t.get("days") or "")), si(str(t.get("date") or "")), si(str(t.get("ship") or t.get("ships") or "")), si("לפי פנייה")])
    all_sheets.insert(0, ("סיכום תרבותו", summary_rows))

    # Build sharedStrings.xml
    sst = Element("{%s}sst" % ns, attrib={"count": str(len(strings)), "uniqueCount": str(len(strings))})
    for s in strings:
        si_el = SubElement(sst, "{%s}si" % ns)
        t_el = SubElement(si_el, "{%s}t" % ns)
        t_el.text = s
    shared_str_xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + tostring(sst, encoding="unicode", default_namespace=ns)

    # Build workbook.xml and rels
    sheets_xml = []
    rels = []
    for i, (title, _) in enumerate(all_sheets):
        sid = i + 1
        sheets_xml.append(f'<sheet name="{escape_xml(title)}" sheetId="{sid}" r:id="rId{sid}"/>')
        rels.append(f'<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{sid}.xml" Id="rId{sid}"/>')
    shared_rid = len(all_sheets) + 1
    rels.append(f'<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml" Id="rId{shared_rid}"/>')

    workbook_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheets>{''.join(sheets_xml)}</sheets>
</workbook>"""

    workbook_rels_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
{chr(10).join(rels)}
</Relationships>"""

    content_types = """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>"""
    for i in range(1, len(all_sheets) + 1):
        content_types += f"""
<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>"""
    content_types += """
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>"""

    with zipfile.ZipFile(XLSX_PATH, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml" Id="rId1"/>
</Relationships>""")
        z.writestr("xl/workbook.xml", workbook_xml)
        z.writestr("xl/_rels/workbook.xml.rels", workbook_rels_xml)
        z.writestr("xl/sharedStrings.xml", shared_str_xml)
        for i, (_, rows) in enumerate(all_sheets, 1):
            z.writestr(f"xl/worksheets/sheet{i}.xml", sheet_to_xml(rows, ns))

    print("נוצר:", XLSX_PATH)


if __name__ == "__main__":
    main()
