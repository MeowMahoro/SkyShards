// Probe: how many SkyShards shards actually trade on the Hypixel bazaar?
// Reads local fusion-data.json shards (internal_id) + fetches live bazaar snapshot.
import { readFileSync } from "node:fs";

const BASE = "https://api.hypixel.net/v2/skyblock/bazaar";

const fusion = JSON.parse(readFileSync("public/fusion-data.json", "utf8"));
const shardEntries = Object.entries(fusion.shards); // [id, shard]
console.log("total shards:", shardEntries.length);

const res = await fetch(BASE);
console.log("HTTP", res.status);
if (!res.ok) { console.log(await res.text()); process.exit(1); }
const products = (await res.json()).products;

let found = 0, missing = [];
for (const [id, shard] of shardEntries) {
  const p = products[shard.internal_id];
  if (!p) { missing.push({ id, internal_id: shard.internal_id, name: shard.name }); continue; }
  found++;
  const buy = p.buy_summary?.[0]?.pricePerUnit;
  const sell = p.sell_summary?.[0]?.pricePerUnit;
  const buyVol = p.quick_status?.buyVolume ?? 0;
  const sellVol = p.quick_status?.sellVolume ?? 0;
  if (buy === undefined || sell === undefined) {
    missing.push({ id, internal_id: shard.internal_id, name: shard.name, why: "no order side", buy, sell });
  }
}
console.log("with both buy&sell prices:", found - missing.filter(m => m.why).length);
console.log("found total:", found, "/", shardEntries.length);
console.log("\nmissing / partial:", JSON.stringify(missing, null, 1));

// distribution of internal_id prefixes (product naming family)
const prefixes = {};
for (const [, shard] of shardEntries) {
  const pre = (shard.internal_id || "??").replace(/\d+$/, "");
  prefixes[pre] = (prefixes[pre] || 0) + 1;
}
console.log("\ninternal_id prefixes:", prefixes);
