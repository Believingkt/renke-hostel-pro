// Public OAuth client identifiers.
// These are NOT secrets — Client ID / App ID appear in the authorize URL
// query string by design. Only the corresponding Channel Secret / App Secret
// must be kept private (stored as Edge Function runtime secrets).
//
// Hardcoded here because Lovable Cloud runtime secrets are not injected into
// the frontend build.

export const LINE_CHANNEL_ID = "2010142203";
export const FACEBOOK_APP_ID = "1999808897628624";
