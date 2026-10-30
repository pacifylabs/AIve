-- The application connects as a role that owns nothing and cannot bypass row-level security.
-- Migrations run as the admin role; tables are granted to the app role by the migrations.
-- The password here is for local development only.
CREATE ROLE ai_staff_app LOGIN PASSWORD 'ai_staff_app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
