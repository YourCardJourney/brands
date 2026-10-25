"""Refresh every brand's prices from its Flipkart product pages.

    python tools/scrape.py            # all brands in catalog/
    python tools/scrape.py mokobara   # one brand

catalog/<slug>.json lists the products (Flipkart URL + our ExtraPe link).
Each page's server-rendered state carries the whole price stack:
  ppd                -> MRP and listed price
  ATLAS_NEP_V2       -> the coupon, every bank's offer, and "Buy at" (lowest)
  availabilityStatus -> in stock or not
A page that fails to read keeps its last good values (marked stale), so one
bad fetch never blanks a tile. Writes site/<slug>/products.json and
site/brands.json (the home page's summary).
"""

import io
import json
import os
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CATALOG = os.path.join(ROOT, "catalog")
SITE = os.path.join(ROOT, "site")

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")
STATE = "window.__INITIAL_STATE__ = "

# Bank pills Flipkart shows, folded to one short name each. "Multiple Banks"
# is not a card anyone holds, so it is dropped.
BANKS = {"HDFC": "HDFC", "ICICI": "ICICI", "SBI": "SBI", "Axis": "Axis",
         "Flipkart Axis": "Flipkart Axis", "Flipkart SBI": "Flipkart SBI", "Bank of Baroda": "BOB", "Kotak": "Kotak",
         "IDFC FIRST": "IDFC", "IDFC": "IDFC", "RBL": "RBL", "Yes Bank": "Yes", "AU": "AU",
         "OneCard": "OneCard", "Federal": "Federal", "IndusInd": "IndusInd", "HSBC": "HSBC"}


# Offer kinds the parser understands. Anything else on a page (a SuperCoin
# layer, say) is printed at the end of the run so it can be added.
KNOWN_OFFERS = {"PBO", "EXCHANGE", "USER_COUPON_SELECTION"}
NEW_OFFERS = set()


def rupees(s):
    m = re.search(r"₹\s?([\d,]+)", s or "")
    return int(m.group(1).replace(",", "")) if m else 0


def fetch(url):
    for attempt in range(3):
        p = subprocess.run(["curl", "-s", "--compressed", "-m", "40", "-A", UA,
                            "-H", "Accept-Language: en-IN,en;q=0.9", url], capture_output=True)
        html = p.stdout.decode("utf-8", "ignore")
        if STATE in html:
            return html
        time.sleep(3 + attempt * 4)
    return ""


def find(o, test):
    """First dict anywhere under o that passes test."""
    stack = [o]
    while stack:
        x = stack.pop()
        if isinstance(x, dict):
            if test(x):
                return x
            stack.extend(x.values())
        elif isinstance(x, list):
            stack.extend(x)
    return None


def parse(html):
    i = html.index(STATE) + len(STATE)
    st, _ = json.JSONDecoder().raw_decode(html[i:])

    ppd = find(st, lambda d: "fsp" in d and "mrp" in d) or {}
    # fsp drops below finalPrice when Flipkart runs a "special price" - take the lower
    listed = min([int(v) for v in (ppd.get("fsp"), ppd.get("finalPrice")) if v] or [0])
    mrp = int(ppd.get("mrp") or listed)

    av = find(st, lambda d: "availabilityStatus" in d)
    stock = (av or {}).get("availabilityStatus", "IN_STOCK") != "OUT_OF_STOCK"

    coupon, banks, low = 0, {}, 0
    nep = find(st, lambda d: d.get("type") == "ATLAS_NEP_V2" and isinstance(d.get("data"), dict)
               and d["data"].get("offers"))
    if nep:
        for tab in nep["data"].get("offers", []):
            v = tab.get("value", {})
            if v.get("type") != "BANK_TAB":
                continue
            low = rupees(v.get("title"))
            for o in v.get("offerSummariesRC", []):
                x = o.get("value", {})
                if x.get("offerType") not in KNOWN_OFFERS:
                    NEW_OFFERS.add(x.get("offerType"))
                if x.get("offerType") == "USER_COUPON_SELECTION":
                    d = (x.get("offerSubTitleRC", {}).get("action", {}).get("params", {})
                         .get("offerBottomsheetDetails", {}).get("value", {}))
                    coupon = max(coupon, rupees(d.get("discountedPriceText") or x.get("discountedPriceText")))
                for pill in x.get("bankOfferGrid") or []:
                    p = pill.get("value", {})
                    name = BANKS.get((p.get("offerTitle") or "").strip())
                    amt = rupees(p.get("discountedPriceText"))
                    if name and amt:
                        banks[name] = max(banks.get(name, 0), amt)

    # Sold out: Flipkart hides the price and shows "Notify Me" instead
    soldout = not listed and "NOTIFY_ME" in html
    if soldout:
        stock = False

    m = re.search(r'og:image" content="([^"]+)', html)
    img = m.group(1).replace("/1500/1500/", "/416/416/") if m else ""
    return {"mrp": mrp, "listed": listed, "coupon": coupon, "banks": banks,
            "low": low, "stock": stock, "img": img, "full": bool(nep) or not stock, "soldout": soldout}


