import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownUp,
  ChevronDown,
  ChevronRight,
  Coins,
  Flame,
  Hammer,
  Package,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { RecipeTreeNode, useTreeExpansion } from "../components/tree";
import {
  formatLargeNumber,
  formatNumber,
  getRarityColor,
  shardIconUrl,
} from "../utilities";
import {
  getArbitrageDetail,
  scanArbitrage,
  SELL_MODE_LABELS,
  BUY_MODE_LABELS,
  type ArbitrageDetail,
  type ArbitrageRow,
  type ArbitrageScanResult,
  type BuyMode,
  type SellMode,
} from "../services/arbitrageService";
import { DataService } from "../services/dataService";

type SortKey = "profit" | "margin";

const signedCoins = (n: number): string => {
  if (n === 0) return "0";
  return (n < 0 ? "-" : "") + formatLargeNumber(Math.abs(n));
};

const formatMargin = (margin: number): string => `${(margin * 100).toFixed(1)}%`;

const profitableColor = (value: number): string => (value >= 0 ? "text-green-400" : "text-red-400");

const RowDetail: React.FC<{
  row: ArbitrageRow;
  scan: ArbitrageScanResult;
  sellMode: SellMode;
  coinsPerCraft: number;
}> = ({ row, scan, sellMode, coinsPerCraft }) => {
  const { context } = scan;
  const [quantity, setQuantity] = useState("10");
  const [detail, setDetail] = useState<ArbitrageDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Same expansion state the calculator's Fusion Tree uses, so both views stay in sync.
  const { expandedStates, handleExpandAll, handleCollapseAll, handleNodeToggle } = useTreeExpansion(detail?.tree ?? null);

  const quantityNum = Math.max(1, Math.floor(Number(quantity) || 1));
  const sellUnit = sellMode === "instant" ? row.quote.instantSell : row.quote.orderSell;

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    // defer heavy tree building a tick so the expand feels instant
    const timer = window.setTimeout(() => {
      try {
        const d = getArbitrageDetail(context, row.shard.id, quantityNum);
        if (!cancelled) {
          setDetail(d);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to build fusion tree");
        }
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [context, row.shard.id, quantityNum]);

  const income = sellUnit !== undefined ? sellUnit * (detail?.produced ?? 0) : undefined;
  const profit = detail && income !== undefined ? income - detail.totalCost : undefined;
  const margin = detail && profit !== undefined && detail.totalCost > 0 ? profit / detail.totalCost : undefined;

  return (
    <div className="px-3 pb-3 border-t border-slate-600/50 pt-3 space-y-3 bg-slate-800/60 rounded-b-md">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
        <label className="flex items-center gap-2 text-slate-400">
          <Package className="w-3.5 h-3.5" />
          Make
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-20 px-2 py-1 text-xs bg-white/5 border border-white/10 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-colors duration-200"
          />
        </label>
        <span className="text-slate-400">
          Sell mode: <span className="text-slate-200">{SELL_MODE_LABELS[sellMode]}</span> @{" "}
          <span className="text-slate-200">{sellUnit !== undefined ? signedCoins(sellUnit) : "—"}</span> / unit
        </span>
        {detail && income !== undefined && (
          <span className="text-slate-400">
            Produces <span className="text-slate-200">{formatNumber(detail.produced)}</span> × output shard
          </span>
        )}
      </div>

      {error && (
        <div className="text-xs text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </div>
      )}

      {detail && income !== undefined && profit !== undefined && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <div className="bg-slate-800 border border-slate-600/60 rounded-md p-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Income</div>
              <div className="text-sm font-semibold text-green-400">{signedCoins(income)}</div>
            </div>
            <div className="bg-slate-800 border border-slate-600/60 rounded-md p-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Materials</div>
              <div className="text-sm font-semibold text-slate-200">{signedCoins(detail.materialsTotalCost)}</div>
            </div>
            <div className="bg-slate-800 border border-slate-600/60 rounded-md p-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Fusion fees</div>
              <div className="text-sm font-semibold text-slate-200">
                {detail.craftsNeeded} × {signedCoins(coinsPerCraft)} = {signedCoins(detail.craftCost)}
              </div>
            </div>
            <div className="bg-slate-800 border border-slate-600/60 rounded-md p-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Total cost</div>
              <div className="text-sm font-semibold text-slate-200">{signedCoins(detail.totalCost)}</div>
            </div>
            <div className="bg-slate-800 border border-slate-600/60 rounded-md p-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Profit</div>
              <div className={`text-sm font-semibold ${profitableColor(profit)}`}>{signedCoins(profit)}</div>
            </div>
            <div className="bg-slate-800 border border-slate-600/60 rounded-md p-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">ROI</div>
              <div className={`text-sm font-semibold ${margin !== undefined ? profitableColor(margin) : "text-slate-200"}`}>
                {margin !== undefined ? formatMargin(margin) : "—"}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="bg-slate-800 border border-slate-600/60 rounded-md p-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-400" />
                  <h4 className="text-sm font-semibold text-white">Fusion path</h4>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleExpandAll}
                    className="px-2 py-1 font-medium rounded-md text-xs transition-colors duration-200 cursor-pointer bg-green-500/20 hover:bg-green-500/30 text-green-300 border border-green-500/20 hover:border-green-500/30"
                  >
                    Expand All
                  </button>
                  <button
                    onClick={handleCollapseAll}
                    className="px-2 py-1 font-medium rounded-md text-xs transition-colors duration-200 cursor-pointer bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/20 hover:border-orange-500/30"
                  >
                    Collapse All
                  </button>
                </div>
              </div>
              <div className="w-full overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900">
                <div className="min-w-[620px]">
                  <RecipeTreeNode
                    tree={detail.tree}
                    data={context.data}
                    isTopLevel={true}
                    totalShardsProduced={detail.produced}
                    nodeId="root"
                    expandedStates={expandedStates}
                    onToggle={handleNodeToggle}
                    ironManView={false}
                  />
                </div>
              </div>
            </div>
            <div className="bg-slate-800 border border-slate-600/60 rounded-md p-3">
              <div className="flex items-center gap-2 mb-2">
                <ShoppingCart className="w-4 h-4 text-purple-400" />
                <h4 className="text-sm font-semibold text-white">Materials to buy</h4>
              </div>
              <ul className="space-y-1.5">
                {detail.materials.map((m) => {
                  const rarity = context.data.shards[m.shardId]?.rarity;
                  return (
                    <li key={m.shardId} className="flex items-center gap-2 text-sm">
                      <img
                        src={shardIconUrl(m.shardId)}
                        alt=""
                        className="w-5 h-5 object-contain flex-shrink-0"
                        loading="lazy"
                      />
                      <span
                        className={`min-w-0 flex-1 truncate ${rarity ? getRarityColor(rarity) : "text-slate-300"}`}
                        title={m.name}
                      >
                        {m.name}
                      </span>
                      <span className="flex items-baseline gap-1 whitespace-nowrap tabular-nums">
                        <span className="text-slate-500">
                          {formatNumber(m.quantity)} × {signedCoins(m.unitCost)}
                        </span>
                        <span className="text-slate-600">=</span>
                        <span className="font-semibold text-white">{signedCoins(m.totalCost)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </>
      )}

      {!detail && !error && (
        <div className="flex items-center justify-center py-6">
          <div className="w-6 h-6 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
};

export const ArbitragePage: React.FC = () => {
  const [buyMode, setBuyMode] = useState<BuyMode>("order");
  const [sellMode, setSellMode] = useState<SellMode>("order");
  const [coinsPerCraft, setCoinsPerCraft] = useState("1000");
  const [minProfit, setMinProfit] = useState("0");
  const [sortKey, setSortKey] = useState<SortKey>("profit");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<ArbitrageScanResult | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const requestSeq = useRef(0);

  const coinsPerCraftNum = Math.max(0, Math.floor(Number(coinsPerCraft) || 0));

  const runScan = useCallback(
    async (mode: BuyMode, coins: number) => {
      const seq = ++requestSeq.current;
      setStatus("loading");
      setError(null);
      try {
        const result = await scanArbitrage({ buyMode: mode, coinsPerCraft: coins });
        if (seq !== requestSeq.current) return;
        setScan(result);
        setStatus("ready");
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setError(err instanceof Error ? err.message : "Scan failed");
        setStatus("error");
      }
    },
    []
  );

  // Rescan when the input-side economics change (debounced to ride out typing).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      runScan(buyMode, coinsPerCraftNum);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [buyMode, coinsPerCraftNum, runScan]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await DataService.getInstance().loadBazaarQuotes(true);
      await runScan(buyMode, coinsPerCraftNum);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh prices");
      setStatus("error");
    } finally {
      setIsRefreshing(false);
    }
  }, [buyMode, coinsPerCraftNum, runScan]);

  const sellUnitOf = (row: ArbitrageRow): number | undefined =>
    sellMode === "instant" ? row.quote.instantSell : row.quote.orderSell;

  const profitOf = (row: ArbitrageRow): number =>
    sellMode === "instant" ? row.profitInstant : row.profitOrder;

  const marginOf = (row: ArbitrageRow): number =>
    sellMode === "instant" ? row.marginInstant : row.marginOrder;

  const rows = useMemo(() => {
    if (!scan) return [];
    const min = Math.max(0, Math.floor(Number(minProfit) || 0));
    const visible = scan.rows.filter((r) => profitOf(r) >= min && sellUnitOf(r) !== undefined);
    return [...visible].sort((a, b) =>
      sortKey === "profit" ? profitOf(b) - profitOf(a) : marginOf(b) - marginOf(a)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan, sellMode, minProfit, sortKey]);

  const profitableCount = useMemo(
    () => (scan ? scan.rows.filter((r) => profitOf(r) > 0).length : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scan, sellMode]
  );

  const priceAge = scan ? Date.now() - scan.context.fetchedAt : null;

  const sellModeOptions: SellMode[] = ["instant", "order"];
  const buyModeOptions: BuyMode[] = ["instant", "order"];

  return (
    <div className="min-h-screen space-y-3 py-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black text-amber-400 mb-1 flex items-center gap-2">
            <TrendingUp className="w-6 h-6" />
            Fusion Arbitrage
          </h1>
          <p className="text-slate-400 text-sm">
            Buy fusion inputs on the Bazaar, fuse them into higher-value shards and sell the output. Rows
            ranked by profit under the current sell mode; prices are a point-in-time snapshot.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-medium rounded-md border border-amber-500/20 hover:border-amber-500/30 transition-colors duration-200 flex items-center gap-2 cursor-pointer disabled:opacity-50 text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh prices
        </button>
      </div>

      {/* Controls */}
      <div className="bg-slate-800/40 border border-slate-600/30 rounded-md p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Buy inputs</div>
            <div className="flex rounded-md overflow-hidden border border-slate-600/60">
              {buyModeOptions.map((mode) => (
                <button
                  key={mode}
                  onClick={() => setBuyMode(mode)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors duration-200 cursor-pointer ${
                    buyMode === mode ? "bg-amber-500/30 text-amber-200" : "bg-white/5 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {BUY_MODE_LABELS[mode]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Sell output</div>
            <div className="flex rounded-md overflow-hidden border border-slate-600/60">
              {sellModeOptions.map((mode) => (
                <button
                  key={mode}
                  onClick={() => setSellMode(mode)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors duration-200 cursor-pointer ${
                    sellMode === mode ? "bg-green-500/30 text-green-200" : "bg-white/5 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {SELL_MODE_LABELS[mode]}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-400">
            <Hammer className="w-4 h-4 text-amber-400/80" />
            <span className="whitespace-nowrap">Coins per fusion</span>
            <input
              type="number"
              min={0}
              value={coinsPerCraft}
              onChange={(e) => setCoinsPerCraft(e.target.value)}
              className="w-28 px-2 py-1.5 text-sm bg-white/5 border border-white/10 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-colors duration-200"
            />
          </label>

          <label className="flex items-center gap-2 text-xs text-slate-400">
            <Wallet className="w-4 h-4 text-emerald-400/80" />
            <span className="whitespace-nowrap">Min profit</span>
            <input
              type="number"
              min={0}
              value={minProfit}
              onChange={(e) => setMinProfit(e.target.value)}
              className="w-28 px-2 py-1.5 text-sm bg-white/5 border border-white/10 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-colors duration-200"
            />
          </label>

          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Sort</div>
            <div className="flex rounded-md overflow-hidden border border-slate-600/60">
              {(["profit", "margin"] as SortKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setSortKey(key)}
                  className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors duration-200 cursor-pointer ${
                    sortKey === key ? "bg-purple-500/30 text-purple-200" : "bg-white/5 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {key === "profit" ? "Profit" : "ROI"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400/80" />
            Buy mode <span className="text-slate-300">{BUY_MODE_LABELS[buyMode]}</span> sets input costs and the fusion
            search
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-400/80" />
            Sell mode <span className="text-slate-300">{SELL_MODE_LABELS[sellMode]}</span> sets output income
          </span>
          {priceAge !== null && status === "ready" && (
            <span className="ml-auto">
              Price snapshot: <span className="text-slate-400">{(priceAge / 1000).toFixed(0)}s ago</span>
            </span>
          )}
        </div>
      </div>

      {/* Status line */}
      {status === "ready" && scan && (
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>
            <span className="text-green-400 font-semibold">{rows.length}</span> fusion outputs shown ·{" "}
            <span className="text-slate-300">{profitableCount}</span> profitable at current prices
          </span>
        </div>
      )}

      {status === "error" && (
        <div className="bg-red-950/50 border border-red-500/30 rounded-md p-4 text-red-300 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error ?? "Failed to load Bazaar data. The Hypixel API may be unreachable — try refreshing."}</span>
        </div>
      )}

      {status === "loading" && !scan && (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
        </div>
      )}

      {status === "loading" && scan && (
        <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
          <div className="w-4 h-4 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
          Re-scanning with updated settings…
        </div>
      )}

      {/* Header row */}
      {status === "ready" && rows.length > 0 && (
        <div className="hidden sm:grid grid-cols-12 gap-2 px-3 text-[10px] uppercase tracking-wide text-slate-500">
          <div className="col-span-4 flex items-center gap-1.5">
            <ArrowDownUp className="w-3 h-3" /> Output shard
          </div>
          <div className="col-span-2 text-right">Fused cost</div>
          <div className="col-span-2 text-right">Sell price</div>
          <div className="col-span-2 text-right">Profit</div>
          <div className="col-span-1 text-right">ROI</div>
          <div className="col-span-1" />
        </div>
      )}

      {/* Rows */}
      <div className="space-y-2">
        {rows.map((row) => {
          const expanded = expandedId === row.shard.id;
          const profit = profitOf(row);
          const margin = marginOf(row);
          const sellUnit = sellUnitOf(row);
          const shard = row.shard;
          return (
            <div
              key={row.shard.id}
              className={`bg-slate-700/50 border rounded-md transition-colors duration-200 ${
                expanded ? "border-amber-500/50" : "border-slate-600/60"
              }`}
            >
              <button
                onClick={() => setExpandedId(expanded ? null : row.shard.id)}
                className="w-full grid grid-cols-12 gap-2 items-center px-3 py-2 text-left cursor-pointer rounded-md"
                aria-expanded={expanded}
              >
                <div className="col-span-10 sm:col-span-4 flex items-center gap-2 min-w-0">
                  <img
                    src={shardIconUrl(shard.id)}
                    alt=""
                    className="w-6 h-6 object-contain flex-shrink-0"
                    loading="lazy"
                  />
                  <div className="min-w-0">
                    <div className={`text-sm font-medium truncate ${getRarityColor(shard.rarity)}`}>{shard.name}</div>
                    <div className="text-[10px] text-slate-500 truncate">
                      {shard.id} · {shard.family}
                    </div>
                  </div>
                </div>

                <div className="col-span-2 sm:col-span-1 flex justify-end text-slate-400">
                  {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>

                <div className="col-span-4 sm:col-span-2 text-right">
                  <div className="text-xs text-slate-300 tabular-nums">
                    {signedCoins(row.productionCost)}
                    <span className="text-[10px] text-slate-500 sm:hidden"> / fused</span>
                  </div>
                  <div className="hidden sm:block text-[10px] text-slate-500">
                    {row.directCost !== Infinity ? `buy ${signedCoins(row.directCost)}` : "no direct market"}
                  </div>
                </div>

                <div className="col-span-4 sm:col-span-2 text-right">
                  <div className="text-xs text-slate-200 tabular-nums">{sellUnit !== undefined ? signedCoins(sellUnit) : "—"}</div>
                  <div className="text-[10px] text-slate-500">{SELL_MODE_LABELS[sellMode]} / unit</div>
                </div>

                <div className="col-span-4 sm:col-span-2 text-right">
                  <div className={`text-sm font-semibold tabular-nums ${profitableColor(profit)}`}>{signedCoins(profit)}</div>
                  <div className="text-[10px] text-slate-500">/ unit</div>
                </div>

                <div className={`hidden sm:block col-span-1 text-right text-xs tabular-nums ${profitableColor(margin)}`}>
                  {formatMargin(margin)}
                </div>
              </button>

              {expanded && scan && <RowDetail row={row} scan={scan} sellMode={sellMode} coinsPerCraft={coinsPerCraftNum} />}
            </div>
          );
        })}
      </div>

      {status === "ready" && rows.length === 0 && (
        <div className="text-center py-12">
          <Coins className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-white mb-1">
            {scan && scan.rows.length > 0 ? "No fusion output meets your filter" : "No fusion arbitrage found"}
          </h3>
          <p className="text-sm text-slate-400 max-w-lg mx-auto">
            {scan && scan.rows.length > 0
              ? `Try lowering the minimum profit, switching the buy or sell mode, or adjusting the fusion cost.`
              : `No output shard is currently cheaper to fuse than to buy. Prices move often — hit "Refresh prices" and re-scan in a bit.`}
          </p>
        </div>
      )}
    </div>
  );
};
