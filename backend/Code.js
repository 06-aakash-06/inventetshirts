const SHEET_NAME = "Form Responses 1"; // Make sure to adjust if your sheet name is different
const ORDERS_CACHE_META_KEY = "INVENTE_ORDERS_V3_META";
const ORDERS_CACHE_CHUNK_PREFIX = "INVENTE_ORDERS_V3_CHUNK_";
const DASHBOARD_CACHE_KEY = "INVENTE_DASHBOARD_V1";
const DASHBOARD_SOURCE_ROW_KEY = "INVENTE_DASHBOARD_SOURCE_ROW_V1";
const CACHE_TIME = 300; // Sheet writes invalidate order chunks, so keep read bursts warm for five minutes.
const DASHBOARD_CACHE_TIME = 60; // Active dashboards refresh this lease; writes update the cached counters.
const CACHE_CHUNK_CHARS = 30000; // Keep every CacheService value safely below its per-value limit.
const LOCK_WAIT_MS = 30000; // Allow a busy distribution line to drain instead of failing at 10s.
const EMAIL_CLAIM_TTL_MS = 120000; // Stale email claims expire after two minutes.
const EMAIL_CLAIM_PREFIX = "INVENTE_EMAIL_CLAIM_V1_";

// ---------------------------------------------------------------------------
// Access token (optional). Set a Script Property named ACCESS_TOKEN to require
// every request to carry ?token= / body.token matching it. When the property
// is absent, the check is skipped so nothing breaks before you configure it.
// ---------------------------------------------------------------------------
function getAccessToken_() {
  return PropertiesService.getScriptProperties().getProperty("ACCESS_TOKEN") || "";
}
function checkAccess_(provided) {
  const expected = getAccessToken_();
  if (!expected) return true; // not configured yet
  return provided === expected;
}
function denied_() {
  return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Unauthorized" })).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------------
// Ticket signing. The QR code carries "INV-0042.<sig>" where <sig> is a short
// HMAC of the Order ID. A forged QR with just "INV-0043" fails verification, so
// the collection desk can tell a real ticket from a hand-made one.
// Set a Script Property named TICKET_SECRET to a long random string.
// ---------------------------------------------------------------------------
function getTicketSecret_() {
  return PropertiesService.getScriptProperties().getProperty("TICKET_SECRET") || "invente-default-secret-change-me";
}
function makeTicketToken_(orderId) {
  const raw = Utilities.computeHmacSha256Signature(orderId, getTicketSecret_());
  const sig = Utilities.base64EncodeWebSafe(raw).replace(/=+$/, "").substring(0, 16);
  return orderId + "." + sig;
}
// Returns the Order ID if the token is a valid signed ticket, otherwise null.
function verifyTicketToken_(token) {
  if (!token || typeof token !== "string" || token.indexOf(".") === -1) return null;
  const orderId = token.substring(0, token.lastIndexOf("."));
  return makeTicketToken_(orderId) === token ? orderId : null;
}

// ---------------------------------------------------------------------------
// Safe infrastructure helpers
// ---------------------------------------------------------------------------
// CacheService is only an optimization. A cache failure must never prevent a
// successful Sheet read or write from being returned to the web app.
function ordersCacheChunkKey_(version, index) {
  return ORDERS_CACHE_CHUNK_PREFIX + version + "_" + index;
}

function currentSheetLastRow_() {
  try {
    return getSheet().getLastRow();
  } catch (err) {
    Logger.log("Sheet revision check skipped: " + String((err && err.message) || err));
    return null;
  }
}

function cachedOrders_(validateSource) {
  try {
    const cache = CacheService.getScriptCache();
    const metadata = cache.get(ORDERS_CACHE_META_KEY);
    if (!metadata) return null;

    const parsed = JSON.parse(metadata);
    const version = String(parsed && parsed.version || "");
    const count = Number(parsed && parsed.count);
    if (!version || !count || count < 1 || count > 1000) return null;
    if (validateSource) {
      const cachedLastRow = Number(parsed && parsed.sourceLastRow || 0);
      const currentLastRow = currentSheetLastRow_();
      // Older cache metadata has no revision. Treat it as a miss once so the
      // next successful response records a revision for both dashboard/views.
      if (!cachedLastRow || (currentLastRow !== null && cachedLastRow !== currentLastRow)) return null;
    }

    const keys = [];
    for (let i = 0; i < count; i++) {
      keys.push(ordersCacheChunkKey_(version, i));
    }
    const cachedChunks = cache.getAll(keys);
    const chunks = keys.map(function (key) {
      return cachedChunks[key];
    });
    if (chunks.some(function (chunk) { return chunk === null || chunk === undefined; })) return null;
    return chunks.join("");
  } catch (err) {
    Logger.log("Orders cache read skipped: " + String((err && err.message) || err));
    return null;
  }
}

function findOrderInCachedJson_(json, lookup) {
  if (!json) return null;
  const wanted = normalizedText_(lookup);
  if (!wanted) return null;

  try {
    const parsed = JSON.parse(json);
    const orders = parsed && Array.isArray(parsed.data) ? parsed.data : [];
    const keys = ["Order ID", "Register Number", "Digital ID", "Phone Number"];
    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      for (let k = 0; k < keys.length; k++) {
        if (normalizedText_(order[keys[k]]) === wanted) return order;
      }
    }
  } catch (err) {
    Logger.log("Cached order lookup skipped: " + String((err && err.message) || err));
  }
  return null;
}

function cacheOrders_(value, sourceLastRow) {
  if (!value) return;

  const count = Math.ceil(value.length / CACHE_CHUNK_CHARS);
  if (!count || count > 1000) {
    Logger.log("Orders cache skipped because the response has too many chunks: " + count);
    return;
  }

  try {
    const cache = CacheService.getScriptCache();
    const version = String(Date.now()) + "_" + String(Math.floor(Math.random() * 1000000));
    const resolvedLastRow = Number(sourceLastRow || currentSheetLastRow_() || 0);
    // Publish metadata last. A reader continues using the previous complete
    // version while this new version is being written.
    for (let i = 0; i < count; i++) {
      cache.put(ordersCacheChunkKey_(version, i), value.substring(i * CACHE_CHUNK_CHARS, (i + 1) * CACHE_CHUNK_CHARS), CACHE_TIME);
    }
    cache.put(ORDERS_CACHE_META_KEY, JSON.stringify({
      version: version,
      count: count,
      sourceLastRow: resolvedLastRow || null
    }), CACHE_TIME);
  } catch (err) {
    Logger.log("Orders cache write skipped: " + String((err && err.message) || err));
  }
}

function invalidateOrdersCache_() {
  try {
    // Removing the metadata makes every old version unreachable. Chunks expire
    // naturally, and versioned keys prevent concurrent fills from mixing data.
    CacheService.getScriptCache().remove(ORDERS_CACHE_META_KEY);
  } catch (err) {
    Logger.log("Orders cache invalidation skipped: " + String((err && err.message) || err));
  }
}

