/* Shared helpers for the Teacher and Principal dashboards. Everything is limited to ONE school:
   the database only returns this school's students (row-level security), and we filter again here. */
window.Staff = (function () {
  var C = window.CBT_CONFIG, PASS = 50;
  var db = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var fmt = function (n) { return Number(n).toLocaleString(); };
  var avg = function (a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; };
  var pct = function (v) { return v == null ? "–" : v.toFixed(1) + "%"; };
  var group = function (arr, f) { return arr.reduce(function (o, x) { var k = f(x); (o[k] = o[k] || []).push(x); return o; }, {}); };
  var cap = function (s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; };
  var status = function (html) { $("status").innerHTML = html; $("status").classList.remove("hidden"); };

  async function fetchAll(table, cols) {
    var out = [];
    for (var from = 0; ; from += 1000) {
      var r = await db.from(table).select(cols).range(from, from + 999);
      if (r.error) throw r.error;
      out = out.concat(r.data);
      if (r.data.length < 1000) break;
    }
    return out;
  }
  async function start(roles) {
    var u = (await db.auth.getUser()).data.user;
    if (!u) { location.href = "register.html"; return null; }
    var me = (await db.from("profiles").select("role,full_name,school_id").eq("id", u.id).maybeSingle()).data;
    if (!me || roles.indexOf(me.role) < 0) { status("<b>Access denied.</b> This page is only for the matching school staff account."); return null; }
    if (!me.school_id) { status("<b>This account is not linked to a school.</b> Ask the system administrator to fix it."); return null; }
    var portal = (await db.from("schools").select("id,school_name,domain").eq("id", me.school_id).maybeSingle()).data;
    var host = location.hostname.replace(/^www\./, ""), local = ["localhost", "127.0.0.1"].indexOf(host) >= 0 || sessionStorage.getItem("cbt_preview_school");
    if (!portal || (portal.domain !== host && !local)) { status("<b>Access denied.</b> This account belongs to a different school website."); return null; }
    $("who").textContent = me.full_name || u.email;
    $("logout").onclick = async function () { await db.auth.signOut(); location.href = "index.html"; };
    return { user: u, me: me, portal: portal };
  }
  // section = "junior" | "senior" for a teacher, null for the principal
  async function load(portalId, section) {
    var students = (await fetchAll("profiles", "id,full_name,class_level,student_section,role,school_id,candidate_no"))
      .filter(function (p) { return p.role === "student" && p.school_id === portalId && (!section || String(p.student_section || "").toLowerCase() === section); });
    var all = await fetchAll("results", "id,user_id,score,total,subject,created_at,exam_name,class_exam_id");
    var incidents = [], cols = ["id,kind,user_id,created_at,exam_title,subject,count_no,away_seconds,details,class_exam_id", "id,kind,user_id,created_at,exam_title,subject,count_no,away_seconds,details", "id,kind,user_id,created_at,subject,details"];
    for (var i = 0; i < cols.length; i++) { try { incidents = await fetchAll("exam_incidents", cols[i]); break; } catch (e) {} }
    var ids = new Set(students.map(function (s) { return s.id; }));
    var allResults = all.filter(function (r) { return ids.has(r.user_id); }).map(function (r) { return Object.assign({}, r, { p: Number(r.total) > 0 ? (r.score / r.total) * 100 : Number(r.score) }); });
    var results = allResults.filter(function (r) { return Number(r.score) > 0; });
    var byUser = group(results, function (r) { return r.user_id; });
    var rows = students.map(function (s) { var rs = byUser[s.id] || []; return Object.assign({}, s, { section: cap(String(s.student_section || "").toLowerCase()) || "Not set", class_level: s.class_level || "Not set", exams: rs.length, avg: avg(rs.map(function (r) { return r.p; })) }); });
    var byId = Object.fromEntries(rows.map(function (s) { return [s.id, s]; }));
    results.forEach(function (r) { r.s = byId[r.user_id]; });
    allResults.forEach(function (r) { r.s = byId[r.user_id]; });
    return { rows: rows, results: results, allResults: allResults, incidents: incidents.filter(function (x) { return ids.has(x.user_id); }), byId: byId };
  }
  function kpis(items) {
    $("kpis").innerHTML = items.map(function (x) { return '<div class="bg-white border rounded-xl p-4"><p class="text-xs uppercase tracking-wide text-gray-500">' + x[0] + '</p><p class="text-2xl font-bold mt-1 text-[rgb(var(--c-primary))]">' + x[1] + "</p></div>"; }).join("");
  }
  function badge(a) { return a == null ? '<span class="text-gray-400">No exam yet</span>' : pct(a) + ' <span class="ml-2 text-xs px-2 py-0.5 rounded-full ' + (a >= PASS ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800") + '">' + (a >= PASS ? "Pass" : "Needs help") + "</span>"; }
  function classTable(el, rows, onPick) {
    var g = group(rows, function (s) { return s.class_level; });
    var list = Object.keys(g).sort().map(function (k) { var ss = g[k], w = ss.filter(function (s) { return s.exams > 0; }); return { c: k, n: ss.length, ex: ss.reduce(function (n, s) { return n + s.exams; }, 0), a: avg(w.map(function (s) { return s.avg; })), part: ss.length ? (w.length / ss.length) * 100 : 0 }; });
    el.innerHTML = '<thead class="bg-gray-50 text-left text-gray-600"><tr><th class="p-3">Class</th><th class="p-3">Students</th><th class="p-3">Exams</th><th class="p-3">Average</th><th class="p-3">Participation</th></tr></thead><tbody>' +
      (list.map(function (r) { return '<tr class="border-t hover:bg-gray-50 cursor-pointer" data-c="' + esc(r.c) + '"><td class="p-3 font-medium">' + esc(r.c) + '</td><td class="p-3">' + fmt(r.n) + '</td><td class="p-3">' + fmt(r.ex) + '</td><td class="p-3">' + pct(r.a) + '</td><td class="p-3">' + pct(r.part) + "</td></tr>"; }).join("") || '<tr><td class="p-4 text-gray-500" colspan="5">No students have registered yet.</td></tr>') + "</tbody>";
    el.querySelectorAll("tr[data-c]").forEach(function (tr) { tr.onclick = function () { onPick(tr.dataset.c); }; });
  }
  function studentTable(el, rows, st, cols, redraw) {
    var arrow = function (k) { return st.key === k ? (st.dir === "asc" ? " ▲" : " ▼") : ""; };
    rows = rows.slice().sort(function (a, b) { var x = a[st.key], y = b[st.key]; if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; var c = typeof x === "number" ? x - y : String(x).localeCompare(String(y)); return st.dir === "asc" ? c : -c; });
    el.innerHTML = '<thead class="bg-gray-50 text-left text-gray-600"><tr>' + cols.map(function (c) { return '<th class="p-3 cursor-pointer select-none whitespace-nowrap" data-k="' + c[0] + '">' + c[1] + arrow(c[0]) + "</th>"; }).join("") + '</tr></thead><tbody>' +
      (rows.slice(0, 500).map(function (s) { return '<tr class="border-t">' + cols.map(function (c) { return '<td class="p-3">' + (c[0] === "avg" ? badge(s.avg) : esc(s[c[0]])) + "</td>"; }).join("") + "</tr>"; }).join("") || '<tr><td class="p-4 text-gray-500" colspan="' + cols.length + '">No students match.</td></tr>') + "</tbody>";
    el.querySelectorAll("th[data-k]").forEach(function (th) { th.onclick = function () { var k = th.dataset.k; st.dir = st.key === k && st.dir === "desc" ? "asc" : "desc"; st.key = k; redraw(); }; });
    return rows;
  }
  function csv(name, head, rows) {
    var t = "\uFEFF" + [head].concat(rows).map(function (r) { return r.map(function (v) { var x = String(v == null ? "" : v); if (/^[=+\-@]/.test(x)) x = "'" + x; return '"' + x.replace(/"/g, '""') + '"'; }).join(","); }).join("\n");
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([t], { type: "text/csv;charset=utf-8" })); a.download = name; a.click();
  }
  function panels(el, D) {
    var w = D.rows.filter(function (s) { return s.exams > 0; }).sort(function (a, b) { return b.avg - a.avg; });
    var list = function (arr, f) { return arr.length ? '<ul class="text-sm divide-y">' + arr.map(f).join("") + "</ul>" : '<p class="text-sm text-gray-500">Nothing to show yet.</p>'; };
    var row = function (l, r) { return '<li class="py-1.5 flex justify-between gap-3"><span>' + l + '</span><b>' + r + "</b></li>"; };
    var subj = Object.entries(group(D.results, function (r) { return r.subject || "Unknown"; })).map(function (e) { return [e[0], avg(e[1].map(function (r) { return r.p; })), e[1].length]; }).sort(function (a, b) { return b[1] - a[1]; });
    var inc = Object.entries(group(D.incidents, function (i) { return i.user_id; })).map(function (e) { return [(D.byId[e[0]] || {}).full_name || "Student", e[1].length]; }).sort(function (a, b) { return b[1] - a[1]; });
    var box = function (t, b) { return '<div class="bg-white border rounded-xl p-4"><h3 class="font-semibold mb-2">' + t + "</h3>" + b + "</div>"; };
    el.innerHTML = box("Top performers", list(w.slice(0, 8), function (s) { return row(esc(s.full_name) + ' <span class="text-gray-400 text-xs">' + esc(s.class_level) + "</span>", pct(s.avg)); })) +
      box("Needs support", list(w.slice(-8).reverse(), function (s) { return row(esc(s.full_name) + ' <span class="text-gray-400 text-xs">' + esc(s.class_level) + "</span>", pct(s.avg)); })) +
      box("Performance by subject", list(subj.slice(0, 10), function (s) { return row(esc(s[0]) + ' <span class="text-gray-400 text-xs">' + s[2] + " exams</span>", pct(s[1])); })) +
      box("Exam irregularities", list(inc.slice(0, 8), function (s) { return row(esc(s[0]), s[1] + " flag" + (s[1] === 1 ? "" : "s")); }));
  }

  // Examination irregularities table. opts.onReopen(examId, studentId, studentName, examTitle) adds a Reopen button for auto-submitted exams.
  function irreg(el, D, opts) {
    opts = opts || {};
    var groups = group(D.incidents.filter(function (i) { return D.byId[i.user_id]; }), function (i) { return i.user_id + "|" + (i.class_exam_id || i.exam_title || i.subject || ""); });
    var secs = function (n) { return n >= 60 ? Math.floor(n / 60) + "m " + (n % 60) + "s" : n + "s"; };
    var rows = Object.keys(groups).map(function (k) {
      var rs = groups[k], s = D.byId[rs[0].user_id];
      var strikes = rs.filter(function (r) { return r.kind === "tab_switch" || r.kind === "page_leave"; }), refr = rs.filter(function (r) { return r.kind === "page_refresh"; });
      var times = Math.max.apply(null, [strikes.length, 0].concat(rs.filter(function (r) { return r.kind !== "page_refresh"; }).map(function (r) { return Number(r.count_no) || 0; })));
      var first = rs.find(function (r) { return r.exam_title || r.details; }) || rs[0];
      return { s: s, examId: (rs.find(function (r) { return r.class_exam_id; }) || {}).class_exam_id, exam: first.exam_title || String(first.details || "").split(":")[0] || "-", times: times, refreshes: refr.length,
        away: refr.reduce(function (n, r) { return n + (Number(r.away_seconds) || 0); }, 0), auto: rs.some(function (r) { return r.kind === "auto_submitted"; }),
        last: rs.map(function (r) { return r.created_at; }).filter(Boolean).sort().pop() };
    }).sort(function (a, b) { return b.times - a.times || b.refreshes - a.refreshes || String(b.last).localeCompare(String(a.last)); });
    var locked = rows.filter(function (r) { return r.auto; }).length;
    var head = ["Student", "Class", "Exam", "Left the page", "Refreshed", "Time away", "Status", "Last time"].concat(opts.onReopen ? ["Action"] : []);
    var badge = function (r) { return r.auto ? ["Auto-submitted", "bg-red-100 text-red-800"] : r.times > 0 ? ["Warned", "bg-yellow-100 text-yellow-800"] : ["Refreshed only", "bg-blue-100 text-blue-800"]; };
    el.innerHTML = '<div class="p-4 border-b"><h2 class="font-semibold text-lg">Examination irregularities</h2><p class="text-sm text-gray-500">' + (rows.length ? locked + " exam" + (locked === 1 ? "" : "s") + " auto-submitted · " + rows.length + " student/exam record" + (rows.length === 1 ? "" : "s") : "No irregularities recorded yet.") + '</p><p class="text-xs text-gray-400 mt-1">“Left the page” = switched tab or app (3 times locks the exam). “Refreshed” is not counted as cheating; it is listed so you can check students who may have had network problems. The exam clock never stops.' + (opts.onReopen ? " Use Reopen only for a genuine problem: the student then gets one fresh attempt." : "") + "</p></div>" +
      (rows.length ? '<div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-left text-gray-600"><tr>' + head.map(function (h) { return '<th class="p-3">' + h + "</th>"; }).join("") + "</tr></thead><tbody>" +
        rows.map(function (r, i) { var b = badge(r);
          return '<tr class="border-t"><td class="p-3 font-medium">' + esc(r.s.full_name) + '</td><td class="p-3">' + esc(r.s.class_level) + '</td><td class="p-3">' + esc(r.exam) + '</td><td class="p-3 font-bold">' + (r.times ? r.times + "×" : "–") + '</td><td class="p-3">' + (r.refreshes ? r.refreshes + "×" : "–") + '</td><td class="p-3">' + (r.away ? secs(r.away) : "–") + '</td><td class="p-3"><span class="text-xs px-2 py-0.5 rounded-full ' + b[1] + '">' + b[0] + '</span></td><td class="p-3 whitespace-nowrap">' + (r.last ? new Date(r.last).toLocaleString() : "-") + "</td>" +
            (opts.onReopen ? '<td class="p-3">' + (r.auto && r.examId ? '<button class="px-3 py-1 rounded-lg text-xs font-semibold bg-[rgb(var(--c-primary))] text-[rgb(var(--c-on-primary))]" data-ro="' + i + '">Reopen</button>' : "–") + "</td>" : "") + "</tr>"; }).join("") + "</tbody></table></div>" : "");
    if (opts.onReopen) el.querySelectorAll("[data-ro]").forEach(function (b) { b.onclick = function () { var r = rows[b.dataset.ro]; opts.onReopen(r.examId, r.s.id, r.s.full_name, r.exam); }; });
  }
  return { irreg: irreg, db: db, $: $, esc: esc, fmt: fmt, avg: avg, pct: pct, group: group, cap: cap, PASS: PASS, start: start, load: load, kpis: kpis, classTable: classTable, studentTable: studentTable, csv: csv, panels: panels, status: status };
})();
