# Mother's Hut — Guest Intelligence & Messaging Portal

A responsive full-stack restaurant guest management, dining group messaging, Google Sheets synchronization, upcoming birthday greetings (next 7 days), and **SMS-only demo** portal for **Mother's Hut**.

> **Messaging Notice:** All SMS sending runs in **DEMO MODE – SIMULATED SMS**. No real SMS gateway or WhatsApp integration is active.

---

## Key Capabilities

1. **Overview**
   - Password-protected **Total Revenue** card (`** ₹` + INR icon protected by PIN `2004`), Total Customers, Birthdays Under 7 Days, Guest Group distribution, Popular Food Categories, Recent Visits, and Latest Sent Messages.
2. **Guest Groups & Group Profiles**
   - Organizes guests into 4 intuitive groups (**Frequent Visitors**, **Premium Customers**, **Family Visitors**, **Coupon Grabbers**).
   - Every portal message begins with `Hi {customer_name}, Greetings from Mother's Hut! `.
   - **Premium Customers** receive dignified, standard VIP hospitality messages with **no promotional offers or coupon codes**.
3. **Guest Directory (`Customers`)**
   - Displays `Customer ID`, `Name`, `Contact`, `Age`, `DOB`, `Total Spend`, `Avg / Visit`, `Fav Dish`, `Rating`, and `Cluster Type`.
   - Supports live **CSV import**, **Add / Edit Guest** (automatically recalculating `Avg / Visit = Total Spend / Total Visits`), and **Google Sheets Order Sync**.
4. **Google Sheets Auto `Avg / Visit` + API Key**
   - `google-sheets/apps-script/Code.gs` writes live sheet formula `=IF(I{row}>0, ROUND(J{row}/I{row}, 2), 0)` in Column K (`avg_spend_per_visit_inr`) and syncs orders/edits to `/api/sheets/sync` using the `X-API-Key` header (`SHEETS_API_KEY`).
5. **Upcoming Birthdays (Next 7 Days)**
   - Shows guests whose birthdays are within **0–7 days** (`Today`, `Tomorrow`, `2–7 Days`), generating tailored **advance birthday wishes** per guest group while keeping **Premium Customers** coupon-free.
6. **Guest Alerts**
   - Retains Tiles/List view, search/group filters, password-protected Potential Revenue (`* ₹`, PIN `2004`), 2-column Guest Profile modal, and Bulk SMS simulation.

---

## Environment Variables (`.env`)

Copy `.env.example` to `.env`:

- `SHEETS_API_KEY`: Shared API key sent by Google Apps Script (`X-API-Key` header) to `/api/sheets/sync`.
- `PORT`: Defaults to `3000`.
