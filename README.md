# ⌚ WatchShop — Watch Business Data Management System

**CSE311L Database Systems Lab · Group 08 · Section 3 · North South University**

🔗 **Live demo:** https://mdroman0.github.io/watchshop-dbms/
Login: `admin@watchshop.com` / `admin123` · Salesperson: `sales@watchshop.com` / `sales123`

A real SQL database (SQLite compiled to WebAssembly via **sql.js**) runs inside the browser, with the same
tables, primary/foreign keys, CHECK/UNIQUE constraints, **5 triggers** and **2 views** as our MySQL (XAMPP) version.
Data is saved in each visitor's browser (localStorage); use **Reset data** in the sidebar to restore the sample data.

## 🗄️ Database Implementation (CSE311L submission)

**SQL file: [`database/watchshop.sql`](database/watchshop.sql)** — pure MySQL (schema + data), built from our approved ERD & Schema.

| Item | Details |
|---|---|
| Tables | 14 — user, brand, category, watch, supplier, purchase_order, purchase_item, customer, sale, sale_item, payment, sale_return, warranty, repair |
| Primary keys | Every table (`INT AUTO_INCREMENT PRIMARY KEY`) |
| Foreign keys | 14 (`FOREIGN KEY ... REFERENCES`, with `ON DELETE CASCADE` on child rows) |
| Other constraints | `NOT NULL`, `UNIQUE` (email, phone, brand, serial no, 1:1 warranty/return), `CHECK` (no negative price/stock/qty), `ENUM` (role, status, payment method), `DEFAULT` |
| Sample data | Meaningful rows in **all 14 tables** |
| Extra | 5 triggers (stock, warranty, payment status, returns) and 2 views |

**Run it:** XAMPP → start Apache + MySQL → `http://localhost/phpmyadmin` → **Import** → choose `database/watchshop.sql` → **Go**.

## Features
- **Inventory** — watches with photos, brands, categories, live stock, low-stock alerts
- **Purchases** — purchase orders; marking *Received* adds stock (trigger)
- **Sales** — multi-item invoices, discounts, Cash/bKash/Nagad/Card, partial payments (Paid/Partial/Due by trigger)
- **Returns & refunds** — stock goes back and the warranty is voided (trigger)
- **Warranty & repair** — warranty auto-created on sale (trigger); repair status tracking
- **Reports** — max sales day, top 5 watches & customers, profit, dues, sales by brand/category/month/weekday
- **Roles** — Admin / Salesperson · **SQL Console** to run live queries · Bangla/English · dark/light theme

## Team
| Name | ID | Role |
|---|---|---|
| Md Roman | 2312765042 | UI & Database Integration |
| Anika Nower Nihan | 2011234642 | Database Designer (ER, schema) |
| Farhan Shahriar | 2312071042 | SQL Developer (inventory, purchase) |
| Ashiqur Rahman | 2412388042 | SQL Developer (sales, reports) |

## Files
- `index.html`, `app.js`, `assets/` — the web app · `schema.sql` — SQLite schema + sample data
- `mysql_database.sql` — the MySQL/XAMPP schema (tables, triggers, views, sample data)
