/* "My Hangar": ships saved to the signed-in account.
   With the Discord bot turned on (config.js verifyApi), ships are saved on your account service and shown
   publicly on the division pages. Otherwise they are saved in this browser only. */
(function () {
  'use strict';
  var KEY = 'vanguardHangars', MAX = 100;
  var API = String((window.VANGUARD_CONFIG && window.VANGUARD_CONFIG.verifyApi) || '').replace(/\/+$/, '');
  var $ = function (s) { return document.querySelector(s); };
  var user = null, list = [];

  function say(t) { $('#msg').textContent = t; }
  function token() {
    try {
      var s = JSON.parse(sessionStorage.getItem('vanguardSession') || localStorage.getItem('vanguardSession') || 'null');
      return s && typeof s === 'object' && s.token ? s.token : '';
    } catch (e) { return ''; }
  }
  function service(path, body) {
    var opts = { headers: { Authorization: 'Bearer ' + token() } };
    if (body) { opts.method = 'POST'; opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(API + path, opts).then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Unexpected reply from the account service.' }; }); });
  }

  // ----- browser-only storage (used when the bot is not turned on) -----
  function readAll() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return {}; }
  }
  function localList() { var a = readAll()[user.toLowerCase()]; return Array.isArray(a) ? a : []; }
  function localSave(next) {
    var all = readAll(); all[user.toLowerCase()] = next;
    try { localStorage.setItem(KEY, JSON.stringify(all)); return true; } catch (e) { return false; }
  }

  // Save a new list. Resolves to true when it worked.
  function persist(next) {
    if (!API) {
      if (!localSave(next)) { say('This browser blocked saving. Allow site storage for this page and try again.'); return Promise.resolve(false); }
      list = next; return Promise.resolve(true);
    }
    return service('/api/hangar', { ships: next }).then(function (res) {
      if (!res.ok) { say(res.error || 'Could not save your hangar.'); return false; }
      list = res.ships || next; return true;
    }).catch(function () { say('Could not reach the account service. Try again in a moment.'); return false; });
  }

  function cell(tr, text) { var c = document.createElement('td'); c.textContent = text; tr.appendChild(c); }

  function render() {
    var body = $('#ships');
    body.innerHTML = '';
    list.forEach(function (s) {
      var tr = document.createElement('tr');
      cell(tr, s.ship); cell(tr, s.nick || ''); cell(tr, s.division || ''); cell(tr, s.notes || '');
      var act = document.createElement('td');
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'btn small'; b.textContent = 'Remove';
      b.addEventListener('click', function () {
        if (!confirm('Remove ' + s.ship + ' from your hangar?')) return;
        persist(list.filter(function (x) { return x.id !== s.id; })).then(function (ok) { if (ok) { render(); say('Removed ' + s.ship + '.'); } });
      });
      act.appendChild(b); tr.appendChild(act); body.appendChild(tr);
    });
    $('#empty').textContent = list.length ? '' : 'Your hangar is empty. Add your first ship above.';
    $('#listTitle').textContent = list.length ? 'YOUR SHIPS (' + list.length + ')' : 'YOUR SHIPS';
  }

  $('#shipForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!user) return;
    var ship = $('#ship').value.trim();
    if (!ship) { say('Enter a ship name.'); return; }
    if (list.length >= MAX) { say('Your hangar is full (' + MAX + ' ships).'); return; }
    var next = list.concat([{
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      ship: ship, nick: $('#nick').value.trim(), division: $('#div').value, notes: $('#notes').value.trim(), added: Date.now()
    }]);
    var btn = $('#shipForm button[type=submit]'); btn.disabled = true;
    persist(next).then(function (ok) {
      btn.disabled = false;
      if (!ok) return;
      say('Added ' + ship + ' to your hangar.');
      $('#ship').value = ''; $('#nick').value = ''; $('#notes').value = ''; $('#div').value = '';
      render(); $('#ship').focus();
    });
  });

  function start(u) {
    user = u;
    $('#hangarIntro').textContent = 'The ships on ' + u + '\u2019s account.';
    $('#hangarNote').textContent = API
      ? 'Ships you add here are shown publicly on the division pages next to your username, so pick a division. Ships with no division are not shown. Ship names and notes stay private.'
      : 'Your hangar is saved on this device with your account.';
    if (!API) { list = localList(); render(); return; }
    $('#empty').textContent = 'Loading your hangar...';
    service('/api/hangar').then(function (res) {
      if (!res.ok) { say(res.error || 'Could not load your hangar.'); $('#empty').textContent = ''; return; }
      list = res.ships || []; render();
    }).catch(function () { say('Could not reach the account service. Try again in a moment.'); $('#empty').textContent = ''; });
  }
  window.addEventListener('vanguard-auth', function (e) { start(e.detail.username); });
  if (window.vanguardUser) start(window.vanguardUser);
})();
