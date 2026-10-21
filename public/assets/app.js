/* Falcon G3101 OTC/P on Caterkwik — page behaviour, plus Kit, the product
   expert. Chat pacing and nudge rules are the ones from services/ea-demo:
   a humanised pause before the dots, a nudge only for an engaged visitor,
   and at most one panel-opening interruption per visit. */
(function () {
  'use strict';

  var VAT = 1.2;
  var BASE = 3097.99, WAS = 7355.00;   // both ex VAT
  var mode = 'ex';                     // 'ex' | 'inc'
  var fuel = 'lpg';                    // 'lpg' | 'natural'
  var phase = 'single';                // 'single' | 'three'
  var qty = 1;
  var chosen = {};                     // id -> {name, price}

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var money = function (n) { return '£' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  var round = function (n) { return '£' + Math.round(n).toLocaleString('en-GB'); };
  var show = function (n) { return mode === 'inc' ? n * VAT : n; };
  var suffix = function () { return mode === 'inc' ? 'inc VAT' : 'ex VAT'; };

  /* ---------- prices ---------- */
  function paintPrices() {
    $('[data-price]').textContent = money(show(BASE));
    $('[data-was]').textContent = money(show(WAS));
    $('[data-saving]').textContent = 'Save ' + money(show(WAS - BASE));
    $('[data-vatnote]').innerHTML = mode === 'ex'
      ? '<b>Excluding VAT.</b> ' + money(BASE * VAT) + ' including VAT at 20%. RRP ' + money(WAS) + ' ex VAT.'
      : '<b>Including VAT at 20%.</b> ' + money(BASE) + ' excluding VAT, which is how Caterkwik shows prices by default.';
    $('[data-iwoca]').textContent = money(BASE * VAT / 3);
    $$('.acccard').forEach(function (c) {
      c.querySelector('[data-accprice]').textContent = '+ ' + money(show(parseFloat(c.dataset.price)));
    });
    $$('[data-alt]').forEach(function (el) {
      el.childNodes[0].nodeValue = money(show(parseFloat(el.dataset.alt))) + ' ';
    });
    $$('[data-altnote]').forEach(function (el) { el.textContent = suffix(); });
    paintOrder();
  }

  function paintOrder() {
    var lines = $('#lines'); lines.innerHTML = '';
    var total = show(BASE) * qty;
    var row = function (name, value, id) {
      var d = document.createElement('div');
      d.style.cssText = 'display:flex;justify-content:space-between;gap:14px;align-items:center';
      d.innerHTML = '<span class="muted">' + name + ' × ' + qty + '</span><span style="font-weight:700">' + value + '</span>';
      if (id) {
        var x = document.createElement('button');
        x.type = 'button'; x.textContent = '✕';
        x.style.cssText = 'border:0;background:transparent;color:var(--ink-40);cursor:pointer;margin-left:6px';
        x.setAttribute('aria-label', 'Remove ' + name);
        x.addEventListener('click', function () { toggleAcc(id, false); });
        d.lastChild.appendChild(x);
      }
      lines.appendChild(d);
    };
    row('G3101 OTC/' + (fuel === 'lpg' ? 'P' : 'N') + ', ' + (phase === 'single' ? 'single phase' : '3 phase'), money(show(BASE) * qty));
    var names = [];
    Object.keys(chosen).forEach(function (id) {
      var p = show(chosen[id].price) * qty; total += p;
      names.push(chosen[id].name);
      row(chosen[id].name, money(p), id);
    });
    $('#total').textContent = money(total);
    $('#total-note').textContent = suffix();
    $('#qty').textContent = qty;

    $('#bar-total').textContent = money(total);
    $('#bar-note').textContent = suffix();
    $('#bar-fuel').textContent = fuel === 'lpg' ? 'Propane' : 'Natural gas';
    $('#bar-phase').textContent = phase === 'single' ? 'single phase' : '3 phase';
    $('#bar-extras').textContent = names.length
      ? names.length + ' accessor' + (names.length === 1 ? 'y' : 'ies') + ': ' + names.join(', ')
      : 'No accessories added';
  }

  $$('.vatswitch button').forEach(function (b) {
    b.addEventListener('click', function () {
      mode = b.dataset.vat;
      $$('.vatswitch button').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      paintPrices();
    });
  });

  /* ---------- fuel + phase ---------- */
  function paintPicker() {
    $$('[data-fuel]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.fuel === fuel)); });
    $$('[data-phase]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.phase === phase)); });
    var out = $('#pickout');
    out.className = 'pickout';
    if (fuel === 'lpg' && phase === 'single') {
      out.innerHTML = 'You are on the right model: <b>G3101 OTC/P</b>, propane. Single phase needs one <b>hardwired 30A way</b> for the 6.5 kW oven. There is no plug.';
    } else if (fuel === 'lpg') {
      out.innerHTML = 'You are on the right model: <b>G3101 OTC/P</b>, propane. On three phase the oven draws <b>L1 14.3A, L2 13.9A</b> and L3 is not used. Hardwired either way.';
    } else {
      out.className = 'pickout swap';
      out.innerHTML = 'Mains gas means a different model: you want the <b>G3101 OTC/N</b>, the natural gas version, same range at the same price. We have switched the page over for you.';
    }
    paintOrder();
    paintChecker();
  }
  $$('[data-fuel]').forEach(function (b) {
    b.addEventListener('click', function () {
      fuel = b.dataset.fuel;
      setView(fuel === 'natural' ? 'natural' : 'product');
      if ($('#q-gas').value !== fuel) $('#q-gas').value = fuel;
      paintPicker();
    });
  });
  $$('[data-phase]').forEach(function (b) {
    b.addEventListener('click', function () { phase = b.dataset.phase; paintPicker(); });
  });

  /* ---------- gallery ---------- */
  var VIEWS = {
    product: '/assets/img/g3101-otc-p.jpg',
    burner: '/assets/img/g3101-otc-p-2.jpg',
    natural: '/assets/img/g3101-otc-n.jpg',
    dims: null
  };
  function setView(view) {
    var stage = $('#stage'), img = $('#hero-img');
    stage.classList.toggle('dims', view === 'dims');
    if (VIEWS[view]) {
      img.style.opacity = '0';
      setTimeout(function () { img.src = VIEWS[view]; img.style.opacity = '1'; }, 120);
    }
    $$('.thumbs button').forEach(function (t) { t.setAttribute('aria-pressed', String(t.dataset.mode === view)); });
    $$('.modes button').forEach(function (m) { m.setAttribute('aria-pressed', String(m.dataset.mode === view)); });
  }
  $$('.thumbs button, .modes button').forEach(function (b) {
    b.addEventListener('click', function () {
      setView(b.dataset.mode);
      if (b.dataset.mode === 'natural' && fuel !== 'natural') { fuel = 'natural'; $('#q-gas').value = 'natural'; paintPicker(); }
    });
  });

  /* ---------- accessories ---------- */
  function toggleAcc(id, on) {
    var card = $('.acccard[data-acc="' + id + '"]');
    if (!card) return;
    if (on) chosen[id] = { name: card.dataset.name.replace(/&amp;/g, '&'), price: parseFloat(card.dataset.price) };
    else delete chosen[id];
    card.classList.toggle('on', !!on);
    card.querySelector('[data-add]').textContent = on ? 'Added ✓' : 'Add';
    paintOrder();
  }
  $$('.acccard').forEach(function (card) {
    card.querySelector('[data-add]').addEventListener('click', function () {
      toggleAcc(card.dataset.acc, !chosen[card.dataset.acc]);
    });
  });
  $('#clear-all').addEventListener('click', function () {
    Object.keys(chosen).forEach(function (id) { toggleAcc(id, false); });
    qty = 1; paintOrder();
  });
  $('#qty-up').addEventListener('click', function () { qty++; paintOrder(); });
  $('#qty-down').addEventListener('click', function () { qty = Math.max(1, qty - 1); paintOrder(); });
  function added(btn, label) {
    var was = btn.textContent; btn.textContent = label;
    setTimeout(function () { btn.textContent = was; }, 1800);
  }
  $('#add-basket').addEventListener('click', function () { added(this, 'Added to basket ✓'); });
  $('#bar-add').addEventListener('click', function () { added(this, 'Added ✓'); });
  $('#add-quote').addEventListener('click', function () { added(this, 'Added to your quote ✓'); });

  // The sticky bar appears once the buy button has scrolled away.
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      $('#configbar').classList.toggle('show', !entries[0].isIntersecting && entries[0].boundingClientRect.top < 0);
    }, { threshold: 0 });
    io.observe($('#add-basket'));
  }

  /* ---------- will it work in your kitchen ---------- */
  var WIDTH = 900, DEPTH = 857;
  function paintChecker() {
    var gas = $('#q-gas').value, elec = $('#q-elec').value, canopy = $('#q-canopy').value;
    var gap = parseInt($('#q-gap').value, 10) || 0, door = parseInt($('#q-door').value, 10) || 0;
    var rows = [];

    if (gas === 'lpg') rows.push(['ok', 'Gas supply', 'Propane is exactly what this model is built for. The 3/4" hose is not supplied, so we bring one.']);
    else if (gas === 'natural') rows.push(['no', 'Gas supply', 'On mains gas you need the G3101 OTC/N instead, the natural gas version of this range at the same price. Same everything else.']);
    else if (gas === 'none') rows.push(['no', 'Gas supply', 'There is no gas here yet. A 31.8 kW range needs a commercial supply sized for it, so that is a conversation before the appliance, not after.']);
    else rows.push(['warn', 'Gas supply', 'Worth confirming before you order: propane and natural gas are different models and cannot be swapped on site.']);

    if (elec === 'single') rows.push(['ok', 'Electrical supply', 'One spare 30A way is what the 6.5 kW oven needs, hardwired by an electrician. There is no plug on this range.']);
    else if (elec === 'three') rows.push(['ok', 'Electrical supply', 'Three phase is fine: the oven draws L1 14.3A and L2 13.9A, with L3 unused. Hardwired, same as single phase.']);
    else if (elec === 'single-full') rows.push(['warn', 'Electrical supply', 'A full board means board work before the range arrives. Our electricians can price that with the installation rather than leaving you to find someone.']);
    else rows.push(['warn', 'Electrical supply', 'We will check this on the survey. It needs either a 30A single phase way or a three phase connection, hardwired.']);

    if (canopy === 'yes') rows.push(['ok', 'Extraction', 'Good. We will still measure it: a 31.8 kW gas range wants the canopy to cover the whole cook line, not just the hob.']);
    else if (canopy === 'no') rows.push(['no', 'Extraction', 'A 31.8 kW gas range has to run under extraction. SmartVent canopies start at £2,031.99 ex VAT and our survey team sizes the right one.']);
    else rows.push(['warn', 'Extraction', 'We will size it on the survey. If it turns out to be short, SmartVent canopies start at £2,031.99 ex VAT.']);

    if (!gap || gap >= WIDTH + 50) rows.push(['ok', 'Space in the run', 'It is 900 mm wide and 857 mm deep, so ' + gap + ' mm leaves ' + (gap - WIDTH) + ' mm to play with. Add castors if you want to pull it out to clean.']);
    else if (gap >= WIDTH) rows.push(['warn', 'Space in the run', 'That is ' + (gap - WIDTH) + ' mm of clearance on a 900 mm range. It will go in, but it is a shuffle, and cleaning behind it means castors.']);
    else rows.push(['no', 'Space in the run', 'Too tight by ' + (WIDTH - gap) + ' mm. The range is 900 mm wide and does not come narrower, so the run needs rethinking or a different appliance.']);

    if (!door || door >= WIDTH) rows.push(['ok', 'Getting it in', '900 mm of doorway takes it straight through. It is 115 kg, 128 kg boxed, so it is a two person lift at least.']);
    else if (door >= DEPTH) rows.push(['warn', 'Getting it in', 'At ' + door + ' mm it goes through turned, on its 857 mm depth, with the packaging off. Tell us and the crew comes prepared.']);
    else rows.push(['no', 'Getting it in', 'Nothing gets a 900 × 857 mm range through ' + door + ' mm. We would look at the route in on the survey before you order.']);

    rows.push(['warn', 'Delivery', 'Free delivery is kerbside for anything over 30 kg, and this is 128 kg boxed. Our own crew can bring it in, position it and take the packaging away.']);

    var list = $('#report-list'); list.innerHTML = '';
    rows.forEach(function (r) {
      var li = document.createElement('li');
      var mark = r[0] === 'ok' ? '✓' : r[0] === 'warn' ? '!' : '✕';
      li.innerHTML = '<span class="rmark ' + r[0] + '">' + mark + '</span><span><b>' + r[1] + '</b>' + r[2] + '</span>';
      list.appendChild(li);
    });
    var blockers = rows.filter(function (r) { return r[0] === 'no'; }).length;
    var checks = rows.filter(function (r) { return r[0] === 'warn'; }).length;
    $('#report-score').textContent = blockers
      ? blockers + ' thing' + (blockers === 1 ? '' : 's') + ' to sort out first'
      : checks + ' to confirm on the survey, nothing blocking';
  }
  ['#q-gas', '#q-elec', '#q-canopy', '#q-gap', '#q-door'].forEach(function (s) {
    $(s).addEventListener('input', function () {
      if (s === '#q-gas' && ($(s).value === 'lpg' || $(s).value === 'natural') && $(s).value !== fuel) {
        fuel = $(s).value; setView(fuel === 'natural' ? 'natural' : 'product'); paintPicker(); return;
      }
      paintChecker();
    });
  });

  /* ---------- running costs ---------- */
  var KW_BURNER = 5.3, KW_OVEN = 6.5;
  function paintCalc() {
    var burners = Math.max(0, Math.min(6, parseFloat($('#c-burners').value) || 0));
    var hours = Math.max(0, parseFloat($('#c-hours').value) || 0);
    var ovenHrs = Math.max(0, parseFloat($('#c-oven').value) || 0);
    var days = Math.max(0, Math.min(7, parseFloat($('#c-days').value) || 0));
    var pGas = (parseFloat($('#c-gas').value) || 0) / 100;
    var pElec = (parseFloat($('#c-elec').value) || 0) / 100;

    var gasDay = burners * KW_BURNER * hours * pGas;
    var elecDay = KW_OVEN * ovenHrs * pElec;
    var day = gasDay + elecDay;

    $('#c-week').textContent = money(day * days);
    $('#c-day').textContent = money(day);
    $('#c-year').textContent = round(day * days * 52);
    $('#c-gastotal').textContent = money(gasDay * days);
    $('#c-electotal').textContent = money(elecDay * days);
    $('#c-note').textContent = 'Based on ' + burners + ' burner' + (burners === 1 ? '' : 's') + ' at 5.3 kW for '
      + hours + ' hour' + (hours === 1 ? '' : 's') + ' (' + (burners * KW_BURNER).toFixed(1) + ' kW of gas) and a 6.5 kW oven for '
      + ovenHrs + ' hour' + (ovenHrs === 1 ? '' : 's') + ', at full output. Real use is lower, because burners get turned down.';
  }
  ['#c-burners', '#c-hours', '#c-oven', '#c-days', '#c-gas', '#c-elec'].forEach(function (s) {
    $(s).addEventListener('input', paintCalc);
  });

  /* ---------- info nav highlight ---------- */
  if ('IntersectionObserver' in window) {
    var navIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        $$('.infonav a').forEach(function (a) { a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id); });
      });
    }, { rootMargin: '-110px 0px -70% 0px' });
    $$('.belowfold section[id]').forEach(function (s) { navIo.observe(s); });
  }

  /* Kit lives in chat.js, loaded after this file. */

  /* ---------- go ---------- */
  paintPrices(); paintPicker(); paintCalc();
})();
