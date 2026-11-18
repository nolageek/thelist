# The List (Bay Area Shows)

A static site for browsing Steve Koepke's weekly San Francisco Area Music List
as a filterable table, a venue map, and a calendar. No build step.

## Structure

```
index.html       Show list (sort by date/price/time, filters, venue side panel)
map.html         Leaflet venue map with search, city and attribute filters
calendar.html    Month calendar; click a day for its lineup
about.html       Credits and symbol legend
assets/
  styles.css     All styles; colors are CSS variables
  common.js      Shared helpers (window.TheList), SYMBOL_ICONS, data loading
  page-list.js, page-map.js, page-calendar.js
data/
  shows.json            One record per show
  venues.json           One record per venue (lat/lng)
  venues_directory.json Contact info for ~185 venues (not yet merged)
update_data.py   Gmail -> shows.json/venues.json + cache-bust version bump
```

## Data format

venues.json: `{id, name, city, address, lat, lng, precise, show_count}`.
`v9999` is "(venue not listed)". Venues with null lat/lng do not appear on the
map until geocoded.

shows.json: `{d, date, wk, bands, venue_id, age, price, time, sym[], notes}`.
`d` is YYYYMMDD as an integer. Symbols: `*` recommended, `$` likely to sell
out, `@` pit warning, `^` under 21 must buy drink tix, `#` no ins/outs.

## Local testing

fetch() is blocked on file://, so serve it:

```
python3 -m http.server
```

## Updating the data

```
pip install google-auth google-auth-oauthlib google-api-python-client
python3 update_data.py
```

Needs `credentials.json` (Google OAuth client, Gmail read-only). `token.json`
is created on first run. Neither file is committed (see .gitignore). The script
fetches the latest email from skoepke@stevelist.com, parses it, adds skeleton
entries for new venues, prints a diff summary, writes the JSON, and bumps the
`?v` cache-bust string in common.js. New venues need lat/lng added by hand.

## Hosting on GitHub Pages

1. Push the repo root to GitHub.
2. Settings -> Pages -> deploy from branch (main, / root).
3. Live at `https://<username>.github.io/<repo>/`.

After changing anything in assets/, bump the `?v` string in the HTML files so
browsers fetch fresh copies.

## Known caveats

- New venues v0151-v0171 have no coordinates yet.
- Some entries have no time, price or city in the source email; those are blank.
- Source typos in venue names are normalized via VENUE_ALIASES in update_data.py.