# ---- name parsing (the catalogue names are Flipkart titles) ----

def kind(name):
    n = name.lower()
    if "wallet" in n or "card holder" in n:
        return "Wallets"
    if re.search(r"\bset\b", n):
        return "Sets"
    if "cabin suitcase" in n:
        return "Cabin"
    if "check-in suitcase" in n:
        return "Check-in"
    if "backpack" in n:
        return "Backpacks"
    if "messenger" in n:
        return "Messengers"
    return "Totes & bags"


def size(name, k):
    if k == "Sets":
        m = re.search(r"set of (\d)", name, re.I)
        return (m.group(1) if m else ("3" if "Large" in name else "2")) + "-piece"
    m = re.search(r"([\d.]+) ?inch\b", name) if k in ("Cabin", "Check-in") else \
        re.search(r"([\d.]+) ?L\b", name) if k == "Backpacks" else None
    if not m:
        return ""
    v = m.group(1)
    return v + ('"' if k in ("Cabin", "Check-in") else " L")


def colour(name):
    m = re.search(r".*\b(?:inch|cm|Backpack|Tote|Bag|Wallet|Holder|Handbag)\s+([^|]+)$", name)
    return m.group(1).strip() if m else ""


def title(name, brand):
    t = re.sub(r"^%s\s+" % re.escape(brand), "", name)
    t = re.split(r"\s(?:Cabin Suitcase|Check-in Suitcase|Cabin & Check-in Set|"
                 r"Expandable|Laptop Backpack|Backpack\b|\d+(?:\.\d+)? L\b|8 Wheels)", t)[0]
    c = colour(name)
    if c and t.endswith(c):
        t = t[:-len(c)]
    t = re.sub(r"Casual, Ethnic, .*?Trendy ", "", t)
    t = re.sub(r"\s*\([^)]*\)?", "", t)            # "(Small 55.5 cm | Medium 65 ...)"
    t = re.sub(r"\s+-\s+(?:Set )?of (\d)", r" Set of \1", t)
    t = re.sub(r"\s+Luggage$", "", t)
    return t.strip(" -") or name


