import type { Queue } from 'bullmq';

export const IMAGE_COMPRESSION_QUEUE = 'image-compression';
export const IMAGE_COMPRESSION_JOB = 'compress';

export const COMPRESSION_ATTEMPTS = 3;
export const COMPRESSION_BACKOFF_DELAY_MS = 2000;

export interface CompressionJobData {
  resourceId: string;
  storagePath: string;
  stagedPath: string;
  mimeType: string;
}

export async function cleanupCompressionJob(
  queue: Queue<CompressionJobData>,
  resourceId: string,
): Promise<void> {
  try {
    await queue.remove(resourceId);
  } catch {
    const job = await queue.getJob(resourceId);

    if (job) {
      await job.remove().catch(() => undefined);
    }
  }
}
