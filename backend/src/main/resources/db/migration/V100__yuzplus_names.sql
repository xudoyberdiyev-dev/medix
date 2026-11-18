-- O21: loyiha nomi «100+» (texnik nom yuzplus). Mavjud migratsiyalar o'zgartirilmaydi — eski nomdagi obyektlar shu yerda
-- qayta nomlanadi. Triggerlar funksiyaga OID orqali bog'langan, shuning uchun nom o'zgarishi ularga ta'sir qilmaydi.

ALTER FUNCTION medix_advance_offset_locked() RENAME TO yuzplus_advance_offset_locked;
ALTER FUNCTION medix_branch_payment_locked() RENAME TO yuzplus_branch_payment_locked;
ALTER FUNCTION medix_branch_sale_locked() RENAME TO yuzplus_branch_sale_locked;
ALTER FUNCTION medix_cash_op_locked() RENAME TO yuzplus_cash_op_locked;
ALTER FUNCTION medix_customer_payment_locked() RENAME TO yuzplus_customer_payment_locked;
ALTER FUNCTION medix_expected_receipt_locked() RENAME TO yuzplus_expected_receipt_locked;
ALTER FUNCTION medix_forbid_modification() RENAME TO yuzplus_forbid_modification;
ALTER FUNCTION medix_inventory_count_locked() RENAME TO yuzplus_inventory_count_locked;
ALTER FUNCTION medix_inventory_scope_locked() RENAME TO yuzplus_inventory_scope_locked;
ALTER FUNCTION medix_invoice_task_guard() RENAME TO yuzplus_invoice_task_guard;
ALTER FUNCTION medix_live_signal() RENAME TO yuzplus_live_signal;
ALTER FUNCTION medix_money_transfer_locked() RENAME TO yuzplus_money_transfer_locked;
ALTER FUNCTION medix_opening_balance_locked() RENAME TO yuzplus_opening_balance_locked;
ALTER FUNCTION medix_opening_finance_locked() RENAME TO yuzplus_opening_finance_locked;
ALTER FUNCTION medix_price_change_locked() RENAME TO yuzplus_price_change_locked;
ALTER FUNCTION medix_price_void_only() RENAME TO yuzplus_price_void_only;
ALTER FUNCTION medix_protect_system_role() RENAME TO yuzplus_protect_system_role;
ALTER FUNCTION medix_receipt_locked() RENAME TO yuzplus_receipt_locked;
ALTER FUNCTION medix_reserve_code_guard() RENAME TO yuzplus_reserve_code_guard;
ALTER FUNCTION medix_sale_locked() RENAME TO yuzplus_sale_locked;
ALTER FUNCTION medix_sales_order_issue_guard() RENAME TO yuzplus_sales_order_issue_guard;
ALTER FUNCTION medix_sales_order_locked() RENAME TO yuzplus_sales_order_locked;
ALTER FUNCTION medix_sales_order_mark_guard() RENAME TO yuzplus_sales_order_mark_guard;
ALTER FUNCTION medix_supplier_payment_locked() RENAME TO yuzplus_supplier_payment_locked;
ALTER FUNCTION medix_supplier_return_locked() RENAME TO yuzplus_supplier_return_locked;
ALTER FUNCTION medix_trip_locked() RENAME TO yuzplus_trip_locked;
ALTER FUNCTION medix_warehouse_transfer_locked() RENAME TO yuzplus_warehouse_transfer_locked;
ALTER FUNCTION medix_write_off_locked() RENAME TO yuzplus_write_off_locked;
ALTER FUNCTION medix_zone_transfer_locked() RENAME TO yuzplus_zone_transfer_locked;

-- Real vaqt signallari kanali: medix_live → yuzplus_live (backend notification.LiveSignalListener shu kanalni tinglaydi).
CREATE OR REPLACE FUNCTION yuzplus_live_signal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_notify('yuzplus_live', TG_ARGV[0] || ':' || NEW.branch_id);
    RETURN NULL;
END
$$;

-- Bank solishtirish: tizimdagi qoldiq ustuni (CHECK cheklovi ustun bilan birga qayta nomlanadi).
ALTER TABLE bank_reconciliation RENAME COLUMN medix_balance TO yuzplus_balance;
