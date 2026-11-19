/* ==========================================================================
   Calendar page (calendar.html) - Outlook-style Day / Week / Month / Schedule
   Depends on assets/common.js (window.TheList)
   ========================================================================== */
(function () {
  "use strict";
  var T = window.TheList;

  var HOUR_PX = 64;          // week grid: pixels per hour (one block per start hour)
  var DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var VIEWS = ["day", "week", "month", "schedule"];

  var DATA = [], showsByDay = {};
  var query = "", venueFilter = "", bandFilter = "";
  var activeSyms = new Set();
  var showPast = false;
  var view = "month";
  var anchor = startOfDay(new Date());
  var selectedD = null, selectedSlot = null, selectedI = null;
  var schedDays = 30;
  var panel;
  var maxDate = null, weekStartH = 17;

  var calView = document.getElementById("calView");
  var calTitle = document.getElementById("calTitle");
  var jumpDate = document.getElementById("jumpDate");
  var searchBox = document.getElementById("searchBox");
  var venueSelect = document.getElementById("venueSelect");
  var bandSelect = document.getElementById("bandSelect");
  var sidebarContent = document.getElementById("sidebarContent");

  /* ---- small helpers --------------------------------------------------- */
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function pad(n) { return String(n).padStart(2, "0"); }
  function esc(s) { return T.escapeHtml(s == null ? "" : s); }
  function isoDate(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

  // Start time in minutes from midnight; after-midnight starts sort to the end of the night.
  function minutesOf(s) {
    if (s._m !== undefined) return s._m;
    var t = T.parseShowTime(s.time);
    var m = null;
    if (t) { m = t.h * 60 + t.m; if (t.h < 5) m += 1440; }
    s._m = m;
    return m;
  }
  function fmtShort(m) {
    m = m % 1440;
    var h = Math.floor(m / 60), mi = m % 60;
    return ((h % 12) || 12) + (mi ? ":" + pad(mi) : "") + (h >= 12 ? "p" : "a");
  }
  function fmtLong(m) {
    m = m % 1440;
    var h = Math.floor(m / 60), mi = m % 60;
    return ((h % 12) || 12) + ":" + pad(mi) + " " + (h >= 12 ? "PM" : "AM");
  }
  function fmtHour(h) {
    h = h % 24;
    return ((h % 12) || 12) + " " + (h >= 12 ? "PM" : "AM");
  }
  function cmp(a, b) {
    var ma = minutesOf(a), mb = minutesOf(b);
    if (ma === null && mb !== null) return 1;
    if (mb === null && ma !== null) return -1;
    if (ma !== mb) return ma - mb;
    return a.bands.localeCompare(b.bands);
  }
  function firstBand(s) { return (s.bands || "").split(",")[0].trim(); }

  /* ---- filtering --------------------------------------------------------- */
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
  function dayShows(dInt) {
    if (!showPast && dInt < T.todayInt()) return [];
    return (showsByDay[dInt] || []).filter(showMatches).sort(cmp);
  }
  // Bucket shows by start hour. g.m is the bucket (hour * 60); g.first is the earliest start inside it.
  function bucketOf(s) { var m = minutesOf(s); return m === null ? null : Math.floor(m / 60) * 60; }
  function groupByStart(shows) {
    var map = {}, tbd = [];
    shows.forEach(function (s) {
      var b = bucketOf(s);
      if (b === null) { tbd.push(s); return; }
      (map[b] = map[b] || []).push(s);
    });
    var groups = Object.keys(map).map(Number).sort(function (a, b) { return a - b; })
      .map(function (b) { return { m: b, shows: map[b], first: minutesOf(map[b][0]) }; });
    return { groups: groups, tbd: tbd };
  }

  /* ---- toolbar ------------------------------------------------------------ */
  function schedStart() {
    var today = startOfDay(new Date());
    return (!showPast && anchor < today) ? today : anchor;
  }
  function titleText() {
    var y = anchor.getFullYear();
    if (view === "month") return T.MONTH_NAMES[anchor.getMonth() + 1] + " " + y;
    if (view === "day") {
      return DOW_LONG[anchor.getDay()] + ", " + T.MONTH_NAMES[anchor.getMonth() + 1] + " " + anchor.getDate() + ", " + y;
    }
    if (view === "week") {
      var s = T.mondayOf(anchor), e = addDays(s, 6);
      var a = T.MONTH_ABBR[s.getMonth() + 1] + " " + s.getDate();
      var b = (s.getMonth() === e.getMonth() ? "" : T.MONTH_ABBR[e.getMonth() + 1] + " ") + e.getDate();
      return a + " - " + b + ", " + e.getFullYear();
    }
    var st = schedStart();
    return "From " + T.MONTH_ABBR[st.getMonth() + 1] + " " + st.getDate() + ", " + st.getFullYear();
  }
  function step(dir) {
    if (view === "month") anchor = new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
    else if (view === "week" || view === "schedule") anchor = addDays(anchor, 7 * dir);
    else anchor = addDays(anchor, dir);
    if (view === "schedule") schedDays = 30;
    render();
  }
  function setView(v) {
    if (VIEWS.indexOf(v) < 0) return;
    view = v;
    try { localStorage.setItem("thelist.calview", v); } catch (e) { /* ignore */ }
    if (v === "schedule") schedDays = 30;
    render();
  }
  function goDay(dInt) {
    anchor = T.dFromInt(dInt);
    selectedD = dInt;
    setView("day");
  }

  /* ---- shared fragments --------------------------------------------------- */
  function symHtml(s) { return '<span class="ssym">' + T.showSymbolsHtml(s) + "</span>"; }
  function calBtn() { return '<button class="cal-btn" title="Add to calendar">' + T.CAL_ICON_HTML + "</button>"; }
  function venueLink(s) {
    return '<a href="map.html?venue=' + encodeURIComponent(s.venue_id) + '">' +
      esc(T.venueShortName(s.venueName)) + "</a>" + (s.city ? " &middot; " + esc(s.city) : "");
  }
  function evFlags(shows) {
    var cls = "";
    if (shows.some(function (s) { return s.sym.includes("$"); })) cls += " sellout";
    if (shows.some(function (s) { return s.sym.includes("*"); })) cls += " rec";
    return cls;
  }

  /* ---- MONTH --------------------------------------------------------------- */
  function renderMonth() {
    var y = anchor.getFullYear(), mo = anchor.getMonth();
    var first = new Date(y, mo, 1);
    var offset = (first.getDay() + 6) % 7;
    var daysInMonth = new Date(y, mo + 1, 0).getDate();
    var rows = Math.ceil((offset + daysInMonth) / 7);
    var gridStart = addDays(first, -offset);
    var today = T.todayInt();

    var html = '<div class="m-dow">' + DOW.map(function (d) { return "<div>" + d + "</div>"; }).join("") + "</div>";
    html += '<div class="m-grid" style="grid-template-rows:repeat(' + rows + ',minmax(0,1fr))">';
    for (var i = 0; i < rows * 7; i++) {
      var dt = addDays(gridStart, i);
      var dInt = T.intFromDate(dt);
      var inMonth = dt.getMonth() === mo;
      var isPast = dInt < today;
      var cls = "m-cell" + (inMonth ? "" : " out-month") + (dInt === today ? " today" : "") +
        (dInt === selectedD ? " selected" : "") + (isPast ? " is-past" : "");
      var label = dt.getDate() === 1 ? T.MONTH_ABBR[dt.getMonth() + 1] + " 1" : String(dt.getDate());

      if (!showPast && isPast) {
        html += '<div class="' + cls + ' past-hidden"><div class="m-num"><span class="m-n">' + label + "</span></div></div>";
        continue;
      }
      var shows = dayShows(dInt);
      var chips = "";
      shows.slice(0, 3).forEach(function (s) {
        var m = minutesOf(s);
        chips += '<div class="m-chip' + evFlags([s]) + '" data-d="' + s.d + '" data-i="' + s._i + '" title="' + esc(s.bands + " @ " + s.venueName) + '">' +
          (m !== null ? "<b>" + fmtShort(m) + "</b> " : "") + esc(firstBand(s)) + "</div>";
      });
      if (shows.length > 3) {
        chips += '<button class="m-more" data-goday="' + dInt + '">+' + (shows.length - 3) + " more</button>";
      }
      html += '<div class="' + cls + '" data-d="' + dInt + '">' +
        '<div class="m-num"><button class="m-n" data-goday="' + dInt + '" title="Open day">' + label + "</button></div>" +
        '<div class="m-chips">' + chips + "</div></div>";
    }
    html += "</div>";
    calView.innerHTML = html;
  }

  /* ---- WEEK (time grid with overflow blocks) ---------------------------- */
  function blockHtml(g, dInt) {
    var shows = g.shows, n = shows.length;
    var cls = "ev" + (n > 1 ? " multi" : "") + evFlags(shows) + (dInt === selectedD && g.m === selectedSlot ? " selected" : "");
    var body;
    if (n === 1) {
      var s = shows[0];
      body = '<div class="ev-t">' + fmtShort(g.first) + '</div><div class="ev-b">' + esc(s.bands) + "</div>" +
        '<div class="ev-v">' + esc(T.venueShortName(s.venueName)) + "</div>";
    } else {
      body = '<div class="ev-t">' + fmtShort(g.first) + ' <span class="ev-n">' + n + " shows</span></div>" +
        shows.slice(0, 4).map(function (s) {
          return '<div class="ev-b">' + esc(firstBand(s)) + ' <span class="ev-v">' + esc(T.venueShortName(s.venueName)) + "</span></div>";
        }).join("");
    }
    var tip = shows.slice(0, 15).map(function (s) { return s.bands + " @ " + s.venueName; }).join("\n") +
      (n > 15 ? "\n+" + (n - 15) + " more" : "");
    return { cls: cls, body: body, tip: tip };
  }

  function renderWeek() {
    var mon = T.mondayOf(anchor);
    var today = T.todayInt();
    var days = [], minM = Infinity, maxM = -Infinity, anyTbd = false;
    for (var i = 0; i < 7; i++) {
      var dt = addDays(mon, i), dInt = T.intFromDate(dt);
      var gr = groupByStart(dayShows(dInt));
      gr.groups.forEach(function (g) { minM = Math.min(minM, g.m); maxM = Math.max(maxM, g.m); });
      if (gr.tbd.length) anyTbd = true;
      days.push({ dt: dt, d: dInt, gr: gr });
    }
    var startH = 17, endH = 23;
    if (minM !== Infinity) {
      startH = Math.min(17, Math.floor(minM / 60));
      endH = Math.min(30, Math.max(23, Math.floor(maxM / 60) + 2));
    }
    var hours = endH - startH;
    weekStartH = startH;

    var head = '<div class="tg-row tg-head"><div class="tg-corner"></div>';
    days.forEach(function (x) {
      head += '<button class="tg-dayhead' + (x.d === today ? " today" : "") + '" data-goday="' + x.d + '">' +
        '<span class="tg-dw">' + DOW[(x.dt.getDay() + 6) % 7] + '</span><span class="tg-dn">' + x.dt.getDate() + "</span></button>";
    });
    head += "</div>";

    var tbd = "";
    if (anyTbd) {
      tbd = '<div class="tg-row tg-tbd"><div class="tg-corner">TBD</div>';
      days.forEach(function (x) {
        tbd += '<div class="tg-tbdcell">' + x.gr.tbd.slice(0, 2).map(function (s) {
          return '<div class="m-chip' + evFlags([s]) + '" data-d="' + x.d + '" data-i="' + s._i + '" title="' + esc(s.bands + " @ " + s.venueName) + '">' + esc(firstBand(s)) + "</div>";
        }).join("") + (x.gr.tbd.length > 2 ? '<button class="m-more" data-goday="' + x.d + '">+' + (x.gr.tbd.length - 2) + "</button>" : "") + "</div>";
      });
      tbd += "</div>";
    }

    var gutter = '<div class="tg-gutter">';
    for (var h = startH; h < endH; h++) gutter += '<div class="tg-hour"><span>' + fmtHour(h) + "</span></div>";
    gutter += "</div>";

    var now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
    var body = '<div class="tg-row tg-body">' + gutter;
    days.forEach(function (x) {
      var col = '<div class="tg-col' + (x.d === today ? " today" : "") + (!showPast && x.d < today ? " past" : "") + '" data-d="' + x.d + '">';
      x.gr.groups.forEach(function (g) {
        var b = blockHtml(g, x.d);
        var top = (g.m - startH * 60) / 60 * HOUR_PX;
        col += '<div class="' + b.cls + '" data-d="' + x.d + '" data-slot="' + g.m + '" title="' + esc(b.tip) + '" ' +
          'style="top:' + top + "px;height:" + (HOUR_PX - 2) + 'px">' +
          b.body + "</div>";
      });
      if (x.d === today) {
        var ny = (nowMin - startH * 60) / 60 * HOUR_PX;
        if (ny >= 0 && ny <= hours * HOUR_PX) col += '<div class="now-line" style="top:' + ny + 'px"></div>';
      }
      col += "</div>";
      body += col;
    });
    body += "</div>";

    calView.innerHTML = '<div class="tg-scroll"><div class="tg" style="--hour:' + HOUR_PX + "px;--hours:" + hours + '">' + head + tbd + body + "</div></div>";
  }

  /* ---- DAY (hour rows that grow to fit every show) ---------------------- */
  function renderDay() {
    var dInt = T.intFromDate(anchor);
    var shows = dayShows(dInt);
    if (shows.length === 0) {
      var msg = (!showPast && dInt < T.todayInt())
        ? "This day is in the past. Turn on \"show past events\" to see it."
        : "No shows listed for this day.";
      calView.innerHTML = '<div class="placeholder">' + msg + "</div>";
      return;
    }
    var gr = groupByStart(shows);
    var minM = Infinity, maxM = -Infinity;
    gr.groups.forEach(function (g) { minM = Math.min(minM, g.m); maxM = Math.max(maxM, g.m); });
    var startH = minM === Infinity ? 17 : Math.min(17, Math.floor(minM / 60));
    var endH = minM === Infinity ? 23 : Math.min(30, Math.max(23, Math.floor(maxM / 60) + 1));

    function card(s) {
      var m = minutesOf(s);
      return '<div class="dv-card' + evFlags([s]) + '" data-d="' + s.d + '" data-i="' + s._i + '">' +
        '<div class="dv-top"><span class="dv-time">' + (m !== null ? fmtLong(m) : "Time TBD") + "</span>" + calBtn() + "</div>" +
        '<div class="dv-bands">' + esc(s.bands) + "</div>" +
        '<div class="dv-venue">' + venueLink(s) + "</div>" +
        '<div class="dv-meta">' + esc(s.age) + " " + esc(s.price) + " " + esc(s.time) + " " + symHtml(s) + "</div>" +
        (s.notes ? '<div class="dv-notes">' + esc(s.notes) + "</div>" : "") + "</div>";
    }

    var byHour = {};
    gr.groups.forEach(function (g) { var h = Math.floor(g.m / 60); (byHour[h] = byHour[h] || []).push.apply(byHour[h], g.shows); });

    var html = '<div class="dv"><div class="dv-sum">' + shows.length + " show" + (shows.length === 1 ? "" : "s") + "</div>";
    if (gr.tbd.length) {
      html += '<div class="dv-row"><div class="dv-hour">TBD</div><div class="dv-cards">' + gr.tbd.map(card).join("") + "</div></div>";
    }
    for (var h = startH; h < endH; h++) {
      var list = byHour[h] || [];
      html += '<div class="dv-row' + (list.length ? "" : " empty") + '"><div class="dv-hour">' + fmtHour(h) + "</div>" +
        '<div class="dv-cards">' + list.map(card).join("") + "</div></div>";
    }
    html += "</div>";
    calView.innerHTML = html;
  }

  /* ---- SCHEDULE (agenda) ------------------------------------------------ */
  function renderSchedule() {
    var start = schedStart();
    var today = T.todayInt();
    var lastInt = maxDate ? T.intFromDate(maxDate) : T.intFromDate(addDays(start, 365));
    var html = "", count = 0;
    for (var i = 0; i < schedDays; i++) {
      var dt = addDays(start, i), dInt = T.intFromDate(dt);
      if (dInt > lastInt) break;
      var shows = dayShows(dInt);
      if (!shows.length) continue;
      count += shows.length;
      html += '<section class="sc-day"><header class="sc-dayhead' + (dInt === today ? " today" : "") + '" data-goday="' + dInt + '">' +
        '<span class="sc-dn">' + dt.getDate() + '</span><span class="sc-dw">' + DOW_LONG[dt.getDay()] + "</span>" +
        '<span class="sc-my">' + T.MONTH_NAMES[dt.getMonth() + 1] + " " + dt.getFullYear() + "</span>" +
        (dInt === today ? '<span class="sc-today">Today</span>' : "") +
        '<span class="sc-count">' + shows.length + " show" + (shows.length === 1 ? "" : "s") + "</span></header>";
      shows.forEach(function (s) {
        var m = minutesOf(s);
        html += '<div class="sc-item' + evFlags([s]) + (s._i === selectedI ? " selected" : "") + '" data-d="' + s.d + '" data-i="' + s._i + '">' +
          '<div class="sc-time">' + (m !== null ? fmtLong(m) : "TBD") + "</div>" +
          '<div class="sc-main"><div class="sc-bands">' + esc(s.bands) + '</div><div class="sc-sub">' + venueLink(s) + "</div></div>" +
          '<div class="sc-meta">' + esc(s.age) + " " + esc(s.price) + " " + symHtml(s) + "</div>" + calBtn() + "</div>";
      });
      html += "</section>";
    }
    if (!count) html = '<div class="placeholder">No shows match in this range.</div>';
    if (T.intFromDate(addDays(start, schedDays)) <= lastInt) {
      html += '<button class="sc-more" data-more="1">Show next 30 days</button>';
    }
    calView.innerHTML = '<div class="sc">' + html + "</div>";
  }

  /* ---- side panel --------------------------------------------------------- */
  function renderSidebar(dInt, slot) {
    var all = dayShows(dInt);
    var shows = slot == null ? all : all.filter(function (s) { return bucketOf(s) === slot; });
    var dt = T.dFromInt(dInt);
    var head = DOW_LONG[dt.getDay()].slice(0, 3) + ", " + T.MONTH_NAMES[dt.getMonth() + 1] + " " + dt.getDate() + ", " + dt.getFullYear();
    var html = '<div class="panel-head"><h2>' + head + "</h2>" +
      '<div class="dsub">' + (slot != null ? fmtHour(Math.floor(slot / 60)) + " hour &middot; " : "") + shows.length + " show" + (shows.length === 1 ? "" : "s") +
      (slot != null && all.length > shows.length
        ? ' &middot; <a href="#" data-allday="1">all ' + all.length + " that day</a>" : "") +
      ' &middot; <a href="#" data-goday="' + dInt + '">open day view</a></div></div>';
    if (!shows.length) {
      html += '<div class="placeholder">No shows listed for this day.</div>';
    } else {
      html += shows.map(function (s) {
        return '<div class="show-item' + (s.sym.includes("$") ? " sellout" : "") + '" data-d="' + s.d + '" data-i="' + s._i + '">' +
          '<div class="srow-top"><div class="sbands">' + esc(s.bands) + "</div>" + calBtn() + "</div>" +
          '<div class="svenue">' + venueLink(s) + "</div>" +
          '<div class="smeta">' + esc(s.age) + " " + esc(s.price) + " " + esc(s.time) + " " + symHtml(s) + "</div></div>";
      }).join("");
    }
    sidebarContent.innerHTML = html;
    panel.open();
  }

  /* ---- render dispatcher -------------------------------------------------- */
  function render() {
    var prev = calView.querySelector(".tg-scroll");
    var keep = prev ? prev.scrollTop : 0;
    calTitle.textContent = titleText();
    jumpDate.value = isoDate(anchor);
    document.querySelectorAll("#viewSwitch button").forEach(function (b) {
      b.classList.toggle("active", b.dataset.view === view);
    });
    calView.className = "cal-view v-" + view;
    if (view === "month") renderMonth();
    else if (view === "week") renderWeek();
    else if (view === "day") renderDay();
    else renderSchedule();
    var next = calView.querySelector(".tg-scroll");
    if (next) next.scrollTop = prev ? keep : Math.max(0, (17 - weekStartH) * HOUR_PX - 8);
    try {
      var qs = new URLSearchParams();
      qs.set("view", view);
      qs.set("date", String(T.intFromDate(anchor)));
      history.replaceState(null, "", "?" + qs.toString());
    } catch (e) { /* ignore */ }
  }

  /* ---- events --------------------------------------------------------------- */
  function findShow(el) {
    var item = el.closest("[data-i]");
    return item ? DATA[Number(item.dataset.i)] : null;
  }

  function wireEvents() {
    calView.addEventListener("click", function (e) {
      var go = e.target.closest("[data-goday]");
      if (go) { goDay(Number(go.dataset.goday)); return; }
      if (e.target.closest("[data-more]")) { schedDays += 30; render(); return; }
      var btn = e.target.closest(".cal-btn");
      if (btn) { var s = findShow(btn); if (s) T.downloadIcs(s); return; }
      if (e.target.closest("a")) return;

      var ev = e.target.closest(".ev[data-slot]");
      if (ev) {
        selectedD = Number(ev.dataset.d); selectedSlot = Number(ev.dataset.slot); selectedI = null;
        render(); renderSidebar(selectedD, selectedSlot);
        return;
      }
      var item = e.target.closest(".sc-item, .m-chip[data-i]");
      if (item && item.dataset.i != null) {
        var sh = DATA[Number(item.dataset.i)];
        selectedD = sh.d; selectedSlot = null; selectedI = sh._i;
        render(); renderSidebar(selectedD, null);
        return;
      }
      var cell = e.target.closest(".m-cell[data-d]");
      if (cell) {
        selectedD = Number(cell.dataset.d); selectedSlot = null; selectedI = null;
        render(); renderSidebar(selectedD, null);
      }
    });

    sidebarContent.addEventListener("click", function (e) {
      var go = e.target.closest("[data-goday]");
      if (go) { e.preventDefault(); goDay(Number(go.dataset.goday)); return; }
      if (e.target.closest("[data-allday]")) { e.preventDefault(); selectedSlot = null; render(); renderSidebar(selectedD, null); return; }
      var btn = e.target.closest(".cal-btn");
      if (!btn) return;
      var s = findShow(btn);
      if (s) T.downloadIcs(s);
    });

    document.getElementById("prevBtn").addEventListener("click", function () { step(-1); });
    document.getElementById("nextBtn").addEventListener("click", function () { step(1); });
    document.getElementById("todayBtn").addEventListener("click", function () {
      anchor = startOfDay(new Date());
      selectedD = T.intFromDate(anchor);
      if (view === "schedule") schedDays = 30;
      render();
    });
    jumpDate.addEventListener("change", function () {
      if (!jumpDate.value) return;
      var p = jumpDate.value.split("-").map(Number);
      anchor = new Date(p[0], p[1] - 1, p[2]);
      if (view === "schedule") schedDays = 30;
      render();
    });
    document.getElementById("viewSwitch").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-view]");
      if (b) setView(b.dataset.view);
    });
    searchBox.addEventListener("input", function (e) { query = e.target.value.trim(); render(); });
    venueSelect.addEventListener("change", function (e) { venueFilter = e.target.value; render(); });
    bandSelect.addEventListener("change", function (e) { bandFilter = e.target.value; render(); });

    document.addEventListener("keydown", function (e) {
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    });
  }

  function populateFilters(venueList) {
    venueList.filter(function (v) { return v.show_count > 0; })
      .slice()
      .sort(function (a, b) { return a.name.localeCompare(b.name); })
      .forEach(function (v) {
        var opt = document.createElement("option");
        opt.value = v.id;
        opt.textContent = T.venueShortName(v.name) + (v.city ? " (" + v.city + ")" : "");
        venueSelect.appendChild(opt);
      });
    var bandSet = new Set();
    DATA.forEach(function (r) { T.bandTokens(r.bands).forEach(function (b) { bandSet.add(b); }); });
    [...bandSet].sort(function (a, b) { return a.localeCompare(b, undefined, { sensitivity: "base" }); }).forEach(function (b) {
      var opt = document.createElement("option");
      opt.value = b; opt.textContent = b;
      bandSelect.appendChild(opt);
    });
  }

  async function init() {
    T.initNavDrawer();
    panel = T.initDetailPanel();
    T.initCollapsiblePanel();
    T.buildChips(document.getElementById("symChips"), function (sym, isActive) {
      if (isActive) { activeSyms.add(sym); } else { activeSyms.delete(sym); }
      render();
    });
    var pastBtn = document.getElementById("pastToggle");
    if (pastBtn) {
      pastBtn.addEventListener("click", function () {
        showPast = !showPast;
        pastBtn.classList.toggle("active", showPast);
        render();
      });
    }

    // initial view: ?view= param, then saved preference, then a sensible default
    var qs = new URLSearchParams(window.location.search);
    var saved = null;
    try { saved = localStorage.getItem("thelist.calview"); } catch (e) { /* ignore */ }
    view = [qs.get("view"), saved].filter(function (v) { return VIEWS.indexOf(v) >= 0; })[0] ||
      (window.innerWidth <= 700 ? "schedule" : "month");
    var qd = qs.get("date");
    if (qd && /^\d{8}$/.test(qd)) { anchor = T.dFromInt(Number(qd)); selectedD = Number(qd); }

    try {
      var loaded = await T.loadData();
      DATA = loaded.data;
      DATA.forEach(function (r, i) {
        r._i = i;
        (showsByDay[r.d] = showsByDay[r.d] || []).push(r);
        var dt = T.dFromInt(r.d);
        if (!maxDate || dt > maxDate) maxDate = dt;
      });
      populateFilters(loaded.venueList);
      wireEvents();
      render();
    } catch (err) {
      calView.innerHTML = '<div class="placeholder">Could not load data/shows.json or data/venues.json. ' +
        "If you opened this file directly, run a local server (e.g. <code>python3 -m http.server</code>) " +
        "or view it via GitHub Pages.</div>";
      console.error(err);
    }
  }

  init();
})();
