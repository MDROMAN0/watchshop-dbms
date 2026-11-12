-- =====================================================================
--  CSE311L Database Systems Lab — Database Implementation
--  Project : Watch Business Data Management System
--  Group 08 · Section 3 · North South University
--  Members : Md Roman (2312765042), Anika Nower Nihan (2011234642),
--            Farhan Shahriar (2312071042), Ashiqur Rahman (2412388042)
--
--  How to run (XAMPP): start Apache + MySQL -> http://localhost/phpmyadmin
--  -> Import -> choose this file -> Go.  Creates database `watch_business_db`
--  with 14 tables (PK, FK, UNIQUE, CHECK, NOT NULL), 5 triggers, 2 views
--  and sample data in every table.  Matches our submitted ERD & Schema.
-- =====================================================================
DROP DATABASE IF EXISTS watch_business_db;
CREATE DATABASE watch_business_db CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE watch_business_db;

-- ---------------------------- TABLES --------------------------------
CREATE TABLE `user` (
  user_id    INT AUTO_INCREMENT PRIMARY KEY,
  full_name  VARCHAR(100) NOT NULL,
  email      VARCHAR(100) NOT NULL UNIQUE,
  password   VARCHAR(255) NOT NULL,
  phone      VARCHAR(20),
  role       ENUM('Admin','Salesperson') NOT NULL DEFAULT 'Salesperson'
);

CREATE TABLE brand (
  brand_id   INT AUTO_INCREMENT PRIMARY KEY,
  brand_name VARCHAR(60) NOT NULL UNIQUE,
  country    VARCHAR(60)
);

CREATE TABLE category (
  category_id   INT AUTO_INCREMENT PRIMARY KEY,
  category_name VARCHAR(60) NOT NULL UNIQUE
);

CREATE TABLE watch (
  watch_id        INT AUTO_INCREMENT PRIMARY KEY,
  model_name      VARCHAR(100) NOT NULL,
  brand_id        INT NOT NULL,
  category_id     INT NOT NULL,
  purchase_price  DECIMAL(10,2) NOT NULL CHECK (purchase_price >= 0),
  sale_price      DECIMAL(10,2) NOT NULL CHECK (sale_price >= 0),
  stock_qty       INT NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  reorder_level   INT NOT NULL DEFAULT 3,
  warranty_months INT NOT NULL DEFAULT 12,
  image           VARCHAR(255) NULL,           -- product photo path
  FOREIGN KEY (brand_id)    REFERENCES brand(brand_id)       ON UPDATE CASCADE,
  FOREIGN KEY (category_id) REFERENCES category(category_id) ON UPDATE CASCADE
);

CREATE TABLE supplier (
  supplier_id   INT AUTO_INCREMENT PRIMARY KEY,
  supplier_name VARCHAR(100) NOT NULL,
  phone         VARCHAR(20),
  email         VARCHAR(100),
  address       VARCHAR(200)
);

CREATE TABLE purchase_order (
  po_id       INT AUTO_INCREMENT PRIMARY KEY,
  supplier_id INT NOT NULL,
  created_by  INT NOT NULL,
  order_date  DATE NOT NULL,
  status      ENUM('Pending','Received','Cancelled') NOT NULL DEFAULT 'Pending',
  total_cost  DECIMAL(12,2) NOT NULL DEFAULT 0,
  FOREIGN KEY (supplier_id) REFERENCES supplier(supplier_id),
  FOREIGN KEY (created_by)  REFERENCES `user`(user_id)
);

CREATE TABLE purchase_item (
  po_item_id INT AUTO_INCREMENT PRIMARY KEY,
  po_id      INT NOT NULL,
  watch_id   INT NOT NULL,
  quantity   INT NOT NULL CHECK (quantity > 0),
  unit_cost  DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (po_id)    REFERENCES purchase_order(po_id) ON DELETE CASCADE,
  FOREIGN KEY (watch_id) REFERENCES watch(watch_id)
);

