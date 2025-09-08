/**
 * Import-time mock for @prisma/client used in unit tests.
 * Adjust model fields to match your schema (Application shown here).
 */
export class PrismaClient {
  application = { findMany: jest.fn().mockResolvedValue([]) };
  $connect = jest.fn();
  $disconnect = jest.fn();
}
