import { NextResponse } from "next/server";

const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbwGAYpvz3geFBxmK_YYQGZwJUPgwe7_mIzTs55uFc6tjHWTnrYWBrmWjjTorFS43WQ8/exec";
const APPS_SCRIPT_URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL || process.env.APPS_SCRIPT_URL || DEFAULT_GAS_URL;

export async function GET(request: Request) {
  try {
    if (!APPS_SCRIPT_URL) {
      return NextResponse.json({ success: false, error: "APPS_SCRIPT_URL is not set in environment" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "getOrders";

    const response = await fetch(`${APPS_SCRIPT_URL}?action=${action}`, {
      method: "GET",
      cache: "no-store",
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
  try {
    if (!APPS_SCRIPT_URL) {
      return NextResponse.json({ success: false, error: "APPS_SCRIPT_URL is not set in environment" }, { status: 500 });
    }

    const body = await request.json();

    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(body),
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
