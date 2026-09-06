// Stats over ALL tradable shards: which side of the book is higher?
// bid = buy_summary[0] (highest buy order), ask = sell_summary[0] (lowest sell order).
import { readFileSync } from "node:fs";

const fusion = JSON.parse(readFileSync("public/fusion-data.json", "utf8"));
const res = await fetch("https://api.hypixel.net/v2/skyblock/bazaar");
if (!res.ok) { console.error("HTTP", res.status); process.exit(1); }
const products = (await res.json()).products;

let normal = 0, inverted = 0, noData = 0, same = 0;
const samples = [];
for (const [id, shard] of Object.entries(fusion.shards)) {
  const p = products[shard.internal_id];
  const bid = p?.buy_summary?.[0]?.pricePerUnit;
  const ask = p?.sell_summary?.[0]?.pricePerUnit;
  if (bid === undefined || ask === undefined) { noData++; continue; }
  if (bid < ask) normal++;
  else if (bid > ask) inverted++;
  else same++;
  if (samples.length < 12) samples.push({ id, name: shard.name, bid, ask, spread: ask - bid });
}
console.log(`shards: ${Object.keys(fusion.shards).length}`);
console.log(`normal book  (bid < ask): ${normal}`);
console.log(`inverted book (bid > ask): ${inverted}`);
console.log(`equal: ${same}, missing order data: ${noData}`);
console.log("\nsamples:");
for (const s of samples) console.log(`  ${s.id.padEnd(4)} ${s.name.padEnd(18)} bid=${s.bid?.toFixed(1)} ask=${s.ask?.toFixed(1)} spread=${s.spread?.toFixed(1)}`);