function cachedDashboardSummary_() {
  try {
    return CacheService.getScriptCache().get(DASHBOARD_CACHE_KEY);
  } catch (err) {
    Logger.log("Dashboard cache read skipped: " + String((err && err.message) || err));
    return null;
  }
}

function dashboardSummaryIsCurrent_() {
  try {
    const cache = CacheService.getScriptCache();
    const cachedLastRow = Number(cache.get(DASHBOARD_SOURCE_ROW_KEY) || 0);
    const currentLastRow = currentSheetLastRow_();
    return !!cachedLastRow && (currentLastRow === null || cachedLastRow === currentLastRow);
  } catch (err) {
    Logger.log("Dashboard revision check skipped: " + String((err && err.message) || err));
    return false;
  }
}

function cacheDashboardSummary_(value, sourceLastRow) {
  if (!value) return;
  try {
    const cache = CacheService.getScriptCache();
    const resolvedLastRow = Number(sourceLastRow || currentSheetLastRow_() || 0);
    cache.put(DASHBOARD_CACHE_KEY, value, DASHBOARD_CACHE_TIME);
    if (resolvedLastRow) cache.put(DASHBOARD_SOURCE_ROW_KEY, String(resolvedLastRow), DASHBOARD_CACHE_TIME);
  } catch (err) {
    Logger.log("Dashboard cache write skipped: " + String((err && err.message) || err));
  }
}

function invalidateDashboardSummary_() {
  try {
    const cache = CacheService.getScriptCache();
    cache.remove(DASHBOARD_CACHE_KEY);
    cache.remove(DASHBOARD_SOURCE_ROW_KEY);
  } catch (err) {
    Logger.log("Dashboard cache invalidation skipped: " + String((err && err.message) || err));
  }
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function textJsonResponse_(json) {
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function readHeaders_(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (!lastColumn) throw new Error("The sheet has no header row");
  return sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
}

function requireColumns_(headers, required) {
  const missing = required.filter(function (column) { return headers.indexOf(column) === -1; });
  if (missing.length) throw new Error("Missing required columns: " + missing.join(", "));
}

function findHeaderIndex_(headers, aliases) {
  for (let i = 0; i < aliases.length; i++) {
    const index = headers.indexOf(aliases[i]);
    if (index !== -1) return index;
  }
  return -1;
}

function valueForHeaders_(row, headers, aliases) {
  const index = findHeaderIndex_(headers, aliases);
  return index === -1 ? "" : row[index];
}

function jsonCellValue_(value) {
  if (value instanceof Date) return value.toISOString();
  return value === null || value === undefined ? "" : value;
}

function normalizedText_(value) {
  return String(jsonCellValue_(value) || "").trim();
}

function sameTime_(a, b) {
  const left = normalizedText_(a);
  const right = normalizedText_(b);
  if (left === right) return true;
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  return !isNaN(leftMs) && !isNaN(rightMs) && leftMs === rightMs;
}

function isTrue_(value) {
  return value === true || String(value).toUpperCase() === "TRUE";
}

function findRowIndex_(values, orderIdColumn, orderId) {
  const wanted = normalizedText_(orderId);
  if (!wanted) return -1;
  for (let i = 1; i < values.length; i++) {
    if (normalizedText_(values[i][orderIdColumn]) === wanted) return i + 1;
  }
  return -1;
}

// Fast read-only lookup for the distribution screen and normal updates. The
// full data range remains the safe fallback for rows whose Order ID has not
// been persisted by the form-submit trigger yet.
function findRowByColumnValue_(sheet, columnIndex, value, providedLastRow) {
  const wanted = normalizedText_(value);
  const lastRow = typeof providedLastRow === "number" ? providedLastRow : sheet.getLastRow();
  if (columnIndex < 0 || !wanted || lastRow < 2) return -1;

  try {
    const match = sheet.getRange(2, columnIndex + 1, lastRow - 1, 1)
      .createTextFinder(wanted)
      .matchCase(false)
      .matchEntireCell(true)
      .useRegularExpression(false)
      .findNext();
    return match ? match.getRow() : -1;
  } catch (err) {
    Logger.log("Fast row lookup skipped: " + String((err && err.message) || err));
    return -1;
  }
}

// Search all relevant identifier columns in one TextFinder operation. This is
// materially faster than doing one Sheet service search per identifier column,
// especially for register/digital IDs that are not found in the first column.
function findRowByAnyColumnValue_(sheet, columnIndices, value) {
  const wanted = normalizedText_(value);
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (!wanted || lastRow < 2 || lastColumn < 1) return -1;

  const priorityByColumn = {};
  columnIndices.forEach(function (columnIndex, priority) {
    if (columnIndex >= 0 && priorityByColumn[columnIndex] === undefined) {
      priorityByColumn[columnIndex] = priority;
    }
  });

  try {
    const matches = sheet.getRange(2, 1, lastRow - 1, lastColumn)
      .createTextFinder(wanted)
      .matchCase(false)
      .matchEntireCell(true)
      .useRegularExpression(false)
      .findAll();
    let best = null;
    matches.forEach(function (match) {
      const columnIndex = match.getColumn() - 1;
      const priority = priorityByColumn[columnIndex];
      if (priority === undefined) return;
      const row = match.getRow();
      if (!best || priority < best.priority || (priority === best.priority && row < best.row)) {
        best = { priority: priority, row: row };
      }
    });
    return best ? best.row : -1;
  } catch (err) {
    Logger.log("Multi-column lookup skipped: " + String((err && err.message) || err));
    return -1;
  }
}

// Partial, read-only search used when the Orders page has not finished loading
// the full snapshot. It searches the relevant identity columns in one Sheet
// service operation and returns only matching rows.
function findRowsBySearchText_(sheet, columnIndices, query, maxResults) {
  const wanted = normalizedText_(query);
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (!wanted || lastRow < 2 || lastColumn < 1) return [];

  const allowedColumns = {};
  columnIndices.forEach(function (columnIndex) {
    if (columnIndex >= 0) allowedColumns[columnIndex] = true;
  });

  try {
    const matches = sheet.getRange(2, 1, lastRow - 1, lastColumn)
      .createTextFinder(wanted)
      .matchCase(false)
      .matchEntireCell(false)
      .useRegularExpression(false)
      .findAll();
    const rows = {};
    matches.forEach(function (match) {
      if (allowedColumns[match.getColumn() - 1]) rows[match.getRow()] = true;
    });

    const rowNumbers = Object.keys(rows).map(Number).sort(function (a, b) { return a - b; });
    if (!rowNumbers.length) return [];
    const selectedRows = rowNumbers.slice(0, maxResults || 50);
    const firstRow = selectedRows[0];
    const lastSelectedRow = selectedRows[selectedRows.length - 1];
    const values = sheet.getRange(firstRow, 1, lastSelectedRow - firstRow + 1, lastColumn).getValues();
    const headers = readHeaders_(sheet);
    return selectedRows.map(function (rowNumber) {
      return rowToObject(values[rowNumber - firstRow], headers, rowNumber);
    });
  } catch (err) {
    Logger.log("Search lookup skipped: " + String((err && err.message) || err));
    return [];
  }
}

// Same deterministic ID calculation used by getOrdersFromSheet(), but purely
// in memory. This lets a just-submitted row be updated before its installable
// form-submit trigger runs without writing or repairing any other Sheet row.
function findEffectiveRowIndex_(values, headers, orderId) {
  const orderIdColumn = headers.indexOf("Order ID");
  if (orderIdColumn === -1) return -1;
  const wanted = normalizedText_(orderId);
  if (!wanted) return -1;

  let nextOrderIdNumber = 1;
  for (let i = 1; i < values.length; i++) {
    const existing = normalizedText_(values[i][orderIdColumn]);
    if (existing.indexOf("INV-") === 0) {
      const number = parseInt(existing.substring(4), 10);
      if (!isNaN(number) && number >= nextOrderIdNumber) nextOrderIdNumber = number + 1;
    }
  }

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row || row.every(function (cell) { return cell === "" || cell === null; })) continue;
    const effectiveId = normalizedText_(row[orderIdColumn]) || ("INV-" + String(nextOrderIdNumber++).padStart(4, "0"));
    if (effectiveId === wanted) return i + 1;
  }
  return -1;
}

