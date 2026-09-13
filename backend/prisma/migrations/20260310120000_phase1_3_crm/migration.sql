-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('ADMIN', 'CAMPAIGN_MANAGER', 'SUPPORT_AGENT', 'VIEWER');

-- CreateEnum
CREATE TYPE "ActiveStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PropertyCategory" AS ENUM ('APARTMENT', 'HOUSE', 'LAND', 'COMMERCIAL', 'PRE_LAUNCH', 'MIXED_USE');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('SALE', 'RENT', 'INVESTMENT', 'LEASE');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'UNDER_OFFER', 'SOLD', 'RENTED', 'COMING_SOON');

-- CreateEnum
CREATE TYPE "BrokerSpecialization" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'LAND');

-- CreateEnum
CREATE TYPE "CustomerTransactionType" AS ENUM ('BOUGHT', 'RENTED', 'INVESTED');

-- CreateEnum
CREATE TYPE "ProspectIntent" AS ENUM ('BUY', 'RENT', 'INVEST');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('NEW', 'QUALIFIED', 'VIEWING_BOOKED', 'COLD');

-- CreateTable
CREATE TABLE "staff_users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL DEFAULT 'VIEWER',
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active_status" "ActiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" TEXT NOT NULL,
    "listing_code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "property_category" "PropertyCategory" NOT NULL,
    "transaction_type" "TransactionType" NOT NULL,
    "location" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "price" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "size_value" DOUBLE PRECISION,
    "size_unit" TEXT,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "availability_status" "AvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "installment_plan" JSONB,
    "zoning" TEXT,
    "floor_number" INTEGER,
    "year_built" INTEGER,
    "completion_date" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "broker_id" TEXT,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brokers" (
    "id" TEXT NOT NULL,
    "broker_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "email" TEXT,
    "region_area" TEXT,
    "specialization" "BrokerSpecialization",
    "active_status" "ActiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "join_date" TIMESTAMP(3),
    "opt_in_status" BOOLEAN NOT NULL DEFAULT true,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brokers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "customer_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "email" TEXT,
    "transaction_type" "CustomerTransactionType" NOT NULL,
    "transaction_date" TIMESTAMP(3),
    "referral_count" INTEGER NOT NULL DEFAULT 0,
    "opt_in_status" BOOLEAN NOT NULL DEFAULT true,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "listing_id" TEXT,
    "assigned_broker_id" TEXT,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prospects" (
    "id" TEXT NOT NULL,
    "prospect_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "budget_min" DECIMAL(14,2),
    "budget_max" DECIMAL(14,2),
    "preferred_location" TEXT,
    "property_type_interest" "PropertyCategory",
    "intent" "ProspectIntent",
    "lead_source" TEXT,
    "lead_stage" "LeadStage" NOT NULL DEFAULT 'NEW',
    "last_interaction_date" TIMESTAMP(3),
    "opt_in_status" BOOLEAN NOT NULL DEFAULT true,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "conversation_history_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "assigned_broker_id" TEXT,

    CONSTRAINT "prospects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppression_list" (
    "id" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "opted_out_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppression_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_BrokerListings" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_BrokerListings_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_users_email_key" ON "staff_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "listings_listing_code_key" ON "listings"("listing_code");

-- CreateIndex
CREATE INDEX "listings_availability_status_idx" ON "listings"("availability_status");

-- CreateIndex
CREATE INDEX "listings_property_category_idx" ON "listings"("property_category");

-- CreateIndex
CREATE INDEX "listings_transaction_type_idx" ON "listings"("transaction_type");

-- CreateIndex
CREATE INDEX "listings_location_idx" ON "listings"("location");

-- CreateIndex
CREATE UNIQUE INDEX "brokers_broker_code_key" ON "brokers"("broker_code");

-- CreateIndex
CREATE UNIQUE INDEX "brokers_phone_e164_key" ON "brokers"("phone_e164");

-- CreateIndex
CREATE INDEX "brokers_name_idx" ON "brokers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "customers_customer_code_key" ON "customers"("customer_code");

-- CreateIndex
CREATE UNIQUE INDEX "customers_phone_e164_key" ON "customers"("phone_e164");

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "prospects_prospect_code_key" ON "prospects"("prospect_code");

-- CreateIndex
CREATE UNIQUE INDEX "prospects_phone_e164_key" ON "prospects"("phone_e164");

-- CreateIndex
CREATE INDEX "prospects_lead_stage_idx" ON "prospects"("lead_stage");

-- CreateIndex
CREATE INDEX "prospects_name_idx" ON "prospects"("name");

-- CreateIndex
CREATE UNIQUE INDEX "suppression_list_phone_e164_key" ON "suppression_list"("phone_e164");

-- CreateIndex
CREATE INDEX "_BrokerListings_B_index" ON "_BrokerListings"("B");

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_assigned_broker_id_fkey" FOREIGN KEY ("assigned_broker_id") REFERENCES "brokers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_assigned_broker_id_fkey" FOREIGN KEY ("assigned_broker_id") REFERENCES "brokers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BrokerListings" ADD CONSTRAINT "_BrokerListings_A_fkey" FOREIGN KEY ("A") REFERENCES "brokers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BrokerListings" ADD CONSTRAINT "_BrokerListings_B_fkey" FOREIGN KEY ("B") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

