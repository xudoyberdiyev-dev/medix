-- MEDIX — «Bonus berilmadi» (prototip Payables → Bonus balans; egasi 09.11 «hammasi prototipdagidek»): YB kirimdagi chegirmani
-- bermasligi qayd qilinadi — sabab bilan, bir marta. Bonus balansga ta'sir qilmaydi (jurnal yozuvi yo'q), kirim «kutilayotgan»dan chiqadi.
CREATE TABLE supplier_bonus_decline (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    receipt_id    BIGINT         NOT NULL UNIQUE REFERENCES receipt (id),
    reason        VARCHAR(300)   NOT NULL CHECK (length(btrim(reason)) > 0),
    created_by    BIGINT         NOT NULL REFERENCES employee (id),
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE TRIGGER supplier_bonus_decline_append_only
    BEFORE UPDATE OR DELETE ON supplier_bonus_decline
    FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();