function collectionConflict_(code, message, row, headers, rowIndex) {
  return jsonResponse_({
    success: false,
    code: code,
    error: message,
    data: rowToObject(row, headers, rowIndex)
  });
}

function emailClaimKey_(orderId) {
  return EMAIL_CLAIM_PREFIX + normalizedText_(orderId);
}

// Must be called while the script lock is held. This claim lives in Script
// Properties, not the Sheet, and prevents concurrent single/batch sends for the
// same order while the network call to Gmail is in progress.
function claimEmailSend_(orderId) {
  const properties = PropertiesService.getScriptProperties();
  const key = emailClaimKey_(orderId);
  const now = Date.now();
  const existing = Number(properties.getProperty(key) || 0);
  if (existing && now - existing < EMAIL_CLAIM_TTL_MS) return false;
  properties.setProperty(key, String(now));
  return true;
}

function releaseEmailClaim_(orderId) {
  try {
    PropertiesService.getScriptProperties().deleteProperty(emailClaimKey_(orderId));
  } catch (err) {
    Logger.log("Email claim cleanup skipped: " + String((err && err.message) || err));
  }
}

function emailClaimActive_(orderId) {
  try {
    const value = Number(PropertiesService.getScriptProperties().getProperty(emailClaimKey_(orderId)) || 0);
    return !!value && Date.now() - value < EMAIL_CLAIM_TTL_MS;
  } catch (err) {
    // A claim lookup is a safety enhancement, not a reason to block a valid
    // collection if Script Properties is temporarily unavailable.
    Logger.log("Email claim lookup skipped: " + String((err && err.message) || err));
    return false;
  }
}

// Must be called while the script lock is held. The durable Sheet flag is
// written only after Gmail succeeds; the Script Properties claim protects the
// in-flight period without risking a false QR Sent value after a timeout.
function markQrSent_(sheet, rowNumber, qrSentColIdx) {
  if (!isTrue_(sheet.getRange(rowNumber, qrSentColIdx).getValue())) {
    sheet.getRange(rowNumber, qrSentColIdx).setValue(true);
    SpreadsheetApp.flush();
  }
}

