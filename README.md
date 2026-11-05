# ⌚ WatchShop — Watch Business Data Management System

**CSE311L Database Systems Lab · Group 08 · Section 3 · North South University**

🔗 **Live demo:** https://mdroman0.github.io/watchshop-dbms/
Login: `admin@watchshop.com` / `admin123` · Salesperson: `sales@watchshop.com` / `sales123`

A real SQL database (SQLite compiled to WebAssembly via **sql.js**) runs inside the browser, with the same
tables, primary/foreign keys, CHECK/UNIQUE constraints, **5 triggers** and **2 views** as our MySQL (XAMPP) version.
Data is saved in each visitor's browser (localStorage); use **Reset data** in the sidebar to restore the sample data.

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
