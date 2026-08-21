import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbwGAYpvz3geFBxmK_YYQGZwJUPgwe7_mIzTs55uFc6tjHWTnrYWBrmWjjTorFS43WQ8/exec";
const APPS_SCRIPT_URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL || process.env.APPS_SCRIPT_URL || DEFAULT_GAS_URL;

export async function POST(request: Request) {
  try {
    const session = await getSession();
    
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ success: false, error: "Forbidden: Admin access required." }, { status: 403 });
    }

    if (!APPS_SCRIPT_URL) {
      return NextResponse.json({ success: false, error: "APPS_SCRIPT_URL is not set in environment" }, { status: 500 });
    }

    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({ action: "sendQrTickets" }),
    });

    if (!response.ok) {
      throw new Error(`Google Apps Script responded with ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("API proxy error (POST sendQrTickets):", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to trigger QR ticketing" }, { status: 500 });
  }
}