function doGet(e) {
  const action = e.parameter.action;
  const noCache = e.parameter.nocache === "1";

  if (!checkAccess_(e.parameter.token)) return denied_();

  if (action === "getQuota") {
    // Recipients still sendable today. Consumer Gmail = 100/day, Workspace = 1500/day.
    try {
      return ContentService.createTextOutput(JSON.stringify({ success: true, remaining: MailApp.getRemainingDailyQuota() })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      // Thrown when the deployment has not been authorized for mail scope yet.
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: String((err && err.message) || err) })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  if (action === "getOrder") {
    const reference = e.parameter.ref || e.parameter.orderId || e.parameter.token || "";
    try {
      const data = getOrderFromSheet_(reference);
      return jsonResponse_({ success: true, data: data });
    } catch (error) {
      return jsonResponse_({ success: false, error: error.toString() });
    }
  }

  if (action === "searchOrders") {
    const query = e.parameter.q || "";
    try {
      const data = searchOrdersFromSheet_(query);
      return jsonResponse_({ success: true, data: data });
    } catch (error) {
      return jsonResponse_({ success: false, error: error.toString() });
    }
  }

  if (action === "getDashboardSummary") {
    if (!noCache) {
      // If the full order cache is warm, derive the small dashboard response
      // Prefer the same revision used by the Orders page so the totals cannot
      // drift between the full list and the dashboard summary.
      const cachedData = cachedOrders_(true);
      if (cachedData) {
        try {
          const parsed = JSON.parse(cachedData);
          if (parsed && Array.isArray(parsed.data)) {
            const summaryJson = JSON.stringify({ success: true, data: buildDashboardSummary_(parsed.data) });
            cacheDashboardSummary_(summaryJson);
            return textJsonResponse_(summaryJson);
          }
        } catch (err) {
          Logger.log("Dashboard summary from orders cache skipped: " + String((err && err.message) || err));
        }
      }

      const cachedSummary = cachedDashboardSummary_();
      if (cachedSummary && dashboardSummaryIsCurrent_()) {
        // CacheService expiration is fixed from the last put. Refresh the
        // small summary lease while a dashboard is actively polling.
        cacheDashboardSummary_(cachedSummary);
        return textJsonResponse_(cachedSummary);
      }
    }

    try {
      const data = getOrdersFromSheet();
      // Keep this path small. Do not serialize/cache the full order list before
      // returning the dashboard response; the Orders page has its own cache
      // fill path.
      const summaryJson = JSON.stringify({ success: true, data: buildDashboardSummary_(data) });
      cacheDashboardSummary_(summaryJson);
      return textJsonResponse_(summaryJson);
    } catch (error) {
      return jsonResponse_({ success: false, error: error.toString() });
    }
  }

  if (action === "getOrders") {
    if (!noCache) {
      const cachedData = cachedOrders_(true);
      if (cachedData) {
        return textJsonResponse_(cachedData);
      }
    }

    // Cache miss. This is now a pure read — it never writes to the sheet.
    try {
      const data = getOrdersFromSheet();
      const jsonData = JSON.stringify({ success: true, data: data });
      cacheOrders_(jsonData);
      return textJsonResponse_(jsonData);
    } catch (error) {
      return jsonResponse_({ success: false, error: error.toString() });
    }
  }

  return jsonResponse_({ success: false, error: "Invalid action" });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (error) {
    return jsonResponse_({ success: false, error: "Invalid JSON" });
  }

  if (!checkAccess_(body.token)) return denied_();

  const action = body.action;

  if (action === "sendQrTickets") {
    return handleSendQrTickets();
  }
  if (action === "sendSingleQr") {
    return handleSendSingleQr(body.orderId);
  }

  const lock = LockService.getScriptLock();
  let lockAcquired = false;

  try {
    lock.waitLock(LOCK_WAIT_MS);
    lockAcquired = true;
    const sheet = getSheet();
    // Request paths are deliberately read-only with respect to the header row.
    // Missing columns are a configuration error, not a reason to append columns
    // to the live Sheet during a busy distribution line.
    const headers = readHeaders_(sheet);

    if (action === "updatePayment") {
      requireColumns_(headers, ["Order ID", "Payment Status", "Payment Verified By", "Payment Verified At"]);
    } else if (action === "updateCollection") {
      requireColumns_(headers, ["Order ID", "Payment Status", "QR Sent", "Collection Status", "Collector", "Collected At"]);
    } else if (action === "updateNotes") {
      requireColumns_(headers, ["Order ID", "Notes"]);
    } else {
      throw new Error("Unknown action");
    }

    const orderIdColIdx = headers.indexOf("Order ID") + 1;
    if (orderIdColIdx === 0) {
      throw new Error("Order ID column not found");
    }

    // A collection request may arrive as a signed ticket token instead of a bare Order ID.
    let orderId = body.orderId;
    if (action === "updateCollection" && body.token) {
      const verified = verifyTicketToken_(body.token);
      if (!verified) throw new Error("Invalid ticket signature");
      orderId = verified;
    }

    let dataValues = null;
    let targetRowIndex = findRowByColumnValue_(sheet, orderIdColIdx - 1, orderId);

    // If the form-submit trigger is still pending, resolve its deterministic ID
    // in memory. This deliberately does not repair or modify any other Sheet
    // row during a distribution request.
    if (targetRowIndex === -1) {
      dataValues = sheet.getDataRange().getValues();
      targetRowIndex = findRowIndex_(dataValues, orderIdColIdx - 1, orderId);
    }
    if (targetRowIndex === -1) {
      targetRowIndex = findEffectiveRowIndex_(dataValues, headers, orderId);
    }

    if (targetRowIndex === -1) {
      throw new Error("Order not found");
    }
    const targetRow = dataValues
      ? dataValues[targetRowIndex - 1]
      : sheet.getRange(targetRowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (!normalizedText_(targetRow[orderIdColIdx - 1])) {
      // Only the in-memory response/validation row receives the effective ID.
      // The installable form-submit trigger remains the only persistence path.
      targetRow[orderIdColIdx - 1] = orderId;
    }
    const previousOrder = rowToObject(targetRow, headers, targetRowIndex);
    const col = function (name) { return headers.indexOf(name); };

    if (action === "updatePayment") {
      const status = String(body.paymentStatus || "PAID").toUpperCase();
      const currentPaymentStatus = normalizedText_(targetRow[col("Payment Status")]).toUpperCase();
      if (status === "PAID") {
        // A retry of the same request is safe, but a different verifier must
        // not silently overwrite the first verifier's decision.
        if (currentPaymentStatus === "PAID") {
          const sameVerifier = normalizedText_(targetRow[col("Payment Verified By")]) === normalizedText_(body.verifiedBy);
          const sameTimestamp = !body.verifiedAt || sameTime_(targetRow[col("Payment Verified At")], body.verifiedAt);
          if (sameVerifier && sameTimestamp) {
            return jsonResponse_({ success: true, idempotent: true, data: rowToObject(targetRow, headers, targetRowIndex) });
          }
          return collectionConflict_("ALREADY_PAID", "Payment is already verified for this order.", targetRow, headers, targetRowIndex);
        }
        updateCell(sheet, headers, targetRowIndex, "Payment Status", "PAID");
        updateCell(sheet, headers, targetRowIndex, "Payment Verified By", body.verifiedBy);
        updateCell(sheet, headers, targetRowIndex, "Payment Verified At", body.verifiedAt || new Date().toISOString());
      } else if (status === "PENDING") {
        if (currentPaymentStatus === "PENDING" || !currentPaymentStatus) {
          return jsonResponse_({ success: true, idempotent: true, data: rowToObject(targetRow, headers, targetRowIndex) });
        }
        // Undo verification.
        updateCell(sheet, headers, targetRowIndex, "Payment Status", "PENDING");
        updateCell(sheet, headers, targetRowIndex, "Payment Verified By", "");
        updateCell(sheet, headers, targetRowIndex, "Payment Verified At", "");
      } else {
        throw new Error("Invalid payment status");
      }
    } else if (action === "updateCollection") {
      const status = String(body.collectionStatus || "COLLECTED").toUpperCase();
      const collectionStatusCol = col("Collection Status");
      const collectorCol = col("Collector");
      const collectedAtCol = col("Collected At");
      const currentCollectionStatus = normalizedText_(targetRow[collectionStatusCol]).toUpperCase();

      if (status === "COLLECTED") {
        const collector = normalizedText_(body.collector);
        if (!collector) throw new Error("Collector is required");

        // This check happens while the script lock is held. The first station
        // changes the row; every later station sees the committed COLLECTED
        // state and cannot overwrite the original collector/time.
        if (currentCollectionStatus === "COLLECTED") {
          const sameAttempt = !!body.collectedAt &&
            normalizedText_(targetRow[collectorCol]) === collector &&
            sameTime_(targetRow[collectedAtCol], body.collectedAt);
          if (sameAttempt) {
            return jsonResponse_({ success: true, idempotent: true, data: rowToObject(targetRow, headers, targetRowIndex) });
          }
          return collectionConflict_("ALREADY_COLLECTED", "This order has already been collected.", targetRow, headers, targetRowIndex);
        }

        const paid = targetRow[col("Payment Status")] === "PAID";
        const qrSent = isTrue_(targetRow[col("QR Sent")]);
        if (!paid) throw new Error("Payment is not verified for this order");
        if (emailClaimActive_(orderId)) throw new Error("Ticket email is still being sent; try again shortly");
        if (!qrSent && !body.force) throw new Error("Ticket has not been emailed yet");
        updateCell(sheet, headers, targetRowIndex, "Collection Status", "COLLECTED");
        updateCell(sheet, headers, targetRowIndex, "Collector", collector);
        updateCell(sheet, headers, targetRowIndex, "Collected At", body.collectedAt || new Date().toISOString());
      } else if (status === "NOT_COLLECTED") {
        // Repeating an undo is harmless. Otherwise protect against an old
        // browser/toast undoing a newer collection.
        if (currentCollectionStatus !== "COLLECTED") {
          return jsonResponse_({ success: true, idempotent: true, data: rowToObject(targetRow, headers, targetRowIndex) });
        }

        const expectedAt = body.expectedCollectedAt;
        const expectedCollector = body.expectedCollector;
        const currentCollector = normalizedText_(targetRow[collectorCol]);
        if ((expectedAt && !sameTime_(targetRow[collectedAtCol], expectedAt)) ||
            (expectedCollector && currentCollector !== normalizedText_(expectedCollector)) ||
            (!expectedAt && body.collector && currentCollector && currentCollector !== normalizedText_(body.collector))) {
          return collectionConflict_("STALE_COLLECTION", "This collection changed in another station. Refresh before undoing it.", targetRow, headers, targetRowIndex);
        }

        // Undo collection.
        updateCell(sheet, headers, targetRowIndex, "Collection Status", "NOT_COLLECTED");
        updateCell(sheet, headers, targetRowIndex, "Collector", "");
        updateCell(sheet, headers, targetRowIndex, "Collected At", "");
      } else {
        throw new Error("Invalid collection status");
      }
    } else if (action === "updateNotes") {
      updateCell(sheet, headers, targetRowIndex, "Notes", body.notes);
    }

    // Commit all cell updates before reading the authoritative response and
    // before releasing the lock to the next station.
    SpreadsheetApp.flush();
    invalidateOrdersCache_();
    const updatedRow = sheet.getRange(targetRowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
    // A just-submitted row can still have a blank persisted Order ID while its
    // installable form-submit trigger is pending. Keep the response aligned
    // with the effective ID used for this request without writing that ID here.
    if (!normalizedText_(updatedRow[orderIdColIdx - 1])) {
      updatedRow[orderIdColIdx - 1] = orderId;
    }
    const updatedOrder = rowToObject(updatedRow, headers, targetRowIndex);
    updateDashboardSummaryCache_(previousOrder, updatedOrder);

    return jsonResponse_({ success: true, data: updatedOrder });

  } catch (error) {
    return jsonResponse_({ success: false, error: error.toString() });
  } finally {
    if (lockAcquired) lock.releaseLock();
  }
}

// Run this once from the Apps Script editor (Run button) and approve the prompt.
// It touches every sensitive API the web app uses so the deployment gets the
// full scope set — in particular script.send_mail, which MailApp.getRemainingDailyQuota() needs.
function forceAuth() {
  GmailApp.getAliases();
  MailApp.getRemainingDailyQuota();
}

// Run this once to install the "on form submit" trigger that assigns Order IDs
// and default statuses the instant a new response lands (so reads stay pure).
function setupTriggers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "onFormSubmit") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("onFormSubmit").forSpreadsheet(ss).onFormSubmit().create();
}

function updateCell(sheet, headers, rowIndex, columnName, value) {
  const colIdx = headers.indexOf(columnName) + 1;
  if (colIdx > 0 && value !== undefined) {
    sheet.getRange(rowIndex, colIdx).setValue(value);
  }
}

// Ensure necessary columns exist. If they don't, append them.
function ensureColumnsExist(sheet, headers) {
  const requiredColumns = [
    "Order ID", "Payment Status", "Payment Verified By", "Payment Verified At",
    "Collection Status", "Collector", "Collected At", "Notes", "QR Sent"
  ];

  let changed = false;
  for (const col of requiredColumns) {
    if (headers.indexOf(col) === -1) {
      sheet.getRange(1, headers.length + 1).setValue(col);
      headers.push(col);
      changed = true;
    }
  }
  return changed;
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error("Sheet '" + SHEET_NAME + "' not found; no fallback Sheet was used");
  return sheet;
}

// Assigns Order IDs and default statuses to any rows missing them. This is the
// ONLY place that writes IDs. Callers must already hold the script lock.
function persistPendingIds_(sheet, headers) {
  const orderIdCol = headers.indexOf("Order ID");
  if (orderIdCol === -1) return;
  const paymentCol = headers.indexOf("Payment Status");
  const collectionCol = headers.indexOf("Collection Status");

  const values = sheet.getDataRange().getValues();
  let nextNum = 1;
  for (let i = 1; i < values.length; i++) {
    const id = values[i][orderIdCol];
    if (typeof id === "string" && id.indexOf("INV-") === 0) {
      const n = parseInt(id.substring(4), 10);
      if (!isNaN(n) && n >= nextNum) nextNum = n + 1;
    }
  }

  let wrote = false;
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row || row.every(function (c) { return c === "" || c === null; })) continue;
    if (row[orderIdCol]) continue;

    const newId = "INV-" + String(nextNum++).padStart(4, "0");
    sheet.getRange(i + 1, orderIdCol + 1).setValue(newId);
    if (paymentCol !== -1 && !row[paymentCol]) sheet.getRange(i + 1, paymentCol + 1).setValue("PENDING");
    if (collectionCol !== -1 && !row[collectionCol]) sheet.getRange(i + 1, collectionCol + 1).setValue("NOT_COLLECTED");
    wrote = true;
  }
  if (wrote) {
    SpreadsheetApp.flush();
    invalidateOrdersCache_();
  }
}

