// Probe Hypixel Bazaar: map buy_summary/sell_summary to quick_status authoritative prices.
const BASE = "https://api.hypixel.net/v2/skyblock/bazaar";

const sampleProducts = [
  "SHARD_GROVE",
  "SHARD_MIST",
  "SHARD_PHANPYRE",
  "ENCHANTED_SUGAR_CANE",
  "ENCHANTED_SLIME_BLOCK",
];

try {
  const res = await fetch(BASE);
  console.log("HTTP", res.status);
  if (!res.ok) {
    console.log(await res.text());
    process.exit(1);
  }
  const data = await res.json();
  const products = data.products;

  for (const id of sampleProducts) {
    const p = products[id];
    if (!p) {
      console.log(`\n[${id}] NOT FOUND in bazaar`);
      continue;
    }
    const qs = p.quick_status;
    console.log(`\n[${id}] quick_status: buyPrice=${qs.buyPrice} sellPrice=${qs.sellPrice} buyVolume=${qs.buyVolume} sellVolume=${qs.sellVolume}`);

    const summarize = (side, arr) => {
      const prices = arr.map((o) => o.pricePerUnit);
      console.log(
        `  ${side}: len=${arr.length} [0]=${arr[0]?.pricePerUnit} min=${Math.min(...prices)} max=${Math.max(...prices)}`
      );
      console.log(`    [0..4]: [${arr.slice(0, 5).map((o) => o.pricePerUnit).join(", ")}]`);
    };
    summarize("sell_summary", p.sell_summary ?? []);
    summarize("buy_summary ", p.buy_summary ?? []);
  }
} catch (err) {
  console.error("ERROR", err);
  process.exit(1);
}
