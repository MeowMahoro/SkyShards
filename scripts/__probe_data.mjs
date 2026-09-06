import fs from "node:fs";

const base = "d:/Code/SkyShards/public/";
const d = JSON.parse(fs.readFileSync(base + "fusion-data.json", "utf8"));
const s = d.shards;
const ids = Object.keys(s);
console.log("total shards:", ids.length);
console.log("sample shard:", JSON.stringify(s[ids[0]], null, 1));
const withBazaar = ids.filter((id) => s[id].internal_id && s[id].internal_id.trim() !== "");
console.log("with internal_id:", withBazaar.length);

const recipeKeys = Object.keys(d.recipes);
console.log("shards that are fusion outputs (have recipes):", recipeKeys.length);

// how many shards are leaves (not fusion outputs)?
const leaf = ids.filter((id) => !(id in d.recipes));
console.log("leaf shards (no recipe as output):", leaf.length);

// check sample recipe shape
console.log("recipe sample for C1:", JSON.stringify(d.recipes["C1"]).slice(0, 400));

const r = JSON.parse(fs.readFileSync(base + "rates.json", "utf8"));
console.log("rates.json key count:", Object.keys(r).length);
console.log("rates.json sample keys:", Object.keys(r).slice(0, 30).join(","));
const withRate = ids.filter((id) => (r[id] ?? 0) > 0);
console.log("shards with base rate > 0:", withRate.length);
console.log("sample with rate:", withRate.slice(0, 20).join(","));

// internal_id values sample
console.log("internal_id samples:", withBazaar.slice(0, 20).map((id) => `${id}=${s[id].internal_id}`).join(", "));

// rarity distribution
const byRarity = {};
for (const id of ids) byRarity[s[id].rarity] = (byRarity[s[id].rarity] || 0) + 1;
console.log("rarity dist:", JSON.stringify(byRarity));
