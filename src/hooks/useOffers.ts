import { useCallback, useEffect, useState } from "react";
import type { Offer } from "../lib/schema";
import { deleteOffer as dbDelete, listOffers, saveOffer } from "../lib/db";

export function useOffers() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const all = await listOffers();
    setOffers(all);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const add = useCallback(
    async (offer: Offer) => {
      await saveOffer(offer);
      await refresh();
    },
    [refresh]
  );

  const remove = useCallback(
    async (id: string) => {
      await dbDelete(id);
      await refresh();
    },
    [refresh]
  );

  return { offers, loading, add, remove, refresh };
}
