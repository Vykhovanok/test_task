import * as fs from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PostgresTestServer } from '../support/postgres-test-server';

const serverRoot = path.resolve(__dirname, '../..');
const storageRoot = path.resolve(serverRoot, 'storage');
const postgres = new PostgresTestServer();
let prisma: PrismaService;

async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "PublicLink",
      "ShareInvitation",
      "ResourcePermission",
      "Resource",
      "AuthSession",
      "User"
    CASCADE
  `);
}

async function resetStorage(): Promise<void> {
  await fs.rm(storageRoot, { recursive: true, force: true });
}

export const mochaHooks = {
  async beforeAll() {
    process.env.JWT_SECRET = 'integration-test-secret';
    process.env.CLIENT_ORIGIN = 'http://localhost:3001';
    postgres.start(serverRoot);
    process.env.DATABASE_URL = postgres.databaseUrl;
    prisma = new PrismaService();
    await prisma.$connect();
  },
  async beforeEach() {
    await resetDatabase();
    await resetStorage();
  },
  async afterAll() {
    if (prisma) {
      await prisma.$disconnect();
    }
    await resetStorage();
    postgres.stop();
  },
};
