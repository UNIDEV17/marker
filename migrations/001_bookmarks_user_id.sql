BEGIN;

-- The current database was created with this column name by mistake.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'bookmarks' AND column_name = 'user.id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'bookmarks' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE bookmarks RENAME COLUMN "user.id" TO user_id;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'bookmarks'
      AND column_name = 'user_id'
      AND data_type = 'character varying'
  ) THEN
    ALTER TABLE bookmarks
      ALTER COLUMN user_id TYPE integer
      USING NULLIF(trim(user_id), '')::integer;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookmarks_user_id_fkey'
  ) THEN
    ALTER TABLE bookmarks
      ADD CONSTRAINT bookmarks_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id)
      ON DELETE CASCADE;
  END IF;
END
$$;

COMMIT;