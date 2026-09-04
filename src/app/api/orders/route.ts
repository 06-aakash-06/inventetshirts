import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbwGAYpvz3geFBxmK_YYQGZwJUPgwe7_mIzTs55uFc6tjHWTnrYWBrmWjjTorFS43WQ8/exec";
// Prefer the server-only variable. NEXT_PUBLIC_ is a fallback for existing deploys
// but ships the URL to the browser — migrate to APPS_SCRIPT_URL.
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || process.env.NEXT_PUBLIC_APPS_SCRIPT_URL || DEFAULT_GAS_URL;
const APPS_SCRIPT_TOKEN = process.env.APPS_SCRIPT_TOKEN || "";

function withToken(url: string) {
  if (!APPS_SCRIPT_TOKEN) return url;
  return url + (url.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(APPS_SCRIPT_TOKEN);
}

async function requireSession() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(request: Request) {
  const unauth = await requireSession();
  if (unauth) return unauth;

  try {
    if (!APPS_SCRIPT_URL) {
      return NextResponse.json({ success: false, error: "APPS_SCRIPT_URL is not set in environment" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "getOrders";

    const response = await fetch(withToken(`${APPS_SCRIPT_URL}?action=${encodeURIComponent(action)}`), {
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
  const unauth = await requireSession();
  if (unauth) return unauth;

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
