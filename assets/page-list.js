/* ==========================================================================
   Show List page (index.html)
   Depends on assets/common.js (window.TheList)
   ========================================================================== */
(function () {
  "use strict";
  var T = window.TheList;

  var DATA = [];
  var sortKey = "d", sortType = "num", sortDir = 1;
  var query = "", monthFilter = "", weekFilter = "", venueFilter = "", cityFilter = "", bandFilter = "";
  var activeSyms = new Set();

  var tbody = document.getElementById("tbody");
  var rowCount = document.getElementById("rowCount");
  var searchBox = document.getElementById("searchBox");
  var monthSelect = document.getElementById("monthSelect");
  var weekSelect = document.getElementById("weekSelect");
  var venueSelect = document.getElementById("venueSelect");
  var citySelect = document.getElementById("citySelect");
  var bandSelect = document.getElementById("bandSelect");
  var headers = document.querySelectorAll("th[data-key]");

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

    // Week dropdown (Monday-Sunday buckets), grouped by year
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

    // City dropdown, alphabetical, with counts
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

  function render() {
    var rows = DATA.filter(function (r) {
      if (monthFilter && Math.floor(r.d / 100) !== Number(monthFilter)) return false;
      if (weekFilter && T.intFromDate(T.mondayOf(T.dFromInt(r.d))) !== Number(weekFilter)) return false;
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
      tbody.innerHTML = '<tr class="empty-row"><td colspan="8">No shows match that search.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(function (r) {
      return "<tr>" +
        '<td class="col-date">' + T.escapeHtml(r.date) + '<span class="wk">' + T.escapeHtml(r.wk) + "</span></td>" +
        '<td class="col-bands">' + T.highlight(r.bands, query) + "</td>" +
        '<td class="col-venue"><a href="map.html?venue=' + encodeURIComponent(r.venue_id) + '">' + T.highlight(r.venueName, query) + "</a>" +
          (r.city ? '<span class="city">' + T.highlight(r.city, query) + "</span>" : "") + "</td>" +
        '<td class="col-age">' + T.escapeHtml(r.age) + "</td>" +
        '<td class="col-price">' + T.escapeHtml(r.price) + "</td>" +
        '<td class="col-time">' + T.escapeHtml(r.time) + "</td>" +
        '<td class="col-sym">' + T.showSymbolsHtml(r) + "</td>" +
        '<td class="col-notes">' + T.escapeHtml(r.notes) + "</td>" +
        "</tr>";
    }).join("");
  }

  function wireEvents() {
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
    searchBox.addEventListener("input", function (e) { query = e.target.value.trim(); render(); });
    monthSelect.addEventListener("change", function (e) { monthFilter = e.target.value; render(); });
    weekSelect.addEventListener("change", function (e) { weekFilter = e.target.value; render(); });
    venueSelect.addEventListener("change", function (e) { venueFilter = e.target.value; render(); });
    citySelect.addEventListener("change", function (e) { cityFilter = e.target.value; render(); });
    bandSelect.addEventListener("change", function (e) { bandFilter = e.target.value; render(); });
    document.querySelectorAll(".chip[data-sym]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var sym = chip.dataset.sym;
        if (activeSyms.has(sym)) { activeSyms.delete(sym); chip.classList.remove("active"); }
        else { activeSyms.add(sym); chip.classList.add("active"); }
        render();
      });
    });
  }

  async function init() {
    T.initNavDrawer();
    try {
      var loaded = await T.loadData();
      DATA = loaded.data;
      populateFilters(loaded.venueList);
      wireEvents();
      render();
    } catch (err) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="8">Could not load data/shows.json or data/venues.json. ' +
        "If you opened this file directly, run a local server (e.g. <code>python3 -m http.server</code>) " +
        "or view it via GitHub Pages, since browsers block fetch() of local files opened with file://.</td></tr>";
      console.error(err);
    }
  }

  init();
})();
