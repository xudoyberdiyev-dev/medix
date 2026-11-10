-- Chop etish hisoblagichi: «Takroriy nusxa · N» belgisi uchun (Sozlamalar → Chop etish → reprint_mark).
CREATE TABLE print_log (
    doc_type    VARCHAR(16)  NOT NULL,
    doc_number  VARCHAR(40)  NOT NULL,
    copies      INTEGER      NOT NULL DEFAULT 1 CHECK (copies >= 1),
    first_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_by     BIGINT       REFERENCES employee (id),
    PRIMARY KEY (doc_type, doc_number)
);
COMMENT ON TABLE print_log IS 'Qogʻoz shakllari necha marta chop etilgani (PDF yaratilishi); 2 va undan koʻp — takroriy nusxa';
