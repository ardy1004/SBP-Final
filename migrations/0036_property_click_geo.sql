-- Log per-klik (bukan agregat harian seperti property_view_daily) untuk
-- menjawab "audiens dari kota mana yang klik properti apa" — dipakai widget
-- "Sebaran Lokasi Audiens" di tab Ringkasan admin. Sumber geo: request.cf
-- Cloudflare (city/region/country dari IP), diisi di functions/_lib/geoRequest.js.
CREATE TABLE IF NOT EXISTS property_click_geo (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  click_type  TEXT    NOT NULL CHECK (click_type IN ('card_click', 'wa_click')),
  city        TEXT,
  region      TEXT,
  country     TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pcg_property ON property_click_geo(property_id);
CREATE INDEX IF NOT EXISTS idx_pcg_created  ON property_click_geo(created_at);
