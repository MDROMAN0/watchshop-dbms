# 🗄️ Database Implementation — Watch Business Data Management System

**CSE311L Database Systems Lab · Group 08 · Section 3 · North South University**

| Member | ID |
|---|---|
| Md Roman | 2312765042 |
| Anika Nower Nihan | 2011234642 |
| Farhan Shahriar | 2312071042 |
| Ashiqur Rahman | 2412388042 |

📄 **SQL file (schema + data): [`Group08_Watch_Business_Data_Management_System.sql`](Group08_Watch_Business_Data_Management_System.sql)**

| Requirement | Implementation |
|---|---|
| MySQL Database | `watch_business_db` — 14 tables, matching our approved ERD & Schema |
| Primary keys | Every table (`INT AUTO_INCREMENT PRIMARY KEY`) |
| Foreign keys | 14 (`FOREIGN KEY ... REFERENCES`) |
| Other constraints | `NOT NULL`, 7 `UNIQUE`, 7 `CHECK` (no negative price/stock/qty), `ENUM`, `DEFAULT` |
| Sample data | Meaningful rows in **all 14 tables** |
| Extra | 5 triggers (stock, warranty, payment status, returns) and 2 views |

**Tables:** user, brand, category, watch, supplier, purchase_order, purchase_item, customer, sale, sale_item, payment, sale_return, warranty, repair

**How to run (XAMPP):** start Apache + MySQL → `http://localhost/phpmyadmin` → **Import** → choose the `.sql` file → **Go**.
