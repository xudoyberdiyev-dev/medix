-- Real vaqt signallari (SPEC 10 — SSE). Hujjat qo'shilsa/o'zgarsa pg_notify: PostgreSQL uni faqat tranzaksiya
-- muvaffaqiyatli yakunlangach yetkazadi (bekor qilinsa — signal yo'q), bir tranzaksiyadagi bir xil signallar bittaga
-- birlashadi. Backend (notification.LiveSignalListener) LISTEN qiladi va ochiq oynalarga «<mavzu>» hodisasini yuboradi.
-- Signalda ma'lumot yo'q — faqat mavzu va filial; sahifa ma'lumotni o'z ruxsati bilan qayta oladi.
CREATE FUNCTION medix_live_signal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_notify('medix_live', TG_ARGV[0] || ':' || NEW.branch_id);
    RETURN NULL;
END
$$;

CREATE TRIGGER sales_order_live AFTER INSERT OR UPDATE ON sales_order
    FOR EACH ROW EXECUTE FUNCTION medix_live_signal('orders');

CREATE TRIGGER trip_live AFTER INSERT OR UPDATE ON trip
    FOR EACH ROW EXECUTE FUNCTION medix_live_signal('trips');

CREATE TRIGGER receipt_live AFTER INSERT OR UPDATE ON receipt
    FOR EACH ROW EXECUTE FUNCTION medix_live_signal('receipts');
