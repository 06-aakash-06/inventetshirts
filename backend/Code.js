const CACHE_KEY = "INVENTE_ORDERS_V2";
const SHEET_NAME = "Form Responses 1"; // Make sure to adjust if your sheet name is different
const CACHE_TIME = 2; // 2-second cache for ultra-fast near instantaneous updates

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

  if (action === "getOrders") {
    const cache = CacheService.getScriptCache();

    if (!noCache) {
      const cachedData = cache.get(CACHE_KEY);
      if (cachedData) {
        return ContentService.createTextOutput(cachedData).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // Cache miss. This is now a pure read — it never writes to the sheet.
    try {
      const data = getOrdersFromSheet();
      const jsonData = JSON.stringify({ success: true, data: data });
      cache.put(CACHE_KEY, jsonData, CACHE_TIME);
      return ContentService.createTextOutput(jsonData).setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Invalid action" })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Invalid JSON" })).setMimeType(ContentService.MimeType.JSON);
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

  try {
    lock.waitLock(10000);
    const sheet = getSheet();
    let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (ensureColumnsExist(sheet, headers)) {
      headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    }

    // We hold the lock anyway — solidify any Order IDs that the form-submit
    // trigger has not filled in yet, so IDs are stable for everyone.
    persistPendingIds_(sheet, headers);

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

    const dataValues = sheet.getDataRange().getValues();
    let targetRowIndex = -1;
    for (let i = 1; i < dataValues.length; i++) {
      if (dataValues[i][orderIdColIdx - 1] === orderId) {
        targetRowIndex = i + 1;
        break;
      }
    }
    if (targetRowIndex === -1) {
      throw new Error("Order not found");
    }
    const targetRow = dataValues[targetRowIndex - 1];
    const col = function (name) { return headers.indexOf(name); };

    if (action === "updatePayment") {
      const status = body.paymentStatus || "PAID";
      if (status === "PAID") {
        updateCell(sheet, headers, targetRowIndex, "Payment Status", "PAID");
        updateCell(sheet, headers, targetRowIndex, "Payment Verified By", body.verifiedBy);
        updateCell(sheet, headers, targetRowIndex, "Payment Verified At", body.verifiedAt || new Date().toISOString());
      } else {
        // Undo verification.
        updateCell(sheet, headers, targetRowIndex, "Payment Status", "PENDING");
        updateCell(sheet, headers, targetRowIndex, "Payment Verified By", "");
        updateCell(sheet, headers, targetRowIndex, "Payment Verified At", "");
      }
    } else if (action === "updateCollection") {
      const status = body.collectionStatus || "COLLECTED";
      if (status === "COLLECTED") {
        const paid = targetRow[col("Payment Status")] === "PAID";
        const qrSent = targetRow[col("QR Sent")] === true || targetRow[col("QR Sent")] === "TRUE";
        if (!paid) throw new Error("Payment is not verified for this order");
        if (!qrSent && !body.force) throw new Error("Ticket has not been emailed yet");
        updateCell(sheet, headers, targetRowIndex, "Collection Status", "COLLECTED");
        updateCell(sheet, headers, targetRowIndex, "Collector", body.collector);
        updateCell(sheet, headers, targetRowIndex, "Collected At", body.collectedAt || new Date().toISOString());
      } else {
        // Undo collection.
        updateCell(sheet, headers, targetRowIndex, "Collection Status", "NOT_COLLECTED");
        updateCell(sheet, headers, targetRowIndex, "Collector", "");
        updateCell(sheet, headers, targetRowIndex, "Collected At", "");
      }
    } else if (action === "updateNotes") {
      updateCell(sheet, headers, targetRowIndex, "Notes", body.notes);
    } else {
      throw new Error("Unknown action");
    }

    CacheService.getScriptCache().remove(CACHE_KEY);

    const updatedRow = sheet.getRange(targetRowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
    const updatedOrder = rowToObject(updatedRow, headers, targetRowIndex);

    return ContentService.createTextOutput(JSON.stringify({ success: true, data: updatedOrder })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
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
  return ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
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
    CacheService.getScriptCache().remove(CACHE_KEY);
  }
}

// Pure read. Rows still missing an Order ID (form-submit trigger hasn't fired
// yet) get a deterministic in-memory ID; the trigger / next write persists it.
function getOrdersFromSheet() {
  const sheet = getSheet();
  let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headers.indexOf("Order ID") === -1) {
    // First run ever — we have to create the columns once.
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      ensureColumnsExist(sheet, headers);
      headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    } finally {
      lock.releaseLock();
    }
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

function rowToObject(row, headers, rowIndex) {
  const obj = { _rowIndex: rowIndex };
  for (let j = 0; j < headers.length; j++) {
    const key = headers[j];
    if (key) {
      let val = row[j];
      if (val instanceof Date) val = val.toISOString();
      obj[key] = val;
    }
  }
  return obj;
}

// Installable "on form submit" trigger — see setupTriggers().
function onFormSubmit(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = getSheet();
    let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (ensureColumnsExist(sheet, headers)) {
      headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    }
    persistPendingIds_(sheet, headers);
  } catch (err) {
    // Never let a trigger failure block form submissions.
  } finally {
    lock.releaseLock();
    CacheService.getScriptCache().remove(CACHE_KEY);
  }
}

function onEdit(e) {
  CacheService.getScriptCache().remove(CACHE_KEY);
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
  try {
    lock.waitLock(10000);
    const sheet = getSheet();
    let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (ensureColumnsExist(sheet, headers)) {
      headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    }
    const qrSentColIdx = headers.indexOf("QR Sent") + 1;
    const paymentStatusCol = headers.indexOf("Payment Status");
    const orderIdCol = headers.indexOf("Order ID");

    const values = sheet.getDataRange().getValues();
    let rowNumber = -1;
    for (let i = 1; i < values.length; i++) {
      if (values[i][orderIdCol] === orderId) { rowNumber = i + 1; break; }
    }
    if (rowNumber === -1) throw new Error("Order not found");

    const row = values[rowNumber - 1];
    if (row[paymentStatusCol] !== "PAID") throw new Error("Payment is not verified for this order");

    const order = readOrderForEmail_(sheet, headers, row, rowNumber);
    if (!order.email) throw new Error("No email address on file for this order");
    sendTicketEmail_(order);
    sheet.getRange(rowNumber, qrSentColIdx).setValue(true);
    SpreadsheetApp.flush();
    CacheService.getScriptCache().remove(CACHE_KEY);

    return ContentService.createTextOutput(JSON.stringify({ success: true, sent: 1, orderId: orderId })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function handleSendQrTickets() {
  const lock = LockService.getScriptLock();
  let sentCount = 0;
  const BATCH_SIZE = 40;

  try {
    const sheet = getSheet();
    let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    if (ensureColumnsExist(sheet, headers)) {
      headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    }

    const dataValues = sheet.getDataRange().getValues();

    const qrSentColIdx = headers.indexOf("QR Sent") + 1;
    const paymentStatusColIdx = headers.indexOf("Payment Status") + 1;
    const orderIdColIdx = headers.indexOf("Order ID") + 1;
    const emailColIdx = headers.indexOf("College Email ID") !== -1 ? headers.indexOf("College Email ID") + 1 : (headers.indexOf("Email Address") !== -1 ? headers.indexOf("Email Address") + 1 : headers.indexOf("College Email") + 1);

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
    // next day. The "QR Sent" column is the permanent guard against
    // double-sending: a row is marked TRUE while it is being sent and rolled
    // back to blank only if that send throws, so a row that has ever been
    // emailed stays TRUE forever. Tomorrow's run therefore skips every row
    // sent today and picks up exactly the ones that were quota-skipped.
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
      // grab it. If the send then fails we roll the claim back below.
      let claimed = false;
      lock.waitLock(10000);
      try {
        const currentQrSent = sheet.getRange(order.rowIndex, qrSentColIdx).getValue();
        if (currentQrSent === true || currentQrSent === "TRUE") {
          continue; // Already sent (earlier today, a previous day, or a concurrent run)
        }
        sheet.getRange(order.rowIndex, qrSentColIdx).setValue(true);
        SpreadsheetApp.flush();
        claimed = true;
      } finally {
        lock.releaseLock();
      }
      if (!claimed) continue;

      // Send outside the lock to avoid holding it during a slow network call.
      try {
        sendTicketEmail_(order);
        sentCount++;
        quotaLeft--;
      } catch (err) {
        // Roll the claim back so this row is retried on the next run, and keep
        // going instead of aborting the whole batch for one bad address.
        lock.waitLock(10000);
        try {
          sheet.getRange(order.rowIndex, qrSentColIdx).setValue("");
          SpreadsheetApp.flush();
        } finally {
          lock.releaseLock();
        }
        failures.push({ orderId: order.orderId, email: order.email, reason: String((err && err.message) || err) });
      }
    }

    if (sentCount > 0) {
      CacheService.getScriptCache().remove(CACHE_KEY);
    }

    const remaining = ordersToProcess.length - sentCount;

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      sent: sentCount,
      failed: failures.length,
      failures: failures,
      quotaExhausted: quotaExhausted,
      quotaRemaining: Math.max(0, quotaLeft),
      remaining: remaining,
      done: remaining <= 0 || quotaExhausted
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}
