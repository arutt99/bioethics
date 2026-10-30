// Builds the activity library from data/activities.json.
// All text is inserted with textContent, never as HTML.
(function () {
  "use strict";

  var SETTINGS_URL = "data/activities.json";

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function showMessage(text, isError) {
    var library = document.getElementById("library");
    library.replaceChildren();
    var box = el("div", "message" + (isError ? " message-error" : ""));
    box.setAttribute("role", isError ? "alert" : "status");
    box.appendChild(el("p", null, text));
    library.appendChild(box);
  }

  function groupLabel(activity) {
    if (activity.week) return "Week " + activity.week;
    if (activity.topic) return activity.topic;
    return "Cases";
  }

  function metaText(activity) {
    var parts = [];
    if (activity.week && activity.topic) parts.push(activity.topic);
    if (activity.durationMinutes) parts.push("About " + activity.durationMinutes + " minutes");
    return parts.join(" · ");
  }

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  // Each case is a manila folder; its tab carries its place on the docket.
  function buildCard(activity, number) {
    var item = el("li");
    var card = el("article", "card");
    var tab = el("p", "folder-tab", "No. " + pad(number));
    tab.setAttribute("aria-hidden", "true");
    card.appendChild(tab);
    var headingId = "activity-" + activity.id;
    card.setAttribute("aria-labelledby", headingId);

    var heading = el("h3", null, activity.title);
    heading.id = headingId;
    card.appendChild(heading);

    var meta = metaText(activity);
    if (meta) card.appendChild(el("p", "card-meta", meta));
    if (activity.description) card.appendChild(el("p", "card-desc", activity.description));
    else card.appendChild(el("p", "card-desc"));

    var footer = el("div", "card-footer");
    if (activity.status === "available") {
      var link = el("a", "button", "Open case");
      link.href = activity.path;
      link.setAttribute("aria-label", "Open case: " + activity.title);
      footer.appendChild(link);
      footer.appendChild(el("span", "stamp stamp-open", "Access code required"));
    } else {
      footer.appendChild(el("span", "stamp stamp-soon", "Coming soon"));
    }
    card.appendChild(footer);
    item.appendChild(card);
    return item;
  }

  function render(data, activities) {
    document.getElementById("course-title").textContent = data.courseTitle;
    document.title = data.courseTitle;
    document.getElementById("course-description").textContent = data.courseDescription || "";

    var visible = activities
      .filter(function (a) {
        return a.status !== "hidden";
      })
      .sort(function (a, b) {
        return a.order - b.order;
      });

    var library = document.getElementById("library");
    library.replaceChildren();
    var numbers = {};
    visible.forEach(function (a, i) {
      numbers[a.id] = i + 1;
    });

    if (!visible.length) {
      showMessage("No cases are on the docket yet. Check back later.", false);
      return;
    }

    // Groups appear in the order of their first activity.
    var groups = [];
    var byLabel = {};
    visible.forEach(function (a) {
      var label = groupLabel(a);
      if (!byLabel[label]) {
        byLabel[label] = [];
        groups.push(label);
      }
      byLabel[label].push(a);
    });

    groups.forEach(function (label, index) {
      var section = el("section", "group");
      var headingId = "group-" + index;
      section.setAttribute("aria-labelledby", headingId);
      var heading = el("h2", null, label);
      heading.id = headingId;
      section.appendChild(heading);
      var list = el("ul", "grid");
      byLabel[label].forEach(function (a) {
        list.appendChild(buildCard(a, numbers[a.id]));
      });
      section.appendChild(list);
      library.appendChild(section);
    });
  }

  function load() {
    fetch(SETTINGS_URL, { cache: "no-cache" })
      .then(function (response) {
        if (!response.ok) throw new Error("missing");
        return response.json().catch(function () {
          throw new Error("malformed");
        });
      })
      .then(function (data) {
        var result = window.EthosValidate.validateSettings(data);
        if (result.errors.length) {
          // Keep problems visible to the instructor in the console; students still see valid entries.
          console.warn("activities.json problems:\n" + result.errors.join("\n"));
        }
        if (!data || typeof data !== "object" || !Array.isArray(data.activities)) {
          throw new Error("malformed");
        }
        if (typeof data.courseTitle !== "string" || !data.courseTitle.trim()) {
          data.courseTitle = "ETHOS Bioethics Activities";
        }
        render(data, result.activities);
      })
      .catch(function (err) {
        var text =
          err && err.message === "malformed"
            ? "The list of cases could not be read because the settings file is not valid. Please let your instructor know."
            : "The list of cases could not be loaded. Check your connection and reload the page. If the problem continues, please let your instructor know.";
        showMessage(text, true);
      });
  }

  load();
})();
