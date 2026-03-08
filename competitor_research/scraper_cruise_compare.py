# competitor_research/scraper_cruise_compare.py
# סורק דפי קרוזים בתרבותו ומסעות, מוצא הפלגות עם אותה אונייה ואותו תאריך, משווה מחירים בטבלה.
#
# הרצה:
#   pip install playwright playwright-stealth beautifulsoup4 requests
#   playwright install chromium   # פעם אחת
#   python scraper_cruise_compare.py
#
# פלט: cruise_compare_results.json, cruise_price_comparison.html, cruise_price_comparison.md

import json
import re
import time
import unicodedata
from pathlib import Path
from datetime import datetime
from urllib.parse import urljoin, urlparse

try:
    from playwright.sync_api import sync_playwright
    from playwright_stealth import stealth_sync
except ImportError:
    sync_playwright = None
    stealth_sync = None

from bs4 import BeautifulSoup

try:
    import requests
except ImportError:
    requests = None

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_JSON = BASE_DIR / "cruise_compare_results.json"
OUTPUT_HTML = BASE_DIR / "cruise_price_comparison.html"
OUTPUT_MD = BASE_DIR / "cruise_price_comparison.md"

# דפים לסריקה
TARBUTU_CRUISES_URL = "https://www.tarbutu.co.il/%D7%A7%D7%A8%D7%95%D7%96%D7%99%D7%9D/"
TARBUTU_RIVER_CRUISES_URL = "https://www.tarbutu.co.il/%D7%A9%D7%99%D7%99%D7%98-%D7%A0%D7%94%D7%A8%D7%95%D7%AA/"
MASSAOT_URL = "https://www.masaot.co.il/"

# חודשים עבריים -> מספר
HEBREW_MONTHS = {
    "ינואר": 1, "פברואר": 2, "מרץ": 3, "מרס": 3, "אפריל": 4, "מאי": 5, "יוני": 6, "יולי": 7,
    "אוגוסט": 8, "ספטמבר": 9, "אוקטובר": 10, "נובמבר": 11, "דצמבר": 12,
}

# תבניות לחילוץ אונייה (סוף כותרת או ביטויים נפוצים)
SHIP_PATTERNS = [
    r"\b(?:MS|MSC|Msc|Ms)\s+([A-Za-z0-9\s\-]+?)(?:\s+\d{4}|\s*$|\.)",
    r"אוניה\s+([^\s,]+(?:\s+[^\s,]+)?)",
    r"ספינת?\s+(?:הנהר\s+)?([A-Za-z0-9\s\-]+?)(?:\s+\d{4}|\s*$)",
    r"(?:באוניה|אוניית)\s+([A-Za-z0-9\s\-]+?)(?:\s+\d{4}|\s*$)",
    r"\b([A-Z][a-z]+\s+[A-Z][a-z]+)\s*(?:\d{4}|$)",  # e.g. World Europa, Miguel Torga
    r"(\d{4})\s+(Msc\s+World\s+Europa)",
    r"(Msc\s+World\s+Europa)",
    r"(MS\s+MIGUEL\s+TORGA)",
    r"(MS\s+Amalia\s+Rodrigues)",
    r"(Cyrano\s+de\s+Bergerac)",
]

# תבנית: X ימים/לילות - חודש שנה או תאריך (כולל 14/6/26, מובטח!, בהכנה)
DATE_LINE_PATTERN = re.compile(
    r"(\d+)\s*(?:ימים|לילות)\s*[-–]\s*"
    r"(?:(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})|"  # 14/6/26
    r"(\d+)\s*(?:ב)?\s*(\w+)\s*(\d{4})|"  # 19 באוגוסט 2026
    r"(\w+)\s*(\d{4})|"  # נובמבר 2026
    r"בהכנה\s*!?\s*(\w+)\s*(\d{4})?|"
    r"מובטח\s*!?\s*(\w+)\s*(\d{4})?)",
    re.IGNORECASE
)


