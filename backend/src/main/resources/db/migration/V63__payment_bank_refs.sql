-- To'lov hujjati rekvizitlari (prototip PaymentDoc): bank o'tkazmasi — to'lov topshiriqnomasi № va bank sanasi; terminal — chek raqami.
ALTER TABLE customer_payment
    ADD COLUMN pay_order_no VARCHAR(30),
    ADD COLUMN bank_date    DATE,
    ADD COLUMN check_no     VARCHAR(30);
ALTER TABLE supplier_payment
    ADD COLUMN pay_order_no VARCHAR(30),
    ADD COLUMN bank_date    DATE,
    ADD COLUMN check_no     VARCHAR(30);
COMMENT ON COLUMN customer_payment.pay_order_no IS 'To''lov topshiriqnomasi № (bank)';
COMMENT ON COLUMN customer_payment.check_no IS 'Terminal cheki raqami';
COMMENT ON COLUMN supplier_payment.pay_order_no IS 'To''lov topshiriqnomasi № (bank)';
COMMENT ON COLUMN supplier_payment.check_no IS 'Terminal cheki raqami';
