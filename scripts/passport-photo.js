/* Passport photo taker: opens the camera (or gallery), lets the student centre the face,
   and returns a 450x600 JPEG (3:4, under ~180 KB).  PassportPhoto.open() -> Promise<Blob|null> */
(function () {
  var PW = 300, PH = 400;               // on-screen frame
  var OW = 450, OH = 600;               // saved size

  function el(tag, css, html) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (html) e.innerHTML = html; return e; }
  var isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  window.PassportPhoto = {
    open: function () {
      return new Promise(function (resolve) {
        var stream = null, img = null, cx = 0, cy = 0, zoom = 1;
        var overlay = el("div", "position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:12px;");
        var box = el("div", "background:#fff;border-radius:14px;max-width:380px;width:100%;padding:18px;max-height:96vh;overflow:auto;font-family:Arial,sans-serif;color:#1a1c1c");
        overlay.appendChild(box); document.body.appendChild(overlay);

        function close(result) {
          if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
          overlay.remove(); resolve(result || null);
        }
        var BTN = "padding:11px 16px;border-radius:9px;font-weight:bold;cursor:pointer;font-size:15px;";
        var GREEN = BTN + "background:rgb(var(--c-primary));color:#fff;border:0;", LINE = BTN + "background:#fff;color:rgb(var(--c-primary));border:2px solid rgb(var(--c-primary));";

        // ---------- step 1: choose how ----------
        function stepChoose(msg) {
          if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
          box.innerHTML = "";
          box.appendChild(el("h3", "margin:0 0 6px;color:rgb(var(--c-primary));font-size:19px", "Passport photo"));
          box.appendChild(el("p", "margin:0 0 12px;font-size:14px;color:#444;line-height:1.4",
            "Face the camera in good light, plain background, no cap or sunglasses. Only your own face."));
          if (msg) box.appendChild(el("p", "margin:0 0 10px;color:#a11212;font-size:13px", msg));
          var cam = el("button", GREEN + "width:100%;margin-bottom:10px", "📷  Take photo with camera");
          var gal = el("button", LINE + "width:100%;margin-bottom:10px", "🖼  Choose from gallery");
          var cancel = el("button", "background:none;border:0;color:#666;cursor:pointer;width:100%;padding:8px", "Cancel");
          box.appendChild(cam); box.appendChild(gal); box.appendChild(cancel);

          var file = el("input"); file.type = "file"; file.accept = "image/*";
          var fileCam = el("input"); fileCam.type = "file"; fileCam.accept = "image/*"; fileCam.setAttribute("capture", "user");
          [file, fileCam].forEach(function (f) {
            f.style.display = "none"; box.appendChild(f);
            f.onchange = function () { if (f.files && f.files[0]) loadFile(f.files[0]); };
          });
          gal.onclick = function () { file.click(); };
          cam.onclick = function () {
            if (isMobile || !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) fileCam.click();
            else stepLive();
          };
          cancel.onclick = function () { close(null); };
        }

        // ---------- step 1b: live camera (computers) ----------
        function stepLive() {
          box.innerHTML = "";
          box.appendChild(el("h3", "margin:0 0 8px;color:rgb(var(--c-primary));font-size:19px", "Look at the camera"));
          var video = el("video", "width:100%;border-radius:10px;background:#000;transform:scaleX(-1)");
          video.autoplay = true; video.playsInline = true; video.muted = true;
          box.appendChild(video);
          var row = el("div", "display:flex;gap:10px;margin-top:12px");
          var snap = el("button", GREEN + "flex:1", "Capture"), back = el("button", LINE, "Back");
          row.appendChild(snap); row.appendChild(back); box.appendChild(row);
          navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
            .then(function (s) { stream = s; video.srcObject = s; })
            .catch(function () { stepChoose("Camera could not open. Allow camera access, or choose from gallery."); });
          back.onclick = function () { stepChoose(); };
          snap.onclick = function () {
            if (!video.videoWidth) return;
            var c = document.createElement("canvas"); c.width = video.videoWidth; c.height = video.videoHeight;
            c.getContext("2d").drawImage(video, 0, 0);
            var im = new Image(); im.onload = function () { setImage(im); }; im.src = c.toDataURL("image/jpeg", 0.92);
          };
        }

        function loadFile(f) {
          var url = URL.createObjectURL(f), im = new Image();
          im.onload = function () { URL.revokeObjectURL(url); setImage(im); };
          im.onerror = function () { stepChoose("That file could not be read as a picture."); };
          im.src = url;
        }

        // ---------- step 2: centre the face ----------
        function setImage(im) {
          img = im; zoom = 1; cx = im.naturalWidth / 2; cy = im.naturalHeight / 2;
          stepAdjust();
        }
        function scale() { return Math.max(PW / img.naturalWidth, PH / img.naturalHeight) * zoom; }
        function clamp() {
          var s = scale(), hx = PW / 2 / s, hy = PH / 2 / s;
          cx = Math.min(Math.max(cx, hx), img.naturalWidth - hx); cy = Math.min(Math.max(cy, hy), img.naturalHeight - hy);
        }
        function paint(ctx, w, h) {
          var k = w / PW, s = scale() * k;
          ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, w / 2 - cx * s, h / 2 - cy * s, img.naturalWidth * s, img.naturalHeight * s);
        }
        function stepAdjust() {
          if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
          box.innerHTML = "";
          box.appendChild(el("h3", "margin:0 0 4px;color:rgb(var(--c-primary));font-size:19px", "Centre your face"));
          box.appendChild(el("p", "margin:0 0 10px;font-size:13px;color:#555", "Drag the picture and use the slider so your head and shoulders fill the frame."));
          var cv = el("canvas", "display:block;margin:0 auto;border:3px solid rgb(var(--c-primary));border-radius:8px;touch-action:none;cursor:grab;max-width:100%;height:auto");
          cv.width = PW; cv.height = PH; box.appendChild(cv);
          var slider = el("input", "width:100%;margin:12px 0"); slider.type = "range"; slider.min = "1"; slider.max = "3"; slider.step = "0.02"; slider.value = "1";
          box.appendChild(slider);
          var ctx = cv.getContext("2d");
          function draw() { clamp(); paint(ctx, PW, PH); }
          draw();
          slider.oninput = function () { zoom = Number(slider.value); draw(); };
          var drag = null;
          cv.onpointerdown = function (e) { drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); cv.style.cursor = "grabbing"; };
          cv.onpointermove = function (e) {
            if (!drag) return;
            var r = cv.getBoundingClientRect(), f = PW / r.width, s = scale();
            cx -= ((e.clientX - drag.x) * f) / s; cy -= ((e.clientY - drag.y) * f) / s;
            drag = { x: e.clientX, y: e.clientY }; draw();
          };
          cv.onpointerup = cv.onpointercancel = function () { drag = null; cv.style.cursor = "grab"; };
          var row = el("div", "display:flex;gap:10px");
          var use = el("button", GREEN + "flex:1", "Use this photo"), retake = el("button", LINE, "Retake");
          row.appendChild(use); row.appendChild(retake); box.appendChild(row);
          retake.onclick = function () { stepChoose(); };
          use.onclick = function () {
            var out = document.createElement("canvas"); out.width = OW; out.height = OH;
            paint(out.getContext("2d"), OW, OH);
            var q = 0.88;
            (function tryQ() {
              out.toBlob(function (b) {
                if (b && b.size > 180 * 1024 && q > 0.45) { q -= 0.1; tryQ(); }
                else close(b);
              }, "image/jpeg", q);
            })();
          };
        }

        stepChoose();
      });
    }
  };
})();
