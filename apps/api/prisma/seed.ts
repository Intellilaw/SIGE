import "dotenv/config";

import { PrismaClient } from "@prisma/client";
import { TASK_MODULES } from "@sige/contracts";

import { hashPassword } from "../src/core/auth/passwords";

const prisma = new PrismaClient();

async function seedTaskModules() {
  for (const module of TASK_MODULES) {
    await prisma.taskModule.upsert({
      where: { id: module.id },
      update: {
        team: module.team,
        label: module.label,
        summary: module.summary
      },
      create: {
        id: module.id,
        team: module.team,
        label: module.label,
        summary: module.summary
      }
    });

    await prisma.taskTrack.deleteMany({
      where: {
        moduleId: module.id,
        trackCode: {
          notIn: module.tracks.map((track) => track.id)
        }
      }
    });

    for (const track of module.tracks) {
      await prisma.taskTrack.upsert({
        where: {
          moduleId_trackCode: {
            moduleId: module.id,
            trackCode: track.id
          }
        },
        update: {
          label: track.label,
          mode: track.mode,
          recurring: track.recurring ?? false,
          recurrenceRule: track.recurrenceRule ?? undefined
        },
        create: {
          moduleId: module.id,
          trackCode: track.id,
          label: track.label,
          mode: track.mode,
          recurring: track.recurring ?? false,
          recurrenceRule: track.recurrenceRule ?? undefined
        }
      });
    }
  }
}

async function seedUsers() {
  await prisma.user.upsert({
    where: { email: "director@sige.local" },
    update: {
      username: "director",
      displayName: "Direccion General",
      shortName: "DG",
      role: "SUPERADMIN",
      legacyRole: "SUPERADMIN",
      team: "ADMIN",
      legacyTeam: "Dirección general",
      specificRole: "Dirección general",
      permissions: ["*"],
      isActive: true,
      passwordResetRequired: false,
      emailConfirmedAt: new Date(),
      passwordHash: hashPassword("ChangeMe123!")
    },
    create: {
      id: "usr-superadmin",
      email: "director@sige.local",
      username: "director",
      displayName: "Direccion General",
      shortName: "DG",
      role: "SUPERADMIN",
      legacyRole: "SUPERADMIN",
      team: "ADMIN",
      legacyTeam: "Dirección general",
      specificRole: "Dirección general",
      permissions: ["*"],
      isActive: true,
      passwordResetRequired: false,
      emailConfirmedAt: new Date(),
      passwordHash: hashPassword("ChangeMe123!")
    }
  });

  await prisma.user.upsert({
    where: { email: "clientes@sige.local" },
    update: {
      username: "clientes",
      displayName: "Relacion con Clientes",
      shortName: "RC",
      role: "TEAM_LEAD",
      legacyRole: "INTRANET",
      team: "CLIENT_RELATIONS",
      legacyTeam: "Comunicación con cliente",
      specificRole: "Comunicación con cliente",
      permissions: ["dashboard:read", "clients:read", "clients:write", "quotes:read", "quotes:write", "leads:read", "leads:write", "matters:read"],
      isActive: true,
      passwordResetRequired: false,
      emailConfirmedAt: new Date(),
      passwordHash: hashPassword("ChangeMe123!")
    },
    create: {
      id: "usr-client-relations",
      email: "clientes@sige.local",
      username: "clientes",
      displayName: "Relacion con Clientes",
      shortName: "RC",
      role: "TEAM_LEAD",
      legacyRole: "INTRANET",
      team: "CLIENT_RELATIONS",
      legacyTeam: "Comunicación con cliente",
      specificRole: "Comunicación con cliente",
      permissions: ["dashboard:read", "clients:read", "clients:write", "quotes:read", "quotes:write", "leads:read", "leads:write", "matters:read"],
      isActive: true,
      passwordResetRequired: false,
      emailConfirmedAt: new Date(),
      passwordHash: hashPassword("ChangeMe123!")
    }
  });
}

