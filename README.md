# SkyShards

[🌐 Live App](https://meowmahoro.github.io/SkyShards/)

SkyShards is a fork of [Campionnn/SkyShards](https://github.com/Campionnn/SkyShards) — a Hypixel Skyblock attribute fusion planner. On top of the original project, this fork adds:

- **Arbitrage scanner** (`/arbitrage`) — scans every fusable end product against live Bazaar prices, ranks them by profit/ROI, and expands each row into a full cost breakdown (fusion tree, materials, fees, profit)

## Known limitation

**Importing your Hypixel inventory (Manage inventory → Import from Hypixel) is currently unavailable on the hosted site.**

This deployment is a fork of the original project and runs entirely on GitHub Pages. The import feature relies on the upstream project's private backend (`api.skyshards.com`) to fetch and parse your SkyBlock data, and that backend does not allow cross-origin requests from `github.io` domains. As a result the browser blocks the call and the import fails with "Failed to fetch".

The feature still works when running locally via the dev server (which proxies the request server-side), and manually adding owned shards to your inventory is unaffected. Everything else — Bazaar prices, the fusion calculator, the arbitrage scanner and all static data — works as expected on the hosted site.

## Getting Started
To run locally:
```sh
pnpm install
pnpm run dev
```

## Contributing
Contributions are welcome! Feel free to open issues or submit pull requests.
