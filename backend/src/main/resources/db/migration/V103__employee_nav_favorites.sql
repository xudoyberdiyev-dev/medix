-- U7: sidebar «Sevimlilar» — foydalanuvchi yulduzcha bilan belgilagan menyu boʻlimlari (nav kalitlari, tartib bilan, koʻpi bilan 12).
ALTER TABLE employee
    ADD COLUMN nav_favorites TEXT[] NOT NULL DEFAULT '{}'
        CONSTRAINT employee_nav_favorites_ck CHECK (cardinality(nav_favorites) <= 12);
