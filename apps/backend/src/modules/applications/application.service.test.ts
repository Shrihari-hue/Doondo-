import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanupTestData, closeDb, createTestJob, createTestUser, ensureDb } from '@/test/helpers';
import * as applicationService from './application.service';

describe('application.service', () => {
  const userIds: string[] = [];
  const jobIds: string[] = [];
  const applicationIds: string[] = [];

  beforeAll(() => {
    ensureDb();
  });

  afterAll(async () => {
    await cleanupTestData({ userIds, jobIds, applicationIds });
    await closeDb();
  });

  async function seekerAndJob() {
    const employer = await createTestUser('employer');
    const seeker = await createTestUser('seeker');
    userIds.push(employer.id, seeker.id);
    const job = await createTestJob(employer.id);
    jobIds.push(job.id);
    return { employer, seeker, job };
  }

  describe('apply', () => {
    it('creates a pending application', async () => {
      const { seeker, job } = await seekerAndJob();
      const app = await applicationService.apply({ seekerId: seeker.id, jobId: job.id });
      applicationIds.push(app.id);
      expect(app.status).toBe('pending');
      expect(app.jobId).toBe(job.id);
    });

    it('rejects a duplicate application to the same job with APPLICATION_ALREADY_EXISTS', async () => {
      const { seeker, job } = await seekerAndJob();
      const first = await applicationService.apply({ seekerId: seeker.id, jobId: job.id });
      applicationIds.push(first.id);

      await expect(
        applicationService.apply({ seekerId: seeker.id, jobId: job.id }),
      ).rejects.toMatchObject({ code: 'APPLICATION_ALREADY_EXISTS' });
    });

    it('rejects applying to a job that is not active with JOB_NOT_OPEN', async () => {
      const employer = await createTestUser('employer');
      const seeker = await createTestUser('seeker');
      userIds.push(employer.id, seeker.id);
      const job = await createTestJob(employer.id, { status: 'filled' });
      jobIds.push(job.id);

      await expect(
        applicationService.apply({ seekerId: seeker.id, jobId: job.id }),
      ).rejects.toMatchObject({ code: 'JOB_NOT_OPEN' });
    });

    it('rejects applying to a nonexistent job with JOB_NOT_FOUND', async () => {
      const seeker = await createTestUser('seeker');
      userIds.push(seeker.id);
      await expect(
        applicationService.apply({ seekerId: seeker.id, jobId: '00000000-0000-0000-0000-000000000000' }),
      ).rejects.toMatchObject({ code: 'JOB_NOT_FOUND' });
    });
  });

  describe('transitionByEmployer', () => {
    it('walks the full happy path: pending -> viewed -> shortlisted -> hired', async () => {
      const { employer, seeker, job } = await seekerAndJob();
      const app = await applicationService.apply({ seekerId: seeker.id, jobId: job.id });
      applicationIds.push(app.id);

      const viewed = await applicationService.transitionByEmployer(employer.id, app.id, 'viewed');
      expect(viewed.status).toBe('viewed');

      const shortlisted = await applicationService.transitionByEmployer(
        employer.id,
        app.id,
        'shortlisted',
      );
      expect(shortlisted.status).toBe('shortlisted');

      const hired = await applicationService.transitionByEmployer(employer.id, app.id, 'hired');
      expect(hired.status).toBe('hired');
      expect(hired.timeline.hiredAt).toEqual(expect.any(String));
    });

    it('rejects an invalid transition (pending -> hired, skipping shortlisted)', async () => {
      const { employer, seeker, job } = await seekerAndJob();
      const app = await applicationService.apply({ seekerId: seeker.id, jobId: job.id });
      applicationIds.push(app.id);

      await expect(
        applicationService.transitionByEmployer(employer.id, app.id, 'hired'),
      ).rejects.toMatchObject({ code: 'APPLICATION_INVALID_TRANSITION' });
    });

    it('rejects a transition attempted by an employer who does not own the job', async () => {
      const { seeker, job } = await seekerAndJob();
      const otherEmployer = await createTestUser('employer');
      userIds.push(otherEmployer.id);
      const app = await applicationService.apply({ seekerId: seeker.id, jobId: job.id });
      applicationIds.push(app.id);

      await expect(
        applicationService.transitionByEmployer(otherEmployer.id, app.id, 'viewed'),
      ).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });
    });

    it('rejects transitions once an application is already terminal (rejected)', async () => {
      const { employer, seeker, job } = await seekerAndJob();
      const app = await applicationService.apply({ seekerId: seeker.id, jobId: job.id });
      applicationIds.push(app.id);
      await applicationService.transitionByEmployer(employer.id, app.id, 'rejected');

      await expect(
        applicationService.transitionByEmployer(employer.id, app.id, 'shortlisted'),
      ).rejects.toMatchObject({ code: 'APPLICATION_INVALID_TRANSITION' });
    });
  });

  describe('withdraw', () => {
    it('lets the seeker withdraw a pending application', async () => {
      const { seeker, job } = await seekerAndJob();
      const app = await applicationService.apply({ seekerId: seeker.id, jobId: job.id });
      applicationIds.push(app.id);

      const withdrawn = await applicationService.withdraw(seeker.id, app.id);
      expect(withdrawn.status).toBe('withdrawn');
    });

    it('rejects withdrawing someone else\'s application', async () => {
      const { seeker, job } = await seekerAndJob();
      const otherSeeker = await createTestUser('seeker');
      userIds.push(otherSeeker.id);
      const app = await applicationService.apply({ seekerId: seeker.id, jobId: job.id });
      applicationIds.push(app.id);

      await expect(applicationService.withdraw(otherSeeker.id, app.id)).rejects.toMatchObject({
        code: 'AUTH_FORBIDDEN',
      });
    });

    it('rejects withdrawing an already-hired application', async () => {
      const { employer, seeker, job } = await seekerAndJob();
      const app = await applicationService.apply({ seekerId: seeker.id, jobId: job.id });
      applicationIds.push(app.id);
      await applicationService.transitionByEmployer(employer.id, app.id, 'viewed');
      await applicationService.transitionByEmployer(employer.id, app.id, 'shortlisted');
      await applicationService.transitionByEmployer(employer.id, app.id, 'hired');

      await expect(applicationService.withdraw(seeker.id, app.id)).rejects.toMatchObject({
        code: 'APPLICATION_INVALID_TRANSITION',
      });
    });
  });
});
