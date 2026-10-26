"""Find brand listings on Flipkart that the catalogue doesn't have yet.

    python tools/discover.py            # all brands in catalog/
    python tools/discover.py mokobara   # one brand
    python tools/discover.py --plain    # just list products still on plain links

Searches Flipkart for the brand plus a handful of product words (14 pages
each), then opens every known product page and follows its links to other
colours and models until nothing new turns up. New products go into
catalog/<slug>.json with link = the plain Flipkart URL; mint ExtraPe links
for them later (convertText, see README) and they switch over.
"""

import html as H
import io
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scrape import CATALOG, fetch  # noqa: E402

WORDS = ["", "luggage", "suitcase", "trolley", "backpack", "bag", "duffle", "tote", "sling",
         "wallet", "packing cubes", "organizer", "pouch", "laptop sleeve", "accessories", "travel"]
PAGES = 14
FK = "https://www.flipkart.com"


def links(page, brand):
    """(itm, url) for every product of this brand linked from a page."""
    out = re.findall(r'href="(/[^"?]*?/p/(itm[0-9a-z]+))', page)
    return [(i, FK + p) for p, i in out if brand.lower() in p.lower()]


def clean(t, brand):
    t = H.unescape(t).split(" - Price in India")[0].split(" Price in India")[0]
    t = re.sub(r"^Buy\s+|\s+Online @ Best.*$|^Flipkart\.com \|\s*", "", t)
    t = re.sub(r"\s+-\s+(Laptop Sleeve/Cover|Lunch Bag)$", "", t)
    # "Mokobara Yellow Sling Bag The Moko Mini 2.0 Sunnyside Yellow" ->
    # "Mokobara The Moko Mini 2.0 Sling Bag Sunnyside Yellow" (model, then colour).
    # The model ends at its version number or "Crossbody", else after its first word.
    m = re.match(r"%s \w+ Sling Bag The (.*)$" % re.escape(brand), t)
    if m:
        r = m.group(1)
        mm = re.match(r"(.*?\d\.\d|.*?Crossbody|\S+)\s+(.*)$", r)
        if mm:
            t = "%s The %s Sling Bag %s" % (brand, mm.group(1), mm.group(2))
    return re.sub(r"\s+", " ", t).strip()


def discover(slug):
    path = os.path.join(CATALOG, slug + ".json")
    cat = json.load(io.open(path, encoding="utf-8"))
    brand = cat["name"]
    known = {p["id"]: p["url"] for p in cat["products"]}

    searches = ["%s/search?q=%s&page=%d" % (FK, (brand + " " + w).strip().replace(" ", "+"), n)
                for w in WORDS for n in range(1, PAGES + 1)]
    found = {}
    with ThreadPoolExecutor(12) as ex:
        for page in ex.map(fetch, searches):
            for i, u in links(page, brand):
                found.setdefault(i, u)

    # Walk the product pages: each one links to its other colours and models.
    urls = dict(known, **found)
    titles, todo = {}, list(urls)
    while todo:
        with ThreadPoolExecutor(12) as ex:
            pages = list(ex.map(lambda i: fetch(urls[i]), todo))
        nxt = []
        for i, page in zip(todo, pages):
            m = re.search(r"<title>([^<]*)", page)
            titles[i] = m.group(1) if m else ""
            for j, u in links(page, brand):
                if j not in urls:
                    urls[j] = u
                    nxt.append(j)
        todo = nxt

    new = [i for i in urls if i not in known and titles.get(i)]
    for i in new:
        u = urls[i].split("?")[0]
        cat["products"].append({"id": i, "name": clean(titles[i], brand), "url": u, "link": u})
    if new:
        with io.open(path, "w", encoding="utf-8", newline="") as fh:
            fh.write(json.dumps(cat, ensure_ascii=False, indent=1) + "\n")
    print("%s: %d known, %d new" % (slug, len(known), len(new)))
    for i in new:
        print("  + %s" % cat["products"][[p["id"] for p in cat["products"]].index(i)]["name"])
    return len(new)


def plain():
    for f in sorted(os.listdir(CATALOG)):
        cat = json.load(io.open(os.path.join(CATALOG, f), encoding="utf-8"))
        todo = [p for p in cat["products"] if "fkrt.co" not in p["link"]]
        print("%s: %d on plain links" % (f[:-5], len(todo)))
        for p in todo:
            print("  %s" % p["url"])


def main():
    if "--plain" in sys.argv:
        return plain()
    slugs = sys.argv[1:] or sorted(f[:-5] for f in os.listdir(CATALOG) if f.endswith(".json"))
    for slug in slugs:
        discover(slug)


if __name__ == "__main__":
    main()
