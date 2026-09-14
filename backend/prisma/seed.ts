import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
  ActiveStatus,
  AvailabilityStatus,
  CustomerTransactionType,
  LeadStage,
  PropertyCategory,
  ProspectIntent,
  ProjectStatus,
  StaffRole,
  TransactionType,
  WhatsAppMode,
  PrismaClient,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(rootDir, ".env") });

const prisma = new PrismaClient();

const ADMIN_EMAIL = "admin@arcloops.local";
const ADMIN_PASSWORD = "Admin123!ChangeMe";
const VIEWER_EMAIL = "viewer@arcloops.local";
const VIEWER_PASSWORD = "Viewer123!ChangeMe";

async function seedAppMeta() {
  await prisma.appMeta.upsert({
    where: { id: "default" },
    update: { version: "0.13.0", phase: "13" },
    create: { id: "default", version: "0.13.0", phase: "13" },
  });
}

async function seedSettingsAndTemplates() {
  await prisma.appSettings.upsert({
    where: { id: "default" },
    update: {
      defaultCurrency: "BDT",
      coldLeadDays: 30,
      whatsappMode: WhatsAppMode.MOCK,
      bspDisplayName: "Mock WhatsApp",
      conversationRetentionDays: 365,
    },
    create: {
      id: "default",
      defaultCurrency: "BDT",
      coldLeadDays: 30,
      whatsappMode: WhatsAppMode.MOCK,
      bspDisplayName: "Mock WhatsApp",
      conversationRetentionDays: 365,
    },
  });

  const templates = [
    {
      name: "hello_world",
      language: "en",
      bodyPreview: "Hello {{1}}, welcome to Arcloops.",
    },
    {
      name: "listing_share",
      language: "en",
      bodyPreview: "New listing in {{1}}: {{2}}. Reply YES for a viewing.",
    },
    {
      name: "viewing_reminder",
      language: "en",
      bodyPreview: "Reminder: your viewing is scheduled for {{1}}.",
    },
  ];

  for (const t of templates) {
    await prisma.whatsAppTemplate.upsert({
      where: { name: t.name },
      update: {
        language: t.language,
        status: "APPROVED",
        bodyPreview: t.bodyPreview,
        lastSyncedAt: new Date(),
      },
      create: {
        name: t.name,
        language: t.language,
        status: "APPROVED",
        bodyPreview: t.bodyPreview,
      },
    });
  }
}

async function seedStaff() {
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const viewerHash = await bcrypt.hash(VIEWER_PASSWORD, 12);

  await prisma.staffUser.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      name: "Arcloops Admin",
      passwordHash: adminHash,
      role: StaffRole.ADMIN,
      activeStatus: ActiveStatus.ACTIVE,
      permissions: [],
    },
    create: {
      name: "Arcloops Admin",
      email: ADMIN_EMAIL,
      passwordHash: adminHash,
      role: StaffRole.ADMIN,
      activeStatus: ActiveStatus.ACTIVE,
      permissions: [],
    },
  });

  await prisma.staffUser.upsert({
    where: { email: VIEWER_EMAIL },
    update: {
      name: "Read-only Viewer",
      passwordHash: viewerHash,
      role: StaffRole.VIEWER,
      activeStatus: ActiveStatus.ACTIVE,
      permissions: [],
    },
    create: {
      name: "Read-only Viewer",
      email: VIEWER_EMAIL,
      passwordHash: viewerHash,
      role: StaffRole.VIEWER,
      activeStatus: ActiveStatus.ACTIVE,
      permissions: [],
    },
  });
}

async function seedListingsAndContacts() {
  const broker = await prisma.broker.upsert({
    where: { phoneE164: "+8801711000001" },
    update: {
      name: "Rahim Broker",
      phone: "01711000001",
      regionArea: "Banani",
      activeStatus: ActiveStatus.ACTIVE,
      optInStatus: true,
      tags: ["residential"],
    },
    create: {
      brokerCode: "BRK-00001",
      name: "Rahim Broker",
      phone: "01711000001",
      phoneE164: "+8801711000001",
      regionArea: "Banani",
      activeStatus: ActiveStatus.ACTIVE,
      optInStatus: true,
      tags: ["residential"],
    },
  });

  let listing = await prisma.listing.findUnique({
    where: { listingCode: "LST-00001" },
  });
  if (!listing) {
    listing = await prisma.listing.create({
      data: {
        listingCode: "LST-00001",
        title: "3BR Apartment in Banani",
        propertyCategory: PropertyCategory.APARTMENT,
        transactionType: TransactionType.SALE,
        location: "Banani, Dhaka",
        price: 8500000,
        currency: "BDT",
        sizeValue: 1450,
        sizeUnit: "sq.ft",
        bedrooms: 3,
        bathrooms: 3,
        availabilityStatus: AvailabilityStatus.AVAILABLE,
        amenities: ["Lift", "Parking", "Generator", "Security"],
        photos: ["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688"],
        description: "Bright corner unit near Banani lake.",
        brokerId: broker.id,
      },
    });
  }

  await prisma.broker.update({
    where: { id: broker.id },
    data: { listingsAssigned: { connect: [{ id: listing.id }] } },
  });

  await prisma.customer.upsert({
    where: { phoneE164: "+8801711000002" },
    update: {
      name: "Karim Customer",
      listingId: listing.id,
      assignedBrokerId: broker.id,
      optInStatus: true,
      tags: ["repeat"],
    },
    create: {
      customerCode: "CUS-00001",
      name: "Karim Customer",
      phone: "01711000002",
      phoneE164: "+8801711000002",
      transactionType: CustomerTransactionType.BOUGHT,
      transactionDate: new Date("2025-06-01"),
      listingId: listing.id,
      assignedBrokerId: broker.id,
      optInStatus: true,
      tags: ["repeat"],
    },
  });

  await prisma.prospect.upsert({
    where: { phoneE164: "+8801711000003" },
    update: {
      name: "Nusrat Prospect",
      leadStage: LeadStage.QUALIFIED,
      intent: ProspectIntent.BUY,
      preferredLocation: "Gulshan",
      assignedBrokerId: broker.id,
      optInStatus: true,
      tags: ["hot"],
    },
    create: {
      prospectCode: "PRS-00001",
      name: "Nusrat Prospect",
      phone: "01711000003",
      phoneE164: "+8801711000003",
      budgetMin: 5000000,
      budgetMax: 9000000,
      preferredLocation: "Gulshan",
      propertyTypeInterest: PropertyCategory.APARTMENT,
      intent: ProspectIntent.BUY,
      leadSource: "manual",
      leadStage: LeadStage.QUALIFIED,
      lastInteractionDate: new Date(),
      assignedBrokerId: broker.id,
      optInStatus: true,
      tags: ["hot"],
    },
  });
}

