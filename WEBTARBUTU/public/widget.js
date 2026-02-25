(function () {
  'use strict';
  var API_BASE = window.WEBTARBUTU_API || (window.location.origin + (window.WEBTARBUTU_PATH || ''));
  var AGENCY_NAME = window.WEBTARBUTU_AGENCY || 'תרבותו';
  // מספר לווואטסאפ עם קידומת מדינה בלי 0 (לדוגמה 972501234567). אם ריק – כפתור וואטסאפ לא יופיע.
  var WHATSAPP_NUMBER = (window.WEBTARBUTU_WHATSAPP_NUMBER || '').toString().replace(/\D/g, '');
  // true = רק כפתור "צור קשר בווואטסאפ" (לינק למספר המשרד, בלי בוט, בלי חיבור Web)
  var WHATSAPP_ONLY = !!window.WEBTARBUTU_WHATSAPP_ONLY;

  function getUtm() {
    var params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get('utm_source') || undefined,
      utm_medium: params.get('utm_medium') || undefined,
      utm_campaign: params.get('utm_campaign') || undefined,
    };
  }

  function createBubble() {
    var wrap = document.createElement('div');
    wrap.id = 'webtarbutu-root';
    var waBottom = WHATSAPP_ONLY ? 20 : (WHATSAPP_NUMBER ? 90 : 20);
    var waBtn = WHATSAPP_NUMBER
      ? '<a id="webtarbutu-wa-btn" href="https://wa.me/' + WHATSAPP_NUMBER + '" target="_blank" rel="noopener" style="' +
        'position:fixed;bottom:' + waBottom + 'px;right:20px;width:56px;height:56px;border-radius:50%;' +
        'background:#25D366;color:#fff;display:flex;align-items:center;justify-content:center;' +
        'box-shadow:0 4px 12px rgba(0,0,0,0.15);text-decoration:none;z-index:999997;font-size:28px;" ' +
        'title="צור קשר בווואטסאפ" aria-label="WhatsApp">📱</a>'
      : '';
    var botHtml = WHATSAPP_ONLY ? '' : [
      '<div id="webtarbutu-bubble" style="',
      'position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;',
      'background:#128C7E;color:#fff;border:none;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.15);',
      'display:flex;align-items:center;justify-content:center;font-size:24px;z-index:999998;',
      '" title="צ\'אט עם הבוט באתר" aria-label="Open chat">💬</div>',
      '<div id="webtarbutu-panel" dir="rtl" style="',
      'display:none;position:fixed;bottom:' + (WHATSAPP_NUMBER && !WHATSAPP_ONLY ? 156 : 90) + 'px;right:20px;width:380px;max-width:calc(100vw - 40px);height:480px;max-height:70vh;',
      'background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.2);z-index:999999;flex-direction:column;',
      'font-family:system-ui,-apple-system,sans-serif;color:#1a1a1a;text-align:right;',
      '">',
      '<div style="padding:12px 16px;background:#25D366;color:#fff;border-radius:12px 12px 0 0;font-weight:600;">' + AGENCY_NAME + '</div>',
      '<div id="webtarbutu-messages" style="flex:1;overflow-y:auto;padding:12px;font-size:14px;line-height:1.5;"></div>',
      '<div style="padding:12px;border-top:1px solid #eee;">',
      '<input id="webtarbutu-input" type="text" placeholder="הקלד הודעה..." style="',
      'width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;',
      '" />',
      '<button id="webtarbutu-send" style="',
      'margin-top:8px;width:100%;padding:10px;background:#25D366;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;',
      '">שלח</button>',
      '</div>',
      '</div>',
    ].join('');
    wrap.innerHTML = waBtn + botHtml;
    if (!WHATSAPP_ONLY && wrap.querySelector('#webtarbutu-panel')) wrap.querySelector('#webtarbutu-panel').style.display = 'none';
    document.body.appendChild(wrap);
    return wrap;
  }


  function appendMessage(container, role, text) {
    var div = document.createElement('div');
    div.style.marginBottom = '8px';
    div.style.textAlign = 'right';
    div.style.background = role === 'user' ? '#e3f2fd' : '#f5f5f5';
    div.style.padding = '8px 12px';
    div.style.borderRadius = '8px';
    div.style.display = 'inline-block';
    div.style.maxWidth = '85%';
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function sendMessage(sessionId, message, utm, onReply) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', API_BASE + '/api/chat');
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var d = JSON.parse(xhr.responseText);
          if (d.reply) onReply(d.reply);
        } catch (e) { onReply('מצטערים, משהו השתבש.'); }
      } else { onReply('מצטערים, נסה שוב או התקשר 03-5260090.'); }
    };
    xhr.onerror = function () { onReply('שגיאת רשת. נא להתקשר 03-5260090.'); };
    xhr.send(JSON.stringify({ message: message, sessionId: sessionId, utm: utm }));
  }

  function loadWelcome(sessionId, utm, onReply) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', API_BASE + '/api/chat/welcome');
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var d = JSON.parse(xhr.responseText);
          if (d.reply != null) onReply(d.reply, d.showChoiceButtons || false);
        } catch (e) {}
      }
    };
    xhr.send(JSON.stringify({ sessionId: sessionId, utm: utm }));
  }

  function appendChoiceButtons(container, sessionId, utm, messagesEl, sendMessageFn) {
    var wrap = document.createElement('div');
    wrap.id = 'webtarbutu-choice-buttons';
    wrap.style.marginTop = '12px';
    wrap.style.marginBottom = '12px';
    wrap.style.textAlign = 'right';
    var btn1 = document.createElement('button');
    btn1.type = 'button';
    btn1.textContent = 'מכירות (טיולים והזמנות)';
    btn1.style.cssText = 'display:block;width:100%;margin-bottom:10px;padding:14px 16px;background:#25D366;color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:15px;font-weight:600;';
    var btn2 = document.createElement('button');
    btn2.type = 'button';
    btn2.textContent = 'שירות לקוחות (הזמנות קיימות / תמיכה)';
    btn2.style.cssText = 'display:block;width:100%;padding:14px 16px;background:#128C7E;color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:15px;font-weight:600;';
    function sendChoice(num) {
      wrap.remove();
      appendMessage(messagesEl, 'user', num === 1 ? 'מכירות (טיולים והזמנות)' : 'שירות לקוחות');
      sendMessageFn(sessionId, String(num), utm, function (reply) {
        appendMessage(messagesEl, 'assistant', reply);
      });
    }
    btn1.addEventListener('click', function () { sendChoice(1); });
    btn2.addEventListener('click', function () { sendChoice(2); });
    wrap.appendChild(btn1);
    wrap.appendChild(btn2);
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
  }

  function init() {
    var wrap = document.getElementById('webtarbutu-root') || createBubble();
    if (WHATSAPP_ONLY) return;
    var bubble = document.getElementById('webtarbutu-bubble');
    var panel = document.getElementById('webtarbutu-panel');
    var messagesEl = document.getElementById('webtarbutu-messages');
    var input = document.getElementById('webtarbutu-input');
    var sendBtn = document.getElementById('webtarbutu-send');
    if (!bubble || !panel) return;

    var sessionId = sessionStorage.getItem('webtarbutu_session') || ('web-' + Date.now() + '-' + Math.random().toString(36).slice(2));
    sessionStorage.setItem('webtarbutu_session', sessionId);
    var utm = getUtm();

    panel.style.display = 'flex';

    bubble.addEventListener('click', function () {
      var open = panel.style.display === 'flex';
      panel.style.display = open ? 'none' : 'flex';
      if (!open && messagesEl.children.length === 0) {
        loadWelcome(sessionId, utm, function (reply, showChoiceButtons) {
          appendMessage(messagesEl, 'assistant', reply);
          if (showChoiceButtons) {
            appendChoiceButtons(messagesEl, sessionId, utm, messagesEl, sendMessage);
          }
        });
      }
    });

    function doSend() {
      var text = (input.value || '').trim();
      if (!text) return;
      input.value = '';
      appendMessage(messagesEl, 'user', text);
      sendMessage(sessionId, text, utm, function (reply) {
        appendMessage(messagesEl, 'assistant', reply);
      });
    }

    sendBtn.addEventListener('click', doSend);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doSend();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
