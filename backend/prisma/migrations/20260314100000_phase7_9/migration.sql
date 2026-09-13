-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CampaignAudienceType" AS ENUM ('BROKERS', 'CUSTOMERS', 'PROSPECTS');

-- CreateEnum
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('PENDING', 'SKIPPED', 'QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'REPLIED');

-- CreateEnum
CREATE TYPE "CampaignContactType" AS ENUM ('BROKER', 'CUSTOMER', 'PROSPECT');

-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN     "conversation_retention_days" INTEGER NOT NULL DEFAULT 365;

-- AlterTable
ALTER TABLE "brokers" ADD COLUMN     "opt_in_at" TIMESTAMP(3),
ADD COLUMN     "opt_in_source" TEXT,
ADD COLUMN     "opt_out_at" TIMESTAMP(3),
ADD COLUMN     "opt_out_source" TEXT;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "assigned_staff_id" TEXT,
ADD COLUMN     "bot_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "escalated_at" TIMESTAMP(3),
ADD COLUMN     "escalation_summary" TEXT,
ADD COLUMN     "human_takeover" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "opt_in_at" TIMESTAMP(3),
ADD COLUMN     "opt_in_source" TEXT,
ADD COLUMN     "opt_out_at" TIMESTAMP(3),
ADD COLUMN     "opt_out_source" TEXT;

-- AlterTable
ALTER TABLE "prospects" ADD COLUMN     "opt_in_at" TIMESTAMP(3),
ADD COLUMN     "opt_in_source" TEXT,
ADD COLUMN     "opt_out_at" TIMESTAMP(3),
ADD COLUMN     "opt_out_source" TEXT;

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "audience_type" "CampaignAudienceType" NOT NULL,
    "audience_filters" JSONB NOT NULL DEFAULT '{}',
    "template_name" TEXT NOT NULL,
    "template_variant_b" TEXT,
    "ab_split_percent" INTEGER,
    "merge_field_map" JSONB NOT NULL DEFAULT '{}',
    "scheduled_at" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Dhaka',
    "rate_limit_per_sec" INTEGER NOT NULL DEFAULT 5,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "total_recipients" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "delivered_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "replied_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "id" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "contact_type" "CampaignContactType" NOT NULL,
    "contact_id" TEXT NOT NULL,
    "template_name" TEXT,
    "merge_payload" JSONB NOT NULL DEFAULT '{}',
    "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "skip_reason" TEXT,
    "bsp_message_id" TEXT,
    "message_id" TEXT,
    "sent_at" TIMESTAMP(3),
    "error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "campaign_id" TEXT NOT NULL,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_events" (
    "id" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE INDEX "campaigns_created_by_id_idx" ON "campaigns"("created_by_id");

-- CreateIndex
CREATE INDEX "campaign_recipients_campaign_id_status_idx" ON "campaign_recipients"("campaign_id", "status");

-- CreateIndex
CREATE INDEX "campaign_recipients_phone_e164_idx" ON "campaign_recipients"("phone_e164");

-- CreateIndex
CREATE INDEX "campaign_recipients_bsp_message_id_idx" ON "campaign_recipients"("bsp_message_id");

-- CreateIndex
CREATE INDEX "consent_events_phone_e164_idx" ON "consent_events"("phone_e164");

-- CreateIndex
CREATE INDEX "conversations_human_takeover_idx" ON "conversations"("human_takeover");

-- CreateIndex
CREATE INDEX "conversations_escalated_at_idx" ON "conversations"("escalated_at");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_staff_id_fkey" FOREIGN KEY ("assigned_staff_id") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

