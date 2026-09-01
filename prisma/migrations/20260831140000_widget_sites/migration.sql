CREATE TABLE IF NOT EXISTS "widget_sites" (
    "id" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "title" TEXT NOT NULL DEFAULT 'Assistant',
    "welcome_message" TEXT NOT NULL,
    "assistant_name" TEXT NOT NULL DEFAULT 'Assistant',
    "logo_url" TEXT,
    "primary_color" TEXT NOT NULL DEFAULT '#0f766e',
    "language" TEXT NOT NULL DEFAULT 'en',
    "allowed_origins" TEXT[] NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "widget_sites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "widget_sites_public_key_key" ON "widget_sites"("public_key");
CREATE INDEX IF NOT EXISTS "widget_sites_organization_id_idx" ON "widget_sites"("organization_id");

ALTER TABLE "widget_sites" DROP CONSTRAINT IF EXISTS "widget_sites_organization_id_fkey";
ALTER TABLE "widget_sites" ADD CONSTRAINT "widget_sites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
