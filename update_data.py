#!/usr/bin/env python3
"""
update_data.py  --  Refresh The List data from the latest Steve Koepke email.

Usage:
    python3 update_data.py

What it does:
  1. Searches your Gmail for the latest "San Francisco Area Music List" email
  2. Parses the plain-text body into show records
  3. Matches venue names against data/venues.json (with manual alias map)
  4. Writes updated data/shows.json and data/venues.json
  5. Bumps the ?vYYYYMMDD cache-busting version in assets/common.js
  6. Prints a summary of changes

Requirements:
  pip install google-auth google-auth-oauthlib google-api-python-client

Gmail OAuth setup (one-time):
  - Go to console.cloud.google.com, create a project, enable Gmail API
  - Create OAuth 2.0 credentials (Desktop app), download as credentials.json
  - Place credentials.json next to this script
  - On first run the browser will open for authorization; token.json is saved for
    future runs

The script is idempotent: running it twice on the same email produces the same output.
"""

import json
import os
import re
import sys
from collections import Counter
from datetime import date, datetime, timedelta

# ---------------------------------------------------------------------------
# Gmail fetch
# ---------------------------------------------------------------------------

def get_gmail_service():
    """Return an authenticated Gmail API service object."""
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        from googleapiclient.discovery import build
    except ImportError:
        print("ERROR: Gmail API libraries not installed.")
        print("  pip install google-auth google-auth-oauthlib google-api-python-client")
        sys.exit(1)

    SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
    TOKEN_FILE = os.path.join(os.path.dirname(__file__), "token.json")
    CREDS_FILE = os.path.join(os.path.dirname(__file__), "credentials.json")

    creds = None
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(CREDS_FILE):
                print("ERROR: credentials.json not found next to this script.")
                print("  See the docstring at the top of this file for setup instructions.")
                sys.exit(1)
            flow = InstalledAppFlow.from_client_secrets_file(CREDS_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_FILE, "w") as f:
            f.write(creds.to_json())

    return build("gmail", "v1", credentials=creds)


def fetch_latest_list_email(service):
    """Return (subject, date_str, plain_text_body) of the most recent List email."""
    results = service.users().messages().list(
        userId="me",
        q='from:skoepke@stevelist.com subject:"San Francisco Area Music List"',
        maxResults=1,
    ).execute()

    messages = results.get("messages", [])
    if not messages:
        print("ERROR: No 'San Francisco Area Music List' emails found in Gmail.")
        sys.exit(1)

    msg_id = messages[0]["id"]
    msg = service.users().messages().get(
        userId="me", id=msg_id, format="full"
    ).execute()

    subject = ""
    date_str = ""
    for header in msg["payload"]["headers"]:
        if header["name"] == "Subject":
            subject = header["value"]
        if header["name"] == "Date":
            date_str = header["value"]

    # Extract plain text body (may be multipart)
    def get_body(payload):
        if payload.get("mimeType") == "text/plain":
            import base64
            data = payload.get("body", {}).get("data", "")
            return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")
        for part in payload.get("parts", []):
            result = get_body(part)
            if result:
                return result
        return ""

    body = get_body(msg["payload"])
    print(f"  Found: {subject}")
    print(f"  Date:  {date_str}")
    print(f"  Body:  {len(body):,} characters")
    return subject, date_str, body


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------

MONTH_MAP = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

DATE_WK_RE = re.compile(
    r"^([a-z]{3})[ \xa0]+(\d+)(?:[ \xa0]+(\d{4}))?[ \xa0]+(sun|mon|tue|wed|thr|fri|sat)\s+(.+)$",
    re.IGNORECASE,
)
DATE_NOWK_RE = re.compile(
    r"^([a-z]{3})[ \xa0]+(\d+)[ \xa0]+(\d{4})\s+(.+)$",
    re.IGNORECASE,
)

SYM_RE = re.compile(r"(?:^|\s)([#@^$*])\s*$")

CITY_NORM = {
    "sf": "S.F.", "s.f": "S.F.", "s.f.": "S.F.", "san francisco": "S.F.",
    "berkely": "Berkeley", "berkley": "Berkeley",
    "albanu": "Albany",
    "daly city": "Daly City", "daily city": "Daly City",
    "mountain veiw": "Mountain View",
    "memlo park": "Menlo Park",
}


