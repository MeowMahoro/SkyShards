import type { CalculationParams, Data, RecipeChoice, RecipeTree, Shard } from "../types/types";
import type { ShardMarketQuote } from "../types/hypixelApiTypes";
import { CalculationService } from "./calculationService";
import { DataService } from "./dataService";

/**
 * Shard fusion arbitrage: buy input shards on the Bazaar, fuse them into a
 * higher-value output shard, sell the output. The Hypixel Bazaar only exposes two
 * reference prices per product (`buy_summary[0]` and `sell_summary[0]`), which we
 * map onto the four execution modes below — the same framing the calculator's
 * "instant buy" toggle already uses:
 *
 *  - instant buy  → buy_summary[0] (fill now, pay the current ask)
 *  - buy order    → sell_summary[0] (patient order that waits for supply)
 *  - instant sell → sell_summary[0] (get paid now, hit the current bid)
 *  - sell order   → buy_summary[0] (patient order that waits for a better fill)
 */
export type BuyMode = "instant" | "order";
export type SellMode = "instant" | "order";

export const BUY_MODE_LABELS: Record<BuyMode, string> = {
  instant: "Instant buy",
  order: "Buy order",
};

export const SELL_MODE_LABELS: Record<SellMode, string> = {
  instant: "Instant sell",
  order: "Sell order",
};

export interface ArbitragePrices {
  /** Cost to buy one unit right now (buy_summary[0]). */
  instantBuy: number | undefined;
  /** Patient buy-order reference (sell_summary[0]). */
  orderBuy: number | undefined;
  /** Income if one unit is sold right now (sell_summary[0]). */
  instantSell: number | undefined;
  /** Patient sell-order reference (buy_summary[0]). */
  orderSell: number | undefined;
  /** Units of buy-side liquidity (how much the market can absorb). */
  buyVolume: number;
  /** Units of sell-side liquidity (how much is on offer). */
  sellVolume: number;
}

export interface ArbitrageScanOptions {
  buyMode: BuyMode;
  /** Coins spent per fusion craft. */
  coinsPerCraft: number;
}

export interface ArbitrageRow {
  shard: Shard;
  quote: ArbitragePrices;
  /** Cheapest production path is a fusion recipe rather than buying the shard. */
  usesFusion: boolean;
  /** Cheapest cost to produce one output unit under the active buy mode. */
  productionCost: number;
  /** Cost of simply buying one unit instead (Infinity when no market). */
  directCost: number;
  /** Unit profit/margin if the output is sold instantly. */
  profitInstant: number;
  marginInstant: number;
  /** Unit profit/margin if the output is sold via a sell order. */
  profitOrder: number;
  marginOrder: number;
}

/** Live scan state kept so per-row fusion trees can be expanded lazily. */
export interface ArbitrageContext {
  data: Data;
  choices: Map<string, RecipeChoice>;
  minCosts: Map<string, number>;
  params: CalculationParams;
  prices: Record<string, ArbitragePrices>;
  buyCosts: Record<string, number>;
  fetchedAt: number;
}

export interface ArbitrageScanResult {
  rows: ArbitrageRow[];
  context: ArbitrageContext;
}

