ALTER TABLE catalog_import_operations
  DROP CONSTRAINT catalog_import_operations_contract_valid,
  ADD CONSTRAINT catalog_import_operations_contract_valid CHECK (
    import_contract_version IN ('catalog-import/v1', 'catalog-import/v2')
  );
