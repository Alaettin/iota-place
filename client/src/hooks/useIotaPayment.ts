import { useState, useCallback } from "react";
import { useSignAndExecuteTransaction } from "@iota/dapp-kit";
import { Transaction } from "@iota/iota-sdk/transactions";
import { NANOS_PER_IOTA } from "@iota/iota-sdk/utils";

interface PlacePixelParams {
  collectionAddress: string;
  amount: number; // in IOTA (e.g. 0.1)
  x: number;
  y: number;
  color: number;
}

interface UseIotaPaymentResult {
  placePixel: (params: PlacePixelParams) => Promise<string | null>; // returns txDigest or null
  signing: boolean;
  error: string | null;
}

export function useIotaPayment(): UseIotaPaymentResult {
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  const placePixel = useCallback(
    async (params: PlacePixelParams): Promise<string | null> => {
      setSigning(true);
      setError(null);

      try {
        const { collectionAddress, amount } = params;
        const amountInNanos = BigInt(Math.ceil(amount * Number(NANOS_PER_IOTA)));

        const tx = new Transaction();
        const [coin] = tx.splitCoins(tx.gas, [amountInNanos]);
        tx.transferObjects([coin], collectionAddress);

        const result = await signAndExecute({
          transaction: tx,
        });

        return result.digest;
      } catch (err: any) {
        const msg = err?.message || "Transaction failed";
        setError(msg);
        return null;
      } finally {
        setSigning(false);
      }
    },
    [signAndExecute]
  );

  return { placePixel, signing, error };
}