// Pure read. Rows still missing an Order ID (form-submit trigger hasn't fired
// yet) get a deterministic in-memory ID; the trigger / next write persists it.
function getOrdersFromSheet() {
  const sheet = getSheet();
  const headers = readHeaders_(sheet);
  if (headers.indexOf("Order ID") === -1) {
    throw new Error("Order ID column not found; no Sheet changes were made");
  }

  const values = sheet.getDataRange().getValues();
  const orderIdColIdx = headers.indexOf("Order ID");
  const paymentStatusCol = headers.indexOf("Payment Status");
  const collectionStatusCol = headers.indexOf("Collection Status");

  let nextOrderIdNumber = 1;
  for (let i = 1; i < values.length; i++) {
    const orderId = values[i][orderIdColIdx];
    if (orderId && typeof orderId === "string" && orderId.startsWith("INV-")) {
      const num = parseInt(orderId.substring(4), 10);
      if (!isNaN(num) && num >= nextOrderIdNumber) nextOrderIdNumber = num + 1;
    }
  }

  const orders = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row || row.every(function (cell) { return cell === "" || cell === null; })) continue;

    if (!row[orderIdColIdx]) {
      row[orderIdColIdx] = "INV-" + nextOrderIdNumber.toString().padStart(4, "0");
      nextOrderIdNumber++;
      if (paymentStatusCol !== -1 && !row[paymentStatusCol]) row[paymentStatusCol] = "PENDING";
      if (collectionStatusCol !== -1 && !row[collectionStatusCol]) row[collectionStatusCol] = "NOT_COLLECTED";
    }

    orders.push(rowToObject(row, headers, i + 1));
  }
  return orders;
}

// Pure read for one scanned/manual reference. TextFinder keeps normal QR
// lookups to one narrow column and one row read instead of loading every order.
// The full-range fallback preserves support for pending form-submit IDs and
// manual identifiers when a fast column lookup cannot find a match.
function getOrderFromSheet_(reference) {
  const rawReference = normalizedText_(reference);
  if (!rawReference) throw new Error("Order reference is required");

  let lookup = rawReference;
  if (rawReference.indexOf(".") !== -1) {
    lookup = verifyTicketToken_(rawReference);
    if (!lookup) throw new Error("Invalid ticket signature");
  }

  const sheet = getSheet();
  const headers = readHeaders_(sheet);
  const columnAliases = [
    ["Order ID"],
    ["Register Number", "Reg No"],
    ["Digital ID"],
    ["Phone Number"]
  ];
  const columnIndices = columnAliases.map(function (aliases) {
    return findHeaderIndex_(headers, aliases);
  });

  // Orders already fetched by the Orders page are shared in Script Cache.
  // Reuse that snapshot for distribution when available; writes invalidate it
  // before returning, so the Sheet remains authoritative for mutations.
  const cachedOrder = findOrderInCachedJson_(cachedOrders_(), lookup);
  if (cachedOrder) return cachedOrder;

  let rowNumber = -1;

  // Generated order IDs are the common QR/manual path. Keep this as the
  // narrowest possible search; other identifiers use one multi-column search.
  if (/^INV-/i.test(lookup) && columnIndices[0] !== -1) {
    rowNumber = findRowByColumnValue_(sheet, columnIndices[0], lookup);
  } else {
    rowNumber = findRowByAnyColumnValue_(sheet, columnIndices, lookup);
  }

  if (rowNumber === -1) {
    const values = sheet.getDataRange().getValues();
    const orderIdColumn = headers.indexOf("Order ID");
    rowNumber = findRowIndex_(values, orderIdColumn, lookup);
    if (rowNumber === -1) {
      for (let i = 0; i < columnIndices.length && rowNumber === -1; i++) {
        rowNumber = findRowIndex_(values, columnIndices[i], lookup);
      }
    }
    if (rowNumber === -1) rowNumber = findEffectiveRowIndex_(values, headers, lookup);
  }

  if (rowNumber === -1) throw new Error("Order not found");
  const row = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
  return rowToObject(row, headers, rowNumber);
}

