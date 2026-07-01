/* ==========================================================================
   The List - shared front-end helpers
   Loaded by every page before its page-specific script.
   Everything is attached to the global `TheList` object.
   ========================================================================== */
(function () {
  "use strict";

  /* ---- Constants --------------------------------------------------------- */
  var MONTH_NAMES = {1:"January",2:"February",3:"March",4:"April",5:"May",6:"June",7:"July",8:"August",9:"September",10:"October",11:"November",12:"December"};
  var MONTH_ABBR = {1:"Jan",2:"Feb",3:"Mar",4:"Apr",5:"May",6:"Jun",7:"Jul",8:"Aug",9:"Sep",10:"Oct",11:"Nov",12:"Dec"};

  var SYMBOL_ICONS = {
    "*":   { icon: "fa-star",                cls: "ic-star",       title: "Recommended show" },
    "$":   { icon: "fa-fire",                cls: "ic-fire",       title: "Will probably sell out" },
    "^":   { icon: "fa-cake-candles",        cls: "ic-cake",       title: "Under 21 must buy drink tickets" },
    "a/a": { icon: "fa-hands-holding-child", cls: "ic-handschild", title: "All ages" },
    "@":   { icon: "fa-user-injured",        cls: "ic-injured",    title: "Pit warning" },
    "#":   { icon: "fa-door-closed",         cls: "ic-door",       title: "No ins/outs" }
  };

  /* ---- Text / HTML helpers ---------------------------------------------- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function highlight(text, q) {
    if (!q) return escapeHtml(text);
    var idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return escapeHtml(text);
    return escapeHtml(text.slice(0, idx)) +
      "<mark>" + escapeHtml(text.slice(idx, idx + q.length)) + "</mark>" +
      escapeHtml(text.slice(idx + q.length));
  }

  function symbolIconHtml(sym) {
    var info = SYMBOL_ICONS[sym];
    if (!info) return escapeHtml(sym);
    return '<i class="fa-solid ' + info.icon + " " + info.cls + '" title="' + info.title + '"></i>';
  }

  // Renders the attribute icons for a show: all-ages icon first (if a/a), then symbols.
  function showSymbolsHtml(show) {
    var parts = (show.age === "a/a") ? [symbolIconHtml("a/a")] : [];
    return parts.concat((show.sym || []).map(symbolIconHtml)).join(" ");
  }

  /* ---- Band / venue / city parsing -------------------------------------- */

  // Split a comma-joined band string into individual band names, without
  // breaking thousands-separated numbers like "10,000 Maniacs".
  function bandTokens(bandsStr) {
    var protectedStr = bandsStr.replace(/(\d),(\d{3}\b)/g, "$1\u0001$2");
    return protectedStr.split(",")
      .map(function (s) { return s.trim().replace(/\u0001/g, ","); })
      .filter(Boolean);
  }

  // Strip a trailing ", <street address>" so a venue shows just its business
  // name. Venues whose whole name is an address (no comma) are left as-is.
  function venueShortName(name) {
    var idx = name.indexOf(",");
    return idx === -1 ? name : name.slice(0, idx).trim();
  }

  // Collapse the source's inconsistent city spellings into one canonical form.
  function normalizeCity(city) {
    if (!city) return "";
    var c = city.trim();
    var lc = c.toLowerCase().replace(/\./g, "");
    if (lc === "sf" || lc === "san francisco") return "S.F.";
    if (lc === "berkely") return "Berkeley";
    if (lc === "albanu") return "Albany";
    if (lc === "daily city") return "Daly City";
    if (lc === "memlo park") return "Menlo Park";
    if (lc === "mountain veiw") return "Mountain View";
    return c;
  }

  /* ---- Date helpers (dates are stored as YYYYMMDD integers) -------------- */
  function dFromInt(d) {
    var s = String(d);
    return new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
  }
  function intFromDate(dt) {
    return dt.getFullYear() * 10000 + (dt.getMonth() + 1) * 100 + dt.getDate();
  }
  function mondayOf(dt) {
    var day = dt.getDay();
    var diff = (day === 0 ? -6 : 1 - day);
    var m = new Date(dt);
    m.setDate(dt.getDate() + diff);
    return m;
  }
  function weekLabel(mondayInt) {
    var start = dFromInt(mondayInt);
    var end = new Date(start);
    end.setDate(start.getDate() + 6);
    var sameMonth = start.getMonth() === end.getMonth();
    var crossesYear = start.getFullYear() !== end.getFullYear();
    var startStr = MONTH_ABBR[start.getMonth() + 1] + " " + start.getDate();
    var endStr = (sameMonth && !crossesYear ? "" : MONTH_ABBR[end.getMonth() + 1] + " ") +
      end.getDate() + (crossesYear ? ", " + end.getFullYear() : "");
    return startStr + " \u2013 " + endStr;
  }

  /* ---- Data loading ------------------------------------------------------ */
  // Fetches shows + venues, indexes venues by id, and returns a joined dataset.
  // Each returned show gets: venueName, city, cityNorm, symstr, plus a
  // `venues` map and `venueList` array.
  async function loadData() {
    var res = await Promise.all([
      fetch("data/shows.json"),
      fetch("data/venues.json")
    ]);
    var shows = await res[0].json();
    var venueList = await res[1].json();

    var venues = {};
    venueList.forEach(function (v) { venues[v.id] = v; });

    var data = shows.map(function (s) {
      var v = venues[s.venue_id] || { name: "(unknown venue)", city: "" };
      return Object.assign({}, s, {
        venueName: v.name,
        city: v.city,
        cityNorm: normalizeCity(v.city),
        symstr: (s.sym || []).join(" ")
      });
    });

    return { shows: shows, venueList: venueList, venues: venues, data: data };
  }

  /* ---- Mobile nav drawer ------------------------------------------------- */
  // Wires the hamburger button, close button, backdrop, and link taps.
  function initNavDrawer() {
    var toggle = document.getElementById("navToggle");
    var links = document.getElementById("navLinks");
    var backdrop = document.getElementById("navBackdrop");
    var closeBtn = document.getElementById("navClose");
    if (!toggle || !links || !backdrop) return;

    function open() { links.classList.add("open"); backdrop.classList.add("open"); }
    function close() { links.classList.remove("open"); backdrop.classList.remove("open"); }

    toggle.addEventListener("click", open);
    if (closeBtn) closeBtn.addEventListener("click", close);
    backdrop.addEventListener("click", close);
    links.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", close);
    });
  }

  /* ---- Mobile slide-in detail panel (map + calendar) -------------------- */
  // Returns { open, close } for the right-hand #sidebar panel.
  function initDetailPanel() {
    var sidebar = document.getElementById("sidebar");
    var closeBtn = document.getElementById("panelClose");
    var backdrop = document.getElementById("panelBackdrop");

    function open() {
      if (sidebar) sidebar.classList.add("open");
      if (backdrop) backdrop.classList.add("open");
    }
    function close() {
      if (sidebar) sidebar.classList.remove("open");
      if (backdrop) backdrop.classList.remove("open");
    }

    if (closeBtn) closeBtn.addEventListener("click", close);
    if (backdrop) backdrop.addEventListener("click", close);

    return { open: open, close: close };
  }

  /* ---- Export ------------------------------------------------------------ */
  window.TheList = {
    MONTH_NAMES: MONTH_NAMES,
    MONTH_ABBR: MONTH_ABBR,
    SYMBOL_ICONS: SYMBOL_ICONS,
    escapeHtml: escapeHtml,
    highlight: highlight,
    symbolIconHtml: symbolIconHtml,
    showSymbolsHtml: showSymbolsHtml,
    bandTokens: bandTokens,
    venueShortName: venueShortName,
    normalizeCity: normalizeCity,
    dFromInt: dFromInt,
    intFromDate: intFromDate,
    mondayOf: mondayOf,
    weekLabel: weekLabel,
    loadData: loadData,
    initNavDrawer: initNavDrawer,
    initDetailPanel: initDetailPanel
  };
})();
