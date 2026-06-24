import { Horizon, TransactionBuilder } from "@stellar/stellar-sdk";
import { ok, err, SorokitErrorCode } from "../shared/response";
import type { SorokitResult } from "../shared/response";
import {
  isNetworkConnectivityError,
  isTimeoutError,
  isXdrInvalidError,
  retryWithBackoff,
  toMessage,
} from "../shared";
import type { TransactionResult } from "./types";
import type { SorokitCache } from "../shared/cache";
import { DEFAULT_TX_CACHE_TTL_MS } from "../shared/constants";

function describeSubmissionFailure(cause: unknown): string {
  if (isXdrInvalidError(cause)) {
    return `Transaction submission failed because the signed XDR is malformed: ${toMessage(cause)}`;
  }
  if (isTimeoutError(cause)) {
    return `Transaction submission timed out while contacting Horizon: ${toMessage(cause)}`;
  }
  if (isNetworkConnectivityError(cause)) {
    return `Transaction submission failed due to network connectivity: ${toMessage(cause)}`;
  }
  return `Transaction submission failed: ${toMessage(cause)}`;
}

/**
 * Submit a signed transaction XDR to the Stellar network via Horizon.
 * Parses the XDR before submission — no unsafe casts.
 */
export async function submitTransaction(
  horizonUrl: string,
  networkPassphrase: string,
  signedXdr: string,
  cache?: SorokitCache,
): Promise<SorokitResult<TransactionResult>> {
  if (isXdrInvalidError(signedXdr)) {
    return err(
      SorokitErrorCode.TX_SUBMIT_FAILED,
      "Transaction submission failed because the signed XDR is malformed.",
      signedXdr,
    );
  }

  try {
    const response = await retryWithBackoff(async () => {
      const server = new Horizon.Server(horizonUrl);
      const tx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
      return await server.submitTransaction(tx);
    });

    const result: TransactionResult = {
      hash: response.hash,
      status: "success",
      ledger: response.ledger,
      envelopeXdr: response.envelope_xdr,
      resultXdr: response.result_xdr,
    };

    if (cache) {
      cache.set(`tx:${response.hash}`, result, DEFAULT_TX_CACHE_TTL_MS);
    }

    return ok(result);
  } catch (cause) {
    return err(
      SorokitErrorCode.TX_SUBMIT_FAILED,
      describeSubmissionFailure(cause),
      cause,
    );
  }
}