CREATE TABLE customer (
  customer_id   INT AUTO_INCREMENT PRIMARY KEY,
  customer_name VARCHAR(100) NOT NULL,
  phone         VARCHAR(20) NOT NULL UNIQUE,
  email         VARCHAR(100),
  address       VARCHAR(200)
);

CREATE TABLE sale (
  sale_id        INT AUTO_INCREMENT PRIMARY KEY,
  customer_id    INT NOT NULL,
  salesperson_id INT NOT NULL,
  sale_date      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  discount       DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_amount   DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_status ENUM('Paid','Partial','Due') NOT NULL DEFAULT 'Due',
  FOREIGN KEY (customer_id)    REFERENCES customer(customer_id),
  FOREIGN KEY (salesperson_id) REFERENCES `user`(user_id)
);

CREATE TABLE sale_item (
  sale_item_id INT AUTO_INCREMENT PRIMARY KEY,
  sale_id      INT NOT NULL,
  watch_id     INT NOT NULL,
  serial_no    VARCHAR(50) NOT NULL UNIQUE,
  quantity     INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price   DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (sale_id)  REFERENCES sale(sale_id) ON DELETE CASCADE,
  FOREIGN KEY (watch_id) REFERENCES watch(watch_id)
);

CREATE TABLE payment (
  payment_id INT AUTO_INCREMENT PRIMARY KEY,
  sale_id    INT NOT NULL,
  amount     DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  method     ENUM('Cash','bKash','Nagad','Card') NOT NULL,
  paid_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sale_id) REFERENCES sale(sale_id) ON DELETE CASCADE
);

CREATE TABLE sale_return (
  return_id     INT AUTO_INCREMENT PRIMARY KEY,
  sale_item_id  INT NOT NULL UNIQUE,              -- 1:1 with sale_item
  return_date   DATE NOT NULL,
  reason        VARCHAR(200) NOT NULL,
  refund_amount DECIMAL(10,2) NOT NULL CHECK (refund_amount >= 0),
  FOREIGN KEY (sale_item_id) REFERENCES sale_item(sale_item_id) ON DELETE CASCADE
);

CREATE TABLE warranty (
  warranty_id  INT AUTO_INCREMENT PRIMARY KEY,
  sale_item_id INT NOT NULL UNIQUE,               -- 1:1 with sale_item
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  status       ENUM('Active','Void') NOT NULL DEFAULT 'Active',
  FOREIGN KEY (sale_item_id) REFERENCES sale_item(sale_item_id) ON DELETE CASCADE
);

CREATE TABLE repair (
  repair_id      INT AUTO_INCREMENT PRIMARY KEY,
  warranty_id    INT NOT NULL,
  received_date  DATE NOT NULL,
  issue          VARCHAR(200) NOT NULL,
  repair_cost    DECIMAL(10,2) NOT NULL DEFAULT 0,
  status         ENUM('Received','In Repair','Ready','Delivered') NOT NULL DEFAULT 'Received',
  delivered_date DATE NULL,
  FOREIGN KEY (warranty_id) REFERENCES warranty(warranty_id) ON DELETE CASCADE
);

-- ---------------------------- TRIGGERS ------------------------------
DELIMITER $$

-- Block a sale if stock is not enough
CREATE TRIGGER trg_sale_item_check BEFORE INSERT ON sale_item
FOR EACH ROW
BEGIN
  IF (SELECT stock_qty FROM watch WHERE watch_id = NEW.watch_id) < NEW.quantity THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Not enough stock for this watch';
  END IF;
END$$