def norm_city(raw):
    s = raw.strip()
    return CITY_NORM.get(s.lower().rstrip("."), s)


def clean(s):
    s = s.replace("\xa0", " ")
    return s.encode("ascii", "ignore").decode("ascii").strip()


def pull_syms(text):
    syms = []
    text = text.rstrip()
    while True:
        m = SYM_RE.search(text)
        if m:
            syms.append(m.group(1))
            text = text[: m.start()].rstrip()
        else:
            break
    return text, list(dict.fromkeys(reversed(syms)))


def parse_meta(text):
    age = ""
    if re.search(r"\ba/a\b", text, re.I):
        age = "a/a"
    elif m := re.search(r"\b(\d+)\+", text):
        age = m.group(0)

    price = ""
    if pm := re.search(r"\$[\d.,]+(?:[/-]\$?[\d.,]+)?", text):
        price = pm.group(0)
    elif re.search(r"\bfree\b", text, re.I):
        price = "free"

    time = ""
    if tm := re.search(
        r"\b(\d{1,2}(?::\d{2})?(?:am|pm)(?:/\d{1,2}(?::\d{2})?(?:am|pm))?)\b",
        text, re.I,
    ):
        time = tm.group(1).lower()

    notes = ""
    parts = [
        n for n in re.findall(r"\(([^)]+)\)", text)
        if not re.match(r"^\$|vip|reserved|balcony|under \d+", n, re.I)
    ]
    if parts:
        notes = "; ".join(parts)

    return age, price, time, notes


def find_meta_start(text):
    meta_start = None
    for pat in [r"\ba/a\b", r"\b21\+", r"\b18\+", r"\b16\+", r"\b\d+\+", r"\$\d", r"\bfree\b"]:
        if m := re.search(pat, text, re.I):
            if meta_start is None or m.start() < meta_start:
                meta_start = m.start()
    return meta_start


def parse_venue_meta(line):
    ms = find_meta_start(line)
    if ms is not None:
        venue_city = line[:ms].strip().rstrip(",").strip()
        meta_text = line[ms:]
    else:
        venue_city = line.strip()
        meta_text = ""

    parts = venue_city.rsplit(",", 1)
    if len(parts) == 2:
        venue = parts[0].strip()
        city = norm_city(parts[1].strip())
    else:
        venue = venue_city
        city = ""

    return venue, city, meta_text


def match_date(raw_line):
    norm = raw_line.replace("\xa0", " ").strip()
    m = DATE_WK_RE.match(norm)
    if m:
        return m.group(1).lower(), int(m.group(2)), m.group(3), m.group(4).lower(), m.group(5)
    m = DATE_NOWK_RE.match(norm)
    if m:
        return m.group(1).lower(), int(m.group(2)), m.group(3), None, m.group(4)
    return None


def is_date_line(l):
    return match_date(l) is not None


