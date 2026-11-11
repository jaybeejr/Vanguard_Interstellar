/* "My Hangar": ships saved to the signed-in account (stored in this browser). */
(function () {
  'use strict';
  var KEY = 'vanguardHangars', MAX = 100;
  var $ = function (s) { return document.querySelector(s); };
  var user = null;

  function readAll() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return {}; }
  }
  function mine() { var a = readAll()[user.toLowerCase()]; return Array.isArray(a) ? a : []; }
  function say(t) { $('#msg').textContent = t; }
  function save(list) {
    var all = readAll(); all[user.toLowerCase()] = list;
    try { localStorage.setItem(KEY, JSON.stringify(all)); return true; }
    catch (e) { say('This browser blocked saving. Allow site storage for this page and try again.'); return false; }
  }
  function cell(tr, text) { var c = document.createElement('td'); c.textContent = text; tr.appendChild(c); }

  function render() {
    var list = mine(), body = $('#ships');
    body.innerHTML = '';
    list.forEach(function (s) {
      var tr = document.createElement('tr');
      cell(tr, s.ship); cell(tr, s.nick || ''); cell(tr, s.division || ''); cell(tr, s.notes || '');
      var act = document.createElement('td');
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'btn small'; b.textContent = 'Remove';
      b.addEventListener('click', function () {
        if (!confirm('Remove ' + s.ship + ' from your hangar?')) return;
        if (save(mine().filter(function (x) { return x.id !== s.id; }))) { render(); say('Removed ' + s.ship + '.'); }
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
    var list = mine();
    if (list.length >= MAX) { say('Your hangar is full (' + MAX + ' ships).'); return; }
    list.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      ship: ship, nick: $('#nick').value.trim(), division: $('#div').value, notes: $('#notes').value.trim(), added: Date.now()
    });
    if (!save(list)) return;
    say('Added ' + ship + ' to your hangar.');
    $('#ship').value = ''; $('#nick').value = ''; $('#notes').value = ''; $('#div').value = '';
    render(); $('#ship').focus();
  });

  function start(u) {
    user = u;
    $('#hangarIntro').textContent = 'The ships on ' + u + '\u2019s account.';
    render();
  }
  window.addEventListener('vanguard-auth', function (e) { start(e.detail.username); });
  if (window.vanguardUser) start(window.vanguardUser);
})();
