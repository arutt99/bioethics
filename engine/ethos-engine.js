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

  var KINDS = [
    { id: "record", heading: "Records and documents", label: "Record" },
    { id: "person", heading: "People involved", label: "Person" },
    { id: "background", heading: "Medical background", label: "Medical background" },
    { id: "policy", heading: "Policies, codes and law", label: "Policy" },
  ];
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

  function isRequired(p) {
    if (p.requiredIf) return value(p.requiredIf.prompt) === p.requiredIf.equals;
    return !!p.required;
  }

  // Prompts a section asks for, including restatements of earlier-part answers
  // that this browser does not have.
  function sectionPrompts(section) {
    var ids = [];
    section.blocks.forEach(function (b) {
      if (b.type === "prompts") ids = ids.concat(b.ids);
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
    if (!ids.length) return null;
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
        onclick: function () {
          go(view);
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
    var top = el("ul", null, [
      el("li", null, [navButton("start", "•", "Overview", null, view === "start")]),
      el("li", null, [
        navButton("file", "•", "Case file", openedCount + " of " + ITEM_ORDER.length + " items opened", view === "file" || view.indexOf("item:") === 0),
      ]),
    ]);
    nav.appendChild(top);

    nav.appendChild(el("h3", { text: "Worksheet" }));
    var list = el("ol");
    CASE.outline.forEach(function (o) {
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
          className: "tile" + (read ? " read" : ""),
          onclick: function () {
            go("item:" + id);
          },
        },
        [
          el("span", { className: "tile-num", text: String(it.number), "aria-hidden": "true" }),
          el("span", { className: "tile-body" }, [
            el("span", { className: "tile-kind", text: meta }),
            el("span", { className: "tile-title" }, [el("span", { className: "visually-hidden", text: "Item " + it.number + ": " }), it.title]),
            it.summary ? el("span", { className: "tile-summary", text: it.summary }) : null,
            el("span", { className: "tile-status" }, [
              it.isNew ? el("span", { className: "tag new", text: "New" }) : null,
              el("span", { text: read ? "Opened" : "Not opened yet" }),
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
    main.appendChild(el("p", { className: "stage-label", text: "Case file" }));
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

  function renderItem(id) {
    var it = ITEMS[id];
    var k = kind(it.kind);
    main.appendChild(el("p", { className: "stage-label", text: "Case file · Item " + it.number + " · " + k.label + (it.isNew ? " · New" : "") }));
    main.appendChild(el("h2", { text: it.title }));
    if (it.role) main.appendChild(el("p", { className: "role", text: it.role }));
    if (it.source) main.appendChild(el("p", { className: "source", text: it.source }));
    if (it.kind === "background") {
      main.appendChild(
        el("p", {
          className: "muted",
          text: "Plain-language background to help you follow the case. It is simplified, and it is not medical advice.",
        })
      );
    }
    paragraphs(it.introduction, "lead").forEach(function (n) {
      main.appendChild(n);
    });
    (it.sections || []).forEach(function (sec) {
      var nodes = [sec.heading ? el("h3", { text: sec.heading }) : null].concat(paragraphs(sec.paragraphs));
      if (sec.items) nodes.push(bullets(sec.items));
      if (sec.rows) nodes.push(recordTable(sec.rows));
      if (sec.quote) nodes.push(el("blockquote", null, paragraphs(sec.quote).concat(sec.quoteSource ? [el("p", { className: "source", text: sec.quoteSource })] : [])));
      main.appendChild(el("section", null, nodes));
    });
    if (it.questions && it.questions.length) {
      main.appendChild(el("h3", { text: it.questionsHeading || "Questions you can ask" }));
      main.appendChild(
        el(
          "div",
          null,
          it.questions.map(function (q) {
            return disclosure(q.question, paragraphs(q.answer), "h4");
          })
        )
      );
    }
    if (it.limits) {
      main.appendChild(el("div", { className: "callout attention" }, [el("p", { className: "callout-label", text: "What this can’t tell you" })].concat(paragraphs(it.limits))));
    }
    if (PROMPTS["notes." + id]) main.appendChild(renderPrompt("notes." + id));

    var pos = ITEM_ORDER.indexOf(id);
    var nextId = ITEM_ORDER[pos + 1];
    var buttons = [
      el("button", {
        type: "button",
        className: "btn",
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
        return renderPerspectives(block);
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
    function body(opt) {
      var v = CASE.perspectives[opt.id];
      if (!v) return [el("p", { text: "No notes for this option." })];
      return [el("h5", { text: "What it takes seriously" }), bullets(v.addresses), el("h5", { text: "What it leaves open or costs" }), bullets(v.leavesOpen)];
    }
    nodes.push(el("div", { className: "card" }, [el("h4", { text: "Your recommendation: " + mine.title })].concat(body(mine))));
    nodes.push(el("h4", { text: "The other options" }));
    opts.forEach(function (opt) {
      if (opt.id === mine.id) return;
      nodes.push(disclosure(opt.title, body(opt)));
    });
    return el("section", null, nodes);
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
      if (p.type === "choice") refreshDependents(id);
      renderNav();
    }

    if (p.type === "choice") {
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
    }
  }

  // ---------- Report ----------

  function reportModel(config) {
    // Answers from an earlier part are missing as a whole when that part was done on another device.
    var haveEarlier = config.sections.some(function (sec) {
      return (
        sec.earlier &&
        sec.ids.some(function (id) {
          return PROMPTS[id] && value(id);
        })
      );
    });
    var sections = config.sections.map(function (sec) {
      return {
        title: sec.title,
        items: sec.ids
          .filter(function (id) {
            // Skip conditional prompts that did not apply.
            return PROMPTS[id] && (value(id) || !PROMPTS[id].requiredIf || isRequired(PROMPTS[id]));
          })
          .map(function (id) {
            var p = PROMPTS[id];
            return {
              label: p.shortLabel || p.label,
              answer: describeAnswer(id),
              note: state.restated[id] ? "Restated at the start of " + (PART ? PART.label : "this part") + " because the earlier answer was not on this device." : null,
              missing: sec.earlier && !haveEarlier ? "[Not on this device. See your record from the earlier part.]" : "[No response]",
            };
          }),
      };
    });
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
        "h1{font-size:1.5rem}h2{font-size:1.2rem;margin-top:2rem;border-bottom:1px solid #d1d8e0;padding-bottom:4px}h3{font-size:1rem;margin:1.25rem 0 .25rem}" +
        ".answer{white-space:pre-wrap;margin:0}.missing{font-style:italic;color:#7a4b00}.note{color:#4b5563;font-size:.9rem;margin:0}dt{font-weight:600}dd{margin:0 0 .5rem}</style>\n</head>\n<body>"
    );
    out.push("<h1>" + escapeHTML(model.title) + "</h1>");
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
          var blob = new Blob([reportDocument(reportModel(config))], { type: "text/html;charset=utf-8" });
          var url = URL.createObjectURL(blob);
          var a = el("a", { href: url, download: config.filename });
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.setTimeout(function () {
            URL.revokeObjectURL(url);
          }, 1000);
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

  // ---------- Page views ----------

  function render() {
    var view = currentView();
    // Opening an item marks it before the navigation column counts it.
    if (view.indexOf("item:") === 0 && ITEMS[view.slice(5)] && !state.opened[view.slice(5)]) {
      state.opened[view.slice(5)] = true;
      save();
    }
    main.textContent = "";
    renderNav();
    if (view === "file") return renderFile();
    if (view === "report") return renderReport();
    if (view.indexOf("item:") === 0 && ITEMS[view.slice(5)]) return renderItem(view.slice(5));
    if (view.indexOf("ws:") === 0 && sectionIndex(view.slice(3)) !== -1) return renderSection(SECTIONS[sectionIndex(view.slice(3))]);
    renderStart();
  }

  function renderStart() {
    var s = CASE.start;
    var resume = state.position[POSITION + ":last"];
    main.appendChild(el("p", { className: "stage-label", text: PART ? PART.label : "Consultation" }));
    main.appendChild(el("h2", { text: s.heading }));
    main.appendChild(el("p", { className: "lead", text: s.lead }));
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
    main.appendChild(el("div", { className: "actions start-actions" }, buttons));
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
    main.appendChild(el("p", { className: "stage-label", text: "Worksheet · Section " + outlineNumber(section.id) + " of " + CASE.outline.length }));
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
        text: "Back to the case file",
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
