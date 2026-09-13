-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING', 'PRE_LAUNCH', 'SELLING', 'COMPLETED');

-- AlterEnum
ALTER TYPE "CampaignAudienceType" ADD VALUE 'DEVELOPERS';

-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN     "integration_webhook_url" TEXT;

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "read_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "project_id" TEXT;

-- AlterTable
ALTER TABLE "prospects" ADD COLUMN     "referred_by_developer_id" TEXT;

-- CreateTable
CREATE TABLE "developers" (
    "id" TEXT NOT NULL,
    "developer_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "email" TEXT,
    "company_name" TEXT,
    "region" TEXT,
    "active_status" "ActiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "opt_in_status" BOOLEAN NOT NULL DEFAULT true,
    "opt_in_at" TIMESTAMP(3),
    "opt_in_source" TEXT,
    "opt_out_at" TIMESTAMP(3),
    "opt_out_source" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "developers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "project_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNING',
    "description" TEXT,
    "completion_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "developer_id" TEXT NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "developers_developer_code_key" ON "developers"("developer_code");

-- CreateIndex
CREATE UNIQUE INDEX "developers_phone_e164_key" ON "developers"("phone_e164");

-- CreateIndex
CREATE INDEX "developers_name_idx" ON "developers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "projects_project_code_key" ON "projects"("project_code");

-- CreateIndex
CREATE INDEX "projects_developer_id_idx" ON "projects"("developer_id");

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "projects"("status");

-- CreateIndex
CREATE INDEX "listings_project_id_idx" ON "listings"("project_id");

-- CreateIndex
CREATE INDEX "prospects_referred_by_developer_id_idx" ON "prospects"("referred_by_developer_id");

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_referred_by_developer_id_fkey" FOREIGN KEY ("referred_by_developer_id") REFERENCES "developers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "developers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