def normalize_ship(name):
    """נרמול שם אונייה להשוואה."""
    if not name or not isinstance(name, str):
        return ""
    s = name.strip()
    s = re.sub(r"\s+", " ", s)
    # הסרת קידומות
    for prefix in ["MS ", "MSC ", "Msc ", "אוניה ", "ספינה ", "ספינת הנהר "]:
        if s.lower().startswith(prefix.lower()):
            s = s[len(prefix):].strip()
    return s.strip().lower()


def parse_hebrew_date(date_text):
    """מחזיר (year, month) או None. תאריך מהטקסט כמו 'נובמבר 2026', '19 באוגוסט 2026', '14/6/26'."""
    if not date_text:
        return None
    # שנה בת 4 ספרות
    m = re.search(r"(\d{4})", date_text)
    if m:
        year = int(m.group(1))
    else:
        # שנה בת 2 ספרות 26 -> 2026
        m2 = re.search(r"[/\-](\d{2})\s*$|[/\-](\d{2})(?:\s|$)", date_text)
        if m2:
            y = int(m2.group(1) or m2.group(2))
            year = 2000 + y if y < 50 else 1900 + y
        else:
            return None
    month = None
    for heb, num in HEBREW_MONTHS.items():
        if heb in date_text:
            month = num
            break
    if month is None:
        # תאריך מספרי 14/6/26
        dm = re.search(r"(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})", date_text)
        if dm:
            month = int(dm.group(2))
            if month < 1 or month > 12:
                month = None
    if month is None:
        m = re.search(r"(?:ב)?\s*(\w+)\s*" + str(year), date_text)
        if m:
            for heb, num in HEBREW_MONTHS.items():
                if heb in m.group(0):
                    month = num
                    break
    if month is None and year:
        return (year, None)
    return (year, month) if month else None


def extract_ship_from_title(title):
    """חילוץ שם אונייה מתוך כותרת."""
    if not title:
        return None
    for pat in SHIP_PATTERNS:
        m = re.search(pat, title, re.IGNORECASE)
        if m:
            name = m.group(1).strip() if m.lastindex >= 1 else m.group(0).strip()
            if len(name) > 2 and not name.isdigit():
                return name
    # ניסיון: המילים האחרונות (לעתים שם האונייה)
    words = title.split()
    for i in range(min(4, len(words)), 0, -1):
        tail = " ".join(words[-i:])
        if re.search(r"[A-Za-z]{3,}", tail) and not re.search(r"\d{4}", tail):
            return tail
    return None


def extract_price_from_text(text):
    """חילוץ מחיר מהטקסט (₪ או $)."""
    if not text:
        return None
    # מחיר לאדם / לזוג / חדר זוגי
    patterns = [
        r"(\d[\d,.]*)\s*[₪\$€]",
        r"[₪\$€]\s*(\d[\d,.]*)",
        r"מחיר[^\d]*(\d[\d,.]*)",
    ]
    for p in patterns:
        m = re.search(p, text.replace(",", ""))
        if m:
            try:
                num = float(m.group(1).replace(",", "").replace(" ", ""))
                if 100 < num < 500000:  # טווח סביר
                    return str(int(num))
            except ValueError:
                pass
    return None


