/**
 * Chain delivery seam (T-301). Import the {@link ChainAdapter} interface and the
 * Solana factory from here rather than reaching into the concrete module.
 */
export type {
  ChainAdapter,
  ChainDeliveryResult,
  DeliverParams,
} from "@/lib/chain/types";
export {
  SolanaAdapter,
  getSolanaAdapter,
  getRentExemptMinimum,
} from "@/lib/chain/solana";
export { buildServiceMemo, buildServiceTx } from "@/lib/chain/tx-builder";
export type { ServiceMemoFields } from "@/lib/chain/tx-builder";
