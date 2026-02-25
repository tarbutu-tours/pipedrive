# competitor_research/scraper.py
# Competitor Intelligence Agent - Israeli Organized Cruise market (2 companies)
# Uses Playwright with stealth. Extracts route, duration, prices, guaranteed departure, discounts, inclusions.
# Sends results by email after each run; can be scheduled daily at 8:00.

import json
import re
import smtplib
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from pathlib import Path
from datetime import datetime

# Stealth + Playwright
try:
    from playwright.sync_api import sync_playwright
    from playwright_stealth import stealth_sync
except ImportError:
    sync_playwright = None
    stealth_sync = None

from bs4 import BeautifulSoup

BASE_DIR = Path(__file__).resolve().parent
TARGETS_PATH = BASE_DIR / "targets.json"
RESULTS_PATH = BASE_DIR / "results.json"
COMPARISON_PATH = BASE_DIR / "cruise_comparison.md"
CONFIG_PATH = BASE_DIR / "config.json"

# Companies to scrape (incl. מסעות)
COMPANY_KEYS = ["Mano Maritime", "Cruise Tour (בשביל הזהב)", "Massaot"]

# Hebrew/English patterns for extraction
PATTERNS = {
    "guaranteed_departure": [
        r"טיול\s*מובטח",
        r"מובטח\s*יציאה",
        r"guaranteed\s*departure",
        r"departure\s*guaranteed",
    ],
    "early_bird": [
        r"הנחת\s*הרשמה\s*מוקדמת",
        r"early\s*bird",
        r"הרשמה\s*מוקדמת",
        r"הנחה\s*להזמנה\s*מוקדמת",
    ],
    "last_minute": [
        r"רגע\s*אחרון",
        r"last\s*minute",
        r"דחוף",
    ],
    "tips": [
        r"טיפים\s*כלולים",
        r"tips\s*included",
        r"מענק\s*טיפים",
    ],
    "shore_excursions": [
        r"סיורי\s*חוף",
        r"shore\s*excursions",
        r"סיורים\s*בנמל",
    ],
    "israeli_guide": [
        r"מדריך\s*דובר\s*עברית",
        r"מדריך\s*ישראלי",
        r"Hebrew\s*guide",
        r"מדריך\s*מיומן\s*דובר\s*עברית",
    ],
    "kosher": [
        r"כשר",
        r"kosher",
        r"אוכל\s*כשר",
        r"שומרי\s*כשרות",
    ],
    "price_double": [
        r"חדר\s*זוגי[^\d]*(\d[\d,.]*)\s*[₪\$€]",
        r"double\s*room[^\d]*(\d[\d,.]*)\s*[₪\$€]",
        r"מחיר\s*לזוג[^\d]*(\d[\d,.]*)",
        r"(\d[\d,.]*)\s*[₪\$€]\s*לאדם\s*בחדר\s*זוגי",
    ],
    "price_balcony": [
        r"מרפסת[^\d]*(\d[\d,.]*)\s*[₪\$€]",
        r"balcony[^\d]*(\d[\d,.]*)\s*[₪\$€]",
        r"(\d[\d,.]*)\s*[₪\$€]\s*מרפסת",
    ],
    "duration_days": [
        r"(\d+)\s*ימים",
        r"(\d+)\s*days",
        r"(\d+)\s*לילות",
        r"(\d+)\s*nights",
    ],
}


