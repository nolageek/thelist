# Bay Area Shows

A static site for browsing "The List" (the weekly San Francisco Area Music
List email) as a sortable table, an interactive venue map, and a calendar.

## Structure

```
index.html          Sortable / searchable show table
map.html            Leaflet map of venues; click a marker for that venue's shows
calendar.html       Month grid; click a day for its full lineup

assets/
  styles.css        ONE shared stylesheet for all three pages
  common.js         Shared helpers, data loading, nav drawer, detail panel
  page-list.js      Logic specific to index.html
  page-map.js       Logic specific to map.html
  page-calendar.js  Logic specific to calendar.html

data/
  shows.json        One record per show, references venue_id
  venues.json       One record per venue, with geocoded lat/lng
  shows.csv         Same data as shows.json, flat CSV
  venues.csv        Same data as venues.json, flat CSV
```

All three pages are plain HTML that load `assets/styles.css`, then
`assets/common.js`, then their own `page-*.js`. There is no build step.

## How the code is organized

Everything that used to be copy-pasted across the three HTML files now lives
in one place:

- All CSS is in `assets/styles.css`. Pages that use the full-height
  two-column layout (map, calendar) put `class="app"` on their `<html>` tag,
  which switches on the viewport-height rules. The list page omits it.
- All shared JavaScript is in `assets/common.js`, exposed on a single global
  object called `TheList`. That includes: the attribute-icon definitions,
  HTML escaping and highlighting, band/venue/city parsing, date helpers, the
  `loadData()` fetch-and-join routine, the mobile nav drawer, and the mobile
  slide-in detail panel.
- Each page's unique behavior (the table, the map, the calendar grid) lives
  in its own `page-*.js` and calls into `TheList` for the shared pieces.

To change a color, a font, the nav, or any shared behavior, edit the one
shared file and all three pages update together.

## Data format

### venues.json
```json
{
  "id": "v0042",
  "name": "The Chapel",
  "city": "S.F.",
  "address": "777 Valencia St, San Francisco, CA 94110, USA",
  "lat": 37.7604864,
  "lng": -122.4212979,
  "precise": true,
  "show_count": 58
}
```
`precise: false` means the venue could not be reliably geocoded (a few small
DIY / house-show spaces); `lat`/`lng` fall back to an approximate location or
are `null`.

### shows.json
```json
{
  "d": 20260626,
  "date": "jun 26",
  "wk": "fri",
  "bands": "Damned Of Eden, Bill Wonka, Grotesque, No Ambition, Violent Opposition",
  "venue_id": "v0001",
  "age": "a/a",
  "price": "$12/$15",
  "time": "6pm/7pm",
  "sym": ["@"],
  "notes": ""
}
```
`d` is `YYYYMMDD` as an integer, for easy chronological sorting. `sym` holds
the legend symbols that applied to that show:

```
*    recommended show          a/a  all ages
$    will probably sell out     @    pit warning
^    under 21 buy drink tix     #    no ins/outs
```

## Hosting on GitHub Pages

1. Push this folder to a repo (root, or a `/docs` folder).
2. In the repo Settings -> Pages, set the source to that branch/folder.
3. It will be live at `https://<username>.github.io/<repo>/`.

No build process is needed; it is static HTML, CSS, JS, and JSON.

## Running locally

Because the pages use `fetch()` to load the JSON, opening the HTML files
directly with a `file://` path will not work (browsers block local fetch).
Run a local server from this folder instead:

```
python3 -m http.server
```

Then visit `http://localhost:8000/`.

## Updating the data when a new List comes out

Replace `data/shows.json` and `data/venues.json` (and optionally the matching
CSVs). The pages read those files at load time and rebuild all filters, the
map markers, and the calendar automatically; no code changes are needed as
long as the JSON keeps the same field names shown above.

## Known data caveats

- A handful of entries had no listed time, price, or city in the source text;
  those fields are blank.
- A few small / informal venues could not be matched to a real address via
  geocoding and use an approximate pin (`precise: false`).
- Source typos in venue names and cities were normalized during parsing; the
  canonical name is what is shown.
