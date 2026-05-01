// Caro's Ledge — shared app shell behavior
// Adds: sidebar collapse + mobile drawer (existing), UserMenu, AI assistant FAB,
// global Toast, and a mountable Modal helper. Everything is injected on DOMReady
// so individual pages don't need any markup beyond the existing sidebar.

(function(){
  /* ---------- auto-load shell-globals.css if not already linked ---------- */
  (function ensureGlobalsCss(){
    var has = false;
    document.querySelectorAll('link[rel="stylesheet"]').forEach(function(l){
      if ((l.href||'').indexOf('shell-globals.css') !== -1) has = true;
    });
    if (!has) {
      var l = document.createElement('link');
      l.rel = 'stylesheet';
      // resolve relative to this script tag's src so it works regardless of page location
      var thisSrc = (document.currentScript && document.currentScript.src) || '';
      var base = thisSrc.replace(/[^/]*$/,'');
      l.href = base + 'shell-globals.css';
      document.head.appendChild(l);
    }
  })();

  /* ---------- existing: sidebar collapse + mobile drawer ---------- */
  var app = document.getElementById('app'); if (!app) return;
  var btn = document.getElementById('sideToggle');
  var burger = document.getElementById('mobileBurger');
  var scrim = document.getElementById('mobileScrim');
  var stored = localStorage.getItem('cl-side-collapsed');
  if (stored === '1') { app.classList.add('collapsed'); if (btn) btn.textContent = '›'; }
  if (btn) btn.addEventListener('click', function(){
    app.classList.toggle('collapsed');
    var c = app.classList.contains('collapsed');
    btn.textContent = c ? '›' : '‹';
    localStorage.setItem('cl-side-collapsed', c ? '1' : '0');
  });
  if (burger) burger.addEventListener('click', function(){ app.classList.add('mobile-open'); });
  if (scrim)  scrim.addEventListener('click',  function(){ app.classList.remove('mobile-open'); });

  /* ---------- USER MENU ---------- */
  function mountUserMenu(){
    var side = document.querySelector('.side'); if (!side) return;
    if (side.querySelector('.user-block')) return;

    var user = window.CL_USER || { name: 'Caro Mendel', initials: 'CM', role: 'Admin', email: 'caro@carosledge.com' };

    var block = document.createElement('div');
    block.className = 'user-block';
    block.innerHTML = ''
      + '<button class="user-trigger" id="userTrigger" type="button" aria-haspopup="menu" aria-expanded="false">'
      +   '<span class="av">' + user.initials + '</span>'
      +   '<span class="nm-blk"><span class="nm">' + user.name + '</span><span class="role">' + user.role + '</span></span>'
      +   '<span class="ch">⌃</span>'
      + '</button>'
      + '<div class="user-pop" id="userPop" role="menu">'
      +   '<a href="profile.html"><span class="ico">⏯</span>Profile</a>'
      +   (user.role === 'Admin' ? '<a href="admin.html"><span class="ico">⊕</span>Admin panel</a>' : '')
      +   '<a href="settings.html"><span class="ico">⊙</span>Settings</a>'
      +   '<div class="sep"></div>'
      +   '<div class="theme-row"><span class="lab">Theme</span><span class="seg">'
      +     '<button data-theme="light" class="on">Light</button><button data-theme="dark">Dark</button>'
      +   '</span></div>'
      +   '<div class="sep"></div>'
      +   '<button class="signout"><span class="ico">↩</span>Sign out</button>'
      + '</div>';

    var navGroups = side.querySelectorAll('nav .nav-group');
    navGroups.forEach(function(g){
      var links = g.querySelectorAll('a');
      var hrefs = Array.prototype.map.call(links, function(a){ return (a.getAttribute('href')||'').toLowerCase(); });
      var bottomItems = ['admin.html','profile.html','settings.html'];
      var matches = hrefs.filter(function(h){ return bottomItems.indexOf(h) !== -1; }).length;
      if (matches >= 2 && hrefs.length <= 4) { g.remove(); }
    });

    var foot = side.querySelector('.side-foot');
    if (foot) side.insertBefore(block, foot); else side.appendChild(block);

    var trigger = block.querySelector('#userTrigger');
    var pop = block.querySelector('#userPop');
    trigger.addEventListener('click', function(e){
      e.stopPropagation();
      pop.classList.toggle('open');
      trigger.setAttribute('aria-expanded', pop.classList.contains('open') ? 'true' : 'false');
    });
    document.addEventListener('click', function(e){
      if (!block.contains(e.target)) { pop.classList.remove('open'); trigger.setAttribute('aria-expanded','false'); }
    });
    pop.querySelectorAll('.seg button').forEach(function(b){
      b.addEventListener('click', function(){
        pop.querySelectorAll('.seg button').forEach(function(x){ x.classList.remove('on'); });
        b.classList.add('on');
        toast('Theme set to ' + b.dataset.theme + ' (visual not implemented in mock)','ok');
      });
    });
    pop.querySelector('.signout').addEventListener('click', function(){
      toast('Signed out (mock)','ok');
      pop.classList.remove('open');
    });
  }

  /* ---------- AI ASSISTANT ---------- */
  function mountAi(){
    if (document.querySelector('.ai-fab')) return;

    var fab = document.createElement('button');
    fab.className = 'ai-fab'; fab.id = 'aiFab'; fab.type = 'button';
    fab.innerHTML = '<span class="spark">✦</span> Ask AI';

    var panel = document.createElement('aside');
    panel.className = 'ai-panel'; panel.id = 'aiPanel';
    panel.innerHTML = ''
      + '<div class="ai-head">'
      +   '<span class="spark">✦</span>'
      +   '<div class="ti"><h3>Ask Caro\'s Ledge</h3><div class="sub">Sector-aware · Ocean + Air freight · EU/UK/US/APAC</div></div>'
      +   '<button class="x" id="aiClose" aria-label="Close">✕</button>'
      + '</div>'
      + '<div class="ai-body" id="aiBody">'
      +   '<div class="msg them">Hi — I can search across <b>155 regulations</b>, <b>technology readiness</b>, <b>price signals</b>, and your <b>research pipeline</b>. I\'ll tailor answers to your sectors (Ocean container, Air freight forwarding) and jurisdictions (EU, UK, US, APAC).</div>'
      + '</div>'
      + '<div class="ai-suggested" id="aiSuggested">'
      +   '<div class="lab">Try asking</div>'
      +   '<div class="chips">'
      +     '<button class="chip" type="button">What\'s changed in EU FuelEU this week?</button>'
      +     '<button class="chip" type="button">Compare CARB ACF vs EPA Phase 3</button>'
      +     '<button class="chip" type="button">Which suppliers are TRL 8+ on e-fuels?</button>'
      +     '<button class="chip" type="button">Show all carbon-pricing items in APAC</button>'
      +   '</div>'
      + '</div>'
      + '<div class="ai-foot">'
      +   '<div class="row"><input id="aiInput" placeholder="Ask anything across your intel…" /><button id="aiSend">Send</button></div>'
      +   '<div class="meta"><span>Sectors: <b>Ocean container · Air freight</b></span><span><b>7 / 10</b> calls left this hour</span></div>'
      + '</div>';

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    function open(){ panel.classList.add('open'); fab.classList.add('open'); }
    function close(){ panel.classList.remove('open'); fab.classList.remove('open'); }
    fab.addEventListener('click', open);
    panel.querySelector('#aiClose').addEventListener('click', close);

    var body = panel.querySelector('#aiBody');
    var input = panel.querySelector('#aiInput');
    function ask(q){
      if (!q) return;
      var u = document.createElement('div'); u.className = 'msg you'; u.textContent = q; body.appendChild(u);
      var t = document.createElement('div'); t.className = 'msg them'; t.innerHTML = 'Searching across your intel…'; body.appendChild(t);
      input.value = '';
      body.scrollTop = body.scrollHeight;
      setTimeout(function(){
        t.innerHTML = 'Based on your sector profile, the most material item this week is <b>EU FuelEU Maritime Article 6 (vessel pooling)</b> — draft implementing acts published 14 Jan, validator review scheduled 03 Apr. Two of your shipper-partners flagged this as material for 2026 reporting.'
                    + '<div class="src-row"><a href="regulation-detail.html">EU FuelEU Art. 6</a><a href="research.html">Source: EUR-Lex</a><a href="regulations.html">3 related items</a></div>';
        body.scrollTop = body.scrollHeight;
      }, 700);
    }
    panel.querySelector('#aiSend').addEventListener('click', function(){ ask(input.value.trim()); });
    input.addEventListener('keydown', function(e){ if (e.key === 'Enter') ask(input.value.trim()); });
    panel.querySelectorAll('.ai-suggested .chip').forEach(function(c){
      c.addEventListener('click', function(){ ask(c.textContent); });
    });
  }

  /* ---------- TOAST ---------- */
  var toastHost;
  function ensureToastHost(){
    if (toastHost && document.body.contains(toastHost)) return toastHost;
    toastHost = document.createElement('div'); toastHost.className = 'toast-host';
    document.body.appendChild(toastHost); return toastHost;
  }
  function toast(msg, kind){
    var host = ensureToastHost();
    var t = document.createElement('div');
    t.className = 'toast ' + (kind || 'ok');
    var ic = ({ok:'✓', warn:'!', err:'✕'})[kind || 'ok'] || '✓';
    t.innerHTML = '<span class="ic">' + ic + '</span><span>' + msg + '</span><button class="x" aria-label="Dismiss">✕</button>';
    host.appendChild(t);
    var rm = function(){ if (t.parentNode) t.parentNode.removeChild(t); };
    t.querySelector('.x').addEventListener('click', rm);
    setTimeout(rm, 4000);
  }
  window.CL_toast = toast;

  /* ---------- MODAL helper (open by ID, close on scrim or [data-close]) ---------- */
  window.CL_modal = {
    open: function(id){ var el = document.getElementById(id); if (el) el.classList.add('open'); },
    close: function(id){ var el = document.getElementById(id); if (el) el.classList.remove('open'); }
  };
  document.addEventListener('click', function(e){
    var scrim = e.target.closest && e.target.closest('.cl-modal-scrim');
    if (!scrim) return;
    if (e.target === scrim || (e.target.dataset && e.target.dataset.close !== undefined) || (e.target.closest && e.target.closest('[data-close]'))) {
      scrim.classList.remove('open');
    }
  });

  /* ---------- mount on DOM ready ---------- */
  function ready(){ mountUserMenu(); mountAi(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
