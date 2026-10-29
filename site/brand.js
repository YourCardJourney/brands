/* One brand's deal board. products.json is written by tools/scrape.py every 90
   minutes; every price here is redone from the card picked in the deal bar. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var inr = BR.inr, esc = BR.esc;
  var SLUG = document.body.dataset.brand;
  var OFF_STEPS = [40, 50, 60, 70];
  var TYPE_ORDER = ["Cabin", "Check-in", "Sets", "Backpacks", "Totes & bags", "Messengers", "Wallets", "Travel kits"];

  var items = [], cards = [];
  var state = {
    card: "", types: [], sizes: [],
    off: null, offMode: "ge", top: 0, one: false, stock: true, sort: BR.load("sort", "save"), view: BR.load("view", "tiles")
  };

  // ---- the maths ----
  // Everything comes off the product page as Flipkart shows it: listed price,
  // the coupon, then the picked card's ₹ off.
  // Coupon = exactly what the product page shows (none = none), so the price
  // matches Flipkart's own "Buy at". SuperCoins (3x-10x, ₹300-1,000) vary by
  // account, so they are shown as an extra on top, never folded into the price.
  var SC_LO = 300, SC_HI = 1000;
  function cpn(p) { return p.coupon || 0; }
  function bankOff(p) { return state.card ? (p.banks[state.card] || 0) : 0; }
  function pay(p) { return p.listed - cpn(p) - bankOff(p); }
  function saved(p) { return p.mrp - pay(p); }
  function pct(p) { return p.mrp > 0 ? Math.max(0, Math.round(saved(p) / p.mrp * 100)) : 0; }

  // "≥ 50%" = 50% off and up; "= 50%" = the 50s band (50-59%), since an
  // exact whole percent would match almost nothing
  function offOk(p, n) { var v = pct(p); return state.offMode === "ge" ? v >= n : v >= n && v < n + 10; }

  function pool() {
    return items.filter(function (p) { return !state.stock || p.stock; });
  }
  function filtered() {
    return pool().filter(function (p) {
      if (state.types.length && state.types.indexOf(p.type) < 0) return false;
      if (state.sizes.length && state.sizes.indexOf(p.size) < 0) return false;
      if (state.off !== null && !offOk(p, state.off)) return false;
      return true;
    });
  }

  // ---- controls ----
  function press(seg, on) {
    seg.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", String(b === on)); });
  }

  function renderCards() {
    var counts = {};
    items.forEach(function (p) { Object.keys(p.banks).forEach(function (b) { counts[b] = (counts[b] || 0) + 1; }); });
    cards = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    // every visit opens on today's best card (it changes with the offers)
    var best = BR.bestCard(items);
    state.card = best;
    $("cardSeg").innerHTML = ['<button type="button" data-card="">None</button>'].concat(cards.map(function (c) {
      return '<button type="button" data-card="' + esc(c) + '"' + (c === best ? ' class="best" title="Biggest discount today"' : "") + ">" +
        (BR.BANKS[c] ? '<span class="bk">' + BR.BANKS[c] + "</span>" : "") + esc(c) + "</button>";
    })).join("");
    var on = $("cardSeg").querySelector('[data-card="' + state.card + '"]');
    press($("cardSeg"), on);
    // on a phone the bar scrolls inside itself; bring the picked card into view
    if (on) $("cardSeg").scrollLeft = Math.max(0, on.offsetLeft - 8);
  }

  function chip(label, on, glyph, count, cls, attr, val) {
    return '<button type="button" class="chip' + (cls ? " " + cls : "") + (on ? " is-active" : "") + '" ' + attr + '="' + esc(val) + '">' +
      (glyph ? '<span class="glyph">' + glyph + "</span>" : "") + "<span>" + esc(label) + "</span>" +
      (count != null ? '<span class="count">' + count + "</span>" : "") + "</button>";
  }

  function renderChips() {
    var base = pool(), byType = {};
    base.forEach(function (p) { byType[p.type] = (byType[p.type] || 0) + 1; });
    $("typeChips").innerHTML = chip("All", !state.types.length, BR.mark(SLUG), base.length, "", "data-type", "") +
      TYPE_ORDER.filter(function (t) { return byType[t]; }).map(function (t) {
        return chip(t, state.types.indexOf(t) >= 0, BR.TYPES[t], byType[t], "pick", "data-type", t);
      }).join("");

    var bySize = {};
    base.forEach(function (p) {
      if (p.size && state.types.indexOf(p.type) >= 0) bySize[p.size] = (bySize[p.size] || 0) + 1;
    });
    var sizes = Object.keys(bySize).sort(function (a, b) { return parseFloat(a) - parseFloat(b); });
    state.sizes = state.sizes.filter(function (s) { return bySize[s]; });
    $("sizeRow").hidden = sizes.length < 2;
    $("sizeChips").innerHTML = sizes.length < 2 ? "" :
      chip("Any", !state.sizes.length, null, null, "sm", "data-size", "") +
      sizes.map(function (s) { return chip(s, state.sizes.indexOf(s) >= 0, null, bySize[s], "sm", "data-size", s); }).join("");
  }

  // Discount: ≥ or = a step (the BlinkDeal weight switch), counted against the type/size picks and the
  // card in the deal bar, so the numbers move with every other choice.
  function renderOff() {
    var base = pool().filter(function (p) {
      return (!state.types.length || state.types.indexOf(p.type) >= 0) &&
        (!state.sizes.length || state.sizes.indexOf(p.size) >= 0);
    });
    $("offChips").innerHTML =
      '<div class="seg tiny" id="offSeg" role="group" aria-label="Discount mode">' +
        '<button type="button" data-mode="ge" title="This much off or more" aria-pressed="' + (state.offMode === "ge") + '">≥</button>' +
        '<button type="button" data-mode="eq" title="In this band, e.g. = 50% is 50-59% off" aria-pressed="' + (state.offMode === "eq") + '">=</button></div>' +
      chip("Any", state.off === null, null, null, "sm", "data-off", "") +
      OFF_STEPS.map(function (n) {
        var c = base.filter(function (p) { return offOk(p, n); }).length;
        return chip((state.offMode === "ge" ? "≥ " : "") + n + "%", state.off === n, null, c, "sm", "data-off", n);
      }).join("");
  }

  // ---- tiles ----
  function steps(p) {
    var flip = p.mrp - p.listed, b = bankOff(p);
    var s = "";
    if (flip > 0) s += '<span class="f">Flipkart <b>−' + inr(flip) + "</b></span>";
    if (cpn(p)) s += '<span class="c">Coupon <b>−' + inr(cpn(p)) + "</b></span>";
    if (b) s += '<span class="b">' + esc(state.card) + " <b>−" + inr(b) + "</b></span>";
    return s;
  }
  function bar(p) {
    var flip = Math.max(0, p.mrp - p.listed), b = bankOff(p);
    return '<div class="split" aria-hidden="true"><i class="p" style="flex-grow:' + pay(p) + '"></i>' +
      '<i class="f" style="flex-grow:' + flip + '"></i><i class="c" style="flex-grow:' + cpn(p) + '"></i>' +
      '<i class="b" style="flex-grow:' + b + '"></i></div>';
  }
  var ARROW = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg>';

  function card(p, i) {
    var meta = [p.colour, p.size].filter(Boolean).map(esc).join(" · ");
    return '<article class="card' + (p.stock ? "" : " out") + '" style="animation-delay:' + Math.min(i, 12) * 22 + 'ms">' +
      '<a class="pic" href="' + esc(p.url) + '" target="_blank" rel="noopener sponsored">' +
        (p.img ? '<img loading="lazy" src="' + esc(p.img) + '" alt="">' : "") +
        (pct(p) ? '<span class="off">' + pct(p) + "% OFF</span>" : "") +
        (p.stock ? "" : '<span class="sold">Sold out</span>') + "</a>" +
      '<div class="body">' +
        '<div class="head"><h3 class="name" title="' + esc(p.name) + '">' + esc(p.title) + "</h3>" +
        '<div class="meta">' + (meta || "&nbsp;") + "</div></div>" +
        '<div class="price"><span class="now">' + inr(pay(p)) + "</span>" + (p.mrp > pay(p) ? "<s>" + inr(p.mrp) + "</s>" : "") + "</div>" +
        '<div class="scx"><span class="coin">SC</span>+ SuperCoins 3x–10x: ' + inr(Math.max(0, pay(p) - SC_HI)) + "–" + inr(Math.max(0, pay(p) - SC_LO)) + "</div>" +
        '<div class="mathcol">' + bar(p) + '<div class="steps">' + steps(p) + "</div></div>" +
        '<a class="buy" href="' + esc(p.url) + '" target="_blank" rel="noopener sponsored">Buy ' + ARROW + "</a>" +
      "</div></article>";
  }

  var SORTS = {
    save: function (a, b) { return saved(b) - saved(a); },
    pct: function (a, b) { return pct(b) - pct(a) || saved(b) - saved(a); },
    low: function (a, b) { return pay(a) - pay(b); },
    high: function (a, b) { return pay(b) - pay(a); }
  };

  // Show: keep only the best N, and/or the first colour of each model+size
  // (after sorting, so the one kept is the best of its model).
  function renderShow() {
    $("showChips").innerHTML = chip("All", !state.top, null, null, "sm", "data-top", "0") +
      [5, 10, 15, 20].map(function (n) { return chip("Top " + n, state.top === n, null, null, "sm", "data-top", n); }).join("") +
      chip("One per model", state.one, null, null, "sm", "data-one", "1");
  }

  function render() {
    renderOff();
    renderShow();
    var list = filtered();
    list.sort(SORTS[state.sort]);
    if (state.one) {
      var seen = {};
      list = list.filter(function (p) { var k = p.title + "|" + p.size; if (seen[k]) return false; seen[k] = 1; return true; });
    }
    if (state.top) list = list.slice(0, state.top);
    $("grid").className = "grid" + (state.view === "list" ? " list" : "");
    $("grid").innerHTML = list.map(card).join("");
    $("empty").hidden = list.length > 0;
    var best = list.length ? Math.max.apply(null, list.map(pct)) : 0;
    $("tally").innerHTML = "<b>" + list.length + "</b> deals" + (best ? " · up to <b>" + best + "% off</b>" : "");
  }

  function bind() {
    $("cardSeg").onclick = function (e) {
      var b = e.target.closest("[data-card]"); if (!b) return;
      state.card = b.dataset.card; press(this, b); render();
    };
    $("typeRow").onclick = function (e) {
      var b = e.target.closest("[data-type]"); if (!b) return;
      var t = b.dataset.type, i = state.types.indexOf(t);
      if (!t) state.types = []; else if (i >= 0) state.types.splice(i, 1); else state.types.push(t);
      renderChips(); render();
    };
    $("sizeRow").onclick = function (e) {
      var b = e.target.closest("[data-size]"); if (!b) return;
      var s = b.dataset.size, i = state.sizes.indexOf(s);
      if (!s) state.sizes = []; else if (i >= 0) state.sizes.splice(i, 1); else state.sizes.push(s);
      renderChips(); render();
    };
    $("offRow").onclick = function (e) {
      var m = e.target.closest("[data-mode]");
      if (m) { state.offMode = m.dataset.mode; render(); return; }
      var b = e.target.closest("[data-off]"); if (!b) return;
      var n = b.dataset.off === "" ? null : +b.dataset.off;
      state.off = state.off === n ? null : n; render();
    };
    $("showRow").onclick = function (e) {
      var b = e.target.closest("[data-top],[data-one]"); if (!b) return;
      if (b.dataset.one != null) state.one = !state.one;
      else { var n = +b.dataset.top; state.top = state.top === n ? 0 : n; }
      render();
    };
    $("stockOnly").onchange = function () { state.stock = this.checked; renderChips(); render(); };
    $("sortSel").value = state.sort;
    $("sortSel").onchange = function () { state.sort = this.value; BR.save("sort", state.sort); render(); };
    press($("viewSeg"), $("viewSeg").querySelector('[data-view="' + state.view + '"]'));
    $("viewSeg").onclick = function (e) {
      var b = e.target.closest("[data-view]"); if (!b) return;
      state.view = b.dataset.view; BR.save("view", state.view); press(this, b); render();
    };
  }

  $("mark").innerHTML = BR.TAG;
  $("brandGlyph").innerHTML = BR.mark(SLUG);

  fetch("products.json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (d) {
    items = d.items || [];
    $("brandName").textContent = (d.brand || SLUG).toUpperCase();
    $("footMeta").innerHTML = '<span class="fresh-dot"></span>Prices read from ' + esc(d.store || "Flipkart") + " " + BR.ago(d.updated);
    renderCards(); bind(); renderChips(); render();
  }).catch(function () {
    $("empty").hidden = false;
    $("empty").innerHTML = "<b>Couldn't load the deals.</b> Refresh to try again.";
  });
})();
