/* Hub page: the picture-led finder narrows the 23 type cards as you pick.
   No verdict panel — the grid is the answer, the way the TopAV projector
   finder narrows its list. State lives in the URL hash so a pick can be sent. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* VAT switch, same contract as the other pages */
  var bs = $$('.vatswitch button');
  bs.forEach(function (b) {
    b.addEventListener('click', function () {
      bs.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      document.body.classList.toggle('showinc', b.dataset.vat === 'inc');
    });
  });

  var D = JSON.parse(document.getElementById('ck-hub-data').textContent);
  var STEPS = ['cooking', 'supply', 'covers'];
  var pick = {};

  function paintTiles() {
    $$('.ftile').forEach(function (t) {
      t.setAttribute('aria-checked', String(pick[t.dataset.pick] === t.dataset.value));
    });
  }

  // A type shows if, for every step that has a pick, the type carries that
  // value. "Not decided yet" on supply is a pick of nothing.
  function apply() {
    var cards = $$('.tcard'), shown = 0;
    cards.forEach(function (c) {
      var ok = STEPS.every(function (k) {
        var v = pick[k];
        if (!v || v === 'any') return true;
        return (c.dataset[k] || '').split(' ').indexOf(v) > -1;
      });
      c.hidden = !ok; if (ok) shown++;
    });
    $('#fcount').innerHTML = '<b>' + shown + '</b> ' + (shown === 1 ? 'type' : 'types');
    $('#tnone').hidden = shown > 0;
    var any = STEPS.some(function (k) { return pick[k]; });
    $('#fclear').hidden = !any;
    $$('.chipbtn[data-chip]').forEach(function (b) {
      var set = JSON.parse(b.dataset.chip);
      b.setAttribute('aria-pressed', String(Object.keys(set).every(function (k) { return pick[k] === set[k]; })));
    });
    // Carry the supply pick into the rebuilt 6 Burner page, so hub to category
    // is one continuous answer: its fuel filter is already set on arrival.
    var FUEL = { gas: 'natural-gas', lpg: 'lpg' };
    $$('a[data-typelink="6-burner-range"]').forEach(function (a) {
      var base = a.getAttribute('href').split('#')[0];
      a.setAttribute('href', FUEL[pick.supply] ? base + '#fuel=' + FUEL[pick.supply] : base);
    });
    var h = STEPS.filter(function (k) { return pick[k]; }).map(function (k) { return k + '=' + pick[k]; }).join('&');
    history.replaceState(null, '', h ? '#' + h : location.pathname);
  }

  function choose(k, v) {
    pick[k] = pick[k] === v ? null : v;   // click again to unpick
    paintTiles(); apply();
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('.ftile');
    if (t) return choose(t.dataset.pick, t.dataset.value);
    var c = e.target.closest('.chipbtn[data-chip]');
    if (c) {
      var set = JSON.parse(c.dataset.chip);
      var on = c.getAttribute('aria-pressed') === 'true';
      Object.keys(set).forEach(function (k) { pick[k] = on ? null : set[k]; });
      paintTiles(); apply(); return;
    }
    if (e.target.closest('#fclear')) { pick = {}; paintTiles(); apply(); }
  });

  // "Not sure? Ask Kit": hand him the picks as a sentence.
  var LABEL = {};
  ['cookings', 'supplies', 'covers'].forEach(function (k) {
    (D.finder[k] || []).forEach(function (o) { LABEL[o.value] = o.label; });
  });
  $('#askkit').addEventListener('click', function () {
    if (!window.CK_CHAT_API) return;
    var bits = [];
    if (pick.cooking) bits.push('I cook ' + LABEL[pick.cooking].toLowerCase());
    if (pick.supply && pick.supply !== 'any') bits.push('on ' + LABEL[pick.supply].toLowerCase());
    if (pick.covers) bits.push('and do ' + LABEL[pick.covers].toLowerCase() + ' covers at my busiest');
    CK_CHAT_API.ask(bits.length ? bits.join(' ') + '. Which kind of oven do I need?' : 'Which kind of oven do I need? I am not sure where to start.');
  });

  // Restore a shared pick.
  location.hash.replace(/^#/, '').split('&').forEach(function (part) {
    var kv = part.split('='); if (kv.length === 2 && STEPS.indexOf(kv[0]) > -1) pick[kv[0]] = kv[1];
  });
  paintTiles(); apply();
})();
