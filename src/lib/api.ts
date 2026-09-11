export interface Order {
  _rowIndex?: number;
  "Timestamp": string;
  "College Email": string;
  "Digital ID": string;
  "Register Number": string;
  "Name": string;
  "Phone Number": string;
  "Year": string;
  "T-Shirt Size": string;
  "Payment Method": "UPI" | "CASH";
  "Payment Screenshot": string;
  "Order ID": string;
  "Payment Status": "PENDING" | "PAID";
  "Payment Verified By": string;
  "Payment Verified At": string;
  "Collection Status": "NOT_COLLECTED" | "COLLECTED";
  "Collector": string;
  "Collected At": string;
  "Notes": string;
  "QR Sent": boolean;
}

const API_URL = "/api/orders";
const READ_TIMEOUT_MS = 20000;
type RawOrder = Record<string, unknown>;

async function fetchJsonWithTimeout(url: string, options: RequestInit = {}, timeoutMs = READ_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return await response.json();
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("The order service took too long to respond. Showing the last available data.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// Custom fetch with retry and jitter for mutation requests
async function fetchWithRetry(url: string, options: RequestInit, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error("Network response was not ok");
      const data = await response.json();
      if (!data.success) throw new Error(data.error || "API error");
      return data;
    } catch (error) {
      if (i === retries - 1) throw error;
      const jitter = Math.floor(Math.random() * 500);
      await new Promise(res => setTimeout(res, 1000 * (i + 1) + jitter));
    }
  }
}

export async function getOrders(): Promise<Order[]> {
  try {
    const data = await fetchJsonWithTimeout(`${API_URL}?action=getOrders`, {
      method: "GET",
      // Next.js specific to avoid hard caching since we poll
      cache: "no-store",
    });
    if (!data.success) throw new Error(data.error);
    
    // Normalize keys from messy Google Form headers
    const normalizedData = data.data.map((order: RawOrder) => ({
      ...order,
      "T-Shirt Size": order["Select T-shirt size (With size chart for reference)"] || order["T-shirt size"] || order["T-Shirt Size"] || "",
      "Payment Method": (order["Payment Method - Rs. 300"] || order["Payment Method"] || "").toString().toUpperCase().includes("UPI") ? "UPI" : "CASH",
      "Payment Screenshot": order["Payment UPI (Upload screenshot if payment done through UPI)"] || order["Payment Screenshot"] || "",
      "College Email": order["College Email ID"] || order["Email Address"] || order["College Email"] || "",
      "QR Sent": order["QR Sent"] === true || order["QR Sent"] === "TRUE",
    }));

    return normalizedData;
  } catch (error) {
    // Don't console.error here to avoid spamming the console on transient background polling drops
    throw error;
  }
}

export interface DashboardActivity {
  id: string;
  type: "payment" | "collection";
  orderId: string;
  timestamp: string;
  user: string;
  description: string;
}

export interface DashboardSummary {
  totalOrders: number;
  paidOrders: number;
  collectedOrders: number;
  paidNoQrOrders: number;
  upiOrders: number;
  cashOrders: number;
  sizes: Record<string, number>;
  activities: DashboardActivity[];
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const data = await fetchJsonWithTimeout(`${API_URL}?action=getDashboardSummary`, {
    method: "GET",
    cache: "no-store",
  });
  if (!data.success) throw new Error(data.error || "Failed to fetch dashboard summary");
  return data.data;
}

export async function updatePayment(orderId: string, verifiedBy: string, status: "PAID" | "PENDING" = "PAID") {
  return fetchWithRetry(API_URL, {
    method: "POST",
    body: JSON.stringify({
      action: "updatePayment",
      orderId,
      paymentStatus: status,
      verifiedBy,
      verifiedAt: new Date().toISOString()
    })
  });
}

export async function updateCollection(
  ref: { orderId?: string; token?: string },
  collector: string,
  status: "COLLECTED" | "NOT_COLLECTED" = "COLLECTED"
) {
  return fetchWithRetry(API_URL, {
    method: "POST",
    body: JSON.stringify({
      action: "updateCollection",
      orderId: ref.orderId,
      token: ref.token,
      collectionStatus: status,
      collector,
      collectedAt: new Date().toISOString()
    })
  });
}

// Force-send (or resend) one ticket, ignoring the QR Sent flag.
export async function sendSingleTicket(orderId: string) {
  return fetchWithRetry(API_URL, {
    method: "POST",
    body: JSON.stringify({ action: "sendSingleQr", orderId })
  });
}

export async function updateNotes(orderId: string, notes: string) {
  return fetchWithRetry(API_URL, {
    method: "POST",
    body: JSON.stringify({
      action: "updateNotes",
      orderId,
      notes
    })
  });
}

export interface QrBatchResult {
  success: true;
  sent: number;
  failed: number;
  failures: Array<{ orderId: string; email: string; reason: string }>;
  quotaExhausted: boolean;
  quotaRemaining: number;
  remaining: number;
  done: boolean;
}

export async function sendQrTicketsBatch(): Promise<QrBatchResult> {
  const response = await fetch("/api/orders/send-qr-tickets", {
    method: "POST",
    cache: "no-store",
  });
  if (!response.ok) {
    if (response.status === 403) throw new Error("Forbidden: Admin access required.");
    throw new Error("Failed to send QR tickets.");
  }
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || "Failed to send QR tickets.");
  }
  return data;
}

// Recipients Gmail will still let this Apps Script send today.
// Returns -1 if the count could not be read.
export async function getEmailQuota(): Promise<number> {
  try {
    const res = await fetch(`${API_URL}?action=getQuota`, { method: "GET", cache: "no-store" });
    const data = await res.json();
    return data?.success ? (data.remaining ?? -1) : -1;
  } catch {
    return -1;
  }
}
