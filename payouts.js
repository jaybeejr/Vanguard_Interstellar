/* Payouts page.
   With the Discord bot turned on (config.js verifyApi), payouts are saved on your account service, so every
   signed-in member sees the same list. Without it, they are saved in this browser only. */
(function () {
  'use strict';
  var KEY = 'vanguardPayouts', ARCH_KEY = 'vanguardPayoutsArchive', DAY = 24 * 60 * 60 * 1000;
  var API = String((window.VANGUARD_CONFIG && window.VANGUARD_CONFIG.verifyApi) || '').replace(/\/+$/, '');
  var $ = function (s) { return document.querySelector(s); };
  var fmt = function (n) { return Math.round(n).toLocaleString('en-US'); };

  var items = [];
  var me = '', canManage = false, lastFetch = 0;
  var recent = {}, overrides = {}; // keep fresh changes on screen for 2 minutes while the shared list catches up
  var HOLD = 2 * 60 * 1000;

  // The commander's own share (only ever created in browser-only mode) is never shown.
  function pub() { return items.filter(function (x) { return !x.commander; }); }
  function say(t) { $('#msg').textContent = t; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // ---------- browser-only storage ----------
  function valid(x) { return x && typeof x.player === 'string' && typeof x.amount === 'number' && isFinite(x.amount); }
  function loadLocal() {
    try { var a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a.filter(valid) : []; }
    catch (e) { return []; }
  }
  function saveLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(items)); }
    catch (e) { say('This browser blocked saving. Allow site storage for this page and try again.'); }
  }
  // Paid entries are copied to an archive and removed from the log 24 hours after they were marked paid.
  function sweepLocal() {
    var now = Date.now(), changed = false, keep = [], gone = [];
    items.forEach(function (x) {
      if (x.paid) {
        if (!x.paidAt) { x.paidAt = now; changed = true; }
        if (now - x.paidAt >= DAY) { gone.push(x); return; }
      }
      keep.push(x);
    });
    if (gone.length) {
      try {
        var arch = JSON.parse(localStorage.getItem(ARCH_KEY) || '[]');
        if (!Array.isArray(arch)) arch = [];
        gone.forEach(function (x) { x.archivedAt = now; arch.push(x); });
        localStorage.setItem(ARCH_KEY, JSON.stringify(arch));
      } catch (e) { return; }
      items = keep; changed = true;
    }
    if (changed) saveLocal();
  }

  // ---------- shared storage (the account service) ----------
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
  function newestFirst(a, b) { return (b.date || '').localeCompare(a.date || '') || (b.created || 0) - (a.created || 0); }
  function merge(list) {
    var now = Date.now(), byId = {};
    list.forEach(function (x) { byId[x.id] = x; });
    Object.keys(recent).forEach(function (id) {
      var r = recent[id];
      if (r.until < now) { delete recent[id]; return; }
      if (!byId[id]) list.push(r.rec);
    });
    list.forEach(function (x) {
      var o = overrides[x.id];
      if (o && o.until > now) { x.paid = o.paid; x.paidAt = o.paidAt; } else if (o) delete overrides[x.id];
    });
    return list.sort(newestFirst);
  }
  function refresh() {
    if (!API) return;
    $('#empty').textContent = items.length ? '' : 'Loading payouts...';
    service('/api/payouts').then(function (res) {
      if (!res.ok) { say(res.error || 'Could not load payouts.'); $('#empty').textContent = ''; return; }
      lastFetch = Date.now();
      me = res.me || me; canManage = !!res.canManage;
      items = merge(res.payouts || []);
      render();
    }).catch(function () { say('Could not reach the account service. Try again in a moment.'); $('#empty').textContent = ''; });
  }
  function canMark(x) { return !API || canManage || (me && String(x.payer || '').toLowerCase() === me.toLowerCase()); }

  function cell(tr, text, cls) {
    var td = document.createElement('td');
    td.textContent = text;
    if (cls) td.className = cls;
    tr.appendChild(td);
    return td;
  }

  function togglePaid(x) {
    if (!API) { x.paid = !x.paid; x.paidAt = x.paid ? Date.now() : null; saveLocal(); render(); return; }
    service('/api/payouts/status', { id: x.id, paid: !x.paid }).then(function (res) {
      if (!res.ok) { say(res.error || 'Could not change that payout.'); return; }
      overrides[x.id] = { paid: res.payout.paid, paidAt: res.payout.paidAt, until: Date.now() + HOLD };
      x.paid = res.payout.paid; x.paidAt = res.payout.paidAt;
      render();
    }).catch(function () { say('Could not reach the account service. Try again in a moment.'); });
  }

  function render() {
    var status = $('#fStatus').value, q = $('#fSearch').value.trim().toLowerCase();
    var owed = 0, paid = 0, per = {};
    pub().forEach(function (x) {
      var k = x.player;
      per[k] = per[k] || { owed: 0, paid: 0 };
      if (x.paid) { paid += x.amount; per[k].paid += x.amount; } else { owed += x.amount; per[k].owed += x.amount; }
    });
    $('#sOwed').textContent = fmt(owed) + ' aUEC';
    $('#sPaid').textContent = fmt(paid) + ' aUEC';
    $('#sCount').textContent = pub().length;

    var body = $('#rows');
    body.innerHTML = '';
    var shown = pub().filter(function (x) {
      if (status === 'owed' && x.paid) return false;
      if (status === 'paid' && !x.paid) return false;
      if (q && (x.player + ' ' + (x.op || '')).toLowerCase().indexOf(q) === -1) return false;
      return true;
    }).sort(newestFirst);

    shown.forEach(function (x) {
      var tr = document.createElement('tr');
      cell(tr, x.date || '');
      cell(tr, x.player);
      cell(tr, x.op || '');
      cell(tr, x.division || '');
      cell(tr, [x.vehicle, x.role].filter(Boolean).join(' - '));
      cell(tr, fmt(x.amount), 'num');
      var st = document.createElement('td');
      var tag = document.createElement('span');
      tag.className = 'tag' + (x.paid ? ' paid' : '');
      tag.textContent = x.paid ? 'PAID' : 'OWED';
      st.appendChild(tag); tr.appendChild(st);
      cell(tr, x.payer || 'Not recorded');
      var act = document.createElement('td');
      if (canMark(x)) {
        var b1 = document.createElement('button');
        b1.type = 'button'; b1.className = 'btn small';
        b1.textContent = x.paid ? 'Mark owed' : 'Mark paid';
        b1.addEventListener('click', function () { togglePaid(x); });
        act.appendChild(b1);
      }
      tr.appendChild(act);
      body.appendChild(tr);
    });
    $('#empty').textContent = shown.length ? '' : (pub().length ? 'No payouts match these filters.' : 'No payouts yet. Add one above or save a haul from the Logistics calculator.');

    var pb = $('#perPlayer');
    pb.innerHTML = '';
    Object.keys(per).sort().forEach(function (name) {
      var tr = document.createElement('tr');
      cell(tr, name);
      cell(tr, fmt(per[name].owed), 'num');
      cell(tr, fmt(per[name].paid), 'num');
      pb.appendChild(tr);
    });
    renderLookup();
  }

  function renderLookup() {
    var raw = $('#lookupName').value.trim(), out = $('#lookupResult');
    out.innerHTML = '';
    var dl = $('#userList'); dl.innerHTML = '';
    var seen = {};
    pub().forEach(function (x) { seen[x.player] = 1; });
    Object.keys(seen).sort().forEach(function (n) { var o = document.createElement('option'); o.value = n; dl.appendChild(o); });
    if (!raw) { out.textContent = 'Enter your username to see what you are owed.'; return; }
    var mine = pub().filter(function (x) { return x.player.toLowerCase() === raw.toLowerCase(); });
    if (!mine.length) { out.textContent = 'No payouts found for "' + raw + '". Check the spelling of the username.'; return; }
    var owed = 0, paid = 0;
    mine.forEach(function (x) { if (x.paid) paid += x.amount; else owed += x.amount; });
    var stats = document.createElement('div');
    stats.className = 'stats';
    [['Owed to ' + mine[0].player, owed], ['Already paid', paid]].forEach(function (p) {
      var d = document.createElement('div'); d.className = 'stat';
      var a = document.createElement('span'), b = document.createElement('strong');
      a.textContent = p[0]; b.textContent = fmt(p[1]) + ' aUEC';
      d.appendChild(a); d.appendChild(b); stats.appendChild(d);
    });
    out.appendChild(stats);
    var who = {};
    mine.forEach(function (x) { if (!x.paid && x.payer) who[x.payer] = 1; });
    var names = Object.keys(who);
    if (owed > 0) {
      var note = document.createElement('p');
      note.className = 'msg';
      note.textContent = names.length ? 'To get paid, go to: ' + names.join(', ') : 'No payer was recorded for these payouts. Ask your leadership who to contact.';
      out.appendChild(note);
    }
    var wrap = document.createElement('div'); wrap.className = 'tablewrap';
    var t = document.createElement('table');
    t.innerHTML = '<thead><tr><th>Date</th><th>Operation</th><th class="num">Amount</th><th>Status</th><th>Go to for payment</th></tr></thead>';
    var tb = document.createElement('tbody');
    mine.slice().sort(newestFirst).forEach(function (x) {
      var tr = document.createElement('tr');
      cell(tr, x.date || ''); cell(tr, x.op || ''); cell(tr, fmt(x.amount), 'num'); cell(tr, x.paid ? 'PAID' : 'OWED'); cell(tr, x.payer || 'Not recorded');
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t); out.appendChild(wrap);
  }

  $('#lookupName').addEventListener('input', function () {
    try { localStorage.setItem('vanguardUsername', this.value); } catch (e) {}
    renderLookup();
  });
  try { $('#lookupName').value = localStorage.getItem('vanguardUsername') || ''; } catch (e) {}

  $('#addForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var player = $('#player').value.trim(), amount = parseFloat($('#amount').value), payer = $('#payer').value.trim();
    if (!payer) { say('Enter your own username so players know who to go to for payment.'); $('#payer').focus(); return; }
    if (!player || !isFinite(amount) || amount <= 0) { say('Enter a username and an amount above 0.'); return; }
    try { localStorage.setItem('vanguardPayer', payer); } catch (err) {}
    var wasPaid = $('#paidNow').checked, op = $('#op').value.trim(), division = $('#division').value, vehicle = $('#vehicleSel').value;
    var date = $('#date').value || new Date().toISOString().slice(0, 10);

    function done(msg) {
      $('#player').value = ''; $('#amount').value = ''; $('#op').value = ''; $('#paidNow').checked = false;
      say(msg); $('#player').focus();
    }

    if (!API) {
      items.push({
        id: uid(), date: date, player: player, payer: payer, vehicle: vehicle, op: op, division: division,
        amount: Math.round(amount), paid: wasPaid, paidAt: wasPaid ? Date.now() : null
      });
      saveLocal(); render(); done('Added payout for ' + player + '.');
      return;
    }
    var btn = $('#addForm button[type=submit]'); btn.disabled = true;
    service('/api/payouts', { op: op, division: division, vehicle: vehicle, date: date, items: [{ player: player, amount: Math.round(amount), paid: wasPaid }] })
      .then(function (res) {
        btn.disabled = false;
        if (!res.ok) { say(res.error || 'Could not save that payout.'); return; }
        res.created.forEach(function (rec) { recent[rec.id] = { rec: rec, until: Date.now() + HOLD }; items.push(rec); });
        items.sort(newestFirst); render();
        done('Added payout for ' + player + '. ' + (res.notified ? 'Posted in the Discord payout channel.' : (res.notifyReason === 'discord-error' ? 'Could not post to Discord.' : '')));
      })
      .catch(function () { btn.disabled = false; say('Could not reach the account service. Try again in a moment.'); });
  });

  $('#fStatus').addEventListener('change', render);
  $('#fSearch').addEventListener('input', render);
  $('#refreshBtn').addEventListener('click', refresh);
  document.addEventListener('visibilitychange', function () { if (API && !document.hidden && me && Date.now() - lastFetch > 30000) refresh(); });

  function applyUser(u) {
    me = u;
    $('#payer').value = u; $('#payer').readOnly = true;
    if (!$('#lookupName').value) $('#lookupName').value = u;
    if (API) refresh(); else render();
  }

  // ---------- start ----------
  $('#payoutNote').textContent = API
    ? 'Payouts are shared: everyone signed in sees the same list. Only the person paying (or an admin) can mark a payout paid. 24 hours after a payout is marked paid, it is archived and removed from this list.'
    : 'Payouts are saved in this browser only, so other officers will not see them. 24 hours after a payout is marked paid, it is archived and removed from this list.';
  $('#refreshBtn').hidden = !API;
  try { $('#payer').value = localStorage.getItem('vanguardPayer') || ''; } catch (e) {}
  $('#date').value = new Date().toISOString().slice(0, 10);
  if (!API) {
    items = loadLocal(); sweepLocal(); render();
    setInterval(function () { sweepLocal(); render(); }, 60000);
  }
  window.addEventListener('vanguard-auth', function (e) { applyUser(e.detail.username); });
  if (window.vanguardUser) applyUser(window.vanguardUser);
})();
