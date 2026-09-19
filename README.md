# Jev Signals Lab

Research POC showing a safe composition pattern for TypeSafe Jev: send one structured market snapshot, collect independent probabilistic signals, and combine them in a transparent rule engine. It is **paper-only**: it cannot connect to a broker or place orders.

## Run

```bash
npm install
cp .env.example .env # optional: enables live Jev calls
npm run dev
```

Without `TYPESAFE_API_KEY`, the app runs an explicitly labelled deterministic offline demo. It is useful for exploring the UI and decision rule, but does not represent Jev output.

## Design

One request fans out to 12 independent Jev questions. The server keeps trading policy in code and returns both raw signals and the paper decision. The current BUY gate is `trend > .75 AND momentum > .70 AND relative strength > .65 AND event risk < .40 AND overextended < .80`.

This makes threshold experiments and later backtests reproducible. It does not establish predictive performance.

## Safety

This is educational software, not investment advice. Do not use its output to trade real money. Market data in the UI is illustrative; add a licensed market-data source and a proper backtest before drawing conclusions.
