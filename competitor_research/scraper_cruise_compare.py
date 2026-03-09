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
from urllib.parse import urljoin, urlparse, quote

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

# דפים לסריקה (נקודות כניסה – דפי רשימה נוספים מתגלים אוטומטית מקישורים)
TARBUTU_CRUISES_URL = "https://www.tarbutu.co.il/%D7%A7%D7%A8%D7%95%D7%96%D7%99%D7%9D/"
TARBUTU_RIVER_CRUISES_URL = "https://www.tarbutu.co.il/%D7%A9%D7%99%D7%99%D7%98-%D7%A0%D7%94%D7%A8%D7%95%D7%AA/"
# דפי יעד – כל היעדים מהתפריט (לחיצה על כל אחד = דף עם רשימת הפלגות). מכל יעד מוציאים את כל הכרטיסים.
TARBUTU_BASE = "https://www.tarbutu.co.il/"
# רשימת כל שמות היעדים כמו בתפריט – נבנה מהם כתובות ונסרוק את כולם
ALL_CRUISE_DESTINATION_NAMES = [
    "איסלנד",
    "אלסקה והרי הרוקי בקנדה",
    "ארה\"ב ומזרח קנדה-שלכת בניו אינגלנד",
    "אוסטרליה וניו זילנד",
    "האיים הבריטיים",
    "האיים הקנריים",
    "הים הבלטי",
    "הפיורדים הנורווגיים",
    "הפיורדים והכף הצפוני",
    "החוג הארקטי, מעבר לכף הצפוני עד לשפיצברגן",
    "יפן והמזרח הרחוק",
    "מערב הים התיכון",
    "דרום אמריקה וגלאפגוס",
    "טיול וקרוז לאלסקה ולהרי הרוקי אוגוסט 2026",
    "פניני הים האדריאטי -דוברובניק, מונטנגרו, קורפו",
    "הודו קרוז לאיים המלדיביים",
    "איי סיישל, מדגסקר, מאוריציוס וריוניון",
    "קרוזים לניו אינגלנד",
]
# כתובות ידועות ששונות מהשם (למשל פיורדים2 במקום הפיורדים הנורווגיים)
TARBUTU_EXTRA_LIST_URLS = [
    ("https://www.tarbutu.co.il/%d7%a4%d7%99%d7%95%d7%a8%d7%93%d7%99%d7%9d2/", "הפיורדים הנורווגיים"),
    ("https://www.tarbutu.co.il/%d7%99%d7%9d-%d7%94%d7%91%d7%9c%d7%98%d7%99/", "הים הבלטי"),
]
MASSAOT_URL = "https://www.massaot.co.il/"
MAX_LIST_PAGE_CANDIDATES = 50

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
    """חילוץ מחיר מהטקסט (₪ או $ או מספר אחרי מחיר)."""
    if not text:
        return None
    patterns = [
        r"מחירים\s*ב-\s*\$\s*לאדם[^\d]*(\d[\d,.]*)",
        r"חדר\s*פנימי[^\d]*(\d[\d,.]*)\s*\$",
        r"החל\s*מ[-\s]*(\d[\d,.]*)\s*[₪\$€]",
        r"מחיר[^\d]*(\d[\d,.]*)\s*[₪\$€]",
        r"מחיר[^\d]{0,30}(\d[\d,.]*)\s*(?:₪|\$|שקל)",
        r"(\d[\d,.]*)\s*[₪\$€]\s*לאדם",
        r"(\d[\d,.]*)\s*[₪\$€]\s*לזוג",
        r"(\d[\d,.]*)\s*[₪\$€]\s*לחדר",
        r"(\d[\d,.]*)\s*\$",  # 4,125 $
        r"(\d[\d,.]*)\s*[₪\$€]",
        r"[₪\$€]\s*(\d[\d,.]*)",
        r"(?:מ|מ-)\s*(\d[\d,.]*)\s*(?:₪|\$|שקל)",
    ]
    for p in patterns:
        m = re.search(p, text.replace(",", ""), re.IGNORECASE)
        if m:
            try:
                num = float(m.group(1).replace(",", "").replace(" ", ""))
                if 100 < num < 500000:
                    return str(int(num))
            except ValueError:
                pass
    return None