def load_targets():
    with open(TARGETS_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return [s for s in data["sources"] if s["company"] in COMPANY_KEYS]


def extract_from_text(text: str, company: str) -> dict:
    """Extract structured fields from page text using regex patterns."""
    text_lower = text.replace("\n", " ").replace("\r", " ")
    out = {
        "company": company,
        "route": None,
        "duration_days": None,
        "price_double": None,
        "price_balcony": None,
        "guaranteed_departure": False,
        "discounts": [],
        "inclusions": {
            "tips": False,
            "shore_excursions": False,
            "israeli_guide": False,
            "kosher_food": False,
        },
        "raw_snippets": [],
    }
    for key, patterns in PATTERNS.items():
        if key == "guaranteed_departure":
            for p in patterns:
                if re.search(p, text_lower, re.IGNORECASE):
                    out["guaranteed_departure"] = True
                    out["raw_snippets"].append(f"guaranteed_departure: {p}")
                    break
        elif key == "early_bird" or key == "last_minute":
            for p in patterns:
                if re.search(p, text_lower, re.IGNORECASE):
                    out["discounts"].append(key.replace("_", " "))
                    break
        elif key == "tips":
            for p in patterns:
                if re.search(p, text_lower, re.IGNORECASE):
                    out["inclusions"]["tips"] = True
                    break
        elif key == "shore_excursions":
            for p in patterns:
                if re.search(p, text_lower, re.IGNORECASE):
                    out["inclusions"]["shore_excursions"] = True
                    break
        elif key == "israeli_guide":
            for p in patterns:
                if re.search(p, text_lower, re.IGNORECASE):
                    out["inclusions"]["israeli_guide"] = True
                    break
        elif key == "kosher":
            for p in patterns:
                if re.search(p, text_lower, re.IGNORECASE):
                    out["inclusions"]["kosher_food"] = True
                    break
        elif key == "duration_days":
            for p in patterns:
                m = re.search(p, text_lower, re.IGNORECASE)
                if m:
                    out["duration_days"] = int(m.group(1))
                    break
        elif key == "price_double":
            for p in patterns:
                m = re.search(p, text_lower, re.IGNORECASE)
                if m:
                    out["price_double"] = m.group(1).replace(",", "").strip()
                    break
        elif key == "price_balcony":
            for p in patterns:
                m = re.search(p, text_lower, re.IGNORECASE)
                if m:
                    out["price_balcony"] = m.group(1).replace(",", "").strip()
                    break
    return out


def scrape_with_playwright(url: str, company: str) -> dict:
    """Fetch page with Playwright + stealth and return extracted data + raw text."""
    if not sync_playwright or not stealth_sync:
        return {
            "company": company,
            "url": url,
            "error": "playwright or playwright_stealth not installed",
            "extracted": {},
            "raw_text_preview": "",
        }
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
            page.goto(url, wait_until="networkidle", timeout=25000)
            time.sleep(2)
            content = page.content()
        except Exception as e:
            browser.close()
            return {
                "company": company,
                "url": url,
                "error": str(e),
                "extracted": {},
                "raw_text_preview": "",
            }
        browser.close()
    soup = BeautifulSoup(content, "html.parser")
    for tag in soup(["script", "style"]):
        tag.decompose()
    raw_text = soup.get_text(separator=" ", strip=True)
    extracted = extract_from_text(raw_text, company)
    # Try to get a route from title or h1
    title = soup.find("title")
    if title and title.get_text(strip=True):
        extracted["route"] = title.get_text(strip=True)[:200]
    return {
        "company": company,
        "url": url,
        "error": None,
        "extracted": extracted,
        "raw_text_preview": raw_text[:8000],
    }


def run_scrape():
    targets = load_targets()
    results = []
    for t in targets:
        url = t.get("cruises_list_url") or t.get("url")
        if not url:
            continue
        print(f"Scraping {t['company']}: {url}")
        data = scrape_with_playwright(url, t["company"])
        data["scraped_at"] = datetime.utcnow().isoformat() + "Z"
        results.append(data)
    with open(RESULTS_PATH, "w", encoding="utf-8") as f:
        json.dump({"companies": results, "generated_at": datetime.utcnow().isoformat() + "Z"}, f, ensure_ascii=False, indent=2)
    return results


def build_comparison(results: list) -> str:
    """Generate cruise_comparison.md from results."""
    lines = [
        "# השוואת שייט מאורגן – מנו ספנות vs קרוזתור",
        "",
        "## סיכום לפי חברה",
        "",
    ]
    for r in results:
        if r.get("error"):
            lines.append(f"### {r['company']}")
            lines.append(f"- **שגיאה:** {r['error']}")
            lines.append("")
            continue
        ex = r.get("extracted") or {}
        lines.append(f"### {r['company']}")
        lines.append(f"- **קישור:** {r.get('url', '')}")
        lines.append(f"- **מסלול/כותרת:** {ex.get('route') or '—'}")
        lines.append(f"- **משך (ימים):** {ex.get('duration_days') or '—'}")
        lines.append(f"- **מחיר זוגי:** {ex.get('price_double') or '—'}")
        lines.append(f"- **מחיר מרפסת:** {ex.get('price_balcony') or '—'}")
        lines.append(f"- **טיול מובטח:** {'כן' if ex.get('guaranteed_departure') else 'לא/לא נמצא'}")
        lines.append(f"- **הנחות:** {', '.join(ex.get('discounts') or []) or '—'}")
        inc = ex.get("inclusions") or {}
        lines.append("- **כלול:**")
        lines.append(f"  - טיפים: {'כן' if inc.get('tips') else 'לא/לא נמצא'}")
        lines.append(f"  - סיורי חוף: {'כן' if inc.get('shore_excursions') else 'לא/לא נמצא'}")
        lines.append(f"  - מדריך ישראלי: {'כן' if inc.get('israeli_guide') else 'לא/לא נמצא'}")
        lines.append(f"  - אוכל כשר: {'כן' if inc.get('kosher_food') else 'לא/לא נמצא'}")
        lines.append("")
    lines.append("## הבדלים עיקריים")
    lines.append("")
    valid = [r for r in results if not r.get("error") and r.get("extracted")]
    if len(valid) >= 2:
        a, b = valid[0]["extracted"], valid[1]["extracted"]
        diff = []
        if (a.get("price_double") or b.get("price_double")) and a.get("price_double") != b.get("price_double"):
            diff.append(f"- **מחיר זוגי:** {a.get('company')} {a.get('price_double') or '—'} vs {b.get('company')} {b.get('price_double') or '—'}")
        if (a.get("price_balcony") or b.get("price_balcony")) and a.get("price_balcony") != b.get("price_balcony"):
            diff.append(f"- **מחיר מרפסת:** שונה בין החברות.")
        if a.get("guaranteed_departure") != b.get("guaranteed_departure"):
            diff.append("- **טיול מובטח:** מופיע רק אצל אחת החברות.")
        for key in ["tips", "shore_excursions", "israeli_guide", "kosher_food"]:
            ia, ib = (a.get("inclusions") or {}).get(key), (b.get("inclusions") or {}).get(key)
            if ia != ib:
                diff.append(f"- **{key}:** שונה בין החברות.")
        lines.extend(diff if diff else ["- אין הבדלים ברורים מהנתונים שנאספו (ייתכן שדרוש חילוץ מעמיק יותר)."])
    else:
        lines.append("- אין מספיק נתונים להשוואה (שגיאות גריפה או חילוץ).")
    lines.append("")
    return "\n".join(lines)


def load_email_config():
    """Load email config; return None if missing or invalid."""
    if not CONFIG_PATH.exists():
        return None
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        email_cfg = (data or {}).get("email") or {}
        to_addr = (email_cfg.get("to") or "").strip()
        if not to_addr or to_addr == "YOUR_EMAIL@example.com":
            return None
        return {
            "to": to_addr,
            "smtp_host": email_cfg.get("smtp_host") or "smtp.gmail.com",
            "smtp_port": int(email_cfg.get("smtp_port") or 587),
            "smtp_user": (email_cfg.get("smtp_user") or "").strip(),
            "smtp_password": email_cfg.get("smtp_password") or "",
            "from_name": (email_cfg.get("from_name") or "Competitor Research").strip(),
        }
    except Exception:
        return None


def send_results_email(subject_prefix: str = "Cruise scan"):
    """Send cruise_comparison.md and results.json to the address in config.json."""
    cfg = load_email_config()
    if not cfg:
        print("Email not sent: edit config.json with your email and SMTP (see config.example.json).")
        return False
    msg = MIMEMultipart()
    msg["Subject"] = f"{subject_prefix} – {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    msg["From"] = f"{cfg['from_name']} <{cfg['smtp_user']}>"
    msg["To"] = cfg["to"]
    body = "תוצאות סריקת שייט מאורגן מצורפות.\n\nResults attached: cruise_comparison.md, results.json"
    msg.attach(MIMEText(body, "plain", "utf-8"))
    for path, name in [(COMPARISON_PATH, "cruise_comparison.md"), (RESULTS_PATH, "results.json")]:
        if path.exists():
            with open(path, "rb") as f:
                part = MIMEBase("application", "octet-stream")
                part.set_payload(f.read())
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", "attachment", filename=name)
            msg.attach(part)
    try:
        with smtplib.SMTP(cfg["smtp_host"], cfg["smtp_port"]) as server:
            server.starttls()
            server.login(cfg["smtp_user"], cfg["smtp_password"])
            server.sendmail(cfg["smtp_user"], cfg["to"], msg.as_string())
        print(f"Email sent to {cfg['to']}")
        return True
    except Exception as e:
        print(f"Email failed: {e}")
        return False


if __name__ == "__main__":
    print("Running scraper for 2 companies...")
    results = run_scrape()
    md = build_comparison(results)
    with open(COMPARISON_PATH, "w", encoding="utf-8") as f:
        f.write(md)
    print(f"Saved {RESULTS_PATH} and {COMPARISON_PATH}")
    send_results_email("Cruise scan")
