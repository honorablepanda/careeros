import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AppService', () => {
  let service: AppService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppService, PrismaService],
    }).compile();

    service = module.get<AppService>(AppService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should return an array of users', async () => {
    const mockUsers = [{ id: '1', email: 'test@example.com', name: 'Test User', createdAt: new Date() }];
    jest.spyOn(prismaService.application, 'findMany').mockResolvedValue(mockUsers);

    expect(await service.getUsers()).toEqual(mockUsers);
  });
});