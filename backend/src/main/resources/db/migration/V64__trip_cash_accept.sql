-- Haydovchidan pulni reys bo'yicha qabul qilish (prototip `Cash` — «Haydovchilardan kutilayotgan pul»): Kassir sanagan summa
-- kutilgandan farq qilsa — izoh majburiy. Summa reys to'xtashlari bo'yicha tartib bilan taqsimlanadi (oxirgisiga qolgani),
-- har ulush — MT; ulushi 0 bo'lgan to'xtash ham qabul qilingan deb belgilanadi (cash_accept_id).
CREATE TABLE trip_cash_accept (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trip_id      BIGINT          NOT NULL REFERENCES trip (id),
    account_id   BIGINT          NOT NULL REFERENCES money_account (id),
    expected     NUMERIC(18, 2)  NOT NULL CHECK (expected > 0),
    received     NUMERIC(18, 2)  NOT NULL CHECK (received >= 0),
    diff         NUMERIC(18, 2)  NOT NULL,
    note         VARCHAR(300),
    accepted_by  BIGINT          NOT NULL REFERENCES employee (id),
    accepted_at  TIMESTAMPTZ     NOT NULL DEFAULT now(),
    CHECK (diff = received - expected),
    CHECK (diff = 0 OR (note IS NOT NULL AND btrim(note) <> ''))
);
CREATE INDEX trip_cash_accept_trip_idx ON trip_cash_accept (trip_id);
CREATE TRIGGER trip_cash_accept_append_only BEFORE UPDATE OR DELETE ON trip_cash_accept
    FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();

ALTER TABLE trip_stop ADD COLUMN cash_accept_id BIGINT REFERENCES trip_cash_accept (id);
