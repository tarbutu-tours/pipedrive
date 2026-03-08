# competitor_research/app_cruise_compare.py
# אפליקציה עם כפתור אחד: לחיצה סורקת תרבותו + מסעות ומציגה טבלת השוואת מחירים.

from pathlib import Path

from flask import Flask, send_file, redirect, url_for, request, render_template_string

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_HTML = BASE_DIR / "cruise_price_comparison.html"

app = Flask(__name__)


INDEX_HTML = """<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8">
  <title>השוואת מחירי קרוזים</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f0f4f8; direction: rtl; }
    .card { background: white; padding: 48px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); text-align: center; max-width: 420px; }
    h1 { margin: 0 0 24px; color: #1a1a2e; font-size: 1.5rem; }
    p { color: #555; margin: 0 0 28px; line-height: 1.5; }
    .btn { display: inline-block; background: #2563eb; color: white; padding: 16px 32px; font-size: 1.1rem; border: none; border-radius: 8px; cursor: pointer; text-decoration: none; transition: background .2s; }
    .btn:hover { background: #1d4ed8; }
    .btn:disabled, .btn.loading { opacity: 0.8; cursor: wait; pointer-events: none; }
    .spinner { display: none; margin-top: 16px; color: #666; }
    .spinner.visible { display: block; }
    .error { color: #b91c1c; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>השוואת מחירי קרוזים</h1>
    <p>תרבותו מול מסעות – הפלגות עם אותה אונייה ואותו תאריך.</p>
    <button type="button" class="btn" id="goBtn">סרוק והשווה מחירים</button>
    <p class="spinner" id="msg">מסתובב... הסריקה יכולה לקחת דקה־שתיים. אל תסגור את הדף.</p>
    <p class="error" id="err"></p>
  </div>
  <script>
    var goBtn = document.getElementById('goBtn');
    var msg = document.getElementById('msg');
    var err = document.getElementById('err');
    goBtn.addEventListener('click', function() {
      goBtn.classList.add('loading');
      msg.classList.add('visible');
      err.textContent = '';
      fetch('/run').then(function(r) {
        if (r.redirected) window.location = r.url;
        else return r.text();
      }).then(function(html) {
        if (html) { document.open(); document.write(html); document.close(); }
      }).catch(function(e) {
        err.textContent = 'שגיאה: ' + e.message;
        goBtn.classList.remove('loading');
        msg.classList.remove('visible');
      });
    });
  </script>
</body>
</html>"""


@app.route("/")
def index():
    return render_template_string(INDEX_HTML)


@app.route("/run")
def run():
    try:
        from scraper_cruise_compare import main
        main()
        return redirect(url_for("results"))
    except Exception as e:
        return f"""
        <html dir="rtl" lang="he"><head><meta charset="utf-8"><title>שגיאה</title></head>
        <body style="font-family: Arial; margin: 20px; direction: rtl;">
        <h1>אירעה שגיאה</h1>
        <p>{str(e)}</p>
        <p><a href="/">חזרה לדף הבית</a></p>
        </body></html>
        """, 500


@app.route("/results")
def results():
    if not OUTPUT_HTML.exists():
        return redirect(url_for("index"))
    return send_file(OUTPUT_HTML, mimetype="text/html; charset=utf-8")


if __name__ == "__main__":
    import webbrowser
    from threading import Timer
    def open_browser():
        webbrowser.open("http://127.0.0.1:5050/")
    Timer(1.2, open_browser).start()
    app.run(host="127.0.0.1", port=5050, debug=False, use_reloader=False)
