import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let controller: AppController;
  let service: AppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: {
            getUsers: jest.fn().mockResolvedValue([{ id: '1', email: 'test@example.com', name: 'Test User', createdAt: new Date() }]),
          },
        },
      ],
    }).compile();

    controller = module.get<AppController>(AppController);
    service = module.get<AppService>(AppService);
  });

  it('should return an array of users from getUsers', async () => {
    expect(await controller.getUsers()).toEqual([{ id: '1', email: 'test@example.com', name: 'Test User', createdAt: expect.any(Date) }]);
  });
});