def extract_price_from_html(soup):
    """חילוץ מחיר מאלמנטים ב-HTML (טבלאות מחירים, class מחיר)."""
    if not soup:
        return None
    # טבלת מחירים: תא שמכיל $ ומספר (למשל "4,125 $")
    for cell in soup.find_all(["td", "th", "span", "div"]):
        t = cell.get_text(strip=True)
        if "$" in t or "₪" in t:
            m = re.search(r"(\d[\d,.]*)\s*[₪\$]|[₪\$]\s*(\d[\d,.]*)", t)
            if m:
                raw = (m.group(1) or m.group(2) or "").replace(",", "")
                try:
                    num = float(raw)
                    if 100 < num < 500000:
                        return str(int(num))
                except ValueError:
                    pass
    for attr in ["class", "id"]:
        for tag in soup.find_all(attrs={attr: re.compile(r"price|מחיר|amount|תמחור", re.I)}):
            t = tag.get_text(strip=True)
            m = re.search(r"(\d[\d,.]*)", t.replace(",", ""))
            if m:
                try:
                    num = float(m.group(1).replace(",", ""))
                    if 100 < num < 500000:
                        return str(int(num))
                except ValueError:
                    pass
    for tag in soup.find_all(string=re.compile(r"מחיר|החל\s*מ|₪|\$\s*\d")):
        parent = tag.parent
        if parent:
            t = parent.get_text(separator=" ", strip=True)
            price = extract_price_from_text(t)
            if price:
                return price
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
            # המתנה לתפריט/ניווט (רשימת היעדים) שיטען
            time.sleep(5)
            try:
                page.wait_for_selector("a[href*='tarbutu']", timeout=6000)
            except Exception:
                pass
            content = page.content()
            browser.close()
            return content, None
        except Exception as e:
            try:
                browser.close()
            except Exception:
                pass
            return None, str(e)


def _fetch_with_page(page, url, timeout=20000):
    """טעינת דף עם דף Playwright קיים (לסריקה פנימית)."""
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=timeout)
        time.sleep(1.5)
        return page.content(), None
    except Exception as e:
        return None, str(e)


def extract_dates_from_text(text):
    """מחלץ מהטקסט כל תאריכי יציאה/הפלגה (עברית ומספרים)."""
    if not text:
        return []
    found = []
    for m in re.finditer(r"\d{1,2}\s*(?:ב)?\s*(?:ינואר|פברואר|מרץ|מרס|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)\s*\d{4}", text):
        found.append(m.group(0).strip())
    for m in re.finditer(r"(?:ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)\s*\d{4}", text):
        s = m.group(0).strip()
        if s not in found:
            found.append(s)
    for m in re.finditer(r"\d{1,2}\s*/\s*\d{1,2}\s*/\s*\d{2,4}", text):
        found.append(m.group(0).strip())
    for m in re.finditer(r"יציאה\s*[:\-]\s*([^\n]{3,40})", text):
        found.append(m.group(1).strip())
    seen = set()
    unique = []
    for s in found:
        if len(s) > 2 and s not in seen:
            seen.add(s)
            unique.append(s)
    return unique[:15]