def parse_body(body):
    lines = [l.rstrip("\r") for l in body.split("\n")]

    end_idx = len(lines)
    for i, l in enumerate(lines):
        if "All bands deserve" in l:
            end_idx = i
            break
    lines = lines[:end_idx]

    shows = []
    i = 0

    while i < len(lines):
        result = match_date(lines[i])
        if not result:
            i += 1
            continue

        mon_str, day, year_str, wk, rest = result
        year = int(year_str) if year_str else 2026
        month = MONTH_MAP.get(mon_str, 0)
        if not month:
            i += 1
            continue

        d_int = year * 10000 + month * 100 + day
        date_str = f"{mon_str} {day}" if year == 2026 else f"{mon_str} {day} {year}"
        if not wk:
            dt = date(year, month, day)
            wk = ["mon", "tue", "wed", "thr", "fri", "sat", "sun"][dt.weekday()]

        i += 1
        cont_parts = []
        venue_parts = []

        while i < len(lines):
            nxt = lines[i]
            nxt_norm = nxt.replace("\xa0", " ").strip()
            if not nxt_norm:
                break
            if is_date_line(nxt):
                break
            if nxt.startswith("\xa0\xa0") or nxt.startswith("   "):
                venue_parts.append(nxt.replace("\xa0", " ").strip())
            else:
                if not venue_parts:
                    cont_parts.append(nxt_norm)
                else:
                    if venue_parts:
                        venue_parts[-1] = venue_parts[-1] + " " + nxt_norm
            i += 1

        first_line = clean(rest)
        if cont_parts:
            first_line = first_line + " " + " ".join(clean(p) for p in cont_parts)
        venue_line = clean(" ".join(venue_parts)) if venue_parts else ""

        if venue_line:
            venue_line, syms = pull_syms(venue_line)
        else:
            first_line, syms = pull_syms(first_line)

        bands = venue = city = meta_text = ""

        if venue_line:
            vl = venue_line.strip()
            if re.match(r"^at\s+", vl, re.I):
                after_at = re.sub(r"^at\s+", "", vl, flags=re.I)
                venue, city, meta_text = parse_venue_meta(after_at)
                bands = first_line
            elif re.search(r"\s+at\s+", vl, re.I):
                at_m = re.search(r"\s+at\s+", vl, re.I)
                extra = vl[: at_m.start()].strip()
                after_at = vl[at_m.end():]
                venue, city, meta_text = parse_venue_meta(after_at)
                bands = first_line + (", " + extra if extra else "")
            else:
                meta_text = vl
                if at_m := re.search(r"\s+at\s+(?=\S)", first_line, re.I):
                    bands = first_line[: at_m.start()].strip()
                    v2, c2, _ = parse_venue_meta(first_line[at_m.end():])
                    venue, city = v2, c2
                else:
                    bands = first_line
        else:
            if at_m := re.search(r"\s+at\s+(?=\S)", first_line, re.I):
                bands = first_line[: at_m.start()].strip()
                venue, city, meta_text = parse_venue_meta(first_line[at_m.end():])
            else:
                bands = first_line
                meta_text = first_line

        age, price, time, notes = parse_meta(meta_text if meta_text else first_line)
        bands = re.sub(r",\s*,", ",", bands).strip().strip(",").strip()
        if not bands:
            continue

        shows.append({
            "d": d_int,
            "date": date_str,
            "wk": wk,
            "bands": bands,
            "venue": venue.strip().strip(",").strip(),
            "city": city,
            "age": age,
            "price": price,
            "time": time,
            "sym": syms,
            "notes": notes,
        })

    return shows


# ---------------------------------------------------------------------------
# Venue matching
# ---------------------------------------------------------------------------

