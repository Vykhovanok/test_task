import {
  PermissionRole,
  PrismaClient,
  ResourceType,
  Visibility,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SEED_USERS = [
  { email: 'owner1@seed.local', name: 'Owner One' },
  { email: 'owner2@seed.local', name: 'Owner Two' },
  { email: 'editor1@seed.local', name: 'Editor One' },
  { email: 'editor2@seed.local', name: 'Editor Two' },
  { email: 'viewer1@seed.local', name: 'Viewer One' },
  { email: 'viewer2@seed.local', name: 'Viewer Two' },
] as const;

async function upsertUser(
  email: string,
  name: string,
  passwordHash: string,
): Promise<{ id: string; email: string }> {
  return prisma.user.upsert({
    where: { email },
    update: { name, passwordHash },
    create: { email, name, passwordHash },
    select: { id: true, email: true },
  });
}

async function findFolder(
  ownerId: string,
  name: string,
  parentId: string | null,
): Promise<{ id: string } | null> {
  return prisma.resource.findFirst({
    where: { ownerId, name, parentId, type: ResourceType.FOLDER },
    select: { id: true },
  });
}

async function ensureFolder(
  ownerId: string,
  name: string,
  parentId: string | null,
  sortOrder: number,
): Promise<{ id: string }> {
  const existing = await findFolder(ownerId, name, parentId);

  if (existing) {
    return existing;
  }

  return prisma.resource.create({
    data: {
      name,
      type: ResourceType.FOLDER,
      ownerId,
      parentId,
      visibility: Visibility.PRIVATE,
      sortOrder,
    },
    select: { id: true },
  });
}

async function ensurePermission(
  resourceId: string,
  userId: string,
  role: PermissionRole,
): Promise<void> {
  await prisma.resourcePermission.upsert({
    where: {
      resourceId_userId: { resourceId, userId },
    },
    update: { role },
    create: { resourceId, userId, role },
  });
}

async function main(): Promise<void> {
  if (process.env.SEED_DEV_DATA !== 'true') {
    console.log('Seed skipped. Set SEED_DEV_DATA=true to populate dev data.');
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed in production.');
  }

  const password = process.env.SEED_DEV_PASSWORD?.trim();

  if (!password) {
    throw new Error('SEED_DEV_PASSWORD is required when SEED_DEV_DATA=true.');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const users = new Map<string, { id: string; email: string }>();

  for (const profile of SEED_USERS) {
    const user = await upsertUser(profile.email, profile.name, passwordHash);
    users.set(profile.email, user);
  }

  const owner1 = users.get('owner1@seed.local')!;
  const owner2 = users.get('owner2@seed.local')!;
  const editor1 = users.get('editor1@seed.local')!;
  const editor2 = users.get('editor2@seed.local')!;
  const viewer1 = users.get('viewer1@seed.local')!;
  const viewer2 = users.get('viewer2@seed.local')!;

  const workspaceA = await ensureFolder(owner1.id, 'Workspace A', null, 0);
  const workspaceB = await ensureFolder(owner2.id, 'Workspace B', null, 0);
  const shared = await ensureFolder(owner1.id, 'Shared', workspaceA.id, 0);

  await ensureFolder(owner1.id, 'Private', workspaceA.id, 1);
  await ensureFolder(owner2.id, 'Private', workspaceB.id, 0);

  for (const editor of [editor1, editor2]) {
    await ensurePermission(shared.id, editor.id, PermissionRole.EDITOR);
  }

  for (const viewer of [viewer1, viewer2]) {
    await ensurePermission(shared.id, viewer.id, PermissionRole.VIEWER);
  }

  console.log('Dev seed complete.');
  console.log(`Password for all seed users: ${password}`);
  console.log('Users:', SEED_USERS.map((user) => user.email).join(', '));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
