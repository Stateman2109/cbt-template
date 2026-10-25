/* brand.js - themes every page from the school row in Supabase (matched by website domain).
   Tokens like {{school_name}} in the HTML, [data-slot] images, colours, animation and anthem are all filled here. */
(function () {
  var C = window.CBT_CONFIG || {}, doc = document.documentElement;
  function parse(x) { var m = /^#?([0-9a-f]{6})$/i.exec((x || "").trim()); if (!m) return null; var n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function toHsl(c) { var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn, h = 0, s = 0; if (d) { s = d / (1 - Math.abs(2 * l - 1)); h = mx == r ? ((g - b) / d) % 6 : mx == g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; } return [h, s * 100, l * 100]; }
  function hsl(h, s, l) { s = Math.min(100, s) / 100; l /= 100; var a = s * Math.min(l, 1 - l); return [0, 8, 4].map(function (n) { var k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }); }
  function lum(c) { var a = c.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; }
  function on(c) { return lum(c) > 0.4 ? [11, 11, 20] : [255, 255, 255]; }
  // Builds the whole Material-style palette the pages use from just two colours.
  function derive(p1, p2) {
    var P = parse(p1) || parse("#14185f"), S = parse(p2) || parse("#0f8fd6"), p = toHsl(P), q = toHsl(S), ph = p[0], ps = p[1], sh = q[0], ss = q[1];
    var pc = hsl(ph, ps * 0.85, p[2] > 55 ? p[2] - 15 : Math.min(p[2] + 15, 45)), N = function (l) { return hsl(ph, 30, l); }, W = [255, 255, 255];
    return {
      primary: P, "on-primary": on(P), "primary-container": pc, "on-primary-container": on(pc), "primary-fixed": hsl(ph, ps, 90), "primary-fixed-dim": hsl(ph, ps, 78), "inverse-primary": hsl(ph, ps, 78), "on-primary-fixed": hsl(ph, ps, 12), "on-primary-fixed-variant": hsl(ph, ps * 0.8, 30), "surface-tint": hsl(ph, ps * 0.75, 44),
      secondary: S, "on-secondary": on(S), "secondary-container": hsl(sh, 100, 89), "secondary-fixed": hsl(sh, 100, 89), "secondary-fixed-dim": hsl(sh, 85, 75), "on-secondary-container": hsl(sh, ss, 22), "on-secondary-fixed": hsl(sh, 100, 10), "on-secondary-fixed-variant": hsl(sh, ss, 22),
      tertiary: hsl(sh, ss, Math.max(q[2] - 8, 25)), "on-tertiary": W, "tertiary-container": hsl(sh, 85, 56), "on-tertiary-container": hsl(sh, 100, 12), "tertiary-fixed": hsl(sh, 100, 78), "tertiary-fixed-dim": hsl(sh, 90, 68), "on-tertiary-fixed": hsl(sh, 100, 9), "on-tertiary-fixed-variant": hsl(sh, 100, 22),
      background: N(98.5), surface: N(98.5), "surface-bright": N(98.5), "surface-dim": N(88), "surface-container-lowest": W, "surface-container-low": N(96), "surface-container": N(94.5), "surface-container-high": N(92.5), "surface-container-highest": N(90.5), "surface-variant": N(90.5),
      "on-surface": hsl(ph, 15, 11), "on-background": hsl(ph, 15, 11), "on-surface-variant": hsl(ph, 12, 30), outline: hsl(ph, 8, 50), "outline-variant": hsl(ph, 15, 80), "inverse-surface": hsl(ph, 10, 19), "inverse-on-surface": hsl(ph, 30, 95),
      error: [186, 26, 26], "on-error": W, "error-container": [255, 218, 214], "on-error-container": [147, 0, 10],
    };
  }
  window.CBTBrand = { derive: derive, parse: parse };
  if (window.CBT_NO_AUTORUN) return;

  var host = location.hostname.toLowerCase().replace(/^www\./, "");
  var ps = new URLSearchParams(location.search).get("school"); // ?school=domain previews a school's look on any address
  if (ps) sessionStorage.setItem("cbt_preview_school", ps.toLowerCase());
  var pv = sessionStorage.getItem("cbt_preview_school");
  if (pv) host = pv; else if (host === "localhost" || host === "127.0.0.1") host = (C.LOCAL_TEST_DOMAIN || "").toLowerCase();
  var key = "cbt_brand_" + host, cached = null, bind = [], first;
  try { cached = JSON.parse(localStorage.getItem(key)); } catch (e) {}
  window.BRAND_READY = new Promise(function (r) { first = r; });
  doc.classList.add("brand-pending");
  var st = document.createElement("style");
  st.textContent = "html.brand-pending body{visibility:hidden}" +
    "html[data-anim=slide] .schools-slide{transform:translateX(6%);transition:opacity 900ms ease,transform 900ms ease!important}html[data-anim=slide] .schools-slide.opacity-100{transform:none}" +
    "html[data-anim=zoom] .schools-slide.opacity-100 img{animation:cbtzoom 9s ease-out forwards}@keyframes cbtzoom{from{transform:scale(1)}to{transform:scale(1.09)}}" +
    "html[data-anim=none] .schools-slide{transition:none!important}@media(prefers-reduced-motion:reduce){html .schools-slide,html .schools-slide img{transition:none!important;animation:none!important;transform:none!important}}";
  document.head.appendChild(st);

  function theme(row) {
    var pal = derive(row && row.primary_color, row && row.secondary_color);
    for (var k in pal) doc.style.setProperty("--c-" + k, pal[k].join(" "));
    doc.setAttribute("data-anim", (row && row.animation_style) || "fade");
  }
  function tokens(row) {
    var n = (row && row.school_name) || "School CBT Portal", s = row.short_name || n, loc = row.location || "", city = row.city || loc.split(",")[0] || "";
    var T = { school_name: n, school_name_upper: n.toUpperCase(), short_name: s, short_name_upper: s.toUpperCase(), city: city, location: loc, tagline: row.tagline || "", logo_url: row.logo_url || "", address: row.address || "", phone: row.phone || "", email: row.email || "" };
    window.BRAND = T; return T;
  }
  function collect() {
    var w = document.createTreeWalker(doc, 5), n, attrs = ["alt", "title", "content", "placeholder", "aria-label", "value"];
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) { if (n.nodeValue.indexOf("{{") > -1 && !/^(SCRIPT|STYLE|TEXTAREA|NOSCRIPT)$/.test(n.parentNode.nodeName)) bind.push([n, null, n.nodeValue]); }
      else attrs.forEach(function (a) { var v = n.getAttribute && n.getAttribute(a); if (v && v.indexOf("{{") > -1) bind.push([n, a, v]); });
    }
  }
  function render(row) {
    row = row || {}; theme(row); var T = tokens(row), tc = document.querySelector("meta[name=theme-color]"); if (tc) tc.content = "rgb(" + derive(row.primary_color, row.secondary_color).primary.join(",") + ")";
    bind.forEach(function (b) { var v = b[2].replace(/\{\{(\w+)\}\}/g, function (m, k) { return T[k] || ""; }); b[1] ? b[0].setAttribute(b[1], v) : (b[0].nodeValue = v); });
    var img = row.images || {}, waits = [];
    document.querySelectorAll("[data-slot]").forEach(function (el) {
      var slot = el.getAttribute("data-slot"), url = slot === "logo" ? row.logo_url : slot === "favicon" ? row.favicon_url || row.logo_url : img[slot], tag = el.tagName;
      if (!url) { if (tag === "IMG") { el.style.display = "none"; el.dispatchEvent(new Event("error")); } return; }
      if (tag === "LINK") el.href = url; else if (tag === "META") el.setAttribute("content", url);
      else { el.style.display = ""; waits.push(new Promise(function (r) { el.onload = r; el.addEventListener("error", r); })); el.src = url; }
    });
    var au = document.getElementById("anthem-audio"), ab = document.getElementById("anthem-btn");
    if (au && row.anthem_url) au.src = row.anthem_url; else { if (ab) ab.style.display = "none"; if (au) au.removeAttribute("src"); }
    doc.classList.remove("brand-pending");
    Promise.race([Promise.all(waits), new Promise(function (r) { setTimeout(r, 6000); })]).then(first);
  }
  var domReady = new Promise(function (r) { document.readyState !== "loading" ? r() : document.addEventListener("DOMContentLoaded", r); });
  domReady.then(collect);
  theme(cached);
  var done = false;
  function show(row) { domReady.then(function () { render(row); done = true; }); }
  if (cached) show(cached);
  var cols = "id,school_name,short_name,tagline,city,location,address,phone,email,domain,logo_url,favicon_url,primary_color,secondary_color,images,anthem_url,animation_style";
  fetch(C.SUPABASE_URL + "/rest/v1/schools?select=" + cols + "&domain=eq." + encodeURIComponent(host) + "&is_active=eq.true", { headers: { apikey: C.SUPABASE_ANON_KEY } })
    .then(function (r) { return r.json(); })
    .then(function (rows) {
      var row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
      if (row) { var s = JSON.stringify(row); if (!cached || JSON.stringify(cached) !== s) { localStorage.setItem(key, s); show(row); } }
      else if (!cached) show(null);
    })
    .catch(function () { if (!cached) show(null); });
  setTimeout(function () { if (!done && !cached) show(null); }, 5000);
})();
