# competitor_research/build_cruise_list_2026.py
# בונה רשימת קרוזים 2026 מ-cruise_compare_results.json
# הרצה: python build_cruise_list_2026.py

import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
INPUT_JSON = BASE_DIR / "cruise_compare_results.json"
OUTPUT_MD = BASE_DIR / "cruise_list_2026.md"

HEBREW_MONTHS = {
    1: "ינואר", 2: "פברואר", 3: "מרץ", 4: "אפריל", 5: "מאי", 6: "יוני",
    7: "יולי", 8: "אוגוסט", 9: "ספטמבר", 10: "אוקטובר", 11: "נובמבר", 12: "דצמבר",
}


def main():
    if not INPUT_JSON.exists():
        print(f"לא נמצא קובץ: {INPUT_JSON}")
        print("הרץ קודם: python scraper_cruise_compare.py")
        return

    with open(INPUT_JSON, encoding="utf-8") as f:
        data = json.load(f)

    all_cruises = []
    for c in data.get("tarbutu_cruises", []):
        c["source_label"] = "תרבותו"
        all_cruises.append(c)
    for c in data.get("massaot_cruises", []):
        c["source_label"] = "מסעות"
        all_cruises.append(c)

    # רק 2026
    year = 2026
    cruises_2026 = []
    for c in all_cruises:
        dn = c.get("date_norm")
        if isinstance(dn, list) and len(dn) >= 1 and dn[0] == year:
            cruises_2026.append(c)
        elif isinstance(dn, tuple) and len(dn) >= 1 and dn[0] == year:
            cruises_2026.append(c)

    # מיון: חודש, ואז כותרת
    def sort_key(c):
        dn = c.get("date_norm") or [0, 0]
        month = dn[1] if len(dn) > 1 else 0
        return (month, (c.get("title") or "")[:80])

    cruises_2026.sort(key=sort_key)

    # קיבוץ לפי חודש
    by_month = {}
    for c in cruises_2026:
        dn = c.get("date_norm") or [0, 0]
        month = dn[1] if len(dn) > 1 else 0
        month_name = HEBREW_MONTHS.get(month, "ללא תאריך")
        if month_name not in by_month:
            by_month[month_name] = []
        by_month[month_name].append(c)

    # סדר חודשים
    month_order = list(HEBREW_MONTHS.values())
    ordered_months = [m for m in month_order if m in by_month]
    ordered_months += [m for m in by_month if m not in month_order]

    lines = [
        "# רשימת קרוזים 2026",
        "",
        f"סה\"כ **{len(cruises_2026)}** הפלגות בשנת 2026 (מקור: תרבותו + מסעות).",
        "",
        "---",
        "",
    ]

    for month_name in ordered_months:
        items = by_month[month_name]
        lines.append(f"## {month_name} 2026")
        lines.append("")
        for c in items:
            title = (c.get("title") or "ללא כותרת").strip()
            if len(title) > 120:
                title = title[:117] + "..."
            date_display = c.get("date_display") or ""
            ship = c.get("ship")
            ship_str = f" — {ship}" if ship else ""
            url = c.get("url") or ""
            lines.append(f"- **{title}**{ship_str}")
            lines.append(f"  - {date_display}")
            if url:
                lines.append(f"  - [קישור]({url})")
            lines.append("")
        lines.append("")

    with open(OUTPUT_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"נשמר: {OUTPUT_MD}")
    print(f"סה\"כ {len(cruises_2026)} קרוזים ב-2026.")


if __name__ == "__main__":
    main()