def refresh(slug):
    cat = json.load(io.open(os.path.join(CATALOG, slug + ".json"), encoding="utf-8"))
    out_p = os.path.join(SITE, slug, "products.json")
    old = {}
    if os.path.exists(out_p):
        old = {p["id"]: p for p in json.load(io.open(out_p, encoding="utf-8"))["items"]}

    def one(p):
        html = fetch(p["url"])
        try:
            return parse(html) if html else None
        except Exception as e:  # a changed page shape should not stop the rest
            print("  parse failed %s: %s" % (p["id"], e))
            return None

    started = time.time()
    with ThreadPoolExecutor(12) as ex:
        reads = list(ex.map(one, cat["products"]))

    def ok(r):
        return r and (r["listed"] or r["soldout"]) and r["full"]

    # Second chance, one page at a time: anything that failed, or came back
    # in stock without its offers block, is read again so no offer is missed.
    for rnd in range(3):
        miss = [i for i, r in enumerate(reads) if not ok(r)]
        if not miss:
            break
        print("  retry round %d: %d pages" % (rnd + 1, len(miss)))
        time.sleep(10 + rnd * 10)
        for i in miss:
            r = one(cat["products"][i])
            if r and (r["listed"] or r["soldout"]) and (r["full"] or not reads[i]):
                reads[i] = r
            time.sleep(2)
    for i, r in enumerate(reads):
        if r and not r["full"]:
            print("  no offers block %s" % cat["products"][i]["id"])
        if r:
            r.pop("full")
            if r.pop("soldout"):
                r = reads[i] = {"soldout": True}

    items, fresh = [], 0
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    for p, r in zip(cat["products"], reads):
        prev = old.get(p["id"])
        if r and r.get("soldout"):
            if not prev:
                continue
            # keep the last prices for reference, but show it as sold out
            fresh += 1
            r = {k: prev[k] for k in ("mrp", "listed", "coupon", "banks", "low", "img")}
            r.update(stock=False, seen=now)
        elif r and r["listed"]:
            fresh += 1
            r["seen"] = now
        elif prev:
            r = {k: prev[k] for k in ("mrp", "listed", "coupon", "banks", "low", "stock", "img", "seen")}
        else:
            continue
        k = kind(p["name"])
        items.append(dict(id=p["id"], name=p["name"], title=title(p["name"], cat["name"]),
                          colour=colour(p["name"]), type=k, size=size(p["name"], k),
                          url=p["link"], stale=r["seen"] != now, **r))

    os.makedirs(os.path.dirname(out_p), exist_ok=True)
    with io.open(out_p, "w", encoding="utf-8", newline="") as fh:
        json.dump({"brand": cat["name"], "store": cat.get("store", "Flipkart"),
                   "updated": now, "items": items}, fh, ensure_ascii=False, separators=(",", ":"))
    print("%s: %d/%d fresh, %d kept from last read, %.0fs" % (
        slug, fresh, len(cat["products"]), len(items) - fresh, time.time() - started))
    return fresh, items, now


def best_pay(p):
    """Mirrors brand.js pay() with the best card."""
    base = p["listed"] - p["coupon"]
    return base - max(p["banks"].values() or [0])


def main():
    slugs = sys.argv[1:] or sorted(f[:-5] for f in os.listdir(CATALOG) if f.endswith(".json"))
    summary_p = os.path.join(SITE, "brands.json")
    summary = {}
    if os.path.exists(summary_p):
        summary = {b["slug"]: b for b in json.load(io.open(summary_p, encoding="utf-8"))["brands"]}
    total_fresh = 0
    for slug in slugs:
        fresh, items, now = refresh(slug)
        total_fresh += fresh
        cat = json.load(io.open(os.path.join(CATALOG, slug + ".json"), encoding="utf-8"))
        live = [p for p in items if p["stock"]] or items
        top = max(live, key=lambda p: 1 - best_pay(p) / p["mrp"] if p["mrp"] else 0)
        summary[slug] = {"slug": slug, "name": cat["name"], "store": cat.get("store", "Flipkart"),
                         "count": len(live), "upto": round((1 - best_pay(top) / top["mrp"]) * 100),
                         "img": top["img"], "updated": now}
    with io.open(summary_p, "w", encoding="utf-8", newline="") as fh:
        json.dump({"brands": sorted(summary.values(), key=lambda b: b["name"])}, fh,
                  ensure_ascii=False, indent=1)
    if NEW_OFFERS:
        print("NEW offer kinds on the pages (not priced yet): %s" % ", ".join(sorted(map(str, NEW_OFFERS))))
    # Nothing read at all means Flipkart turned us away - fail loudly so the
    # workflow shows red instead of quietly publishing yesterday's prices.
    return 0 if total_fresh else 1


if __name__ == "__main__":
    sys.exit(main())
