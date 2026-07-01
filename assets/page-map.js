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
    var shows = (showsByVenue[venueId] || []).slice().sort(function (a, b) { return a.d - b.d; });
    var content = document.getElementById("sidebarContent");
    var sellOutCount = shows.filter(function (s) { return s.sym.includes("$"); }).length;

    var html = '<div class="panel-head">' +
      "<h2>" + T.escapeHtml(v.name) + "</h2>" +
      '<div class="addr">' + T.escapeHtml(v.address || v.city || "") + "</div>" +
      (!v.precise ? '<div class="approx">approximate location</div>' : "") +
      (sellOutCount > 0
        ? '<div class="sellout-summary"><i class="fa-solid fa-fire ic-fire"></i> ' +
          sellOutCount + " show" + (sellOutCount === 1 ? "" : "s") + " likely to sell out</div>"
        : "") +
      "</div>";

    if (shows.length === 0) {
      html += '<div class="placeholder">No shows listed for this venue.</div>';
    } else {
      html += shows.map(function (s) {
        return '<div class="show-item' + (s.sym.includes("$") ? " sellout" : "") + '">' +
          '<span class="sdate">' + T.escapeHtml(s.date) + '</span><span class="swk">' + T.escapeHtml(s.wk) + "</span>" +
          '<div class="sbands">' + T.escapeHtml(s.bands) + "</div>" +
          '<div class="smeta">' + T.escapeHtml(s.age) + " " + T.escapeHtml(s.price) + " " + T.escapeHtml(s.time) +
            ' <span class="ssym">' + T.showSymbolsHtml(s) + "</span></div>" +
          "</div>";
      }).join("");
    }
    content.innerHTML = html;
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

  function wireSearch() {
    document.getElementById("venueSearch").addEventListener("input", function (e) {
      var q = e.target.value.trim().toLowerCase();
      var content = document.getElementById("sidebarContent");
      if (!q) {
        content.innerHTML = '<div class="placeholder">Click a marker on the map, or search for a venue, to see its show calendar.</div>';
        return;
      }
      var matches = VENUES.filter(function (v) {
        return v.name.toLowerCase().includes(q) || (v.city || "").toLowerCase().includes(q);
      }).sort(function (a, b) { return b.show_count - a.show_count; }).slice(0, 40);

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
    });
  }

  async function init() {
    T.initNavDrawer();
    panel = T.initDetailPanel();

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
          fillColor: "#c23b22",
          color: "#161410",
          weight: 1,
          fillOpacity: 0.75
        }).addTo(map);
        marker.bindPopup("<strong>" + T.escapeHtml(v.name) + "</strong><br>" +
          T.escapeHtml(v.city || "") + "<br>" + v.show_count + " show" + (v.show_count === 1 ? "" : "s"));
        marker.on("click", function () { renderVenuePanel(v.id); });
        markersById[v.id] = marker;
      });

      // deep link support: map.html?venue=v0042
      var requested = new URLSearchParams(window.location.search).get("venue");
      if (requested) focusVenue(requested);

      wireSearch();
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