-- After a sale: reduce stock and create the warranty automatically
CREATE TRIGGER trg_sale_item_after AFTER INSERT ON sale_item
FOR EACH ROW
BEGIN
  UPDATE watch SET stock_qty = stock_qty - NEW.quantity WHERE watch_id = NEW.watch_id;
  INSERT INTO warranty (sale_item_id, start_date, end_date, status)
  SELECT NEW.sale_item_id, DATE(s.sale_date),
         DATE_ADD(DATE(s.sale_date), INTERVAL w.warranty_months MONTH), 'Active'
  FROM sale s JOIN watch w ON w.watch_id = NEW.watch_id
  WHERE s.sale_id = NEW.sale_id;
END$$

-- When a purchase order is marked Received: add its items to stock
CREATE TRIGGER trg_po_received AFTER UPDATE ON purchase_order
FOR EACH ROW
BEGIN
  IF NEW.status = 'Received' AND OLD.status <> 'Received' THEN
    UPDATE watch w JOIN purchase_item pi ON pi.watch_id = w.watch_id
    SET w.stock_qty = w.stock_qty + pi.quantity
    WHERE pi.po_id = NEW.po_id;
  END IF;
END$$

-- After a payment: update the sale's payment status
CREATE TRIGGER trg_payment_after AFTER INSERT ON payment
FOR EACH ROW
BEGIN
  DECLARE paid DECIMAL(12,2);
  DECLARE total DECIMAL(12,2);
  SELECT COALESCE(SUM(amount),0) INTO paid FROM payment WHERE sale_id = NEW.sale_id;
  SELECT total_amount INTO total FROM sale WHERE sale_id = NEW.sale_id;
  UPDATE sale SET payment_status = IF(paid >= total, 'Paid', IF(paid > 0, 'Partial', 'Due'))
  WHERE sale_id = NEW.sale_id;
END$$

-- After a return: put the watch back in stock and void its warranty
CREATE TRIGGER trg_return_after AFTER INSERT ON sale_return
FOR EACH ROW
BEGIN
  UPDATE watch w JOIN sale_item si ON si.watch_id = w.watch_id
  SET w.stock_qty = w.stock_qty + si.quantity
  WHERE si.sale_item_id = NEW.sale_item_id;
  UPDATE warranty SET status = 'Void' WHERE sale_item_id = NEW.sale_item_id;
END$$

DELIMITER ;

-- ----------------------------- VIEWS --------------------------------
CREATE VIEW v_sale_summary AS
SELECT s.sale_id, s.sale_date, c.customer_name, u.full_name AS salesperson,
       s.total_amount, s.payment_status,
       COALESCE((SELECT SUM(p.amount) FROM payment p WHERE p.sale_id = s.sale_id),0) AS paid,
       s.total_amount - COALESCE((SELECT SUM(p.amount) FROM payment p WHERE p.sale_id = s.sale_id),0) AS due
FROM sale s
JOIN customer c ON c.customer_id = s.customer_id
JOIN `user` u   ON u.user_id     = s.salesperson_id;

CREATE VIEW v_low_stock AS
SELECT w.watch_id, b.brand_name, w.model_name, w.stock_qty, w.reorder_level
FROM watch w JOIN brand b ON b.brand_id = w.brand_id
WHERE w.stock_qty <= w.reorder_level;

-- -------------------------- SAMPLE DATA -----------------------------
-- Logins:  admin@watchshop.com / admin123   |   sales@watchshop.com / sales123
INSERT INTO `user` (full_name,email,password,phone,role) VALUES
('Md Roman','admin@watchshop.com','$2y$10$emZs1tQ9rTh2vdVjY3Bbg.F1SJvyV/./tCmWiyB67a4AoiAMEZO4K','01711000001','Admin'),
('Farhan Shahriar','sales@watchshop.com','$2y$10$q31BAa3/k9ZlxwrR2vfGy.lpHo4.KJq5lDysyL2lz0E59RfgZ.jPm','01711000002','Salesperson'),
('Ashiqur Rahman','ashiq@watchshop.com','$2y$10$q31BAa3/k9ZlxwrR2vfGy.lpHo4.KJq5lDysyL2lz0E59RfgZ.jPm','01711000003','Salesperson');

