const CACHE_KEY = "INVENTE_ORDERS_V2";
const SHEET_NAME = "Form Responses 1"; // Make sure to adjust if your sheet name is different
const CACHE_TIME = 5; // 5-second cache to allow real-time new form submissions while buffering simultaneous team polls

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
    "Collection Status", "Collector", "Collected At", "Notes"
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
