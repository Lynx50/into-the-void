BEGIN;

CREATE TABLE IF NOT EXISTS notification_devices (
  id serial PRIMARY KEY,
  user_id text NOT NULL,
  token text NOT NULL,
  platform text NOT NULL DEFAULT 'android',
  void_notifications_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_devices_token_unique
  ON notification_devices (token);

CREATE INDEX IF NOT EXISTS notification_devices_user_enabled_idx
  ON notification_devices (user_id, void_notifications_enabled);

CREATE TABLE IF NOT EXISTS reaction_notification_deliveries (
  id serial PRIMARY KEY,
  reaction_id integer NOT NULL REFERENCES reactions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS reaction_notification_delivery_reaction_unique
  ON reaction_notification_deliveries (reaction_id);

CREATE TABLE IF NOT EXISTS thought_delivery_notification_deliveries (
  id serial PRIMARY KEY,
  receive_id integer NOT NULL REFERENCES receives(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS thought_delivery_notification_receive_unique
  ON thought_delivery_notification_deliveries (receive_id);

COMMIT;
