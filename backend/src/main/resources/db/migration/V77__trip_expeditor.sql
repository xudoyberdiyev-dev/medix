-- MEDIX — Reys sahifasi (prototip TripPage): «Ekspeditor» (ixtiyoriy) — haydovchi bilan birga boruvchi xodim/shaxs.
ALTER TABLE trip ADD COLUMN expeditor VARCHAR(120);

COMMENT ON COLUMN trip.expeditor IS 'Ekspeditor F.I.Sh. (ixtiyoriy, prototip TripPage)';
