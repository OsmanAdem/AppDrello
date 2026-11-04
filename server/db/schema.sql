-- AppDrello database schema.
-- Run with: npm run db:setup  (safe to run again: it only creates what is missing)

-- Boards: one row per board.
CREATE TABLE IF NOT EXISTS boards (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name             TEXT NOT NULL CHECK (length(trim(name)) > 0),
  background_color TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Columns belong to a board. Deleting a board deletes its columns (ON DELETE CASCADE).
CREATE TABLE IF NOT EXISTS columns (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  board_id   TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  is_backlog BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS columns_board_idx ON columns(board_id, position);

-- Sprints belong to a board.
CREATE TABLE IF NOT EXISTS sprints (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  board_id   TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  goal       TEXT,
  start_date DATE,
  end_date   DATE,
  status     TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cards belong to a column (and, for quick lookups, to a board).
-- Checklist and custom field values are stored as JSON because their shape varies.
CREATE TABLE IF NOT EXISTS cards (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  board_id      TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  column_id     TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  sprint_id     TEXT REFERENCES sprints(id) ON DELETE SET NULL,
  issue_key     TEXT NOT NULL,
  title         TEXT NOT NULL,
  priority      TEXT NOT NULL DEFAULT '' CHECK (priority IN ('', 'Low', 'Medium', 'High')),
  label         TEXT NOT NULL DEFAULT '',
  description   TEXT,
  assignee      TEXT,
  start_date    DATE,
  due_date      DATE,
  checklist     JSONB NOT NULL DEFAULT '[]',
  custom_fields JSONB NOT NULL DEFAULT '{}',
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (board_id, issue_key)
);
CREATE INDEX IF NOT EXISTS cards_column_idx ON cards(column_id, position);

-- Custom field definitions belong to a board. The values live on each card.
CREATE TABLE IF NOT EXISTS custom_field_definitions (
  id       TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  type     TEXT NOT NULL CHECK (type IN ('text', 'number', 'select', 'checkbox', 'date')),
  options  JSONB,
  position INTEGER NOT NULL DEFAULT 0
);

-- Activity history for a board.
CREATE TABLE IF NOT EXISTS activity (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  board_id    TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  description TEXT NOT NULL,
  card_id     TEXT,
  issue_key   TEXT,
  card_title  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_board_idx ON activity(board_id, created_at DESC);

-- Automation rules: "when <trigger> happens, do <action>".
CREATE TABLE IF NOT EXISTS automations (
  id                TEXT PRIMARY KEY,
  board_id          TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  enabled           BOOLEAN NOT NULL DEFAULT true,
  trigger_type      TEXT NOT NULL CHECK (trigger_type IN ('card-created', 'card-moved', 'checklist-completed')),
  trigger_column_id TEXT,
  action_type       TEXT NOT NULL CHECK (action_type IN ('set-label', 'set-priority', 'set-assignee', 'move-to-column', 'set-due-in-days')),
  action_value      TEXT NOT NULL DEFAULT '',
  position          INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Board templates the user saved themselves (the built-in ones live in the app).
CREATE TABLE IF NOT EXISTS templates (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description TEXT NOT NULL DEFAULT '',
  columns     JSONB NOT NULL DEFAULT '[]',
  fields      JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Users and login (step 3) ----------

-- One row per account. The password is never stored, only a bcrypt hash of it.
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name          TEXT NOT NULL CHECK (length(trim(name)) > 0),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every board and saved template belongs to a user. Boards made before accounts existed
-- have no owner yet; the first account that signs up gets them.
ALTER TABLE boards    ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS boards_owner_idx ON boards(owner_id);
CREATE INDEX IF NOT EXISTS templates_owner_idx ON templates(owner_id);
