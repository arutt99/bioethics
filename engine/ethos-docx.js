/*
 * ETHOS Word export. Builds a .docx file in the browser from a report model, with
 * no library and no network: a .docx is a zip of a few XML files, and this writes
 * them uncompressed. Headings use Word's own Heading styles, so the document has a
 * navigable structure for screen readers and the LMS.
 *
 * window.EthosDocx.build(model) returns a Blob. The model is the one the engine
 * uses for its report: { title, caseTitle, version, part, team, members, date,
 * missingCount, sections: [{ title, items: [{ label, answer, note, missing }] }] }.
 */
(function () {
  "use strict";

  // ---------- XML ----------

  // Text from students can hold anything; drop characters XML can't carry.
  function xml(s) {
    return String(s)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function run(text, props) {
    return "<w:r>" + (props ? "<w:rPr>" + props + "</w:rPr>" : "") + '<w:t xml:space="preserve">' + xml(text) + "</w:t></w:r>";
  }

  function para(style, runs) {
    return "<w:p>" + (style ? '<w:pPr><w:pStyle w:val="' + style + '"/></w:pPr>' : "") + runs + "</w:p>";
  }

  // One paragraph per line, so the student's line breaks survive.
  function textParas(text, style, props) {
    return String(text)
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map(function (line) {
        return para(style, line ? run(line, props) : "");
      })
      .join("");
  }

  var NS =
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

  function documentXml(m) {
    var body = [];
    body.push(para("Letterhead", run("ETHOS · Clinical Ethics Committee")));
    body.push(para("Title", run(m.title)));
    var meta = [
      ["Case", m.caseTitle + " (version " + m.version + ")" + (m.part ? ", " + m.part : "")],
      ["Team", m.team || "Not given"],
      ["Members", m.members || "Not given"],
      ["Exported", m.date],
    ];
    meta.forEach(function (row) {
      body.push(para("Meta", run(row[0] + ": ", "<w:b/>") + run(row[1])));
    });
    if (m.missingCount) {
      body.push(para("Missing", run("Work in progress: " + m.missingCount + " required " + (m.missingCount === 1 ? "answer was" : "answers were") + " not yet written when this was exported.")));
    }
    m.sections.forEach(function (sec) {
      body.push(para("Heading1", run(sec.title)));
      sec.items.forEach(function (item) {
        body.push(para("Heading2", run(item.label)));
        if (item.note) body.push(para("Note", run(item.note)));
        if (item.answer) body.push(textParas(item.answer, null));
        else body.push(para("Missing", run(item.missing || "[No response]")));
      });
    });
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      "<w:document " +
      NS +
      "><w:body>" +
      body.join("") +
      '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>' +
      "</w:body></w:document>"
    );
  }

  function style(id, name, pPr, rPr, extra) {
    return (
      '<w:style w:type="paragraph" w:styleId="' +
      id +
      '"><w:name w:val="' +
      name +
      '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>' +
      (extra || "") +
      '<w:qFormat/><w:pPr>' +
      pPr +
      "</w:pPr><w:rPr>" +
      rPr +
      "</w:rPr></w:style>"
    );
  }

  function stylesXml() {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      "<w:docDefaults><w:rPrDefault><w:rPr>" +
      '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/>' +
      '<w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/>' +
      "</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>" +
      '<w:spacing w:after="120" w:line="276" w:lineRule="auto"/>' +
      "</w:pPr></w:pPrDefault></w:docDefaults>" +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      style("Letterhead", "Letterhead", '<w:pBdr><w:top w:val="single" w:sz="24" w:space="6" w:color="10384C"/></w:pBdr><w:spacing w:after="60"/>', '<w:b/><w:caps/><w:color w:val="0F6E6E"/><w:spacing w:val="20"/><w:sz w:val="18"/>') +
      style("Title", "Title", '<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="6" w:color="10384C"/></w:pBdr><w:spacing w:after="240"/>', '<w:b/><w:color w:val="17212B"/><w:sz w:val="40"/>') +
      style("Heading1", "heading 1", '<w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="2" w:color="B9CFD8"/></w:pBdr><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/>', '<w:b/><w:caps/><w:color w:val="10384C"/><w:sz w:val="24"/>', '<w:uiPriority w:val="9"/>') +
      style("Heading2", "heading 2", '<w:keepNext/><w:spacing w:before="200" w:after="60"/><w:outlineLvl w:val="1"/>', '<w:b/><w:color w:val="17212B"/><w:sz w:val="22"/>', '<w:uiPriority w:val="9"/>') +
      style("Meta", "Report details", '<w:spacing w:after="40"/>', "") +
      style("Note", "Report note", "", '<w:i/><w:color w:val="4B5563"/><w:sz w:val="20"/>') +
      style("Missing", "Missing answer", "", '<w:i/><w:color w:val="7A4B00"/>') +
      "</w:styles>"
    );
  }

  function coreXml(m) {
    var now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      "<dc:title>" +
      xml(m.title + ": " + m.caseTitle) +
      "</dc:title>" +
      "<dc:creator>" +
      xml(m.team || "ETHOS") +
      "</dc:creator>" +
      "<dc:language>en-US</dc:language>" +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' +
      now +
      "</dcterms:created>" +
      '<dcterms:modified xsi:type="dcterms:W3CDTF">' +
      now +
      "</dcterms:modified>" +
      "</cp:coreProperties>"
    );
  }

  var CONTENT_TYPES =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    "</Types>";

  var ROOT_RELS =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    "</Relationships>";

  var DOC_RELS =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    "</Relationships>";

  // ---------- Zip (stored, no compression) ----------

  var CRC_TABLE = (function () {
    var t = [];
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function zip(files) {
    var enc = new TextEncoder();
    var d = new Date();
    var time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    var parts = [];
    var central = [];
    var offset = 0;

    function header(size) {
      var b = new Uint8Array(size);
      return { bytes: b, view: new DataView(b.buffer) };
    }

    files.forEach(function (f) {
      var name = enc.encode(f.name);
      var data = enc.encode(f.data);
      var crc = crc32(data);
      var local = header(30);
      var v = local.view;
      v.setUint32(0, 0x04034b50, true);
      v.setUint16(4, 20, true);
      v.setUint16(6, 0x0800, true); // UTF-8 names
      v.setUint16(8, 0, true); // stored
      v.setUint16(10, time, true);
      v.setUint16(12, date, true);
      v.setUint32(14, crc, true);
      v.setUint32(18, data.length, true);
      v.setUint32(22, data.length, true);
      v.setUint16(26, name.length, true);
      v.setUint16(28, 0, true);
      parts.push(local.bytes, name, data);

      var cen = header(46);
      var w = cen.view;
      w.setUint32(0, 0x02014b50, true);
      w.setUint16(4, 20, true);
      w.setUint16(6, 20, true);
      w.setUint16(8, 0x0800, true);
      w.setUint16(10, 0, true);
      w.setUint16(12, time, true);
      w.setUint16(14, date, true);
      w.setUint32(16, crc, true);
      w.setUint32(20, data.length, true);
      w.setUint32(24, data.length, true);
      w.setUint16(28, name.length, true);
      w.setUint32(42, offset, true);
      central.push(cen.bytes, name);
      offset += 30 + name.length + data.length;
    });

    var cdSize = central.reduce(function (n, b) {
      return n + b.length;
    }, 0);
    var end = header(22);
    var e = end.view;
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, files.length, true);
    e.setUint16(10, files.length, true);
    e.setUint32(12, cdSize, true);
    e.setUint32(16, offset, true);
    return parts.concat(central, [end.bytes]);
  }

  function build(model) {
    var chunks = zip([
      { name: "[Content_Types].xml", data: CONTENT_TYPES },
      { name: "_rels/.rels", data: ROOT_RELS },
      { name: "word/document.xml", data: documentXml(model) },
      { name: "word/_rels/document.xml.rels", data: DOC_RELS },
      { name: "word/styles.xml", data: stylesXml() },
      { name: "docProps/core.xml", data: coreXml(model) },
    ]);
    return new Blob(chunks, { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }

  window.EthosDocx = { build: build };
})();
