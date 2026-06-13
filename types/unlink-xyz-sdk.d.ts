/**
 * Ambient declaration for @unlink-xyz/sdk.
 *
 * The package is not yet published to the npm registry (404), so it is not a
 * project dependency. lib/payments/UnlinkPrivacy.ts loads it via an optional
 * dynamic `import('@unlink-xyz/sdk').catch(() => null)`; this declaration lets
 * that import type-check without the package being installed. Remove this file
 * once the real package (and its bundled types) is available.
 */
declare module '@unlink-xyz/sdk' {
  const mod: Record<string, unknown>;
  export = mod;
}