INSERT INTO brand (brand_name,country) VALUES
('Casio','Japan'),('Seiko','Japan'),('Citizen','Japan'),('Fossil','USA'),('Titan','India'),('Tissot','Switzerland');

INSERT INTO category (category_name) VALUES ('Analog'),('Digital'),('Smart'),('Luxury'),('Sports');

INSERT INTO watch (model_name,brand_id,category_id,purchase_price,sale_price,stock_qty,reorder_level,warranty_months) VALUES
('G-Shock GA-2100',1,5,9500,12900,0,3,24),
('Vintage A168',1,2,3200,4500,0,4,12),
('Edifice EFR-526',1,1,8800,11800,0,3,24),
('Presage SRPD37',2,4,32000,41500,0,2,36),
('5 Sports SRPD55',2,5,21000,27500,0,2,24),
('Eco-Drive BM8180',3,1,11500,15200,0,3,24),
('Promaster Diver',3,5,24000,31000,0,2,24),
('Grant Chronograph',4,1,12500,16900,0,3,24),
('Gen 6 Smartwatch',4,3,22000,28900,0,2,12),
('Raga Women',5,1,4200,5900,0,4,12),
('Neo Splash',5,1,3800,5200,0,4,12),
('PRX Powermatic 80',6,4,58000,72000,0,1,24);

INSERT INTO supplier (supplier_name,phone,email,address) VALUES
('Time Zone Distributors','01811000001','sales@timezone.bd','Motijheel, Dhaka'),
('Kronos Imports','01811000002','info@kronos.bd','Banani, Dhaka'),
('Watch World Wholesale','01811000003','order@watchworld.bd','Chawkbazar, Chattogram');

INSERT INTO customer (customer_name,phone,email,address) VALUES
('Rakib Hasan','01911000001','rakib@gmail.com','Mirpur, Dhaka'),
('Nusrat Jahan','01911000002','nusrat@gmail.com','Dhanmondi, Dhaka'),
('Tanvir Ahmed','01911000003','tanvir@gmail.com','Uttara, Dhaka'),
('Sadia Islam','01911000004','sadia@gmail.com','Gulshan, Dhaka'),
('Mehedi Hasan','01911000005','mehedi@gmail.com','Bashundhara, Dhaka'),
('Farzana Akter','01911000006','farzana@gmail.com','Mohammadpur, Dhaka');

UPDATE watch SET image = CONCAT('assets/watches/', watch_id, '.svg');

-- Purchase orders (created Pending, then Received -> trigger adds stock)
INSERT INTO purchase_order (supplier_id,created_by,order_date,status,total_cost) VALUES
(1,1,DATE_SUB(CURDATE(),INTERVAL 75 DAY),'Pending',0),
(2,1,DATE_SUB(CURDATE(),INTERVAL 70 DAY),'Pending',0),
(3,1,DATE_SUB(CURDATE(),INTERVAL 40 DAY),'Pending',0),
(1,1,DATE_SUB(CURDATE(),INTERVAL 2 DAY),'Pending',0);
INSERT INTO purchase_item (po_id,watch_id,quantity,unit_cost) VALUES
(1,1,10,9500),(1,2,15,3200),(1,3,6,8800),(1,10,8,4200),(1,11,8,3800),
(2,4,4,32000),(2,5,5,21000),(2,6,6,11500),(2,7,3,24000),
(3,8,6,12500),(3,9,4,22000),(3,12,2,58000),
(4,2,10,3200),(4,1,5,9500);
UPDATE purchase_order po SET total_cost = (SELECT SUM(quantity*unit_cost) FROM purchase_item WHERE po_id = po.po_id);
UPDATE purchase_order SET status='Received' WHERE po_id IN (1,2,3);