export interface ArbitrageDetailMaterial {
  shardId: string;
  name: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface ArbitrageDetail {
  tree: RecipeTree;
  craftsNeeded: number;
  craftCost: number;
  produced: number;
  materials: ArbitrageDetailMaterial[];
  materialsTotalCost: number;
  totalCost: number;
}

const buildParams = (buyCosts: Record<string, number>, coinsPerCraft: number): CalculationParams => ({
  customRates: buyCosts,
  hunterFortune: 0,
  excludeChameleon: false,
  frogBonus: false,
  newtLevel: 0,
  salamanderLevel: 0,
  lizardKingLevel: 0,
  leviathanLevel: 0,
  pythonLevel: 0,
  kingCobraLevel: 0,
  seaSerpentLevel: 0,
  tiamatLevel: 0,
  crocodileLevel: 0,
  kuudraTier: "none",
  moneyPerHour: null,
  customKuudraTime: false,
  kuudraTimeSeconds: null,
  noWoodenBait: false,
  rateAsCoinValue: true,
  craftPenalty: coinsPerCraft,
});

export const toPrices = (quote: ShardMarketQuote): ArbitragePrices => ({
  instantBuy: quote.buyPrice,
  orderBuy: quote.sellPrice,
  instantSell: quote.sellPrice,
  orderSell: quote.buyPrice,
  buyVolume: quote.buyVolume,
  sellVolume: quote.sellVolume,
});

/**
 * Scan every shard and rank fusion opportunities. Only rows whose *optimal* path is a
 * fusion recipe qualify: if buying the output directly is cheaper than fusing it, there
 * is no fusion margin to exploit (the direct-vs-fused comparison is kept per row).
 *
 * Sell mode intentionally does not change the scan: sell prices are cheap to recompute
 * client-side, so switching instant/order selling never triggers a rescan.
 */
export const scanArbitrage = async (options: ArbitrageScanOptions): Promise<ArbitrageScanResult> => {
  const dataService = DataService.getInstance();
  const service = CalculationService.getInstance();

  const [shards, { quotes, fetchedAt }] = await Promise.all([
    dataService.loadShards(),
    dataService.loadBazaarQuotes(),
  ]);

  const prices: Record<string, ArbitragePrices> = {};
  for (const shard of shards) {
    prices[shard.id] = toPrices(quotes[shard.id]);
  }

  const buyCosts: Record<string, number> = {};
  for (const [shardId, price] of Object.entries(prices)) {
    const cost = options.buyMode === "instant" ? price.instantBuy : price.orderBuy;
    if (cost !== undefined) {
      buyCosts[shardId] = cost;
    }
  }

  const params = buildParams(buyCosts, options.coinsPerCraft);
  const data = await service.parseData(params);
  const { minCosts, choices } = service.computeMinCosts(data, params);

  const rows: ArbitrageRow[] = [];
  for (const shard of shards) {
    const price = prices[shard.id];
    // No sellable market → nothing to arbitrage.
    if (price.instantSell === undefined && price.orderSell === undefined) {
      continue;
    }

    const choice = choices.get(shard.id);
    // Fusion arbitrage only: ignore shards that are cheapest when bought directly.
    if (!choice?.recipe) {
      continue;
    }

    const productionCost = minCosts.get(shard.id);
    if (productionCost === undefined || !Number.isFinite(productionCost)) {
      continue;
    }

    const directCost = buyCosts[shard.id] ?? Infinity;
    const profitInstant = (price.instantSell ?? 0) - productionCost;
    const profitOrder = (price.orderSell ?? 0) - productionCost;

    rows.push({
      shard,
      quote: price,
      usesFusion: true,
      productionCost,
      directCost,
      profitInstant,
      marginInstant: productionCost > 0 ? profitInstant / productionCost : 0,
      profitOrder,
      marginOrder: productionCost > 0 ? profitOrder / productionCost : 0,
    });
  }

  return {
    rows,
    context: { data, choices, minCosts, params, prices, buyCosts, fetchedAt },
  };
};

/**
 * Full fusion tree + exact cost breakdown for one output shard. Runs synchronously on
 * the main thread (fast single-target calculation) reusing the scan's parsed data.
 *
 * `quantity` is the number of output shards requested; the fusion may produce more
 * (`produced`) when recipes output multiple shards per craft.
 */
export const getArbitrageDetail = (
  context: ArbitrageContext,
  targetShard: string,
  quantity: number
): ArbitrageDetail | null => {
  const { data, choices, params } = context;
  const service = CalculationService.getInstance();

  const target = data.shards[targetShard];
  if (!target) {
    return null;
  }

  const tree = service.buildRecipeTree(data, targetShard, choices, [], params, []);
  const craftCounter = { total: 0 };
  service.assignQuantities(tree, quantity, data, craftCounter, choices, 1, params);
  const { craftsNeeded, craftTime, totalQuantities } = service.collectTreeStats(tree, params);
  const { totalShardsProduced } = service.calculateShardProductionStats({
    requiredQuantity: quantity,
    targetShard,
    choices,
    crocodileMultiplier: 1,
    totalQuantities,
    data,
    params,
    getDirectCostFn: service.getDirectCost.bind(service),
  });

  const materialsTotalCost = service.calculateTotalTimeFromQuantities(
    totalQuantities,
    0,
    data,
    params
  );
  const totalCost = materialsTotalCost + craftTime;

  const materials: ArbitrageDetailMaterial[] = [];
  for (const [shardId, qty] of totalQuantities.entries()) {
    const shard = data.shards[shardId];
    const unitCost = context.buyCosts[shardId] ?? 0;
    if (shard) {
      materials.push({
        shardId,
        name: shard.name,
        quantity: qty,
        unitCost,
        totalCost: unitCost * qty,
      });
    }
  }
  materials.sort((a, b) => b.totalCost - a.totalCost);

  return {
    tree,
    craftsNeeded,
    craftCost: craftTime,
    produced: totalShardsProduced,
    materials,
    materialsTotalCost,
    totalCost,
  };
};
