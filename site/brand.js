/* One brand's deal board. products.json is written by tools/scrape.py twice a
   day; every price here is redone from the card picked in the deal bar. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var inr = BR.inr, esc = BR.esc;
  var SLUG = document.body.dataset.brand;
  var TYPE_ORDER = ["Cabin", "Check-in", "Sets", "Backpacks", "Totes & bags", "Messengers", "Wallets"];

  var items = [], cards = [];
  var state = {
    card: BR.load(SLUG + ".card", null), types: [], sizes: [],
    stock: true, sort: BR.load("sort", "save"), view: BR.load("view", "tiles")
  };

  // ---- the maths ----
  function bankOff(p) { return state.card ? (p.banks[state.card] || 0) : 0; }
  function pay(p) { return p.listed - p.coupon - bankOff(p); }
  function saved(p) { return p.mrp - pay(p); }
  function pct(p) { return p.mrp > 0 ? Math.max(0, Math.round(saved(p) / p.mrp * 100)) : 0; }

  function pool() {
    return items.filter(function (p) { return !state.stock || p.stock; });
  }
  function filtered() {
    return pool().filter(function (p) {
      if (state.types.length && state.types.indexOf(p.type) < 0) return false;
      if (state.sizes.length && state.sizes.indexOf(p.size) < 0) return false;
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
    if (state.card !== "" && cards.indexOf(state.card) < 0) {
      // first visit: the card that cuts the most across the board
      var tot = {};
      items.forEach(function (p) { cards.forEach(function (c) { tot[c] = (tot[c] || 0) + (p.banks[c] || 0); }); });
      state.card = cards.slice().sort(function (a, b) { return tot[b] - tot[a]; })[0] || "";
    }
    $("cardSeg").innerHTML = ['<button type="button" data-card="">None</button>'].concat(cards.map(function (c) {
      return '<button type="button" data-card="' + esc(c) + '">' + esc(c) + "</button>";
    })).join("");
    press($("cardSeg"), $("cardSeg").querySelector('[data-card="' + state.card + '"]'));
  }

  function chip(label, on, glyph, count, cls, attr, val) {
    return '<button type="button" class="chip' + (cls ? " " + cls : "") + (on ? " is-active" : "") + '" ' + attr + '="' + esc(val) + '">' +
      (glyph ? '<span class="glyph">' + glyph + "</span>" : "") + "<span>" + esc(label) + "</span>" +
      (count != null ? '<span class="count">' + count + "</span>" : "") + "</button>";
  }

  function renderChips() {
    var base = pool(), byType = {};
    base.forEach(function (p) { byType[p.type] = (byType[p.type] || 0) + 1; });
    $("typeRow").innerHTML = chip("All", !state.types.length, BR.mark(SLUG), base.length, "", "data-type", "") +
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
    $("sizeRow").innerHTML = sizes.length < 2 ? "" :
      chip("Any size", !state.sizes.length, null, null, "sm", "data-size", "") +
      sizes.map(function (s) { return chip(s, state.sizes.indexOf(s) >= 0, null, bySize[s], "sm", "data-size", s); }).join("");
  }

  // ---- tiles ----
  function steps(p) {
    var flip = p.mrp - p.listed, b = bankOff(p);
    var s = "";
    if (flip > 0) s += '<span class="f">Flipkart <b>−' + inr(flip) + "</b></span>";
    if (p.coupon) s += '<span class="c">Coupon <b>−' + inr(p.coupon) + "</b></span>";
    if (b) s += '<span class="b">' + esc(state.card) + " <b>−" + inr(b) + "</b></span>";
    return s;
  }
  function bar(p) {
    var flip = Math.max(0, p.mrp - p.listed), b = bankOff(p);
    return '<div class="split" aria-hidden="true"><i class="p" style="flex-grow:' + pay(p) + '"></i>' +
      '<i class="f" style="flex-grow:' + flip + '"></i><i class="c" style="flex-grow:' + p.coupon + '"></i>' +
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
        '<div class="mathcol">' + bar(p) + '<div class="steps">' + steps(p) + "</div></div>" +
        '<a class="buy" href="' + esc(p.url) + '" target="_blank" rel="noopener sponsored">Buy ' + ARROW + "</a>" +
      "</div></article>";
  }

  function bill(p, i) {
    var line = function (l, v, cls) { return '<div class="' + (cls || "") + '"><span>' + l + "</span><b>" + v + "</b></div>"; };
    var b = bankOff(p);
    return '<article class="bill" style="animation-delay:' + i * 70 + 'ms"><span class="rank">#' + (i + 1) + "</span>" +
      '<div class="bill-top">' + (p.img ? '<img src="' + esc(p.img) + '" alt="">' : "") +
        "<div><b>" + esc(p.title) + "</b><small>" + esc([p.colour, p.size].filter(Boolean).join(" · ")) + "</small></div></div>" +
      '<div class="lines">' + line("MRP", inr(p.mrp)) +
        (p.mrp > p.listed ? line("Flipkart price", inr(p.listed)) : "") +
        (p.coupon ? line("Coupon", "−" + inr(p.coupon), "minus") : "") +
        (b ? line(esc(state.card) + " card", "−" + inr(b), "minus") : "") +
        line("You pay", inr(pay(p)), "pay") + "</div>" +
      '<span class="stamp">Saved ' + inr(saved(p)) + " · " + pct(p) + "%</span>" +
      '<a class="buy" href="' + esc(p.url) + '" target="_blank" rel="noopener sponsored">Buy ' + ARROW + "</a></article>";
  }

  var SORTS = {
    save: function (a, b) { return saved(b) - saved(a); },
    pct: function (a, b) { return pct(b) - pct(a) || saved(b) - saved(a); },
    low: function (a, b) { return pay(a) - pay(b); },
    high: function (a, b) { return pay(b) - pay(a); }
  };

  function render() {
    var list = filtered();
    // one bill per model - colours of the same case would fill all four
    var seen = {};
    var top = list.filter(function (p) { return p.stock; }).sort(SORTS.save).filter(function (p) {
      var k = p.title + "|" + p.size;
      return seen[k] ? false : (seen[k] = true);
    }).slice(0, 4);
    $("best").hidden = !top.length;
    $("bills").innerHTML = top.map(bill).join("");
    $("bestSub").textContent = state.card ? "with " + state.card + " card" : "no card offer";

    list.sort(SORTS[state.sort]);
    $("grid").className = "grid" + (state.view === "list" ? " list" : "");
    $("grid").innerHTML = list.map(card).join("");
    $("empty").hidden = list.length > 0;
    var best = list.length ? Math.max.apply(null, list.map(pct)) : 0;
    $("tally").innerHTML = "<b>" + list.length + "</b> deals" + (best ? " · up to <b>" + best + "% off</b>" : "");
  }

  function bind() {
    $("cardSeg").onclick = function (e) {
      var b = e.target.closest("[data-card]"); if (!b) return;
      state.card = b.dataset.card; BR.save(SLUG + ".card", state.card); press(this, b); render();
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
