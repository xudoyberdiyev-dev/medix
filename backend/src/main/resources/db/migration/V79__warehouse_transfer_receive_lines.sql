-- OK qabul (prototip TransferReceive): har qatorda qayerga zona, farq sababi va shikastlangan miqdor.
-- received_qty — jismonan kelgan (shikastlangan ham); damaged_qty — shundan Karantin zonasiga qabul qilingani;
-- kamomad = qty - received_qty (avvalgidek).
ALTER TABLE warehouse_transfer_line
    ADD COLUMN to_zone_id  BIGINT REFERENCES zone (id),
    ADD COLUMN damaged_qty INTEGER NOT NULL DEFAULT 0 CHECK (damaged_qty >= 0),
    ADD COLUMN diff_reason VARCHAR(16) CHECK (diff_reason IN ('SHORT', 'DAMAGED', 'OTHER')),
    ADD CONSTRAINT warehouse_transfer_line_damaged_le CHECK (damaged_qty = 0 OR (received_qty IS NOT NULL AND damaged_qty <= received_qty));
