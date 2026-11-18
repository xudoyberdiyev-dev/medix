-- O24: foydalanuvchi interfeys mavzusi (Profil → Mavzu). 'system' — qurilma sozlamasiga qarab.
ALTER TABLE employee
    ADD COLUMN theme VARCHAR(8) NOT NULL DEFAULT 'system'
        CONSTRAINT employee_theme_ck CHECK (theme IN ('light', 'dark', 'system'));
