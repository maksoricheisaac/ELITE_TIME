import { graphClient, isGraphConfigured } from './graph-client';
import type { Message } from '@microsoft/microsoft-graph-types';

export interface EmailOptions {
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
}

const senderEmail = process.env.GRAPH_SENDER_EMAIL;

if (!senderEmail) {
  console.warn('[email] GRAPH_SENDER_EMAIL not configured');
}

export async function sendEmail(options: EmailOptions): Promise<void> {
  if (!isGraphConfigured()) {
    console.error('[email] Graph API not configured, skipping email');
    return;
  }

  if (!senderEmail) {
    console.error('[email] GRAPH_SENDER_EMAIL not set, skipping email');
    return;
  }

  if (!options.to || options.to.length === 0) {
    console.error('[email] No recipients provided, skipping email');
    return;
  }

  console.log(
    `[email] sending via Graph API to=${options.to.join(',')} subject=${options.subject} attachments=${options.attachments?.length ?? 0}`,
  );

  try {
    const message: Message = {
      subject: options.subject,
      body: {
        contentType: options.html ? 'html' : 'text',
        content: options.html || options.text || '',
      },
      toRecipients: options.to.map((email) => ({
        emailAddress: { address: email },
      })),
    };

    if (options.attachments && options.attachments.length > 0) {
      message.attachments = options.attachments.map((attachment) => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: attachment.filename,
        contentBytes: attachment.content.toString('base64'),
        contentType: attachment.contentType,
      }));
    }

    await graphClient!
      .api(`/users/${senderEmail}/sendMail`)
      .post({ message, saveToSentItems: true });

    console.log(`[email] sent successfully via Graph API`);
  } catch (error: unknown) {
    console.error('[email] sendMail failed', error);

    const statusCode =
      typeof error === 'object' && error !== null && 'statusCode' in error
        ? (error as { statusCode: number }).statusCode
        : undefined;

    if (statusCode === 403) {
      console.error(
        "[email] PERMISSION DENIED - L'app n'a pas la permission Mail.Send",
      );
    } else if (statusCode === 404) {
      console.error(
        `[email] USER NOT FOUND - ${senderEmail} n'existe pas dans le tenant`,
      );
    } else if (statusCode === 401) {
      console.error('[email] AUTH FAILED - Token invalide ou expiré');
    }

    throw error;
  }
}
