// The version of supabase/schema.sql this build of the dashboard expects (the schema's schema_version() gives its own).
// The schema is applied by hand, so the dashboard says when the project is behind. Raise both together
// (tests/schema.test.ts keeps them equal).
export const SCHEMA_VERSION = 2;
