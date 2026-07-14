/**
 * Little Learner Hub — Lesson plan DOCX builders (OOXML, no external deps).
 * Primary: landscape Mon–Fri Weekly Calendar.
 * Also: full lesson plan DOCX for Step 6.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.LlhLessonDocx = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const DAY_LONG = {
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
  };

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function encodeUtf8(text) {
    return new TextEncoder().encode(String(text ?? ""));
  }

  function u16(value) {
    const out = new Uint8Array(2);
    out[0] = value & 0xff;
    out[1] = (value >>> 8) & 0xff;
    return out;
  }

  function u32(value) {
    const out = new Uint8Array(4);
    out[0] = value & 0xff;
    out[1] = (value >>> 8) & 0xff;
    out[2] = (value >>> 16) & 0xff;
    out[3] = (value >>> 24) & 0xff;
    return out;
  }

  function concatBytes(chunks) {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    chunks.forEach((chunk) => {
      out.set(chunk, offset);
      offset += chunk.length;
    });
    return out;
  }

  function buildZipBlob(files) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    files.forEach((file) => {
      const nameBytes = encodeUtf8(file.name);
      const data = file.data instanceof Uint8Array ? file.data : encodeUtf8(file.data);
      const checksum = crc32(data);
      const localHeader = concatBytes([
        u32(0x04034b50),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(checksum),
        u32(data.length),
        u32(data.length),
        u16(nameBytes.length),
        u16(0),
        nameBytes,
      ]);
      localParts.push(localHeader, data);
      centralParts.push(concatBytes([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(checksum),
        u32(data.length),
        u32(data.length),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        nameBytes,
      ]));
      offset += localHeader.length + data.length;
    });

    const centralDirectory = concatBytes(centralParts);
    const end = concatBytes([
      u32(0x06054b50),
      u16(0),
      u16(0),
      u16(files.length),
      u16(files.length),
      u32(centralDirectory.length),
      u32(offset),
      u16(0),
    ]);
    return new Blob([concatBytes([...localParts, centralDirectory, end])], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  }

  function xmlEscape(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function cleanText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function paragraph(text, options = {}) {
    const size = options.size || 18; // half-points
    const bold = options.bold ? "<w:b/>" : "";
    const color = options.color ? `<w:color w:val="${options.color}"/>` : "";
    const align = options.align ? `<w:jc w:val="${options.align}"/>` : "";
    const spaceAfter = options.spaceAfter != null ? options.spaceAfter : 60;
    const safe = xmlEscape(cleanText(text));
    if (!safe && !options.allowEmpty) return "";
    return `<w:p><w:pPr>${align}<w:spacing w:after="${spaceAfter}"/></w:pPr><w:r><w:rPr>${bold}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>${color}</w:rPr><w:t xml:space="preserve">${safe || " "}</w:t></w:r></w:p>`;
  }

  function cellParagraphs(lines, options = {}) {
    const parts = (Array.isArray(lines) ? lines : [lines])
      .map((line) => cleanText(line))
      .filter(Boolean);
    if (!parts.length) return paragraph("—", { size: options.size || 16, color: "888888", spaceAfter: 40 });
    return parts.map((line, index) => paragraph(line, {
      size: index === 0 && options.firstBold ? (options.size || 16) : (options.bodySize || options.size || 15),
      bold: index === 0 && options.firstBold,
      spaceAfter: 40,
      color: index === 0 && options.firstBold ? (options.headingColor || "1A2B4A") : undefined,
    })).join("");
  }

  function tableCell(contentXml, width, options = {}) {
    const fill = options.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${options.fill}"/>` : "";
    const borders = `
      <w:tcBorders>
        <w:top w:val="single" w:sz="6" w:space="0" w:color="D5E3F0"/>
        <w:left w:val="single" w:sz="6" w:space="0" w:color="D5E3F0"/>
        <w:bottom w:val="single" w:sz="6" w:space="0" w:color="D5E3F0"/>
        <w:right w:val="single" w:sz="6" w:space="0" w:color="D5E3F0"/>
      </w:tcBorders>`;
    return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${fill}${borders}<w:vAlign w:val="top"/></w:tcPr>${contentXml}</w:tc>`;
  }

  function landscapeSection() {
    // Letter landscape: 11" x 8.5" = 15840 x 12240 twips
    return `<w:sectPr>
      <w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>
      <w:pgMar w:top="540" w:right="540" w:bottom="540" w:left="540" w:header="360" w:footer="360"/>
    </w:sectPr>`;
  }

  function portraitSection() {
    return `<w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/>
    </w:sectPr>`;
  }

  function contentTypesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
  }

  function relsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
  }

  function documentRelsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
  }

  function coreXml(title) {
    const now = new Date().toISOString();
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:dcmitype="http://purl.org/dc/dcmitype/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${xmlEscape(title || "Lesson Plan")}</dc:title>
  <dc:creator>Little Learner Hub</dc:creator>
  <cp:lastModifiedBy>Little Learner Hub</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
  }

  function appXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
  xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Little Learner Hub</Application>
</Properties>`;
  }

  function wrapDocument(bodyInner, sectionXml) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyInner}
    ${sectionXml}
  </w:body>
</w:document>`;
  }

  function asStringArray(value) {
    if (Array.isArray(value)) return value.map((item) => cleanText(item)).filter(Boolean);
    const text = cleanText(value);
    return text ? [text] : [];
  }

  function normalizeDays(plan) {
    const daily = plan?.dailyPlans && typeof plan.dailyPlans === "object" ? plan.dailyPlans : {};
    return WEEKDAYS.map((day) => {
      const dayPlan = daily[day] || {};
      const items = Array.isArray(dayPlan.items) ? dayPlan.items : [];
      return {
        day,
        label: DAY_LONG[day],
        theme: cleanText(dayPlan.theme),
        activities: items.map((item) => ({
          title: cleanText(item?.title) || "Activity",
          category: cleanText(item?.activityCategory) || "Activity",
          description: cleanText(item?.description || item?.objective).slice(0, 160),
          materials: cleanText(item?.materials).slice(0, 120),
        })),
      };
    });
  }

  function buildWeeklyCalendarDocumentXml(payload) {
    const title = cleanText(payload.title) || "Weekly Lesson Plan";
    const theme = cleanText(payload.theme) || "Classroom Theme";
    const age = cleanText(payload.age) || "Preschool";
    const weekOf = cleanText(payload.weekOfLabel) || "____________________";
    const days = Array.isArray(payload.days) ? payload.days : normalizeDays(payload.plan || {});
    const usableWidth = 14760; // page width minus margins
    const colWidth = Math.floor(usableWidth / 5);

    const header = [
      paragraph("Little Learner Hub · Weekly Classroom Schedule", {
        size: 18,
        bold: true,
        color: "3A7ABF",
        spaceAfter: 40,
      }),
      paragraph(title, { size: 28, bold: true, color: "1A2B4A", spaceAfter: 80 }),
      paragraph(`Theme: ${theme}    ·    Age: ${age}    ·    Week Of: ${weekOf}`, {
        size: 16,
        color: "536280",
        spaceAfter: 160,
      }),
    ].join("");

    const headingRow = `<w:tr>${days.map((day) => tableCell(
      paragraph(day.label, { size: 18, bold: true, color: "FFFFFF", align: "center", spaceAfter: 40 }),
      colWidth,
      { fill: "3A7ABF" },
    )).join("")}</w:tr>`;

    const bodyRow = `<w:tr>${days.map((day) => {
      const lines = [];
      if (day.theme) lines.push(day.theme);
      const activities = day.activities?.length
        ? day.activities
        : [{ title: "Open exploration", category: "Daily plan", description: "Follow child interest with familiar materials." }];
      activities.slice(0, 5).forEach((activity) => {
        lines.push(activity.title);
        if (activity.category) lines.push(`(${activity.category})`);
        if (activity.description) lines.push(activity.description);
      });
      return tableCell(cellParagraphs(lines, { firstBold: true, size: 16, bodySize: 14 }), colWidth);
    }).join("")}</w:tr>`;

    const table = `<w:tbl>
      <w:tblPr>
        <w:tblW w:w="${usableWidth}" w:type="dxa"/>
        <w:tblLayout w:type="fixed"/>
      </w:tblPr>
      <w:tblGrid>${days.map(() => `<w:gridCol w:w="${colWidth}"/>`).join("")}</w:tblGrid>
      ${headingRow}
      ${bodyRow}
    </w:tbl>`;

    const footerNote = paragraph("Print tip: landscape Letter · keep this one-page weekly board posted in the classroom.", {
      size: 14,
      color: "6B6560",
      spaceAfter: 0,
    });

    return wrapDocument(`${header}${table}${paragraph("", { allowEmpty: true, spaceAfter: 80 })}${footerNote}`, landscapeSection());
  }

  function buildFullLessonDocumentXml(payload) {
    const plan = payload.plan || {};
    const title = cleanText(payload.title || plan.title) || "Full Lesson Plan";
    const theme = cleanText(payload.theme || plan.theme) || "Classroom Theme";
    const age = cleanText(payload.age || plan.age) || "Preschool";
    const weekOf = cleanText(payload.weekOfLabel) || "____________________";
    const days = normalizeDays(plan);
    const domains = asStringArray(plan.learningDomains);
    const objectives = asStringArray(plan.weeklyObjectives || plan.objectives).slice(0, 8);
    const materials = cleanText(plan.weeklyMaterials);
    const vocabulary = cleanText(plan.vocabularyWords);
    const books = Array.isArray(plan.books)
      ? plan.books.map((book) => cleanText(`${book.title || book}${book.author ? ` — ${book.author}` : ""}`)).filter(Boolean)
      : [];
    const songs = Array.isArray(plan.songs)
      ? plan.songs.map((song) => cleanText(song.title || song)).filter(Boolean)
      : [];

    const parts = [
      paragraph("Little Learner Hub · Full Lesson Plan", { size: 18, bold: true, color: "3A7ABF", spaceAfter: 40 }),
      paragraph(title, { size: 30, bold: true, color: "1A2B4A", spaceAfter: 80 }),
      paragraph(`Theme: ${theme}`, { size: 18, spaceAfter: 40 }),
      paragraph(`Age Group: ${age}`, { size: 18, spaceAfter: 40 }),
      paragraph(`Week Of: ${weekOf}`, { size: 18, spaceAfter: 160 }),
      paragraph("Weekly Snapshot", { size: 22, bold: true, color: "3A7ABF", spaceAfter: 80 }),
    ];
    if (domains.length) {
      parts.push(paragraph("Learning Domains", { size: 18, bold: true, spaceAfter: 40 }));
      parts.push(paragraph(domains.join(" · "), { size: 17, spaceAfter: 100 }));
    }
    if (objectives.length) {
      parts.push(paragraph("Weekly Objectives", { size: 18, bold: true, spaceAfter: 40 }));
      objectives.forEach((item) => parts.push(paragraph(`• ${item}`, { size: 17, spaceAfter: 40 })));
      parts.push(paragraph("", { allowEmpty: true, spaceAfter: 80 }));
    }
    if (materials) {
      parts.push(paragraph("Weekly Materials", { size: 18, bold: true, spaceAfter: 40 }));
      parts.push(paragraph(materials, { size: 17, spaceAfter: 120 }));
    }

    parts.push(paragraph("Monday–Friday Plan", { size: 22, bold: true, color: "3A7ABF", spaceAfter: 100 }));
    days.forEach((day) => {
      parts.push(paragraph(day.label, { size: 20, bold: true, color: "1A2B4A", spaceAfter: 40 }));
      if (day.theme) parts.push(paragraph(`Theme: ${day.theme}`, { size: 16, color: "536280", spaceAfter: 40 }));
      const activities = day.activities.length
        ? day.activities
        : [{ title: "Open exploration", category: "Daily plan", description: "Follow child interest with familiar classroom materials." }];
      activities.forEach((activity) => {
        parts.push(paragraph(activity.title, { size: 17, bold: true, spaceAfter: 20 }));
        parts.push(paragraph(activity.category, { size: 14, color: "6B6560", spaceAfter: 20 }));
        if (activity.description) parts.push(paragraph(activity.description, { size: 16, spaceAfter: 20 }));
        if (activity.materials) parts.push(paragraph(`Materials: ${activity.materials}`, { size: 15, spaceAfter: 40 }));
      });
      parts.push(paragraph("", { allowEmpty: true, spaceAfter: 80 }));
    });

    parts.push(paragraph("Weekly Resources", { size: 22, bold: true, color: "3A7ABF", spaceAfter: 80 }));
    if (vocabulary) {
      parts.push(paragraph("Vocabulary", { size: 18, bold: true, spaceAfter: 40 }));
      parts.push(paragraph(vocabulary, { size: 16, spaceAfter: 80 }));
    }
    if (books.length) {
      parts.push(paragraph("Books", { size: 18, bold: true, spaceAfter: 40 }));
      books.forEach((book) => parts.push(paragraph(`• ${book}`, { size: 16, spaceAfter: 30 })));
    }
    if (songs.length) {
      parts.push(paragraph("Songs", { size: 18, bold: true, spaceAfter: 40 }));
      songs.forEach((song) => parts.push(paragraph(`• ${song}`, { size: 16, spaceAfter: 30 })));
    }

    return wrapDocument(parts.join(""), portraitSection());
  }

  function buildDocxBlob(documentXml, title) {
    return buildZipBlob([
      { name: "[Content_Types].xml", data: contentTypesXml() },
      { name: "_rels/.rels", data: relsXml() },
      { name: "word/document.xml", data: documentXml },
      { name: "word/_rels/document.xml.rels", data: documentRelsXml() },
      { name: "docProps/core.xml", data: coreXml(title) },
      { name: "docProps/app.xml", data: appXml() },
    ]);
  }

  function buildWeeklyCalendarDocxBlob(payload = {}) {
    const title = cleanText(payload.title) || "Weekly Classroom Schedule";
    return buildDocxBlob(buildWeeklyCalendarDocumentXml(payload), title);
  }

  function buildFullLessonPlanDocxBlob(payload = {}) {
    const title = cleanText(payload.title) || "Full Lesson Plan";
    return buildDocxBlob(buildFullLessonDocumentXml(payload), title);
  }

  return {
    WEEKDAYS,
    DAY_LONG,
    buildZipBlob,
    buildWeeklyCalendarDocxBlob,
    buildFullLessonPlanDocxBlob,
    normalizeDays,
    xmlEscape,
  };
});
