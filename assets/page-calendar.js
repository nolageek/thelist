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
  var showPast = false;
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
    var startOffset = (first.getDay() === 0 ? 6 : first.getDay() - 1);
    var gridStart = new Date(viewYear, viewMonth - 1, 1 - startOffset);

    var todayInt = T.todayInt();
    var hasFilter = query || venueFilter || bandFilter || activeSyms.size > 0;
    var html = "";

    for (var i = 0; i < 42; i++) {
      var cellDate = new Date(gridStart);
      cellDate.setDate(gridStart.getDate() + i);
      var dInt = T.intFromDate(cellDate);
      var inMonth = cellDate.getMonth() === viewMonth - 1;
      var isPast = dInt < todayInt;

      // When showPast is off, skip past cells entirely (render as blank)
      if (!showPast && isPast) {
        var classes = "day-cell past-hidden";
        if (!inMonth) classes += " out-month";
        html += '<div class="' + classes + '" data-d="' + dInt + '">' +
          '<div class="daynum">' + cellDate.getDate() + "</div>" +
          '<div class="pills"></div></div>';
        continue;
      }

      var dayShows = (showsByDay[dInt] || []).slice().sort(function (a, b) { return (a.time || "").localeCompare(b.time || ""); });
      var matchCount = dayShows.filter(showMatches).length;

      var classes = "day-cell";
      if (!inMonth) classes += " out-month";
      if (isPast) classes += " is-past";
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
        return '<div class="show-item" data-d="' + s.d + '" data-vid="' + T.escapeHtml(s.venue_id) + '">' +
          '<div class="srow-top">' +
          '<div class="sbands">' + T.escapeHtml(s.bands) + "</div>" +
          '<button class="cal-btn" title="Add to calendar">" + T.CAL_ICON_HTML + "</button>' +
          "</div>" +
          '<div class="svenue"><a href="map.html?venue=' + encodeURIComponent(s.venue_id) + '">' +
            T.escapeHtml(T.venueShortName(s.venueName)) + "</a>" +
            (s.city ? " &middot; " + T.escapeHtml(s.city) : "") + "</div>" +
          '<div class="smeta">' + T.escapeHtml(s.age) + " " + T.escapeHtml(s.price) + " " + T.escapeHtml(s.time) +
            ' <span class="ssym">' + T.showSymbolsHtml(s) + "</span></div>" +
          "</div>";
      }).join("");
    }
    sidebarContent.innerHTML = html;
    sidebarContent.addEventListener("click", function (e) {
      var btn = e.target.closest(".cal-btn");
      if (!btn) return;
      var item = btn.closest("[data-d]");
      if (!item) return;
      var d = Number(item.dataset.d);
      var vid = item.dataset.vid;
      var show = (showsByDay[d] || []).find(function (s) { return s.venue_id === vid; });
      if (show) T.downloadIcs(show);
    });
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
  }

  async function init() {
    T.initNavDrawer();
    panel = T.initDetailPanel();
    T.initCollapsiblePanel();
    T.buildChips(document.getElementById("symChips"), function (sym, isActive) {
      if (isActive) { activeSyms.add(sym); } else { activeSyms.delete(sym); }
      renderCalendar();
    });

    // Past-events toggle
    var pastBtn = document.getElementById("pastToggle");
    if (pastBtn) {
      pastBtn.addEventListener("click", function () {
        showPast = !showPast;
        pastBtn.classList.toggle("active", showPast);
        renderCalendar();
      });
    }
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

      // start on the current month (past events hidden by default, so this is the most useful starting point)
      var now = new Date();
      viewYear = now.getFullYear();
      viewMonth = now.getMonth() + 1;

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