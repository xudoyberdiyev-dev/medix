-- MEDIX — V2: OK kamomadini hal qilish (T12: resolveHc / resolveBack, transfer.resolve).
-- Kamomad tovari jo'natishda manba zonadan allaqachon chiqqan (jurnal), qabul qiluvchiga kelmagan. Ikki yo'l:
--   WRITE_OFF — hisobdan chiqarish (HC, sabab «Kamomad», source_transfer_id bilan): qoldiq harakati YO'Q (tovar allaqachon
--               chiqqan), faqat hujjat va tannarx summasi; HC tasdiq qoidalari amal qiladi (5 000 000 dan katta — Direktor).
--   RETURN    — topildi, manba zonaga qaytariladi (jurnalga OK hujjati bilan kirim).
-- Hal qilish faqat qo'shiladi; HC rad etilsa — kamomad yana ochiq hisoblanadi va qayta hal qilinadi.

ALTER TABLE write_off ADD COLUMN source_transfer_id BIGINT REFERENCES warehouse_transfer (id);
CREATE INDEX write_off_source_transfer_idx ON write_off (source_transfer_id) WHERE source_transfer_id IS NOT NULL;

CREATE TABLE warehouse_transfer_resolution (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    transfer_id   BIGINT       NOT NULL REFERENCES warehouse_transfer (id),
    kind          VARCHAR(16)  NOT NULL CHECK (kind IN ('WRITE_OFF', 'RETURN')),
    write_off_id  BIGINT       REFERENCES write_off (id),
    qty           INTEGER      NOT NULL CHECK (qty > 0),
    note          VARCHAR(500),
    resolved_by   BIGINT       NOT NULL REFERENCES employee (id),
    resolved_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CHECK ((kind = 'WRITE_OFF') = (write_off_id IS NOT NULL))
);
CREATE INDEX warehouse_transfer_resolution_transfer_idx ON warehouse_transfer_resolution (transfer_id, resolved_at DESC);

CREATE TRIGGER warehouse_transfer_resolution_append_only
    BEFORE UPDATE OR DELETE ON warehouse_transfer_resolution
    FOR EACH ROW EXECUTE FUNCTION medix_forbid_modification();