function searchOrdersFromSheet_(query) {
  const wanted = normalizedText_(query);
  if (wanted.length < 3) return [];

  const cachedData = cachedOrders_(true);
  if (cachedData) {
    try {
      const parsed = JSON.parse(cachedData);
      const orders = parsed && Array.isArray(parsed.data) ? parsed.data : [];
      const lowerQuery = wanted.toLowerCase();
      return orders.filter(function (order) {
        return ["Order ID", "Name", "Register Number", "Digital ID", "Phone Number", "College Email"]
          .some(function (key) { return normalizedText_(order[key]).toLowerCase().indexOf(lowerQuery) !== -1; });
      }).slice(0, 50);
    } catch (err) {
      Logger.log("Cached search skipped: " + String((err && err.message) || err));
    }
  }

  const sheet = getSheet();
  const headers = readHeaders_(sheet);
  const aliases = [
    ["Order ID"],
    ["Name"],
    ["Register Number", "Reg No"],
    ["Digital ID"],
    ["Phone Number"],
    ["College Email ID", "Email Address", "College Email"]
  ];
  const columnIndices = aliases.map(function (columnAliases) {
    return findHeaderIndex_(headers, columnAliases);
  });
  return findRowsBySearchText_(sheet, columnIndices, wanted, 50);
}

function buildDashboardSummary_(orders) {
  const summary = {
    totalOrders: orders.length,
    paidOrders: 0,
    collectedOrders: 0,
    paidNoQrOrders: 0,
    upiOrders: 0,
    cashOrders: 0,
    sizes: {},
    activities: []
  };

  orders.forEach(function (order) {
    const paymentStatus = normalizedText_(order["Payment Status"]).toUpperCase();
    const collectionStatus = normalizedText_(order["Collection Status"]).toUpperCase();
    const paymentMethod = normalizedText_(order["Payment Method"]).toUpperCase();
    const size = normalizedText_(order["T-Shirt Size"]) || "Unknown";

    if (paymentStatus === "PAID") summary.paidOrders++;
    if (collectionStatus === "COLLECTED") summary.collectedOrders++;
    if (paymentStatus === "PAID" && !isTrue_(order["QR Sent"])) summary.paidNoQrOrders++;
    if (paymentMethod === "UPI") summary.upiOrders++;
    else summary.cashOrders++;
    summary.sizes[size] = (summary.sizes[size] || 0) + 1;

    if (order["Payment Verified At"] && order["Payment Verified By"]) {
      summary.activities.push({
        id: order["Order ID"] + "-payment",
        type: "payment",
        orderId: order["Order ID"],
        timestamp: order["Payment Verified At"],
        user: order["Payment Verified By"],
        description: "verified payment for " + order["Order ID"]
      });
    }
    if (order["Collected At"] && order["Collector"]) {
      summary.activities.push({
        id: order["Order ID"] + "-collection",
        type: "collection",
        orderId: order["Order ID"],
        timestamp: order["Collected At"],
        user: order["Collector"],
        description: "gave T-shirt for " + order["Order ID"]
      });
    }
  });

  summary.activities.sort(function (a, b) {
    const right = Date.parse(b.timestamp);
    const left = Date.parse(a.timestamp);
    return (isNaN(right) ? 0 : right) - (isNaN(left) ? 0 : left);
  });
  summary.activities = summary.activities.slice(0, 10);
  return summary;
}

// Update an already-warm dashboard snapshot from an authoritative mutation
// response. This avoids forcing the next dashboard poll to rescan the Sheet.
// If there is no dashboard snapshot, there is nothing to update.
function updateDashboardSummaryCache_(beforeOrder, afterOrder) {
  const cachedSummary = cachedDashboardSummary_();
  if (!cachedSummary) return;

  try {
    const parsed = JSON.parse(cachedSummary);
    if (!parsed || !parsed.data) return;

    const before = buildDashboardSummary_([beforeOrder]);
    const after = buildDashboardSummary_([afterOrder]);
    const summary = parsed.data;
    ["paidOrders", "collectedOrders", "paidNoQrOrders", "upiOrders", "cashOrders"].forEach(function (key) {
      summary[key] += after[key] - before[key];
    });

    Object.keys(before.sizes).forEach(function (size) {
      summary.sizes[size] = (summary.sizes[size] || 0) - before.sizes[size];
      if (summary.sizes[size] <= 0) delete summary.sizes[size];
    });
    Object.keys(after.sizes).forEach(function (size) {
      summary.sizes[size] = (summary.sizes[size] || 0) + after.sizes[size];
    });

    const orderId = normalizedText_(afterOrder["Order ID"]);
    summary.activities = (summary.activities || []).filter(function (activity) {
      return activity.orderId !== orderId;
    }).concat(after.activities);
    summary.activities.sort(function (a, b) {
      const right = Date.parse(b.timestamp);
      const left = Date.parse(a.timestamp);
      return (isNaN(right) ? 0 : right) - (isNaN(left) ? 0 : left);
    });
    summary.activities = summary.activities.slice(0, 10);
    cacheDashboardSummary_(JSON.stringify({ success: true, data: summary }));
  } catch (err) {
    Logger.log("Dashboard summary update skipped: " + String((err && err.message) || err));
  }
}

function markDashboardQrSent_() {
  const cachedSummary = cachedDashboardSummary_();
  if (!cachedSummary) return;

  try {
    const parsed = JSON.parse(cachedSummary);
    if (!parsed || !parsed.data) return;
    parsed.data.paidNoQrOrders = Math.max(0, Number(parsed.data.paidNoQrOrders || 0) - 1);
    cacheDashboardSummary_(JSON.stringify(parsed));
  } catch (err) {
    Logger.log("Dashboard QR counter update skipped: " + String((err && err.message) || err));
  }
}