def parse_price_table_from_inner_page(html, base_cruise):
    """מפרסר טבלת מחירים ותאריכים בעמוד קרוז. כל שורה = קרוז (הפלגה) נפרד.
    מחזיר רשימת קרוזים: אם נמצאה טבלה עם כמה שורות – קרוז לכל שורה; אחרת רשימה ריקה."""
    if not html or not base_cruise:
        return []
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style"]):
        tag.decompose()
    cruises = []
    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        if len(rows) < 2:
            continue
        header_text = rows[0].get_text(separator=" ", strip=True)
        if "מחיר" not in header_text and "יציאה" not in header_text and "חדר" not in header_text and "$" not in header_text:
            continue
        header_cells = rows[0].find_all(["th", "td"])
        date_col = None
        price_col = None
        for i, cell in enumerate(header_cells):
            t = cell.get_text(strip=True)
            if "יציאה" in t or "תאריך" in t:
                date_col = i
            if "חדר" in t and "פנימי" in t:
                price_col = i
            if "$" in t or "מחיר" in t:
                if price_col is None:
                    price_col = i
        if date_col is None:
            date_col = 0
        if price_col is None:
            for i, cell in enumerate(header_cells):
                if "$" in cell.get_text():
                    price_col = i
                    break
        for tr in rows[1:]:
            cells = tr.find_all(["td", "th"])
            if len(cells) <= max(date_col or 0, price_col or 0):
                continue
            date_display = cells[date_col].get_text(strip=True) if date_col is not None else ""
            price_raw = cells[price_col].get_text(strip=True) if price_col is not None else ""
            price = None
            m = re.search(r"(\d[\d,.]*)\s*\$|\$\s*(\d[\d,.]*)", price_raw)
            if m:
                raw = (m.group(1) or m.group(2) or "").replace(",", "")
                try:
                    num = float(raw)
                    if 100 < num < 500000:
                        price = str(int(num))
                except ValueError:
                    pass
            date_norm = parse_hebrew_date(date_display) if date_display else None
            if not date_norm and date_display and re.search(r"\d{1,2}\s*[./]\s*\d{1,2}\s*[./]\s*\d{2,4}", date_display):
                dm = re.search(r"(\d{1,2})\s*[./]\s*(\d{1,2})\s*[./]\s*(\d{2,4})", date_display)
                if dm:
                    d, mo, y = int(dm.group(1)), int(dm.group(2)), int(dm.group(3))
                    if y < 100:
                        y = 2000 + y if y < 50 else 1900 + y
                    if 1 <= mo <= 12:
                        date_norm = (y, mo)
            if not date_display and not price:
                continue
            c = {
                "source": base_cruise.get("source", "תרבותו"),
                "title": (base_cruise.get("title") or "")[:300],
                "ship": base_cruise.get("ship"),
                "ship_normalized": base_cruise.get("ship_normalized") or "",
                "date_display": (date_display[:80] if date_display else base_cruise.get("date_display") or ""),
                "date_norm": date_norm or base_cruise.get("date_norm"),
                "price": price or base_cruise.get("price"),
                "url": base_cruise.get("url"),
            }
            cruises.append(c)
    return cruises


def enrich_cruise_from_inner_page(html, cruise):
    """מעדכן קרוז עם מחיר/אונייה/תאריכים מעמוד הפנימי."""
    if not html:
        return
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style"]):
        tag.decompose()
    text = soup.get_text(separator=" ", strip=True)
    if not cruise.get("price"):
        price = extract_price_from_text(text)
        if not price:
            price = extract_price_from_html(soup)
        if price:
            cruise["price"] = price
    if not cruise.get("ship"):
        ship = extract_ship_from_title(text[:4000])
        if ship:
            cruise["ship"] = ship
            cruise["ship_normalized"] = normalize_ship(ship)
    dates = extract_dates_from_text(text)
    if dates:
        cruise["dates_from_page"] = dates


def _is_cruise_link(href):
    """קישור לפוסט קרוז או דף רשימה (לא author/category/tag, לא wp-admin)."""
    if not href or "tarbutu" not in href.lower():
        return False
    bad = [
        "/author/", "/category/", "/tag/", "/feed/", "wp-content", "?replytocom", "/#",
        "wp-admin", "post-php", "action=edit", "actionedit",
    ]
    if any(b in href for b in bad):
        return False
    # קישור שבור שמכיל דומיין כפול (למשל ...tarbutu.co.il/https-tarbutu-co-il/...)
    if "tarbutu.co.il/" in href:
        after = href.split("tarbutu.co.il/", 1)[-1]
        if after.startswith("http") or "wp-admin" in after or "post-php" in after:
            return False
    return True


def _normalize_url_for_dedup(url):
    """נרמול URL להשוואה (ללא סלאש בסוף)."""
    if not url:
        return ""
    u = url.strip().rstrip("/")
    try:
        parsed = urlparse(u)
        netloc = parsed.netloc.lower()
        if netloc.startswith("www."):
            netloc = netloc[4:]
        path = (parsed.path or "/").rstrip("/") or "/"
        return (parsed.scheme or "https") + "://" + netloc + path
    except Exception:
        return u.rstrip("/")


