const CACHE_KEY = "INVENTE_ORDERS_V2";
const SHEET_NAME = "Form Responses 1"; // Make sure to adjust if your sheet name is different
const CACHE_TIME = 2; // 2-second cache for ultra-fast near instantaneous updates

function doGet(e) {
  const action = e.parameter.action;
  const noCache = e.parameter.nocache === "1";
  
  if (action === "getOrders") {
    const cache = CacheService.getScriptCache();
    
    if (!noCache) {
      const cachedData = cache.get(CACHE_KEY);
      if (cachedData) {
        return ContentService.createTextOutput(cachedData).setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    // Cache miss or noCache requested, read from sheet
    const lock = LockService.getScriptLock();
    try {
      // Need a lock just in case we are generating Order IDs for new rows during this read
      lock.waitLock(10000);
      const data = getOrdersFromSheet();
      const jsonData = JSON.stringify({ success: true, data: data });
      
      cache.put(CACHE_KEY, jsonData, CACHE_TIME);
      
      return ContentService.createTextOutput(jsonData).setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() })).setMimeType(ContentService.MimeType.JSON);
    } finally {
      lock.releaseLock();
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

  const action = body.action;
  
  if (action === "sendQrTickets") {
    return handleSendQrTickets();
  }

  const lock = LockService.getScriptLock();
  
  try {
    lock.waitLock(10000);
    const sheet = getSheet();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const orderIdColIdx = headers.indexOf("Order ID") + 1;
    
    if (orderIdColIdx === 0) {
       throw new Error("Order ID column not found");
    }

    const dataRange = sheet.getDataRange();
    const dataValues = dataRange.getValues();
    let targetRowIndex = -1;
    
    // Find the row by Order ID
    for (let i = 1; i < dataValues.length; i++) {
      if (dataValues[i][orderIdColIdx - 1] === body.orderId) {
        targetRowIndex = i + 1; // +1 because rows are 1-indexed
        break;
      }
    }
    
    if (targetRowIndex === -1) {
      throw new Error("Order not found");
    }

    if (action === "updatePayment") {
      updateCell(sheet, headers, targetRowIndex, "Payment Status", body.paymentStatus || "PAID");
      updateCell(sheet, headers, targetRowIndex, "Payment Verified By", body.verifiedBy);
      updateCell(sheet, headers, targetRowIndex, "Payment Verified At", body.verifiedAt || new Date().toISOString());
    } else if (action === "updateCollection") {
      updateCell(sheet, headers, targetRowIndex, "Collection Status", body.collectionStatus || "COLLECTED");
      updateCell(sheet, headers, targetRowIndex, "Collector", body.collector);
      updateCell(sheet, headers, targetRowIndex, "Collected At", body.collectedAt || new Date().toISOString());
    } else if (action === "updateNotes") {
      updateCell(sheet, headers, targetRowIndex, "Notes", body.notes);
    } else {
      throw new Error("Unknown action");
    }
    
    // Invalidate Cache immediately
    CacheService.getScriptCache().remove(CACHE_KEY);
    
    // Return fresh updated row
    const updatedRow = sheet.getRange(targetRowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
    const updatedOrder = rowToObject(updatedRow, headers, targetRowIndex);
    
    return ContentService.createTextOutput(JSON.stringify({ success: true, data: updatedOrder })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function forceAuth() {
  GmailApp.getAliases();
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

function getOrdersFromSheet() {
  const sheet = getSheet();
  let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  // Ensure we have our custom columns
  const columnsAdded = ensureColumnsExist(sheet, headers);
  if (columnsAdded) {
     headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  }
  
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  
  const orderIdColIdx = headers.indexOf("Order ID");
  let nextOrderIdNumber = 1;
  let hasUpdates = false;
  
  // First pass: find max order ID to know where to start generating new ones
  for (let i = 1; i < values.length; i++) {
    const orderId = values[i][orderIdColIdx];
    if (orderId && typeof orderId === 'string' && orderId.startsWith("INV-")) {
      const num = parseInt(orderId.substring(4), 10);
      if (!isNaN(num) && num >= nextOrderIdNumber) {
        nextOrderIdNumber = num + 1;
      }
    }
  }

  const orders = [];
  
  // Second pass: generate missing Order IDs and build objects
  for (let i = 1; i < values.length; i++) {
    let row = values[i];
    
    // Skip completely empty rows
    if (!row || row.every(cell => cell === "" || cell === null)) {
      continue;
    }
    
    // Check if Order ID is missing
    if (!row[orderIdColIdx]) {
      const newOrderId = "INV-" + nextOrderIdNumber.toString().padStart(4, "0");
      sheet.getRange(i + 1, orderIdColIdx + 1).setValue(newOrderId);
      row[orderIdColIdx] = newOrderId;
      nextOrderIdNumber++;
      hasUpdates = true;
      
      // Default statuses for new rows
      const paymentStatusCol = headers.indexOf("Payment Status");
      if (paymentStatusCol !== -1 && !row[paymentStatusCol]) {
         sheet.getRange(i + 1, paymentStatusCol + 1).setValue("PENDING");
         row[paymentStatusCol] = "PENDING";
      }
      const collectionStatusCol = headers.indexOf("Collection Status");
      if (collectionStatusCol !== -1 && !row[collectionStatusCol]) {
         sheet.getRange(i + 1, collectionStatusCol + 1).setValue("NOT_COLLECTED");
         row[collectionStatusCol] = "NOT_COLLECTED";
      }
    }
    
    orders.push(rowToObject(row, headers, i + 1));
  }
  
  // If we made changes to the sheet (generated IDs), sync immediately
  if (hasUpdates) {
    SpreadsheetApp.flush();
  }
  
  return orders;
}

function rowToObject(row, headers, rowIndex) {
  const obj = { _rowIndex: rowIndex };
  for (let j = 0; j < headers.length; j++) {
    const key = headers[j];
    if (key) {
      let val = row[j];
      // Format timestamps for JSON
      if (val instanceof Date) {
        val = val.toISOString();
      }
      obj[key] = val;
    }
  }
  return obj;
}

// Optional trigger functions to automatically invalidate cache on edit or form submit
function onFormSubmit(e) {
  CacheService.getScriptCache().remove(CACHE_KEY);
}

function onEdit(e) {
  CacheService.getScriptCache().remove(CACHE_KEY);
}

function handleSendQrTickets() {
  const lock = LockService.getScriptLock();
  let sentCount = 0;
  const BATCH_SIZE = 40;
  
  try {
    const sheet = getSheet();
    let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // Ensure column exists
    if (ensureColumnsExist(sheet, headers)) {
      headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    }
    
    const dataRange = sheet.getDataRange();
    const dataValues = dataRange.getValues();
    
    const qrSentColIdx = headers.indexOf("QR Sent") + 1;
    const paymentStatusColIdx = headers.indexOf("Payment Status") + 1;
    const orderIdColIdx = headers.indexOf("Order ID") + 1;
    const emailColIdx = headers.indexOf("College Email ID") !== -1 ? headers.indexOf("College Email ID") + 1 : (headers.indexOf("Email Address") !== -1 ? headers.indexOf("Email Address") + 1 : headers.indexOf("College Email") + 1);
    const nameColIdx = headers.indexOf("Name") + 1;
    const regNoColIdx = headers.indexOf("Register Number") !== -1 ? headers.indexOf("Register Number") + 1 : (headers.indexOf("Reg No") !== -1 ? headers.indexOf("Reg No") + 1 : -1);
    const sizeColIdx = headers.indexOf("T-shirt size") !== -1 ? headers.indexOf("T-shirt size") + 1 : (headers.indexOf("T-Shirt Size") !== -1 ? headers.indexOf("T-Shirt Size") + 1 : -1);
    
    if (qrSentColIdx === 0 || paymentStatusColIdx === 0 || orderIdColIdx === 0 || emailColIdx === 0) {
      throw new Error("Missing required columns");
    }
    
    const ordersToProcess = [];
    
    for (let i = 1; i < dataValues.length; i++) {
      const paymentStatus = dataValues[i][paymentStatusColIdx - 1];
      const qrSent = dataValues[i][qrSentColIdx - 1];
      const orderId = dataValues[i][orderIdColIdx - 1];
      const email = dataValues[i][emailColIdx - 1];
      const name = nameColIdx > 0 ? dataValues[i][nameColIdx - 1] : "Student";
      const regNo = regNoColIdx > 0 ? dataValues[i][regNoColIdx - 1] : "";
      const size = sizeColIdx > 0 ? dataValues[i][sizeColIdx - 1] : "Unknown";
      
      if (paymentStatus === "PAID" && qrSent !== true && qrSent !== "TRUE" && orderId && email) {
        ordersToProcess.push({ rowIndex: i + 1, orderId, email, name, regNo, size });
      }
    }
    
    const batch = ordersToProcess.slice(0, BATCH_SIZE);
    
    for (let order of batch) {
      lock.waitLock(10000);
      try {
        // Read-check-write under lock
        const currentQrSent = sheet.getRange(order.rowIndex, qrSentColIdx).getValue();
        if (currentQrSent === true || currentQrSent === "TRUE") {
          continue; // Already sent by another concurrent run
        }
        
        sheet.getRange(order.rowIndex, qrSentColIdx).setValue(true);
      } finally {
        lock.releaseLock();
      }
      
      // We have marked it sent, now safely send email outside the lock to avoid timeout
      try {
        // Evaluate QrEncoder (assumes QrEncoder.js contents are accessible or we must load it via eval or it's just available in GAS)
        // Since GAS bundles files, QrEncoder is accessible if it's in the same project. We'll use the 'qrcode' global.
        const qr = qrcode(4, 'M');
        qr.addData(order.orderId);
        qr.make();
        const base64Gif = qr.createDataURL().split(',')[1];
        const blob = Utilities.base64Decode(base64Gif);
        const imageBlob = Utilities.newBlob(blob, 'image/gif', 'qrcode.gif');
        
        const htmlBody = `
          <div style="font-family: monospace; max-width: 600px; margin: 0 auto; padding: 20px; border: 2px solid #11141c; background-color: #f0f0ed; color: #11141c;">
            <h1 style="text-transform: uppercase; letter-spacing: 2px; border-bottom: 2px solid #11141c; padding-bottom: 10px;">Invente 11.0 T-Shirt Ticket</h1>
            <p><strong>Hi ${order.name},</strong></p>
            <p>Your payment has been verified. Show this QR code at the collection desk to receive your T-shirt.</p>
            
            <div style="background-color: #1a1e28; color: #f0f0ed; padding: 20px; text-align: center; border: 2px solid #11141c; margin: 20px 0;">
              <p style="font-size: 12px; letter-spacing: 2px; font-weight: bold; margin-top: 0;">ORDER ID</p>
              <h2 style="margin: 0 0 10px 0; font-size: 24px;">${order.orderId}</h2>
              ${order.regNo ? `<p style="font-size: 12px; letter-spacing: 2px; font-weight: bold; margin: 15px 0 5px 0;">REG NO</p>
              <h3 style="margin: 0 0 10px 0; font-size: 20px; color: #94a3b8;">${order.regNo}</h3>` : ''}
              <p style="font-size: 12px; letter-spacing: 2px; font-weight: bold; margin: 15px 0 5px 0;">SIZE</p>
              <h1 style="margin: 0; font-size: 36px; color: #4ade80;">${order.size}</h1>
            </div>
            
            <div style="text-align: center; margin-top: 20px;">
              <img src="cid:qrImage" style="width: 200px; height: 200px; border: 4px solid #11141c; padding: 10px; background: white;" alt="QR Code" />
            </div>
            <p style="font-size: 12px; text-align: center; margin-top: 20px; opacity: 0.7;">Note: This QR code can only be scanned once.</p>
          </div>
        `;
        
        GmailApp.sendEmail(order.email, "Your Invente 11.0 T-Shirt QR Ticket", "Please enable HTML emails.", {
          htmlBody: htmlBody,
          inlineImages: {
            qrImage: imageBlob
          }
        });
        
        sentCount++;
      } catch (err) {
        // Revert the flag so we can retry later.
        lock.waitLock(10000);
        try {
          sheet.getRange(order.rowIndex, qrSentColIdx).setValue("");
        } finally {
          lock.releaseLock();
        }
        // Throw the error so it propagates to the frontend and we can see EXACTLY why it's failing!
        throw new Error("Failed on " + order.email + ". Reason: " + err.message);
      }
    }
    
    if (sentCount > 0) {
      CacheService.getScriptCache().remove(CACHE_KEY);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      sent: sentCount,
      remaining: ordersToProcess.length - sentCount,
      done: (ordersToProcess.length - sentCount) <= 0
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}
