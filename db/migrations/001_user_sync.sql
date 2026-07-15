CREATE TABLE IF NOT EXISTS app_users (
  auth_subject text PRIMARY KEY,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS state_documents (
  user_id text NOT NULL REFERENCES app_users(auth_subject) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('calculator', 'todo')),
  payload_ciphertext bytea NOT NULL,
  payload_iv bytea NOT NULL,
  payload_tag bytea NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  schema_version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scope)
);

CREATE TABLE IF NOT EXISTS weekly_history (
  user_id text NOT NULL REFERENCES app_users(auth_subject) ON DELETE CASCADE,
  week date NOT NULL,
  revenue bigint NOT NULL CHECK (revenue >= 0),
  crystals integer NOT NULL CHECK (crystals >= 0),
  monthly_boss_revenue bigint NOT NULL CHECK (monthly_boss_revenue >= 0),
  character_count integer NOT NULL CHECK (character_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, week)
);

CREATE TABLE IF NOT EXISTS nexon_accounts (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES app_users(auth_subject) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 50),
  key_ciphertext bytea NOT NULL,
  key_iv bytea NOT NULL,
  key_tag bytea NOT NULL,
  key_version smallint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);

CREATE INDEX IF NOT EXISTS nexon_accounts_user_idx ON nexon_accounts(user_id);
CREATE INDEX IF NOT EXISTS weekly_history_user_updated_idx ON weekly_history(user_id, week DESC);

CREATE TABLE IF NOT EXISTS local_imports (
  user_id text NOT NULL REFERENCES app_users(auth_subject) ON DELETE CASCADE,
  import_token text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, import_token)
);
