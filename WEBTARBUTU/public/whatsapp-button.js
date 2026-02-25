/**
 * כפתור "צור קשר בווואטסאפ" בלבד – בלי בוט, בלי חיבור WhatsApp Web.
 * לוחצים → נפתח וואטסאפ לכתיבה למספר המשרד.
 *
 * שימוש באתר:
 *   <script>window.WEBTARBUTU_WHATSAPP_NUMBER = '972501234567';</script>
 *   <script src="https://yoursite.com/whatsapp-button.js" async></script>
 */
(function () {
  'use strict';
  var num = (window.WEBTARBUTU_WHATSAPP_NUMBER || '').toString().replace(/\D/g, '');
  if (!num || num.length < 9) return;

  var link = 'https://wa.me/' + num;
  var wrap = document.createElement('div');
  wrap.id = 'webtarbutu-wa-only';
  wrap.innerHTML =
    '<a href="' + link + '" target="_blank" rel="noopener" style="' +
    'position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;' +
    'background:#25D366;color:#fff;display:flex;align-items:center;justify-content:center;' +
    'box-shadow:0 4px 12px rgba(0,0,0,0.2);text-decoration:none;z-index:999999;font-size:28px;' +
    '" title="צור קשר בווואטסאפ" aria-label="WhatsApp">📱</a>';
  document.body.appendChild(wrap);
})();
