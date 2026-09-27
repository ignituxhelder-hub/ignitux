export const AUTH_TOKEN_PURPOSES = ['password_reset', 'email_verification', 'refresh'] as const;
export type AuthTokenPurpose = (typeof AUTH_TOKEN_PURPOSES)[number];
