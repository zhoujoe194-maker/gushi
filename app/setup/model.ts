export type SetupState =
  | { status: 'ready'; emailHint: string }
  | { status: 'initialized' | 'configuration_needed' | 'unavailable' };
