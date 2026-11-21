-- S1 (22.11.2026): ochiq qoldiqli hujjatlar indeksi (own_rows dan qatʼi nazar) — kontragent saldosi (Filiallar sahifasi: qarz)
-- ham hosila jadvaldan oʻqiladi. V107 dagi tor indeks shu bilan almashtiriladi.
CREATE INDEX party_doc_balance_nonzero_idx ON party_doc_balance (side, branch_id, counterparty_id) INCLUDE (own_rows, open_amount)
    WHERE open_amount <> 0;
DROP INDEX party_doc_balance_open_idx;
