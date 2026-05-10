-- Preserve pre-organization records by attaching legacy unscoped rows to the
-- local default organization. This is intentionally additive/non-destructive:
-- it only fills NULL organizationId values and does not delete or rewrite rows
-- that are already scoped.
WITH default_org AS (
  SELECT id
  FROM "Organization"
  WHERE slug = 'default-org'
  ORDER BY "createdAt" ASC
  LIMIT 1
)
UPDATE "Tournament"
SET "organizationId" = (SELECT id FROM default_org)
WHERE "organizationId" IS NULL
  AND EXISTS (SELECT 1 FROM default_org);

WITH default_org AS (
  SELECT id
  FROM "Organization"
  WHERE slug = 'default-org'
  ORDER BY "createdAt" ASC
  LIMIT 1
)
UPDATE "Player"
SET "organizationId" = (SELECT id FROM default_org)
WHERE "organizationId" IS NULL
  AND EXISTS (SELECT 1 FROM default_org);
