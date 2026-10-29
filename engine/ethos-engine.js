/*
 * ETHOS consultation engine.
 *
 * Renders one case (or one part of a case) from the JSON in
 * <script id="ethos-case" type="application/json">. Case text is always
 * inserted with textContent, never as HTML. See engine/README.md for the
 * case format.
 */
(function () {
  "use strict";

  var CASE = JSON.parse(document.getElementById("ethos-case").textContent);
  var PART = CASE.part; // the part this file contains, or null for a single-file case
  var STAGES = CASE.stages;
  var PROMPTS = CASE.prompts;
  var STORAGE_KEY = "ethos:" + CASE.id + ":schema" + CASE.schemaVersion;
  var POSITION = PART ? PART.id : "single";

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
      completed: {},
      visited: {},
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

  function announce(msg) {
    liveRegion.textContent = "";
    window.setTimeout(function () {
      liveRegion.textContent = msg;
    }, 50);
  }

  var uid = 0;
  function disclosure(title, bodyNodes, onOpen, headingTag) {
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
        if (open && onOpen) onOpen();
      },
    });
    return el("div", { className: "disclosure" }, [el(headingTag || "h5", null, [btn]), body]);
  }

  // ---------- Stage logic ----------

  function stageIndex(id) {
    for (var i = 0; i < STAGES.length; i++) if (STAGES[i].id === id) return i;
    return -1;
  }

  function isRequired(p) {
    if (p.requiredIf) return value(p.requiredIf.prompt) === p.requiredIf.equals;
    return !!p.required;
  }

  // Prompts a stage asks for, including restatements of earlier-part answers
  // that this browser does not have.
  function stagePrompts(stage) {
    var ids = [];
    stage.blocks.forEach(function (b) {
      if (b.type === "prompts") ids = ids.concat(b.ids);
      if (b.type === "carryForward") {
        b.ids.forEach(function (id) {
          if (!value(id) || state.restated[id]) ids.push(id);
        });
      }
      if (b.type === "report" && b.teamFields) ids = ids.concat(b.teamFields);
    });
    return ids;
  }

  function stakeholderIds(stage) {
    var ids = [];
    stage.blocks.forEach(function (b) {
      if (b.type === "stakeholders" && b.requireAll) ids = ids.concat(b.ids);
    });
    return ids;
  }

  function problems(stage) {
    var out = [];
    stakeholderIds(stage).forEach(function (sid) {
      if (!state.visited[sid]) {
        var s = CASE.stakeholders[sid];
        out.push({ id: "stakeholder-" + sid, message: "Open at least one question in the interview with " + s.name + "." });
      }
    });
    stagePrompts(stage).forEach(function (id) {
      var p = PROMPTS[id];
      if (p && isRequired(p) && !value(id).trim()) {
        out.push({ id: id, message: p.errorText || (p.type === "choice" ? "Choose an option: " : "Write a response: ") + p.label });
      }
    });
    return out;
  }

  function canOpen(i) {
    if (i <= 0) return true;
    return !!state.completed[STAGES[i - 1].id] && canOpen(i - 1);
  }

  function currentView() {
    return state.position[POSITION] || "start";
  }

  function go(view) {
    state.position[POSITION] = view;
    save();
    render();
    var heading = main.querySelector("h2");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus();
    }
    window.scrollTo(0, 0);
  }

  // ---------- Navigation column ----------

  function renderNav() {
    nav.textContent = "";
    var view = currentView();
    var list = el("ol");
    CASE.outline.forEach(function (o) {
      var i = stageIndex(o.id);
      var done = !!state.completed[o.id];
      var status;
      var node;
      var label = [el("span", { className: "num", text: String(o.number), "aria-hidden": "true" })];
      if (i === -1) {
        status = o.part && PART && o.partOrder < PART.order ? "Completed in " + o.partLabel : o.partLabel + ": opens with a new code";
        label.push(el("span", null, ["Stage " + o.number + ": " + o.title, el("span", { className: "status", text: status })]));
        node = el("div", { className: "step locked" }, label);
      } else {
        var current = view === o.id;
        var open = canOpen(i);
        status = current ? "Current stage" : done ? "Completed" : open ? "Available" : "Not started";
        label.push(el("span", null, ["Stage " + o.number + ": " + o.title, el("span", { className: "status", text: status })]));
        if (open) {
          node = el(
            "button",
            {
              type: "button",
              className: "step" + (done ? " done" : ""),
              "aria-current": current ? "step" : null,
              onclick: function () {
                go(o.id);
              },
            },
            label
          );
        } else {
          node = el("div", { className: "step locked" + (done ? " done" : "") }, label);
        }
      }
      list.appendChild(el("li", null, [node]));
    });
    nav.appendChild(el("h2", { text: "Consultation stages" }));
    nav.appendChild(list);
    nav.appendChild(
      el("p", {
        className: "save-note",
        text: storageOK
          ? "Your answers are saved in this browser on this device as you type."
          : "This browser is not saving your answers. Do not reload the page, and download your record before you leave.",
      })
    );
  }

  // ---------- Blocks ----------

  function renderBlock(block, stage) {
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
        return el("section", null, [
          block.heading ? el("h3", { text: block.heading }) : null,
          block.intro ? el("p", { text: block.intro }) : null,
          el(
            block.ordered ? "ol" : "ul",
            null,
            block.items.map(function (t) {
              return el("li", { text: t });
            })
          ),
        ]);
      case "quote":
        return el("section", null, [
          block.heading ? el("h3", { text: block.heading }) : null,
          el("blockquote", null, paragraphs(block.paragraphs).concat(block.source ? [el("p", { className: "source", text: block.source })] : [])),
        ]);
      case "record":
        return el("section", null, [
          block.heading ? el("h3", { text: block.heading }) : null,
          block.intro ? el("p", { text: block.intro }) : null,
          el("table", { className: "record" }, [
            el(
              "tbody",
              null,
              block.rows.map(function (r) {
                return el("tr", null, [el("th", { scope: "row", text: r[0] }), el("td", { text: r[1] })]);
              })
            ),
          ]),
        ]);
      case "stakeholders":
        return renderStakeholders(block);
      case "evidence":
        return renderEvidence(block);
      case "concepts":
        return el("section", null, [
          el("h3", { text: block.heading }),
          block.intro ? el("p", { text: block.intro }) : null,
          el(
            "div",
            null,
            block.items.map(function (c) {
              return disclosure(c.title, paragraphs(c.paragraphs), null, "h4");
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
      case "report":
        return renderReportBlock(block);
      default:
        return null;
    }
  }

  function renderStakeholders(block) {
    var cards = block.ids.map(function (sid) {
      var s = CASE.stakeholders[sid];
      var tag = el("span", { className: "tag " + (state.visited[sid] ? "done" : "todo"), text: state.visited[sid] ? "Interviewed" : "Not yet interviewed" });
      var noteId = "notes." + sid;
      var questions = s.questions.map(function (q) {
        return disclosure(q.question, paragraphs(q.answer), function () {
          if (!state.visited[sid]) {
            state.visited[sid] = true;
            save();
            tag.className = "tag done";
            tag.textContent = "Interviewed";
            renderNav();
          }
        });
      });
      return el("article", { className: "card", id: "stakeholder-" + sid, tabindex: "-1" }, [
        el("h4", null, [s.name, tag]),
        el("p", { className: "role", text: s.role }),
      ]
        .concat(paragraphs(s.introduction))
        .concat(questions)
        .concat(PROMPTS[noteId] ? [renderPrompt(noteId)] : []));
    });
    return el("section", null, [block.heading ? el("h3", { text: block.heading }) : null, block.intro ? el("p", { text: block.intro }) : null, el("div", { className: "cards" }, cards)]);
  }

  function renderEvidence(block) {
    return el(
      "section",
      null,
      [block.heading ? el("h3", { text: block.heading }) : null].concat(
        block.ids.map(function (eid) {
          var e = CASE.evidence[eid];
          state.visited["evidence:" + eid] = true;
          var parts = [el("h4", { text: e.title }), el("p", { className: "source", text: e.source })].concat(paragraphs(e.content));
          if (e.points) {
            parts.push(
              el(
                "ul",
                null,
                e.points.map(function (t) {
                  return el("li", { text: t });
                })
              )
            );
          }
          parts = parts.concat(paragraphs(e.after));
          if (e.limits) parts.push(el("div", { className: "callout attention" }, [el("p", { className: "callout-label", text: "Limits of this evidence" })].concat(paragraphs(e.limits))));
          return el("article", { className: "card evidence-card" }, parts);
        })
      )
    );
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
    var nodes = [el("h3", { text: block.heading })].concat(paragraphs(block.intro));
    function body(opt) {
      var v = CASE.perspectives[opt.id];
      if (!v) return [el("p", { text: "No notes for this option." })];
      return [
        el("h5", { text: "What it takes seriously" }),
        el(
          "ul",
          null,
          v.addresses.map(function (t) {
            return el("li", { text: t });
          })
        ),
        el("h5", { text: "What it leaves open or costs" }),
        el(
          "ul",
          null,
          v.leavesOpen.map(function (t) {
            return el("li", { text: t });
          })
        ),
      ];
    }
    var mine = optionById(p, chosen);
    if (mine) {
      nodes.push(el("div", { className: "card" }, [el("h4", { text: "Your recommendation: " + mine.title })].concat(body(mine))));
    }
    nodes.push(el("h4", { text: mine ? "The other options" : "The options" }));
    opts.forEach(function (opt) {
      if (mine && opt.id === mine.id) return;
      nodes.push(disclosure(opt.title, body(opt)));
    });
    return el("section", null, nodes);
  }

  // ---------- Prompts ----------

  function fieldError(field, message) {
    var errId = field.getAttribute("data-prompt") + "-error";
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
      if (field.querySelector(".help")) described.push(field.getAttribute("data-prompt") + "-help");
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
    var help = p.help ? el("p", { className: "help", id: id + "-help", text: p.help }) : null;
    var field = el("div", { className: "field", "data-prompt": id });

    function onChange(v) {
      state.responses[id] = v;
      if (restating) state.restated[id] = true;
      save();
      if (field.classList.contains("invalid") && v.trim()) fieldError(field, null);
      if (p.type === "choice") refreshDependents(id);
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
      var input2 =
        p.type === "text"
          ? el("input", { type: "text", id: fid, autocomplete: "off" })
          : el("textarea", { id: fid, rows: String(p.rows || 5) });
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
      target.setAttribute("aria-describedby", id + "-help");
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

  function showProblems(list) {
    var old = main.querySelector(".error-summary");
    if (old) old.remove();
    var fields = main.querySelectorAll(".field[data-prompt]");
    for (var i = 0; i < fields.length; i++) fieldError(fields[i], null);
    if (!list.length) return;
    var summary = el("div", { className: "error-summary", tabindex: "-1", role: "group", "aria-labelledby": "error-summary-title" }, [
      el("h3", { id: "error-summary-title", text: "Before you continue, complete " + (list.length === 1 ? "this item" : "these " + list.length + " items") + ":" }),
      el(
        "ul",
        null,
        list.map(function (pr) {
          return el("li", null, [
            el("button", {
              type: "button",
              className: "link-button",
              text: pr.message,
              onclick: function () {
                var target = document.getElementById(PROMPTS[pr.id] ? domId(pr.id) : pr.id);
                if (target) {
                  if (target.tagName === "FIELDSET") {
                    var first = target.querySelector("input");
                    (first || target).focus();
                  } else target.focus();
                  target.scrollIntoView({ block: "center" });
                }
              },
            }),
          ]);
        })
      ),
    ]);
    list.forEach(function (pr) {
      var f = main.querySelector('.field[data-prompt="' + pr.id + '"]');
      if (f) {
        f.hidden = false;
        fieldError(f, PROMPTS[pr.id].errorText || (PROMPTS[pr.id].type === "choice" ? "Choose an option." : "Write a response before you continue."));
      }
    });
    main.insertBefore(summary, stageActions());
    summary.focus();
    announce("Some required items are missing.");
  }

  function stageActions() {
    var all = main.querySelectorAll(":scope > .actions");
    return all[all.length - 1];
  }

  // ---------- Report ----------

  function reportModel(config) {
    // Answers from an earlier part are missing as a whole when that part was done on another device.
    var haveEarlier = config.sections.some(function (sec) {
      return sec.earlier && sec.ids.some(function (id) {
        return PROMPTS[id] && value(id);
      });
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
    return {
      title: config.title,
      caseTitle: CASE.title,
      version: CASE.version,
      part: PART ? PART.label : null,
      team: value("team.name"),
      members: value("team.members"),
      date: new Date().toLocaleString(),
      sections: sections,
    };
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
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function reportDocument(model) {
    var out = [];
    out.push("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">");
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

  function renderReportBlock(block) {
    var config = CASE.report;
    var wrapper = el("section", { className: "print-target" });
    var nodes = [];
    nodes.push(el("h3", { text: block.heading || "Review your report" }));
    if (block.intro) nodes.push(el("p", { text: block.intro }));
    (block.teamFields || []).forEach(function (id) {
      nodes.push(renderPrompt(id));
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
      text: block.downloadLabel || "Download report",
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
    var update = el("button", { type: "button", className: "btn secondary", text: "Refresh preview", onclick: refresh });
    nodes.push(el("div", { className: "actions" }, [download, print, update]));
    nodes.push(status);
    nodes.push(preview);
    nodes.forEach(function (n) {
      wrapper.appendChild(n);
    });
    // Keep the preview current when team fields change.
    wrapper.addEventListener("input", refresh);
    return wrapper;
  }

  // ---------- Views ----------

  function render() {
    var view = currentView();
    main.textContent = "";
    renderNav();
    if (view === "start") return renderStart();
    if (view === "part-end") return renderPartEnd();
    var i = stageIndex(view);
    if (i === -1 || !canOpen(i)) return renderStart();
    renderStage(STAGES[i], i);
  }

  function renderStart() {
    var s = CASE.start;
    var started = STAGES.some(function (st) {
      return state.completed[st.id];
    });
    var resume = STAGES[0];
    for (var i = STAGES.length - 1; i >= 0; i--) {
      if (canOpen(i)) {
        resume = STAGES[i];
        break;
      }
    }
    main.appendChild(el("p", { className: "stage-label", text: PART ? PART.label : "Consultation" }));
    main.appendChild(el("h2", { text: s.heading }));
    main.appendChild(el("p", { className: "lead", text: s.lead }));
    var startButtons = [
      el("button", {
        type: "button",
        className: "btn start",
        text: started ? "Continue where you left off" : s.startLabel,
        onclick: function () {
          go(started ? resume.id : STAGES[0].id);
        },
      }),
    ];
    if (started && resume !== STAGES[0]) {
      startButtons.push(
        el("button", {
          type: "button",
          className: "btn secondary",
          text: "Review from the first stage",
          onclick: function () {
            go(STAGES[0].id);
          },
        })
      );
    }
    main.appendChild(el("div", { className: "actions start-actions" }, startButtons));
    if (versionNotice) {
      main.appendChild(
        el("div", { className: "callout attention" }, [
          el("p", { className: "callout-label", text: "Saved answers from an earlier version" }),
          el("p", {
            text:
              "This browser has answers saved from version " +
              versionNotice +
              " of this case. They have been kept. Check them as you go. To start fresh instead, use \u201cClear my saved answers\u201d at the bottom of the page.",
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
      if (sec.items) {
        main.appendChild(
          el(
            "ul",
            null,
            sec.items.map(function (t) {
              return el("li", { text: t });
            })
          )
        );
      }
    });
    if (!storageOK) {
      main.appendChild(el("div", { className: "callout attention" }, [el("p", { text: "This browser is not saving answers (for example, in some private windows). Work through the case without reloading, and download your record before you close the page." })]));
    }
  }

  function renderStage(stage, i) {
    main.appendChild(el("p", { className: "stage-label", text: "Stage " + stage.number + " of " + CASE.outline.length }));
    main.appendChild(el("h2", { text: stage.title }));
    paragraphs(stage.introduction, "lead").forEach(function (n) {
      main.appendChild(n);
    });
    stage.blocks.forEach(function (b) {
      var node = renderBlock(b, stage);
      if (node) main.appendChild(node);
    });
    var next = STAGES[i + 1];
    var buttons = [];
    if (i > 0) {
      buttons.push(
        el("button", {
          type: "button",
          className: "btn secondary",
          text: "Back to " + STAGES[i - 1].title,
          onclick: function () {
            go(STAGES[i - 1].id);
          },
        })
      );
    }
    if (next || (PART && !PART.last)) {
      buttons.push(
        el("button", {
          type: "button",
          className: "btn",
          text: stage.nextLabel || (next ? "Continue to " + next.title : "Finish " + PART.label),
          onclick: function () {
            var list = problems(stage);
            if (list.length) return showProblems(list);
            state.completed[stage.id] = true;
            go(next ? next.id : "part-end");
          },
        })
      );
    } else {
      buttons.push(
        el("button", {
          type: "button",
          className: "btn secondary",
          text: "Check that every required item is complete",
          onclick: function () {
            var list = problems(stage);
            if (list.length) return showProblems(list);
            state.completed[stage.id] = true;
            save();
            renderNav();
            showProblems([]);
            announce("Every required item is complete. Review and download your report.");
            var flag = main.querySelector(".complete-flag");
            if (!flag) {
              flag = el("p", { className: "status-message ok complete-flag", role: "status" });
              stageActions().after(flag);
            }
            flag.textContent = "Every required item is complete. Review your report above and download it.";
          },
        })
      );
    }
    if (stage.transition) main.appendChild(el("p", { className: "muted", text: stage.transition }));
    main.appendChild(el("div", { className: "actions" }, buttons));
  }

  function renderPartEnd() {
    var pe = PART.end;
    main.appendChild(el("p", { className: "stage-label", text: PART.label + " complete" }));
    main.appendChild(el("h2", { text: pe.heading }));
    paragraphs(pe.paragraphs).forEach(function (n) {
      main.appendChild(n);
    });
    main.appendChild(renderReportBlock({ heading: pe.reportHeading, intro: pe.reportIntro, teamFields: ["team.name", "team.members"], downloadLabel: pe.downloadLabel }));
    var last = STAGES[STAGES.length - 1];
    main.appendChild(
      el("div", { className: "actions" }, [
        el("button", {
          type: "button",
          className: "btn secondary",
          text: "Back to " + last.title,
          onclick: function () {
            go(last.id);
          },
        }),
      ])
    );
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
