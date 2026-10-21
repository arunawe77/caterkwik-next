/* Caterkwik ovens demo — the logic behind the finder, the fit check and the
   running cost, shared by the server and the browser. render.js requires this
   to print a worked verdict into the HTML, so a crawler or an answer engine
   sees a complete answer without running any script; public/ovens.js loads the
   same file to redraw as the visitor picks. One rule set, one sum: the two
   cannot disagree.

   Plain functions of data. No DOM, no globals except the UMD shim. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CK_OVENS = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var GAP_MM = { '900': 900, '1200': 1200, '1500': 99999 };

  function bandWidth(mm) {
    if (typeof mm !== 'number' || !(mm > 0)) return null;
    if (mm <= 900) return '900';
    if (mm <= 1200) return '1200';
    return '1500';
  }

  var FUEL_LABEL = {
    'natural-gas': 'natural gas', 'lpg': 'LPG', 'dual-fuel': 'dual fuel', 'electric': 'electric',
  };

  // Ruling a product out always carries a reason, and "we do not know" is a
  // different answer from "no". The page shows which, because a range whose
  // width nobody publishes is a question for the sales line, not a rejection.
  function assess(p, pick) {
    if (p.stock === 'discontinued') return 'Discontinued, so it is not offered as a match.';

    if (pick.supply) {
      if (!p.fuel || !p.fuel.length) return 'The fuel is not published for this range.';
      if (p.fuel.indexOf(pick.supply) === -1) {
        return 'Not available in ' + (FUEL_LABEL[pick.supply] || pick.supply) + '.';
      }
    }

    if (pick.gap) {
      if (typeof p.width !== 'number') return 'The width is not published for this range.';
      var max = GAP_MM[pick.gap] || 99999;
      if (p.width > max) {
        return p.width + ' mm wide, which will not fit a ' + max + ' mm gap.';
      }
    }

    if (pick.use === 'heavy') {
      if (p.duty === null) return 'The duty rating is not published for this range.';
      if (p.duty !== 'heavy') return 'A standard-duty range rather than a heavy-duty one.';
    } else if (pick.use) {
      if (!p.oven) return 'The oven type is not published for this range.';
      if (p.oven.type !== pick.use) {
        return p.oven.type === 'none'
          ? 'Hob only, with no oven.'
          : 'A ' + p.oven.type + ' oven rather than a ' + pick.use + ' one.';
      }
    }

    return null;
  }

  function matchSixBurner(pick, products) {
    var complete = !!(pick.supply && pick.gap && pick.use);
    if (!complete) return { complete: false, matches: [], ruledOut: [], note: null };

    var matches = [], ruledOut = [];
    for (var i = 0; i < products.length; i++) {
      var reason = assess(products[i], pick);
      if (reason) ruledOut.push({ product: products[i], reason: reason });
      else matches.push(products[i]);
    }
    matches.sort(function (a, b) { return (a.priceEx || 1e9) - (b.priceEx || 1e9); });

    var note = null;
    if (!matches.length) {
      // A dead end is still an answer. Say what the nearest thing is rather
      // than showing an empty grid.
      var wider = products.filter(function (p) {
        return p.stock !== 'discontinued' && p.fuel.indexOf(pick.supply) > -1
          && (pick.use === 'heavy' ? p.duty === 'heavy' : (p.oven && p.oven.type === pick.use));
      });
      note = wider.length
        ? 'Nothing in this category is that narrow. The nearest is the '
          + wider[0].name + ' at ' + wider[0].width + ' mm. Ask Kit and we will check the wider oven range.'
        : 'Nothing in this category matches all three. Every range is listed below with the reason it was ruled out, and Kit can check the rest of the oven range for you.';
    }
    return { complete: true, matches: matches, ruledOut: ruledOut, note: note };
  }

  // The site check, per range. A blocker means it cannot go in. A warning
  // means it goes in but something needs doing. Anything the manufacturer does
  // not publish is reported as unknown rather than assumed to be fine.
  function fit(p, site) {
    var blockers = [], warnings = [], unknown = [];

    if (typeof p.width !== 'number') {
      unknown.push('The width of this range is not published.');
    } else if (site.gap && p.width > site.gap) {
      blockers.push(p.width + ' mm wide, and your gap is ' + site.gap + ' mm.');
    } else if (site.gap && site.gap - p.width < 50) {
      warnings.push('Only ' + (site.gap - p.width) + ' mm to spare. Ranges want a little clearance each side.');
    }

    if (site.ceiling) {
      if (typeof p.splashbackHeight === 'number' && p.splashbackHeight > site.ceiling) {
        warnings.push('The splashback takes it to ' + p.splashbackHeight + ' mm, above your '
          + site.ceiling + ' mm ceiling. It can be ordered without one.');
      } else if (typeof p.height === 'number' && p.height > site.ceiling) {
        blockers.push(p.height + ' mm tall, and your ceiling is ' + site.ceiling + ' mm.');
      } else if (typeof p.height !== 'number') {
        unknown.push('The height of this range is not published.');
      }
    }

    if (site.doorway && typeof p.width === 'number' && p.width > site.doorway) {
      if (typeof p.heightNoLegs === 'number') {
        warnings.push('Wider than your ' + site.doorway + ' mm doorway. It goes through on its back at '
          + p.heightNoLegs + ' mm with the legs off.');
      } else {
        warnings.push('Wider than your ' + site.doorway
          + ' mm doorway, and the height without legs is not published. Ask before delivery.');
      }
    }

    if (typeof p.depthDoorOpen === 'number') {
      warnings.push('The oven door needs ' + p.depthDoorOpen + ' mm of clearance in front when open.');
    }

    return { ok: blockers.length === 0, blockers: blockers, warnings: warnings, unknown: unknown };
  }

  // Their product tiles carry an empty <div class="annual-running-cost-cat">
  // and the sort above the grid offers "Running Costs". This is the sum that
  // fills both. Burners at full output, which is the honest upper bound: real
  // use is lower because burners get turned down, and the page says so.
  function annualCost(p, use) {
    var perBurner = typeof p.kwPerBurner === 'number' ? p.kwPerBurner : null;
    // The Electrolux 900XP pair have mixed burner sizes and publish no single
    // per-burner figure, so fall back to a share of the published hob total
    // rather than refusing to cost them at all.
    if (perBurner === null && typeof p.kwTotal === 'number' && p.burners) {
      perBurner = p.kwTotal / p.burners;
    }
    if (perBurner === null) return { known: false, day: null, week: null, year: null };

    var gasDay = use.burners * perBurner * use.hours * (use.gas / 100);
    var elecDay = typeof p.kwElectric === 'number' ? p.kwElectric * use.ovenHours * (use.elec / 100) : 0;
    var day = gasDay + elecDay;
    return {
      known: true, day: day, week: day * use.days, year: day * use.days * 52,
      gasWeek: gasDay * use.days, elecWeek: elecDay * use.days,
      estimated: typeof p.kwPerBurner !== 'number',
    };
  }

  function byRunningCost(products, use) {
    return products.slice().sort(function (a, b) {
      var ca = annualCost(a, use), cb = annualCost(b, use);
      if (!ca.known && !cb.known) return 0;
      if (!ca.known) return 1;
      if (!cb.known) return -1;
      return ca.year - cb.year;
    });
  }

  return {
    bandWidth: bandWidth, assess: assess, matchSixBurner: matchSixBurner,
    fit: fit, annualCost: annualCost, byRunningCost: byRunningCost,
    FUEL_LABEL: FUEL_LABEL,
  };
}));
