-- AI Skincare Planner – Personalized Skin Intelligence
-- PostgreSQL Schema
-- Design note: Module 1 specifies ONE Users table with a `role` column
-- (id, name, email, password, role, provider, created_at, updated_at).
-- We follow that pattern and satisfy the brief's "Doctors / Consultants / Admins"
-- tables by giving Doctor & Consultant roles their own PROFILE-EXTENSION tables
-- (specialization, bio, etc.) that hang off users.id. Admins need no extra
-- columns, so role = 'ADMIN' on the users table is sufficient.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ========== ENUMS ==========
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('USER', 'DOCTOR', 'CONSULTANT', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE auth_provider AS ENUM ('LOCAL', 'GOOGLE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE report_status AS ENUM ('PENDING_REVIEW', 'REVIEWED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE appointment_status AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE provider_role AS ENUM ('DOCTOR', 'CONSULTANT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ========== USERS (Users / Doctors / Consultants / Admins unified) ==========
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(180) UNIQUE NOT NULL,
  password      VARCHAR(255),                 -- NULL for GOOGLE-only accounts
  role          user_role NOT NULL DEFAULT 'USER',
  provider      auth_provider NOT NULL DEFAULT 'LOCAL',
  google_id     VARCHAR(255) UNIQUE,
  avatar_url    TEXT,
  phone         VARCHAR(30),
  skin_type     VARCHAR(40),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ========== LEGACY-COMPATIBILITY PATCH (users) ==========
-- CREATE TABLE IF NOT EXISTS above is a no-op on a database where `users`
-- already existed under an older, pre-schema.sql shape (email/password/
-- full_name/role varchar, no name/skin_type/updated_at columns at all).
-- These ALTERs land the columns this schema/API actually needs onto that
-- older table too, without touching or deleting any existing row.
ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(120);
ALTER TABLE users ADD COLUMN IF NOT EXISTS skin_type VARCHAR(40);
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();
-- Backfill `name` from the older `full_name` column, only if that column
-- exists (it won't on a database that was always on this schema) and only
-- for rows that don't already have a name. Never overwrites a real value.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'full_name'
  ) THEN
    UPDATE users SET name = full_name WHERE name IS NULL AND full_name IS NOT NULL;
  END IF;
END $$;
-- name stays nullable at the DB level (a NOT NULL here could fail on rows
-- with neither `name` nor a `full_name` to backfill from) -- the API
-- already requires it on every write path for new/updated users.

-- ========== DOCTOR PROFILE (extends a users row with role = DOCTOR) ==========
CREATE TABLE IF NOT EXISTS doctor_profiles (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  specialization    VARCHAR(150) DEFAULT 'General Dermatology',
  qualification     VARCHAR(150),
  experience_years  INTEGER DEFAULT 0,
  bio               TEXT,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ========== CONSULTANT PROFILE (extends a users row with role = CONSULTANT) ==========
CREATE TABLE IF NOT EXISTS consultant_profiles (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  specialization    VARCHAR(150) DEFAULT 'Skincare & Product Consultant',
  experience_years  INTEGER DEFAULT 0,
  bio               TEXT,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ========== SKIN REPORTS ==========
CREATE TABLE IF NOT EXISTS skin_reports (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_path        TEXT NOT NULL,
  skin_type         VARCHAR(40),
  skin_health_score INTEGER,                     -- 0-100 (Module 3 style scoring)
  overall_condition VARCHAR(60),
  concerns          JSONB DEFAULT '[]',           -- [{name, severity, priority}]
  risk_factors      JSONB DEFAULT '[]',           -- [{name, description, risk_level}]
  recommendations   JSONB DEFAULT '[]',           -- [{title, description, category}]
  status            report_status NOT NULL DEFAULT 'PENDING_REVIEW',
  reviewed_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  doctor_notes      TEXT,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ========== LEGACY-COMPATIBILITY PATCH (skin_reports) ==========
-- A pre-existing skin_reports table (from before schema.sql) has only
-- id/user_id/skin_type/concerns/metrics/summary/created_at -- none of
-- these. image_path/status get no default because there's no safe value
-- to invent for old rows; they stay nullable at the DB level (the API
-- already requires them on every new report).
ALTER TABLE skin_reports ADD COLUMN IF NOT EXISTS image_path TEXT;
ALTER TABLE skin_reports ADD COLUMN IF NOT EXISTS skin_health_score INTEGER;
ALTER TABLE skin_reports ADD COLUMN IF NOT EXISTS overall_condition VARCHAR(60);
ALTER TABLE skin_reports ADD COLUMN IF NOT EXISTS risk_factors JSONB DEFAULT '[]';
ALTER TABLE skin_reports ADD COLUMN IF NOT EXISTS recommendations JSONB DEFAULT '[]';
ALTER TABLE skin_reports ADD COLUMN IF NOT EXISTS status report_status;
ALTER TABLE skin_reports ALTER COLUMN status SET DEFAULT 'PENDING_REVIEW';
UPDATE skin_reports SET status = 'PENDING_REVIEW' WHERE status IS NULL;
ALTER TABLE skin_reports ADD COLUMN IF NOT EXISTS reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE skin_reports ADD COLUMN IF NOT EXISTS doctor_notes TEXT;
-- A pre-existing `concerns` column is TEXT[] (old schema); the API writes
-- JSON into it (userController.js: JSON.stringify(analysis.concerns)),
-- which a text[] column rejects. Converting the column to JSONB is safe
-- and re-runnable: to_jsonb() on data already stored as text[] preserves
-- it as a JSON array of strings; running this again once the column is
-- already JSONB is a harmless no-op re-assertion of the same type.
ALTER TABLE skin_reports ALTER COLUMN concerns TYPE JSONB USING to_jsonb(concerns);
ALTER TABLE skin_reports ALTER COLUMN concerns SET DEFAULT '[]';

-- ========== APPOINTMENTS ==========
CREATE TABLE IF NOT EXISTS appointments (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_role   provider_role NOT NULL,
  report_id       INTEGER REFERENCES skin_reports(id) ON DELETE SET NULL,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  status          appointment_status NOT NULL DEFAULT 'PENDING',
  notes           TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ========== LEGACY-COMPATIBILITY PATCH (appointments) ==========
-- A pre-existing appointments table (from before schema.sql) has
-- doctor_id, not provider_id/provider_role, and no report_id or
-- appointment_time at all -- this is exactly why `idx_appt_provider`
-- below used to fail with "column provider_id does not exist". No safe
-- value exists to backfill provider_id/provider_role/appointment_time
-- for old rows, so they stay nullable at the DB level; the API already
-- requires them on every new appointment.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS provider_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS provider_role provider_role;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS report_id INTEGER REFERENCES skin_reports(id) ON DELETE SET NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS appointment_time TIME;

CREATE INDEX IF NOT EXISTS idx_reports_user ON skin_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_appt_user ON appointments(user_id);
CREATE INDEX IF NOT EXISTS idx_appt_provider ON appointments(provider_id);

-- ========== SKINCARE PLANS (routine generation) ==========
CREATE TABLE IF NOT EXISTS skincare_plans (
  id                       SERIAL PRIMARY KEY,
  user_id                  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_id                INTEGER REFERENCES skin_reports(id) ON DELETE SET NULL,
  skin_type                VARCHAR(40),
  season                   VARCHAR(20),                  -- Spring/Summer/Autumn/Winter
  morning_routine          JSONB DEFAULT '[]',            -- [{step, category, product, reason}]
  evening_routine          JSONB DEFAULT '[]',            -- [{step, category, product, reason}]
  weekly_treatments        JSONB DEFAULT '[]',            -- [{name, frequency, description}]
  seasonal_recommendations JSONB DEFAULT '[]',            -- [{title, description}]
  created_at               TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ========== LEGACY-COMPATIBILITY PATCH (skincare_plans) ==========
-- A pre-existing skincare_plans table (from before schema.sql) has only
-- id/user_id/routine_type/products/recommendations/created_at -- none of
-- these newer columns.
ALTER TABLE skincare_plans ADD COLUMN IF NOT EXISTS report_id INTEGER REFERENCES skin_reports(id) ON DELETE SET NULL;
ALTER TABLE skincare_plans ADD COLUMN IF NOT EXISTS skin_type VARCHAR(40);
ALTER TABLE skincare_plans ADD COLUMN IF NOT EXISTS season VARCHAR(20);
ALTER TABLE skincare_plans ADD COLUMN IF NOT EXISTS morning_routine JSONB DEFAULT '[]';
ALTER TABLE skincare_plans ADD COLUMN IF NOT EXISTS evening_routine JSONB DEFAULT '[]';
ALTER TABLE skincare_plans ADD COLUMN IF NOT EXISTS weekly_treatments JSONB DEFAULT '[]';
ALTER TABLE skincare_plans ADD COLUMN IF NOT EXISTS seasonal_recommendations JSONB DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_plans_user ON skincare_plans(user_id);

-- ========== USER SKINCARE PREFERENCES (personalization inputs) ==========
-- One row per user. Feeds the routine generator alongside the latest
-- skin_reports row. All arrays are simple JSONB string arrays so the
-- frontend can render/edit them as multi-select chips without a join.
CREATE TABLE IF NOT EXISTS user_skincare_preferences (
  id                 SERIAL PRIMARY KEY,
  user_id            INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skin_type          VARCHAR(40),                  -- overrides users.skin_type if set; falls back to latest report otherwise
  known_concerns     JSONB DEFAULT '[]',            -- ["acne","dryness",...] user-declared, in addition to AI-detected concerns
  allergies          JSONB DEFAULT '[]',            -- ["fragrance","salicylic acid",...] free-text ingredient/product avoidance list
  activity_level     VARCHAR(20),                   -- 'low' | 'moderate' | 'high'
  outdoor_exposure   VARCHAR(20),                   -- 'low' | 'moderate' | 'high'
  sleep_quality      VARCHAR(20),                   -- 'poor' | 'average' | 'good'
  environment        VARCHAR(30),                   -- 'dry' | 'humid' | 'urban_pollution' | 'coastal' | 'other'
  notes              TEXT,                          -- free-text lifestyle notes the generator's UI can display but not parse
  updated_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prefs_user ON user_skincare_preferences(user_id);

-- ========== SKIN HEALTH SCORING ENGINE — data-collection fields (additive) ==========
-- These back the "Complete Your Skin Health Information" intake flow so
-- every one of the 5 weighted factors (Skin Condition 35% / Lifestyle 20%
-- / Sleep 15% / Routine 20% / Hydration 10%) can always be scored from
-- real, user-provided data instead of ever being marked unavailable.
-- All migration-safe (ADD COLUMN IF NOT EXISTS).
ALTER TABLE user_skincare_preferences ADD COLUMN IF NOT EXISTS water_intake_liters NUMERIC(3,1); -- daily water intake, liters/day (0-15); feeds the Hydration Score
ALTER TABLE user_skincare_preferences ADD COLUMN IF NOT EXISTS sleep_hours NUMERIC(3,1);          -- average sleep duration, hours/night (0-24); feeds the Sleep Quality Score
ALTER TABLE user_skincare_preferences ADD COLUMN IF NOT EXISTS stress_level VARCHAR(20);          -- 'low' | 'moderate' | 'high'; feeds the Lifestyle Score alongside activity_level
ALTER TABLE user_skincare_preferences ADD COLUMN IF NOT EXISTS concern_severity JSONB DEFAULT '{}'; -- {"Acne":"mild",...} — severity per entry in known_concerns, self-reported when no AI skin_reports row exists yet
ALTER TABLE user_skincare_preferences ADD COLUMN IF NOT EXISTS manual_skin_assessed BOOLEAN NOT NULL DEFAULT FALSE; -- TRUE once the user has explicitly submitted the manual skin-condition questionnaire (even with zero concerns selected) — distinguishes "hasn't answered yet" from "answered: no concerns"

-- Add a nullable FK on skincare_plans back to the preferences snapshot used,
-- so "Why this routine?" can show exactly what inputs produced a given plan
-- even if the user edits their preferences later.
ALTER TABLE skincare_plans ADD COLUMN IF NOT EXISTS preferences_snapshot JSONB;
ALTER TABLE skincare_plans ADD COLUMN IF NOT EXISTS excluded_ingredients JSONB DEFAULT '[]';
ALTER TABLE skincare_plans ADD COLUMN IF NOT EXISTS explanation JSONB DEFAULT '[]';
ALTER TABLE skincare_plans ADD COLUMN IF NOT EXISTS changes_from_previous JSONB DEFAULT '[]';
ALTER TABLE skincare_plans ADD COLUMN IF NOT EXISTS checklist JSONB DEFAULT '{}';
ALTER TABLE skincare_plans ADD COLUMN IF NOT EXISTS edited_by_user BOOLEAN NOT NULL DEFAULT FALSE;

-- ========== INGREDIENT INTELLIGENCE ==========
-- Standalone catalog of skincare ingredients, independent of any single
-- routine. Queried directly by the Ingredient Intelligence page
-- (search/filter) and by backend/src/services/ingredientIntelligence.js
-- to build a personalized suitable/caution/avoid breakdown for a user's
-- profile. routineGenerator.js's existing rule-based step generation is
-- unchanged — this table is additive, not a replacement for it.
CREATE TABLE IF NOT EXISTS ingredients (
  id                  SERIAL PRIMARY KEY,
  name                VARCHAR(120) UNIQUE NOT NULL,
  category            VARCHAR(60),                 -- e.g. Active, Humectant, Exfoliant, Sunscreen Filter, Emollient
  description         TEXT,
  benefits            JSONB DEFAULT '[]',           -- ["Brightens tone", "Reduces breakouts", ...]
  suitable_skin_types JSONB DEFAULT '[]',           -- ["Oily","Dry","Combination","Sensitive","Normal"]
  suitable_concerns   JSONB DEFAULT '[]',           -- ["acne","pigmentation",...]
  irritation_potential VARCHAR(20) DEFAULT 'low',   -- 'low' | 'medium' | 'high'
  allergy_notes       TEXT,                         -- free-text sensitivity/allergy guidance
  comedogenic_rating  SMALLINT,                     -- 0-5, nullable when not applicable/known
  usage_guidance      TEXT,
  avoid_with          JSONB DEFAULT '[]',           -- ingredient/product names or conditions to avoid pairing with
  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ========== LEGACY-COMPATIBILITY PATCH (ingredients) ==========
-- A pre-existing ingredients table (from before schema.sql) has only
-- id/name/description/benefits/conflicts/created_at -- category (used by
-- idx_ingredients_category below) and everything else here is new.
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS category VARCHAR(60);
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS suitable_skin_types JSONB DEFAULT '[]';
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS suitable_concerns JSONB DEFAULT '[]';
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS irritation_potential VARCHAR(20) DEFAULT 'low';
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS allergy_notes TEXT;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS comedogenic_rating SMALLINT;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS usage_guidance TEXT;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS avoid_with JSONB DEFAULT '[]';
-- A pre-existing `benefits` column is TEXT[] (old schema); seedCatalog.js
-- writes JSON into it (JSON.stringify(ing.benefits)), which a text[]
-- column rejects. Safe, re-runnable conversion -- see the same note on
-- skin_reports.concerns above.
ALTER TABLE ingredients ALTER COLUMN benefits TYPE JSONB USING to_jsonb(benefits);
ALTER TABLE ingredients ALTER COLUMN benefits SET DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_ingredients_category ON ingredients(category);

-- ========== PRODUCT CATALOG ==========
CREATE TABLE IF NOT EXISTS products (
  id                    SERIAL PRIMARY KEY,
  name                  VARCHAR(150) NOT NULL,
  brand                 VARCHAR(100),
  category              VARCHAR(40) NOT NULL,        -- Cleansing | Exfoliation | Treatment | Moisturizing | Sun Protection | Night Care
  description           TEXT,
  skin_types            JSONB DEFAULT '[]',          -- [] means suitable for all skin types
  skin_concerns         JSONB DEFAULT '[]',          -- concerns this product targets
  ingredients            JSONB DEFAULT '[]',          -- key ingredient names (matched against the ingredients table by name)
  price                 NUMERIC(10,2),                -- nullable — not every seeded product needs one
  usage_instructions     TEXT,
  sensitivity_warnings   JSONB DEFAULT '[]',          -- ingredient/allergen terms this product conflicts with
  product_url            TEXT,                         -- real shop/product page link, when one is known — nullable; never fabricated. The frontend shows "Product link unavailable" when this is NULL.
  created_at             TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

-- ========== LEGACY-COMPATIBILITY PATCH (products) ==========
-- A pre-existing products table (from before schema.sql) has only
-- id/name/brand/category/suitable_skin_types/key_ingredients/
-- conflicting_ingredients/description/created_at -- none of these.
ALTER TABLE products ADD COLUMN IF NOT EXISTS skin_types JSONB DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS skin_concerns JSONB DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS ingredients JSONB DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS price NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS usage_instructions TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sensitivity_warnings JSONB DEFAULT '[]';

-- Migration-safe: adds product_url on databases where `products` was
-- created before this column existed (the CREATE TABLE IF NOT EXISTS
-- above is a no-op once the table exists, so this ALTER is what actually
-- lands the column on an existing install).
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_url TEXT;

-- ========== PRODUCT SHOPPING + COMPARISON (Milestone 3, additive) ==========
-- Every ALTER below is migration-safe (ADD COLUMN IF NOT EXISTS) so it is
-- a no-op on a database that already has these columns and lands them
-- cleanly on one that doesn't. No existing column is renamed or dropped.
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;               -- product photo; nullable — frontend falls back to a category placeholder, never a fabricated photo
ALTER TABLE products ADD COLUMN IF NOT EXISTS store_name VARCHAR(60);       -- e.g. 'Nykaa' | 'Purplle' | 'Amazon' — the retailer product_url points to, when known
ALTER TABLE products ADD COLUMN IF NOT EXISTS rating NUMERIC(2,1);          -- 0.0–5.0, nullable when no rating is available
ALTER TABLE products ADD COLUMN IF NOT EXISTS fragrance_free BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sensitive_skin_friendly BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_products_store ON products(store_name);

-- ========== PRODUCT RECOMMENDATIONS (audit trail) ==========
-- One row per product recommended to a user as part of a specific
-- skincare_plans generation — lets Admin analytics report on
-- recommendation volume/category mix, and lets a user's "Ingredients &
-- Products" page show exactly what was recommended and why, even after
-- the plan has since been regenerated.
CREATE TABLE IF NOT EXISTS product_recommendations (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id          INTEGER REFERENCES skincare_plans(id) ON DELETE CASCADE,
  report_id        INTEGER REFERENCES skin_reports(id) ON DELETE SET NULL,
  product_id       INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  routine_category VARCHAR(40),
  reason           TEXT,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prodrec_user ON product_recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_prodrec_plan ON product_recommendations(plan_id);

-- ========== NOTIFICATIONS & REMINDERS (Milestone 3, additive) ==========
DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM (
    'MORNING_ROUTINE', 'EVENING_ROUTINE', 'PRODUCT_REPLENISHMENT',
    'HYDRATION', 'SLEEP', 'PROGRESS_ALERT', 'PLATFORM'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One row per notification actually generated for a user. Reminder-type
-- rows (MORNING_ROUTINE/EVENING_ROUTINE/HYDRATION/SLEEP/PRODUCT_REPLENISHMENT)
-- are generated lazily (see notificationService.js) from reminder_settings
-- the moment they come due, so a row here always means "this really was
-- due/happened" rather than a fabricated claim. PROGRESS_ALERT rows are
-- created directly by real events (a new assessment score, a fully
-- completed routine day) with the real numbers baked into the message.
CREATE TABLE IF NOT EXISTS notifications (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            notification_type NOT NULL,
  title           VARCHAR(150) NOT NULL,
  message         TEXT NOT NULL,
  scheduled_time  TIMESTAMP,
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  status          VARCHAR(20) NOT NULL DEFAULT 'SENT', -- 'SENT' | 'READ'
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ========== LEGACY-COMPATIBILITY PATCH (notifications) ==========
-- A pre-existing notifications table (from before schema.sql) has only
-- id/user_id/title/message/is_read/created_at -- no `type`/status/
-- scheduled_time. A constant DEFAULT lets these be added as NOT NULL in
-- one step -- Postgres backfills every existing row with the default at
-- ALTER time, so this never leaves a NOT NULL column with NULLs in it.
-- 'PLATFORM' is an existing, generic catch-all value of notification_type
-- (see the enum above) -- every new notification the app creates always
-- supplies its own real type, so this default only ever applies to old
-- pre-migration rows.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type notification_type NOT NULL DEFAULT 'PLATFORM';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS scheduled_time TIMESTAMP;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'SENT';

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read);

-- One row per user: enable/disable + preferred time/frequency per
-- reminder type. Created with defaults on first read (see
-- notificationController.getReminderSettings) so every user has one
-- without a separate onboarding step.
CREATE TABLE IF NOT EXISTS reminder_settings (
  id                            SERIAL PRIMARY KEY,
  user_id                       INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  morning_routine_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  morning_routine_time          TIME NOT NULL DEFAULT '08:00',
  evening_routine_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  evening_routine_time          TIME NOT NULL DEFAULT '21:00',
  hydration_enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  hydration_time                TIME NOT NULL DEFAULT '13:00',
  hydration_frequency           VARCHAR(20) NOT NULL DEFAULT 'daily', -- 'daily' | 'twice_daily'
  sleep_enabled                 BOOLEAN NOT NULL DEFAULT TRUE,
  sleep_time                    TIME NOT NULL DEFAULT '22:30',
  replenishment_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  replenishment_frequency_days  INTEGER NOT NULL DEFAULT 30,
  progress_alerts_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at                    TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at                    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ========== LEGACY-COMPATIBILITY PATCH (reminder_settings) ==========
-- A pre-existing reminder_settings table (from before schema.sql) has a
-- completely different, differently-named set of columns (morning_
-- reminder/morning_time/evening_reminder/evening_time/email_notifications)
-- and -- critically -- no UNIQUE constraint on user_id at all, which is
-- exactly why `ON CONFLICT (user_id)` in notificationService.js was
-- failing with "no unique or exclusion constraint matching the ON
-- CONFLICT specification". Every column below has a constant DEFAULT, so
-- adding them as NOT NULL in one step is safe and backfills existing rows
-- automatically.
ALTER TABLE reminder_settings ADD COLUMN IF NOT EXISTS morning_routine_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE reminder_settings ADD COLUMN IF NOT EXISTS morning_routine_time TIME NOT NULL DEFAULT '08:00';
ALTER TABLE reminder_settings ADD COLUMN IF NOT EXISTS evening_routine_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE reminder_settings ADD COLUMN IF NOT EXISTS evening_routine_time TIME NOT NULL DEFAULT '21:00';
ALTER TABLE reminder_settings ADD COLUMN IF NOT EXISTS hydration_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE reminder_settings ADD COLUMN IF NOT EXISTS hydration_time TIME NOT NULL DEFAULT '13:00';
ALTER TABLE reminder_settings ADD COLUMN IF NOT EXISTS hydration_frequency VARCHAR(20) NOT NULL DEFAULT 'daily';
ALTER TABLE reminder_settings ADD COLUMN IF NOT EXISTS sleep_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE reminder_settings ADD COLUMN IF NOT EXISTS sleep_time TIME NOT NULL DEFAULT '22:30';
ALTER TABLE reminder_settings ADD COLUMN IF NOT EXISTS replenishment_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE reminder_settings ADD COLUMN IF NOT EXISTS replenishment_frequency_days INTEGER NOT NULL DEFAULT 30;
ALTER TABLE reminder_settings ADD COLUMN IF NOT EXISTS progress_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE reminder_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();
-- THE fix for the ON CONFLICT (user_id) error: a plain unique index
-- satisfies ON CONFLICT's target-inference requirement just as well as a
-- formal UNIQUE constraint, and CREATE UNIQUE INDEX supports IF NOT
-- EXISTS (ADD CONSTRAINT does not), which is what keeps this idempotent.
-- This can only fail if duplicate user_id rows already exist, which
-- shouldn't be possible given the ON CONFLICT insert was erroring out
-- rather than silently double-inserting -- but if it does fail, dedupe
-- with the query in the migration guide before re-running.
CREATE UNIQUE INDEX IF NOT EXISTS reminder_settings_user_id_key ON reminder_settings(user_id);
