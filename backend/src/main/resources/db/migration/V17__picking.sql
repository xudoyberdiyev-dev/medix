-- MEDIX — 7-bosqich: vaqt berish va yig'ish (SPEC 5.2 №3–4, 5.4). Ombor mudiri har buyurtmaga yig'ish va markirovka vaqtini
-- beradi (daqiqa). Yig'uvchi «Yig'ishni boshlash» → teskari taymer → «Yakunlash» + partiya tasdig'i → tovar Jo'natish zonasiga.
-- Bir yig'uvchida bir vaqtda bitta faol buyurtma.
ALTER TABLE sales_order
    ADD COLUMN pick_minutes      INTEGER CHECK (pick_minutes BETWEEN 1 AND 600),
    ADD COLUMN mark_minutes      INTEGER CHECK (mark_minutes BETWEEN 1 AND 600),
    ADD COLUMN time_given_by     BIGINT REFERENCES employee (id),
    ADD COLUMN time_given_at     TIMESTAMPTZ,
    ADD COLUMN picker_id         BIGINT REFERENCES employee (id),
    ADD COLUMN pick_started_at   TIMESTAMPTZ,
    ADD COLUMN pick_finished_at  TIMESTAMPTZ,
    ADD COLUMN fefo_deviation    BOOLEAN NOT NULL DEFAULT false;

-- Bitta faol yig'ish: bir yig'uvchida faqat bitta PICKING holatidagi buyurtma.
CREATE UNIQUE INDEX sales_order_one_active_pick ON sales_order (picker_id) WHERE status = 'PICKING';

-- Yig'ilgan partiyalar (faqat qo'shiladi): qaysi qator, qaysi partiya va zonadan, nechta. Sotuv shu yerdan oladi (8-bosqich).
CREATE TABLE sales_order_pick (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id      BIGINT       NOT NULL REFERENCES sales_order (id),
    line_id       BIGINT       NOT NULL REFERENCES sales_order_line (id),
    batch_id      BIGINT       NOT NULL REFERENCES batch (id),
    from_zone_id  BIGINT       NOT NULL REFERENCES zone (id),
    to_zone_id    BIGINT       NOT NULL REFERENCES zone (id),
    qty           INTEGER      NOT NULL CHECK (qty > 0),
    fefo          BOOLEAN      NOT NULL,
    picked_by     BIGINT       NOT NULL REFERENCES employee (id),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX sales_order_pick_order_idx ON sales_order_pick (order_id);

CREATE TRIGGER sales_order_pick_append_only
    BEFORE UPDATE OR DELETE ON sales_order_pick
    FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();
