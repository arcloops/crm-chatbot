-- AlterTable
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ViewingRequestStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'CANCELLED', 'COMPLETED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "viewing_requests" (
    "id" TEXT NOT NULL,
    "preferred_date" TEXT,
    "preferred_time" TEXT,
    "notes" TEXT,
    "status" "ViewingRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prospect_id" TEXT NOT NULL,
    "listing_id" TEXT,

    CONSTRAINT "viewing_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "location_areas" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_areas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "location_areas_name_key" ON "location_areas"("name");
CREATE INDEX IF NOT EXISTS "location_areas_active_sort_order_idx" ON "location_areas"("active", "sort_order");
CREATE INDEX IF NOT EXISTS "viewing_requests_prospect_id_idx" ON "viewing_requests"("prospect_id");
CREATE INDEX IF NOT EXISTS "viewing_requests_listing_id_idx" ON "viewing_requests"("listing_id");
CREATE INDEX IF NOT EXISTS "viewing_requests_status_idx" ON "viewing_requests"("status");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "viewing_requests" ADD CONSTRAINT "viewing_requests_prospect_id_fkey" FOREIGN KEY ("prospect_id") REFERENCES "prospects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "viewing_requests" ADD CONSTRAINT "viewing_requests_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
