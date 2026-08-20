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
}

const API_URL = "/api/orders";

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
    const response = await fetch(`${API_URL}?action=getOrders`, {
      method: "GET",
      // Next.js specific to avoid hard caching since we poll
      cache: "no-store",
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    
    // Normalize keys from messy Google Form headers
    const normalizedData = data.data.map((order: any) => ({
      ...order,
      "T-Shirt Size": order["T-shirt size"] || order["T-Shirt Size"] || "",
      "Payment Method": (order["Payment Method - Rs. 300"] || order["Payment Method"] || "").toString().toUpperCase().includes("UPI") ? "UPI" : "CASH",
      "Payment Screenshot": order["Payment UPI (Upload screenshot if payment done through UPI)"] || order["Payment Screenshot"] || "",
      "College Email": order["College Email ID"] || order["Email Address"] || order["College Email"] || "",
    }));

    return normalizedData;
  } catch (error) {
    // Don't console.error here to avoid spamming the console on transient background polling drops
    throw error;
  }
}

export async function updatePayment(orderId: string, verifiedBy: string, status: "PAID" = "PAID") {
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

export async function updateCollection(orderId: string, collector: string, status: "COLLECTED" = "COLLECTED") {
  return fetchWithRetry(API_URL, {
    method: "POST",
    body: JSON.stringify({
      action: "updateCollection",
      orderId,
      collectionStatus: status,
      collector,
      collectedAt: new Date().toISOString()
    })
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
