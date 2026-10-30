/*
 * ETHOS consultation engine.
 *
 * Renders one case (or one part of a case) from the JSON in
 * <script id="ethos-case" type="application/json">. A case has two areas:
 * a case file of items students open in any order, and a worksheet of
 * written sections they answer in any order. Case text is always inserted
 * with textContent, never as HTML. See engine/README.md for the case format.
 */
(function () {
  "use strict";

  var CASE = JSON.parse(document.getElementById("ethos-case").textContent);
  var PART = CASE.part; // the part this file contains, or null for a single-file case
  var ITEMS = CASE.items;
  var ITEM_ORDER = CASE.itemOrder;
  var SECTIONS = CASE.worksheet;
  var PROMPTS = CASE.prompts;
  var STORAGE_KEY = "ethos:" + CASE.id + ":schema" + CASE.schemaVersion;
  var POSITION = PART ? PART.id : "single";
  // With caseFile.folder, the case file is not a page: a folder in the header opens it
  // over whatever step the student is on.
  var FOLDER = !!(CASE.caseFile && CASE.caseFile.folder);

  var KINDS = [
    { id: "record", heading: "Records and documents", label: "Record", look: "chart" },
    { id: "person", heading: "People involved", label: "Person", look: "interview" },
    { id: "background", heading: "Medical background", label: "Medical background", look: "reference" },
    { id: "policy", heading: "Policies, codes and law", label: "Policy", look: "document", band: "Policy, code, or law" },
  ];
  // The band at the top of each item's sheet. A case can set an item's "look".
  var LOOKS = {
    chart: "Clinical record",
    interview: "Interview",
    reference: "Plain-language reference",
    document: "Document",
    letter: "Correspondence",
  };
  function kind(id) {
    for (var i = 0; i < KINDS.length; i++) if (KINDS[i].id === id) return KINDS[i];
    return KINDS[0];
  }

  // Every case-file item gets a notes field unless the case turns it off.
  ITEM_ORDER.forEach(function (id) {
    var it = ITEMS[id];
    var nid = "notes." + id;
    if (it.noteField !== false && !PROMPTS[nid]) {
      PROMPTS[nid] = { id: nid, type: "textarea", label: it.noteLabel || "Your notes on this item", shortLabel: it.number + ". " + it.title, rows: 4 };
    }
  });

  var main = document.getElementById("main");
  var nav = document.getElementById("progress");
  var liveRegion = document.getElementById("live");

  // ---------- State ----------

  var storageOK = true;
  var state = load();
  // Answers are keyed by stable prompt IDs. If the case version changed, keep them but say so.
  var versionNotice = null;
  if (state.caseVersion !== CASE.version) {
    if (Object.keys(state.responses).length) versionNotice = state.caseVersion;
    state.caseVersion = CASE.version;
  }

  function freshState() {
    return {
      schemaVersion: CASE.schemaVersion,
      caseId: CASE.id,
      caseVersion: CASE.version,
      responses: {},
      opened: {},
      lists: {},
      restated: {},
      position: {},
      updated: null,
    };
  }

  function load() {
    var raw = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      storageOK = false;
    }
    if (!raw) return freshState();
    try {
      var saved = JSON.parse(raw);
      if (saved && saved.caseId === CASE.id && saved.schemaVersion === CASE.schemaVersion) {
        var s = freshState();
        Object.keys(s).forEach(function (k) {
          if (saved[k] !== undefined) s[k] = saved[k];
        });
        return s;
      }
    } catch (e) {
      /* fall through to a fresh state */
    }
    return freshState();
  }

  function save() {
    state.updated = new Date().toISOString();
    if (!storageOK) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      storageOK = false;
      renderNav();
    }
  }

  function clearSaved() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* nothing saved */
    }
    state = freshState();
  }

  function value(id) {
    var v = state.responses[id];
    return typeof v === "string" ? v : "";
  }

  // ---------- Student-written options ----------
  // An "options" block lets students list their own options. Each option gets a
  // name field and the block's fields (for example consequences, arguments for
  // and against), registered as ordinary prompts with ids "<block>.<uid>.<key>".

  var OPTION_BLOCKS = {};
  Object.keys(CASE.lists || {}).forEach(function (bid) {
    OPTION_BLOCKS[bid] = { block: CASE.lists[bid], section: null };
  });
  SECTIONS.forEach(function (s) {
    s.blocks.forEach(function (b) {
      if (b.type === "options") OPTION_BLOCKS[b.id] = { block: b, section: s };
    });
  });

  function listIds(blockId) {
    var l = state.lists[blockId];
    return Array.isArray(l) ? l : [];
  }

  function optionName(blockId, uid) {
    return value(blockId + "." + uid + ".name").trim();
  }

  function namedOptions(blockId) {
    return listIds(blockId).filter(function (uid) {
      return optionName(blockId, uid);
    });
  }

  function newUid() {
    return "o" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  }

  function syncOptionPrompts() {
    Object.keys(OPTION_BLOCKS).forEach(function (bid) {
      var b = OPTION_BLOCKS[bid].block;
      var ids = listIds(bid).slice();
      // Every list in this part starts with the minimum number of empty options.
      if (OPTION_BLOCKS[bid].section) {
        while (ids.length < (b.min || 2)) ids.push(newUid());
        state.lists[bid] = ids;
      }
      ids.forEach(function (uid, n) {
        var label = "Option " + (n + 1);
        var nameId = bid + "." + uid + ".name";
        PROMPTS[nameId] = {
          id: nameId,
          type: "text",
          label: b.nameLabel || "Name this option",
          help: b.nameHelp || "A course of action someone in the case could take, in a few words.",
          shortLabel: label + ": name",
          required: true,
        };
        (b.allFields || b.fields || []).forEach(function (f) {
          var fid = bid + "." + uid + "." + f.key;
          PROMPTS[fid] = { id: fid, type: "textarea", label: f.label, help: f.help, rows: f.rows || 3, shortLabel: (optionName(bid, uid) || label) + ": " + f.label, required: f.required !== false };
        });
      });
    });
  }

  syncOptionPrompts();

  // ---------- DOM helpers ----------

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "text") node.textContent = v;
        else if (k === "className") node.className = v;
        else if (k.slice(0, 2) === "on") node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? "" : v);
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function paragraphs(list, className) {
    return (list || []).map(function (t) {
      return el("p", { text: t, className: className });
    });
  }

  function bullets(list) {
    return el(
      "ul",
      null,
      list.map(function (t) {
        return el("li", { text: t });
      })
    );
  }

  function recordTable(rows) {
    return el("table", { className: "record" }, [
      el(
        "tbody",
        null,
        rows.map(function (r) {
          return el("tr", null, [el("th", { scope: "row", text: r[0] }), el("td", { text: r[1] })]);
        })
      ),
    ]);
  }

  function announce(msg) {
    liveRegion.textContent = "";
    window.setTimeout(function () {
      liveRegion.textContent = msg;
    }, 50);
  }

  var uid = 0;
  function disclosure(title, bodyNodes, headingTag) {
    var id = "disc-" + ++uid;
    var body = el("div", { className: "disclosure-body", id: id, hidden: true }, bodyNodes);
    var btn = el("button", {
      type: "button",
      className: "disclosure-toggle",
      "aria-expanded": "false",
      "aria-controls": id,
      text: title,
      onclick: function () {
        var open = btn.getAttribute("aria-expanded") !== "true";
        btn.setAttribute("aria-expanded", String(open));
        body.hidden = !open;
      },
    });
    return el("div", { className: "disclosure" }, [el(headingTag || "h5", null, [btn]), body]);
  }

  // ---------- Worksheet logic ----------

  function sectionIndex(id) {
    for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i].id === id) return i;
    return -1;
  }

  function outlineNumber(id) {
    for (var i = 0; i < CASE.outline.length; i++) if (CASE.outline[i].id === id) return CASE.outline[i].number;
    return 0;
  }

  // When the case file is one of the numbered steps (caseFile.step), the steps are
  // the worksheet sections plus the case file.
  var FILE_STEP = (CASE.caseFile && CASE.caseFile.step) || null;
  // Sections are called steps when the case file is one of them, or sits beside them in a folder.
  var STEPS = !!FILE_STEP || FOLDER;
  var STEP_COUNT = Math.max.apply(
    null,
    [FILE_STEP || 0].concat(
      CASE.outline.map(function (o) {
        return o.number;
      })
    )
  );

  function isRequired(p) {
    if (p.requiredIf) return value(p.requiredIf.prompt) === p.requiredIf.equals;
    return !!p.required;
  }

  // Prompts a section asks for, including restatements of earlier-part answers
  // that this browser does not have.
  function sectionPrompts(section) {
    var ids = [];
    section.blocks.forEach(function (b) {
      if (b.type === "prompts" || b.type === "consultNote") ids = ids.concat(b.ids);
      if (b.type === "options") {
        listIds(b.id).forEach(function (uid) {
          ids.push(b.id + "." + uid + ".name");
          (b.fields || []).forEach(function (f) {
            ids.push(b.id + "." + uid + "." + f.key);
          });
        });
      }
      if (b.type === "optionFields") {
        namedOptions(b.list).forEach(function (uid) {
          b.fields.forEach(function (f) {
            ids.push(b.list + "." + uid + "." + f.key);
          });
        });
      }
      if (b.type === "carryForward") {
        b.ids.forEach(function (id) {
          if (!value(id) || state.restated[id]) ids.push(id);
        });
      }
    });
    return ids;
  }

  function missingIn(section) {
    return sectionPrompts(section).filter(function (id) {
      var p = PROMPTS[id];
      return p && isRequired(p) && !value(id).trim();
    });
  }

  function sectionStatus(section) {
    var ids = sectionPrompts(section);
    if (!ids.length) {
      // A step that works from the option list has nothing to show until options are named.
      var needsOptions = section.blocks.some(function (b) {
        return b.type === "optionFields";
      });
      return needsOptions ? "Not started" : null;
    }
    var answered = ids.some(function (id) {
      return value(id).trim();
    });
    if (!missingIn(section).length && answered) return "Complete";
    return answered ? "In progress" : "Not started";
  }

  function allMissing() {
    var out = [];
    SECTIONS.forEach(function (s) {
      missingIn(s).forEach(function (id) {
        out.push({ section: s, id: id });
      });
    });
    return out;
  }

  function sectionWithPrompt(promptId) {
    for (var i = 0; i < SECTIONS.length; i++) {
      if (sectionPrompts(SECTIONS[i]).indexOf(promptId) !== -1) return SECTIONS[i];
    }
    return null;
  }

  // ---------- Views ----------

  function currentView() {
    return state.position[POSITION] || "start";
  }

  function go(view, focusTarget) {
    if (FOLDER && inCaseFile(view)) return openFolder(view.indexOf("item:") === 0 ? view.slice(5) : null);
    trackReturn(currentView(), view);
    state.position[POSITION] = view;
    // Remember the last place worked on, for "Continue where you left off".
    if (view !== "start") state.position[POSITION + ":last"] = view;
    save();
    render();
    var target = focusTarget || main.querySelector("h2");
    if (target) {
      if (!focusTarget) target.setAttribute("tabindex", "-1");
      target.focus();
      if (focusTarget) target.scrollIntoView({ block: "center" });
      else window.scrollTo(0, 0);
    }
  }

  // Leaving a worksheet step for the case file remembers the step and the last field
  // written in, so the case file can offer a way straight back to it.
  var RETURN_KEY = POSITION + ":return";
  var lastField = null;
  var returnField = null;

  main.addEventListener("focusin", function (e) {
    var t = e.target;
    if (currentView().indexOf("ws:") === 0 && t.id && (t.tagName === "TEXTAREA" || t.tagName === "INPUT")) lastField = t.id;
  });

  function inCaseFile(view) {
    return view === "file" || view.indexOf("item:") === 0;
  }

  function trackReturn(from, to) {
    if (from.indexOf("ws:") === 0 && inCaseFile(to)) {
      state.position[RETURN_KEY] = from;
      returnField = lastField;
    } else if (!inCaseFile(to)) {
      delete state.position[RETURN_KEY];
    }
    if (from !== to) lastField = null;
  }

  function returnButton(className) {
    var view = state.position[RETURN_KEY];
    var i = view ? sectionIndex(view.slice(3)) : -1;
    if (i === -1) return null;
    var section = SECTIONS[i];
    return el("button", {
      type: "button",
      className: className,
      text: "Return to " + (STEPS ? "Step " + outlineNumber(section.id) + ": " : "") + section.title,
      onclick: function () {
        var id = returnField;
        go(view);
        var field = id && document.getElementById(id);
        if (field) {
          field.focus();
          field.scrollIntoView({ block: "center" });
        }
      },
    });
  }

  function goToPrompt(section, promptId) {
    go("ws:" + section.id);
    var field = main.querySelector('.field[data-prompt="' + promptId + '"]');
    if (!field) return;
    field.hidden = false;
    fieldError(field, "This answer is required.");
    var target = document.getElementById(domId(promptId));
    if (target && target.tagName === "FIELDSET") target = target.querySelector("input") || target;
    if (target) {
      target.focus();
      target.scrollIntoView({ block: "center" });
    }
  }

  // ---------- Navigation column ----------

  // "view" is a view name, or a function to run instead of changing view.
  function navButton(view, number, title, status, current, extraClass) {
    var label = [];
    label.push(el("span", { className: "num", text: number, "aria-hidden": "true" }));
    label.push(el("span", null, [title, status ? el("span", { className: "status", text: status }) : null]));
    return el(
      "button",
      {
        type: "button",
        className: "step" + (extraClass ? " " + extraClass : ""),
        "aria-current": current ? "page" : null,
        "aria-haspopup": typeof view === "function" ? "dialog" : null,
        onclick: function () {
          if (typeof view === "function") view();
          else go(view);
        },
      },
      label
    );
  }

  function renderNav() {
    nav.textContent = "";
    var view = currentView();
    nav.appendChild(el("h2", { text: "Consultation" }));

    var openedCount = ITEM_ORDER.filter(function (id) {
      return state.opened[id];
    }).length;
    var cf = CASE.caseFile || {};
    function fileButton(number) {
      return navButton("file", number, cf.navLabel || "Case file", openedCount + " of " + ITEM_ORDER.length + " items opened", view === "file" || view.indexOf("item:") === 0);
    }
    var top = el("ul", null, [el("li", null, [navButton("start", "•", "Overview", null, view === "start")])]);
    if (FOLDER) {
      top.appendChild(
        el("li", null, [
          navButton(
            function () {
              openFolder();
            },
            "•",
            cf.navLabel || "Case file",
            openedCount + " of " + ITEM_ORDER.length + " items opened",
            false,
            "nav-folder"
          ),
        ])
      );
    } else if (!FILE_STEP) top.appendChild(el("li", null, [fileButton("•")]));
    nav.appendChild(top);

    nav.appendChild(el("h3", { text: STEPS ? "Steps" : "Worksheet" }));
    var list = el("ol");
    var fileShown = false;
    CASE.outline.forEach(function (o) {
      if (FILE_STEP && !fileShown && o.number > FILE_STEP) {
        list.appendChild(el("li", null, [fileButton(String(FILE_STEP))]));
        fileShown = true;
      }
      var i = sectionIndex(o.id);
      var node;
      if (i === -1) {
        var status = PART && o.partOrder < PART.order ? "Done in " + o.partLabel : o.partLabel + ": opens with a new code";
        node = el("div", { className: "step locked" }, [
          el("span", { className: "num", text: String(o.number), "aria-hidden": "true" }),
          el("span", null, [o.title, el("span", { className: "status", text: status })]),
        ]);
      } else {
        var st = sectionStatus(SECTIONS[i]);
        node = navButton("ws:" + o.id, String(o.number), o.title, st, view === "ws:" + o.id, st === "Complete" ? "done" : null);
      }
      list.appendChild(el("li", null, [node]));
    });
    if (FILE_STEP && !fileShown) list.appendChild(el("li", null, [fileButton(String(FILE_STEP))]));
    nav.appendChild(list);

    var missing = allMissing().length;
    var reportTitle = PART && !PART.last ? "Save your " + PART.label + " record" : "Report";
    nav.appendChild(
      el("ul", { className: "nav-report" }, [
        el("li", null, [
          navButton(
            "report",
            "•",
            reportTitle,
            missing ? missing + " required " + (missing === 1 ? "answer" : "answers") + " missing" : "Ready to download",
            view === "report"
          ),
        ]),
      ])
    );
    nav.appendChild(
      el("p", {
        className: "save-note",
        text: storageOK
          ? "Your answers are saved in this browser on this device as you type."
          : "This browser is not saving your answers. Do not reload the page, and download your record before you leave.",
      })
    );
  }

  // ---------- Case file ----------

  function tile(id) {
    var it = ITEMS[id];
    var read = !!state.opened[id];
    var meta = kind(it.kind).label + (it.role ? " · " + it.role : "");
    return el("li", null, [
      el(
        "button",
        {
          type: "button",
          className: "tile tile-" + it.kind + (read ? " read" : ""),
          "data-item": id,
          "aria-haspopup": FOLDER ? "dialog" : null,
          onclick: function () {
            go("item:" + id);
          },
        },
        [
          el("span", { className: "tile-num", text: "No. " + it.number, "aria-hidden": "true" }),
          el("span", { className: "tile-body" }, [
            el("span", { className: "tile-kind", text: meta }),
            el("span", { className: "tile-title" }, [el("span", { className: "visually-hidden", text: "Item " + it.number + ": " }), it.title]),
            it.summary ? el("span", { className: "tile-summary", text: it.summary }) : null,
            el("span", { className: "tile-status" }, [
              it.isNew ? el("span", { className: "tag new", text: "New" }) : null,
              el("span", { className: "tile-read", text: read ? "Opened" : "Not opened yet" }),
            ]),
          ]),
        ]
      ),
    ]);
  }

  function tileList(ids) {
    return el("ul", { className: "tiles" }, ids.map(tile));
  }

  function renderFile() {
    var cf = CASE.caseFile || {};
    main.appendChild(el("p", { className: "stage-label", text: FILE_STEP ? "Step " + FILE_STEP + " of " + STEP_COUNT : "Case file" }));
    main.appendChild(el("h2", { text: cf.heading || "Case file" }));
    paragraphs(cf.intro || ["Open any item, in any order. Nothing here is required reading, but your recommendation should rest on what you find."], "lead").forEach(function (n) {
      main.appendChild(n);
    });
    var fresh = ITEM_ORDER.filter(function (id) {
      return ITEMS[id].isNew;
    });
    if (fresh.length) {
      main.appendChild(el("h3", { text: "New in " + (PART ? PART.label : "this part") }));
      main.appendChild(tileList(fresh));
    }
    KINDS.forEach(function (k) {
      var ids = ITEM_ORDER.filter(function (id) {
        return ITEMS[id].kind === k.id && !ITEMS[id].isNew;
      });
      if (!ids.length) return;
      main.appendChild(el("h3", { text: (fresh.length ? "Earlier: " : "") + k.heading }));
      main.appendChild(tileList(ids));
    });
    main.appendChild(
      el("div", { className: "actions" }, [
        returnButton("btn") ||
          el("button", {
            type: "button",
            className: "btn",
            text: "Go to the worksheet",
            onclick: function () {
              go("ws:" + firstOpenSection().id);
            },
          }),
      ])
    );
  }

  function firstOpenSection() {
    for (var i = 0; i < SECTIONS.length; i++) if (sectionStatus(SECTIONS[i]) !== "Complete") return SECTIONS[i];
    return SECTIONS[0];
  }

  function initials(name) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(function (w) {
        return w.charAt(0).toUpperCase();
      })
      .join("");
  }

  // Label/value rows. On a chart they read as the fields at the top of a record.
  function chartFields(rows) {
    return el(
      "dl",
      { className: "chart-fields" },
      rows.map(function (r) {
        return el("div", null, [el("dt", { text: r[0] }), el("dd", { text: r[1] })]);
      })
    );
  }

  function renderItem(id) {
    var it = ITEMS[id];
    main.appendChild(el("p", { className: "stage-label", text: "Case file · Item " + it.number + " · " + kind(it.kind).label + (it.isNew ? " · New" : "") }));
    itemSheet(id).forEach(function (n) {
      main.appendChild(n);
    });

    var pos = ITEM_ORDER.indexOf(id);
    var nextId = ITEM_ORDER[pos + 1];
    var back = returnButton("btn");
    var buttons = [
      back,
      el("button", {
        type: "button",
        className: back ? "btn secondary" : "btn",
        text: "Back to the case file",
        onclick: function () {
          go("file");
        },
      }),
    ];
    if (nextId) {
      buttons.push(
        el("button", {
          type: "button",
          className: "btn secondary",
          text: "Next item: " + ITEMS[nextId].number + ". " + ITEMS[nextId].title,
          onclick: function () {
            go("item:" + nextId);
          },
        })
      );
    }
    main.appendChild(el("div", { className: "actions" }, buttons));
  }

  // An item's sheet of paper, and its notepad, for the case-file page or the folder.
  function itemSheet(id) {
    var it = ITEMS[id];
    var k = kind(it.kind);
    var look = LOOKS[it.look] ? it.look : k.look;
    var head = el("header", { className: "sheet-head" }, [
      el("p", { className: "sheet-band" }, [el("span", { text: it.bandLabel || (look === k.look && k.band) || LOOKS[look] }), el("span", { text: "Item " + it.number })]),
    ]);
    var titleRow = el("div", { className: "sheet-title" }, [
      it.kind === "person" ? el("span", { className: "avatar", text: initials(it.title), "aria-hidden": "true" }) : null,
      el("div", null, [el("h2", { text: it.title }), it.role ? el("p", { className: "role", text: it.role }) : null, it.source ? el("p", { className: "source", text: it.source }) : null]),
    ]);
    head.appendChild(titleRow);
    if (it.kind === "background") {
      head.appendChild(el("p", { className: "sheet-note", text: "Plain-language background to help you follow the case. It is simplified, and it is not medical advice." }));
    }

    var body = el("div", { className: "sheet-body" });
    paragraphs(it.introduction, "lead").forEach(function (n) {
      body.appendChild(n);
    });
    (it.sections || []).forEach(function (sec) {
      var nodes = [sec.heading ? el("h3", { text: sec.heading }) : null].concat(paragraphs(sec.paragraphs));
      if (sec.items) nodes.push(bullets(sec.items));
      if (sec.rows) nodes.push(look === "chart" ? chartFields(sec.rows) : recordTable(sec.rows));
      if (sec.quote) nodes.push(el("blockquote", null, paragraphs(sec.quote).concat(sec.quoteSource ? [el("p", { className: "source", text: sec.quoteSource })] : [])));
      body.appendChild(el("section", null, nodes));
    });
    if (it.questions && it.questions.length) {
      body.appendChild(el("h3", { text: it.questionsHeading || "Questions you can ask" }));
      body.appendChild(
        el(
          "div",
          { className: "transcript" },
          it.questions.map(function (q) {
            return disclosure(q.question, paragraphs(q.answer), "h4");
          })
        )
      );
    }
    if (it.limits) {
      body.appendChild(el("div", { className: "callout attention" }, [el("p", { className: "callout-label", text: "What this can’t tell you" })].concat(paragraphs(it.limits))));
    }
    var out = [el("article", { className: "sheet sheet-" + look }, [head, body])];
    if (PROMPTS["notes." + id]) out.push(el("div", { className: "notepad" }, [renderPrompt("notes." + id)]));
    return out;
  }

  // ---------- Case folder (caseFile.folder) ----------
  // The case file opens as a dialog over the current step, from a manila folder in the
  // header, the navigation column, or any item tile. Closing it leaves the student
  // exactly where they were, with focus back on what opened it.

  var folder = null;
  var FOLDER_KEY = POSITION + ":folder";
  var NARROW = window.matchMedia ? window.matchMedia("(max-width: 759px)") : { matches: false };

  function icon(d) {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    var attrs = { viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" };
    Object.keys(attrs).forEach(function (k) {
      svg.setAttribute(k, attrs[k]);
    });
    var path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
    return svg;
  }

  function openedTotal() {
    return ITEM_ORDER.filter(function (id) {
      return state.opened[id];
    }).length;
  }

  // Items in the order the folder lists them: new ones first, then by kind.
  function folderOrder() {
    var fresh = ITEM_ORDER.filter(function (id) {
      return ITEMS[id].isNew;
    });
    var rest = [];
    KINDS.forEach(function (k) {
      ITEM_ORDER.forEach(function (id) {
        if (ITEMS[id].kind === k.id && !ITEMS[id].isNew) rest.push(id);
      });
    });
    return fresh.concat(rest);
  }

  function buildFolder() {
    var count = el("span", { className: "folder-count" });
    var button = el("button", { type: "button", className: "folder-btn", "aria-haspopup": "dialog", onclick: function () {
      openFolder();
    } }, [icon("M2 5.5A1.5 1.5 0 0 1 3.5 4H8l2 2h6.5A1.5 1.5 0 0 1 18 7.5v7a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 2 14.5z"), el("span", { text: "Case file" }), count]);
    var actions = document.querySelector(".header-actions");
    actions.insertBefore(button, actions.firstChild);

    var index = el("nav", { className: "folder-index", "aria-label": "Case file contents" });
    var page = el("div", { className: "folder-page" });
    var inside = el("div", { className: "folder-inside" }, [index, page]);
    var dialog = el("dialog", { className: "folder-dialog", "aria-labelledby": "folder-label" }, [
      el("div", { className: "folder" }, [
        el("p", { className: "folder-tab", id: "folder-label", text: "Case file" + (PART ? " · " + PART.label : "") + " · " + CASE.title }),
        el(
          "button",
          {
            type: "button",
            className: "folder-close",
            onclick: function () {
              dialog.close();
            },
          },
          [icon("M5 5l10 10M15 5 5 15"), "Close", el("span", { className: "visually-hidden", text: " the case file" })]
        ),
        inside,
      ]),
    ]);
    // A click on the dimmed page around the folder closes it.
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", function () {
      renderNav();
      refreshTiles();
      var back = folder.opener;
      if (!back || !back.isConnected) back = (back && back.classList.contains("nav-folder") && nav.querySelector(".nav-folder")) || button;
      back.focus();
    });
    document.body.appendChild(dialog);
    folder = { button: button, count: count, dialog: dialog, inside: inside, index: index, page: page, opener: null };
    updateFolderButton();
  }

  function updateFolderButton() {
    var n = openedTotal();
    folder.count.textContent = "";
    folder.count.appendChild(el("span", { "aria-hidden": "true", text: n + "/" + ITEM_ORDER.length }));
    folder.count.appendChild(el("span", { className: "visually-hidden", text: ", " + n + " of " + ITEM_ORDER.length + " items opened" }));
  }

  // Tiles on the page behind the folder show what has been opened since.
  function refreshTiles() {
    var tiles = main.querySelectorAll(".tile[data-item]");
    for (var i = 0; i < tiles.length; i++) {
      var read = !!state.opened[tiles[i].getAttribute("data-item")];
      tiles[i].classList.toggle("read", read);
      tiles[i].querySelector(".tile-read").textContent = read ? "Opened" : "Not opened yet";
    }
  }

  function openFolder(id) {
    var target = id || state.position[FOLDER_KEY] || "cover";
    if (target !== "cover" && !ITEMS[target]) target = "cover";
    if (!folder.dialog.open) {
      folder.opener = document.activeElement;
      folder.dialog.showModal();
    }
    // On a phone the folder shows one side at a time; opening it shows the contents first.
    showInFolder(target, !id && NARROW.matches);
  }

  function showInFolder(target, onIndex) {
    state.position[FOLDER_KEY] = target;
    if (target !== "cover") state.opened[target] = true;
    save();
    updateFolderButton();
    renderFolderIndex(target);
    renderFolderPage(target);
    folder.inside.classList.toggle("on-index", !!onIndex);
    if (onIndex) {
      folder.index.scrollTop = 0;
      folder.index.querySelector('[aria-current="true"]').focus();
    } else {
      folder.page.scrollTop = 0;
      var h = folder.page.querySelector("h2");
      h.setAttribute("tabindex", "-1");
      h.focus();
    }
  }

  function folderEntry(target, current) {
    var cover = target === "cover";
    var it = cover ? null : ITEMS[target];
    var read = cover || !!state.opened[target];
    return el("li", null, [
      el(
        "button",
        {
          type: "button",
          className: "folder-entry" + (read && !cover ? " read" : ""),
          "aria-current": current === target ? "true" : null,
          onclick: function () {
            showInFolder(target, false);
          },
        },
        [
          el("span", { className: "num", text: cover ? "" : "No. " + it.number, "aria-hidden": "true" }),
          el("span", null, [
            cover ? "The case in brief" : el("span", null, [el("span", { className: "visually-hidden", text: "Item " + it.number + ": " }), it.title]),
            it && it.isNew ? el("span", { className: "tag new", text: "New" }) : null,
            el("span", { className: "status", text: cover ? "Start here" : read ? "Opened" : "Not opened yet" }),
          ]),
        ]
      ),
    ]);
  }

  function renderFolderIndex(current) {
    var index = folder.index;
    index.textContent = "";
    index.appendChild(el("h2", { text: "Contents" }));
    index.appendChild(el("ul", null, [folderEntry("cover", current)]));
    var fresh = ITEM_ORDER.filter(function (id) {
      return ITEMS[id].isNew;
    });
    var groups = fresh.length ? [{ heading: "New in " + PART.label, ids: fresh }] : [];
    KINDS.forEach(function (k) {
      var ids = folderOrder().filter(function (id) {
        return ITEMS[id].kind === k.id && !ITEMS[id].isNew;
      });
      if (ids.length) groups.push({ heading: (fresh.length ? "Earlier: " : "") + k.heading, ids: ids });
    });
    groups.forEach(function (g) {
      index.appendChild(el("h3", { text: g.heading }));
      index.appendChild(
        el(
          "ul",
          null,
          g.ids.map(function (id) {
            return folderEntry(id, current);
          })
        )
      );
    });
  }

  function renderFolderPage(target) {
    var page = folder.page;
    page.textContent = "";
    page.appendChild(
      el("button", {
        type: "button",
        className: "link-button folder-contents",
        text: "All contents",
        onclick: function () {
          folder.inside.classList.add("on-index");
          folder.index.querySelector('[aria-current="true"]').focus();
        },
      })
    );
    if (target === "cover") {
      var s = CASE.start;
      var cf = CASE.caseFile || {};
      page.appendChild(el("p", { className: "stage-label", text: "Case file · The case in brief" }));
      page.appendChild(
        el("article", { className: "sheet sheet-cover" }, [
          el("header", { className: "sheet-head" }, [el("p", { className: "sheet-band" }, [el("span", { text: "Case summary" }), el("span", { text: PART ? PART.label : "" })]), el("h2", { text: s.heading })]),
          el(
            "div",
            { className: "sheet-body" },
            [el("p", { className: "lead", text: s.lead })].concat(
              paragraphs(cf.intro),
              paragraphs(["Everything the committee has on this case is in this folder. Open it from any step with the Case file button at the top of the screen. Closing it takes you back to where you were."], "muted")
            )
          ),
        ])
      );
    } else {
      var it = ITEMS[target];
      page.appendChild(el("p", { className: "stage-label", text: "Case file · Item " + it.number + " · " + kind(it.kind).label + (it.isNew ? " · New" : "") }));
      itemSheet(target).forEach(function (n) {
        page.appendChild(n);
      });
    }
    var order = ["cover"].concat(folderOrder());
    var pos = order.indexOf(target);
    function label(t) {
      return t === "cover" ? "The case in brief" : ITEMS[t].number + ". " + ITEMS[t].title;
    }
    var buttons = [];
    if (order[pos + 1]) {
      buttons.push(
        el("button", {
          type: "button",
          className: "btn",
          text: "Next: " + label(order[pos + 1]),
          onclick: function () {
            showInFolder(order[pos + 1], false);
          },
        })
      );
    }
    if (pos > 0) {
      buttons.push(
        el("button", {
          type: "button",
          className: "btn secondary",
          text: "Previous: " + label(order[pos - 1]),
          onclick: function () {
            showInFolder(order[pos - 1], false);
          },
        })
      );
    }
    buttons.push(
      el("button", {
        type: "button",
        className: "btn secondary",
        text: "Close the case file",
        onclick: function () {
          folder.dialog.close();
        },
      })
    );
    page.appendChild(el("div", { className: "actions" }, buttons));
  }

  if (FOLDER) buildFolder();

  // ---------- Worksheet blocks ----------

  function renderBlock(block) {
    switch (block.type) {
      case "text":
        return el("section", null, [block.heading ? el("h3", { text: block.heading }) : null].concat(paragraphs(block.paragraphs)));
      case "callout":
        return el(
          "div",
          { className: "callout" + (block.tone === "attention" ? " attention" : "") },
          [block.label ? el("p", { className: "callout-label", text: block.label }) : null].concat(paragraphs(block.paragraphs))
        );
      case "list":
        return el("section", null, [block.heading ? el("h3", { text: block.heading }) : null, block.intro ? el("p", { text: block.intro }) : null, el(block.ordered ? "ol" : "ul", null, block.items.map(function (t) {
          return el("li", { text: t });
        }))]);
      case "quote":
        return el("section", null, [
          block.heading ? el("h3", { text: block.heading }) : null,
          el("blockquote", null, paragraphs(block.paragraphs).concat(block.source ? [el("p", { className: "source", text: block.source })] : [])),
        ]);
      case "record":
        return el("section", null, [block.heading ? el("h3", { text: block.heading }) : null, block.intro ? el("p", { text: block.intro }) : null, recordTable(block.rows)]);
      case "items":
        return el("section", null, [block.heading ? el("h3", { text: block.heading }) : null, block.intro ? el("p", { text: block.intro }) : null, tileList(block.ids)]);
      case "concepts":
        return el("section", null, [
          el("h3", { text: block.heading }),
          block.intro ? el("p", { text: block.intro }) : null,
          el(
            "div",
            null,
            block.items.map(function (c) {
              return disclosure(c.title, paragraphs(c.paragraphs), "h4");
            })
          ),
        ]);
      case "prompts":
        return el(
          "section",
          null,
          [block.heading ? el("h3", { text: block.heading }) : null, block.intro ? el("p", { text: block.intro }) : null].concat(
            block.ids.map(function (id) {
              return renderPrompt(id);
            })
          )
        );
      case "carryForward":
        return renderCarryForward(block);
      case "trajectory":
        return renderTrajectory(block);
      case "perspectives":
        return trackPerspectives(block);
      case "options":
        return renderOptions(block);
      case "optionFields":
        return renderOptionFields(block);
      case "consultNote":
        return renderConsultNote(block);
      default:
        return null;
    }
  }

  function describeAnswer(id) {
    var p = PROMPTS[id];
    var v = value(id);
    if (!v) return "";
    if (p.type === "choice") {
      var opt = optionById(p, v);
      return opt ? opt.title : v;
    }
    if (p.type === "listChoice") return optionName(p.list, v) || "[An option that was later removed or left unnamed]";
    return v;
  }

  function optionById(p, optId) {
    var opts = CASE.optionSets[p.options] || [];
    for (var i = 0; i < opts.length; i++) if (opts[i].id === optId) return opts[i];
    return null;
  }

  function renderCarryForward(block) {
    var anyMissing = block.ids.some(function (id) {
      return !value(id) || state.restated[id];
    });
    var nodes = [el("h3", { text: block.heading })];
    if (anyMissing) {
      nodes.push(
        el("div", { className: "callout attention" }, [
          el("p", { className: "callout-label", text: "Your earlier answers are not on this device" }),
          el("p", { text: block.missingText }),
        ])
      );
    } else if (block.intro) {
      nodes.push(el("p", { text: block.intro }));
    }
    block.ids.forEach(function (id) {
      if (!value(id) || state.restated[id]) {
        nodes.push(renderPrompt(id, { restating: true }));
      } else {
        nodes.push(el("div", { className: "field" }, [el("p", { className: "help", text: PROMPTS[id].label }), el("p", { className: "readonly-answer", text: describeAnswer(id) })]));
      }
    });
    return el("section", null, nodes);
  }

  function renderTrajectory(block) {
    var nodes = [el("h3", { text: block.heading }), block.intro ? el("p", { text: block.intro }) : null];
    block.steps.forEach(function (step) {
      nodes.push(el("h4", { text: step.label }));
      step.ids.forEach(function (id) {
        var v = describeAnswer(id);
        nodes.push(el("p", { className: "help", text: PROMPTS[id].shortLabel || PROMPTS[id].label }));
        nodes.push(el("p", { className: "readonly-answer", text: v || "No response recorded." }));
      });
    });
    return el("section", null, nodes);
  }

  function renderPerspectives(block) {
    var p = PROMPTS[block.prompt];
    var chosen = value(block.prompt);
    var opts = CASE.optionSets[p.options];
    var nodes = [el("h3", { text: block.heading })];
    var mine = optionById(p, chosen);
    // Shown only after the student commits, so the comparison can't anchor the choice.
    if (!mine) {
      var where = sectionWithPrompt(block.prompt);
      nodes.push(
        el("div", { className: "callout" }, [
          el("p", {
            text:
              "This comparison opens after you choose your recommendation" +
              (where ? " in “" + where.title + "”." : "."),
          }),
        ])
      );
      return el("section", null, nodes);
    }
    nodes = nodes.concat(paragraphs(block.intro));
    var body = perspectiveBody;
    nodes.push(el("div", { className: "card" }, [el("h4", { text: "Your recommendation: " + mine.title })].concat(body(mine))));
    nodes.push(el("h4", { text: "The other options" }));
    opts.forEach(function (opt) {
      if (opt.id === mine.id) return;
      nodes.push(disclosure(opt.title, body(opt)));
    });
    return el("section", null, nodes);
  }

  // Comparisons on the page, so they can open as soon as the student chooses.
  var shownPerspectives = [];

  function trackPerspectives(block) {
    var node = block.after ? renderOtherOptions(block) : renderPerspectives(block);
    shownPerspectives.push({ block: block, node: node });
    return node;
  }

  function refreshPerspectives(promptId) {
    shownPerspectives.forEach(function (entry) {
      if ((entry.block.after || entry.block.prompt) !== promptId) return;
      var fresh = entry.block.after ? renderOtherOptions(entry.block) : renderPerspectives(entry.block);
      entry.node.replaceWith(fresh);
      entry.node = fresh;
    });
  }

  function perspectiveBody(opt) {
    var v = CASE.perspectives[opt.id];
    if (!v) return [el("p", { text: "No notes for this option." })];
    return [el("h5", { text: "What it takes seriously" }), bullets(v.addresses), el("h5", { text: "What it leaves open or costs" }), bullets(v.leavesOpen)];
  }

  // The case's own options, shown only after students choose from their own list,
  // so they can't anchor which options students identify.
  function renderOtherOptions(block) {
    var nodes = [el("h3", { text: block.heading })];
    if (!value(block.after)) {
      var where = sectionWithPrompt(block.after);
      nodes.push(el("div", { className: "callout" }, [el("p", { text: "These open after you choose your course of action" + (where ? " in “" + where.title + "”." : ".") })]));
      return el("section", null, nodes);
    }
    nodes = nodes.concat(paragraphs(block.intro));
    (CASE.optionSets[block.options] || []).forEach(function (opt) {
      nodes.push(disclosure(opt.title, (opt.description ? [el("p", { text: opt.description })] : []).concat(perspectiveBody(opt))));
    });
    return el("section", null, nodes);
  }

  function renderOptions(block) {
    var ids = listIds(block.id);
    var min = block.min || 2;
    var max = block.max || 6;
    var nodes = [block.heading ? el("h3", { text: block.heading }) : null].concat(paragraphs(block.intro));
    ids.forEach(function (uid, n) {
      var parts = [el("legend", { text: "Option " + (n + 1) }), renderPrompt(block.id + "." + uid + ".name")];
      (block.fields || []).forEach(function (f) {
        parts.push(renderPrompt(block.id + "." + uid + "." + f.key));
      });
      if (ids.length > min) {
        parts.push(
          el("button", {
            type: "button",
            className: "link-button remove-option",
            text: "Remove option " + (n + 1),
            onclick: function () {
              removeOption(block, uid, n);
            },
          })
        );
      }
      nodes.push(el("fieldset", { className: "option-card", id: "card-" + uid }, parts));
    });
    if (ids.length < max) {
      nodes.push(
        el("button", {
          type: "button",
          className: "btn secondary add-option",
          text: block.addLabel || "Add another option",
          onclick: function () {
            addOption(block);
          },
        })
      );
    } else {
      nodes.push(el("p", { className: "muted", text: "You can list up to " + max + " options." }));
    }
    return el("section", { className: "options-block" }, nodes);
  }

  // More fields for each option listed in an earlier section (for example, arguments
  // for and against in the step after options and consequences).
  function renderOptionFields(block) {
    var nodes = [block.heading ? el("h3", { text: block.heading }) : null].concat(paragraphs(block.intro));
    var named = namedOptions(block.list);
    var home = OPTION_BLOCKS[block.list] && OPTION_BLOCKS[block.list].section;
    if (!named.length) {
      nodes.push(
        el("div", { className: "callout attention" }, [
          el("p", { text: "This step works from the options you list" + (home ? " in “" + home.title + "”" : "") + ". Name at least one option there first." }),
          home
            ? el("button", {
                type: "button",
                className: "link-button",
                text: "Go to " + home.title,
                onclick: function () {
                  go("ws:" + home.id);
                },
              })
            : null,
        ])
      );
    }
    named.forEach(function (uid) {
      var parts = [el("legend", { text: optionName(block.list, uid) })];
      block.fields.forEach(function (f) {
        parts.push(renderPrompt(block.list + "." + uid + "." + f.key));
      });
      nodes.push(el("fieldset", { className: "option-card" }, parts));
    });
    return el("section", null, nodes);
  }

  // The note the committee leaves in the chart for the clinician who asked. A word
  // count guides its length but never blocks the student.
  function noteFrom(block) {
    var team = value("team.name").trim();
    return (block.from || "Clinical Ethics Committee") + (team ? " · " + team : "");
  }

  function renderConsultNote(block) {
    var limit = block.wordLimit || 250;
    var nodes = [el("h3", { text: block.heading || "Write the consult note" })];
    paragraphs(
      block.intro || [
        "Write the note the committee would leave in the chart for " +
          (block.to || "the clinician who asked for this consultation") +
          ". Keep it short and plain: they should be able to act on it in two minutes.",
      ]
    ).forEach(function (n) {
      nodes.push(n);
    });
    var counter = el("p", { className: "word-count", id: "note-word-count" });
    var wasOver = null;
    function update() {
      var n = block.ids.reduce(function (sum, id) {
        var t = value(id).trim();
        return sum + (t ? t.split(/\s+/).length : 0);
      }, 0);
      var over = n > limit;
      counter.textContent = over
        ? "Note length: " + n + " words. That is over the " + limit + "-word guide; a busy clinician may not read it all."
        : "Note length: " + n + (n === 1 ? " word" : " words") + " (aim for " + limit + " or fewer).";
      counter.className = "word-count" + (over ? " over" : "");
      if (wasOver !== null && over !== wasOver) announce(over ? "The note is now over " + limit + " words." : "The note is back within " + limit + " words.");
      wasOver = over;
    }
    var head = el("dl", { className: "chart-fields note-head" }, [
      el("div", null, [el("dt", { text: "To" }), el("dd", { text: block.to || "Requesting clinician" })]),
      el("div", null, [el("dt", { text: "From" }), el("dd", { text: noteFrom(block) })]),
      el("div", null, [el("dt", { text: "Re" }), el("dd", { text: block.re })]),
      el("div", null, [el("dt", { text: "Date" }), el("dd", { text: new Date().toLocaleDateString() })]),
    ]);
    var body = el("div", { className: "consult-note-body" }, [head]);
    block.ids.forEach(function (id) {
      body.appendChild(renderPrompt(id));
    });
    body.appendChild(counter);
    var note = el("section", { className: "consult-note", "aria-label": "Ethics consultation note" }, [
      el("p", { className: "sheet-band" }, [el("span", { text: "Ethics consultation note" }), el("span", { text: "For the chart" })]),
      body,
    ]);
    note.addEventListener("input", update);
    update();
    nodes.push(note);
    return el("section", null, nodes);
  }

  function addOption(block) {
    var uid = newUid();
    state.lists[block.id] = listIds(block.id).concat([uid]);
    syncOptionPrompts();
    save();
    render();
    var input = document.getElementById(domId(block.id + "." + uid + ".name"));
    if (input) {
      input.focus();
      input.scrollIntoView({ block: "center" });
    }
    announce("Option " + listIds(block.id).length + " added.");
  }

  function removeOption(block, uid, n) {
    var keys = ["name"].concat(
      (block.allFields || block.fields || []).map(function (f) {
        return f.key;
      })
    );
    var written = keys.some(function (k) {
      return value(block.id + "." + uid + "." + k).trim();
    });
    var name = optionName(block.id, uid);
    if (written && !window.confirm("Remove option " + (n + 1) + (name ? " (“" + name + "”)" : "") + " and everything written for it? This cannot be undone.")) return;
    keys.forEach(function (k) {
      delete state.responses[block.id + "." + uid + "." + k];
      delete PROMPTS[block.id + "." + uid + "." + k];
    });
    state.lists[block.id] = listIds(block.id).filter(function (x) {
      return x !== uid;
    });
    // A choice of the removed option no longer stands.
    Object.keys(PROMPTS).forEach(function (pid) {
      var p = PROMPTS[pid];
      if (p.type === "listChoice" && p.list === block.id && value(pid) === uid) delete state.responses[pid];
    });
    syncOptionPrompts();
    save();
    render();
    var add = main.querySelector(".add-option");
    if (add) add.focus();
    announce("Option removed.");
  }

  // ---------- Prompts ----------

  function fieldError(field, message) {
    var errId = domId(field.getAttribute("data-prompt")) + "-error";
    var existing = document.getElementById(errId);
    if (message) {
      field.classList.add("invalid");
      if (!existing) {
        existing = el("p", { className: "field-error", id: errId });
        var anchor = field.querySelector("label, legend");
        anchor.parentNode.insertBefore(existing, anchor.nextSibling);
      }
      existing.textContent = message;
    } else {
      field.classList.remove("invalid");
      if (existing) existing.remove();
    }
    var input = field.querySelector("textarea, input[type=text], fieldset");
    if (input) {
      var described = [];
      if (message) described.push(errId);
      if (field.querySelector(".help")) described.push(domId(field.getAttribute("data-prompt")) + "-help");
      if (described.length) input.setAttribute("aria-describedby", described.join(" "));
      else input.removeAttribute("aria-describedby");
      if (input.tagName !== "FIELDSET") input.setAttribute("aria-invalid", message ? "true" : "false");
    }
  }

  function domId(id) {
    return "f-" + id.replace(/[^a-zA-Z0-9_-]/g, "-");
  }

  function renderPrompt(id, opts) {
    var p = PROMPTS[id];
    var restating = opts && opts.restating;
    var fid = domId(id);
    var reqText = p.required ? " (required)" : p.requiredIf ? "" : " (optional)";
    var labelText = (restating && p.restateLabel) || p.label;
    var help = p.help ? el("p", { className: "help", id: fid + "-help", text: p.help }) : null;
    var field = el("div", { className: "field", "data-prompt": id });

    function onChange(v) {
      state.responses[id] = v;
      if (restating) state.restated[id] = true;
      save();
      if (field.classList.contains("invalid") && v.trim()) fieldError(field, null);
      if (p.type === "choice" || p.type === "listChoice") {
        refreshDependents(id);
        refreshPerspectives(id);
      }
      renderNav();
    }

    if (p.type === "listChoice") {
      var lfs = el("fieldset", { id: fid, tabindex: "-1" }, [el("legend", null, [labelText, el("span", { className: "req", text: reqText })]), help]);
      var named = namedOptions(p.list);
      var home = OPTION_BLOCKS[p.list] && OPTION_BLOCKS[p.list].section;
      if (!named.length) {
        lfs.appendChild(
          el("div", { className: "callout attention" }, [
            el("p", { text: "Your choice is made from the options you list" + (home ? " in “" + home.title + "”" : "") + ". Name at least one option there first." }),
            home
              ? el("button", {
                  type: "button",
                  className: "link-button",
                  text: "Go to " + home.title,
                  onclick: function () {
                    go("ws:" + home.id);
                  },
                })
              : null,
          ])
        );
      }
      named.forEach(function (uid) {
        var inputId = fid + "-" + uid;
        lfs.appendChild(
          el("label", { className: "option", for: inputId }, [
            el("input", {
              type: "radio",
              name: fid,
              id: inputId,
              value: uid,
              checked: value(id) === uid,
              onchange: function () {
                onChange(uid);
              },
            }),
            el("span", null, [el("span", { className: "opt-title", text: optionName(p.list, uid) })]),
          ])
        );
      });
      field.appendChild(lfs);
    } else if (p.type === "choice") {
      var fs = el("fieldset", { id: fid, tabindex: "-1" }, [el("legend", null, [labelText, el("span", { className: "req", text: reqText })]), help]);
      CASE.optionSets[p.options].forEach(function (opt) {
        var inputId = fid + "-" + opt.id;
        var input = el("input", {
          type: "radio",
          name: fid,
          id: inputId,
          value: opt.id,
          checked: value(id) === opt.id,
          onchange: function () {
            onChange(opt.id);
          },
        });
        fs.appendChild(
          el("label", { className: "option", for: inputId }, [
            input,
            el("span", null, [el("span", { className: "opt-title", text: opt.title }), opt.description ? el("span", { className: "opt-desc", text: opt.description }) : null]),
          ])
        );
      });
      field.appendChild(fs);
    } else {
      var input2 = p.type === "text" ? el("input", { type: "text", id: fid, autocomplete: "off" }) : el("textarea", { id: fid, rows: String(p.rows || 5) });
      input2.value = value(id);
      input2.addEventListener("input", function () {
        onChange(input2.value);
      });
      field.appendChild(el("label", { for: fid }, [labelText, el("span", { className: "req", text: reqText })]));
      if (help) field.appendChild(help);
      field.appendChild(input2);
    }
    if (p.requiredIf) {
      field.setAttribute("data-depends", p.requiredIf.prompt);
      field.hidden = !isRequired(p) && !value(id);
      markCondition(field, p);
    }
    if (help) {
      var target = field.querySelector("textarea, input[type=text], fieldset");
      target.setAttribute("aria-describedby", fid + "-help");
    }
    return field;
  }

  function refreshDependents(changedId) {
    var deps = main.querySelectorAll('[data-depends="' + changedId + '"]');
    for (var i = 0; i < deps.length; i++) {
      var p = PROMPTS[deps[i].getAttribute("data-prompt")];
      deps[i].hidden = !isRequired(p) && !value(p.id);
      if (deps[i].hidden) fieldError(deps[i], null);
      markCondition(deps[i], p);
    }
  }

  // A conditional answer stays on screen after its choice changes, so nothing written is
  // lost, but it is left out of the report and says so.
  function markCondition(field, p) {
    var old = field.querySelector(".field-note");
    if (old) old.remove();
    if (isRequired(p) || !value(p.id)) return;
    var src = PROMPTS[p.requiredIf.prompt];
    var opt = src && src.type === "choice" ? optionById(src, p.requiredIf.equals) : null;
    field.appendChild(
      el("p", {
        className: "field-note",
        text: "Left out of your report unless you choose “" + (opt ? opt.title : p.requiredIf.equals) + "”. Delete it if you no longer need it.",
      })
    );
  }

  // ---------- Report ----------

  function reportModel(config) {
    // Answers from an earlier part are missing as a whole when that part was done on another device.
    var haveEarlier = config.sections.some(function (sec) {
      return (
        sec.earlier &&
        (sec.ids || []).some(function (id) {
          return PROMPTS[id] && value(id);
        })
      );
    });
    var sections = config.sections.map(function (sec) {
      // A consult note opens with its addressing lines.
      var head = sec.note
        ? [
            { label: "To", answer: sec.note.to || "Requesting clinician", note: null, missing: "" },
            { label: "From", answer: noteFrom(sec.note), note: null, missing: "" },
            { label: "Re", answer: sec.note.re || CASE.title, note: null, missing: "" },
          ]
        : [];
      return {
        title: sec.title,
        items: head.concat((sec.ids || [])
          .filter(function (id) {
            // Skip conditional prompts that do not apply, even if they still hold text.
            return PROMPTS[id] && (!PROMPTS[id].requiredIf || isRequired(PROMPTS[id]));
          })
          .map(function (id) {
            var p = PROMPTS[id];
            return {
              label: p.shortLabel || p.label,
              answer: describeAnswer(id),
              note: state.restated[id] ? "Restated at the start of " + (PART ? PART.label : "this part") + " because the earlier answer was not on this device." : null,
              missing: sec.earlier && !haveEarlier ? "[Not on this device. See your record from the earlier part.]" : "[No response]",
            };
          })
          .concat(listItems(sec.lists || []))),
      };
    });
    sections = sections.concat(otherSections(config));
    // Case-file notes are optional, so only the ones written appear.
    var notes = ITEM_ORDER.filter(function (id) {
      return PROMPTS["notes." + id] && value("notes." + id).trim();
    }).map(function (id) {
      return { label: PROMPTS["notes." + id].shortLabel, answer: value("notes." + id), note: null, missing: "" };
    });
    if (notes.length) sections.push({ title: "Notes from the case file", items: notes });
    return {
      title: config.title,
      caseTitle: CASE.title,
      version: CASE.version,
      part: PART ? PART.label : null,
      team: value("team.name"),
      members: value("team.members"),
      date: new Date().toLocaleString(),
      missingCount: allMissing().length,
      sections: sections,
    };
  }

  // Answers this file holds that the report outline doesn't list, so a report or an
  // export never leaves out work a student has done.
  function otherSections(config) {
    var seen = {};
    config.sections.forEach(function (sec) {
      (sec.ids || []).forEach(function (id) {
        seen[id] = true;
      });
      (sec.lists || []).forEach(function (bid) {
        seen["list:" + bid] = true;
      });
    });
    function inList(id) {
      return Object.keys(OPTION_BLOCKS).some(function (bid) {
        return id.indexOf(bid + ".") === 0;
      });
    }
    var out = [];
    SECTIONS.forEach(function (s) {
      var items = [];
      s.blocks.forEach(function (b) {
        var bid = b.type === "options" ? b.id : b.type === "optionFields" ? b.list : null;
        if (!bid || seen["list:" + bid]) return;
        seen["list:" + bid] = true;
        items = items.concat(
          listItems([bid]).filter(function (item) {
            return item.answer;
          })
        );
      });
      sectionPrompts(s).forEach(function (id) {
        var p = PROMPTS[id];
        if (!p || seen[id] || inList(id) || !value(id).trim() || (p.requiredIf && !isRequired(p))) return;
        seen[id] = true;
        items.push({ label: p.shortLabel || p.label, answer: describeAnswer(id), note: null, missing: "" });
      });
      if (items.length) out.push({ title: "Also recorded: " + (STEPS ? "Step " + outlineNumber(s.id) + ", " : "") + s.title, items: items });
    });
    return out;
  }

  function listItems(blockIds) {
    var items = [];
    blockIds.forEach(function (bid) {
      var b = OPTION_BLOCKS[bid] && OPTION_BLOCKS[bid].block;
      if (!b) return;
      var named = namedOptions(bid);
      if (!named.length) items.push({ label: b.reportLabel || "Options considered", answer: "", note: null, missing: "[No options listed]" });
      named.forEach(function (uid) {
        var text = (b.allFields || b.fields || [])
          .map(function (f) {
            return f.label + ":\n" + (value(bid + "." + uid + "." + f.key).trim() || "[No response]");
          })
          .join("\n\n");
        items.push({ label: "Option: " + optionName(bid, uid), answer: text, note: null, missing: "" });
      });
    });
    return items;
  }

  function incompleteText(model) {
    return model.missingCount ? "Incomplete: " + model.missingCount + " required " + (model.missingCount === 1 ? "answer was" : "answers were") + " missing when this was saved." : null;
  }

  function renderReportInto(container, model) {
    container.textContent = "";
    container.appendChild(el("h3", { text: model.title }));
    var meta = el("dl", null, [
      el("dt", { text: "Case" }),
      el("dd", { text: model.caseTitle + " (version " + model.version + ")" + (model.part ? ", " + model.part : "") }),
      el("dt", { text: "Team" }),
      el("dd", { text: model.team || "Not given" }),
      el("dt", { text: "Members" }),
      el("dd", { text: model.members || "Not given" }),
      el("dt", { text: "Prepared" }),
      el("dd", { text: model.date }),
    ]);
    container.appendChild(meta);
    if (incompleteText(model)) container.appendChild(el("p", { className: "answer missing", text: incompleteText(model) }));
    model.sections.forEach(function (sec) {
      container.appendChild(el("h3", { text: sec.title }));
      sec.items.forEach(function (item) {
        container.appendChild(el("h4", { text: item.label }));
        if (item.note) container.appendChild(el("p", { className: "muted", text: item.note }));
        container.appendChild(el("p", { className: "answer" + (item.answer ? "" : " missing"), text: item.answer || item.missing }));
      });
    });
  }

  function escapeHTML(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function reportDocument(model) {
    var out = [];
    out.push('<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">');
    out.push("<title>" + escapeHTML(model.title + ": " + model.caseTitle) + "</title>");
    out.push(
      "<style>body{font-family:system-ui,'Segoe UI',Arial,sans-serif;line-height:1.5;color:#17212b;max-width:46rem;margin:2rem auto;padding:0 1rem}" +
        ".letterhead{border-top:6px solid #10384c;border-bottom:2px solid #10384c;padding:12px 0;margin-bottom:16px}.letterhead p{margin:0;font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;color:#0f6e6e;font-weight:700}" +
        "h1{font-size:1.5rem;margin:4px 0 0}h2{font-size:.9rem;letter-spacing:.08em;text-transform:uppercase;color:#10384c;margin-top:2rem;border-bottom:1px solid #b9cfd8;padding-bottom:4px}h3{font-size:1rem;margin:1.25rem 0 .25rem}" +
        "dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;background:#eef4f6;padding:12px 16px;border-radius:4px}dt{font-weight:700;font-size:.85rem;text-transform:uppercase;letter-spacing:.05em;color:#10384c}dd{margin:0}" +
        ".answer{white-space:pre-wrap;margin:0}.missing{font-style:italic;color:#7a4b00}.note{color:#4b5563;font-size:.9rem;margin:0}</style>\n</head>\n<body>"
    );
    out.push('<header class="letterhead"><p>ETHOS · Clinical Ethics Committee</p><h1>' + escapeHTML(model.title) + "</h1></header>");
    out.push("<dl><dt>Case</dt><dd>" + escapeHTML(model.caseTitle + " (version " + model.version + ")" + (model.part ? ", " + model.part : "")) + "</dd>");
    out.push("<dt>Team</dt><dd>" + escapeHTML(model.team || "Not given") + "</dd>");
    out.push("<dt>Members</dt><dd>" + escapeHTML(model.members || "Not given") + "</dd>");
    out.push("<dt>Prepared</dt><dd>" + escapeHTML(model.date) + "</dd></dl>");
    if (incompleteText(model)) out.push('<p class="answer missing">' + escapeHTML(incompleteText(model)) + "</p>");
    model.sections.forEach(function (sec) {
      out.push("<h2>" + escapeHTML(sec.title) + "</h2>");
      sec.items.forEach(function (item) {
        out.push("<h3>" + escapeHTML(item.label) + "</h3>");
        if (item.note) out.push('<p class="note">' + escapeHTML(item.note) + "</p>");
        out.push('<p class="answer' + (item.answer ? "" : " missing") + '">' + escapeHTML(item.answer || item.missing) + "</p>");
      });
    });
    out.push("</body>\n</html>\n");
    return out.join("\n");
  }

  function renderReport() {
    var config = CASE.report;
    var finalPart = !PART || PART.last;
    var pe = (PART && PART.end) || {};
    main.appendChild(el("p", { className: "stage-label", text: finalPart ? "Report" : PART.label + " record" }));
    main.appendChild(el("h2", { text: finalPart ? config.heading || "Review and download your report" : pe.heading || "Save your " + PART.label + " record" }));
    paragraphs(finalPart ? config.intro : pe.paragraphs, "lead").forEach(function (n) {
      main.appendChild(n);
    });

    var missing = allMissing();
    if (missing.length) {
      main.appendChild(
        el("div", { className: "callout attention" }, [
          el("p", { className: "callout-label", text: missing.length + " required " + (missing.length === 1 ? "answer is" : "answers are") + " missing" }),
          el("p", { text: "You can still download your record, but it will show these as missing." }),
          el(
            "ul",
            null,
            missing.map(function (m) {
              var p = PROMPTS[m.id];
              return el("li", null, [
                el("button", {
                  type: "button",
                  className: "link-button",
                  text: m.section.title + ": " + (p.shortLabel || p.label),
                  onclick: function () {
                    goToPrompt(m.section, m.id);
                  },
                }),
              ]);
            })
          ),
        ])
      );
    } else {
      main.appendChild(el("p", { className: "status-message ok", text: "Every required answer is complete." }));
    }

    var wrapper = el("section", { className: "print-target" });
    var nodes = [];
    nodes.push(el("h3", { text: finalPart ? "Your report" : pe.reportHeading || "Your record" }));
    if (!finalPart && pe.reportIntro) nodes.push(el("p", { text: pe.reportIntro }));
    ["team.name", "team.members"].forEach(function (id) {
      if (PROMPTS[id]) nodes.push(renderPrompt(id));
    });
    var preview = el("div", { className: "report-preview", id: "report-preview", tabindex: "0", role: "region", "aria-label": "Report preview" });
    var status = el("p", { className: "status-message", role: "status" });
    function refresh() {
      renderReportInto(preview, reportModel(config));
    }
    refresh();
    var download = el("button", {
      type: "button",
      className: "btn",
      text: (!finalPart && pe.downloadLabel) || config.downloadLabel || "Download report",
      onclick: function () {
        refresh();
        try {
          saveBlob(new Blob([reportDocument(reportModel(config))], { type: "text/html;charset=utf-8" }), config.filename);
          status.className = "status-message ok";
          status.textContent = "Report downloaded as " + config.filename + ". Check your downloads folder. If nothing downloaded, use Print or save as PDF.";
        } catch (e) {
          status.className = "status-message fail";
          status.textContent = "The download did not work in this browser. Use Print or save as PDF instead.";
        }
      },
    });
    var print = el("button", {
      type: "button",
      className: "btn secondary",
      text: "Print or save as PDF",
      onclick: function () {
        refresh();
        window.print();
      },
    });
    nodes.push(el("div", { className: "actions" }, [download, print]));
    nodes.push(status);
    nodes.push(preview);
    nodes.forEach(function (n) {
      wrapper.appendChild(n);
    });
    // Keep the preview current when team fields change.
    wrapper.addEventListener("input", refresh);
    main.appendChild(wrapper);
  }

  function saveBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = el("a", { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  // ---------- Export to Word (header button, on every page) ----------

  var exportStatus = document.getElementById("export-status");
  var exportTimer = null;

  function exportWord() {
    var config = CASE.report;
    var name = config.filename.replace(/\.html?$/i, "") + ".docx";
    var ok = true;
    try {
      saveBlob(window.EthosDocx.build(reportModel(config)), name);
    } catch (e) {
      ok = false;
    }
    var missing = allMissing().length;
    var msg = ok
      ? "Saved " + name + " with everything entered so far" + (missing ? " (" + missing + " required " + (missing === 1 ? "answer" : "answers") + " still to write)" : "") + ". Check your downloads folder."
      : "The Word export did not work in this browser. Use Download report or Print on the report page instead.";
    exportStatus.textContent = msg;
    exportStatus.className = "export-status show" + (ok ? "" : " fail");
    window.clearTimeout(exportTimer);
    exportTimer = window.setTimeout(function () {
      exportStatus.className = "export-status";
      exportStatus.textContent = "";
    }, 8000);
  }

  document.getElementById("export-word").addEventListener("click", exportWord);

  // The header stays on screen; keep the navigation column and scrolled-to fields clear of it.
  var header = document.querySelector(".case-header");
  function measureHeader() {
    document.documentElement.style.setProperty("--header-h", header.offsetHeight + "px");
  }
  measureHeader();
  if (window.ResizeObserver) new ResizeObserver(measureHeader).observe(header);
  else window.addEventListener("resize", measureHeader);

  // ---------- Page views ----------

  function render() {
    // A saved case-file view from before the case moved to a folder opens the overview.
    if (FOLDER && inCaseFile(currentView())) state.position[POSITION] = "start";
    var view = currentView();
    syncOptionPrompts();
    // Opening an item marks it before the navigation column counts it.
    if (view.indexOf("item:") === 0 && ITEMS[view.slice(5)] && !state.opened[view.slice(5)]) {
      state.opened[view.slice(5)] = true;
      save();
    }
    main.textContent = "";
    main.className = "panel view-" + (view.indexOf("item:") === 0 ? "item" : view.indexOf("ws:") === 0 ? "step" : view === "file" || view === "report" ? view : "start");
    shownPerspectives = [];
    renderNav();
    if (folder) updateFolderButton();
    if (view === "file") return renderFile();
    if (view === "report") return renderReport();
    if (view.indexOf("item:") === 0 && ITEMS[view.slice(5)]) return renderItem(view.slice(5));
    if (view.indexOf("ws:") === 0 && sectionIndex(view.slice(3)) !== -1) return renderSection(SECTIONS[sectionIndex(view.slice(3))]);
    renderStart();
  }

  function renderStart() {
    var s = CASE.start;
    var resume = state.position[POSITION + ":last"];
    var jacket = el("div", { className: "jacket" }, [
      el("p", { className: "jacket-tab", text: PART ? "Case file · " + PART.label : "Case file" }),
      el("p", { className: "stamp", text: "For committee review" }),
      el("p", { className: "stage-label", text: PART ? PART.label : "Consultation" }),
      el("h2", { text: s.heading }),
      el("p", { className: "lead", text: s.lead }),
    ]);
    main.appendChild(jacket);
    var buttons = [];
    if (resume) {
      buttons.push(
        el("button", {
          type: "button",
          className: "btn start",
          text: "Continue where you left off",
          onclick: function () {
            go(resume);
          },
        })
      );
    }
    if (FOLDER) {
      // The steps are the way through; the case file is always one click away.
      var first = SECTIONS[0];
      buttons.push(
        el("button", {
          type: "button",
          className: resume ? "btn secondary" : "btn start",
          text: s.startLabel || "Begin with Step " + outlineNumber(first.id) + ": " + first.title,
          onclick: function () {
            go("ws:" + first.id);
          },
        })
      );
      buttons.push(
        el("button", {
          type: "button",
          className: "btn secondary",
          "aria-haspopup": "dialog",
          text: "Open the case file",
          onclick: function () {
            openFolder();
          },
        })
      );
    } else {
      buttons.push(
        el("button", {
          type: "button",
          className: resume ? "btn secondary" : "btn start",
          text: s.startLabel || "Open the case file",
          onclick: function () {
            go("file");
          },
        })
      );
    }
    jacket.appendChild(el("div", { className: "actions start-actions" }, buttons));
    if (versionNotice) {
      main.appendChild(
        el("div", { className: "callout attention" }, [
          el("p", { className: "callout-label", text: "Saved answers from an earlier version" }),
          el("p", {
            text:
              "This browser has answers saved from version " +
              versionNotice +
              " of this case. They have been kept. Check them as you go. To start fresh instead, use “Clear my saved answers” at the bottom of the page.",
          }),
        ])
      );
    }
    if (CASE.versionNote) main.appendChild(el("div", { className: "callout attention" }, [el("p", { className: "callout-label", text: "Draft" }), el("p", { text: CASE.versionNote })]));
    (s.sections || []).forEach(function (sec) {
      main.appendChild(el("h3", { text: sec.heading }));
      paragraphs(sec.paragraphs).forEach(function (n) {
        main.appendChild(n);
      });
      if (sec.items) main.appendChild(bullets(sec.items));
    });
    if (!storageOK) {
      main.appendChild(el("div", { className: "callout attention" }, [el("p", { text: "This browser is not saving answers (for example, in some private windows). Work through the case without reloading, and download your record before you close the page." })]));
    }
  }

  function renderSection(section) {
    var i = sectionIndex(section.id);
    main.appendChild(el("p", { className: "stage-label", text: (STEPS ? "Step " : "Worksheet · Section ") + outlineNumber(section.id) + " of " + STEP_COUNT }));
    main.appendChild(el("h2", { text: section.title }));
    paragraphs(section.introduction, "lead").forEach(function (n) {
      main.appendChild(n);
    });
    section.blocks.forEach(function (b) {
      var node = renderBlock(b);
      if (node) main.appendChild(node);
    });
    var next = SECTIONS[i + 1];
    var buttons = [];
    buttons.push(
      el("button", {
        type: "button",
        className: "btn",
        text: next ? "Next: " + next.title : PART && !PART.last ? "Save your " + PART.label + " record" : "Review and download your report",
        onclick: function () {
          go(next ? "ws:" + next.id : "report");
        },
      })
    );
    buttons.push(
      el("button", {
        type: "button",
        className: "btn secondary",
        "aria-haspopup": FOLDER ? "dialog" : null,
        text: FOLDER ? "Open the case file" : "Back to the case file",
        onclick: function () {
          go("file");
        },
      })
    );
    main.appendChild(el("div", { className: "actions" }, buttons));
  }

  // ---------- Footer: clear saved answers ----------

  document.getElementById("clear-saved").addEventListener("click", function () {
    var ok = window.confirm(
      "Clear every saved answer for this case from this browser, including answers from other parts of the case? Download your record first if you need it. This cannot be undone."
    );
    if (!ok) return;
    clearSaved();
    go("start");
    announce("Saved answers cleared.");
  });

  render();
})();
