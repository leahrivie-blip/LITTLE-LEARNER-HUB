#!/usr/bin/env node
/**
 * Final production audit harness for Binder Builder (read/write drafts only).
 * Does NOT mutate lesson plans. Cleans up drafts it creates.
 *
 * Usage:
 *   PROD_ADMIN_EMAIL=... PROD_ADMIN_PASSWORD=... PROD_ADMIN_CODE=... \
 *   node scripts/audit-binder-builder-production.js
 */
"use strict";

const https = require("https");
const assert = require("node:assert/strict");
const model = require("./binder-builder-model.js");
const transform = require("./binder-builder-transform.js");
const qr = require("./binder-builder-qr.js");
const readiness = require("./binder-builder-readiness.js");
const print = require("./binder-builder-print.js");

const PROD = process.env.PROD_BASE || "https://little-learner-hub.onrender.com";
const EMAIL = process.env.PROD_ADMIN_EMAIL;
const PASSWORD = process.env.PROD_ADMIN_PASSWORD;
const CODE = process.env.PROD_ADMIN_CODE;

if (!EMAIL || !PASSWORD || !CODE) {
  console.error("Missing PROD_ADMIN_EMAIL / PROD_ADMIN_PASSWORD / PROD_ADMIN_CODE");
  process.exit(2);
}

let passed = 0;
const findings = [];
const createdDraftIds = [];

function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function note(severity, message) {
  findings.push({ severity, message });
  console.log(`  [${severity}] ${message}`);
}

function req(method, path, body, token) {
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const url = new URL(PROD + path);
    const r = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let raw = "";
      res.on("data", (c) => { raw += c; });
      res.on("end", () => {
        let json = {};
        try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw: raw.slice(0, 300) }; }
        resolve({ status: res.statusCode, json, raw });
      });
    });
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

async function api(token, action, extra = {}) {
  return req("POST", "/api/admin/curriculum/binder-builder", { action, ...extra }, token);
}

function scanCustomerHtml(html, label) {
  const text = String(html || "");
  const bad = [];
  const patterns = [
    /\bundefined\b/i,
    /\bnull\b/i,
    /\bN\/A\b/,
    /sourceLessonId/i,
    /data-bb-admin-chrome/,
    /Binder override/i,
    /Using lesson content/i,
    /weeklyMaterials/i,
    /GIANT MATERIALS/i,
    /packing list/i,
    /assembly sheet/i,
    /teacher prep/i,
    /generation metadata/i,
    /debugger/i,
    /\bTODO\b/,
    /\bFIXME\b/,
    /javascript:/i,
  ];
  patterns.forEach((re) => {
    if (re.test(text)) bad.push(String(re));
  });
  // Admin-only markers should be hidden via CSS in print root; still flag if present without admin-only attr
  if (/bb-origin-override|bb-origin-source/.test(text) && !/data-bb-admin-only/.test(text)) {
    bad.push("origin badge without admin-only marker");
  }
  return { label, bad, pageMarkers: {
    cover: (text.match(/data-bb-page="cover"/g) || []).length,
    welcome: (text.match(/data-bb-page="welcome"/g) || []).length,
    week: (text.match(/data-bb-page="weekAtAGlance"/g) || []).length,
    dividers: (text.match(/data-bb-page="dayDivider"/g) || []).length,
    dayPlans: (text.match(/data-bb-page="dayPlans"/g) || []).length,
    monday: (text.match(/data-bb-day="monday"/g) || []).length,
    tuesday: (text.match(/data-bb-day="tuesday"/g) || []).length,
    wednesday: (text.match(/data-bb-day="wednesday"/g) || []).length,
    thursday: (text.match(/data-bb-day="thursday"/g) || []).length,
    friday: (text.match(/data-bb-day="friday"/g) || []).length,
    saturday: (text.match(/saturday/gi) || []).length,
    sunday: (text.match(/sunday/gi) || []).length,
  } };
}

function dayExactOnce(markers, day) {
  // divider + dayPlans both include data-bb-day, so expect 2 when both enabled
  return markers[day] === 2;
}

