-- S1 audit, 2-qism (22.11.2026): hujjat boʻyicha ochiq qarz — qarz jurnalidan (party_ledger) hosila jadval.
--
-- Muammo: «Mijozlar qarzi», «YB qarzi», bosh sahifalar (Direktor, Buxgalter, Xaridchi) va toʻlov muddati kartalari har ochilishda
-- BUTUN qarz jurnalini hujjat boʻyicha guruhlardi (own/app). Sintetik 2 yilda (2,1 mln yozuv): 1,4 s (filial) / 4,8 s (barchasi);
-- 4 yilda ikki baravar, keyin yana oʻsadi.
-- Yechim: har hujjat uchun bitta qator (oʻz yozuvlari yigʻindisi + unga qoʻllangan yozuvlar yigʻindisi), jurnalga yozuv qoʻshilganda
-- SHU TRANZAKSIYADA trigger bilan yangilanadi (jurnal append-only — faqat INSERT). Hisobot qoidasi oʻzgarmaydi:
-- ochiq qoldiq = Σ oʻz yozuvlari (applies_doc_type IS NULL) + Σ shu hujjatga qoʻllangan yozuvlar (filial va kontragent ham mos).
-- Jurnal — yagona haqiqat manbai; bu jadval istalgan vaqtda jurnaldan qayta qurilishi mumkin (pastdagi toʻldirish soʻrovi).

CREATE TABLE party_doc_balance (
    side            VARCHAR(8)     NOT NULL,
    branch_id       BIGINT         NOT NULL,
    counterparty_id BIGINT         NOT NULL,
    doc_type        VARCHAR(8)     NOT NULL,
    doc_id          BIGINT         NOT NULL,
    own_rows        INTEGER        NOT NULL DEFAULT 0,  -- hujjatning oʻz yozuvlari soni (0 — faqat qoʻllangan yozuvlar bor)
    own_amount      NUMERIC(18, 2) NOT NULL DEFAULT 0,  -- Σ oʻz yozuvlari
    applied_amount  NUMERIC(18, 2) NOT NULL DEFAULT 0,  -- Σ shu hujjatga qoʻllangan yozuvlar (toʻlov, qaytarish, hisob-kitob)
    open_amount     NUMERIC(18, 2) GENERATED ALWAYS AS (own_amount + applied_amount) STORED,
    due_date        DATE,                                -- min(oʻz yozuvlari due_date)
    first_at        TIMESTAMPTZ,                         -- min(oʻz yozuvlari occurred_at)
    doc_number      VARCHAR(32),                         -- min(oʻz yozuvlari doc_number)
    PRIMARY KEY (side, branch_id, counterparty_id, doc_type, doc_id)
);
COMMENT ON TABLE party_doc_balance IS 'Hujjat boʻyicha ochiq qarz — party_ledger dan hosila (trigger, bitta tranzaksiyada); qoʻlda yozilmaydi';

-- Faqat ochiq hujjatlar (yopilgan tarix indeksga kirmaydi — hajm vaqt bilan oʻsmaydi)
CREATE INDEX party_doc_balance_open_idx ON party_doc_balance (side, branch_id, counterparty_id)
    WHERE own_rows > 0 AND open_amount <> 0;

-- Mavjud jurnaldan toʻldirish
INSERT INTO party_doc_balance (side, branch_id, counterparty_id, doc_type, doc_id, own_rows, own_amount, due_date, first_at, doc_number)
SELECT side, branch_id, counterparty_id, doc_type, doc_id, count(*), sum(amount), min(due_date), min(occurred_at), min(doc_number)
FROM party_ledger WHERE applies_doc_type IS NULL
GROUP BY side, branch_id, counterparty_id, doc_type, doc_id;

INSERT INTO party_doc_balance AS d (side, branch_id, counterparty_id, doc_type, doc_id, applied_amount)
SELECT side, branch_id, counterparty_id, applies_doc_type, applies_doc_id, sum(amount)
FROM party_ledger WHERE applies_doc_type IS NOT NULL
GROUP BY side, branch_id, counterparty_id, applies_doc_type, applies_doc_id
ON CONFLICT (side, branch_id, counterparty_id, doc_type, doc_id) DO UPDATE SET applied_amount = EXCLUDED.applied_amount;

CREATE FUNCTION yuzplus_party_doc_balance() RETURNS trigger AS $$
BEGIN
    IF NEW.applies_doc_type IS NULL THEN
        INSERT INTO party_doc_balance AS d (side, branch_id, counterparty_id, doc_type, doc_id, own_rows, own_amount, due_date, first_at, doc_number)
        VALUES (NEW.side, NEW.branch_id, NEW.counterparty_id, NEW.doc_type, NEW.doc_id, 1, NEW.amount, NEW.due_date, NEW.occurred_at, NEW.doc_number)
        ON CONFLICT (side, branch_id, counterparty_id, doc_type, doc_id) DO UPDATE SET
            own_rows = d.own_rows + 1,
            own_amount = d.own_amount + EXCLUDED.own_amount,
            due_date = LEAST(d.due_date, EXCLUDED.due_date),
            first_at = LEAST(d.first_at, EXCLUDED.first_at),
            doc_number = LEAST(d.doc_number, EXCLUDED.doc_number);
    ELSE
        INSERT INTO party_doc_balance AS d (side, branch_id, counterparty_id, doc_type, doc_id, applied_amount)
        VALUES (NEW.side, NEW.branch_id, NEW.counterparty_id, NEW.applies_doc_type, NEW.applies_doc_id, NEW.amount)
        ON CONFLICT (side, branch_id, counterparty_id, doc_type, doc_id) DO UPDATE SET
            applied_amount = d.applied_amount + EXCLUDED.applied_amount;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER party_ledger_doc_balance AFTER INSERT ON party_ledger
    FOR EACH ROW EXECUTE FUNCTION yuzplus_party_doc_balance();
