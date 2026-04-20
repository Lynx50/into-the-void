import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const artifactDir = path.resolve(__dirname, "..");

loadEnvFile(path.join(artifactDir, ".env"));
loadEnvFile(path.join(artifactDir, "..", "..", ".env"));

process.env.NODE_ENV ??= "development";

const [{ db, thoughtsTable }, { default: app }] = await Promise.all([
  import("@workspace/db"),
  import("./app"),
]);

const SEED_USER_ID = "__seed__";
const SEED_THOUGHTS: Array<{
  content: string;
  mood: string | null;
  category: "relatable" | "wisdom" | "curious";
}> = [
  {
    content:
      "I wonder if the version of me that exists in other people's memories is someone I'd even recognize.",
    mood: "thoughtful",
    category: "wisdom",
  },
  {
    content:
      "Some friendships quietly end without a final scene, and that's somehow harder than the ones that do.",
    mood: "thoughtful",
    category: "wisdom",
  },
  {
    content:
      "I miss someone who still exists. That's the part I don't know how to explain to anyone.",
    mood: "sad",
    category: "relatable",
  },
  {
    content:
      "I had a moment today where I looked around and thought: this is enough. This is actually enough.",
    mood: "happy",
    category: "curious",
  },
  {
    content:
      "I keep explaining myself and somehow becoming less understood with every word.",
    mood: "frustrated",
    category: "relatable",
  },
  {
    content:
      "I said 'no worries' to something that has been worrying me for three months.",
    mood: "funny",
    category: "curious",
  },
];

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function getSafeDatabaseLabel(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    return "not configured";
  }

  try {
    const parsed = new URL(raw);
    const databaseName = parsed.pathname.replace(/^\/+/, "") || "(default)";
    return `${parsed.protocol}//${parsed.hostname}:${parsed.port || "(default)"}/${databaseName}`;
  } catch {
    return "configured";
  }
}

function assertProductionReadiness(): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  if (!process.env.SESSION_SECRET?.trim()) {
    throw new Error(
      "SESSION_SECRET must be set in production before starting the API server.",
    );
  }

  if (!process.env.CORS_ORIGINS?.trim()) {
    throw new Error(
      "CORS_ORIGINS must be set in production before starting the API server.",
    );
  }
}

async function ensureDatabaseSchema() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS anonymous_users (
      id text PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS thoughts (
      id serial PRIMARY KEY,
      user_id text NOT NULL,
      content text NOT NULL,
      mood text,
      category text DEFAULT 'relatable',
      felt_this_count integer NOT NULL DEFAULT 0,
      made_think_count integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS receives (
      id serial PRIMARY KEY,
      user_id text NOT NULL,
      thought_id integer NOT NULL,
      received_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS reactions (
      id serial PRIMARY KEY,
      user_id text NOT NULL,
      thought_id integer NOT NULL,
      reaction_type text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    ALTER TABLE anonymous_users
    ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
  `);

  await db.execute(sql`
    ALTER TABLE anonymous_users
    ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();
  `);

  await db.execute(sql`
    ALTER TABLE thoughts
    ADD COLUMN IF NOT EXISTS mood text;
  `);

  await db.execute(sql`
    ALTER TABLE thoughts
    ADD COLUMN IF NOT EXISTS category text DEFAULT 'relatable';
  `);

  await db.execute(sql`
    ALTER TABLE thoughts
    ADD COLUMN IF NOT EXISTS felt_this_count integer NOT NULL DEFAULT 0;
  `);

  await db.execute(sql`
    ALTER TABLE thoughts
    ADD COLUMN IF NOT EXISTS made_think_count integer NOT NULL DEFAULT 0;
  `);

  await db.execute(sql`
    ALTER TABLE thoughts
    ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
  `);

  await db.execute(sql`
    ALTER TABLE receives
    ADD COLUMN IF NOT EXISTS received_at timestamptz NOT NULL DEFAULT now();
  `);

  await db.execute(sql`
    ALTER TABLE reactions
    ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
  `);

  await db.execute(sql`
    UPDATE thoughts
    SET category = 'relatable'
    WHERE category IS NULL;
  `);

  await db.execute(sql`
    UPDATE thoughts
    SET felt_this_count = 0
    WHERE felt_this_count IS NULL;
  `);

  await db.execute(sql`
    UPDATE thoughts
    SET made_think_count = 0
    WHERE made_think_count IS NULL;
  `);

  await db.execute(sql`
    INSERT INTO anonymous_users (id)
    SELECT DISTINCT user_id FROM thoughts
    ON CONFLICT (id) DO NOTHING;
  `);

  await db.execute(sql`
    INSERT INTO anonymous_users (id)
    SELECT DISTINCT user_id FROM receives
    ON CONFLICT (id) DO NOTHING;
  `);

  await db.execute(sql`
    INSERT INTO anonymous_users (id)
    SELECT DISTINCT user_id FROM reactions
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function ensureSeedThoughts() {
  const result = await db.execute(sql<{ count: number }>`
    SELECT COUNT(*)::int AS count
    FROM thoughts;
  `);

  const thoughtCount = Number(result.rows[0]?.count ?? 0);
  if (thoughtCount > 0) {
    return;
  }

  await db.insert(thoughtsTable).values(
    SEED_THOUGHTS.map((thought) => ({
      userId: SEED_USER_ID,
      content: thought.content,
      mood: thought.mood,
      category: thought.category,
    })),
  );
}

async function bootstrap() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set before starting the API server.");
  }

  assertProductionReadiness();
  await ensureDatabaseSchema();
  await ensureSeedThoughts();
}

const port = Number(process.env.PORT || 3001);
const host = "0.0.0.0";

try {
  await bootstrap();

  app.listen(port, host, () => {
    console.log("Server listening");
    console.log("port:", port);
    console.log('host: "0.0.0.0"');
    console.log("database:", getSafeDatabaseLabel());
    console.log("node_env:", process.env.NODE_ENV);
  });
} catch (err) {
  console.error("Failed to bootstrap API server", err);
  process.exit(1);
}
