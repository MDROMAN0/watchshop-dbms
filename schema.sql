-- =====================================================================
--  Watch Business Data Management System | CSE311L Group 08
--  Browser edition: the same schema running on SQLite (sql.js / WebAssembly)
--  (MySQL/XAMPP version: database.sql in the XAMPP project)
-- =====================================================================
PRAGMA foreign_keys = ON;

CREATE TABLE user (
  user_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email     TEXT NOT NULL UNIQUE,
  password  TEXT NOT NULL,                       -- SHA-256 hash
  phone     TEXT,
  role      TEXT NOT NULL DEFAULT 'Salesperson' CHECK (role IN ('Admin','Salesperson'))
);
CREATE TABLE brand (
  brand_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  brand_name TEXT NOT NULL UNIQUE,
  country    TEXT
);
CREATE TABLE category (
  category_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  category_name TEXT NOT NULL UNIQUE
);
CREATE TABLE watch (
  watch_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  model_name      TEXT NOT NULL,
  brand_id        INTEGER NOT NULL REFERENCES brand(brand_id),
  category_id     INTEGER NOT NULL REFERENCES category(category_id),
  purchase_price  REAL NOT NULL CHECK (purchase_price >= 0),
  sale_price      REAL NOT NULL CHECK (sale_price >= 0),
  stock_qty       INTEGER NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  reorder_level   INTEGER NOT NULL DEFAULT 3,
  warranty_months INTEGER NOT NULL DEFAULT 12,
  image           TEXT
);
CREATE TABLE supplier (
  supplier_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_name TEXT NOT NULL,
  phone TEXT, email TEXT, address TEXT
);
CREATE TABLE purchase_order (
  po_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL REFERENCES supplier(supplier_id),
  created_by  INTEGER NOT NULL REFERENCES user(user_id),
  order_date  TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Received','Cancelled')),
  total_cost  REAL NOT NULL DEFAULT 0
);
CREATE TABLE purchase_item (
  po_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id      INTEGER NOT NULL REFERENCES purchase_order(po_id) ON DELETE CASCADE,
  watch_id   INTEGER NOT NULL REFERENCES watch(watch_id),
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost  REAL NOT NULL
);
CREATE TABLE customer (
  customer_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT NOT NULL,
  phone         TEXT NOT NULL UNIQUE,
  email TEXT, address TEXT
);
CREATE TABLE sale (
  sale_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id    INTEGER NOT NULL REFERENCES customer(customer_id),
  salesperson_id INTEGER NOT NULL REFERENCES user(user_id),
  sale_date      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  discount       REAL NOT NULL DEFAULT 0,
  total_amount   REAL NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'Due' CHECK (payment_status IN ('Paid','Partial','Due'))
);
CREATE TABLE sale_item (
  sale_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id      INTEGER NOT NULL REFERENCES sale(sale_id) ON DELETE CASCADE,
  watch_id     INTEGER NOT NULL REFERENCES watch(watch_id),
  serial_no    TEXT NOT NULL UNIQUE,
  quantity     INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price   REAL NOT NULL
);
CREATE TABLE payment (
  payment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id    INTEGER NOT NULL REFERENCES sale(sale_id) ON DELETE CASCADE,
  amount     REAL NOT NULL CHECK (amount > 0),
  method     TEXT NOT NULL CHECK (method IN ('Cash','bKash','Nagad','Card')),
  paid_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE sale_return (
  return_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_item_id  INTEGER NOT NULL UNIQUE REFERENCES sale_item(sale_item_id) ON DELETE CASCADE,
  return_date   TEXT NOT NULL,
  reason        TEXT NOT NULL,
  refund_amount REAL NOT NULL CHECK (refund_amount >= 0)
);
CREATE TABLE warranty (
  warranty_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_item_id INTEGER NOT NULL UNIQUE REFERENCES sale_item(sale_item_id) ON DELETE CASCADE,
  start_date   TEXT NOT NULL,
  end_date     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Void'))
);
CREATE TABLE repair (
  repair_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  warranty_id    INTEGER NOT NULL REFERENCES warranty(warranty_id) ON DELETE CASCADE,
  received_date  TEXT NOT NULL,
  issue          TEXT NOT NULL,
  repair_cost    REAL NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'Received' CHECK (status IN ('Received','In Repair','Ready','Delivered')),
  delivered_date TEXT
);

-- ---------------------------- TRIGGERS ------------------------------
CREATE TRIGGER trg_sale_item_check BEFORE INSERT ON sale_item
WHEN (SELECT stock_qty FROM watch WHERE watch_id = NEW.watch_id) < NEW.quantity
BEGIN SELECT RAISE(ABORT, 'Not enough stock for this watch'); END;

CREATE TRIGGER trg_sale_item_after AFTER INSERT ON sale_item
BEGIN
  UPDATE watch SET stock_qty = stock_qty - NEW.quantity WHERE watch_id = NEW.watch_id;
  INSERT INTO warranty (sale_item_id, start_date, end_date, status)
  SELECT NEW.sale_item_id, date(s.sale_date), date(s.sale_date, '+' || w.warranty_months || ' months'), 'Active'
  FROM sale s, watch w WHERE s.sale_id = NEW.sale_id AND w.watch_id = NEW.watch_id;
END;

CREATE TRIGGER trg_po_received AFTER UPDATE OF status ON purchase_order
WHEN NEW.status = 'Received' AND OLD.status <> 'Received'
BEGIN
  UPDATE watch SET stock_qty = stock_qty +
    (SELECT COALESCE(SUM(quantity),0) FROM purchase_item WHERE po_id = NEW.po_id AND watch_id = watch.watch_id)
  WHERE watch_id IN (SELECT watch_id FROM purchase_item WHERE po_id = NEW.po_id);
END;

CREATE TRIGGER trg_payment_after AFTER INSERT ON payment
BEGIN
  UPDATE sale SET payment_status = CASE
      WHEN (SELECT SUM(amount) FROM payment WHERE sale_id = NEW.sale_id) >= total_amount THEN 'Paid'
      WHEN (SELECT SUM(amount) FROM payment WHERE sale_id = NEW.sale_id) > 0 THEN 'Partial' ELSE 'Due' END
  WHERE sale_id = NEW.sale_id;
END;

CREATE TRIGGER trg_return_after AFTER INSERT ON sale_return
BEGIN
  UPDATE watch SET stock_qty = stock_qty + (SELECT quantity FROM sale_item WHERE sale_item_id = NEW.sale_item_id)
  WHERE watch_id = (SELECT watch_id FROM sale_item WHERE sale_item_id = NEW.sale_item_id);
  UPDATE warranty SET status = 'Void' WHERE sale_item_id = NEW.sale_item_id;
END;

-- ----------------------------- VIEWS --------------------------------
CREATE VIEW v_sale_summary AS
SELECT s.sale_id, s.sale_date, c.customer_name, u.full_name AS salesperson, s.total_amount, s.payment_status,
       COALESCE((SELECT SUM(p.amount) FROM payment p WHERE p.sale_id = s.sale_id),0) AS paid,
       s.total_amount - COALESCE((SELECT SUM(p.amount) FROM payment p WHERE p.sale_id = s.sale_id),0) AS due
FROM sale s JOIN customer c ON c.customer_id = s.customer_id JOIN user u ON u.user_id = s.salesperson_id;

CREATE VIEW v_low_stock AS
SELECT w.watch_id, b.brand_name, w.model_name, w.stock_qty, w.reorder_level, w.image
FROM watch w JOIN brand b ON b.brand_id = w.brand_id WHERE w.stock_qty <= w.reorder_level;

-- -------------------------- SAMPLE DATA -----------------------------
INSERT INTO user (full_name,email,password,phone,role) VALUES
('Md Roman','admin@watchshop.com','240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9','01711000001','Admin'),
('Farhan Shahriar','sales@watchshop.com','6bc0a63cb29c92306020c0a6bbc358cc4628db277dc06e253535e126517ad637','01711000002','Salesperson'),
('Ashiqur Rahman','ashiq@watchshop.com','6bc0a63cb29c92306020c0a6bbc358cc4628db277dc06e253535e126517ad637','01711000003','Salesperson');
INSERT INTO brand (brand_name,country) VALUES ('Casio','Japan'),('Seiko','Japan'),('Citizen','Japan'),('Fossil','USA'),('Titan','India'),('Tissot','Switzerland');
INSERT INTO category (category_name) VALUES ('Analog'),('Digital'),('Smart'),('Luxury'),('Sports');
INSERT INTO watch (model_name,brand_id,category_id,purchase_price,sale_price,stock_qty,reorder_level,warranty_months,image) VALUES
('G-Shock GA-2100',1,5,9500,12900,0,3,24,'assets/watches/1.svg'),('Vintage A168',1,2,3200,4500,0,4,12,'assets/watches/2.svg'),
('Edifice EFR-526',1,1,8800,11800,0,3,24,'assets/watches/3.svg'),('Presage SRPD37',2,4,32000,41500,0,2,36,'assets/watches/4.svg'),
('5 Sports SRPD55',2,5,21000,27500,0,2,24,'assets/watches/5.svg'),('Eco-Drive BM8180',3,1,11500,15200,0,3,24,'assets/watches/6.svg'),
('Promaster Diver',3,5,24000,31000,0,2,24,'assets/watches/7.svg'),('Grant Chronograph',4,1,12500,16900,0,3,24,'assets/watches/8.svg'),
('Gen 6 Smartwatch',4,3,22000,28900,0,2,12,'assets/watches/9.svg'),('Raga Women',5,1,4200,5900,0,4,12,'assets/watches/10.svg'),
('Neo Splash',5,1,3800,5200,0,4,12,'assets/watches/11.svg'),('PRX Powermatic 80',6,4,58000,72000,0,1,24,'assets/watches/12.svg');
INSERT INTO supplier (supplier_name,phone,email,address) VALUES
('Time Zone Distributors','01811000001','sales@timezone.bd','Motijheel, Dhaka'),('Kronos Imports','01811000002','info@kronos.bd','Banani, Dhaka'),
('Watch World Wholesale','01811000003','order@watchworld.bd','Chawkbazar, Chattogram');
INSERT INTO customer (customer_name,phone,email,address) VALUES
('Rakib Hasan','01911000001','rakib@gmail.com','Mirpur, Dhaka'),('Nusrat Jahan','01911000002','nusrat@gmail.com','Dhanmondi, Dhaka'),
('Tanvir Ahmed','01911000003','tanvir@gmail.com','Uttara, Dhaka'),('Sadia Islam','01911000004','sadia@gmail.com','Gulshan, Dhaka'),
('Mehedi Hasan','01911000005','mehedi@gmail.com','Bashundhara, Dhaka'),('Farzana Akter','01911000006','farzana@gmail.com','Mohammadpur, Dhaka');
INSERT INTO purchase_order (supplier_id,created_by,order_date,status) VALUES
(1,1,date('now','localtime','-75 day'),'Pending'),(2,1,date('now','localtime','-70 day'),'Pending'),
(3,1,date('now','localtime','-40 day'),'Pending'),(1,1,date('now','localtime','-2 day'),'Pending');
INSERT INTO purchase_item (po_id,watch_id,quantity,unit_cost) VALUES
(1,1,10,9500),(1,2,15,3200),(1,3,6,8800),(1,10,8,4200),(1,11,8,3800),(2,4,4,32000),(2,5,5,21000),(2,6,6,11500),(2,7,3,24000),
(3,8,6,12500),(3,9,4,22000),(3,12,2,58000),(4,2,10,3200),(4,1,5,9500);
UPDATE purchase_order SET total_cost = (SELECT SUM(quantity*unit_cost) FROM purchase_item WHERE po_id = purchase_order.po_id);
UPDATE purchase_order SET status='Received' WHERE po_id IN (1,2,3);
INSERT INTO sale (customer_id,salesperson_id,sale_date,discount,total_amount) VALUES
(1,2,datetime('now','localtime','-60 day'),0,12900),(2,2,datetime('now','localtime','-55 day'),500,9900),
(3,3,datetime('now','localtime','-48 day'),0,41500),(4,2,datetime('now','localtime','-41 day'),1000,26800),
(1,3,datetime('now','localtime','-33 day'),0,15200),(5,2,datetime('now','localtime','-33 day'),0,17400),
(6,2,datetime('now','localtime','-33 day'),0,5900),(2,3,datetime('now','localtime','-20 day'),0,28900),
(3,2,datetime('now','localtime','-12 day'),0,12900),(4,3,datetime('now','localtime','-6 day'),2000,70000),
(5,2,datetime('now','localtime','-2 day'),0,9000),(1,2,datetime('now','localtime'),0,16900);
INSERT INTO sale_item (sale_id,watch_id,serial_no,quantity,unit_price) VALUES
(1,1,'CAS-GA21-0001',1,12900),(2,2,'CAS-A168-0001',1,4500),(2,11,'TIT-NEO-0001',1,5900),(3,4,'SEI-PRS-0001',1,41500),
(4,3,'CAS-EFR-0001',1,11800),(4,6,'CIT-ECO-0001',1,16000),(5,6,'CIT-ECO-0002',1,15200),(6,1,'CAS-GA21-0002',1,12900),
(6,2,'CAS-A168-0002',1,4500),(7,10,'TIT-RAG-0001',1,5900),(8,9,'FOS-GEN6-0001',1,28900),(9,1,'CAS-GA21-0003',1,12900),
(10,12,'TIS-PRX-0001',1,72000),(11,2,'CAS-A168-0003',2,4500),(12,8,'FOS-GRT-0001',1,16900);
INSERT INTO payment (sale_id,amount,method,paid_at) VALUES
(1,12900,'Cash',datetime('now','localtime','-60 day')),(2,9900,'bKash',datetime('now','localtime','-55 day')),
(3,30000,'Card',datetime('now','localtime','-48 day')),(3,11500,'Card',datetime('now','localtime','-30 day')),
(4,26800,'Cash',datetime('now','localtime','-41 day')),(5,15200,'bKash',datetime('now','localtime','-33 day')),
(6,10000,'Cash',datetime('now','localtime','-33 day')),(7,5900,'Nagad',datetime('now','localtime','-33 day')),
(8,28900,'Card',datetime('now','localtime','-20 day')),(9,12900,'Cash',datetime('now','localtime','-12 day')),
(10,50000,'Card',datetime('now','localtime','-6 day')),(12,16900,'bKash',datetime('now','localtime'));
INSERT INTO sale_return (sale_item_id,return_date,reason,refund_amount) VALUES (3,date('now','localtime','-53 day'),'Strap size problem',5900);
INSERT INTO repair (warranty_id,received_date,issue,repair_cost,status,delivered_date) VALUES
(1,date('now','localtime','-25 day'),'Battery drains fast',0,'Delivered',date('now','localtime','-20 day')),
(4,date('now','localtime','-10 day'),'Crown is loose',0,'In Repair',NULL),
(9,date('now','localtime','-3 day'),'Screen not turning on',0,'Received',NULL);