def build_destination_url(name):
    """בונה כתובת דף יעד מתרבותו משם היעד (ריווח → מקף, קידוד URL)."""
    if not name or not isinstance(name, str):
        return ""
    slug = name.replace(" ", "-").strip()
    return (TARBUTU_BASE.rstrip("/") + "/" + quote(slug, safe="") + "/").replace("%2F", "/")


def count_date_blocks(html):
    """מחזיר כמה מופעי תאריך (X ימים/לילות) – לזיהוי דף רשימה."""
    if not html:
        return 0
    date_positions = []
    for needle in ["ימים", "לילות"]:
        idx = 0
        while True:
            idx = html.find(needle, idx)
            if idx < 0:
                break
            chunk = html[max(0, idx - 60):idx + 50]
            try:
                chunk_text = BeautifulSoup(chunk, "html.parser").get_text(separator=" ", strip=True)
            except Exception:
                chunk_text = ""
            if DATE_LINE_PATTERN.search(chunk_text):
                date_positions.append(max(0, idx - 60))
            idx += 1
    date_positions.sort()
    merged = []
    for p in date_positions:
        if not merged or p - merged[-1] > 100:
            merged.append(p)
    return len(merged)


def extract_all_tarbutu_links(html, base_url):
    """מחלץ מכל הדף את כל הקישורים לתרבותו. מחזיר set של כתובות מנורמלות."""
    out = set()
    if not html:
        return out
    soup = BeautifulSoup(html, "html.parser")
    for a in soup.find_all("a", href=True):
        href = a.get("href", "").strip()
        if not _is_cruise_link(href):
            continue
        if not href.startswith("http"):
            href = urljoin(base_url, href)
        out.add(_normalize_url_for_dedup(href))
    return out


def extract_tarbutu_category_links(html, base_url):
    """מזהה דפי קטגוריה של קרוזים מתוך תפריט/ניווט (nav, menu, dropdown).
    מחזיר set של כתובות – קישורים שמופיעים בתוך אלמנטי ניווט."""
    out = set()
    if not html:
        return out
    soup = BeautifulSoup(html, "html.parser")
    # אלמנטים שבדרך כלל מכילים תפריט קטגוריות
    menu_roots = []
    menu_roots.extend(soup.find_all("nav"))
    menu_roots.extend(soup.find_all(attrs={"role": "navigation"}))
    for tag in soup.find_all(attrs={"class": re.compile(r"menu|nav|dropdown|sub-menu|categories|sidebar", re.I)}):
        menu_roots.append(tag)
    for tag in soup.find_all(attrs={"id": re.compile(r"menu|nav|categories", re.I)}):
        menu_roots.append(tag)
    seen = set()
    for root in menu_roots:
        for a in root.find_all("a", href=True):
            href = a.get("href", "").strip()
            if not _is_cruise_link(href):
                continue
            if not href.startswith("http"):
                href = urljoin(base_url, href)
            n = _normalize_url_for_dedup(href)
            if n and n not in seen:
                seen.add(n)
                out.add(n)
    return out


def extract_tarbutu_destination_links(html, base_url):
    """מחלץ את רשימת היעדים הרשמית – קישורים שמובילים לדף יעד (כל לחיצה = דף עם רשימת תאריכי הפלגות).
    מחזיר רשימה של (url_normalized, title) – רק קישורים עם טקסט קצר (שם יעד, לא כותרת קרוז)."""
    out = []
    if not html:
        return out
    soup = BeautifulSoup(html, "html.parser")
    menu_roots = []
    menu_roots.extend(soup.find_all("nav"))
    menu_roots.extend(soup.find_all(attrs={"role": "navigation"}))
    for tag in soup.find_all(attrs={"class": re.compile(r"menu|nav|dropdown|sub-menu|categories", re.I)}):
        menu_roots.append(tag)
    for tag in soup.find_all(attrs={"id": re.compile(r"menu|nav", re.I)}):
        menu_roots.append(tag)
    seen_urls = set()
    for root in menu_roots:
        for a in root.find_all("a", href=True):
            href = a.get("href", "").strip()
            if not _is_cruise_link(href):
                continue
            if not href.startswith("http"):
                href = urljoin(base_url, href)
            n = _normalize_url_for_dedup(href)
            if not n or n in seen_urls:
                continue
            title = a.get_text(strip=True)
            # רק קישורים שנראים כמו שם יעד (קצר), לא כותרת קרוז ארוכה
            if 2 <= len(title) <= 90 and "ימים" not in title and "לילות" not in title:
                seen_urls.add(n)
                out.append((n, title or n.split("/")[-2] or "יעד"))
    return out


