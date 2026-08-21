# INVENTE 11.0 — T-Shirt Logistics & Order Management System

## 1. System Overview
**Invente T-Shirt App** is a specialized, real-time logistics and inventory tracking web application built for college symposium organizers (**Invente 11.0** at SSN College of Engineering). It manages student T-shirt pre-orders submitted via Google Forms, facilitates payment verification (UPI screenshot inspection & cash collection), and powers high-throughput on-desk physical T-shirt distribution during the event.

---

## 2. Tech Stack & Architecture

### **Frontend & Framework**
- **Framework:** Next.js 16.3.1 (App Router), React 19, TypeScript
- **Styling:** Tailwind CSS v4, custom Neo-Brutalist dark theme (`#11141c` dark charcoal, high-contrast borders, solid drop-shadows)
- **UI Components:** Lucide Icons, Radix UI primitives (`@radix-ui/react-dialog`, `@radix-ui/react-label`, `@radix-ui/react-slot`), Shadcn UI
- **State Management:** React Context (`OrdersContext`) with automatic background polling every 3 seconds + optimistic updates + exponential backoff retry.

### **Authentication & Security**
- **Auth Engine:** Lightweight JWT stored in `httpOnly` secure cookies using `jose` library (`src/lib/auth.ts`).
- **Middleware:** Next.js Edge Middleware (`src/middleware.ts`) enforcing route protection on `/dashboard`, `/orders`, `/collection`, and redirecting unauthenticated users to `/login`.
- **Users:** Configurable via `TEAM_USERS_JSON` environment variable with built-in default team accounts (`admin`, `logistics`).

### **Backend & Database**
- **Database:** Google Sheets (connected to a live Google Form responses spreadsheet).
- **Backend API:** Google Apps Script (`backend/Code.js`) deployed as a Web App (`doGet` / `doPost`).
- **Concurrency & Caching:** Uses Google Apps Script `LockService` for atomic operations / order ID generation and `CacheService` for sub-second read latencies.
- **Proxy Layer:** Next.js App Router API route (`/api/orders/route.ts`) proxies requests between the client and Google Apps Script to eliminate CORS issues and conceal backend script URLs.

---

## 3. Data Model (`Order`)

Each order represents a student registration mapped from the Google Form spreadsheet:

```typescript
export interface Order {
  _rowIndex?: number;
  "Timestamp": string;               // ISO date string from Google Form submission
  "College Email": string;           // Student's college email address
  "Digital ID": string;              // Student ID / RFID / barcode identifier
  "Register Number": string;         // University registration number
  "Name": string;                    // Full student name
  "Phone Number": string;            // Contact number
  "Year": string;                    // Academic year (e.g. 1st, 2nd, 3rd, 4th)
  "T-Shirt Size": string;            // S, M, L, XL, XXL, etc.
  "Payment Method": "UPI" | "CASH";  // ₹300 per T-Shirt
  "Payment Screenshot": string;      // Google Drive URL to payment screenshot (if UPI)
  "Order ID": string;                // Generated unique ID (e.g., INV-0001, INV-0002)
  "Payment Status": "PENDING" | "PAID";
  "Payment Verified By": string;     // Name of logistics staff who verified payment
  "Payment Verified At": string;     // ISO timestamp of verification
  "Collection Status": "NOT_COLLECTED" | "COLLECTED";
  "Collector": string;               // Name of logistics staff who handed over T-shirt
  "Collected At": string;            // ISO timestamp of collection
  "Notes": string;                   // Internal staff notes
}
```

---

## 4. Key Application Features & Workflows

### **1. Real-Time Dashboard (`/dashboard`)**
- **Metrics Overview:** Real-time counters for Total Orders, Pending Payments, Paid Orders, and Collected T-Shirts.
- **Revenue Analytics:** Expected revenue (Total × ₹300), Received revenue (Paid × ₹300), split by UPI vs Cash.
- **Size Distribution Breakdown:** Aggregated count for each size (`S`, `M`, `L`, `XL`, `XXL`) for inventory tracking.
- **Audit Activity Feed:** Chronological log of recent payment verifications and distribution handovers with staff attribution.

### **2. Order Management & Verification (`/orders` & `/orders/[id]`)**
- **Search & Filters:** Search by Order ID, Name, Reg Number, Digital ID, Phone, or Email; filter by Payment Status (`ALL`, `PAID`, `PENDING`) and Collection Status (`ALL`, `COLLECTED`, `NOT_COLLECTED`).
- **Detailed Order View:** Shows complete student details, submitted timestamp, and T-shirt size.
- **Payment Verification:** Staff can open the UPI screenshot link directly and click **"MARK AS PAID"** or **"MARK CASH RECEIVED"**, stamping their name and timestamp.
- **Staff Notes:** Shared inline notes per order for exceptions or remarks.