async function seedDeveloper() {
  const developer = await prisma.developer.upsert({
    where: { phoneE164: "+8801711000099" },
    update: {
      name: "Horizon Developers",
      companyName: "Horizon Ltd",
      region: "Dhaka",
      optInStatus: true,
      activeStatus: ActiveStatus.ACTIVE,
    },
    create: {
      developerCode: "DEV-00001",
      name: "Horizon Developers",
      phone: "01711000099",
      phoneE164: "+8801711000099",
      companyName: "Horizon Ltd",
      region: "Dhaka",
      email: "partnerships@horizon.local",
      optInStatus: true,
      optInAt: new Date(),
      optInSource: "seed",
      tags: ["partner"],
    },
  });

  const project = await prisma.project.upsert({
    where: { projectCode: "PRJ-00001" },
    update: {
      name: "Horizon Residences",
      location: "Bashundhara",
      status: ProjectStatus.PRE_LAUNCH,
      developerId: developer.id,
    },
    create: {
      projectCode: "PRJ-00001",
      name: "Horizon Residences",
      location: "Bashundhara",
      status: ProjectStatus.PRE_LAUNCH,
      description: "Pre-launch tower near lake",
      developerId: developer.id,
    },
  });

  await prisma.listing.upsert({
    where: { listingCode: "LST-PL-00001" },
    update: {
      title: "Horizon Residences Unit A1",
      projectId: project.id,
      propertyCategory: PropertyCategory.PRE_LAUNCH,
      availabilityStatus: AvailabilityStatus.COMING_SOON,
    },
    create: {
      listingCode: "LST-PL-00001",
      title: "Horizon Residences Unit A1",
      propertyCategory: PropertyCategory.PRE_LAUNCH,
      transactionType: TransactionType.SALE,
      location: "Bashundhara",
      price: 12500000,
      currency: "BDT",
      bedrooms: 3,
      bathrooms: 3,
      availabilityStatus: AvailabilityStatus.COMING_SOON,
      description: "Seed pre-launch unit",
      projectId: project.id,
    },
  });

  await prisma.prospect.upsert({
    where: { phoneE164: "+8801711000088" },
    update: {
      leadSource: "developer",
      referredByDeveloperId: developer.id,
    },
    create: {
      prospectCode: "PRS-DEV-00001",
      name: "Developer Lead",
      phone: "01711000088",
      phoneE164: "+8801711000088",
      preferredLocation: "Bashundhara",
      intent: ProspectIntent.BUY,
      leadSource: "developer",
      leadStage: LeadStage.NEW,
      referredByDeveloperId: developer.id,
      optInStatus: true,
      tags: ["developer"],
    },
  });
}

async function seedLocationAreas() {
  const areas = [
    "Gulshan",
    "Banani",
    "Dhanmondi",
    "Uttara",
    "Mirpur",
    "Bashundhara",
    "Motijheel",
    "Mohakhali",
    "Baridhara",
  ];
  for (let i = 0; i < areas.length; i++) {
    await prisma.locationArea.upsert({
      where: { name: areas[i] },
      update: { active: true, sortOrder: i },
      create: { name: areas[i], active: true, sortOrder: i },
    });
  }
}

async function main() {
  console.log("Seeding Phases 1–13 baseline…");
  await seedAppMeta();
  await seedSettingsAndTemplates();
  await seedLocationAreas();
  await seedStaff();
  await seedListingsAndContacts();
  await seedDeveloper();
  console.log("Seed complete.");
  console.log(`Admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`Viewer login: ${VIEWER_EMAIL} / ${VIEWER_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
