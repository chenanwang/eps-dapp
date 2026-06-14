/**
 * app/api/hedera/update-token/route.ts
 *
 * POST /api/hedera/update-token?token=eps-bounty-2026
 *
 * One-shot maintenance route: renames the proof-of-service NFT collection
 * (HEDERA_NFT_TOKEN_ID, e.g. 0.0.9225911) from its scaffold placeholder
 * ("Your NFT Name" / "NFT") to the production name via a TokenUpdateTransaction.
 * The token must have an admin key matching the operator for the update to
 * succeed.
 *
 * SERVER-SIDE ONLY. Reads credentials from env (CLAUDE.md hard rule #1 — never
 * hard-coded): HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY, HEDERA_NFT_TOKEN_ID,
 * HEDERA_NETWORK. The operator key is DER-encoded (matches the rest of the
 * Hedera integration — see lib/hedera/HederaService.ts buildClient()).
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  Client,
  PrivateKey,
  TokenId,
  TokenUpdateTransaction,
} from "@hashgraph/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

const BOUNTY_TOKEN = "eps-bounty-2026";

const NEW_NAME = "EPS Proof of Service";
const NEW_SYMBOL = "EPS-POS";
const NEW_MEMO = "Blockchain proof-of-service NFT — E-Process Server (EPS)";

export async function POST(req: NextRequest) {
  // Simple bounty auth: ?token=eps-bounty-2026
  if (req.nextUrl.searchParams.get("token") !== BOUNTY_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;
  const tokenId = process.env.HEDERA_NFT_TOKEN_ID;
  if (!operatorId || !operatorKey || !tokenId) {
    const missing = [
      !operatorId && "HEDERA_OPERATOR_ID",
      !operatorKey && "HEDERA_OPERATOR_KEY",
      !tokenId && "HEDERA_NFT_TOKEN_ID",
    ].filter(Boolean);
    return NextResponse.json(
      { error: "Hedera not configured", missing },
      { status: 503 },
    );
  }

  const isMainnet = process.env.HEDERA_NETWORK === "mainnet";
  const client = isMainnet ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(operatorId, PrivateKey.fromStringDer(operatorKey));

  try {
    const response = await new TokenUpdateTransaction()
      .setTokenId(TokenId.fromString(tokenId))
      .setTokenName(NEW_NAME)
      .setTokenSymbol(NEW_SYMBOL)
      .setTokenMemo(NEW_MEMO)
      .execute(client);
    const receipt = await response.getReceipt(client);

    return NextResponse.json({
      status: receipt.status.toString(),
      tokenId,
      transactionId: response.transactionId.toString(),
      newName: NEW_NAME,
      newSymbol: NEW_SYMBOL,
    });
  } catch (err) {
    console.error("[update-token] TokenUpdate failed:", err);
    return NextResponse.json(
      { error: "TokenUpdate failed", detail: String(err) },
      { status: 502 },
    );
  } finally {
    client.close();
  }
}
