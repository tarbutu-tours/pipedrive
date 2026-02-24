# -*- coding: utf-8 -*-
"""Create .xlsx and .docx using only Python standard library (no pip).
Run: python make_word_excel_stdlib.py
Requires: Python 3.6+
"""
import json
import zipfile
import os
from pathlib import Path
from xml.etree.ElementTree import Element, SubElement, tostring
from xml.dom import minidom

BASE = Path(__file__).resolve().parent
DATA_PATH = BASE / "full_scan_results.json"
XLSX_PATH = BASE / "דוח_סריקה_תרבותו_ומתחרים.xlsx"


def load_data():
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def escape_xml(s):
    if s is None:
        return ""
    s = str(s)
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;").replace("'", "&apos;")


def build_xlsx_stdlib(data):
    """Build a minimal valid .xlsx (ZIP with XML) using stdlib only."""
    # Shared strings and sheet content
    strings = []
    def si(s):
        i = len(strings)
        strings.append(escape_xml(s))
        return i

    rows = []
    # Sheet 1 - Land tours
    rows.append([si("שם הטיול"), si("ימים"), si("תאריך"), si("יעד")])
    for t in data["tarbutu"]["land_tours"]:
        rows.append([si(t["name"]), si(t.get("days") or ""), si(t.get("date") or ""), si(t.get("destination") or "")])
    # Add empty row then sea cruises
    rows.append([])
    rows.append([si("קרוז ים"), si(""), si(""), si("")])
    for t in data["tarbutu"]["sea_cruises"]:
        rows.append([si(t["name"]), si(t.get("days") or ""), si(t.get("date") or ""), si(t.get("destination") or t.get("category") or "")])
    rows.append([])
    rows.append([si("שייט נהרות"), si(""), si(""), si("")])
    for t in data["tarbutu"]["river_cruises"]:
        rows.append([si(t["name"]), si(t.get("days") or ""), si(t.get("date") or ""), si(t.get("ship") or t.get("ships") or "")])
    rows.append([])
    rows.append([si("מתחרים"), si(""), si(""), si("")])
    for name, c in data["competitors"].items():
        j = c.get("japan_trips") or ("אין" if not c.get("japan") else "כן")
        if isinstance(j, (int, float)):
            j = str(j) + " טיולים"
        rows.append([si(name), si(c.get("url") or ""), si(c.get("focus") or ""), si(c.get("notes") or "")])

    # Build sharedStrings.xml
    ns_s = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    sst = Element("{%s}sst" % ns_s, attrib={"count": str(len(strings)), "uniqueCount": str(len(strings))})
    for s in strings:
        si_el = SubElement(sst, "{%s}si" % ns_s)
        t = SubElement(si_el, "{%s}t" % ns_s)
        t.text = s
    shared_str_xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + tostring(sst, encoding="unicode", default_namespace=ns_s)

    # Build sheet1.xml
    ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    worksheet = Element("{%s}worksheet" % ns, attrib={"xmlns": ns})
    sheetData = SubElement(worksheet, "{%s}sheetData" % ns)
    for r_idx, row in enumerate(rows, 1):
        if not row:
            continue
        row_el = SubElement(sheetData, "{%s}row" % ns, attrib={"r": str(r_idx)})
        def col_letter(i):
            if i < 26: return chr(65 + i)
            return col_letter(i // 26 - 1) + chr(65 + i % 26)
        for c_idx, s_idx in enumerate(row):
            if isinstance(s_idx, int):
                c_el = SubElement(row_el, "{%s}c" % ns, attrib={"r": f"{col_letter(c_idx)}{r_idx}", "t": "s"})
                v = SubElement(c_el, "{%s}v" % ns)
                v.text = str(s_idx)
    sheet_xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + tostring(worksheet, encoding="unicode", default_namespace=ns)

    # Write ZIP (xlsx)
    with zipfile.ZipFile(XLSX_PATH, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>""")
        z.writestr("_rels/.rels", """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml" Id="rId1"/>
</Relationships>""")
        z.writestr("xl/_rels/workbook.xml.rels", """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml" Id="rId1"/>
<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml" Id="rId2"/>
</Relationships>""")
        z.writestr("xl/workbook.xml", """<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheets><sheet name="דוח סריקה" sheetId="1" r:id="rId1"/></sheets>
</workbook>""")
        z.writestr("xl/worksheets/sheet1.xml", sheet_xml)
        z.writestr("xl/sharedStrings.xml", shared_str_xml)
    print("Created:", XLSX_PATH)


def build_docx_stdlib(data):
    """Build a minimal .docx (ZIP with word/document.xml) using stdlib only."""
    body = []
    body.append('<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>דוח סריקה מלא – תרבותו ומתחרים</w:t></w:r></w:p>')
    body.append("<w:p><w:r><w:t>תאריך סריקה: פברואר 2025</w:t></w:r></w:p>")
    body.append("<w:p><w:r><w:t>חלק א' – תרבותו (חברה שלנו)</w:t></w:r></w:p>")
    body.append("<w:p><w:r><w:t>טיולי תרבות יבשתיים</w:t></w:r></w:p>")
    body.append("<w:tbl><w:tblPr/><w:tr>")
    for h in ["שם הטיול", "ימים", "תאריך", "יעד"]:
        body.append(f"<w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>{escape_xml(h)}</w:t></w:r></w:p></w:tc>")
    body.append("</w:tr>")
    for t in data["tarbutu"]["land_tours"]:
        body.append("<w:tr>")
        for v in [t["name"], str(t.get("days") or ""), t.get("date") or "", t.get("destination") or ""]:
            body.append(f"<w:tc><w:p><w:r><w:t>{escape_xml(v)}</w:t></w:r></w:p></w:tc>")
        body.append("</w:tr>")
    body.append("</w:tbl>")
    body.append("<w:p/><w:p><w:r><w:t>קרוזים + שייט נהרות + מתחרים – ראה קובץ אקסל או דוח MD.</w:t></w:r></w:p>")
    doc_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>""" + "".join(body) + """</w:body>
</w:document>"""
    DOCX_PATH = BASE / "דוח_סריקה_תרבותו_ומתחרים.docx"
    with zipfile.ZipFile(DOCX_PATH, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>""")
        z.writestr("_rels/.rels", """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml" Id="rId1"/>
</Relationships>""")
        z.writestr("word/document.xml", doc_xml)
    print("Created:", DOCX_PATH)


def main():
    data = load_data()
    build_xlsx_stdlib(data)
    build_docx_stdlib(data)


if __name__ == "__main__":
    main()
