/* Username + password accounts, in an ACCOUNT drop-down at the top left of every page.
   - Create an account or log in from the drop-down.
   - The calculator, payouts and hangar pages need you to be logged in.
   Passwords are never stored. Each one is run through PBKDF2 (a one-way scramble)
   with a random salt, and only the result is saved in this browser. */
(function () {
  'use strict';
  var USERS_KEY = 'vanguardUsers', SESSION_KEY = 'vanguardSession', TRY_KEY = 'vanguardLoginTries';
  var ITER = 200000, MAX_TRIES = 5, LOCK_MS = 60000;
  var NAME_RE = /^[A-Za-z0-9_-]{3,20}$/;
  // DISCORD SIGN-IN: paste your Discord application's Client ID between the quotes (never the Client Secret).
  // Until this is filled in, the Discord button shows a "not set up yet" message.
  var DISCORD_CLIENT_ID = '1570210193587830914';
  var GATED = document.body.getAttribute('data-auth') === 'gate';

  function get(store, key, fb) { try { var v = JSON.parse(store.getItem(key)); return v == null ? fb : v; } catch (e) { return fb; } }
  function put(store, key, v) { try { store.setItem(key, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function users() { var u = get(localStorage, USERS_KEY, {}); return u && typeof u === 'object' ? u : {}; }

  function currentUser() {
    var n = get(sessionStorage, SESSION_KEY, null) || get(localStorage, SESSION_KEY, null);
    var u = users();
    return n && u[String(n).toLowerCase()] ? u[String(n).toLowerCase()].name : null;
  }
  function setSession(name, remember) {
    try { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_KEY); } catch (e) {}
    put(remember ? localStorage : sessionStorage, SESSION_KEY, name);
  }
  function logout() { try { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_KEY); } catch (e) {} location.reload(); }

  // ---------- hashing ----------
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function unhex(s) { var a = new Uint8Array(s.length / 2); for (var i = 0; i < a.length; i++) a[i] = parseInt(s.substr(i * 2, 2), 16); return a; }
  function newSalt() { var a = new Uint8Array(16); crypto.getRandomValues(a); return hex(a); }
  function derive(pw, saltHex, iter) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']).then(function (k) {
      return crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unhex(saltHex), iterations: iter, hash: 'SHA-256' }, k, 256);
    }).then(hex);
  }
  function same(a, b) { if (a.length !== b.length) return false; var d = 0; for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
  var hasCrypto = function () { return !!(window.crypto && crypto.subtle && crypto.getRandomValues && window.TextEncoder); };

  function waitLeft(key) { var t = get(localStorage, TRY_KEY, {})[key]; return t ? Math.max(0, Math.ceil((t.until - Date.now()) / 1000)) : 0; }
  function failed(key) {
    var all = get(localStorage, TRY_KEY, {}); var t = all[key] || { n: 0, until: 0 };
    t.n++; if (t.n >= MAX_TRIES) { t.n = 0; t.until = Date.now() + LOCK_MS; }
    all[key] = t; put(localStorage, TRY_KEY, all);
  }
  function cleared(key) { var all = get(localStorage, TRY_KEY, {}); delete all[key]; put(localStorage, TRY_KEY, all); }

  // ---------- Discord sign-in (implicit grant, identify scope only) ----------
  function startDiscord(remember, msgEl) {
    if (!DISCORD_CLIENT_ID) { msgEl.textContent = 'Discord sign-in is not set up yet. The site owner needs to add a Discord Client ID in auth.js.'; return; }
    var file = location.pathname.split('/').pop() || 'index.html';
    if (!/^[A-Za-z0-9_-]+\.html$/.test(file)) file = 'index.html';
    var a = new Uint8Array(16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a); else for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    var state = hex(a);
    try {
      sessionStorage.setItem('vanguardDiscordState', state);
      sessionStorage.setItem('vanguardDiscordReturn', file);
      sessionStorage.setItem('vanguardDiscordRemember', remember ? '1' : '0');
    } catch (e) { msgEl.textContent = 'This browser blocked saving. Allow site storage and try again.'; return; }
    var redirect = new URL('discord.html', location.href).href;
    location.href = 'https://discord.com/oauth2/authorize?response_type=token&scope=identify' +
      '&client_id=' + encodeURIComponent(DISCORD_CLIENT_ID) + '&state=' + state + '&redirect_uri=' + encodeURIComponent(redirect);
  }

  // ---------- the log in / create account form ----------
  function mountForm(host, onSuccess) {
    host.innerHTML =
      '<h3 data-r="title">LOG IN</h3>' +
      '<div data-r="discordWrap" style="margin:0 0 16px"><button type="button" class="btn solid" data-r="discord" style="width:100%">CONTINUE WITH DISCORD</button><p class="help" style="margin:12px 0 0;font-size:0.95rem">or use a username and password</p></div>' +
      '<div class="actions" style="margin:0 0 16px"><button type="button" class="btn small" data-r="tabLogin">Log in</button><button type="button" class="btn small" data-r="tabRegister">Create account</button></div>' +
      '<form data-r="form" novalidate>' +
        '<div class="fields" style="grid-template-columns:1fr">' +
          '<div><label>Username<input type="text" data-r="user" autocomplete="username" maxlength="20" autocapitalize="off" spellcheck="false" style="margin-top:4px"></label></div>' +
          '<div><label>Password<input type="password" data-r="pass" autocomplete="current-password" maxlength="128" style="margin-top:4px"></label></div>' +
          '<div data-r="pass2Wrap" hidden><label>Confirm password<input type="password" data-r="pass2" autocomplete="new-password" maxlength="128" style="margin-top:4px"></label></div>' +
        '</div>' +
        '<p style="margin:12px 0 0"><label style="display:inline-flex;align-items:center;gap:10px;margin:0"><input type="checkbox" data-r="show" style="width:22px;min-height:22px"> Show password</label></p>' +
        '<p style="margin:8px 0 0"><label style="display:inline-flex;align-items:center;gap:10px;margin:0"><input type="checkbox" data-r="remember" style="width:22px;min-height:22px"> Keep me signed in on this device</label></p>' +
        '<div class="actions"><button type="submit" class="btn solid" data-r="btn">LOG IN</button></div>' +
      '</form>' +
      '<p class="msg" data-r="msg" role="alert"></p>' +
      '<p class="help" style="margin:12px 0 0;font-size:0.95rem">Accounts are saved on this device only.</p>';
    var q = function (n) { return host.querySelector('[data-r="' + n + '"]'); };
    var mode = 'login', busy = false;
    var say = function (t) { q('msg').textContent = t; };
    function label() { return mode === 'register' ? 'CREATE ACCOUNT' : 'LOG IN'; }
    function setMode(m) {
      mode = m; say('');
      var reg = m === 'register';
      q('title').textContent = reg ? 'CREATE ACCOUNT' : 'LOG IN';
      q('btn').textContent = label();
      q('pass2Wrap').hidden = !reg;
      q('pass').setAttribute('autocomplete', reg ? 'new-password' : 'current-password');
      q('tabLogin').setAttribute('aria-pressed', String(!reg));
      q('tabRegister').setAttribute('aria-pressed', String(reg));
    }
    q('tabLogin').addEventListener('click', function () { setMode('login'); q('user').focus(); });
    q('tabRegister').addEventListener('click', function () { setMode('register'); q('user').focus(); });
    q('discord').addEventListener('click', function () { startDiscord(q('remember').checked, q('msg')); });
    q('show').addEventListener('change', function () { var t = this.checked ? 'text' : 'password'; q('pass').type = t; q('pass2').type = t; });
    setMode(Object.keys(users()).length ? 'login' : 'register');

    function work(on) { busy = on; q('btn').disabled = on; q('btn').textContent = on ? 'WORKING...' : label(); }

    function register(user, pw, pw2, remember) {
      if (!NAME_RE.test(user)) return say('Username must be 3 to 20 letters, numbers, underscores or hyphens.');
      if (pw.length < 8) return say('Use a password with at least 8 characters.');
      if (pw !== pw2) return say('The two passwords do not match.');
      var all = users(), key = user.toLowerCase();
      if (all[key]) return say('That username is already taken on this device. Try logging in.');
      work(true);
      var salt = newSalt();
      derive(pw, salt, ITER).then(function (h) {
        all[key] = { name: user, salt: salt, hash: h, iter: ITER, created: Date.now() };
        if (!put(localStorage, USERS_KEY, all)) { work(false); return say('This browser blocked saving. Allow site storage and try again.'); }
        setSession(user, remember); onSuccess(user, true);
      }).catch(function () { work(false); say('Could not create the account in this browser.'); });
    }

    function login(user, pw, remember) {
      var key = user.toLowerCase();
      var w = waitLeft(key);
      if (w > 0) return say('Too many wrong tries. Wait ' + w + ' seconds.');
      var rec = users()[key];
      if (rec && rec.discord) return say('This account signs in with Discord. Use "Continue with Discord."');
      work(true);
      derive(pw, rec ? rec.salt : '00000000000000000000000000000000', rec ? rec.iter : ITER).then(function (h) {
        if (rec && same(h, rec.hash)) { cleared(key); setSession(rec.name, remember); onSuccess(rec.name, false); return; }
        failed(key); work(false); q('pass').value = '';
        var w2 = waitLeft(key);
        say(w2 > 0 ? 'Too many wrong tries. Wait ' + w2 + ' seconds.' : 'Wrong username or password.');
      }).catch(function () { work(false); say('Could not check the password in this browser.'); });
    }

    q('form').addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      if (!hasCrypto()) return say('This browser cannot secure passwords on this page. Open the site from its normal https web address.');
      var user = q('user').value.trim(), pw = q('pass').value, remember = q('remember').checked;
      if (!user || !pw) return say('Enter a username and a password.');
      if (mode === 'register') register(user, pw, q('pass2').value, remember);
      else login(user, pw, remember);
    });
    return q('user');
  }

  // ---------- the drop-down at the top left ----------
  var wrap = document.querySelector('.topbar .wrap');
  if (!wrap) return;
  var box = document.createElement('div'); box.className = 'acct';
  var btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'btn small acct-btn'; btn.id = 'acctBtn';
  btn.setAttribute('aria-haspopup', 'true'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'acctPanel');
  var panel = document.createElement('div');
  panel.className = 'panel acct-panel'; panel.id = 'acctPanel'; panel.hidden = true;
  box.appendChild(btn); box.appendChild(panel);
  wrap.insertBefore(box, wrap.firstChild);

  var user = null, notice = null;

  function setOpen(open) {
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) { var f = panel.querySelector('input'); if (f) f.focus(); }
  }
  btn.addEventListener('click', function () { setOpen(panel.hidden); });
  document.addEventListener('click', function (e) { if (!panel.hidden && !box.contains(e.target) && !(e.target.closest && e.target.closest('#openAcct'))) setOpen(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) { setOpen(false); btn.focus(); } });

  function setLabel() { btn.textContent = (user ? user : 'ACCOUNT') + ' \u25BE'; }

  function link(href, text, solid) { var a = document.createElement('a'); a.className = 'btn' + (solid ? ' solid' : ''); a.href = href; a.textContent = text; return a; }
  function renderSignedIn(isNew) {
    panel.innerHTML = '';
    var h = document.createElement('h3'); h.textContent = isNew ? 'ACCOUNT CREATED' : 'SIGNED IN'; panel.appendChild(h);
    var p = document.createElement('p'); p.style.margin = '0 0 16px'; p.style.color = 'var(--gray)';
    p.appendChild(document.createTextNode('You are signed in as '));
    var s = document.createElement('strong'); s.style.color = 'var(--white)'; s.textContent = user; p.appendChild(s);
    p.appendChild(document.createTextNode('.'));
    panel.appendChild(p);
    var act = document.createElement('div'); act.className = 'actions'; act.style.marginTop = '0'; act.style.flexDirection = 'column'; act.style.alignItems = 'stretch';
    act.appendChild(link('payouts.html', 'PAYOUTS'));
    act.appendChild(link('hangar.html', 'MY HANGAR'));
    var b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = 'LOG OUT'; b.addEventListener('click', logout);
    act.appendChild(b); panel.appendChild(act);
  }
  function renderForm() { mountForm(panel, function (name, isNew) { signedIn(name, isNew); }); }

  function signedIn(name, isNew) {
    user = name;
    window.vanguardUser = name;
    document.body.classList.remove('needs-auth');
    if (notice) { notice.remove(); notice = null; }
    setLabel(); renderSignedIn(!!isNew);
    window.dispatchEvent(new CustomEvent('vanguard-auth', { detail: { username: name } }));
  }

  setLabel();
  var name0 = currentUser();
  if (name0) { user = name0; signedIn(name0, false); }
  else {
    renderForm();
    if (GATED) {
      notice = document.createElement('section'); notice.className = 'gate-notice';
      notice.innerHTML = '<div class="wrap"><div class="panel" style="max-width:640px"><h3>LOG IN REQUIRED</h3><p style="margin:0 0 16px;color:var(--gray)">Log in or create an account to use this page. Open the ACCOUNT menu at the top left.</p><button type="button" class="btn solid" id="openAcct">OPEN ACCOUNT MENU</button></div></div>';
      var main = document.querySelector('main');
      main.parentNode.insertBefore(notice, main);
      notice.querySelector('#openAcct').addEventListener('click', function () { setOpen(true); });
    }
  }
})();
