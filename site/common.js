/* Shared by the home page and every brand page. */
var BR = (function () {
  "use strict";
  var S = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">';
  // Brand marks are drawn here in one hand, never the brand's own logo.
  var MARKS = {
    mokobara: S + '<rect x="6" y="7" width="12" height="13" rx="2.6"/><path d="M9.5 7V4.6h5V7M10 11v5M14 11v5M8 20v1.4M16 20v1.4"/></svg>'
  };
  var TYPES = {
    "Cabin": S + '<rect x="7" y="8" width="10" height="11" rx="2.2"/><path d="M10 8V5.5h4V8M9 19v1.5M15 19v1.5"/></svg>',
    "Check-in": S + '<rect x="6" y="5" width="12" height="15" rx="2.4"/><path d="M10 5V3h4v2M10 9v7M14 9v7M8 20v1.5M16 20v1.5"/></svg>',
    "Sets": S + '<rect x="3" y="7" width="9" height="12" rx="2"/><rect x="13" y="10" width="8" height="9" rx="2"/><path d="M6 7V5h3v2M15.5 10V8.5h3V10"/></svg>',
    "Backpacks": S + '<path d="M7 9a5 5 0 0 1 10 0v10a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19z"/><path d="M10 4.5V3.5h4v1M9.5 14h5v3h-5z"/></svg>',
    "Totes & bags": S + '<path d="M5 9h14l-1.3 11H6.3z"/><path d="M9 11V7a3 3 0 0 1 6 0v4"/></svg>',
    "Messengers": S + '<rect x="4" y="9" width="16" height="11" rx="2"/><path d="M4 12h16M8 9 15 3M12 12v2"/></svg>',
    "Wallets": S + '<rect x="3.5" y="6" width="17" height="13" rx="2.4"/><path d="M14.5 11h6v4h-6a2 2 0 0 1 0-4z"/></svg>'
  };
  // Bank marks, same hand: a shopping bag for the Flipkart card, a pillared
  // bank for HDFC. Drawn, never the bank's own logo.
  var BANKS = {
    "Flipkart Axis": S + '<path d="M5 8.5h14l-1.2 11.2a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M9 11V7a3 3 0 0 1 6 0v4"/></svg>',
    "HDFC": S + '<path d="M3.5 9 12 4l8.5 5zM5.5 9v8M9.8 9v8M14.2 9v8M18.5 9v8M3.5 20h17"/></svg>'
  };
  var TAG = '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M3.5 12.2V4.8c0-.7.6-1.3 1.3-1.3h7.4l8.3 8.3a1.3 1.3 0 0 1 0 1.8l-7.4 7.4a1.3 1.3 0 0 1-1.8 0z" fill="#fff" fill-opacity=".22"/><circle cx="8" cy="8" r="1.6"/></svg>';

  function inr(n) { return "₹" + Math.round(n).toLocaleString("en-IN"); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function load(k, d) { try { var v = localStorage.getItem("brands." + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem("brands." + k, JSON.stringify(v)); } catch (e) {} }
  function ago(iso) {
    var h = (Date.now() - new Date(iso)) / 36e5;
    if (!(h >= 0)) return "";
    return h < 1 ? "under an hour ago" : h < 24 ? Math.round(h) + " h ago" : Math.round(h / 24) + " d ago";
  }
  return { MARKS: MARKS, TYPES: TYPES, BANKS: BANKS, TAG: TAG, inr: inr, esc: esc, load: load, save: save, ago: ago,
           mark: function (slug) { return MARKS[slug] || S + '<circle cx="12" cy="12" r="7"/></svg>'; } };
})();
