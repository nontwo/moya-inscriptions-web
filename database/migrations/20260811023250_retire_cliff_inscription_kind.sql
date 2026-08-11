LOCK TABLE catalog_entries IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM catalog_entries
    WHERE kind = 'cliff_inscription'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'Cannot retire CatalogKind cliff_inscription while catalog_entries contains matching rows';
  END IF;
END
$$;

ALTER TABLE catalog_entries
  DROP CONSTRAINT catalog_entries_kind_valid;

ALTER TABLE catalog_entries
  ADD CONSTRAINT catalog_entries_kind_valid CHECK (
    kind IN ('inscription', 'calligraphy')
  );
