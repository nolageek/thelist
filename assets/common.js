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
    "*":   { icon: "fa-star",                color: "#ca8a04", title: "Recommended show" },
    "$":   { icon: "fa-fire",                color: "#ffa200", title: "Will probably sell out" },
    "^":   { icon: "fa-ticket",        color: "#f0827a", title: "Under 21 Must Buy Drink Tickets" },
    "a/a": { icon: "fa-person-breastfeeding", color: "#7dd6ff", title: "All Ages" },
    "@":   { icon: "fa-user-injured",        color: "#ff1100", title: "Pit warning" },
    "#":   { icon: "fa-door-closed",         color: "#92400e", title: "No ins/outs" }
  };

  // Calendar-add button icon. Change here and it updates everywhere.
  var CAL_ICON = "fa-calendar-plus";

  // Pre-built HTML snippet for the calendar-add button icon (used in JS templates).
  var CAL_ICON_HTML = '<i class="fa-solid fa-fw ' + CAL_ICON + '" style="color:#5cbf69"></i>';

  // Build the attribute filter chips into a container element and wire click events.
  // onToggle(sym, isActive) is called whenever a chip is toggled.
  function buildChips(el, onToggle) {
    if (!el) return;
    el.innerHTML = SYMBOL_ORDER.map(function (sym) {
      var info = SYMBOL_ICONS[sym];
      return '<span class="chip" data-sym="' + sym + '" title="' + info.title + '">' +
        '<i class="fa-solid fa-fw ' + info.icon + '" style="color:' + info.color + '"></i>' +
        "</span>";
    }).join("");
    if (onToggle) {
      el.querySelectorAll(".chip[data-sym]").forEach(function (chip) {
        chip.addEventListener("click", function () {
          var active = chip.classList.toggle("active");
          onToggle(chip.dataset.sym, active);
        });
      });
    }
  }

  // Build the legend list into a container element.
  // Replaces the inner HTML of el with one <div> per symbol.
  function buildLegend(el) {
    if (!el) return;
    var LEGEND_LABELS = {
      "*":   "Recommendable Show",
      "$":   "Will Probably Sell Out",
      "^":   "Under 21 Must Buy Drink Tickets",
      "a/a": "All Ages",
      "@":   "Pit Warning",
      "#":   "No Ins/Outs"
    };
    el.innerHTML = SYMBOL_ORDER.map(function (sym) {
      var info = SYMBOL_ICONS[sym];
      return '<div><span class="k"><i class="fa-solid fa-fw ' + info.icon + '" style="color:' + info.color + '"></i></span>' +
        LEGEND_LABELS[sym] + "</div>";
    }).join("");
  }

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

  // Active symbol: render with inline color from SYMBOL_ICONS.
  function symbolIconHtml(sym) {
    var info = SYMBOL_ICONS[sym];
    if (!info) return escapeHtml(sym);
    return '<i class="fa-solid fa-fw ' + info.icon + '" style="color:' + info.color + '" title="' + info.title + '"></i>';
  }

  // Renders the attribute icons for a show: all-ages icon first (if a/a), then symbols.
  // Used in detail panels where we only show the applicable icons.
  function showSymbolsHtml(show) {
    var parts = (show.age === "a/a") ? [symbolIconHtml("a/a")] : [];
    return parts.concat((show.sym || []).map(symbolIconHtml)).join(" ");
  }

  // Renders ALL six icons for a table row.
  // Active icons get their color inline; inactive icons get class="sym-off" (greyed by CSS).
  var SYMBOL_ORDER = ["*", "$", "^", "a/a", "@", "#"];
  function showAllSymbolsHtml(show) {
    return SYMBOL_ORDER.map(function (sym) {
      var info = SYMBOL_ICONS[sym];
      var active = (sym === "a/a") ? show.age === "a/a" : (show.sym || []).includes(sym);
      if (active) {
        return '<i class="fa-solid fa-fw ' + info.icon + '" style="color:' + info.color + '" title="' + info.title + '"></i>';
      }
      return '<i class="fa-solid fa-fw ' + info.icon + ' sym-off" title="' + info.title + '"></i>';
    }).join("");
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

  /* ---- Calendar event (.ics) download --------------------------------------- */
  function parseShowTime(timeStr) {
    if (!timeStr) return null;
    var s = timeStr.split("/")[0].trim();
    var m = s.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/i);
    if (!m) return null;
    var h = parseInt(m[1], 10);
    var min = parseInt(m[2] || "0", 10);
    var ampm = m[3].toLowerCase();
    if (ampm === "pm" && h !== 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    return { h: h, m: min };
  }

  // show must have: d (YYYYMMDD int), bands, venueName, city, age, price, time, venue_id
  function downloadIcs(show) {
    var ds = String(show.d);
    var y = ds.slice(0, 4), mo = ds.slice(4, 6), day = ds.slice(6, 8);
    function pad(n) { return String(n).padStart(2, "0"); }

    var time = parseShowTime(show.time);
    var dtStart, dtEnd;
    if (time) {
      var endH = time.h + 2; // assume 2-hour duration
      dtStart = "DTSTART:" + y + mo + day + "T" + pad(time.h) + pad(time.m) + "00";
      dtEnd   = "DTEND:"   + y + mo + day + "T" + pad(endH)   + pad(time.m) + "00";
    } else {
      dtStart = "DTSTART;VALUE=DATE:" + y + mo + day;
      dtEnd   = "DTEND;VALUE=DATE:"   + y + mo + day;
    }

    var title = show.bands.split(",")[0].trim() + " @ " + venueShortName(show.venueName);
    var venue = show.venueName + (show.city ? ", " + show.city : "");
    var uid = "thelist-" + show.d + "-" + show.venue_id + "@stevelist.com";

    function icsEsc(s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }

    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//The List Bay Area//EN",
      "BEGIN:VEVENT",
      "UID:" + uid,
      dtStart,
      dtEnd,
      "SUMMARY:" + icsEsc(title),
      "DESCRIPTION:" + icsEsc(show.bands),
      "LOCATION:" + icsEsc(venue),
      "END:VEVENT",
      "END:VCALENDAR"
    ];

    var blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "show-" + show.d + "-" + show.time + "-" + show.venue_id + ".ics";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
  }

  function todayInt() {
    return intFromDate(new Date());
  }

  // Returns {from, to} as YYYYMMDD ints for a named range.
  // Range names: this-week, this-weekend, next-week, next-weekend, two-weeks
  function dateRange(name) {
    var now = new Date();
    var dow = now.getDay(); // 0=Sun, 1=Mon ... 6=Sat
    var daysToMon = (dow === 0 ? -6 : 1 - dow);
    function addDays(base, n) { var d = new Date(base); d.setDate(d.getDate() + n); return d; }

    var thisMon = addDays(now, daysToMon);
    var thisSun = addDays(thisMon, 6);
    var thisFri = addDays(thisMon, 4);
    var nextMon = addDays(thisMon, 7);
    var nextSun = addDays(thisMon, 13);
    var nextFri = addDays(thisMon, 11);
    var twoWeeksSun = addDays(thisMon, 20); // Mon + 20 = third Sunday from this Mon

    var ranges = {
      "this-week":    { from: intFromDate(thisMon), to: intFromDate(thisSun) },
      "this-weekend": { from: intFromDate(thisFri), to: intFromDate(thisSun) },
      "next-week":    { from: intFromDate(nextMon), to: intFromDate(nextSun) },
      "next-weekend": { from: intFromDate(nextFri), to: intFromDate(nextSun) },
      "two-weeks":    { from: intFromDate(thisMon), to: intFromDate(twoWeeksSun) },
    };
    return ranges[name] || null;
  }
  // Fetches shows + venues, indexes venues by id, and returns a joined dataset.
  // Each returned show gets: venueName, city, cityNorm, symstr, plus a
  // `venues` map and `venueList` array.
  async function loadData() {
    var res = await Promise.all([
      fetch("data/shows.json?v20261118"),
      fetch("data/venues.json?v20261118")
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
      if (!sidebar) return;
      // If the sidebar is currently collapsed (desktop), expand it first
      if (sidebar.classList.contains("collapsed")) {
        var main = sidebar.closest(".list-main") || sidebar.closest(".main");
        sidebar.classList.remove("collapsed");
        if (main) main.classList.remove("panel-collapsed");
        // flip the collapse button chevron back
        var collapseBtn = sidebar.querySelector(".panel-collapse-btn i");
        if (collapseBtn) {
          collapseBtn.className = "fa-solid fa-chevron-right";
        }
      }
      sidebar.classList.add("open");
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

  /* ---- Desktop collapsible sidebar --------------------------------------- */
  // Adds a toggle handle button to #sidebar and wires it.
  // Call from page-map.js and page-calendar.js init().
  function initCollapsiblePanel() {
    var sidebar = document.getElementById("sidebar");
    var main = sidebar && (sidebar.closest(".list-main") || sidebar.closest(".main"));
    if (!sidebar || !main) return;
    var btn = document.createElement("button");
    btn.className = "panel-collapse-btn";
    btn.setAttribute("aria-label", "Toggle panel");
    btn.setAttribute("title", "Collapse/expand panel");
    btn.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
    sidebar.appendChild(btn);

    var collapsed = false;
    btn.addEventListener("click", function () {
      collapsed = !collapsed;
      sidebar.classList.toggle("collapsed", collapsed);
      main.classList.toggle("panel-collapsed", collapsed);
      btn.innerHTML = collapsed
        ? '<i class="fa-solid fa-chevron-left"></i>'
        : '<i class="fa-solid fa-chevron-right"></i>';
    });
  }

  /* ---- Export ------------------------------------------------------------ */
  window.TheList = {
    MONTH_NAMES: MONTH_NAMES,
    MONTH_ABBR: MONTH_ABBR,
    SYMBOL_ICONS: SYMBOL_ICONS,
    CAL_ICON_HTML: CAL_ICON_HTML,
    escapeHtml: escapeHtml,
    highlight: highlight,
    symbolIconHtml: symbolIconHtml,
    showSymbolsHtml: showSymbolsHtml,
    showAllSymbolsHtml: showAllSymbolsHtml,
    buildChips: buildChips,
    buildLegend: buildLegend,
    bandTokens: bandTokens,
    venueShortName: venueShortName,
    normalizeCity: normalizeCity,
    dFromInt: dFromInt,
    intFromDate: intFromDate,
    todayInt: todayInt,
    dateRange: dateRange,
    mondayOf: mondayOf,
    weekLabel: weekLabel,
    loadData: loadData,
    parseShowTime: parseShowTime,
    downloadIcs: downloadIcs,
    initNavDrawer: initNavDrawer,
    initDetailPanel: initDetailPanel,
    initCollapsiblePanel: initCollapsiblePanel
  };
})();