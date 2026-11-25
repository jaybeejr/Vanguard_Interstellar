/* Shows the ships members have in their hangars on a division page.
   One row per ship; if several people own it, their names are listed together on that row. */
(function () {
  'use strict';
  var box = document.getElementById('fleetBox');
  if (!box) return;
  var API = String((window.VANGUARD_CONFIG && window.VANGUARD_CONFIG.verifyApi) || '').replace(/\/+$/, '');
  var division = box.getAttribute('data-division');
  var section = box.closest('section');

  function note(text) { box.innerHTML = ''; var p = document.createElement('p'); p.className = 'note'; p.textContent = text; box.appendChild(p); }

  // Without the Discord bot there is nowhere shared to read ships from, so the section stays hidden.
  if (!API) { if (section) section.hidden = true; return; }
  note('Loading ships...');

  fetch(API + '/api/hangars')
    .then(function (r) { return r.json(); })
    .then(function (res) {
      var rows = res && res.ok && res.divisions && res.divisions[division];
      if (!rows) { note('Ships could not be loaded right now.'); return; }
      if (!rows.length) { note('No ships listed yet. Members add theirs in My Hangar and choose ' + division + '.'); return; }
      var ul = document.createElement('ul'); ul.className = 'list';
      rows.forEach(function (row) {
        var li = document.createElement('li');
        var s = document.createElement('strong'); s.textContent = row.ship;
        li.appendChild(s);
        li.appendChild(document.createTextNode(row.players.join(', ')));
        ul.appendChild(li);
      });
      box.innerHTML = ''; box.appendChild(ul);
    })
    .catch(function () { note('Ships could not be loaded right now.'); });
})();