def norm_name(s):
    s = s.lower().strip()
    s = re.sub(r"^the\s+", "", s)
    s = re.sub(r"[',.]", "", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


# Static alias table: normalised display name -> venue_id
# Add new aliases here as needed when new venues appear.
VENUE_ALIASES = {
    # Existing typos / shorthands
    "warriors stadium": "v0151", "warriros stadium": "v0151", "warriors stadiom": "v0151",
    "chase center": "v0151",
    "49ers stadium": "v0152", "49'ers stadium": "v0152", "49'er stadium": "v0152",
    "49er stadium": "v0152", "levis stadium": "v0152",
    "starry plough": "v0153",
    "shoreline ampheater": "v0073", "shoreline amphteater": "v0073",
    "shorline amphitheater": "v0073", "shoreline theater": "v0073",
    "indpendent": "v0013", "independent": "v0013",
    "924 gilman": "v0001", "924 gilman st": "v0001",
    "castro": "v0070",
    "hopmonk": "v0022", "hopmonk tavern novato": "v0022",
    "music hall": "v0069", "music hall 1030 main street": "v0069",
    "pt san pablo harbor": "v0145",
    "old princeton landing 460 capistrano way": "v0095",
    "san jose civic center": "v0110", "civic 135 san carlos st": "v0110",
    "outside lands golden gate par": "v0115",
    "outside lands golden gate park": "v0115", "outside lands": "v0115",
    # New venues (v0151+)
    "brewsters beer garden 229 water street": "v0154", "brewsters beer garden": "v0154",
    "broadway studios 435 broadway": "v0155", "broadway studios": "v0155",
    "city hall 100 gregory lane": "v0164", "city hall 100 gregory ln": "v0164",
    "concord skatepark 1174 san miguel rd": "v0156", "concord skatepark": "v0156",
    "curran theater 445 geary street": "v0157", "curran theater": "v0157",
    "discovery meadow 180 woz way": "v0158", "discovery meadow": "v0158",
    "discovery museum 180 woz way": "v0158", "discovery museum": "v0158",
    "everyday skateshop 10 geary street": "v0159", "everyday skateshop": "v0159",
    "jax vineyards 326 brannan street": "v0160", "jax vineyards": "v0160",
    "keys jazz bistro 498 broadway": "v0161", "keys jazz bistro": "v0161",
    "mabuhay gardens and on broadway": "v0171", "mabuhay gardens": "v0171",
    "marina way and macdonald avenue": "v0162",
    "museum of modern art": "v0163", "sfmoma": "v0163",
    "plaza park 198 warm springs road": "v0165", "plaza park": "v0165",
    "rolph street at pomona st": "v0166",
    "san anselmo town hall": "v0167", "town hall 525 san anselmo avenue": "v0167",
    "ugra deva loka 1035 22nd ave unit 14": "v0168", "ugra deva loka": "v0168",
    "vessel 150 felker street ste h": "v0169", "vessel": "v0169",
    "950 pomona avenue": "v0170",
}


def build_venue_lookup(venues):
    """Build normalised-name -> venue_id lookup from venues list."""
    lookup = {}
    for v in venues:
        lookup[norm_name(v["name"])] = v["id"]
        lookup[norm_name(v["name"].split(",")[0])] = v["id"]
    lookup.update(VENUE_ALIASES)
    return lookup


def assign_venue_ids(shows, venues):
    """
    Mutate each show dict to add venue_id.
    Returns list of (venue_name, city) tuples that could not be matched.
    """
    lookup = build_venue_lookup(venues)
    unmatched = {}

    for s in shows:
        vname = s.get("venue", "").strip()
        if not vname:
            s["venue_id"] = "v9999"
            continue

        key = norm_name(vname)
        vid = lookup.get(key, "")

        if not vid:
            # Prefix fallback
            for lk, lv in lookup.items():
                if key and lk and (key.startswith(lk[:12]) or lk.startswith(key[:12])):
                    vid = lv
                    break

        s["venue_id"] = vid if vid else "v9999"
        if not vid:
            unmatched[vname] = s.get("city", "")

    return list(unmatched.items())


def build_new_venue_entry(next_id, name, city):
    """Create a skeleton venue record for a previously-unseen venue."""
    return {
        "id": f"v{next_id:04d}",
        "name": name,
        "city": city,
        "address": "",
        "lat": None,
        "lng": None,
        "precise": False,
        "show_count": 0,
    }


# ---------------------------------------------------------------------------
# Version bump
# ---------------------------------------------------------------------------

def bump_version(common_js_path, new_version):
    """Replace ?vYYYYMMDD in the JSON fetch calls in common.js."""
    content = open(common_js_path, encoding="utf-8").read()
    updated = re.sub(
        r'(fetch\("data/(?:shows|venues)\.json)\?v\d{8}(")',
        rf'\g<1>?v{new_version}\g<2>',
        content,
    )
    if updated == content:
        print(f"  WARNING: version pattern not found in {common_js_path}")
        return False
    open(common_js_path, "w", encoding="utf-8").write(updated)
    return True


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    base = os.path.dirname(os.path.abspath(__file__))
    shows_path  = os.path.join(base, "data", "shows.json")
    venues_path = os.path.join(base, "data", "venues.json")
    common_js   = os.path.join(base, "assets", "common.js")

    print("=" * 60)
    print("The List -- data update")
    print("=" * 60)

    # 1. Fetch email
    print("\n[1] Fetching latest email from Gmail...")
    service = get_gmail_service()
    subject, email_date, body = fetch_latest_list_email(service)

    # 2. Parse
    print("\n[2] Parsing show listings...")
    shows = parse_body(body)
    print(f"  Parsed {len(shows)} shows")
    dates = sorted(set(s["d"] for s in shows))
    if dates:
        print(f"  Date range: {dates[0]} to {dates[-1]}")

    # 3. Load existing data
    print("\n[3] Loading existing data...")
    old_shows  = json.load(open(shows_path, encoding="utf-8"))
    venues     = json.load(open(venues_path, encoding="utf-8"))
    print(f"  Existing shows: {len(old_shows)}")
    print(f"  Existing venues: {len(venues)}")

    existing_ids = {v["id"] for v in venues}
    next_id = max(
        (int(v["id"][1:]) for v in venues if v["id"][1:].isdigit() and v["id"] != "v9999"),
        default=150,
    ) + 1

    # 4. Assign venue IDs
    print("\n[4] Matching venues...")
    unmatched = assign_venue_ids(shows, venues)

    if unmatched:
        print(f"  {len(unmatched)} new venues (will be added without coordinates):")
        new_venue_map = {}  # name -> new venue entry
        for vname, vcity in sorted(unmatched):
            entry = build_new_venue_entry(next_id, vname, vcity)
            new_venue_map[vname] = entry
            print(f"    {entry['id']}  {vname}  [{vcity}]")
            next_id += 1

        # Re-assign venue_ids for the newly created entries
        extra_lookup = {norm_name(v["name"]): v["id"] for v in new_venue_map.values()}
        for s in shows:
            if s["venue_id"] == "v9999" and s.get("venue"):
                key = norm_name(s["venue"])
                if key in extra_lookup:
                    s["venue_id"] = extra_lookup[key]

        venues = venues + list(new_venue_map.values())
    else:
        print("  All venues matched.")

    # 5. Recount shows per venue
    counts = Counter(s["venue_id"] for s in shows)
    for v in venues:
        v["show_count"] = counts.get(v["id"], 0)

    # 6. Build final shows list
    final_shows = [
        {
            "d": s["d"], "date": s["date"], "wk": s["wk"],
            "bands": s["bands"], "venue_id": s["venue_id"],
            "age": s["age"], "price": s["price"],
            "time": s["time"], "sym": s["sym"], "notes": s["notes"],
        }
        for s in sorted(shows, key=lambda x: x["d"])
    ]

    # 7. Diff summary
    print("\n[5] Change summary...")
    old_set = {(s["d"], s["bands"], s["venue_id"]) for s in old_shows}
    new_set = {(s["d"], s["bands"], s["venue_id"]) for s in final_shows}
    added   = new_set - old_set
    removed = old_set - new_set
    print(f"  Shows added:   {len(added)}")
    print(f"  Shows removed: {len(removed)}")
    print(f"  Shows total:   {len(final_shows)}")
    month_counts = Counter(s["d"] // 100 for s in final_shows)
    print("  Per month:")
    mn = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    for ym in sorted(month_counts):
        yr, mo = divmod(ym, 100)
        print(f"    {mn[mo]} {yr}: {month_counts[ym]}")

    # 8. Write files
    print("\n[6] Writing data files...")
    with open(shows_path, "w", encoding="utf-8") as f:
        json.dump(final_shows, f, indent=1)
    print(f"  Wrote {shows_path}")

    with open(venues_path, "w", encoding="utf-8") as f:
        json.dump(venues, f, indent=1)
    print(f"  Wrote {venues_path}")

    # 9. Bump cache-busting version
    version = date.today().strftime("%Y%m%d")
    print(f"\n[7] Bumping asset version to v{version}...")
    if bump_version(common_js, version):
        print(f"  Updated {common_js}")
    print()

    # 10. Final notes
    new_no_coords = [v for v in venues if v.get("lat") is None and v["id"] not in ("v9999",) and v["id"] >= "v0151"]
    if new_no_coords:
        print("NOTE: The following venues need geocoding (lat/lng are null):")
        for v in sorted(new_no_coords, key=lambda x: -x["show_count"]):
            print(f"  {v['id']}  {v['name']}  [{v['city']}]  ({v['show_count']} shows)")
        print()

    print("Done. Deploy data/shows.json, data/venues.json, and assets/common.js.")


if __name__ == "__main__":
    main()