function rowToObject(row, headers, rowIndex) {
  const paymentMethod = normalizedText_(valueForHeaders_(row, headers, ["Payment Method - Rs. 300", "Payment Method"]));

  // Return only the stable fields used by the web app. Besides reducing the
  // response size, this avoids repeating long Google Form header names for
  // every order and keeps the cache below its per-value limit for much longer.
  return {
    _rowIndex: rowIndex,
    "Timestamp": jsonCellValue_(valueForHeaders_(row, headers, ["Timestamp"])),
    "College Email": jsonCellValue_(valueForHeaders_(row, headers, ["College Email ID", "Email Address", "College Email"])),
    "Digital ID": jsonCellValue_(valueForHeaders_(row, headers, ["Digital ID"])),
    "Register Number": jsonCellValue_(valueForHeaders_(row, headers, ["Register Number", "Reg No"])),
    "Name": jsonCellValue_(valueForHeaders_(row, headers, ["Name"])),
    "Phone Number": jsonCellValue_(valueForHeaders_(row, headers, ["Phone Number"])),
    "Year": jsonCellValue_(valueForHeaders_(row, headers, ["Year"])),
    "T-Shirt Size": jsonCellValue_(valueForHeaders_(row, headers, ["Select T-shirt size (With size chart for reference)", "T-shirt size", "T-Shirt Size"])),
    "Payment Method": paymentMethod.toUpperCase().indexOf("UPI") !== -1 ? "UPI" : "CASH",
    "Payment Screenshot": jsonCellValue_(valueForHeaders_(row, headers, ["Payment UPI (Upload screenshot if payment done through UPI)", "Payment Screenshot"])),
    "Order ID": jsonCellValue_(valueForHeaders_(row, headers, ["Order ID"])),
    "Payment Status": jsonCellValue_(valueForHeaders_(row, headers, ["Payment Status"])),
    "Payment Verified By": jsonCellValue_(valueForHeaders_(row, headers, ["Payment Verified By"])),
    "Payment Verified At": jsonCellValue_(valueForHeaders_(row, headers, ["Payment Verified At"])),
    "Collection Status": jsonCellValue_(valueForHeaders_(row, headers, ["Collection Status"])),
    "Collector": jsonCellValue_(valueForHeaders_(row, headers, ["Collector"])),
    "Collected At": jsonCellValue_(valueForHeaders_(row, headers, ["Collected At"])),
    "Notes": jsonCellValue_(valueForHeaders_(row, headers, ["Notes"])),
    "QR Sent": isTrue_(valueForHeaders_(row, headers, ["QR Sent"]))
  };
}

// Installable "on form submit" trigger — see setupTriggers().
function onFormSubmit(e) {
  const lock = LockService.getScriptLock();
  let lockAcquired = false;
  try {
    lock.waitLock(LOCK_WAIT_MS);
    lockAcquired = true;
    const sheet = getSheet();
    let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (ensureColumnsExist(sheet, headers)) {
      headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    }
    persistPendingIds_(sheet, headers);
  } catch (err) {
    // Never let a trigger failure block form submissions.
  } finally {
    if (lockAcquired) lock.releaseLock();
    invalidateOrdersCache_();
    invalidateDashboardSummary_();
  }
}

function onEdit(e) {
  invalidateOrdersCache_();
  invalidateDashboardSummary_();
}

// ---------------------------------------------------------------------------
// Ticket email
// ---------------------------------------------------------------------------
function buildTicketHtml_(order) {
  return `
    <div style="font-family: monospace; max-width: 600px; margin: 0 auto; padding: 20px; border: 2px solid #11141c; background-color: #f0f0ed; color: #11141c;">
      <h1 style="text-transform: uppercase; letter-spacing: 2px; border-bottom: 2px solid #11141c; padding-bottom: 10px;">Invente 11.0 T-Shirt Ticket</h1>
      <p><strong>Hi ${order.name},</strong></p>
      <p>Your payment has been verified. Show this QR code at the collection desk to receive your T-shirt.</p>

      <div style="background-color: #1a1e28; color: #f0f0ed; padding: 20px; text-align: center; border: 2px solid #11141c; margin: 20px 0;">
        <p style="font-size: 12px; letter-spacing: 2px; font-weight: bold; margin-top: 0;">ORDER ID</p>
        <h2 style="margin: 0 0 10px 0; font-size: 24px;">${order.orderId}</h2>
        ${order.regNo ? `<p style="font-size: 12px; letter-spacing: 2px; font-weight: bold; margin: 15px 0 5px 0;">REG NO</p>
        <h3 style="margin: 0 0 10px 0; font-size: 20px; color: #94a3b8;">${order.regNo}</h3>` : ''}
        ${order.digitalId ? `<p style="font-size: 12px; letter-spacing: 2px; font-weight: bold; margin: 15px 0 5px 0;">DIGITAL ID</p>
        <h3 style="margin: 0 0 10px 0; font-size: 20px; color: #94a3b8;">${order.digitalId}</h3>` : ''}
        <p style="font-size: 12px; letter-spacing: 2px; font-weight: bold; margin: 15px 0 5px 0;">SIZE</p>
        <h1 style="margin: 0; font-size: 36px; color: #4ade80;">${order.size}</h1>
      </div>

      <div style="text-align: center; margin-top: 20px;">
        <img src="cid:qrImage" style="width: 200px; height: 200px; border: 4px solid #11141c; padding: 10px; background: white;" alt="QR Code" />
      </div>
      <p style="font-size: 12px; text-align: center; margin-top: 20px; opacity: 0.7;">Present this at the collection desk. One T-shirt per ticket.</p>
    </div>
  `;
}

// Sends the ticket email for one order. Throws on failure.
function sendTicketEmail_(order) {
  const qr = qrcode(4, 'M');
  qr.addData(makeTicketToken_(order.orderId));
  qr.make();
  const base64Gif = qr.createDataURL().split(',')[1];
  const imageBlob = Utilities.newBlob(Utilities.base64Decode(base64Gif), 'image/gif', 'qrcode.gif');

  GmailApp.sendEmail(order.email, "Your Invente 11.0 T-Shirt QR Ticket", "Please enable HTML emails.", {
    htmlBody: buildTicketHtml_(order),
    inlineImages: { qrImage: imageBlob }
  });
}

// Reads one order row into the shape sendTicketEmail_ expects.
function readOrderForEmail_(sheet, headers, rowValues, rowNumber) {
  const idx = function (a) {
    for (let k = 0; k < a.length; k++) { const p = headers.indexOf(a[k]); if (p !== -1) return p; }
    return -1;
  };
  const emailIdx = idx(["College Email ID", "Email Address", "College Email"]);
  const nameIdx = idx(["Name"]);
  const regIdx = idx(["Register Number", "Reg No"]);
  const digitalIdx = idx(["Digital ID"]);
  const sizeIdx = idx(["Select T-shirt size (With size chart for reference)", "T-shirt size", "T-Shirt Size"]);
  const orderIdIdx = headers.indexOf("Order ID");
  return {
    rowIndex: rowNumber,
    orderId: rowValues[orderIdIdx],
    email: emailIdx !== -1 ? rowValues[emailIdx] : "",
    name: nameIdx !== -1 ? rowValues[nameIdx] : "Student",
    regNo: regIdx !== -1 ? rowValues[regIdx] : "",
    digitalId: digitalIdx !== -1 ? rowValues[digitalIdx] : "",
    size: sizeIdx !== -1 ? rowValues[sizeIdx] : "Unknown"
  };
}

