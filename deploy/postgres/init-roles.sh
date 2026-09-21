#!/bin/sh
set -eu

migration_password=$(cat /run/rogimarble-secrets/postgres_migration_password)
app_password=$(cat /run/rogimarble-secrets/postgres_app_password)

psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set database="$POSTGRES_DB" \
  --set migration_user="$MIGRATION_DB_USER" --set migration_password="$migration_password" \
  --set app_user="$APP_DB_USER" --set app_password="$app_password" <<'SQL'
CREATE ROLE :"migration_user" LOGIN PASSWORD :'migration_password';
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_password';
GRANT CONNECT ON DATABASE :"database" TO :"migration_user", :"app_user";
GRANT USAGE, CREATE ON SCHEMA public TO :"migration_user";
GRANT USAGE ON SCHEMA public TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migration_user" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migration_user" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :"app_user";
SQL
