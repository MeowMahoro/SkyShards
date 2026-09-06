/**
 * Order-book snapshot for one shard product on the Hypixel Bazaar, derived from the
 * `/bazaar` response. Field values follow Hypixel's own terminology:
 *
 *  - `buyPrice`  — buy_summary[0], the high side of the book. Reference price for
 *    instant buys (fill now, pay the current ask) and for optimistic sell orders
 *    (hold out for a better fill).
 *  - `sellPrice` — sell_summary[0], the low side of the book. Reference price for
 *    instant sells (get paid now, hit the current bid) and for cheap buy orders
 *    (wait for supply to fill you).
 *
 * Real fills drift between these references depending on patience; every quote is a
 * point-in-time snapshot.
 */
export interface ShardMarketQuote {
  buyPrice: number | undefined;
  sellPrice: number | undefined;
  /** Total units queued on the buy side of the book (liquidity to sell into). */
  buyVolume: number;
  /** Total units queued on the sell side of the book (liquidity to buy from). */
  sellVolume: number;
}

export interface BazaarData {
  success: boolean;
  products: {
    [key: string]: {
      productId: string;
      sell_summary: {
        [key: number]: {
          amount: number,
          pricePerUnit: number,
          orders: number,
        }
      },
      buy_summary: {
        [key: number]: {
          amount: number,
          pricePerUnit: number,
          orders: number,
        }
      },
    };
  };
}
