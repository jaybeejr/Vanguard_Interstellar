(function () {
  'use strict';
  var KEY = 'vanguardPayouts', PIN_KEY = 'vanguardAdminPin', TRY_KEY = 'vanguardAdminTries';
  // Default PIN (stored only as a salted SHA-256 hash). Changing the PIN on the admin page overrides it in that browser only.
  var PRESET = { salt: 'a247379eaa42a1a4021b23d3', hash: '381cc15d14994d48bc592d6fa98956cb9d69c2ea9be4730872b3d5c34445bdd3' };
  var MAX_TRIES = 5, LOCK_MS = 60000, IDLE_MS = 10 * 60 * 1000;
  var $ = function (s) { return document.querySelector(s); };
  var fmt = function (n) { return Math.round(n).toLocaleString('en-US'); };
  var items = [], idleTimer = null;

  function read(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }
  function load() { var a = read(KEY, []); return Array.isArray(a) ? a.filter(function (x) { return x && typeof x.player === 'string' && typeof x.amount === 'number'; }) : []; }
  var DAY = 24 * 60 * 60 * 1000, ARCH_KEY = 'vanguardPayoutsArchive';
  function readArchive() { var a = read(ARCH_KEY, []); return Array.isArray(a) ? a : []; }
  function archive(list) {
    var arch = readArchive(), now = Date.now();
    list.forEach(function (x) { var c = {}; for (var k in x) c[k] = x[k]; c.archivedAt = now; arch.push(c); });
    return write(ARCH_KEY, arch);
  }
  function sweep() {
    var now = Date.now(), changed = false, keep = [], gone = [];
    items.forEach(function (x) {
      if (x.paid) {
        if (!x.paidAt) { x.paidAt = now; changed = true; }
        if (now - x.paidAt >= DAY) { gone.push(x); return; }
      }
      keep.push(x);
    });
    if (gone.length) { if (!archive(gone)) return; items = keep; changed = true; }
    if (changed) write(KEY, items);
  }
  function say(sel, t) { $(sel).textContent = t; }

  // ---------- PIN hashing ----------
  function hash(salt, pin) {
    if (!(window.crypto && crypto.subtle && window.TextEncoder)) return Promise.reject(new Error('nosubtle'));
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }
  function newSalt() {
    var a = new Uint8Array(12);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a); else for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  var validPin = function (p) { return /^[A-Za-z0-9]{4,12}$/.test(p); };
  var NO_CRYPTO = 'This browser cannot check PINs on this page. Open the site from its normal https web address and try again.';
  function setPin(pin) {
    var salt = newSalt();
    return hash(salt, pin).then(function (h) { return write(PIN_KEY, { salt: salt, hash: h }); });
  }
  function checkPin(pin) {
    var rec = read(PIN_KEY, null) || PRESET;
    if (!rec) return Promise.resolve(false);
    return hash(rec.salt, pin).then(function (h) { return h === rec.hash; });
  }

  // ---------- Attempt limiting ----------
  function waitLeft() {
    var t = read(TRY_KEY, { n: 0, until: 0 });
    return Math.max(0, Math.ceil((t.until - Date.now()) / 1000));
  }
  function failed() {
    var t = read(TRY_KEY, { n: 0, until: 0 });
    t.n = (t.n || 0) + 1;
    if (t.n >= MAX_TRIES) { t.n = 0; t.until = Date.now() + LOCK_MS; }
    write(TRY_KEY, t);
  }
  function cleared() { write(TRY_KEY, { n: 0, until: 0 }); }

  // ---------- Gate ----------
  var setupMode = !read(PIN_KEY, null) && !PRESET;
  function showGate() {
    if (setupMode) {
      $('#gateTitle').textContent = 'CREATE ADMIN PIN';
      $('#pinLabel').textContent = 'Choose a PIN (4 to 12 letters or numbers)';
      $('#pin2Wrap').hidden = false; $('#pin2').required = true;
      $('#gateBtn').textContent = 'SAVE PIN AND UNLOCK';
    }
  }
  $('#gateForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var pin = $('#pin').value;
    if (setupMode) {
      if (!validPin(pin)) { say('#gateMsg', 'Use 4 to 12 letters or numbers for your PIN.'); return; }
      if (pin !== $('#pin2').value) { say('#gateMsg', 'The two PINs do not match.'); return; }
      setPin(pin).then(function (ok) {
        if (!ok) { say('#gateMsg', 'This browser blocked saving the PIN. Allow site storage and try again.'); return; }
        setupMode = false; unlock();
      }).catch(function () { say('#gateMsg', NO_CRYPTO); });
      return;
    }
    var w = waitLeft();
    if (w > 0) { say('#gateMsg', 'Too many wrong tries. Wait ' + w + ' seconds.'); return; }
    checkPin(pin).then(function (ok) {
      if (ok) { cleared(); unlock(); }
      else { failed(); $('#pin').value = ''; var w2 = waitLeft(); say('#gateMsg', w2 > 0 ? 'Too many wrong tries. Wait ' + w2 + ' seconds.' : 'Wrong PIN.'); }
    }).catch(function () { say('#gateMsg', NO_CRYPTO); });
  });

  function unlock() {
    $('#pin').value = ''; $('#pin2').value = ''; say('#gateMsg', '');
    $('#gate').hidden = true;
    $('#adminContent').hidden = false;
    $('#lockBtn').hidden = false;
    document.querySelector('.page-hero p').textContent = 'Payout overview and controls for leadership.';
    items = load(); sweep(); render(); resetIdle();
  }
  function lock() { location.reload(); }
  function resetIdle() { clearTimeout(idleTimer); idleTimer = setTimeout(lock, IDLE_MS); }
  ['click', 'keydown'].forEach(function (ev) { document.addEventListener(ev, function () { if (!$('#adminContent').hidden) resetIdle(); }); });
  $('#lockBtn').addEventListener('click', lock);

  // ---------- Admin view ----------
  function td(tr, text, cls) { var c = document.createElement('td'); c.textContent = text; if (cls) c.className = cls; tr.appendChild(c); return c; }
  function persist() { if (!write(KEY, items)) say('#msg', 'This browser blocked saving. Export a backup so you do not lose data.'); }

  function renderAccounts() {
    var us = read('vanguardUsers', {}), hs = read('vanguardHangars', {});
    if (!us || typeof us !== 'object') us = {};
    if (!hs || typeof hs !== 'object') hs = {};
    var keys = Object.keys(us).sort();
    $('#sAccts').textContent = keys.length;
    var body = $('#accounts'); body.innerHTML = '';
    keys.forEach(function (k) {
      var u = us[k] || {}, ships = Array.isArray(hs[k]) ? hs[k] : [];
      var tr = document.createElement('tr');
      td(tr, u.name || k);
      td(tr, u.discord ? 'Discord' : 'Password');
      td(tr, u.created ? new Date(u.created).toISOString().slice(0, 10) : '');
      td(tr, ships.length ? ships.map(function (s) { return s.nick ? s.ship + ' (' + s.nick + ')' : s.ship; }).join(', ') : 'None yet');
      body.appendChild(tr);
    });
    $('#accountsEmpty').textContent = keys.length ? '' : 'No accounts have been created in this browser yet.';
  }

  function render() {
    renderAccounts();
    var owed = 0, paid = 0, players = {}, payers = {}, divs = {};
    items.forEach(function (x) {
      var p = players[x.player] = players[x.player] || { owed: 0, paid: 0 };
      var d = divs[x.division || 'Other'] = divs[x.division || 'Other'] || { owed: 0, paid: 0 };
      if (x.paid) { paid += x.amount; p.paid += x.amount; d.paid += x.amount; }
      else {
        owed += x.amount; p.owed += x.amount; d.owed += x.amount;
        var k = x.payer || 'Not recorded';
        var q = payers[k] = payers[k] || { n: 0, total: 0 };
        q.n++; q.total += x.amount;
      }
    });
    $('#sOwed').textContent = fmt(owed) + ' aUEC';
    $('#sPaid').textContent = fmt(paid) + ' aUEC';
    $('#sCount').textContent = items.length;
    $('#archInfo').textContent = 'Archived entries (paid more than 24 hours ago): ' + readArchive().length;

    var bp = $('#byPlayer'); bp.innerHTML = '';
    var names = Object.keys(players).sort();
    names.forEach(function (n) {
      var tr = document.createElement('tr');
      td(tr, n); td(tr, fmt(players[n].owed), 'num'); td(tr, fmt(players[n].paid), 'num');
      var a = document.createElement('td');
      if (players[n].owed > 0) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'btn small'; b.textContent = 'Mark all paid';
        b.addEventListener('click', function () {
          if (!confirm('Mark everything owed to ' + n + ' as paid?')) return;
          items.forEach(function (x) { if (x.player === n && !x.paid) { x.paid = true; x.paidAt = Date.now(); } });
          persist(); render(); say('#msg', 'Marked all payouts for ' + n + ' as paid.');
        });
        a.appendChild(b);
      }
      tr.appendChild(a); bp.appendChild(tr);
    });
    $('#byPlayerEmpty').textContent = names.length ? '' : 'No payouts saved in this browser yet.';

    var py = $('#byPayer'); py.innerHTML = '';
    Object.keys(payers).sort().forEach(function (n) {
      var tr = document.createElement('tr'); td(tr, n); td(tr, payers[n].n, 'num'); td(tr, fmt(payers[n].total), 'num'); py.appendChild(tr);
    });
    var dv = $('#byDivision'); dv.innerHTML = '';
    Object.keys(divs).sort().forEach(function (n) {
      var tr = document.createElement('tr'); td(tr, n); td(tr, fmt(divs[n].owed), 'num'); td(tr, fmt(divs[n].paid), 'num'); dv.appendChild(tr);
    });
  }

  var HEAD = ['Date', 'Username', 'Operation', 'Division', 'Amount (aUEC)', 'Status', 'Go to for payment', 'Marked paid', 'Commander', 'Vehicle', 'Role'];
  function stamp(t) { return t ? new Date(t).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : ''; }
  function toRows(list, withArchived) {
    return list.map(function (x) {
      var r = [x.date || '', x.player, x.op || '', x.division || '', x.amount, x.paid ? 'Paid' : 'Owed', x.payer || '', stamp(x.paidAt), x.commander ? 'Yes' : '', x.vehicle || '', x.role || ''];
      if (withArchived) r.push(stamp(x.archivedAt));
      return r;
    });
  }
  $('#exportArchive').addEventListener('click', function () {
    var arch = readArchive();
    if (!arch.length) { say('#msg', 'The archive is empty.'); return; }
    window.downloadXlsx('vanguard-payouts-archive.xlsx', 'Archive', HEAD.concat(['Archived']), toRows(arch, true));
  });
  $('#exportBackup').addEventListener('click', function () {
    if (!items.length) { say('#msg', 'There are no payouts to export.'); return; }
    window.downloadXlsx('vanguard-payouts-backup.xlsx', 'Payouts', HEAD, toRows(items, false));
  });
  $('#delPaid').addEventListener('click', function () {
    var n = items.filter(function (x) { return x.paid; }).length;
    if (!n) { say('#msg', 'There are no paid entries to delete.'); return; }
    if (confirm('Archive and remove ' + n + ' paid entries from the log?')) {
      var gone = items.filter(function (x) { return x.paid; });
      if (!archive(gone)) { say('#msg', 'Could not save the archive, so nothing was deleted.'); return; }
      items = items.filter(function (x) { return !x.paid; }); persist(); render(); say('#msg', 'Archived and removed ' + n + ' paid entries.');
    }
  });
  $('#delAll').addEventListener('click', function () {
    if (!items.length) { say('#msg', 'There is nothing to delete.'); return; }
    if (confirm('Delete ALL ' + items.length + ' payout entries from this browser? This cannot be undone.')) {
      items = []; persist(); render(); say('#msg', 'All payouts deleted.');
    }
  });

  $('#pinForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var cur = $('#curPin').value, a = $('#newPin').value, b = $('#newPin2').value;
    if (!validPin(a)) { say('#pinMsg', 'Use 4 to 12 letters or numbers for the new PIN.'); return; }
    if (a !== b) { say('#pinMsg', 'The new PINs do not match.'); return; }
    checkPin(cur).then(function (ok) {
      if (!ok) { say('#pinMsg', 'Current PIN is wrong.'); return; }
      setPin(a).then(function (saved) {
        say('#pinMsg', saved ? 'PIN changed.' : 'This browser blocked saving the PIN.');
        if (saved) { $('#curPin').value = ''; $('#newPin').value = ''; $('#newPin2').value = ''; }
      });
    }).catch(function () { say('#pinMsg', NO_CRYPTO); });
  });

  showGate();
})();
