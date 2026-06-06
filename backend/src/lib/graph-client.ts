import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import 'isomorphic-fetch';

const tenantId = process.env.AZURE_TENANT_ID;
const clientId = process.env.AZURE_CLIENT_ID;
const clientSecret = process.env.AZURE_CLIENT_SECRET;

if (!tenantId || !clientId || !clientSecret) {
  console.warn(
    '[graph-client] Missing Azure configuration. Graph API will not be available.',
  );
}

const credential =
  tenantId && clientId && clientSecret
    ? new ClientSecretCredential(tenantId, clientId, clientSecret)
    : null;

export const graphClient = credential
  ? Client.initWithMiddleware({
      authProvider: {
        getAccessToken: async () => {
          try {
            const tokenResponse = await credential.getToken(
              'https://graph.microsoft.com/.default',
            );

            if (!tokenResponse?.token) {
              throw new Error('Failed to acquire access token');
            }

            return tokenResponse.token;
          } catch (error) {
            console.error('[graph-client] Failed to get access token:', error);
            throw error;
          }
        },
      },
    })
  : null;

export function isGraphConfigured(): boolean {
  return Boolean(tenantId && clientId && clientSecret && graphClient);
}
