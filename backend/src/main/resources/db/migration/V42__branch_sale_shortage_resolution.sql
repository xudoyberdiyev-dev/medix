-- MEDIX — V2: FS kamomadini hal qilish (T12: kamomad → hal qilish, transfer.resolve; dizayn: docs/notes/FS-dizayn.md 4-band).
-- Kamomad tovari jo'natishda sotuvchi zonadan allaqachon chiqqan va xaridorga sotilgan (branch_ledger + summa). Yo'llar:
--   WRITE_OFF + BUYER  — xaridor zimmasida: HC xaridor qabul zonasida (sabab «Kamomad», qoldiq harakatisiz); qarz o'zgarmaydi.
--   WRITE_OFF + SELLER — sotuvchi zimmasida: HC sotuvchi zonasida; xaridor qarzi kamomad summasiga kamayadi (branch_ledger −).
--   RETURN             — topildi (jo'natilmagan): sotuvchi zonaga qaytariladi (jurnalga FS hujjati bilan kirim); qarz kamayadi.
-- Qarz tuzatish hal qilish paytida yoziladi: kerakli tuzatish − shu FS bo'yicha avval yozilgan tuzatishlar (faqat qo'shiladi).
-- HC rad etilsa — kamomad yana ochiq, qayta hal qilinadi (qarz tuzatish yangi qarorga moslab yoziladi).

ALTER TABLE write_off ADD COLUMN source_branch_sale_id BIGINT REFERENCES branch_sale (id);
CREATE INDEX write_off_source_branch_sale_idx ON write_off (source_branch_sale_id) WHERE source_branch_sale_id IS NOT NULL;
ALTER TABLE write_off ADD CONSTRAINT write_off_single_source CHECK (source_transfer_id IS NULL OR source_branch_sale_id IS NULL);

CREATE TABLE branch_sale_resolution (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sale_id       BIGINT         NOT NULL REFERENCES branch_sale (id),
    kind          VARCHAR(16)    NOT NULL CHECK (kind IN ('WRITE_OFF', 'RETURN')),
    bearer        VARCHAR(8)     NOT NULL CHECK (bearer IN ('BUYER', 'SELLER')),
    write_off_id  BIGINT         REFERENCES write_off (id),
    qty           INTEGER        NOT NULL CHECK (qty > 0),
    amount        NUMERIC(18, 2) NOT NULL CHECK (amount >= 0),
    debt_change   NUMERIC(18, 2) NOT NULL,
    note          VARCHAR(500),
    resolved_by   BIGINT         NOT NULL REFERENCES employee (id),
    resolved_at   TIMESTAMPTZ    NOT NULL DEFAULT now(),
    CHECK ((kind = 'WRITE_OFF') = (write_off_id IS NOT NULL)),
    CHECK (kind = 'WRITE_OFF' OR bearer = 'SELLER')
);
CREATE INDEX branch_sale_resolution_sale_idx ON branch_sale_resolution (sale_id, resolved_at DESC);

CREATE TRIGGER branch_sale_resolution_append_only
    BEFORE UPDATE OR DELETE ON branch_sale_resolution
    FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();
