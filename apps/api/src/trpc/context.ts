import type { inferAsyncReturnType } from '@trpc/server';
import { PrismaClient } from '@prisma/client';

// You can swap this for a shared singleton if you have one.
const prisma = new PrismaClient();

export async function createContext() {
  // TODO: add real auth/session later (e.g., userId)
  return { prisma };
}
export type Context = inferAsyncReturnType<typeof createContext>;
