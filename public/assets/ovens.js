/* Caterkwik ovens demo — the category page's behaviour. The verdict, the fit
   check and the running cost all come from CK_OVENS (ovens-core.js), the same
   file render-six-burner.js used to print the server-side verdict, so the two
   cannot disagree. */
(function () {
  'use strict';
  var D = JSON.parse(document.getElementById('ck-ovens-data').textContent);
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var money = function (n) { return '£' + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  var money0 = function (n) { return '£' + Math.round(n).toLocaleString('en-GB'); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); };
  var byCode = {}; D.products.forEach(function (p) { byCode[p.code] = p; });

  /* ---------- VAT switch (same contract as the product page) ---------- */
  var vat = 'ex';
  $$('.vatswitch button').forEach(function (b) {
    b.addEventListener('click', function () {
      vat = b.dataset.vat;
      $$('.vatswitch button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      document.body.classList.toggle('showinc', vat === 'inc');
    });
  });

  /* ---------- running cost ---------- */
  function use() {
    return {
      burners: +$('#c-burners').value || 0, hours: +$('#c-hours').value || 0,
      ovenHours: +$('#c-oven').value || 0, days: +$('#c-days').value || 0,
      gas: +$('#c-gas').value || 0, elec: +$('#c-elec').value || 0,
    };
  }
  function paintCosts() {
    var u = use();
    $$('.ocard').forEach(function (el) {
      var p = byCode[el.dataset.code]; if (!p) return;
      var c = CK_OVENS.annualCost(p, u), node = $('.cost', el);
      if (!node) return;
      if (!c.known) { node.className = 'cost none'; node.textContent = 'Running cost not published'; return; }
      node.className = 'cost'; node.dataset.year = c.year.toFixed(2);
      node.innerHTML = '<b>' + money0(c.year) + '</b> a year to run'
        + (c.estimated ? ' <abbr title="Mixed burner sizes; derived from the published hob total">estimated</abbr>' : '');
    });
    if ($('#sort').value === 'cost') apply();
  }
  ['#c-burners', '#c-hours', '#c-oven', '#c-days', '#c-gas', '#c-elec'].forEach(function (s) {
    var el = $(s); if (el) el.addEventListener('input', paintCosts);
  });

  /* ---------- finder ---------- */
  var pick = {};
  Object.keys(D.finder.example).forEach(function (k) { pick[k] = D.finder.example[k]; });

  function cardHtml(p) {
    var d = D.sizes[p.image.replace(/\.jpg$/, '')] || { w: 370, h: 370 };
    var price = p.stock === 'in-stock'
      ? '<p class="price"><b class="ex">' + money(p.priceEx) + '</b><span class="inc">' + money(p.priceInc) + ' inc. VAT</span></p>'
      : '<p class="price"><span class="nostock">' + (p.stock === 'poa' ? 'Price on application' : 'Discontinued') + '</span></p>';
    var c = CK_OVENS.annualCost(p, use());
    return '<article class="ocard mini">'
      + '<a class="shot" href="' + esc(p.url) + '"><img class="photo" src="/assets/img/ovens/'
      + p.image.replace(/\.jpg$/, '.webp') + '" width="' + d.w + '" height="' + d.h + '" alt="' + esc(p.name) + '"></a>'
      + '<h3><a href="' + esc(p.url) + '">' + esc(p.name) + '</a></h3>'
      + '<p class="spec">' + esc(p.fuel.map(function (f) { return CK_OVENS.FUEL_LABEL[f]; }).join(' or '))
      + (p.width ? ' · ' + p.width + ' mm' : '') + (p.kwTotal ? ' · ' + p.kwTotal + ' kW' : '') + '</p>'
      + price
      + (c.known ? '<p class="cost"><b>' + money0(c.year) + '</b> a year to run</p>' : '<p class="cost none">Running cost not published</p>')
      + '</article>';
  }

  function ruledOutHtml(r) {
    if (!r.ruledOut.length) return '';
    return '<details class="ruledout"><summary>Why we ruled out the other ' + r.ruledOut.length + '</summary><ul>'
      + r.ruledOut.map(function (x) { return '<li><b>' + esc(x.product.name) + '</b> — ' + esc(x.reason) + '</li>'; }).join('')
      + '</ul></details>';
  }

  function verdictHtml(r) {
    if (!r.complete) return '<p class="muted">Pick all three and we will name what fits.</p>';
    if (!r.matches.length) return '<p class="vnone">' + esc(r.note) + '</p>' + ruledOutHtml(r);
    var top = r.matches.slice(0, 3).map(cardHtml).join('');
    var c = r.matches[0];
    return '<p class="vcount"><b>' + r.matches.length + '</b> of these ' + D.products.length
      + ' match. The cheapest is the <b>' + esc(c.name) + '</b> at <b>' + money(c.priceEx) + '</b> ex VAT.</p>'
      + '<div class="vcards">' + top + '</div>'
      + (r.matches.length > 3 ? '<p class="vmore"><button type="button" class="linkbtn" data-showall>Show all '
        + r.matches.length + ' in the grid below</button></p>' : '')
      + '<p class="vask"><button type="button" class="linkbtn" data-askkit>Ask Kit about these instead</button></p>'
      + ruledOutHtml(r);
  }

  var lastMatch = null;
  function paintVerdict() {
    lastMatch = CK_OVENS.matchSixBurner(pick, D.products);
    $('#fverdict').innerHTML = verdictHtml(lastMatch);
    paintFit();
  }

  $$('.fstep').forEach(function (fs) {
    fs.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-val]'); if (!b) return;
      pick[fs.dataset.step] = b.dataset.val;
      $$('button', fs).forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); });
      paintVerdict();
    });
  });

  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-askkit]') && window.CK_CHAT_API) {
      var L = function (list, v) { var o = list.filter(function (x) { return x.value === v; })[0]; return o ? o.label.toLowerCase() : v; };
      return CK_CHAT_API.ask('I have ' + L(D.finder.supplies, pick.supply) + ', a gap ' + L(D.finder.gaps, pick.gap).toLowerCase()
        + ', and the oven is for ' + L(D.finder.uses, pick.use) + '. Which of these ranges would you pick, and why?');
    }
    if (!e.target.closest('[data-showall]')) return;
    // Push the verdict into the filters so the grid shows the same set.
    setFacet('fuel', [pick.supply]);
    setFacet('widthBand', pick.gap === '900' ? ['900'] : pick.gap === '1200' ? ['900', '1200'] : ['900', '1200', '1500']);
    if (pick.use === 'heavy') setFacet('duty', ['heavy']); else setFacet('ovenType', [pick.use]);
    apply();
    $('#facets').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* ---------- will it fit ---------- */
  function site() {
    return { gap: +$('#fit-gap').value || 0, ceiling: +$('#fit-ceiling').value || 0, doorway: +$('#fit-door').value || 0 };
  }
  function drawing(p, s) {
    // True scale: the gap is the frame, the range is drawn inside it.
    var W = 420, H = 260, pad = 26;
    var maxW = Math.max(s.gap, p.width) * 1.06;
    var maxH = Math.max(s.ceiling, p.splashbackHeight || p.height || 900);
    var sx = (W - pad * 2) / maxW, sy = (H - pad * 2) / maxH, k = Math.min(sx, sy);
    var gx = pad, gy = H - pad;
    var rw = p.width * k, rh = (p.height || 900) * k;
    var gw = s.gap * k;
    var sb = p.splashbackHeight ? p.splashbackHeight * k : null;
    var ch = s.ceiling * k;
    return '<svg class="draw" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(p.name)
      + ' drawn to scale in a ' + s.gap + ' mm gap">'
      + '<line x1="' + gx + '" y1="' + (gy - ch) + '" x2="' + (gx + gw + 30) + '" y2="' + (gy - ch)
      + '" class="ceil"/><text x="' + (gx + gw + 34) + '" y="' + (gy - ch + 4) + '" class="dim">ceiling ' + s.ceiling + '</text>'
      + '<line x1="' + gx + '" y1="' + gy + '" x2="' + (gx + gw) + '" y2="' + gy + '" class="gapline"/>'
      + '<text x="' + gx + '" y="' + (gy + 16) + '" class="dim">gap ' + s.gap + ' mm</text>'
      + '<rect x="' + gx + '" y="' + (gy - rh) + '" width="' + rw + '" height="' + rh + '" class="range"/>'
      + (sb ? '<line x1="' + gx + '" y1="' + (gy - sb) + '" x2="' + (gx + rw) + '" y2="' + (gy - sb)
        + '" class="splash"/><text x="' + (gx + rw + 6) + '" y="' + (gy - sb + 4) + '" class="dim">splashback ' + p.splashbackHeight + '</text>' : '')
      + '<text x="' + (gx + 6) + '" y="' + (gy - rh - 6) + '" class="dim">' + p.width + ' × ' + (p.height || '?') + ' mm</text>'
      + '</svg>';
  }
  function paintFit() {
    var box = $('#fitresult'); if (!box) return;
    var s = site();
    var list = (lastMatch && lastMatch.complete && lastMatch.matches.length ? lastMatch.matches : D.products.filter(function (p) { return p.stock === 'in-stock'; })).slice(0, 4);
    box.innerHTML = list.map(function (p) {
      var f = CK_OVENS.fit(p, s);
      var lines = f.blockers.map(function (t) { return '<li class="bad">' + esc(t) + '</li>'; })
        .concat(f.warnings.map(function (t) { return '<li class="warn">' + esc(t) + '</li>'; }))
        .concat(f.unknown.map(function (t) { return '<li class="unk">' + esc(t) + '</li>'; }));
      return '<div class="fitrow' + (f.ok ? '' : ' blocked') + '">'
        + '<div class="fittext"><h3>' + esc(p.name) + '</h3>'
        + '<p class="verdictline">' + (f.ok ? 'Fits your gap' : 'Will not fit') + '</p>'
        + (lines.length ? '<ul>' + lines.join('') + '</ul>' : '<ul><li class="ok">Nothing in the way.</li></ul>')
        + '</div>' + drawing(p, s) + '</div>';
    }).join('');
  }
  ['#fit-gap', '#fit-ceiling', '#fit-door'].forEach(function (s) {
    var el = $(s); if (el) el.addEventListener('input', paintFit);
  });

  /* ---------- filters, sort, grid ---------- */
  function state() {
    var st = {};
    $$('.facet').forEach(function (f) {
      var on = $$('input:checked', f).map(function (i) { return i.value; });
      if (on.length) st[f.dataset.key] = on;
    });
    return st;
  }
  function setFacet(key, vals) {
    var f = $('.facet[data-key="' + key + '"]'); if (!f) return;
    $$('input', f).forEach(function (i) { i.checked = vals.indexOf(i.value) > -1; });
  }
  var KEY = { fuel: 'fuel', widthBand: 'widthband', ovenType: 'oventype', duty: 'duty', castors: 'castors', brand: 'brand', stock: 'stock' };

  function matches(el, st) {
    return Object.keys(st).every(function (k) {
      var v = (el.dataset[KEY[k]] || '');
      if (k === 'fuel') return st[k].some(function (x) { return v.split(' ').indexOf(x) > -1; });
      return st[k].indexOf(v) > -1;
    });
  }

  function apply() {
    var st = state(), u = use(), sort = $('#sort').value;
    var cards = $$('.ocard', $('#ogrid'));
    var shown = 0;
    cards.forEach(function (el) {
      var ok = matches(el, st);
      el.hidden = !ok; if (ok) shown++;
    });
    $('#count').innerHTML = '<b>' + shown + '</b> range' + (shown === 1 ? '' : 's');
    $('#noresults').hidden = shown > 0;

    var vis = cards.filter(function (el) { return !el.hidden; });
    vis.sort(function (a, b) {
      var pa = byCode[a.dataset.code], pb = byCode[b.dataset.code];
      if (sort === 'brand') return pa.brand.localeCompare(pb.brand) || (pa.priceEx || 0) - (pb.priceEx || 0);
      if (sort === 'lease') return (pa.leaseWeek || 1e9) - (pb.leaseWeek || 1e9);
      if (sort === 'cost') {
        var ca = CK_OVENS.annualCost(pa, u), cb = CK_OVENS.annualCost(pb, u);
        if (!ca.known && !cb.known) return 0;
        if (!ca.known) return 1; if (!cb.known) return -1;
        return ca.year - cb.year;
      }
      var x = (pa.priceEx == null ? 1e9 : pa.priceEx), y = (pb.priceEx == null ? 1e9 : pb.priceEx);
      return sort === 'price-desc' ? y - x : x - y;
    });
    var g = $('#ogrid');
    vis.forEach(function (el) { g.appendChild(el); });

    // Counts per option, against everything else currently selected.
    $$('.facet').forEach(function (f) {
      $$('input', f).forEach(function (i) {
        var probe = {}; Object.keys(st).forEach(function (k) { if (k !== f.dataset.key) probe[k] = st[k]; });
        probe[f.dataset.key] = [i.value];
        var n = cards.filter(function (el) { return matches(el, probe); }).length;
        var tag = $('.n[data-count="' + i.value + '"]', f);
        if (tag) tag.textContent = n ? n : '0';
        i.parentNode.classList.toggle('zero', n === 0);
      });
    });

    hash(st, sort);
  }

  function hash(st, sort) {
    var parts = Object.keys(st).map(function (k) { return k + '=' + st[k].join(','); });
    if (sort && sort !== 'price') parts.push('sort=' + sort);
    var h = parts.join('&');
    history.replaceState(null, '', h ? '#' + h : location.pathname);
  }

  function readHash() {
    var h = location.hash.replace(/^#/, ''); if (!h) return;
    h.split('&').forEach(function (part) {
      var kv = part.split('='); if (kv.length !== 2) return;
      if (kv[0] === 'sort') { $('#sort').value = kv[1]; return; }
      var vals = kv[1].split(',');
      setFacet(kv[0], vals);
      // The fuel facet and the finder's supply step share the same tokens
      // (natural-gas / lpg / dual-fuel). A single fuel arriving in the URL —
      // as it does from the hub's "6 Burner Ovens" link once a supply is
      // picked there — also sets the finder, so the verdict panel above the
      // grid agrees with what the grid is actually showing, and "Ask Kit
      // about these instead" tells him the truth rather than the default.
      if (kv[0] === 'fuel' && vals.length === 1 && D.finder.supplies.some(function (s) { return s.value === vals[0]; })) {
        pick.supply = vals[0];
      }
    });
  }

  $$('.facet input').forEach(function (i) { i.addEventListener('change', apply); });
  $('#sort').addEventListener('change', apply);
  $('#clearall').addEventListener('click', function () {
    $$('.facet input').forEach(function (i) { i.checked = false; }); apply();
  });

  /* ---------- compare ---------- */
  var cmp = [];
  document.addEventListener('change', function (e) {
    var b = e.target.closest('input[data-cmp]'); if (!b) return;
    var code = b.dataset.cmp;
    if (b.checked) { if (cmp.length >= 3) { b.checked = false; return; } cmp.push(code); }
    else cmp = cmp.filter(function (c) { return c !== code; });
    $('#cmpn').textContent = cmp.length;
    $('#cmpbar').hidden = cmp.length === 0;
  });
  $('#cmpclear').addEventListener('click', function () {
    cmp = []; $$('input[data-cmp]').forEach(function (i) { i.checked = false; });
    $('#cmpbar').hidden = true; $('#cmppanel').hidden = true;
  });
  $('#cmpshow').addEventListener('click', function () {
    var ps = cmp.map(function (c) { return byCode[c]; });
    var u = use();
    var rows = [
      ['Price ex VAT', function (p) { return p.priceEx ? money(p.priceEx) : 'Not published'; }],
      ['Available in', function (p) { return p.fuel.map(function (f) { return CK_OVENS.FUEL_LABEL[f]; }).join(' or '); }],
      ['Width', function (p) { return p.width ? p.width + ' mm' : 'Not published'; }],
      ['Depth', function (p) { return p.depth ? p.depth + ' mm' : 'Not published'; }],
      ['Oven', function (p) { return p.oven ? (p.oven.type === 'convection' ? 'Fan assisted' : 'Static') + (p.oven.gn ? ', ' + p.oven.gn + ' GN' : '') : 'Not published'; }],
      ['Oven inside', function (p) { return p.oven && p.oven.w ? p.oven.w + ' × ' + p.oven.d + ' × ' + p.oven.h + ' mm' : 'Not published'; }],
      ['Total kW', function (p) { return p.kwTotal ? p.kwTotal + ' kW' : 'Not published'; }],
      ['Running cost a year', function (p) { var c = CK_OVENS.annualCost(p, u); return c.known ? money0(c.year) : 'Not published'; }],
      ['Warranty', function (p) { return p.warrantyYears ? p.warrantyYears + ' year' + (p.warrantyYears === 1 ? '' : 's') : 'Not published'; }],
    ];
    $('#cmppanel').innerHTML = '<table class="cmptable"><thead><tr><th></th>'
      + ps.map(function (p) { return '<th>' + esc(p.name) + '</th>'; }).join('') + '</tr></thead><tbody>'
      + rows.map(function (r) {
        return '<tr><th>' + r[0] + '</th>' + ps.map(function (p) {
          var v = r[1](p);
          return '<td' + (v === 'Not published' ? ' class="np"' : '') + '>' + esc(v) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
    $('#cmppanel').hidden = false;
    $('#cmppanel').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  /* ---------- go ---------- */
  readHash();
  $$('.fstep').forEach(function (fs) {
    var v = pick[fs.dataset.step];
    if (v == null) return;
    $$('button', fs).forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset.val === v)); });
  });
  apply();
  paintVerdict();
})();
