-- MEDIX — 7-bosqich: hujjatlashtirish va reys (SPEC 5.2 №7–8). Ombor mudiri «Hujjatlashtirilmoqda» buyurtmalardan reys tuzadi:
-- mashina, haydovchi, sig'im tekshiruvi (joylar soni ≤ mashina sig'imi); har buyurtmaga nakladnoy raqami (NK) beriladi va
-- buyurtma «Yuklanmoqda»ga o'tadi. «O'zi olib ketadi» buyurtmasi reyssiz, nakladnoy bilan «Yuklanmoqda»ga o'tadi.
-- Reys holatlari: PLANNED (Rejalashtirilgan / Yuklanmoqda) → IN_TRANSIT → RETURN_WAIT → DONE; PLANNED → CANCELLED.
ALTER TABLE sales_order
    ADD COLUMN waybill_number VARCHAR(32) UNIQUE,
    ADD COLUMN documented_by  BIGINT REFERENCES employee (id),
    ADD COLUMN documented_at  TIMESTAMPTZ;

CREATE TABLE trip (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number         VARCHAR(32)  NOT NULL UNIQUE,
    branch_id      BIGINT       NOT NULL REFERENCES branch (id),
    vehicle_id     BIGINT       NOT NULL REFERENCES vehicle (id),
    driver_id      BIGINT       NOT NULL REFERENCES employee (id),
    trip_date      DATE         NOT NULL,
    status         VARCHAR(12)  NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'IN_TRANSIT', 'RETURN_WAIT', 'DONE', 'CANCELLED')),
    places         INTEGER      NOT NULL CHECK (places > 0),
    note           VARCHAR(500),
    created_by     BIGINT       NOT NULL REFERENCES employee (id),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    started_at     TIMESTAMPTZ,
    finished_at    TIMESTAMPTZ,
    cancelled_by   BIGINT       REFERENCES employee (id),
    cancelled_at   TIMESTAMPTZ,
    cancel_reason  VARCHAR(300),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version        BIGINT       NOT NULL DEFAULT 0,
    CHECK (status <> 'CANCELLED' OR cancel_reason IS NOT NULL)
);
CREATE INDEX trip_branch_idx ON trip (branch_id, status, trip_date DESC);
CREATE INDEX trip_driver_idx ON trip (driver_id, status);

-- Reys manzillari (buyurtmalar). Yuklashda haydovchi har buyurtmani joylar soni bo'yicha «Qabul qildim» deydi.
CREATE TABLE trip_stop (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trip_id     BIGINT       NOT NULL REFERENCES trip (id),
    order_id    BIGINT       NOT NULL REFERENCES sales_order (id),
    seq         INTEGER      NOT NULL CHECK (seq > 0),
    places      INTEGER      NOT NULL CHECK (places > 0),
    active      BOOLEAN      NOT NULL DEFAULT true,
    loaded_by   BIGINT       REFERENCES employee (id),
    loaded_at   TIMESTAMPTZ,
    UNIQUE (trip_id, seq)
);
-- Bir buyurtma bir vaqtda faqat bitta faol reysda
CREATE UNIQUE INDEX trip_stop_order_active_uq ON trip_stop (order_id) WHERE active;

-- Yakunlangan yoki bekor qilingan reys o'zgarmaydi; reys o'chirilmaydi.
CREATE FUNCTION medix_trip_locked() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Reys oʻchirilmaydi' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status IN ('DONE', 'CANCELLED') THEN
        RAISE EXCEPTION 'Reys % yakunlangan (%): oʻzgartirib boʻlmaydi', OLD.number, OLD.status USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trip_locked BEFORE UPDATE OR DELETE ON trip FOR EACH ROW EXECUTE FUNCTION medix_trip_locked();
CREATE TRIGGER trip_stop_append_only BEFORE DELETE ON trip_stop FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();
