# Brands

brands.yourcardjourney.store - brand-by-brand deals with the price worked out
(listed price, coupon, your card's offer) down to what you pay.

- `catalog/<slug>.json` - a brand's products: Flipkart URL + ExtraPe affiliate link.
- `tools/scrape.py` - reads every product page, writes `site/<slug>/products.json`
  and `site/brands.json`. Runs in Actions at 09:00 and 21:00 IST.
- `tools/discover.py` - finds listings the catalogue lacks and adds them on plain
  Flipkart links. Runs in Actions every Sunday 08:00 IST (`discover.yml`).
  `python tools/discover.py --plain` lists what still needs an ExtraPe link.
- `site/` - static pages. `site/<slug>/index.html` is a shell; `brand.js` does the rest.

Adding a brand: new `catalog/<slug>.json`, a copy of `site/mokobara/index.html`
with `data-brand="<slug>"`, and a mark in `site/common.js` (MARKS).