// Force-send (or resend) a single ticket regardless of the QR Sent flag.
function handleSendSingleQr(orderId) {
  const lock = LockService.getScriptLock();
  let lockAcquired = false;
  let emailClaimed = false;
  let hadQrSent = false;
  let rowNumber = -1;
  let qrSentColIdx = -1;
  let order = null;
  let sheet = null;

  try {
    lock.waitLock(LOCK_WAIT_MS);
    lockAcquired = true;
    sheet = getSheet();
    const headers = readHeaders_(sheet);
    requireColumns_(headers, ["Order ID", "Payment Status", "QR Sent"]);
    qrSentColIdx = headers.indexOf("QR Sent") + 1;
    const paymentStatusCol = headers.indexOf("Payment Status");
    const orderIdCol = headers.indexOf("Order ID");

    rowNumber = findRowByColumnValue_(sheet, orderIdCol, orderId);
    let row;
    if (rowNumber === -1) {
      const values = sheet.getDataRange().getValues();
      rowNumber = findRowIndex_(values, orderIdCol, orderId);
      if (rowNumber === -1) throw new Error("Order not found");
      row = values[rowNumber - 1];
    } else {
      row = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
    }
    if (row[paymentStatusCol] !== "PAID") throw new Error("Payment is not verified for this order");

    order = readOrderForEmail_(sheet, headers, row, rowNumber);
    if (!order.email) throw new Error("No email address on file for this order");

    hadQrSent = isTrue_(row[qrSentColIdx - 1]);
    if (!claimEmailSend_(order.orderId)) {
      throw new Error("A ticket email is already being sent for this order");
    }
    emailClaimed = true;

  } catch (error) {
    if (emailClaimed) releaseEmailClaim_(orderId);
    return jsonResponse_({ success: false, error: error.toString() });
  } finally {
    if (lockAcquired) lock.releaseLock();
  }

  try {
    // Gmail is deliberately outside the Sheet lock. Collection updates can
    // proceed while this network call is in flight.
    sendTicketEmail_(order);

    if (!hadQrSent) {
      let finalizeLockAcquired = false;
      try {
        lock.waitLock(LOCK_WAIT_MS);
        finalizeLockAcquired = true;
        markQrSent_(sheet, rowNumber, qrSentColIdx);
        invalidateOrdersCache_();
        if (!hadQrSent) markDashboardQrSent_();
      } finally {
        if (finalizeLockAcquired) lock.releaseLock();
      }
    }

    releaseEmailClaim_(order.orderId);
    return jsonResponse_({ success: true, sent: 1, orderId: orderId });
  } catch (error) {
    releaseEmailClaim_(order.orderId);
    return jsonResponse_({ success: false, error: error.toString() });
  }
}

function handleSendQrTickets() {
  const lock = LockService.getScriptLock();
  let sentCount = 0;
  const BATCH_SIZE = 40;

  try {
    const sheet = getSheet();
    const headers = readHeaders_(sheet);
    requireColumns_(headers, ["Order ID", "Payment Status", "QR Sent"]);
    const dataValues = sheet.getDataRange().getValues();

    const qrSentColIdx = headers.indexOf("QR Sent") + 1;
    const paymentStatusColIdx = headers.indexOf("Payment Status") + 1;
    const orderIdColIdx = headers.indexOf("Order ID") + 1;
    const emailColIdx = findHeaderIndex_(headers, ["College Email ID", "Email Address", "College Email"]) + 1;

    if (qrSentColIdx === 0 || paymentStatusColIdx === 0 || orderIdColIdx === 0 || emailColIdx === 0) {
      throw new Error("Missing required columns");
    }

    const ordersToProcess = [];
    for (let i = 1; i < dataValues.length; i++) {
      const paymentStatus = dataValues[i][paymentStatusColIdx - 1];
      const qrSent = dataValues[i][qrSentColIdx - 1];
      const orderId = dataValues[i][orderIdColIdx - 1];
      const email = dataValues[i][emailColIdx - 1];

      if (paymentStatus === "PAID" && qrSent !== true && qrSent !== "TRUE" && orderId && email) {
        ordersToProcess.push(readOrderForEmail_(sheet, headers, dataValues[i], i + 1));
      }
    }

    // Gmail / Apps Script enforces a HARD daily recipient cap (100/day on a
    // consumer @gmail.com account, 1500/day on Google Workspace). When it is
    // reached we stop cleanly and report it, so the operator just re-runs the
    // next day. The "QR Sent" column is written only after Gmail succeeds, so
    // a failed or interrupted send remains retryable.
    let quotaLeft = MailApp.getRemainingDailyQuota();
    let quotaExhausted = false;
    const failures = [];

    const batch = ordersToProcess.slice(0, BATCH_SIZE);

    for (let order of batch) {
      if (quotaLeft <= 0) {
        quotaExhausted = true;
        break;
      }

      // Claim the row under lock BEFORE sending so a concurrent run can't also
      // grab it. The small Script Properties claim also covers explicit
      // single-ticket resends, which intentionally ignore QR Sent=true.
      let claimed = false;
      let claimLockAcquired = false;
      try {
        lock.waitLock(LOCK_WAIT_MS);
        claimLockAcquired = true;
        const currentQrSent = sheet.getRange(order.rowIndex, qrSentColIdx).getValue();
        if (isTrue_(currentQrSent)) {
          continue; // Already sent (earlier today, a previous day, or a concurrent run)
        }
        if (!claimEmailSend_(order.orderId)) continue;
        claimed = true;
      } finally {
        if (claimLockAcquired) lock.releaseLock();
      }
      if (!claimed) continue;

      // Send outside the lock to avoid holding it during a slow network call.
      try {
        sendTicketEmail_(order);

        let finalizeLockAcquired = false;
        try {
          lock.waitLock(LOCK_WAIT_MS);
          finalizeLockAcquired = true;
          markQrSent_(sheet, order.rowIndex, qrSentColIdx);
          markDashboardQrSent_();
        } finally {
          if (finalizeLockAcquired) lock.releaseLock();
        }

        releaseEmailClaim_(order.orderId);
        sentCount++;
        quotaLeft--;
      } catch (err) {
        releaseEmailClaim_(order.orderId);
        // Leave QR Sent blank so this row is retryable, and keep going instead
        // of aborting the whole batch for one bad address.
        failures.push({ orderId: order.orderId, email: order.email, reason: String((err && err.message) || err) });
      }
    }

    if (sentCount > 0) {
      invalidateOrdersCache_();
    }

    const remaining = ordersToProcess.length - sentCount;

    return jsonResponse_({
      success: true,
      sent: sentCount,
      failed: failures.length,
      failures: failures,
      quotaExhausted: quotaExhausted,
      quotaRemaining: Math.max(0, quotaLeft),
      remaining: remaining,
      done: remaining <= 0 || quotaExhausted
    });

  } catch (error) {
    return jsonResponse_({ success: false, error: error.toString() });
  }
}
