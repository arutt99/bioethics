// Validation rules for data/activities.json.
// Shared by the homepage (browser) and tools/validate.mjs (local check).
(function (root) {
  "use strict";

  var STATUSES = ["available", "coming-soon", "hidden"];
  var ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
  var PATH_PATTERN = /^activities\/[a-z0-9][a-z0-9-]*\.html$/;

  function isNonEmptyString(value) {
    return typeof value === "string" && value.trim() !== "";
  }

  function isOptionalPositiveInteger(value) {
    return value === null || value === undefined || (Number.isInteger(value) && value > 0);
  }

  // Returns { errors: [...], activities: [...valid entries] }.
  // Broken entries are reported and left out, so one bad entry does not blank the page.
  function validateSettings(data) {
    var errors = [];
    var valid = [];

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { errors: ["The settings file must contain a JSON object."], activities: [] };
    }
    if (!isNonEmptyString(data.courseTitle)) errors.push('"courseTitle" must be a non-empty string.');
    if (data.courseDescription !== undefined && typeof data.courseDescription !== "string") {
      errors.push('"courseDescription" must be a string.');
    }
    if (!Array.isArray(data.activities)) {
      errors.push('"activities" must be a list.');
      return { errors: errors, activities: [] };
    }

    var seenIds = {};
    data.activities.forEach(function (a, index) {
      var label = "Activity " + (index + 1) + (a && a.id ? ' ("' + a.id + '")' : "");
      var problems = [];

      if (!a || typeof a !== "object" || Array.isArray(a)) {
        errors.push(label + ": must be an object.");
        return;
      }
      if (typeof a.id !== "string" || !ID_PATTERN.test(a.id)) {
        problems.push('"id" must use lowercase letters, numbers, and hyphens.');
      } else if (seenIds[a.id]) {
        problems.push('"id" is used more than once.');
      }
      if (!isNonEmptyString(a.title)) problems.push('"title" is required.');
      if (STATUSES.indexOf(a.status) === -1) {
        problems.push('"status" must be one of: ' + STATUSES.join(", ") + ".");
      }
      if (a.topic !== undefined && a.topic !== null && typeof a.topic !== "string") {
        problems.push('"topic" must be text or null.');
      }
      if (a.description !== undefined && a.description !== null && typeof a.description !== "string") {
        problems.push('"description" must be text or null.');
      }
      if (!isOptionalPositiveInteger(a.week)) problems.push('"week" must be a whole number or null.');
      if (!isOptionalPositiveInteger(a.durationMinutes)) {
        problems.push('"durationMinutes" must be a whole number or null.');
      }
      if (typeof a.order !== "number" || !isFinite(a.order)) problems.push('"order" must be a number.');
      if (a.path !== null && a.path !== undefined && (typeof a.path !== "string" || !PATH_PATTERN.test(a.path))) {
        problems.push('"path" must look like "activities/name.html" or be null.');
      }
      if (a.status === "available" && !a.path) {
        problems.push('an "available" activity needs a "path".');
      }

      if (problems.length) {
        problems.forEach(function (p) {
          errors.push(label + ": " + p);
        });
      } else {
        seenIds[a.id] = true;
        valid.push(a);
      }
    });

    return { errors: errors, activities: valid };
  }

  var api = { validateSettings: validateSettings, STATUSES: STATUSES, PATH_PATTERN: PATH_PATTERN };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.EthosValidate = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
