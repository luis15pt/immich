import { WorkflowController } from 'src/controllers/workflow.controller';
import { WorkflowTrigger } from 'src/enum';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { WorkflowService } from 'src/services/workflow.service';
import request from 'supertest';
import { errorDto } from 'test/medium/responses';
import { factory } from 'test/small.factory';
import { automock, ControllerContext, controllerSetup, mockBaseService } from 'test/utils';

describe(WorkflowController.name, () => {
  let ctx: ControllerContext;
  const service = mockBaseService(WorkflowService);

  beforeAll(async () => {
    ctx = await controllerSetup(WorkflowController, [
      { provide: WorkflowService, useValue: service },
      { provide: LoggingRepository, useValue: automock(LoggingRepository, { strict: false }) },
    ]);
    return () => ctx.close();
  });

  beforeEach(() => {
    service.resetAllMocks();
    ctx.reset();
  });

  describe('POST /workflows', () => {
    it('should be an authenticated route', async () => {
      await request(ctx.getHttpServer()).post('/workflows').send({});
      expect(ctx.authenticate).toHaveBeenCalled();
    });

    it(`should require a valid trigger`, async () => {
      const { status, body } = await request(ctx.getHttpServer())
        .post(`/workflows`)
        .send({ trigger: 'invalid' })
        .set('Authorization', `Bearer token`);
      expect(status).toBe(400);
      expect(body).toEqual(
        errorDto.badRequest(
          expect.arrayContaining([expect.stringContaining('trigger must be one of the following values')]),
        ),
      );
    });

    it(`should require a valid enabled value`, async () => {
      const { status, body } = await request(ctx.getHttpServer())
        .post(`/workflows`)
        .send({ enabled: 'invalid' })
        .set('Authorization', `Bearer token`);
      expect(status).toBe(400);
      expect(body).toEqual(
        errorDto.badRequest(expect.arrayContaining([expect.stringContaining('enabled must be a boolean')])),
      );
    });

    it(`should require a name`, async () => {
      const { status, body } = await request(ctx.getHttpServer())
        .post(`/workflows`)
        .send({ trigger: WorkflowTrigger.AssetCreate })
        .set('Authorization', `Bearer token`);
      expect(status).toBe(400);
      expect(body).toEqual(
        errorDto.badRequest(expect.arrayContaining([expect.stringContaining('name must be a string')])),
      );
    });
  });

  describe('GET /workflows', () => {
    it('should be an authenticated route', async () => {
      await request(ctx.getHttpServer()).get('/workflows');
      expect(ctx.authenticate).toHaveBeenCalled();
    });

    it(`should require id to be a uuid`, async () => {
      const { status, body } = await request(ctx.getHttpServer())
        .get(`/workflows`)
        .query({ id: 'invalid' })
        .set('Authorization', `Bearer token`);
      expect(status).toBe(400);
      expect(body).toEqual(errorDto.badRequest([expect.stringContaining('must be a UUID')]));
    });
  });

  describe('GET /workflows/:id', () => {
    it('should be an authenticated route', async () => {
      await request(ctx.getHttpServer()).get(`/workflows/${factory.uuid()}`);
      expect(ctx.authenticate).toHaveBeenCalled();
    });

    it(`should require id to be a uuid`, async () => {
      const { status, body } = await request(ctx.getHttpServer())
        .get(`/workflows/invalid`)
        .set('Authorization', `Bearer token`);
      expect(status).toBe(400);
      expect(body).toEqual(errorDto.badRequest([expect.stringContaining('must be a UUID')]));
    });
  });

  describe('PUT /workflows/:id', () => {
    it('should be an authenticated route', async () => {
      await request(ctx.getHttpServer()).put(`/workflows/${factory.uuid()}`).send({});
      expect(ctx.authenticate).toHaveBeenCalled();
    });

    it(`should require id to be a uuid`, async () => {
      const { status, body } = await request(ctx.getHttpServer())
        .put(`/workflows/invalid`)
        .set('Authorization', `Bearer token`)
        .send({});
      expect(status).toBe(400);
      expect(body).toEqual(errorDto.badRequest([expect.stringContaining('must be a UUID')]));
    });
  });
});
