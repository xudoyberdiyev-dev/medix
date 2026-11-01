-- MEDIX — 7-bosqich: «Muammo bor» (SPEC 5.2). Yig'uvchi, markirovkachi yoki haydovchi sabab tanlab yuboradi, xabar Ombor
-- mudiriga keladi; taymer to'xtamaydi. Ombor mudiri hal qilganini belgilaydi (izoh bilan). Yozuv o'chirilmaydi.
CREATE TABLE sales_order_issue (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id      BIGINT        NOT NULL REFERENCES sales_order (id),
    stage         VARCHAR(20)   NOT NULL,
    reason        VARCHAR(20)   NOT NULL CHECK (reason IN ('NOT_FOUND', 'SHORTAGE', 'DAMAGED', 'WRONG_BATCH', 'EXPIRY', 'CODE_UNREADABLE', 'OTHER')),
    note          VARCHAR(500),
    created_by    BIGINT        NOT NULL REFERENCES employee (id),
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    resolved_by   BIGINT        REFERENCES employee (id),
    resolved_at   TIMESTAMPTZ,
    resolution    VARCHAR(500),
    CHECK (reason <> 'OTHER' OR note IS NOT NULL),
    CHECK ((resolved_at IS NULL) = (resolved_by IS NULL))
);
CREATE INDEX sales_order_issue_open_idx ON sales_order_issue (order_id) WHERE resolved_at IS NULL;

CREATE FUNCTION medix_sales_order_issue_guard() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Muammo yozuvi oʻchirilmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.resolved_at IS NOT NULL OR NEW.order_id <> OLD.order_id OR NEW.reason <> OLD.reason OR NEW.created_by <> OLD.created_by
        OR NEW.created_at <> OLD.created_at OR NEW.stage <> OLD.stage OR NEW.note IS DISTINCT FROM OLD.note THEN
        RAISE EXCEPTION 'Muammo yozuvi oʻzgarmaydi (faqat hal qilish)' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER sales_order_issue_guard BEFORE UPDATE OR DELETE ON sales_order_issue
    FOR EACH ROW EXECUTE FUNCTION medix_sales_order_issue_guard();
