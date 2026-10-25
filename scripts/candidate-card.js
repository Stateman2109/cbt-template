/* Candidate ID card (CR80 / credit-card size: 85.6 mm x 54 mm), drawn on a canvas at 300 dpi.
   Needs scripts/qr.js. Used by student-dashboard.html.
   CandidateCard.render({name, candidateNo, school, lga, district, classLevel, token}) -> {front, back} canvases */
(function () {
  var W = 1012, H = 638; // 85.6 mm x 54 mm at 300 dpi
  var GREEN = "#14185f", GOLD = "#0f8fd6", ONG = "#ffffff", INK = "#1a1c1c", GREY = "#5f6b64";
  function cssRgb(n) { var v = getComputedStyle(document.documentElement).getPropertyValue("--c-" + n).trim().split(/\s+/); return v.length === 3 ? "rgb(" + v.join(",") + ")" : null; }
  var FONT = "Arial, Helvetica, sans-serif";

  function loadLogo() {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      var u = (window.BRAND && window.BRAND.logo_url) || ""; if (!u) { resolve(null); return; } img.crossOrigin = "anonymous"; img.src = u;
    });
  }

  function fit(ctx, text, maxW, size, weight) {
    var s = size;
    ctx.font = weight + " " + s + "px " + FONT;
    while (ctx.measureText(text).width > maxW && s > 16) { s -= 1; ctx.font = weight + " " + s + "px " + FONT; }
    return s;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawQR(ctx, text, x, y, size) {
    var qr = window.SchoolQR.make(text), n = qr.size, quiet = 2, cell = size / (n + quiet * 2);
    ctx.fillStyle = "#fff"; ctx.fillRect(x, y, size, size);
    ctx.fillStyle = "#000";
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
      if (qr.dark(r, c)) ctx.fillRect(Math.floor(x + (c + quiet) * cell), Math.floor(y + (r + quiet) * cell), Math.ceil(cell), Math.ceil(cell));
    }
  }

  function base(logo) {
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var ctx = cv.getContext("2d");
    roundRect(ctx, 0, 0, W, H, 34); ctx.clip();
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
    if (logo) { ctx.globalAlpha = 0.06; ctx.drawImage(logo, W / 2 - 230, H / 2 - 220, 460, 456); ctx.globalAlpha = 1; }
    return { cv: cv, ctx: ctx };
  }

  function header(ctx, logo, title, d) {
    ctx.fillStyle = GREEN; ctx.fillRect(0, 0, W, 150);
    ctx.fillStyle = GOLD; ctx.fillRect(0, 150, W, 8);
    if (logo) ctx.drawImage(logo, 34, 22, 106, 106);
    ctx.fillStyle = ONG; ctx.textBaseline = "alphabetic";
    var nm = String(d.schoolName || "").toUpperCase(); fit(ctx, nm, 820, 30, "bold"); ctx.fillText(nm, 165, 58);
    var sn = String(d.shortName || "").toUpperCase() + " CBT"; fit(ctx, sn, 820, 44, "bold"); ctx.fillText(sn, 165, 106);
    ctx.fillStyle = ONG; ctx.globalAlpha = 0.85; ctx.font = "bold 24px " + FONT; ctx.fillText(title, 165, 138); ctx.globalAlpha = 1;
  }

  function label(ctx, text, x, y) { ctx.fillStyle = GREY; ctx.font = "bold 19px " + FONT; ctx.fillText(text, x, y); }
  function value(ctx, text, x, y, maxW, size, color) {
    ctx.fillStyle = color || INK; fit(ctx, text, maxW, size || 34, "bold"); ctx.fillText(text, x, y);
  }

  function drawPhoto(ctx, photo, x, y, w, h) {
    ctx.save();
    roundRect(ctx, x, y, w, h, 12); ctx.clip();
    if (photo) {
      var s = Math.max(w / photo.naturalWidth, h / photo.naturalHeight);
      var dw = photo.naturalWidth * s, dh = photo.naturalHeight * s;
      ctx.drawImage(photo, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    } else {
      ctx.fillStyle = "#eef3ef"; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#9db3a5"; ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.38, w * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + w / 2, y + h * 0.82, w * 0.36, h * 0.24, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = GREY; ctx.font = "bold 18px " + FONT; ctx.textAlign = "center";
      ctx.fillText("PASSPORT PHOTO", x + w / 2, y + h - 16); ctx.textAlign = "left";
    }
    ctx.restore();
    roundRect(ctx, x, y, w, h, 12); ctx.lineWidth = 4; ctx.strokeStyle = GREEN; ctx.stroke();
  }

  function front(logo, d) {
    var b = base(logo), ctx = b.ctx;
    header(ctx, logo, "STUDENT IDENTITY CARD", d);
    drawPhoto(ctx, d.photo, 40, 184, 210, 280);
    var x = 276, wide = 380;
    label(ctx, "STUDENT NAME", x, 208);
    value(ctx, String(d.name || "").toUpperCase(), x, 246, wide, 32);
    label(ctx, "SCHOOL", x, 292);
    value(ctx, d.school || "", x, 326, wide, 28);
    label(ctx, "SECTION", x, 372);
    value(ctx, d.section || "", x, 404, 180, 28);
    label(ctx, "CLASS", x + 200, 372);
    value(ctx, d.classLevel || "", x + 200, 404, 180, 28);
    label(ctx, "STUDENT NUMBER", 40, 536);
    value(ctx, d.candidateNo || "", 40, 584, 620, 44, GREEN);
    // QR
    var site = String(d.baseUrl || window.PORTAL_PUBLIC_URL || location.origin).replace(/\/+$/, "");
    var url = site + "/verify.html?c=" + encodeURIComponent(d.token);
    roundRect(ctx, 676, 196, 292, 292, 14); ctx.fillStyle = "#fff"; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = GREEN; ctx.stroke();
    drawQR(ctx, url, 686, 206, 272);
    ctx.fillStyle = GREEN; ctx.font = "bold 21px " + FONT; ctx.textAlign = "center";
    ctx.fillText("SCAN TO VERIFY", 822, 524);
    ctx.fillStyle = GREY; ctx.font = "17px " + FONT;
    ctx.fillText(site.replace(/^https?:\/\//, ""), 822, 552);
    ctx.textAlign = "left";
    ctx.fillStyle = GREEN; ctx.fillRect(0, H - 14, W, 14);
    return b.cv;
  }

  function back(logo, d) {
    var b = base(logo), ctx = b.ctx;
    header(ctx, logo, "STUDENT IDENTITY CARD", d);
    ctx.fillStyle = INK; ctx.font = "bold 26px " + FONT; ctx.fillText("IMPORTANT", 44, 215);
    ctx.font = "23px " + FONT;
    var lines = [
      "1. This card identifies the holder as a student of",
      "    " + (d.schoolName || "this school") + ".",
      "2. Keep it safe and bring it to every examination.",
      "3. It is not transferable. Scan the QR code on the",
      "    front to confirm the holder's details online.",
      "4. If found, please return it to the school office."
    ];
    lines.forEach(function (t, i) { ctx.fillText(t, 44, 262 + i * 38); });
    ctx.fillStyle = GREY; ctx.font = "bold 19px " + FONT; ctx.fillText("STUDENT NUMBER", 44, 560);
    ctx.fillStyle = GREEN; ctx.font = "bold 34px " + FONT; ctx.fillText(d.candidateNo || "", 44, 598);
    ctx.fillStyle = GREEN; ctx.fillRect(0, H - 14, W, 14);
    return b.cv;
  }

  window.CandidateCard = {
    width: W, height: H,
    render: function (d) {
      GREEN = cssRgb("primary") || GREEN; GOLD = cssRgb("secondary") || GOLD; ONG = cssRgb("on-primary") || ONG;
      return loadLogo().then(function (logo) {
        var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
        return ready.then(function () { return { front: front(logo, d), back: back(logo, d) }; });
      });
    },
    // Opens a print window sized to the real card (85.6 x 54 mm). In the print dialog choose "Save as PDF" or a printer.
    print: function (cards, name) {
      var w = window.open("", "_blank");
      if (!w) { alert("Please allow pop-ups to print your card."); return; }
      w.document.write(
        "<!doctype html><title>" + String(name || "Candidate card").replace(/[<&]/g, "") + "</title>" +
        "<style>@page{size:A4;margin:12mm}body{margin:0;font-family:Arial,sans-serif}" +
        "img{width:85.6mm;height:54mm;display:block;margin:0 0 6mm 0;border:0.2mm solid #bbb;border-radius:3mm}" +
        "p{font-size:11px;color:#555;margin:0 0 4mm}@media print{p{display:none}}</style>" +
        "<p>Print at 100% (Actual size), then cut along the border. Front and back are below.</p>" +
        "<img src='" + cards.front.toDataURL("image/png") + "'><img src='" + cards.back.toDataURL("image/png") + "'>" +
        "<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>"
      );
      w.document.close();
    },
    download: function (canvas, filename) {
      var a = document.createElement("a");
      a.href = canvas.toDataURL("image/png"); a.download = filename; a.click();
    }
  };
})();
