
-- Maharashtra Crime Intelligence & Analytics Platform — Schema
CREATE EXTENSION IF NOT EXISTS postgis;

DROP TABLE IF EXISTS incident_suspects CASCADE;
DROP TABLE IF EXISTS incident_victims CASCADE;
DROP TABLE IF EXISTS incidents CASCADE;
DROP TABLE IF EXISTS suspects CASCADE;
DROP TABLE IF EXISTS victims CASCADE;
DROP TABLE IF EXISTS stations CASCADE;

CREATE TABLE stations (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    district TEXT NOT NULL,
    jurisdiction_polygon GEOMETRY(POLYGON, 4326),
    lat DOUBLE PRECISION NOT NULL,
    long DOUBLE PRECISION NOT NULL
);

CREATE TABLE incidents (
    id SERIAL PRIMARY KEY,
    station_id INTEGER NOT NULL REFERENCES stations(id),
    lat DOUBLE PRECISION NOT NULL,
    long DOUBLE PRECISION NOT NULL,
    crime_type TEXT NOT NULL,
    "timestamp" TIMESTAMP NOT NULL,
    weapon_or_method TEXT,
    target_type TEXT,
    escape_pattern TEXT
);

CREATE TABLE suspects (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE victims (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL
);

-- Link tables (many-to-many: a suspect/victim can appear across multiple incidents,
-- an incident can have multiple suspects/victims)
CREATE TABLE incident_suspects (
    incident_id INTEGER NOT NULL REFERENCES incidents(id),
    suspect_id INTEGER NOT NULL REFERENCES suspects(id),
    PRIMARY KEY (incident_id, suspect_id)
);

CREATE TABLE incident_victims (
    incident_id INTEGER NOT NULL REFERENCES incidents(id),
    victim_id INTEGER NOT NULL REFERENCES victims(id),
    PRIMARY KEY (incident_id, victim_id)
);

CREATE INDEX idx_incidents_station ON incidents(station_id);
CREATE INDEX idx_incidents_crime_type ON incidents(crime_type);
CREATE INDEX idx_incidents_timestamp ON incidents("timestamp");
CREATE INDEX idx_stations_geom ON stations USING GIST(jurisdiction_polygon);

-- =========================================================================
-- AUTHENTIC NCRB PUBLIC DATASET SCHEMA (Additive Analytics Table)
-- Source: National Crime Records Bureau (NCRB), Ministry of Home Affairs, GoI
-- =========================================================================
CREATE TABLE IF NOT EXISTS real_district_crimes (
    id SERIAL PRIMARY KEY,
    state_ut VARCHAR(80) NOT NULL,
    raw_district VARCHAR(100) NOT NULL,
    normalized_district VARCHAR(100) NOT NULL,
    is_state_total BOOLEAN NOT NULL DEFAULT FALSE,
    year INTEGER NOT NULL,
    murder INTEGER NOT NULL DEFAULT 0,
    attempt_to_murder INTEGER NOT NULL DEFAULT 0,
    culpable_homicide INTEGER NOT NULL DEFAULT 0,
    rape INTEGER NOT NULL DEFAULT 0,
    custodial_rape INTEGER NOT NULL DEFAULT 0,
    other_rape INTEGER NOT NULL DEFAULT 0,
    kidnapping_abduction INTEGER NOT NULL DEFAULT 0,
    kidnapping_women_girls INTEGER NOT NULL DEFAULT 0,
    kidnapping_others INTEGER NOT NULL DEFAULT 0,
    dacoity INTEGER NOT NULL DEFAULT 0,
    preparation_dacoity INTEGER NOT NULL DEFAULT 0,
    robbery INTEGER NOT NULL DEFAULT 0,
    burglary INTEGER NOT NULL DEFAULT 0,
    theft INTEGER NOT NULL DEFAULT 0,
    auto_theft INTEGER NOT NULL DEFAULT 0,
    other_theft INTEGER NOT NULL DEFAULT 0,
    riots INTEGER NOT NULL DEFAULT 0,
    criminal_breach_of_trust INTEGER NOT NULL DEFAULT 0,
    cheating INTEGER NOT NULL DEFAULT 0,
    counterfeiting INTEGER NOT NULL DEFAULT 0,
    arson INTEGER NOT NULL DEFAULT 0,
    hurt_grievous_hurt INTEGER NOT NULL DEFAULT 0,
    dowry_deaths INTEGER NOT NULL DEFAULT 0,
    assault_on_women INTEGER NOT NULL DEFAULT 0,
    insult_to_modesty_of_women INTEGER NOT NULL DEFAULT 0,
    cruelty_by_husband_or_relatives INTEGER NOT NULL DEFAULT 0,
    importation_of_girls INTEGER NOT NULL DEFAULT 0,
    causing_death_by_negligence INTEGER NOT NULL DEFAULT 0,
    other_ipc_crimes INTEGER NOT NULL DEFAULT 0,
    total_ipc_crimes INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_real_district_crimes UNIQUE (state_ut, raw_district, year)
);

CREATE INDEX IF NOT EXISTS idx_rdc_state_norm ON real_district_crimes (state_ut, normalized_district);
CREATE INDEX IF NOT EXISTS idx_rdc_year ON real_district_crimes (year);
CREATE INDEX IF NOT EXISTS idx_rdc_total ON real_district_crimes (total_ipc_crimes);