-- Sales (items fire triggers: stock down + warranty created)
INSERT INTO sale (customer_id,salesperson_id,sale_date,discount,total_amount) VALUES
(1,2,DATE_SUB(NOW(),INTERVAL 60 DAY),0,12900),
(2,2,DATE_SUB(NOW(),INTERVAL 55 DAY),500,9900),
(3,3,DATE_SUB(NOW(),INTERVAL 48 DAY),0,41500),
(4,2,DATE_SUB(NOW(),INTERVAL 41 DAY),1000,26800),
(1,3,DATE_SUB(NOW(),INTERVAL 33 DAY),0,15200),
(5,2,DATE_SUB(NOW(),INTERVAL 33 DAY),0,17400),
(6,2,DATE_SUB(NOW(),INTERVAL 33 DAY),0,5900),
(2,3,DATE_SUB(NOW(),INTERVAL 20 DAY),0,28900),
(3,2,DATE_SUB(NOW(),INTERVAL 12 DAY),0,12900),
(4,3,DATE_SUB(NOW(),INTERVAL 6 DAY),2000,70000),
(5,2,DATE_SUB(NOW(),INTERVAL 2 DAY),0,9000),
(1,2,NOW(),0,16900);
INSERT INTO sale_item (sale_id,watch_id,serial_no,quantity,unit_price) VALUES
(1,1,'CAS-GA21-0001',1,12900),
(2,2,'CAS-A168-0001',1,4500),(2,11,'TIT-NEO-0001',1,5900),
(3,4,'SEI-PRS-0001',1,41500),
(4,3,'CAS-EFR-0001',1,11800),(4,6,'CIT-ECO-0001',1,16000),
(5,6,'CIT-ECO-0002',1,15200),
(6,1,'CAS-GA21-0002',1,12900),(6,2,'CAS-A168-0002',1,4500),
(7,10,'TIT-RAG-0001',1,5900),
(8,9,'FOS-GEN6-0001',1,28900),
(9,1,'CAS-GA21-0003',1,12900),
(10,12,'TIS-PRX-0001',1,72000),
(11,2,'CAS-A168-0003',2,4500),
(12,8,'FOS-GRT-0001',1,16900);

INSERT INTO payment (sale_id,amount,method,paid_at) VALUES
(1,12900,'Cash',DATE_SUB(NOW(),INTERVAL 60 DAY)),
(2,9900,'bKash',DATE_SUB(NOW(),INTERVAL 55 DAY)),
(3,30000,'Card',DATE_SUB(NOW(),INTERVAL 48 DAY)),(3,11500,'Card',DATE_SUB(NOW(),INTERVAL 30 DAY)),
(4,26800,'Cash',DATE_SUB(NOW(),INTERVAL 41 DAY)),
(5,15200,'bKash',DATE_SUB(NOW(),INTERVAL 33 DAY)),
(6,10000,'Cash',DATE_SUB(NOW(),INTERVAL 33 DAY)),
(7,5900,'Nagad',DATE_SUB(NOW(),INTERVAL 33 DAY)),
(8,28900,'Card',DATE_SUB(NOW(),INTERVAL 20 DAY)),
(9,12900,'Cash',DATE_SUB(NOW(),INTERVAL 12 DAY)),
(10,50000,'Card',DATE_SUB(NOW(),INTERVAL 6 DAY)),
(12,16900,'bKash',NOW());

INSERT INTO sale_return (sale_item_id,return_date,reason,refund_amount) VALUES
(3,DATE_SUB(CURDATE(),INTERVAL 53 DAY),'Strap size problem',5900);

INSERT INTO repair (warranty_id,received_date,issue,repair_cost,status,delivered_date) VALUES
(1,DATE_SUB(CURDATE(),INTERVAL 25 DAY),'Battery drains fast',0,'Delivered',DATE_SUB(CURDATE(),INTERVAL 20 DAY)),
(4,DATE_SUB(CURDATE(),INTERVAL 10 DAY),'Crown is loose',0,'In Repair',NULL),
(9,DATE_SUB(CURDATE(),INTERVAL 3 DAY),'Screen not turning on',0,'Received',NULL);
