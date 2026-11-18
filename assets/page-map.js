/* ==========================================================================
   Venue Map page (map.html)
   Depends on assets/common.js (window.TheList) and Leaflet.
   ========================================================================== */
(function () {
  "use strict";
  var T = window.TheList;

  var VENUES = [], showsByVenue = {}, markersById = {};
  var panel;
  var map;

  function markerRadius(count) {
    return Math.max(5, Math.min(16, 4 + Math.sqrt(count) * 2));
  }

  function renderVenuePanel(venueId) {
    var v = VENUES.find(function (x) { return x.id === venueId; });
    if (!v) return;
    var today = T.todayInt();
    var shows = (showsByVenue[venueId] || [])
      .filter(function (s) { return showPast || s.d >= today; })
      .slice().sort(function (a, b) { return a.d - b.d; });
    var content = document.getElementById("sidebarContent");
    var sellOutCount = shows.filter(function (s) { return s.sym.includes("$"); }).length;

    var html = '<div class="panel-head">' +
      "<h2>" + T.escapeHtml(v.name) + "</h2>" +
      '<div class="addr">' + T.escapeHtml(v.address || v.city || "") + "</div>" +
      (!v.precise ? '<div class="approx">approximate location</div>' : "") +
      (sellOutCount > 0
        ? '<div class="sellout-summary">' + T.symbolIconHtml("$") + ' ' +
          sellOutCount + " show" + (sellOutCount === 1 ? "" : "s") + " likely to sell out</div>"
        : "") +
      "</div>";

    if (shows.length === 0) {
      html += '<div class="placeholder">No shows listed for this venue.</div>';
    } else {
      html += shows.map(function (s) {
        return '<div class="show-item' + (s.sym.includes("$") ? " sellout" : "") + '"' +
          ' data-d="' + s.d + '" data-vid="' + T.escapeHtml(s.venue_id) + '">' +
          '<div class="srow-top">' +
          '<span class="sdate">' + T.escapeHtml(s.date) + '</span><span class="swk">' + T.escapeHtml(s.wk) + "</span>" +
          '<button class="cal-btn" title="Add to calendar">' + T.CAL_ICON_HTML + '</button>' +
          "</div>" +
          '<div class="sbands">' + T.escapeHtml(s.bands) + "</div>" +
          '<div class="smeta">' + T.escapeHtml(s.age) + " " + T.escapeHtml(s.price) + " " + T.escapeHtml(s.time) +
            ' <span class="ssym">' + T.showSymbolsHtml(s) + "</span></div>" +
          "</div>";
      }).join("");
    }
    content.innerHTML = html;
    // wire cal buttons via delegation on this panel's content
    content.addEventListener("click", function onCalClick(e) {
      var btn = e.target.closest(".cal-btn");
      if (!btn) return;
      var item = btn.closest("[data-d]");
      if (!item) return;
      var d = Number(item.dataset.d);
      var vid = item.dataset.vid;
      var show = (showsByVenue[vid] || []).find(function (s) { return s.d === d; });
      if (show) T.downloadIcs(show);
    });
    panel.open();
  }

  function focusVenue(venueId) {
    var v = VENUES.find(function (x) { return x.id === venueId; });
    if (!v || v.lat == null) { renderVenuePanel(venueId); return; }
    map.setView([v.lat, v.lng], 14);
    var m = markersById[venueId];
    if (m) m.openPopup();
    renderVenuePanel(venueId);
  }

  // State for above-map filters
  var cityFilter = "", symFilter = new Set(), searchQuery = "", showPast = false;

  function venueMatchesFilters(v) {
    if (cityFilter && T.normalizeCity(v.city || "") !== cityFilter) return false;
    if (symFilter.size > 0 || !showPast) {
      var today = T.todayInt();
      var vShows = (showsByVenue[v.id] || []).filter(function (s) {
        return showPast || s.d >= today;
      });
      if (vShows.length === 0) return false;
      if (symFilter.size > 0) {
        var hasMatch = vShows.some(function (s) {
          for (var sym of symFilter) {
            if (sym === "a/a") { if (s.age !== "a/a") return false; }
            else if (!s.sym.includes(sym)) { return false; }
          }
          return true;
        });
        if (!hasMatch) return false;
      }
    }
    if (searchQuery) {
      var q = searchQuery.toLowerCase();
      if (!v.name.toLowerCase().includes(q) && !(v.city || "").toLowerCase().includes(q)) return false;
    }
    return true;
  }

  function updateMarkers() {
    var visible = 0, total = 0;
    VENUES.forEach(function (v) {
      var m = markersById[v.id];
      if (!m) return;
      total++;
      if (venueMatchesFilters(v)) {
        m.setStyle({ fillOpacity: 0.75, opacity: 1 });
        visible++;
      } else {
        m.setStyle({ fillOpacity: 0.08, opacity: 0.2 });
      }
    });
    var countEl = document.getElementById("venueCount");
    if (countEl) countEl.textContent = visible + " of " + total + " venues";
  }

  function wireControls() {
    // Search
    var searchEl = document.getElementById("venueSearch");
    if (searchEl) {
      searchEl.addEventListener("input", function (e) {
        searchQuery = e.target.value.trim();
        updateMarkers();
        if (!searchQuery) {
          document.getElementById("sidebarContent").innerHTML =
            '<div class="placeholder">Click a marker on the map, or search above, to see that venue\'s show calendar.</div>';
          return;
        }
        var matches = VENUES.filter(venueMatchesFilters)
          .sort(function (a, b) { return b.show_count - a.show_count; })
          .slice(0, 40);
        var content = document.getElementById("sidebarContent");
        if (matches.length === 0) {
          content.innerHTML = '<div class="placeholder">No venues match that search.</div>';
          return;
        }
        content.innerHTML = matches.map(function (v) {
          return '<div class="venue-list-item" data-id="' + v.id + '">' +
            '<div class="vname">' + T.escapeHtml(v.name) + "</div>" +
            '<div class="vmeta">' + T.escapeHtml(v.city || "") + " &middot; " +
              v.show_count + " show" + (v.show_count === 1 ? "" : "s") + "</div>" +
            "</div>";
        }).join("");
        content.querySelectorAll(".venue-list-item").forEach(function (el) {
          el.addEventListener("click", function () { focusVenue(el.dataset.id); });
        });
        panel.open();
      });
    }

    // City filter
    var cityEl = document.getElementById("citySelect");
    if (cityEl) {
      cityEl.addEventListener("change", function (e) {
        cityFilter = e.target.value;
        updateMarkers();
      });
    }

    // Attribute chips
    T.buildChips(document.getElementById("symChips"), function (sym, isActive) {
      if (isActive) { symFilter.add(sym); } else { symFilter.delete(sym); }
      updateMarkers();
    });

    // Past-events toggle
    var pastBtn = document.getElementById("pastToggle");
    if (pastBtn) {
      pastBtn.addEventListener("click", function () {
        showPast = !showPast;
        pastBtn.classList.toggle("active", showPast);
        updateMarkers();
      });
    }
  }

  function populateCityFilter() {
    var cityEl = document.getElementById("citySelect");
    if (!cityEl) return;
    var counts = new Map();
    VENUES.forEach(function (v) {
      var c = T.normalizeCity(v.city || "");
      if (c) counts.set(c, (counts.get(c) || 0) + 1);
    });
    [...counts.keys()].sort(function (a, b) { return a.localeCompare(b); }).forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c + " (" + counts.get(c) + ")";
      cityEl.appendChild(opt);
    });
  }

  async function init() {
    T.initNavDrawer();
    panel = T.initDetailPanel();
    T.initCollapsiblePanel();

    if (typeof L === "undefined") {
      document.getElementById("sidebarContent").innerHTML =
        '<div class="placeholder">The map library (Leaflet) could not be loaded. ' +
        "Check your network connection and reload.</div>";
      var mapEl = document.getElementById("map");
      if (mapEl) mapEl.innerHTML = '<div class="placeholder">Map unavailable (Leaflet failed to load).</div>';
      return;
    }

    map = L.map("map", { scrollWheelZoom: true }).setView([37.78, -122.25], 10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    try {
      var loaded = await T.loadData();
      VENUES = loaded.venueList;
      loaded.shows.forEach(function (s) {
        if (!showsByVenue[s.venue_id]) showsByVenue[s.venue_id] = [];
        showsByVenue[s.venue_id].push(s);
      });

      VENUES.forEach(function (v) {
        if (v.lat == null) return;
        var marker = L.circleMarker([v.lat, v.lng], {
          radius: markerRadius(v.show_count),
          fillColor: "#c23b22",  /* --accent; Leaflet cannot use CSS vars */
          color: "#161410",      /* --text; Leaflet cannot use CSS vars */
          weight: 1,
          fillOpacity: 0.75
        }).addTo(map);
        marker.bindPopup("<strong>" + T.escapeHtml(v.name) + "</strong><br>" +
          T.escapeHtml(v.city || "") + "<br>" + v.show_count + " show" + (v.show_count === 1 ? "" : "s"));
        marker.on("click", function () { renderVenuePanel(v.id); });
        markersById[v.id] = marker;
      });

      populateCityFilter();
      wireControls();
      updateMarkers();

      // deep link support: map.html?venue=v0042
      var requested = new URLSearchParams(window.location.search).get("venue");
      if (requested) focusVenue(requested);

    } catch (err) {
      document.getElementById("sidebarContent").innerHTML =
        '<div class="placeholder">Could not load data/venues.json or data/shows.json. ' +
        "If you opened this file directly, run a local server (e.g. <code>python3 -m http.server</code>) " +
        "or view it via GitHub Pages.</div>";
      console.error(err);
    }

    window.addEventListener("resize", function () { if (map) map.invalidateSize(); });
  }

  init();
})();