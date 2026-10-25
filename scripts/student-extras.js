/* Student dashboard extras: ID card + exams set by the student's own teachers (Junior or Senior). */
(function () {
  var esc = function (t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var $ = function (id) { return document.getElementById(id); };
  var cap = function (s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; };

  async function initCard(db, uid) {
    try {
      var r = await db.from("profiles").select("full_name,candidate_no,verify_token,class_level,student_section,photo_at").eq("id", uid).maybeSingle();
      var p = r.data;
      if (!p || !p.candidate_no || !p.verify_token || !window.CandidateCard || !window.SchoolQR) return;
      var B = window.BRAND || {}, photo = null;
      if (p.photo_at) {
        var url = db.storage.from("student-photos").getPublicUrl(p.verify_token + ".jpg").data.publicUrl + "?v=" + encodeURIComponent(p.photo_at);
        photo = await new Promise(function (res) { var im = new Image(); im.crossOrigin = "anonymous"; im.onload = function () { res(im); }; im.onerror = function () { res(null); }; im.src = url; });
      }
      var take = async function () {
        var blob = await window.PassportPhoto.open();
        if (!blob) return;
        var up = await db.storage.from("student-photos").upload(p.verify_token + ".jpg", blob, { upsert: true, contentType: "image/jpeg", cacheControl: "60" });
        if (up.error) return alert("Could not save your photo: " + up.error.message);
        var pr = await db.from("profiles").update({ photo_at: new Date().toISOString() }).eq("id", uid);
        if (pr.error) return alert("Photo saved but could not be linked: " + pr.error.message);
        initCard(db, uid);
      };
      $("photo-add").onclick = take; $("photo-change").onclick = take;
      $("photo-notice").classList.toggle("hidden", !!p.photo_at);
      $("photo-change").classList.toggle("hidden", !p.photo_at);
      var cards = await window.CandidateCard.render({ photo: photo, name: p.full_name, candidateNo: p.candidate_no, school: B.school_name, schoolName: B.school_name, shortName: B.short_name, section: cap(p.student_section), classLevel: p.class_level, token: p.verify_token });
      var box = $("candidate-card-preview"); box.innerHTML = "";
      [cards.front, cards.back].forEach(function (cv) { cv.style.cssText = "width:100%;max-width:430px;height:auto;border-radius:14px;box-shadow:0 2px 10px rgba(0,0,0,.2)"; box.appendChild(cv); });
      var base = p.candidate_no.replace(/[^A-Za-z0-9-]/g, "_");
      $("card-print").onclick = function () { window.CandidateCard.print(cards, "Student card " + p.candidate_no); };
      $("card-dl-front").onclick = function () { window.CandidateCard.download(cards.front, base + "-front.png"); };
      $("card-dl-back").onclick = function () { window.CandidateCard.download(cards.back, base + "-back.png"); };
      $("candidate-card-section").classList.remove("hidden");
    } catch (e) { console.warn("Card not shown:", e); }
  }

  var seenKey = function (u) { return "cexam_seen_" + u; };
  async function initExams(db, uid) {
    try {
      var q = await Promise.all([
        db.from("class_exams").select("*").eq("published", true).eq("is_active", true).order("created_at", { ascending: false }),
        db.from("results").select("class_exam_id").eq("user_id", uid).not("class_exam_id", "is", null),
      ]);
      var exams = q[0].data || [];
      if (q[0].error || !exams.length) return;
      var taken = new Set((q[1].data || []).map(function (r) { return r.class_exam_id; })), now = Date.now();
      var stateOf = function (e) {
        if (taken.has(e.id)) return "done";
        if (e.opens_at && new Date(e.opens_at).getTime() > now) return "soon";
        if (e.closes_at && new Date(e.closes_at).getTime() < now) return "closed";
        return "open";
      };
      $("class-exams-list").innerHTML = exams.map(function (e) {
        var s = stateOf(e), note = { open: e.closes_at ? "Closes " + new Date(e.closes_at).toLocaleString() : "Open now", soon: "Opens " + (e.opens_at ? new Date(e.opens_at).toLocaleString() : ""), closed: "Closed", done: "Completed" }[s];
        return '<div class="border border-outline-variant rounded-lg p-4 flex flex-col gap-2"><div class="font-bold">' + esc(e.title) + '</div><div class="text-sm text-on-surface-variant">' + esc(e.subject) + " · " + e.question_count + " questions · " + e.duration_minutes + ' min</div><div class="text-xs text-outline">' + (s === "open" ? esc(note) : "") + "</div><div>" +
          (s === "open" ? '<button data-start="' + esc(e.id) + '" class="bg-primary text-on-primary px-4 py-2 rounded-lg font-label-md text-label-md">Start exam</button>' : '<span class="text-xs font-bold uppercase text-outline">' + esc(note) + "</span>") + "</div></div>";
      }).join("");
      $("class-exams-section").classList.remove("hidden");
      $("class-exams-list").querySelectorAll("[data-start]").forEach(function (b) {
        b.onclick = function () {
          var e = exams.find(function (x) { return x.id === b.dataset.start; }); if (!e) return;
          localStorage.setItem("examData", JSON.stringify({ classExamId: e.id, title: e.title, subject: e.subject, category: "", year: "", type: "CLASS-" + e.id }));
          location.href = "exam.html";
        };
      });
      var seen = []; try { seen = JSON.parse(localStorage.getItem(seenKey(uid)) || "[]"); } catch (x) {}
      var fresh = exams.filter(function (e) { return stateOf(e) === "open" && seen.indexOf(e.id) < 0; });
      if (fresh.length) {
        localStorage.setItem(seenKey(uid), JSON.stringify(seen.concat(fresh.map(function (e) { return e.id; }))));
        if (window.showNotification) showNotification("New exam from your teacher: " + fresh[0].title);
        $("class-exams-section").scrollIntoView({ behavior: "smooth" });
      }
    } catch (e) { console.warn("Class exams not loaded:", e); }
  }

  function boot() {
    var db = window.supabaseClient || (typeof supabaseClient !== "undefined" ? supabaseClient : null);
    if (!db) return setTimeout(boot, 150);
    db.auth.getUser().then(function (r) {
      var u = r.data && r.data.user; if (!u) return;
      initCard(db, u.id); initExams(db, u.id);
      setInterval(function () { initExams(db, u.id); }, 60000);
    });
  }
  (window.BRAND_READY || Promise.resolve()).then(boot);
})();