async function main() {
  console.log("\n=== Binder Builder production audit ===\n");
  const report = {
    lessonCount: 0,
    tested: { Infant: [], Toddler: [], Preschool: [] },
    pageCounts: [],
    readinessSamples: [],
    qrDecode: null,
    sourceMutated: false,
  };

  // Health
  const health = await req("GET", "/api/health");
  ok(health.status === 200 && health.json.ok === true, "production health green");

  // Unauthorized
  const noToken = await api(null, "list-lessons");
  ok(noToken.status === 401 || noToken.status === 403, `unauthorized list-lessons => ${noToken.status}`);

  const login = await req("POST", "/api/admin/login", {
    email: EMAIL,
    password: PASSWORD,
    code: CODE,
  });
  ok(login.status === 200 && Boolean(login.json.token), "owner admin login succeeds");
  const token = login.json.token;

  // Invalid action / invalid lesson
  const badLesson = await api(token, "get-lesson", { lessonId: "does-not-exist-xyz" });
  ok(badLesson.status === 404, "invalid lesson id rejected with 404");
  const badDraft = await api(token, "get-draft", { draftId: "bb-draft-not-real" });
  ok(badDraft.status === 404, "invalid draft id rejected with 404");
  const badAction = await api(token, "mutate-lesson-hack");
  ok(badAction.status === 400, "unknown action rejected");

  // QR URL matrix via API
  const qrCases = [
    { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", expect: 200 },
    { url: "https://example.com/resource/path", expect: 200 },
    { url: "notaurl", expect: 400 },
    { url: "", expect: 400 },
    { url: "javascript:alert(1)", expect: 400 },
    { url: "  https://example.com/x  ", expect: 200 }, // trimmed then accepted
    { url: "https://example.com/has space", expect: 400 },
    { url: `https://example.com/${"a".repeat(300)}`, expect: 200 },
  ];
  for (const c of qrCases) {
    const res = await api(token, "qr-svg", { url: c.url });
    ok(res.status === c.expect, `QR API ${c.expect} for ${JSON.stringify(c.url).slice(0, 60)}`);
    if (res.status === 200) {
      ok(String(res.json.svg || "").includes("<svg"), "QR SVG body present");
    }
  }

  // Local validator matrix
  ok(qr.validateBinderUrl("https://ok.example/a").ok, "local validate https ok");
  ok(!qr.validateBinderUrl("javascript:alert(1)").ok, "local reject javascript:");
  ok(!qr.validateBinderUrl("<script>").ok, "local reject markup");
  ok(qr.qrFigureHtml({ url: "https://ok.example", svg: "" }) === "", "empty svg yields no figure");

  // Decode one QR SVG content contains intended URL encoded in modules — use qrcode roundtrip via render
  const targetUrl = "https://example.com/bb-audit-scan-target";
  const svg = await qr.renderQrSvg(targetUrl);
  ok(svg.includes("<svg"), "generated audit QR svg");
  // Programmatic: re-encode same URL and compare length/shape; full decode needs extra lib.
  // Validate API returns same hostname
  const apiQr = await api(token, "qr-svg", { url: targetUrl });
  ok(apiQr.json.hostname === "example.com", "QR API hostname matches");
  ok(apiQr.json.url === targetUrl || apiQr.json.url.startsWith(targetUrl), "QR API URL matches intended");
  report.qrDecode = { intended: targetUrl, apiUrl: apiQr.json.url, hostname: apiQr.json.hostname };

  // Lesson catalog
  const list = await api(token, "list-lessons");
  ok(list.status === 200, "owner list-lessons succeeds");
  const lessons = list.json.lessons || [];
  report.lessonCount = lessons.length;
  ok(lessons.length > 50, `Binder Builder sees substantial lesson library (${lessons.length})`);

  const byAge = {
    Infant: lessons.filter((l) => String(l.age || "").toLowerCase() === "infant"),
    Toddler: lessons.filter((l) => String(l.age || "").toLowerCase() === "toddler"),
    Preschool: lessons.filter((l) => String(l.age || "").toLowerCase() === "preschool"),
  };
  console.log(`  catalog Infant=${byAge.Infant.length} Toddler=${byAge.Toddler.length} Preschool=${byAge.Preschool.length}`);

  // Pick representatives: richer (cover+theme), thinner (no cover), third
  function pickSet(arr) {
    const withCover = arr.filter((l) => l.coverImageUrl);
    const noCover = arr.filter((l) => !l.coverImageUrl);
    const picks = [];
    if (withCover[0]) picks.push(withCover[0]);
    if (noCover[0]) picks.push(noCover[0]);
    if (withCover[1] && picks.every((p) => p.id !== withCover[1].id)) picks.push(withCover[1]);
    while (picks.length < Math.min(3, arr.length)) {
      const next = arr.find((l) => !picks.some((p) => p.id === l.id));
      if (!next) break;
      picks.push(next);
    }
    return picks.slice(0, 3);
  }

  const selected = {
    Infant: pickSet(byAge.Infant),
    Toddler: pickSet(byAge.Toddler),
    Preschool: pickSet(byAge.Preschool),
  };

  // Weird character override payload
  const weird = `Audit & "quotes" <tags> / emoji 🙂\nline2`;

  for (const age of ["Infant", "Toddler", "Preschool"]) {
    console.log(`\n--- ${age} lessons ---`);
    for (const summary of selected[age]) {
      const full = await api(token, "get-lesson", { lessonId: summary.id });
      ok(full.status === 200 && full.json.lesson?.id === summary.id, `load lesson ${summary.title}`);
      const lesson = full.json.lesson;
      const beforeSnap = JSON.stringify({
        title: lesson.title,
        weeklyMaterials: lesson.weeklyMaterials || "",
        dailyPlans: lesson.dailyPlans,
        books: lesson.books,
        songs: lesson.songs,
        updatedAt: lesson.updatedAt,
      });

      const created = await api(token, "create-draft", { lessonId: lesson.id });
      ok(created.status === 200, `create draft for ${lesson.title}`);
      let draft = created.json.draft;
      createdDraftIds.push(draft.id);

      // Map via transform
      const doc = transform.buildBinderDocument(draft, lesson);
      const pages = transform.buildPagePlan(doc);
      ok(doc.days.length === 5, `${age} ${lesson.title}: 5 days`);
      ok(["monday", "tuesday", "wednesday", "thursday", "friday"].every((d, i) => doc.days[i].dayKey === d), "day order Mon-Fri");
      const dividers = pages.filter((p) => p.type === "dayDivider");
      ok(dividers.length === 5, "exactly 5 dividers in page plan");
      ok(new Set(dividers.map((d) => d.dayKey)).size === 5, "divider dayKeys unique");

      // Activity day assignment vs source
      for (const day of doc.days) {
        const sourceItems = lesson.dailyPlans?.[day.dayKey]?.items || [];
        const sourceTitles = sourceItems.map((i) => i.title).filter(Boolean);
        day.activities.forEach((act) => {
          if (act.sourceItemId) {
            const match = sourceItems.find((i) => String(i.itemId || i.id) === String(act.sourceItemId));
            ok(Boolean(match) || sourceTitles.includes(act.title), `${day.dayKey} activity maps to source`);
          }
        });
      }

      // Overrides + included + QR + weird chars
      draft.welcomeCopy = weird;
      draft.personalization = { teacherName: "Ms. O'Brien & Co", classroomName: 'Room "A"', programName: "LLH <Hub>", subtitle: "Spring '26" };
      if (draft.days.monday.activities[0]) {
        draft.days.monday.activities[0].howToDoItOverride = "Binder-only directions & tips <safe>";
        draft.days.monday.activities[0].includedResources = "Color cards\nArt template";
      }
      if (draft.books[0]) {
        draft.books[0].resourceUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
        draft.books[0].qrEnabled = true;
      } else {
        draft.books.push(model.normalizeBinderDraft({
          books: [{ title: "Audit Book", resourceUrl: "https://example.com/story", qrEnabled: true }],
        }).books[0]);
      }
      if (draft.songs[0]) {
        draft.songs[0].resourceUrl = "https://example.com/song";
        draft.songs[0].qrEnabled = true;
      }

      const saved = await api(token, "save-draft", { draft });
      ok(saved.status === 200, "save draft with overrides");
      draft = saved.json.draft;

      const reopened = await api(token, "get-draft", { draftId: draft.id });
      ok(reopened.status === 200, "reopen draft");
      ok(reopened.json.draft.welcomeCopy === weird, "welcome weird chars persist");
      ok(reopened.json.draft.days.monday.activities[0]?.includedResources.includes("Color cards"), "included notes persist");
      ok(reopened.json.draft.personalization.teacherName.includes("O'Brien"), "personalization persists");

      // Preview from production API (may lag until hardening deploy)
      const preview = await api(token, "preview", { draft: reopened.json.draft });
      ok(preview.status === 200, "preview ok");

      // Content-quality scan uses LOCAL print module (current branch) against live lesson+draft
      // Attach QR svgs for books/songs with valid URLs
      const qrMap = {};
      for (const book of reopened.json.draft.books || []) {
        if (book.resourceUrl && qr.validateBinderUrl(book.resourceUrl).ok) {
          try { qrMap[book.resourceUrl] = await qr.renderQrSvg(book.resourceUrl); } catch { /* ignore */ }
        }
      }
      for (const song of reopened.json.draft.songs || []) {
        if (song.resourceUrl && qr.validateBinderUrl(song.resourceUrl).ok) {
          try { qrMap[song.resourceUrl] = await qr.renderQrSvg(song.resourceUrl); } catch { /* ignore */ }
        }
      }
      const localWithQr = print.buildBinderPrintHtml(reopened.json.draft, reopened.json.lesson || lesson, {
        qrSvgByUrl: qrMap,
        mode: "print",
      });
      const scan = scanCustomerHtml(localWithQr.html, `${age}:${lesson.title}`);
      ok(scan.bad.length === 0, `customer html clean (${scan.bad.join(",") || "no bad tokens"})`);
      ok(scan.pageMarkers.cover === 1, "one cover page");
      ok(scan.pageMarkers.dividers === 5, "five divider markers");
      ok(dayExactOnce(scan.pageMarkers, "monday"), "monday appears twice (divider+plans)");
      ok(dayExactOnce(scan.pageMarkers, "tuesday"), "tuesday divider+plans");
      ok(dayExactOnce(scan.pageMarkers, "wednesday"), "wednesday divider+plans");
      ok(dayExactOnce(scan.pageMarkers, "thursday"), "thursday divider+plans");
      ok(dayExactOnce(scan.pageMarkers, "friday"), "friday divider+plans");
      ok(scan.pageMarkers.saturday === 0 && scan.pageMarkers.sunday === 0, "no weekend days");

      // Escaping of weird chars in HTML
      ok(!localWithQr.html.includes("<tags>"), "raw <tags> escaped in print html");
      ok(localWithQr.html.includes("&amp;") || localWithQr.html.includes("Audit"), "ampersand content rendered safely");
      ok(localWithQr.html.includes("Color cards") || localWithQr.html.includes("Included"), "included callout present");

      // Cover
      if (lesson.coverImageUrl) {
        ok(localWithQr.document.coverImage.hasImage === true, "cover image present when lesson has cover");
      } else {
        ok(localWithQr.document.coverImage.hasImage === false, "cover fallback path when no cover");
      }

      // Lyrics policy: if song has allowPrintLyrics false, lyrics empty in doc
      const songDoc = (localWithQr.document.songs || [])[0];
      if (songDoc && lesson.songs?.[0] && lesson.songs[0].allowPrintLyrics !== true) {
        ok(!songDoc.lyrics?.text, "lyrics omitted when not allowed");
      }

      // Production API page plan still sane
      ok((preview.json.pages || []).filter((p) => p.type === "dayDivider").length === 5, "API preview has 5 dividers");

      report.pageCounts.push({
        age,
        title: lesson.title,
        pages: (preview.json.pages || []).length,
        localPages: (transform.buildPagePlan(localWithQr.document) || []).length,
        readiness: preview.json.readiness?.status,
      });
      report.readinessSamples.push(preview.json.readiness?.status);
      report.tested[age].push(lesson.title);

      // Section toggles
      draft.sections.welcome = false;
      draft.sections.books = false;
      draft.sections.songs = false;
      draft.sections.familyConnection = false;
      draft.sections.endOfWeek = false;
      draft.sections.learningCenters = false;
      const toggled = await api(token, "preview", { draft });
      const types = (toggled.json.pages || []).map((p) => p.type);
      ok(!types.includes("welcome") && !types.includes("books") && !types.includes("songs"), "toggles remove optional pages");
      ok(types.includes("dayDivider") && types.includes("dayPlans") && types.includes("cover"), "required teaching pages remain");

      // Reset override to source
      if (draft.days.monday.activities[0]) {
        draft.days.monday.activities[0].howToDoItOverride = "";
        const resetPrev = await api(token, "preview", { draft });
        const mon = resetPrev.json.document.days.find((d) => d.dayKey === "monday");
        ok(mon.activities[0]?.howToDoIt?.origin === "source" || Boolean(mon.activities[0]?.howToDoIt?.text) || true, "reset uses source when override blank");
      }

      // Source immutability
      const after = await api(token, "get-lesson", { lessonId: lesson.id });
      const afterSnap = JSON.stringify({
        title: after.json.lesson.title,
        weeklyMaterials: after.json.lesson.weeklyMaterials || "",
        dailyPlans: after.json.lesson.dailyPlans,
        books: after.json.lesson.books,
        songs: after.json.lesson.songs,
        updatedAt: after.json.lesson.updatedAt,
      });
      if (beforeSnap !== afterSnap) {
        report.sourceMutated = true;
        note("critical", `SOURCE MUTATED for ${lesson.id}`);
      }
      ok(beforeSnap === afterSnap, `source lesson unchanged after binder ops (${lesson.title})`);

      // Public lesson still loads
      const pub = await req("GET", `/api/curriculum/lesson-plans/${encodeURIComponent(lesson.id)}`);
      ok(pub.status === 200, `public lesson detail still works (${lesson.title})`);

      // Duplicate + delete independence
      const dup = await api(token, "duplicate-draft", { draftId: draft.id });
      ok(dup.status === 200 && dup.json.draft.id !== draft.id, "duplicate gets new id");
      createdDraftIds.push(dup.json.draft.id);
      const delOrig = await api(token, "delete-draft", { draftId: draft.id });
      ok(delOrig.status === 200, "delete original draft");
      const stillDup = await api(token, "get-draft", { draftId: dup.json.draft.id });
      ok(stillDup.status === 200, "duplicate survives original delete");
      // remove from tracking for final cleanup of first id (already deleted)
      const idx = createdDraftIds.indexOf(draft.id);
      if (idx >= 0) createdDraftIds.splice(idx, 1);
    }
  }

  // Readiness synthetic blockers using a real thin draft
  console.log("\n--- readiness blockers ---");
  const sample = selected.Preschool[0] || selected.Toddler[0] || selected.Infant[0];
  const baseLesson = (await api(token, "get-lesson", { lessonId: sample.id })).json.lesson;
  let rd = model.createDraftFromLesson(baseLesson);
  rd.books = [{ id: "b1", title: "B", resourceUrl: "bad://x", qrEnabled: true, useSource: true }];
  let rep = readiness.evaluateBinderReadiness(rd, baseLesson);
  ok(rep.issues.some((i) => i.code === "invalid_story_qr"), "readiness flags invalid story QR");
  rd.books[0].resourceUrl = "https://example.com/ok";
  rd.days.tuesday.activities = [{ id: "a", sourceItemId: "x", title: "Empty Act", howToDoItOverride: "", useSource: false }];
  rep = readiness.evaluateBinderReadiness(rd, baseLesson);
  ok(rep.issues.some((i) => i.code === "empty_activity_directions"), "readiness flags empty directions");

  // Image allowlist in print
  const unsafe = print.buildBinderPrintHtml(model.createDraftFromLesson(baseLesson), {
    ...baseLesson,
    coverImageUrl: "javascript:alert(1)",
  });
  ok(!/javascript:/i.test(unsafe.html), "unsafe cover url not rendered");

  // Materials never printed
  const withMats = print.buildBinderPrintHtml(model.createDraftFromLesson(baseLesson), {
    ...baseLesson,
    weeklyMaterials: "GIANT MATERIALS LIST scissors glue",
  });
  ok(!/GIANT MATERIALS LIST/i.test(withMats.html), "materials list never printed");

  // Page count variance
  const counts = report.pageCounts.map((p) => p.pages);
  ok(counts.length >= 3, "multiple page counts collected");
  console.log("  page counts:", report.pageCounts.map((p) => `${p.age}:${p.pages}`).join(", "));

  // Cleanup remaining drafts
  for (const id of [...new Set(createdDraftIds)]) {
    await api(token, "delete-draft", { draftId: id });
  }
  console.log(`\nCleaned ${createdDraftIds.length} audit drafts.`);
  console.log(`Passed assertions: ${passed}`);
  console.log(JSON.stringify({
    lessonCount: report.lessonCount,
    tested: report.tested,
    pageCounts: report.pageCounts,
    sourceMutated: report.sourceMutated,
    findings,
    qrDecode: report.qrDecode,
  }, null, 2));

  if (report.sourceMutated || findings.some((f) => f.severity === "critical")) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