async function seedCommissionReceivers() {
  const receivers = [
    "Dirección general",
    "Litigio (líder)",
    "Litigio (colaborador)",
    "Corporativo-laboral (líder)",
    "Corporativo-laboral (colaborador)",
    "Convenios (líder)",
    "Convenios (colaborador)",
    "Derecho financiero (líder)",
    "Derecho financiero (colaborador)",
    "Compliance fiscal (líder)",
    "Compliance fiscal (colaborador)",
    "Comunicación con cliente",
    "Finanzas"
  ];

  for (const name of receivers) {
    await prisma.commissionReceiver.upsert({
      where: { name },
      update: { active: true },
      create: { name, active: true }
    });
  }
}

async function seedOperationalData() {
  await prisma.client.upsert({
    where: { id: "cli-001" },
    update: { clientNumber: "1001", name: "Grupo Yacatas" },
    create: { id: "cli-001", clientNumber: "1001", name: "Grupo Yacatas" }
  });
  await prisma.client.upsert({
    where: { id: "cli-002" },
    update: { clientNumber: "1002", name: "SOFOM Centro" },
    create: { id: "cli-002", clientNumber: "1002", name: "SOFOM Centro" }
  });
  await prisma.client.upsert({
    where: { id: "cli-003" },
    update: { clientNumber: "1003", name: "Inmobiliaria Atlas" },
    create: { id: "cli-003", clientNumber: "1003", name: "Inmobiliaria Atlas" }
  });

  await prisma.quote.upsert({
    where: { id: "quo-001" },
    update: {
      quoteNumber: "COT-2026-001",
      clientId: "cli-001",
      clientName: "Grupo Yacatas",
      subject: "Monthly tax compliance service",
      status: "SENT",
      quoteType: "RETAINER",
      lineItems: [
        { concept: "Monthly accounting processing", amountMxn: 18000 },
        { concept: "Tax filings", amountMxn: 12000 }
      ],
      totalMxn: 30000,
      milestone: "Operational start",
      notes: "Converted from the legacy compliance workflow."
    },
    create: {
      id: "quo-001",
      quoteNumber: "COT-2026-001",
      clientId: "cli-001",
      clientName: "Grupo Yacatas",
      subject: "Monthly tax compliance service",
      status: "SENT",
      quoteType: "RETAINER",
      lineItems: [
        { concept: "Monthly accounting processing", amountMxn: 18000 },
        { concept: "Tax filings", amountMxn: 12000 }
      ],
      totalMxn: 30000,
      milestone: "Operational start",
      notes: "Converted from the legacy compliance workflow."
    }
  });

  await prisma.quote.upsert({
    where: { id: "quo-002" },
    update: {
      quoteNumber: "COT-2026-002",
      clientId: "cli-002",
      clientName: "SOFOM Centro",
      subject: "REUNE and REUS regulatory package",
      status: "APPROVED",
      quoteType: "ONE_TIME",
      lineItems: [
        { concept: "REUNE quarterly report", amountMxn: 15000 },
        { concept: "REUS monthly filing", amountMxn: 8500 }
      ],
      totalMxn: 23500,
      milestone: "Submission complete",
      notes: "Feeds the financial-law module."
    },
    create: {
      id: "quo-002",
      quoteNumber: "COT-2026-002",
      clientId: "cli-002",
      clientName: "SOFOM Centro",
      subject: "REUNE and REUS regulatory package",
      status: "APPROVED",
      quoteType: "ONE_TIME",
      lineItems: [
        { concept: "REUNE quarterly report", amountMxn: 15000 },
        { concept: "REUS monthly filing", amountMxn: 8500 }
      ],
      totalMxn: 23500,
      milestone: "Submission complete",
      notes: "Feeds the financial-law module."
    }
  });

  await prisma.lead.upsert({
    where: { id: "lea-001" },
    update: {
      clientId: "cli-003",
      clientName: "Inmobiliaria Atlas",
      prospectName: "Jose Lopez",
      commissionAssignee: "RC",
      quoteId: "quo-001",
      quoteNumber: "COT-2026-001",
      subject: "Monthly tax compliance service",
      amountMxn: 30000,
      communicationChannel: "WHATSAPP",
      lastInteractionLabel: "Llamada de seguimiento",
      lastInteraction: new Date(),
      nextInteractionLabel: "Enviar propuesta ajustada",
      nextInteraction: new Date(),
      notes: "Pending client documents.",
      hiddenFromTracking: false,
      status: "ACTIVE"
    },
    create: {
      id: "lea-001",
      clientId: "cli-003",
      clientName: "Inmobiliaria Atlas",
      prospectName: "Jose Lopez",
      commissionAssignee: "RC",
      quoteId: "quo-001",
      quoteNumber: "COT-2026-001",
      subject: "Monthly tax compliance service",
      amountMxn: 30000,
      communicationChannel: "WHATSAPP",
      lastInteractionLabel: "Llamada de seguimiento",
      lastInteraction: new Date(),
      nextInteractionLabel: "Enviar propuesta ajustada",
      nextInteraction: new Date(),
      notes: "Pending client documents.",
      hiddenFromTracking: false,
      status: "ACTIVE"
    }
  });

  await prisma.matter.upsert({
    where: { id: "mat-001" },
    update: {
      matterNumber: "A-2026-001",
      clientId: "cli-002",
      clientNumber: "1002",
      clientName: "SOFOM Centro",
      quoteId: "quo-002",
      quoteNumber: "COT-2026-002",
      commissionAssignee: "Derecho financiero (líder)",
      subject: "Quarterly regulatory bundle",
      totalFeesMxn: 23500,
      responsibleTeam: "FINANCIAL_LAW",
      nextPaymentDate: new Date("2026-04-15T12:00:00.000Z"),
      communicationChannel: "EMAIL",
      nextAction: "Prepare REUNE quarterly filing",
      nextActionDueAt: new Date(),
      nextActionSource: "Derecho financiero: 3. Reportes CONDUSEF (trimestrales)",
      milestone: "Awaiting regulator acknowledgment",
      stage: "EXECUTION",
      origin: "QUOTE"
    },
    create: {
      id: "mat-001",
      matterNumber: "A-2026-001",
      clientId: "cli-002",
      clientNumber: "1002",
      clientName: "SOFOM Centro",
      quoteId: "quo-002",
      quoteNumber: "COT-2026-002",
      commissionAssignee: "Derecho financiero (líder)",
      subject: "Quarterly regulatory bundle",
      totalFeesMxn: 23500,
      responsibleTeam: "FINANCIAL_LAW",
      nextPaymentDate: new Date("2026-04-15T12:00:00.000Z"),
      communicationChannel: "EMAIL",
      nextAction: "Prepare REUNE quarterly filing",
      nextActionDueAt: new Date(),
      nextActionSource: "Derecho financiero: 3. Reportes CONDUSEF (trimestrales)",
      milestone: "Awaiting regulator acknowledgment",
      stage: "EXECUTION",
      origin: "QUOTE"
    }
  });

  await prisma.taskItem.upsert({
    where: { id: "tsk-001" },
    update: {
      moduleId: "financial-law",
      trackId: "reportes-condusef-trimestrales",
      clientName: "SOFOM Centro",
      matterId: "mat-001",
      matterNumber: "A-2026-001",
      subject: "REUNE quarterly filing",
      responsible: "RV",
      dueDate: new Date(),
      state: "PENDING",
      recurring: true
    },
    create: {
      id: "tsk-001",
      moduleId: "financial-law",
      trackId: "reportes-condusef-trimestrales",
      clientName: "SOFOM Centro",
      matterId: "mat-001",
      matterNumber: "A-2026-001",
      subject: "REUNE quarterly filing",
      responsible: "RV",
      dueDate: new Date(),
      state: "PENDING",
      recurring: true
    }
  });
}

async function main() {
  await seedTaskModules();
  await seedUsers();
  await seedCommissionReceivers();
  await seedOperationalData();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
