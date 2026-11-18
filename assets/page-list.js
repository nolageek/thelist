/* ==========================================================================
   Show List page (index.html)
   Depends on assets/common.js (window.TheList)
   ========================================================================== */
(function () {
  "use strict";
  var T = window.TheList;

  var DATA = [], VENUES = {};
  var sortKey = "d", sortType = "num", sortDir = 1;
  var query = "", monthFilter = "", weekFilter = "", venueFilter = "", cityFilter = "", bandFilter = "";
  var activeSyms = new Set();
  var showPast = false;
  var panel;

  var tbody       = document.getElementById("tbody");
  var rowCount    = document.getElementById("rowCount");
  var searchBox   = document.getElementById("searchBox");
  var monthSelect = document.getElementById("monthSelect");
  var weekSelect  = document.getElementById("weekSelect");
  var venueSelect = document.getElementById("venueSelect");
  var citySelect  = document.getElementById("citySelect");
  var bandSelect  = document.getElementById("bandSelect");
  // only sortable column headers have data-key; non-sortable ones do not
  var headers     = document.querySelectorAll("th[data-key]");

  /* ---- Venue detail panel (right-hand side) ------------------------------ */
  function renderVenuePanel(venueId) {
    var v = VENUES[venueId];
    if (!v) return;
    var shows = DATA.filter(function (r) { return r.venue_id === venueId; })
      .slice().sort(function (a, b) { return a.d - b.d; });

    var content = document.getElementById("sidebarContent");
    var sellOutCount = shows.filter(function (s) { return s.sym.includes("$"); }).length;

    var html = '<div class="panel-head">' +
      "<h2>" + T.escapeHtml(v.name) + "</h2>" +
      '<div class="addr">' + T.escapeHtml(v.city || "") + "</div>" +
      (sellOutCount > 0
        ? '<div class="sellout-summary">' + T.symbolIconHtml("$") + " " +
          sellOutCount + " show" + (sellOutCount === 1 ? "" : "s") + " likely to sell out</div>"
        : "") +
      '<div class="venue-map-link"><a href="map.html?venue=' + encodeURIComponent(venueId) + '">' +
        '<i class="fa-solid fa-map-location-dot"></i> View on map</a></div>' +
      "</div>";

    if (shows.length === 0) {
      html += '<div class="placeholder">No shows listed for this venue.</div>';
    } else {
      html += shows.map(function (s) {
        return '<div class="show-item' + (s.sym.includes("$") ? " sellout" : "") + '"' +
          ' data-d="' + s.d + '" data-vid="' + T.escapeHtml(s.venue_id) + '">' +
          '<div class="srow-top">' +
          '<span class="sdate">' + T.escapeHtml(s.date) + "</span>" +
          '<span class="swk">' + T.escapeHtml(s.wk) + "</span>" +
          '<button class="cal-btn" title="Add to calendar">' + T.CAL_ICON_HTML + "</button>" +
          "</div>" +
          '<div class="sbands">' + T.escapeHtml(s.bands) + "</div>" +
          '<div class="smeta">' + T.escapeHtml(s.age) + " " + T.escapeHtml(s.price) + " " + T.escapeHtml(s.time) +
            ' <span class="ssym">' + T.showSymbolsHtml(s) + "</span></div>" +
          "</div>";
      }).join("");
    }
    content.innerHTML = html;

    // wire ics download buttons
    content.addEventListener("click", function (e) {
      var btn = e.target.closest(".cal-btn");
      if (!btn) return;
      var item = btn.closest("[data-d]");
      if (!item) return;
      var d = Number(item.dataset.d);
      var vid = item.dataset.vid;
      var show = DATA.find(function (r) { return r.d === d && r.venue_id === vid; });
      if (show) T.downloadIcs(show);
    });

    panel.open();
  }

  /* ---- Filter dropdown population ---------------------------------------- */
  function populateFilters(venueList) {
    // Month dropdown, grouped by year
    var monthKeys = [...new Set(DATA.map(function (r) { return Math.floor(r.d / 100); }))].sort(function (a, b) { return a - b; });
    var mGroup = null, mYear = null;
    monthKeys.forEach(function (mk) {
      var year = Math.floor(mk / 100), month = mk % 100;
      if (year !== mYear) {
        mGroup = document.createElement("optgroup");
        mGroup.label = String(year);
        monthSelect.appendChild(mGroup);
        mYear = year;
      }
      var opt = document.createElement("option");
      opt.value = String(mk);
      opt.textContent = T.MONTH_NAMES[month];
      mGroup.appendChild(opt);
    });

    // Week dropdown -- quick-picks first, then per-week optgroups grouped by year
    var quickGroup = document.createElement("optgroup");
    quickGroup.label = "Quick pick";
    [
      { value: "range:this-week",    label: "This week (Mon-Sun)" },
      { value: "range:this-weekend", label: "This weekend (Fri-Sun)" },
      { value: "range:next-week",    label: "Next week" },
      { value: "range:next-weekend", label: "Next weekend (Fri-Sun)" },
      { value: "range:two-weeks",    label: "Next two weeks" },
    ].forEach(function (item) {
      var opt = document.createElement("option");
      opt.value = item.value;
      opt.textContent = item.label;
      quickGroup.appendChild(opt);
    });
    weekSelect.appendChild(quickGroup);

    var weekKeys = [...new Set(DATA.map(function (r) { return T.intFromDate(T.mondayOf(T.dFromInt(r.d))); }))].sort(function (a, b) { return a - b; });
    var wGroup = null, wYear = null;
    weekKeys.forEach(function (wk) {
      var year = Math.floor(wk / 10000);
      if (year !== wYear) {
        wGroup = document.createElement("optgroup");
        wGroup.label = String(year);
        weekSelect.appendChild(wGroup);
        wYear = year;
      }
      var opt = document.createElement("option");
      opt.value = String(wk);
      opt.textContent = T.weekLabel(wk);
      wGroup.appendChild(opt);
    });

    // Venue dropdown, alphabetical
    venueList.filter(function (v) { return v.show_count > 0; })
      .slice()
      .sort(function (a, b) { return a.name.localeCompare(b.name); })
      .forEach(function (v) {
        var opt = document.createElement("option");
        opt.value = v.id;
        opt.textContent = T.venueShortName(v.name) + (v.city ? " (" + v.city + ")" : "");
        venueSelect.appendChild(opt);
      });

    // City dropdown, alphabetical with counts
    var cityCounts = new Map();
    DATA.forEach(function (r) {
      if (!r.cityNorm) return;
      cityCounts.set(r.cityNorm, (cityCounts.get(r.cityNorm) || 0) + 1);
    });
    [...cityCounts.keys()].sort(function (a, b) { return a.localeCompare(b); }).forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c + " (" + cityCounts.get(c) + ")";
      citySelect.appendChild(opt);
    });

    // Band dropdown, deduped + sorted
    var bandSet = new Set();
    DATA.forEach(function (r) { T.bandTokens(r.bands).forEach(function (b) { bandSet.add(b); }); });
    [...bandSet].sort(function (a, b) { return a.localeCompare(b, undefined, { sensitivity: "base" }); }).forEach(function (b) {
      var opt = document.createElement("option");
      opt.value = b;
      opt.textContent = b;
      bandSelect.appendChild(opt);
    });
  }

  /* ---- Render table -------------------------------------------------------- */
  function render() {
    var today = T.todayInt();
    var rows = DATA.filter(function (r) {
      if (!showPast && r.d < today) return false;
      if (monthFilter && Math.floor(r.d / 100) !== Number(monthFilter)) return false;
      if (weekFilter) {
        if (weekFilter.indexOf("range:") === 0) {
          var rng = T.dateRange(weekFilter.slice(6));
          if (!rng || r.d < rng.from || r.d > rng.to) return false;
        } else {
          if (T.intFromDate(T.mondayOf(T.dFromInt(r.d))) !== Number(weekFilter)) return false;
        }
      }
      if (venueFilter && r.venue_id !== venueFilter) return false;
      if (cityFilter && r.cityNorm !== cityFilter) return false;
      if (bandFilter && !T.bandTokens(r.bands).includes(bandFilter)) return false;
      if (query) {
        var hay = (r.bands + " " + r.venueName + " " + r.city).toLowerCase();
        if (!hay.includes(query.toLowerCase())) return false;
      }
      if (activeSyms.size > 0) {
        for (var s of activeSyms) {
          if (s === "a/a") { if (r.age !== "a/a") return false; }
          else if (!r.sym.includes(s)) { return false; }
        }
      }
      return true;
    });

    // Only date, price, time are sortable now
    rows.sort(function (a, b) {
      var av = a[sortKey], bv = b[sortKey];
      if (sortType === "num") {
        av = Number(av) || 0; bv = Number(bv) || 0;
        if (av !== bv) return (av - bv) * sortDir;
        return Number(a.d) - Number(b.d);
      } else {
        av = (av || "").toString().toLowerCase();
        bv = (bv || "").toString().toLowerCase();
        if (av < bv) return -1 * sortDir;
        if (av > bv) return 1 * sortDir;
        return Number(a.d) - Number(b.d);
      }
    });

    rowCount.textContent = rows.length + " of " + DATA.length + " shows";

    if (rows.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="9">No shows match that search.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(function (r) {
      var calBtn = '<button class="cal-btn" title="Add to calendar">' + T.CAL_ICON_HTML + "</button>";
      const showAge = T.escapeHtml(r.age) == "a/a" ? "all" : T.escapeHtml(r.age);
      return '<tr data-d="' + r.d + '" data-vid="' + T.escapeHtml(r.venue_id) + '">' +
        '<td class="col-date">' + T.escapeHtml(r.date) + '<span class="wk">' + T.escapeHtml(r.wk) + "</span></td>" +
        '<td class="col-cal">' + calBtn + "</td>" +
        '<td class="col-bands" data-label="Bands">' + T.highlight(r.bands, query) + "</td>" +
        // venue name: click opens right panel instead of navigating to map
        '<td class="col-venue" data-label="Venue"><a class="venue-panel-link" href="#" data-vid="' + T.escapeHtml(r.venue_id) + '">' + T.highlight(r.venueName, query) + "</a>" +
          (r.city ? '<span class="city">' + T.highlight(r.city, query) + "</span>" : "") + "</td>" +
        '<td class="col-age" data-label="Age">' + showAge + "</td>" +
        '<td class="col-price" data-label="Price">' + T.escapeHtml(r.price) + "</td>" +
        '<td class="col-time" data-label="Time">' + T.escapeHtml(r.time) + "</td>" +
        '<td class="col-sym" data-label="Attrs">' + T.showAllSymbolsHtml(r) + "</td>" +
        '<td class="col-notes" data-label="Notes">' + T.escapeHtml(r.notes) + "</td>" +

        "</tr>";
    }).join("");
  }

  /* ---- Event wiring -------------------------------------------------------- */
  function wireEvents() {
    // Column sort: only date, price, time headers have data-key now
    headers.forEach(function (th) {
      th.addEventListener("click", function () {
        var key = th.dataset.key, type = th.dataset.type;
        if (sortKey === key) { sortDir *= -1; }
        else { sortKey = key; sortType = type; sortDir = 1; }
        headers.forEach(function (h) { h.classList.remove("sorted"); h.querySelector(".arrow").innerHTML = "&#9650;"; });
        th.classList.add("sorted");
        th.querySelector(".arrow").innerHTML = sortDir === 1 ? "&#9650;" : "&#9660;";
        render();
      });
    });

    // Search + filter controls
    searchBox.addEventListener("input",    function (e) { query       = e.target.value.trim(); render(); });
    monthSelect.addEventListener("change", function (e) { monthFilter = e.target.value; render(); });
    weekSelect.addEventListener("change",  function (e) { weekFilter  = e.target.value; render(); });
    venueSelect.addEventListener("change", function (e) { venueFilter = e.target.value; render(); });
    citySelect.addEventListener("change",  function (e) { cityFilter  = e.target.value; render(); });
    bandSelect.addEventListener("change",  function (e) { bandFilter  = e.target.value; render(); });

    // Past-events toggle
    var pastBtn = document.getElementById("pastToggle");
    if (pastBtn) {
      pastBtn.addEventListener("click", function () {
        showPast = !showPast;
        pastBtn.classList.toggle("active", showPast);
        render();
      });
    }

    // Venue panel: click on venue name opens right panel (event delegation)
    tbody.addEventListener("click", function (e) {
      var link = e.target.closest(".venue-panel-link");
      if (link) {
        e.preventDefault();
        renderVenuePanel(link.dataset.vid);
        return;
      }
      // Cal-download buttons
      var btn = e.target.closest(".cal-btn");
      if (!btn) return;
      var row = btn.closest("tr[data-d]");
      if (!row) return;
      var d = Number(row.dataset.d);
      var vid = row.dataset.vid;
      var show = DATA.find(function (r) { return r.d === d && r.venue_id === vid; });
      if (show) T.downloadIcs(show);
    });
  }

  /* ---- Init ---------------------------------------------------------------- */
  async function init() {
    T.initNavDrawer();
    panel = T.initDetailPanel();
    T.initCollapsiblePanel();
    T.buildLegend(document.getElementById("legend"));
    T.buildChips(document.getElementById("symChips"), function (sym, isActive) {
      if (isActive) { activeSyms.add(sym); } else { activeSyms.delete(sym); }
      render();
    });
    var calHead = document.getElementById("calHead");
    if (calHead) calHead.innerHTML = T.CAL_ICON_HTML;
    try {
      var loaded = await T.loadData();
      DATA = loaded.data;
      VENUES = loaded.venues;
      populateFilters(loaded.venueList);
      wireEvents();
      render();
    } catch (err) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="9">Could not load data/shows.json or data/venues.json. ' +
        "If you opened this file directly, run a local server (e.g. <code>python3 -m http.server</code>) " +
        "or view it via GitHub Pages, since browsers block fetch() of local files opened with file://.</td></tr>";
      console.error(err);
    }
  }

  init();
})();