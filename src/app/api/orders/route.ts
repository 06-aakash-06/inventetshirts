import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

// Actions that require admin/head access — must also be blocked here since this
// route forwards the request body to Apps Script verbatim (defense in depth
// alongside the dedicated admin-gated /api/orders/send-qr-tickets route).
const ADMIN_ONLY_ACTIONS = new Set(["sendQrTickets"]);

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || "";
const APPS_SCRIPT_TOKEN = process.env.APPS_SCRIPT_TOKEN || "";

function withToken(url: string) {
  if (!APPS_SCRIPT_TOKEN) return url;
  return url + (url.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(APPS_SCRIPT_TOKEN);
}

// Mirrors the normalization in src/lib/api.ts's getOrders() — the sheet's raw
// header can be "Payment Method - Rs. 300" or "Payment Method".
function isCashOrder(rawOrder: any): boolean {
  const method = (rawOrder?.["Payment Method - Rs. 300"] || rawOrder?.["Payment Method"] || "").toString().toUpperCase();
  return !method.includes("UPI");
}

// Looks up an order's real stored payment method directly from Apps Script
// (the source of truth) rather than trusting a client-supplied value, so a
// member can't just lie about the method to verify a cash payment.
async function fetchOrderPaymentMethod(orderId: string): Promise<"UPI" | "CASH" | null> {
  const response = await fetch(withToken(`${APPS_SCRIPT_URL}?action=getOrder&ref=${encodeURIComponent(orderId)}`), {
    method: "GET",
    cache: "no-store",
  });
  if (!response.ok) return null;
  const data = await response.json();
  if (!data?.success || !data.data) return null;
  const match = data.data;
  return isCashOrder(match) ? "CASH" : "UPI";
}

async function requireSession() {
  const session = await getSession();
  if (!session) {
    return { session: null, error: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
  }
  return { session, error: null };
}

export async function GET(request: Request) {
  const { error } = await requireSession();
  if (error) return error;

  try {
    if (!APPS_SCRIPT_URL) {
      return NextResponse.json({ success: false, error: "APPS_SCRIPT_URL is not set in environment" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "getOrders";
    const upstreamParams = new URLSearchParams({ action });
    if (action === "getOrder") {
      const reference = searchParams.get("ref") || searchParams.get("orderId") || searchParams.get("token");
      if (reference) upstreamParams.set("ref", reference);
    }

    const response = await fetch(withToken(`${APPS_SCRIPT_URL}?${upstreamParams.toString()}`), {
      method: "GET",
      cache: "no-store",
      signal: request.signal,
    });

    if (!response.ok) {
      throw new Error(`Google Apps Script responded with ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("API proxy error (GET):", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to fetch from Google Apps Script" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { session, error } = await requireSession();
  if (error) return error;

  try {
    if (!APPS_SCRIPT_URL) {
      return NextResponse.json({ success: false, error: "APPS_SCRIPT_URL is not set in environment" }, { status: 500 });
    }

    const body = await request.json();

    if (ADMIN_ONLY_ACTIONS.has(body?.action) && session!.user.role !== "admin") {
      return NextResponse.json({ success: false, error: "Forbidden: Admin access required." }, { status: 403 });
    }

    if (body?.action === "updatePayment" && body?.paymentStatus === "PAID" && session!.user.role !== "admin") {
      const method = await fetchOrderPaymentMethod(body.orderId);
      // Fail closed: if the order can't be found/confirmed, don't let a non-admin verify it.
      if (method !== "UPI") {
        return NextResponse.json({ success: false, error: "Forbidden: Cash payments can only be verified by heads." }, { status: 403 });
      }
    }

    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(APPS_SCRIPT_TOKEN ? { ...body, token: APPS_SCRIPT_TOKEN } : body),
    });

    if (!response.ok) {
      throw new Error(`Google Apps Script responded with ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("API proxy error (POST):", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to update Google Apps Script" }, { status: 500 });
  }
}
