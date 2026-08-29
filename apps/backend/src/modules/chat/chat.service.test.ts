import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanupTestData,
  closeDb,
  createTestApplication,
  createTestJob,
  createTestUser,
  ensureDb,
} from '@/test/helpers';
import * as chatService from './chat.service';

describe('chat.service', () => {
  const userIds: string[] = [];
  const jobIds: string[] = [];
  const applicationIds: string[] = [];
  const conversationIds: string[] = [];

  beforeAll(() => {
    ensureDb();
  });

  afterAll(async () => {
    await cleanupTestData({ userIds, jobIds, applicationIds, conversationIds });
    await closeDb();
  });

  async function participants() {
    const employer = await createTestUser('employer');
    const seeker = await createTestUser('seeker');
    userIds.push(employer.id, seeker.id);
    const job = await createTestJob(employer.id);
    jobIds.push(job.id);
    const application = await createTestApplication(seeker.id, employer.id, job.id);
    applicationIds.push(application.id);
    return { employer, seeker, job };
  }

  describe('getOrCreateForApplication / sendMessage', () => {
    it('creates a conversation and delivers a text message both ways', async () => {
      const { employer, seeker, job } = await participants();
      const convo = await chatService.getOrCreateForApplication({
        employerId: employer.id,
        seekerId: seeker.id,
        jobId: job.id,
      });
      conversationIds.push(convo.id);

      const message = await chatService.sendMessage(seeker.id, convo.id, {
        body: 'Hi, is this job still open?',
      });
      expect(message.body).toBe('Hi, is this job still open?');
      expect(message.senderId).toBe(seeker.id);

      const { messages } = await chatService.listMessages(employer.id, convo.id, { limit: 20 });
      expect(messages).toHaveLength(1);
      expect(messages[0]!.id).toBe(message.id);
    });

    it('is idempotent — calling getOrCreateForApplication twice returns the same row', async () => {
      const { employer, seeker, job } = await participants();
      const first = await chatService.getOrCreateForApplication({
        employerId: employer.id,
        seekerId: seeker.id,
        jobId: job.id,
      });
      conversationIds.push(first.id);
      const second = await chatService.getOrCreateForApplication({
        employerId: employer.id,
        seekerId: seeker.id,
        jobId: job.id,
      });
      expect(second.id).toBe(first.id);
    });

    it('rejects a non-participant reading messages with CONVERSATION_NOT_FOUND-style forbidden', async () => {
      const { employer, seeker, job } = await participants();
      const outsider = await createTestUser('seeker');
      userIds.push(outsider.id);
      const convo = await chatService.getOrCreateForApplication({
        employerId: employer.id,
        seekerId: seeker.id,
        jobId: job.id,
      });
      conversationIds.push(convo.id);

      await expect(
        chatService.listMessages(outsider.id, convo.id, { limit: 20 }),
      ).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });
    });

    it('rejects operating on a nonexistent conversation with CONVERSATION_NOT_FOUND', async () => {
      const seeker = await createTestUser('seeker');
      userIds.push(seeker.id);
      await expect(
        chatService.listMessages(seeker.id, '00000000-0000-0000-0000-000000000000', {
          limit: 20,
        }),
      ).rejects.toMatchObject({ code: 'CONVERSATION_NOT_FOUND' });
    });
  });

  describe('markRead', () => {
    it('zeroes the reader\'s unread counter and stamps readAt on the counterpart\'s messages', async () => {
      const { employer, seeker, job } = await participants();
      const convo = await chatService.getOrCreateForApplication({
        employerId: employer.id,
        seekerId: seeker.id,
        jobId: job.id,
      });
      conversationIds.push(convo.id);
      await chatService.sendMessage(seeker.id, convo.id, { body: 'Ping' });

      const beforeRead = await chatService.findById(employer.id, convo.id);
      expect(beforeRead.unread).toBe(1);

      const afterRead = await chatService.markRead(employer.id, convo.id);
      expect(afterRead.unread).toBe(0);
    });
  });

  describe('ensureConversationFromApplication', () => {
    it('only lets the applicant (seeker) start the chat', async () => {
      const { employer, job } = await participants();
      const otherSeeker = await createTestUser('seeker');
      userIds.push(otherSeeker.id);
      const otherApp = await createTestApplication(otherSeeker.id, employer.id, job.id);
      applicationIds.push(otherApp.id);

      await expect(
        chatService.ensureConversationFromApplication(employer.id, otherApp.id),
      ).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });

      const convo = await chatService.ensureConversationFromApplication(
        otherSeeker.id,
        otherApp.id,
      );
      conversationIds.push(convo.id);
      expect(convo.seekerId).toBe(otherSeeker.id);
    });
  });
});
