SELECT json_build_object(
  'total', (SELECT COUNT(*) FROM thoughts),
  'active', (
    SELECT COUNT(*)
    FROM thoughts
    WHERE moderation_status = 'active'
  ),
  'nonActive', (
    SELECT COUNT(*)
    FROM thoughts
    WHERE moderation_status <> 'active'
  ),
  'statusColumn', EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'thoughts'
      AND column_name = 'moderation_status'
      AND is_nullable = 'NO'
      AND column_default LIKE '%active%'
  ),
  'reasonColumn', EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'thoughts'
      AND column_name = 'moderation_reason'
  ),
  'updatedAtColumn', EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'thoughts'
      AND column_name = 'moderation_updated_at'
  )
)::text;
