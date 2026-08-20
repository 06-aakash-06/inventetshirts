# How to Run

## Prerequisites
- Node.js (v18+)

## 1. Environment Setup
Create a `.env` file in the root if you haven't already. (You can copy `.env.example`).
Ensure it contains:
```env
NEXT_PUBLIC_APPS_SCRIPT_URL="YOUR_GAS_WEB_APP_URL"
SESSION_SECRET="your_very_secret_key"
TEAM_USERS_JSON='[{"email":"test@ssn.edu.in", "name":"Test User", "password":"password", "role":"admin"}]'
```
*(Note: If you haven't deployed the Google Apps Script yet, the Next.js app will load, but fetching orders will fail).*

## 2. Install Dependencies
```bash
npm install
```

## 3. Run the Development Server
```bash
npm run dev
```

## 4. Usage
Open [http://localhost:3000](http://localhost:3000) in your browser.
Log in with the credentials defined in your `.env` (e.g., Email: `test@ssn.edu.in`, Password: `password`).
