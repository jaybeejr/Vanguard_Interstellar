(function () {
  'use strict';
  var KEY = 'vanguardPayouts';
  var $ = function (s) { return document.querySelector(s); };
  var fmt = function (n) { return Math.round(n).toLocaleString('en-US'); };
  var fmtScu = function (n) { return n.toLocaleString('en-US', { maximumFractionDigits: 2 }); };
  var scuIn = 0, scuOut = 0;
  var FUEL_PCT = 10; // fuel, repairs and other costs are always this % of total income
  var COMMANDER_SHARES = 1; // the commander's share, set here by leadership (not shown or editable on the page)
  // Shares each seat earns. Leadership can change these (for example 0.5 for box jocks).
  var ROLE_SHARES = { laser: 1, salvage: 1, boxjock: 1 };
  var VEHICLE_NAMES = { mole: 'MOLE', reclaimer: 'Reclaimer', other: 'Other' };
  var TRADE = 'https://sc-trade.tools/';
  // SC Trade Tools spells this one differently from the in-game name.
  var SLUGS = { quantanium: 'Quantainium', quantainium: 'Quantainium' };
  function lookupUrl(name) {
    var n = (name || '').trim();
    if (!n) return TRADE;
    var slug = SLUGS[n.toLowerCase()] || (n.charAt(0).toUpperCase() + n.slice(1));
    return TRADE + 'commodities/' + encodeURIComponent(slug);
  }
  var num = function (v) { var n = parseFloat(v); return isFinite(n) && n > 0 ? n : 0; };
  var last = { crew: [] };

  var RM = '<td data-label=""><button type="button" class="btn small rm" data-rm tabindex="-1" aria-label="Remove row" title="Remove row">&times;</button></td>';
  function addMaterial(tbodyId, listId) {
    var mining = tbodyId === 'miningRows';
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td data-label="Material"><input type="text" list="' + listId + '" data-f="name" aria-label="Material name"></td>' +
      '<td data-label="' + (mining ? 'SCU mined' : 'SCU') + '"><input type="number" min="0" step="any" inputmode="decimal" data-f="qty" aria-label="Amount in SCU"></td>' +
      (mining ? '<td data-label="Refinery loss (SCU)"><input type="number" min="0" step="any" inputmode="decimal" data-f="loss" aria-label="Refinery loss in SCU"></td>' : '') +
      '<td data-label="Price / SCU"><input type="number" min="0" step="any" inputmode="decimal" data-f="price" aria-label="Price per SCU in aUEC">' +
      (mining ? '<a class="lookup" data-lookup tabindex="-1" title="Open this material on SC Trade Tools" href="' + TRADE + '" target="_blank" rel="noopener noreferrer">Check price</a>' : '') + '</td>' +
      '<td class="line" data-label="Total">0</td>' + RM;
    $('#' + tbodyId).appendChild(tr);
  }

  function addCrew(name, shares) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td data-label="Username"><input type="text" data-f="name" aria-label="Username"></td>' +
      '<td data-label="Shares"><input type="number" min="0" step="any" inputmode="decimal" data-f="shares" aria-label="Shares" value="' + (shares || 1) + '"></td>' + RM;
    if (name) tr.querySelector('[data-f=name]').value = name;
    $('#crewRows').appendChild(tr);
  }

  function sumTable(id) {
    var total = 0;
    document.querySelectorAll('#' + id + ' tr').forEach(function (tr) {
      var qty = num(tr.querySelector('[data-f=qty]').value);
      var lossEl = tr.querySelector('[data-f=loss]');
      var sell = lossEl ? Math.max(0, qty - num(lossEl.value)) : qty;
      if (lossEl) { scuIn += qty; scuOut += sell; }
      var line = sell * num(tr.querySelector('[data-f=price]').value);
      tr.querySelector('.line').textContent = fmt(line);
      total += line;
    });
    return total;
  }

  function buildCrew() {
    var cmdName = $('#payerName').value.trim();
    var crew = [{ name: cmdName || 'Commander', shares: COMMANDER_SHARES, cmd: true, roles: ['Commander'] }];
    var byKey = {};
    if (cmdName) byKey[cmdName.toLowerCase()] = crew[0];
    // A player in two seats (or the commander in a seat) is merged into one payout.
    function add(name, s, role) {
      var n = (name || '').trim();
      if (!n) return;
      var k = n.toLowerCase();
      if (byKey[k]) { byKey[k].shares += s; if (byKey[k].roles.indexOf(role) < 0) byKey[k].roles.push(role); return; }
      var m = { name: n, shares: s, cmd: false, roles: [role] };
      crew.push(m); byKey[k] = m;
    }
    var v = $('#vehicle').value;
    function seats(type, role) {
      document.querySelectorAll('[data-seat="' + type + '"]').forEach(function (i) { add(i.value, ROLE_SHARES[type], role); });
    }
    if (v === 'mole') seats('laser', 'Laser');
    else if (v === 'reclaimer') { seats('salvage', 'Salvage'); seats('boxjock', 'Box jock'); }
    else if (v === 'other') {
      document.querySelectorAll('#crewRows tr').forEach(function (tr) {
        add(tr.querySelector('[data-f=name]').value, num(tr.querySelector('[data-f=shares]').value), 'Crew');
      });
    }
    return crew;
  }

  function applyVehicle() {
    var v = $('#vehicle').value;
    $('#seatsMole').hidden = v !== 'mole';
    $('#seatsReclaimer').hidden = v !== 'reclaimer';
    $('#seatsOther').hidden = v !== 'other';
    $('#vehicleHint').hidden = !!v;
    $('#panelMining').hidden = v === 'reclaimer';
    $('#panelSalvage').hidden = v === 'mole';
    try { localStorage.setItem('vanguardVehicle', v); } catch (e) {}
  }

  function recalc() {
    scuIn = 0; scuOut = 0;
    var mining = $('#panelMining').hidden ? 0 : sumTable('miningRows');
    var salvage = $('#panelSalvage').hidden ? 0 : sumTable('salvageRows');
    var gross = mining + salvage;
    var otherCosts = gross * FUEL_PCT / 100;
    $('#otherCosts').value = fmt(otherCosts);
    var expenses = num($('#refineFee').value) + otherCosts;
    var net = gross - expenses;
    var pct = Math.min(100, num($('#orgCut').value));
    var orgCut = Math.max(0, net) * pct / 100;
    var dist = Math.max(0, net - orgCut);

    var crew = buildCrew(), shares = 0;
    crew.forEach(function (m) { shares += m.shares; });
    crew.forEach(function (c) { c.amount = shares > 0 ? dist * c.shares / shares : 0; });
    last.crew = crew;

    $('#rScu').textContent = fmtScu(scuOut) + ' of ' + fmtScu(scuIn) + ' SCU';
    $('#rMining').textContent = fmt(mining);
    $('#rSalvage').textContent = fmt(salvage);
    $('#rGross').textContent = fmt(gross);
    $('#rExpenses').textContent = fmt(expenses);
    $('#rNet').textContent = fmt(net);
    $('#rOrg').textContent = fmt(orgCut);
    $('#rDist').textContent = fmt(dist);
    $('#rWarn').textContent = net < 0 ? 'Expenses are higher than income, so there is nothing to pay out.' : '';

    var ul = $('#crewResults');
    ul.innerHTML = '';
    crew.forEach(function (c) {
      if (c.cmd) return; // commander's share is not shown
      var li = document.createElement('li');
      var a = document.createElement('span'), b = document.createElement('strong');
      a.textContent = c.name + ' (' + c.roles.join(', ') + ', ' + c.shares + ' ' + (c.shares === 1 ? 'share' : 'shares') + ')';
      b.textContent = fmt(c.amount) + ' aUEC';
      li.appendChild(a); li.appendChild(b); ul.appendChild(li);
    });
  }

  function savePayouts() {
    var msg = $('#saveMsg');
    var rows = last.crew.filter(function (c) { return Math.round(c.amount) > 0; });
    if (!rows.length) { msg.textContent = 'Nothing to save yet. Enter your haul and add crew with at least one share.'; return; }
    var vehicle = $('#vehicle').value;
    if (!vehicle) { msg.textContent = 'Choose what vehicle you are using first.'; $('#vehicle').focus(); return; }
    var payer = $('#payerName').value.trim();
    if (!payer) { msg.textContent = 'Enter your own username first so players know who to go to for payment.'; $('#payerName').focus(); return; }
    try { localStorage.setItem('vanguardPayer', payer); } catch (e) {}
    var op = $('#opName').value.trim() || 'Mining and salvage run';
    var date = $('#opDate').value || new Date().toISOString().slice(0, 10);
    try {
      var list = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (!Array.isArray(list)) list = [];
      rows.forEach(function (c) {
        list.push({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
          date: date, player: c.name, payer: payer, commander: !!c.cmd, vehicle: VEHICLE_NAMES[vehicle], role: c.roles.join(', '), op: op, division: 'Logistics',
          amount: Math.round(c.amount), paid: false
        });
      });
      localStorage.setItem(KEY, JSON.stringify(list));
      msg.textContent = 'Saved ' + rows.length + ' payouts as owed. Open the payouts page to mark them paid.';
    } catch (e) {
      msg.textContent = 'This browser blocked saving. Check that site storage is allowed, then try again.';
    }
  }

  function reset() {
    ['miningRows', 'salvageRows', 'crewRows'].forEach(function (id) { $('#' + id).innerHTML = ''; });
    ['refineFee', 'opName'].forEach(function (id) { $('#' + id).value = ''; });
    $('#orgCut').value = '10';
    addMaterial('miningRows', 'oreList'); addMaterial('salvageRows', 'salvageList');
    addCrew('', 1); addCrew('', 1);
    document.querySelectorAll('[data-seat]').forEach(function (i) { i.value = ''; });
    $('#saveMsg').textContent = '';
    recalc();
  }

  var root = $('#calculator');
  if (!root) return;
  // Rows add themselves as you type, so there is no need to click Add.
  function autoGrow(t) {
    var tr = t.closest && t.closest('tr');
    if (!tr) return;
    var body = tr.parentElement;
    if (!body || tr !== body.lastElementChild) return;
    if (body.id === 'crewRows') { if (tr.querySelector('[data-f=name]').value.trim()) addCrew('', 1); return; }
    if (body.id === 'miningRows' || body.id === 'salvageRows') {
      var any = Array.prototype.some.call(tr.querySelectorAll('input'), function (i) { return i.value.trim() !== ''; });
      if (any) addMaterial(body.id, body.id === 'miningRows' ? 'oreList' : 'salvageList');
    }
  }
  // Empty rows tidy themselves up when you move on.
  root.addEventListener('focusout', function (e) {
    var tr = e.target.closest && e.target.closest('tr');
    if (!tr) return;
    setTimeout(function () {
      var body = tr.parentElement;
      if (!body || !tr.isConnected || tr === body.lastElementChild || tr.contains(document.activeElement)) return;
      var empty = body.id === 'crewRows'
        ? !tr.querySelector('[data-f=name]').value.trim()
        : Array.prototype.every.call(tr.querySelectorAll('input'), function (i) { return i.value.trim() === ''; });
      if (empty) { tr.remove(); recalc(); }
    }, 0);
  });
  // Enter jumps to the next box, like Tab.
  root.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    var t = e.target;
    if (t.tagName !== 'INPUT' || t.type === 'checkbox') return;
    var all = Array.prototype.filter.call(root.querySelectorAll('input'), function (i) { return !i.readOnly && !i.disabled && i.offsetParent !== null; });
    var i = all.indexOf(t);
    if (i < 0 || !all[i + 1]) return;
    e.preventDefault();
    all[i + 1].focus();
    if (all[i + 1].select) all[i + 1].select();
  });
  root.addEventListener('input', function (e) {
    var t = e.target;
    autoGrow(t);
    if (t.matches && t.matches('[data-f=name]')) {
      var a = t.closest('tr').querySelector('[data-lookup]');
      if (a) a.href = lookupUrl(t.value);
    }
    recalc();
  });
  root.addEventListener('click', function (e) {
    var t = e.target;
    if (t.hasAttribute('data-rm')) { t.closest('tr').remove(); recalc(); }
  });
  $('#addOre').addEventListener('click', function () { addMaterial('miningRows', 'oreList'); });
  $('#addSalvage').addEventListener('click', function () { addMaterial('salvageRows', 'salvageList'); });
  $('#vehicle').addEventListener('change', function () { applyVehicle(); recalc(); });
  $('#addCrew').addEventListener('click', function () { addCrew('', 1); recalc(); });
  $('#savePayouts').addEventListener('click', savePayouts);
  $('#resetCalc').addEventListener('click', reset);
  $('#opDate').value = new Date().toISOString().slice(0, 10);
  try { $('#payerName').value = localStorage.getItem('vanguardPayer') || ''; } catch (e) {}
  try { var sv = localStorage.getItem('vanguardVehicle'); if (sv) $('#vehicle').value = sv; } catch (e) {}
  applyVehicle();
  reset();
  // The signed-in username is the commander / payer, so it cannot be typed over.
  function applyUser(u) { var el = $('#payerName'); el.value = u; el.readOnly = true; recalc(); }
  window.addEventListener('vanguard-auth', function (e) { applyUser(e.detail.username); });
  if (window.vanguardUser) applyUser(window.vanguardUser);
})();
