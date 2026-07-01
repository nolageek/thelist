/* ==========================================================================
   Calendar page (calendar.html)
   Depends on assets/common.js (window.TheList)
   ========================================================================== */
(function () {
  "use strict";
  var T = window.TheList;

  var DATA = [];
  var query = "", venueFilter = "", bandFilter = "";
  var activeSyms = new Set();
  var viewYear, viewMonth; // viewMonth is 1-12
  var selectedD = null;
  var showsByDay = {};
  var panel;

  var calGrid = document.getElementById("calGrid");
  var monthLabel = document.getElementById("monthLabel");
  var monthJump = document.getElementById("monthJump");
  var searchBox = document.getElementById("searchBox");
  var venueSelect = document.getElementById("venueSelect");
  var bandSelect = document.getElementById("bandSelect");
  var sidebarContent = document.getElementById("sidebarContent");

  function populateFilters(venueList) {
    // Venue dropdown
    venueList.filter(function (v) { return v.show_count > 0; })
      .slice()
      .sort(function (a, b) { return a.name.localeCompare(b.name); })
      .forEach(function (v) {
        var opt = document.createElement("option");
        opt.value = v.id;
        opt.textContent = T.venueShortName(v.name) + (v.city ? " (" + v.city + ")" : "");
        venueSelect.appendChild(opt);
      });

    // Band dropdown
    var bandSet = new Set();
    DATA.forEach(function (r) { T.bandTokens(r.bands).forEach(function (b) { bandSet.add(b); }); });
    [...bandSet].sort(function (a, b) { return a.localeCompare(b, undefined, { sensitivity: "base" }); }).forEach(function (b) {
      var opt = document.createElement("option");
      opt.value = b;
      opt.textContent = b;
      bandSelect.appendChild(opt);
    });

    // Month jump dropdown, grouped by year
    var monthKeys = [...new Set(DATA.map(function (r) { return Math.floor(r.d / 100); }))].sort(function (a, b) { return a - b; });
    var grp = null, grpYear = null;
    monthKeys.forEach(function (mk) {
      var year = Math.floor(mk / 100), month = mk % 100;
      if (year !== grpYear) {
        grp = document.createElement("optgroup");
        grp.label = String(year);
        monthJump.appendChild(grp);
        grpYear = year;
      }
      var opt = document.createElement("option");
      opt.value = String(mk);
      opt.textContent = T.MONTH_NAMES[month];
      grp.appendChild(opt);
    });

    return monthKeys;
  }

  function showMatches(r) {
    if (query) {
      var hay = (r.bands + " " + r.venueName + " " + r.city).toLowerCase();
      if (!hay.includes(query.toLowerCase())) return false;
    }
    if (venueFilter && r.venue_id !== venueFilter) return false;
    if (bandFilter && !T.bandTokens(r.bands).includes(bandFilter)) return false;
    if (activeSyms.size > 0) {
      for (var s of activeSyms) {
        if (s === "a/a") { if (r.age !== "a/a") return false; }
        else if (!r.sym.includes(s)) { return false; }
      }
    }
    return true;
  }

  function renderCalendar() {
    monthLabel.textContent = T.MONTH_NAMES[viewMonth] + " " + viewYear;
    monthJump.value = String(viewYear * 100 + viewMonth);

    var first = new Date(viewYear, viewMonth - 1, 1);
    var startOffset = (first.getDay() === 0 ? 6 : first.getDay() - 1); // days before 1st to reach Monday
    var gridStart = new Date(viewYear, viewMonth - 1, 1 - startOffset);

    var todayInt = T.intFromDate(new Date());
    var hasFilter = query || venueFilter || bandFilter || activeSyms.size > 0;
    var html = "";

    for (var i = 0; i < 42; i++) {
      var cellDate = new Date(gridStart);
      cellDate.setDate(gridStart.getDate() + i);
      var dInt = T.intFromDate(cellDate);
      var inMonth = cellDate.getMonth() === viewMonth - 1;
      var dayShows = (showsByDay[dInt] || []).slice().sort(function (a, b) { return (a.time || "").localeCompare(b.time || ""); });
      var matchCount = dayShows.filter(showMatches).length;

      var classes = "day-cell";
      if (!inMonth) classes += " out-month";
      if (dInt === todayInt) classes += " today";
      if (dInt === selectedD) classes += " selected";

      var pillsHtml = "";
      dayShows.slice(0, 3).forEach(function (s) {
        var dim = hasFilter && !showMatches(s) ? " dimmed" : "";
        pillsHtml += '<div class="day-pill' + dim + '">' +
          T.escapeHtml(s.bands.split(",")[0]) + " &middot; " + T.escapeHtml(T.venueShortName(s.venueName)) + "</div>";
      });
      if (dayShows.length > 3) {
        pillsHtml += '<div class="day-more">+' + (dayShows.length - 3) + " more</div>";
      }

      html += '<div class="' + classes + '" data-d="' + dInt + '">' +
        '<div class="daynum">' + cellDate.getDate() +
          (hasFilter && matchCount > 0 ? '<span class="dot"></span>' : "") + "</div>" +
        '<div class="pills">' + pillsHtml + "</div>" +
        "</div>";
    }
    calGrid.innerHTML = html;

    calGrid.querySelectorAll(".day-cell").forEach(function (cell) {
      cell.addEventListener("click", function () {
        selectedD = Number(cell.dataset.d);
        renderCalendar();
        renderSidebar(selectedD);
      });
    });
  }

  function renderSidebar(dInt) {
    var dayShows = (showsByDay[dInt] || []).slice().sort(function (a, b) { return (a.time || "").localeCompare(b.time || ""); });
    var dt = T.dFromInt(dInt);
    var weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    var html = '<div class="panel-head">' +
      "<h2>" + weekdayNames[dt.getDay()] + ", " + T.MONTH_NAMES[dt.getMonth() + 1] + " " + dt.getDate() + ", " + dt.getFullYear() + "</h2>" +
      '<div class="dsub">' + dayShows.length + " show" + (dayShows.length === 1 ? "" : "s") + "</div>" +
      "</div>";

    if (dayShows.length === 0) {
      html += '<div class="placeholder">No shows listed for this day.</div>';
    } else {
      html += dayShows.map(function (s) {
        return '<div class="show-item">' +
          '<div class="sbands">' + T.escapeHtml(s.bands) + "</div>" +
          '<div class="svenue"><a href="map.html?venue=' + encodeURIComponent(s.venue_id) + '">' +
            T.escapeHtml(T.venueShortName(s.venueName)) + "</a>" +
            (s.city ? " &middot; " + T.escapeHtml(s.city) : "") + "</div>" +
          '<div class="smeta">' + T.escapeHtml(s.age) + " " + T.escapeHtml(s.price) + " " + T.escapeHtml(s.time) +
            ' <span class="ssym">' + T.showSymbolsHtml(s) + "</span></div>" +
          "</div>";
      }).join("");
    }
    sidebarContent.innerHTML = html;
    panel.open();
  }

  function wireEvents() {
    document.getElementById("prevMonth").addEventListener("click", function () {
      viewMonth--;
      if (viewMonth < 1) { viewMonth = 12; viewYear--; }
      renderCalendar();
    });
    document.getElementById("nextMonth").addEventListener("click", function () {
      viewMonth++;
      if (viewMonth > 12) { viewMonth = 1; viewYear++; }
      renderCalendar();
    });
    document.getElementById("todayBtn").addEventListener("click", function () {
      var now = new Date();
      viewYear = now.getFullYear();
      viewMonth = now.getMonth() + 1;
      selectedD = T.intFromDate(now);
      renderCalendar();
      renderSidebar(selectedD);
    });
    monthJump.addEventListener("change", function (e) {
      var v = Number(e.target.value);
      viewYear = Math.floor(v / 100);
      viewMonth = v % 100;
      renderCalendar();
    });
    searchBox.addEventListener("input", function (e) { query = e.target.value.trim(); renderCalendar(); });
    venueSelect.addEventListener("change", function (e) { venueFilter = e.target.value; renderCalendar(); });
    bandSelect.addEventListener("change", function (e) { bandFilter = e.target.value; renderCalendar(); });
    document.querySelectorAll(".chip[data-sym]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var sym = chip.dataset.sym;
        if (activeSyms.has(sym)) { activeSyms.delete(sym); chip.classList.remove("active"); }
        else { activeSyms.add(sym); chip.classList.add("active"); }
        renderCalendar();
      });
    });
  }

  async function init() {
    T.initNavDrawer();
    panel = T.initDetailPanel();
    try {
      var loaded = await T.loadData();
      DATA = loaded.data;

      // index shows by day once, up front
      DATA.forEach(function (r) {
        if (!showsByDay[r.d]) showsByDay[r.d] = [];
        showsByDay[r.d].push(r);
      });

      var monthKeys = populateFilters(loaded.venueList);
      wireEvents();

      // start on the first month that has data
      var now = new Date();
      var fallback = now.getFullYear() * 100 + (now.getMonth() + 1);
      var firstKey = monthKeys[0] || fallback;
      viewYear = Math.floor(firstKey / 100);
      viewMonth = firstKey % 100;

      renderCalendar();
    } catch (err) {
      calGrid.innerHTML = '<div class="placeholder">Could not load data/shows.json or data/venues.json. ' +
        "If you opened this file directly, run a local server (e.g. <code>python3 -m http.server</code>) " +
        "or view it via GitHub Pages.</div>";
      console.error(err);
    }
  }

  init();
})();