def extract_destination_links_from_cruises_page(html, base_url):
    """מחלץ קישורי יעדים ישירות מתוכן דף הקרוזים הראשי – כל כותרת (h2/h3) ואחריה הקישור התקני הראשון.
    כך מקבלים את כל היעדים כמו שהם באתר גם אם התפריט לא נטען."""
    out = []
    if not html:
        return out
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style"]):
        tag.decompose()
    # מצא כל כותרות h2/h3 בתוכן הראשי
    main = soup.find("main") or soup.find(attrs={"class": re.compile(r"content|main|entry", re.I)}) or soup.body
    if not main:
        main = soup
    seen = set()
    headings = main.find_all(["h2", "h3"])
    for i, heading in enumerate(headings):
        title = heading.get_text(strip=True)
        if not title or len(title) < 3:
            continue
        a_in_heading = heading.find("a", href=True)
        if a_in_heading:
            href = a_in_heading.get("href", "").strip()
            if not href.startswith("http"):
                href = urljoin(base_url, href)
            if _is_cruise_link(href):
                n = _normalize_url_for_dedup(href)
                if n and n not in seen:
                    seen.add(n)
                    out.append((n, title[:80]))
                    continue
        next_heading = headings[i + 1] if i + 1 < len(headings) else None
        for elem in heading.find_next_siblings():
            if elem == next_heading or getattr(elem, "name", None) in ("h2", "h3"):
                break
            if not getattr(elem, "find_all", None):
                continue
            for a in elem.find_all("a", href=True):
                href = a.get("href", "").strip()
                if not _is_cruise_link(href):
                    continue
                if not href.startswith("http"):
                    href = urljoin(base_url, href)
                n = _normalize_url_for_dedup(href)
                if not n or n in seen:
                    continue
                seen.add(n)
                out.append((n, title[:80] if len(title) <= 80 else title[:77] + "..."))
                break
            else:
                continue
            break
    return out


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
    merged = []
    for p in date_positions:
        if not merged or p - merged[-1] > 100:
            merged.append(p)
    date_positions = merged

    # כרטיסים: התאריך יכול להיות מעל או מתחת לקישור – לוקחים חלון רחב כדי לתפוס את הקישור
    for i, pos in enumerate(date_positions):
        next_pos = date_positions[i + 1] if i + 1 < len(date_positions) else pos + 3000
        start = max(0, pos - 700)
        end = min(len(html), min(next_pos, pos + 2200) + 400)
        fragment = html[start:end]
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
            if not _is_cruise_link(href):
                continue
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
            if not _is_cruise_link(href):
                continue
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
    """טבלת Markdown – כולל רשימה מלאה לפי יעד."""
    lines = [
        "# רשימת כל הקרוזים – לפי יעד",
        "",
        f"*עודכן: {datetime.now().strftime('%Y-%m-%d %H:%M')}*",
        "",
        "לחיצה על כל יעד באתר מביאה לדף היעד; כאן מוצגת רשימת כל ההפלגות (תאריכים) שנמצאו בכל יעד.",
        "",
    ]
    # קיבוץ לפי יעד
    by_dest = {}
    for c in tarbutu_cruises:
        dest = c.get("destination_title") or "אחר"
        if dest not in by_dest:
            by_dest[dest] = []
        by_dest[dest].append(c)
    for dest_title in sorted(by_dest.keys(), key=lambda x: (x == "אחר", x)):
        cruises = by_dest[dest_title]
        lines.append(f"## {dest_title}")
        lines.append("")
        lines.append("| # | כותרת | אונייה | תאריך | מחיר |")
        lines.append("|---|--------|--------|--------|------|")
        for i, c in enumerate(cruises, 1):
            title = (c.get("title") or "")[:50] + ("…" if len(c.get("title") or "") > 50 else "")
            ship = c.get("ship") or "—"
            date = c.get("date_display") or "—"
            price = c.get("price") or "—"
            lines.append(f"| {i} | {title} | {ship} | {date} | {price} |")
        lines.append("")
    lines.extend([
        "---",
        "",
        "## השוואת מחירים – תרבותו vs מסעות (התאמות)",
        "",
        "| אונייה | תאריך | מחיר תרבותו (₪) | מחיר מסעות (₪) | הפרש |",
        "|--------|--------|------------------|----------------|------|",
    ])
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

    # שלב 1: טעינת דף הקרוזים הראשי ואיסוף רשימת היעדים הרשמית (לחיצה על כל יעד = דף עם תאריכי הפלגות)
    print("סורק תרבותו – דף קרוזים (מחפש רשימת יעדים)...")
    destination_list = []
    html_t, err_t = fetch_page_playwright(TARBUTU_CRUISES_URL)
    if err_t:
        print(f"  שגיאה: {err_t}")
        for extra_url, extra_title in TARBUTU_EXTRA_LIST_URLS:
            destination_list.append((_normalize_url_for_dedup(extra_url), extra_title))
        for name in ALL_CRUISE_DESTINATION_NAMES:
            url = build_destination_url(name)
            n = _normalize_url_for_dedup(url)
            if n and not any(n == u for u, _ in destination_list):
                destination_list.append((n, name))
    else:
        # מקור 1: חילוץ ישיר מתוכן דף הקרוזים – כותרות h2/h3 והקישור התקני הראשון אחריהן (כמו באתר)
        destination_list = extract_destination_links_from_cruises_page(html_t, TARBUTU_CRUISES_URL)
        # מקור 2: קישורים מהתפריט
        menu_links = extract_tarbutu_destination_links(html_t, TARBUTU_CRUISES_URL)
        dest_urls_so_far = {u for u, _ in destination_list}
        for n, title in menu_links:
            if n and n not in dest_urls_so_far:
                dest_urls_so_far.add(n)
                destination_list.append((n, title))
        for extra_url, extra_title in TARBUTU_EXTRA_LIST_URLS:
            n = _normalize_url_for_dedup(extra_url)
            if n and n not in dest_urls_so_far:
                dest_urls_so_far.add(n)
                destination_list.append((n, extra_title))
        # מקור 3: רשימת שמות היעדים – בונים כתובת לכל אחד אם עדיין חסר
        for name in ALL_CRUISE_DESTINATION_NAMES:
            url = build_destination_url(name)
            n = _normalize_url_for_dedup(url)
            if n and n not in dest_urls_so_far:
                dest_urls_so_far.add(n)
                destination_list.append((n, name))
        print(f"  נמצאו {len(destination_list)} יעדים (מתוכן הדף + תפריט + רשימה).")

    # שלב 1b: חילוץ הפלגות ישירות מדף הקרוזים הראשי (למקרה שחלק מופיעים רק שם)
    if html_t:
        from_main = parse_tarbutu_cruises(html_t, TARBUTU_CRUISES_URL)
        seen_main = set()
        for c in from_main:
            c["destination_url"] = TARBUTU_CRUISES_URL
            c["destination_title"] = "קרוזים – דף ראשי"
            n = _normalize_url_for_dedup(c.get("url"))
            if n and n not in seen_main:
                seen_main.add(n)
                tarbutu_cruises.append(c)
        if from_main:
            print(f"  מדף הקרוזים הראשי: {len(from_main)} הפלגות.")

    # שלב 2: כניסה לכל דף יעד וחילוץ רשימת תאריכי ההפלגות מתוך כל יעד
    if destination_list:
        print(f"נכנס לכל דף יעד ומוציא את רשימת ההפלגות ({len(destination_list)} יעדים)...")
        seen_cruise_urls = {_normalize_url_for_dedup(c.get("url")) for c in tarbutu_cruises}
        for dest_url, dest_title in destination_list:
            html_dest, err = fetch_page_playwright(dest_url, timeout=15000)
            if err:
                continue
            cruises_from_dest = parse_tarbutu_cruises(html_dest, dest_url)
            for c in cruises_from_dest:
                c["destination_url"] = dest_url
                c["destination_title"] = dest_title
                n = _normalize_url_for_dedup(c.get("url"))
                if n and n not in seen_cruise_urls:
                    seen_cruise_urls.add(n)
                    tarbutu_cruises.append(c)
            if cruises_from_dest:
                print(f"  יעד \"{dest_title}\": {len(cruises_from_dest)} הפלגות (סה\"כ {len(tarbutu_cruises)}).")
            else:
                print(f"  יעד \"{dest_title}\": אין הפלגות (ייתכן 404 או דף ריק).")
            time.sleep(0.6)
        # סיכום סריקה – כמה יעדים סורקנו וכמה הפלגות לכל יעד
        by_dest = {}
        for c in tarbutu_cruises:
            d = c.get("destination_title") or "אחר"
            by_dest[d] = by_dest.get(d, 0) + 1
        print(f"סה\"כ {len(tarbutu_cruises)} קרוזים מכל דפי היעדים.")
        print("  סיכום לפי יעד:", ", ".join(f"{k}: {v}" for k, v in sorted(by_dest.items(), key=lambda x: -x[1])))

    # דף שייט נהרות – גם ממנו רשימת יעדים ואז סריקת כל יעד
    print("סורק תרבותו – שייט נהרות (רשימת יעדים)...")
    river_destinations = []
    html_river, err_r = fetch_page_playwright(TARBUTU_RIVER_CRUISES_URL)
    if err_r:
        print(f"  שגיאה: {err_r}")
    else:
        river_destinations = extract_tarbutu_destination_links(html_river, TARBUTU_RIVER_CRUISES_URL)
        seen_cruise_urls = {_normalize_url_for_dedup(c.get("url")) for c in tarbutu_cruises}
        for dest_url, dest_title in river_destinations:
            html_dest, err = fetch_page_playwright(dest_url, timeout=15000)
            if err:
                continue
            cruises_from_dest = parse_tarbutu_cruises(html_dest, dest_url)
            for c in cruises_from_dest:
                c["destination_url"] = dest_url
                c["destination_title"] = dest_title
                n = _normalize_url_for_dedup(c.get("url"))
                if n and n not in seen_cruise_urls:
                    seen_cruise_urls.add(n)
                    tarbutu_cruises.append(c)
            if cruises_from_dest:
                print(f"  יעד \"{dest_title}\": {len(cruises_from_dest)} הפלגות.")
            time.sleep(0.6)
        print(f"סה\"כ אחרי שייט נהרות: {len(tarbutu_cruises)} קרוזים.")

    # גיבוי: דפים נוספים מקישורים (אם פספסנו יעדים)
    seed_normalized = {_normalize_url_for_dedup(TARBUTU_CRUISES_URL), _normalize_url_for_dedup(TARBUTU_RIVER_CRUISES_URL)}
    seed_normalized.update(_normalize_url_for_dedup(u) for u, _ in TARBUTU_EXTRA_LIST_URLS)
    dest_urls_seen = {u for u, _ in destination_list}
    dest_urls_seen.update(_normalize_url_for_dedup(u) for u, _ in river_destinations)
    category_links = set()
    all_links = set()
    if html_t:
        category_links |= extract_tarbutu_category_links(html_t, TARBUTU_CRUISES_URL)
        all_links |= extract_all_tarbutu_links(html_t, TARBUTU_CRUISES_URL)
    if html_river:
        category_links |= extract_tarbutu_category_links(html_river, TARBUTU_RIVER_CRUISES_URL)
        all_links |= extract_all_tarbutu_links(html_river, TARBUTU_RIVER_CRUISES_URL)
    cruise_urls_normalized = {_normalize_url_for_dedup(c.get("url")) for c in tarbutu_cruises}
    combined = (category_links | all_links) - seed_normalized - cruise_urls_normalized
    list_candidates = [u for u in combined if u not in dest_urls_seen][:MAX_LIST_PAGE_CANDIDATES]
    if list_candidates:
        print(f"בודק {len(list_candidates)} דפים נוספים...")
        for url in list_candidates:
            html_list, err = fetch_page_playwright(url, timeout=15000)
            if err:
                continue
            extra = parse_tarbutu_cruises(html_list, url)
            before = len(tarbutu_cruises)
            seen = {_normalize_url_for_dedup(c.get("url")) for c in tarbutu_cruises}
            for c in extra:
                c["destination_url"] = url
                c["destination_title"] = "יעד נוסף"
                n = _normalize_url_for_dedup(c.get("url"))
                if n and n not in seen:
                    seen.add(n)
                    tarbutu_cruises.append(c)
            if len(tarbutu_cruises) > before:
                print(f"  נוספו {len(tarbutu_cruises) - before} קרוזים.")
            time.sleep(0.5)

    print("סורק מסעות...")
    html_m, err_m = fetch_page_playwright(MASSAOT_URL, timeout=35000)
    if err_m:
        print(f"  שגיאה מסעות: {err_m}")
        massaot_cruises = []
    else:
        massaot_cruises = parse_massaot_cruises(html_m, MASSAOT_URL)
        print(f"  נמצאו {len(massaot_cruises)} קרוזים.")

    # סריקה בתוך עמודים – כניסה לכל קישור קרוז, חילוץ טבלת מחירים ותאריכים (כל שורה = קרוז)
    MAX_INNER_PAGES = 60
    if sync_playwright and stealth_sync and tarbutu_cruises:
        print("נכנסים לעמודי הקרוזים של תרבותו (טבלאות מחירים ותאריכים – כל שורה = הפלגה)...")
        tarbutu_expanded = []
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                viewport={"width": 1920, "height": 1080},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
                locale="he-IL",
            )
            page = context.new_page()
            stealth_sync(page)
            for i, c in enumerate(tarbutu_cruises):
                if i >= MAX_INNER_PAGES:
                    tarbutu_expanded.append(c)
                    continue
                url = c.get("url")
                if not url or "action=edit" in url:
                    tarbutu_expanded.append(c)
                    continue
                html_inner, err = _fetch_with_page(page, url, timeout=18000)
                if err:
                    tarbutu_expanded.append(c)
                    continue
                rows = parse_price_table_from_inner_page(html_inner, c)
                if len(rows) > 0:
                    tarbutu_expanded.extend(rows)
                else:
                    enrich_cruise_from_inner_page(html_inner, c)
                    tarbutu_expanded.append(c)
                if (i + 1) % 10 == 0:
                    print(f"  סורקנו {i + 1} עמודים, סה\"כ {len(tarbutu_expanded)} הפלגות...")
                time.sleep(0.7)
            browser.close()
        tarbutu_cruises = tarbutu_expanded
        print(f"  סיום סריקה פנימית. סה\"כ {len(tarbutu_cruises)} קרוזים (הפלגות).")

    if sync_playwright and stealth_sync and massaot_cruises:
        print("נכנסים לעמודי הקרוזים של מסעות...")
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                viewport={"width": 1920, "height": 1080},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
                locale="he-IL",
            )
            page = context.new_page()
            stealth_sync(page)
            for i, c in enumerate(massaot_cruises[:MAX_INNER_PAGES]):
                url = c.get("url")
                if not url:
                    continue
                html_inner, err = _fetch_with_page(page, url, timeout=18000)
                if err:
                    continue
                enrich_cruise_from_inner_page(html_inner, c)
                time.sleep(0.7)
            browser.close()

    matches = match_cruises(tarbutu_cruises, massaot_cruises)
    print(f"התאמות (אותה אונייה + תאריך): {len(matches)}")

    # קיבוץ לפי יעד לפלט
    by_destination = {}
    for c in tarbutu_cruises:
        dest = c.get("destination_title") or "אחר"
        if dest not in by_destination:
            by_destination[dest] = []
        by_destination[dest].append(c)

    data = {
        "generated_at": datetime.now().astimezone().isoformat(),
        "tarbutu_url": TARBUTU_CRUISES_URL,
        "massaot_url": MASSAOT_URL,
        "tarbutu_cruises": tarbutu_cruises,
        "by_destination": by_destination,
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