### **3. Rapid Distribution Kiosk (`/collection`)**
- **High-Speed Search/Scan:** Auto-focused input field designed for hardware barcode/QR scanners or fast typing.
- **Instant Recognition:** Matches when query $\ge 3$ characters by Order ID, Register Number, Digital ID, Phone Number, or Name.
- **Visual Callout:** Highlights student name, register number, and giant **T-Shirt Size display** (e.g., `XL`) to prevent desk confusion.
- **Anti-Error Guardrail:** Disables **"GIVE T-SHIRT"** button if payment status is `PENDING`.
- **One-Click Handover:** Single click marks order as `COLLECTED`, stores the collector's name & time, and resets the input for the next student.

---

## 5. End-to-End Data Flow

```
[Student fills Google Form] 
       │
       ▼
[Google Sheet: "Form Responses 1"]
       │
       ▼ (Google Apps Script: LockService + CacheService + Auto ID: INV-XXXX)
[GAS Web App: doGet / doPost]
       │
       ▼ (Proxied via /api/orders/route.ts with server credentials)
[Next.js App Router Backend]
       │
       ▼ (OrdersContext: Polls every 3s + Optimistic state updates)
[Next.js Client Pages: /dashboard | /orders | /collection]
       │
       ▼ (Staff action: Verify Payment / Handover T-Shirt)
[POST /api/orders -> GAS doPost -> Google Sheet updated -> Cache invalidated]
```

---

## 6. Directory Structure

```
.
├── backend/
│   └── Code.js                  # Google Apps Script backend (Sheet sync, ID generation, caching, locks)
├── src/
│   ├── app/
│   │   ├── (protected)/         # Authenticated route group
│   │   │   ├── collection/      # Rapid distribution kiosk (/collection)
│   │   │   ├── dashboard/       # Real-time analytics & activity feed (/dashboard)
│   │   │   ├── orders/          # Searchable orders table & [id] detail page
│   │   │   └── layout.tsx       # Protected layout with Navbar and session verification
│   │   ├── api/
│   │   │   └── orders/route.ts  # Next.js API proxy to Google Apps Script
│   │   ├── login/page.tsx       # Team login page
│   │   ├── actions.ts           # Server actions for login and logout
│   │   ├── globals.css          # Tailwind CSS v4 & Neo-Brutalist theme variables
│   │   ├── layout.tsx           # Root layout with OrdersProvider & fonts
│   │   └── page.tsx             # Root page (redirects to /dashboard)
│   ├── components/
│   │   ├── layout/Navbar.tsx    # Header with navigation, logged-in user, and logout button
│   │   └── ui/                  # Reusable UI components (button, card, badge, table, input, etc.)
│   ├── context/
│   │   └── OrdersContext.tsx    # React Context for orders data polling & sync
│   ├── lib/
│   │   ├── api.ts               # Client-side API fetchers with retries & jitter
│   │   ├── auth.ts              # JWT signing, verification, and cookie session helpers
│   │   └── utils.ts             # Tailwind class merge utility (cn)
│   └── middleware.ts            # Edge authentication middleware
├── .env.example                 # Example environment variables
├── components.json              # Shadcn configuration
└── package.json                 # Dependencies and scripts
```

---

## 7. Environment Variables Configuration

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `APPS_SCRIPT_URL` | Deployed Google Apps Script Web App URL | `https://script.google.com/macros/s/.../exec` |
| `SESSION_SECRET` | Secret key for JWT signing | 32+ character random string |
| `TEAM_USERS_JSON` | JSON array of authorized team credentials | `[{"email":"aakash@ssn.edu.in","name":"Aakash","password":"...","role":"admin"}]` |

---

## 8. Summary for LLM Context Prompts

> **Context Summary for LLMs:**
> This repository is **Invente 11.0 T-Shirt Distribution & Logistics Portal**, a Next.js 16 (React 19) web app with a Google Sheets + Google Apps Script serverless backend. It provides an authenticated, real-time portal for college event organizers to:
> 1. Monitor live T-shirt sales, size distribution, and financial revenue (`/dashboard`).
> 2. Search, inspect, verify UPI/cash payments, and edit internal notes for student orders (`/orders`, `/orders/[id]`).
> 3. Swiftly verify student identity and distribute physical T-shirts via a barcode-friendly kiosk (`/collection`).
> All updates sync bi-directionally with Google Sheets via a cached, concurrency-locked Google Apps Script Web API.