def fetch_page_playwright(url, timeout=30000):
    """טעינת דף עם Playwright (או requests כגיבוי) והחזרת HTML."""
    if sync_playwright and stealth_sync:
        return _fetch_playwright(url, timeout)
    if requests:
        try:
            r = requests.get(url, timeout=timeout // 1000, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0"})
            r.raise_for_status()
            return r.text, None
        except Exception as e:
            return None, str(e)
    return None, "playwright or requests not installed"


def _fetch_playwright(url, timeout=30000):
    """טעינת דף עם Playwright."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            locale="he-IL",
        )
        page = context.new_page()
        stealth_sync(page)
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=timeout)
            time.sleep(2)
            content = page.content()
            browser.close()
            return content, None
        except Exception as e:
            try:
                browser.close()
            except Exception:
                pass
            return None, str(e)


def _is_cruise_link(href):
    """קישור לפוסט קרוז ולא ל-author/category/tag."""
    if not href or "tarbutu" not in href.lower():
        return False
    bad = ["/author/", "/category/", "/tag/", "/feed/", "wp-content", "?replytocom", "/#"]
    return not any(b in href for b in bad)


def parse_tarbutu_cruises(html, base_url):
    """מפרסר דף רשימת קרוזים של תרבותו ומחזיר רשימת קרוזים.
    מחפשים כל מופע של תבנית תאריך ב-HTML, ולוקחים קישורים רק באזור שבין תאריך לתאריך."""
    cruises = []
    if not html:
        return cruises
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style"]):
        tag.decompose()
    text = soup.get_text(separator=" ", strip=True)

    # מוצאים כל מופעי "X ימים" או "X לילות" ב-HTML (חיפוש "ימים"/"לילות" ואז בדיקה שההקשר תאריך)
    date_positions = []
    for needle in ["ימים", "לילות"]:
        idx = 0
        while True:
            idx = html.find(needle, idx)
            if idx < 0:
                break
            chunk = html[max(0, idx - 60):idx + 50]
            chunk_text = BeautifulSoup(chunk, "html.parser").get_text(separator=" ", strip=True)
            if DATE_LINE_PATTERN.search(chunk_text):
                date_positions.append(max(0, idx - 60))
            idx += 1
    date_positions.sort()

    for i, pos in enumerate(date_positions):
        next_pos = date_positions[i + 1] if i + 1 < len(date_positions) else pos + 3000
        fragment = html[pos:min(next_pos, pos + 2200)]
        frag_soup = BeautifulSoup(fragment, "html.parser")
        frag_text = frag_soup.get_text(separator=" ", strip=True)
        m = DATE_LINE_PATTERN.search(frag_text)
        if not m:
            continue
        date_snippet = m.group(0)
        date_norm = parse_hebrew_date(date_snippet)
        if not date_norm:
            continue
        for a in frag_soup.find_all("a", href=True):
            href = a.get("href", "")
            if not _is_cruise_link(href):
                continue
            if not href.startswith("http"):
                href = urljoin(base_url, href)
            title = a.get_text(strip=True)
            if len(title) < 4:
                continue
            ship = extract_ship_from_title(title)
            price = extract_price_from_text(frag_text)
            cruises.append({
                "source": "תרבותו",
                "title": title[:300],
                "ship": ship,
                "ship_normalized": normalize_ship(ship) if ship else "",
                "date_display": date_snippet[:80],
                "date_norm": date_norm,
                "price": price,
                "url": href,
            })

    if not cruises:
        for a in soup.find_all("a", href=True):
            href = a.get("href", "")
            if not _is_cruise_link(href):
                continue
            if not href.startswith("http"):
                href = urljoin(base_url, href)
            title = a.get_text(strip=True)
            if len(title) < 5:
                continue
            block = a.parent
            for _ in range(15):
                if block is None:
                    break
                block_text = block.get_text(separator=" ", strip=True)
                m = DATE_LINE_PATTERN.search(block_text)
                if m and len(block_text) > 80:
                    date_snippet = m.group(0)
                    date_norm = parse_hebrew_date(date_snippet)
                    if date_norm:
                        ship = extract_ship_from_title(title or block_text)
                        price = extract_price_from_text(block_text)
                        cruises.append({
                            "source": "תרבותו",
                            "title": title[:300],
                            "ship": ship,
                            "ship_normalized": normalize_ship(ship) if ship else "",
                            "date_display": date_snippet[:80],
                            "date_norm": date_norm,
                            "price": price,
                            "url": href,
                        })
                    break
                block = block.parent

    seen = set()
    unique = []
    for c in cruises:
        key = (c.get("date_norm"), c.get("url"))
        if key in seen:
            continue
        seen.add(key)
        unique.append(c)
    return unique


def parse_massaot_cruises(html, base_url):
    """מפרסר דף מסעות ומחלץ קרוזים (אונייה, תאריך, מחיר)."""
    cruises = []
    if not html:
        return cruises
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style"]):
        tag.decompose()
    raw = soup.get_text(separator=" ", strip=True)

    # תבנית סטנדרטית
    for m in DATE_LINE_PATTERN.finditer(raw):
        date_snippet = m.group(0)
        date_norm = parse_hebrew_date(date_snippet)
        if not date_norm:
            continue
        start = max(0, m.start() - 400)
        end = min(len(raw), m.end() + 600)
        block = raw[start:end]
        ship = extract_ship_from_title(block)
        price = extract_price_from_text(block)
        cruises.append({
            "source": "מסעות",
            "title": block[:200],
            "ship": ship,
            "ship_normalized": normalize_ship(ship) if ship else "",
            "date_display": date_snippet[:80],
            "date_norm": date_norm,
            "price": price,
            "url": base_url,
        })

    # תבנית גמישה: "X ימים" או "X לילות" עם שנה בקרבת מקום
    if not cruises:
        flex = re.compile(r"(\d+)\s*(?:ימים|לילות)\s*[-–]?\s*([^\d]{2,30}?\d{4})")
        for m in flex.finditer(raw):
            date_snippet = m.group(0)
            date_norm = parse_hebrew_date(date_snippet)
            if not date_norm:
                continue
            start = max(0, m.start() - 300)
            end = min(len(raw), m.end() + 500)
            block = raw[start:end]
            ship = extract_ship_from_title(block)
            price = extract_price_from_text(block)
            cruises.append({
                "source": "מסעות",
                "title": block[:200],
                "ship": ship,
                "ship_normalized": normalize_ship(ship) if ship else "",
                "date_display": date_snippet[:80],
                "date_norm": date_norm,
                "price": price,
                "url": base_url,
            })

    seen = set()
    unique = []
    for c in cruises:
        key = (c.get("date_norm"), c.get("ship_normalized") or c.get("title", "")[:50])
        if key in seen:
            continue
        seen.add(key)
        unique.append(c)
    return unique


def match_cruises(tarbutu_list, massaot_list):
    """מתאים הפלגות עם אותה אונייה ואותו תאריך."""
    matches = []
    for t in tarbutu_list:
        tn = (t.get("ship_normalized") or "").strip()
        td = t.get("date_norm")
        if not td:
            continue
        for m in massaot_list:
            mn = (m.get("ship_normalized") or "").strip()
            md = m.get("date_norm")
            if md != td:
                continue
            # התאמת אונייה (זהה או דומה) – רק כששניהם קיימים או אחד מכיל את השני
            if tn and mn and (tn == mn or tn in mn or mn in tn):
                matches.append({
                    "ship": t.get("ship") or m.get("ship") or "—",
                    "date_display": t.get("date_display") or str(td),
                    "date_norm": td,
                    "tarbutu_price": t.get("price"),
                    "massaot_price": m.get("price"),
                    "tarbutu_url": t.get("url"),
                    "massaot_url": m.get("url"),
                    "tarbutu_title": t.get("title", "")[:120],
                    "massaot_title": m.get("title", "")[:120],
                })
    return matches


def build_table_html(matches, tarbutu_cruises, massaot_cruises):
    """בונה קובץ HTML עם טבלת השוואת מחירים."""
    rows = []
    for r in matches:
        p_t = r.get("tarbutu_price") or "—"
        p_m = r.get("massaot_price") or "—"
        diff = ""
        try:
            a, b = int(p_t), int(p_m)
            d = a - b
            if d > 0:
                diff = f"+{d} (תרבותו יקר יותר)"
            elif d < 0:
                diff = f"{d} (מסעות יקר יותר)"
            else:
                diff = "אותו מחיר"
        except (ValueError, TypeError):
            pass
        rows.append(f"""
        <tr>
          <td>{r.get('ship', '—')}</td>
          <td>{r.get('date_display', '—')}</td>
          <td>{p_t}</td>
          <td>{p_m}</td>
          <td>{diff}</td>
          <td><a href="{r.get('tarbutu_url') or '#'}" target="_blank">קישור</a></td>
          <td><a href="{r.get('massaot_url') or '#'}" target="_blank">קישור</a></td>
        </tr>""")

    table_body = "\n".join(rows) if rows else "<tr><td colspan='7'>לא נמצאו הפלגות תואמות (אותה אונייה ואותו תאריך).</td></tr>"

    # טבלת כל הקרוזים שנמצאו (לכל מקור)
    def _row(c, source):
        return f"<tr><td>{c.get('ship') or '—'}</td><td>{c.get('date_display') or '—'}</td><td>{c.get('price') or '—'}</td><td><a href=\"{c.get('url') or '#'}\" target=\"_blank\">{source}</a></td></tr>"
    tarbutu_rows = "\n".join(_row(c, "קישור") for c in tarbutu_cruises[:50])
    massaot_rows = "\n".join(_row(c, "קישור") for c in massaot_cruises[:50])
    if not tarbutu_rows:
        tarbutu_rows = "<tr><td colspan='4'>לא נמצאו קרוזים בדף שנסרק.</td></tr>"
    if not massaot_rows:
        massaot_rows = "<tr><td colspan='4'>לא נמצאו קרוזים בדף שנסרק.</td></tr>"

    html = f"""<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8">
  <title>השוואת מחירי קרוזים – תרבותו vs מסעות</title>
  <style>
    body {{ font-family: Arial, sans-serif; margin: 20px; direction: rtl; }}
    table {{ border-collapse: collapse; width: 100%; margin-bottom: 24px; }}
    th, td {{ border: 1px solid #ddd; padding: 8px; text-align: right; }}
    th {{ background: #4472C4; color: white; }}
    tr:nth-child(even) {{ background: #f2f2f2; }}
    a {{ color: #0563C1; }}
    h1 {{ color: #333; }}
    h2 {{ color: #444; font-size: 1.1rem; margin-top: 28px; }}
    .meta {{ color: #666; font-size: 14px; margin-bottom: 20px; }}
  </style>
</head>
<body>
  <h1>השוואת מחירי קרוזים – תרבותו vs מסעות</h1>
  <p class="meta">עודכן: {datetime.now().strftime('%Y-%m-%d %H:%M')}</p>

  <h2>התאמות (אותה אונייה ואותו תאריך)</h2>
  <table>
    <thead>
      <tr>
        <th>אונייה</th>
        <th>תאריך</th>
        <th>מחיר תרבותו (₪)</th>
        <th>מחיר מסעות (₪)</th>
        <th>הפרש</th>
        <th>תרבותו</th>
        <th>מסעות</th>
      </tr>
    </thead>
    <tbody>
{table_body}
    </tbody>
  </table>

  <h2>קרוזים שנמצאו בתרבותו ({len(tarbutu_cruises)})</h2>
  <table>
    <thead><tr><th>אונייה</th><th>תאריך</th><th>מחיר</th><th>קישור</th></tr></thead>
    <tbody>{tarbutu_rows}</tbody>
  </table>

  <h2>קרוזים שנמצאו במסעות ({len(massaot_cruises)})</h2>
  <table>
    <thead><tr><th>אונייה</th><th>תאריך</th><th>מחיר</th><th>קישור</th></tr></thead>
    <tbody>{massaot_rows}</tbody>
  </table>

  <p class="meta">סה"כ {len(tarbutu_cruises)} קרוזים מתרבותו, {len(massaot_cruises)} ממסעות. התאמות: {len(matches)}.</p>
</body>
</html>"""
    return html


def build_table_md(matches, tarbutu_cruises, massaot_cruises):
    """טבלת Markdown."""
    lines = [
        "# השוואת מחירי קרוזים – תרבותו vs מסעות",
        "",
        f"*עודכן: {datetime.now().strftime('%Y-%m-%d %H:%M')}*",
        "",
        "## הפלגות עם אותה אונייה ואותו תאריך",
        "",
        "| אונייה | תאריך | מחיר תרבותו (₪) | מחיר מסעות (₪) | הפרש |",
        "|--------|--------|------------------|----------------|------|",
    ]
    for r in matches:
        p_t = r.get("tarbutu_price") or "—"
        p_m = r.get("massaot_price") or "—"
        diff = ""
        try:
            a, b = int(p_t), int(p_m)
            d = a - b
            if d > 0:
                diff = f"+{d} (תרבותו יקר)"
            elif d < 0:
                diff = f"{d} (מסעות יקר)"
            else:
                diff = "זהה"
        except (ValueError, TypeError):
            pass
        lines.append(f"| {r.get('ship', '—')} | {r.get('date_display', '—')} | {p_t} | {p_m} | {diff} |")
    if not matches:
        lines.append("| — | לא נמצאו התאמות | — | — | — |")
    lines.extend([
        "",
        f"*סה\"כ: {len(tarbutu_cruises)} קרוזים מתרבותו, {len(massaot_cruises)} ממסעות. התאמות: {len(matches)}.*",
    ])
    return "\n".join(lines)


def main():
    tarbutu_cruises = []

    print("סורק תרבותו – דף קרוזים...")
    html_t, err_t = fetch_page_playwright(TARBUTU_CRUISES_URL)
    if err_t:
        print(f"  שגיאה: {err_t}")
    else:
        tarbutu_cruises.extend(parse_tarbutu_cruises(html_t, TARBUTU_CRUISES_URL))
        print(f"  נמצאו {len(tarbutu_cruises)} קרוזים.")

    print("סורק תרבותו – שייט נהרות...")
    html_river, err_r = fetch_page_playwright(TARBUTU_RIVER_CRUISES_URL)
    if err_r:
        print(f"  שגיאה: {err_r}")
    else:
        river = parse_tarbutu_cruises(html_river, TARBUTU_RIVER_CRUISES_URL)
        before = len(tarbutu_cruises)
        seen_urls = {c.get("url") for c in tarbutu_cruises}
        for c in river:
            if c.get("url") not in seen_urls:
                tarbutu_cruises.append(c)
                seen_urls.add(c.get("url"))
        print(f"  נוספו {len(tarbutu_cruises) - before} שייטי נהרות (סה\"כ {len(tarbutu_cruises)}).")

    print("סורק מסעות...")
    html_m, err_m = fetch_page_playwright(MASSAOT_URL, timeout=35000)
    if err_m:
        print(f"  שגיאה מסעות: {err_m}")
        massaot_cruises = []
    else:
        massaot_cruises = parse_massaot_cruises(html_m, MASSAOT_URL)
        print(f"  נמצאו {len(massaot_cruises)} קרוזים.")

    matches = match_cruises(tarbutu_cruises, massaot_cruises)
    print(f"התאמות (אותה אונייה + תאריך): {len(matches)}")

    data = {
        "generated_at": datetime.now().astimezone().isoformat(),
        "tarbutu_url": TARBUTU_CRUISES_URL,
        "massaot_url": MASSAOT_URL,
        "tarbutu_cruises": tarbutu_cruises,
        "massaot_cruises": massaot_cruises,
        "matches": matches,
    }
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    html_content = build_table_html(matches, tarbutu_cruises, massaot_cruises)
    with open(OUTPUT_HTML, "w", encoding="utf-8") as f:
        f.write(html_content)

    md_content = build_table_md(matches, tarbutu_cruises, massaot_cruises)
    with open(OUTPUT_MD, "w", encoding="utf-8") as f:
        f.write(md_content)

    print(f"נשמר: {OUTPUT_JSON}, {OUTPUT_HTML}, {OUTPUT_MD}")
    return data


if __name__ == "__main__":
    main()
