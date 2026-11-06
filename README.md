# Sentinel — Portfolio Risk Monitor (demo)

A static dashboard where an investor sets their own risk parameters and investment guidelines, links (or pastes) a portfolio, and gets an instant review:

- **Guideline checks**: single-position limit, sector cap, top-5 concentration, crypto allocation, beta, volatility, drawdown, P/E ceiling, minimum holdings, excluded sectors, and earnings-window alerts. Each check comes back as a breach, warning, note or pass, and they roll up into a health score.
- **Your guidelines**: 13 parameters grouped as concentration, market risk and holding-level. Each can be dragged or typed. You can add per-ticker and per-sector exceptions, and a **custom rule builder** works off any portfolio or per-holding metric (e.g. "each holding: upside to analyst target ≥ 0"). Guidelines can be exported and imported as JSON.
- **Areas of improvement**: opportunities are ranked by projected health-score impact, with each fix simulated on its own. There is a mechanical rebalance plan with before/after metrics, plus sector coverage gaps, correlated pairs (hidden concentration) and tax notes (gains realized by the plan, harvesting candidates). **Apply as what-if** swaps the holdings so every view reflects the plan, and you can revert.
- **Risk metrics**: realized beta vs SPY, annualized volatility, max drawdown, Sharpe (10Y Treasury as the risk-free rate), tracking error, Herfindahl index, effective number of holdings, weighted P/E and dividend yield.
- **Charts**: performance vs the S&P 500 (3M/6M/1Y), sector donut, position and sector weights against your limits, drawdown, and a risk-vs-return bubble chart.
- **Calendar**: upcoming earnings for your holdings, the FOMC schedule, and a macro backdrop (fed funds, 2Y/10Y, CPI, unemployment).
- **News**: headlines tagged by holding, filterable.
- **Link portfolio**: paste `TICKER QTY [COST]`, upload a broker CSV export, or use the broker-connect placeholders (Robinhood, Schwab, Fidelity, Vanguard, E*TRADE, Coinbase).

Settings and holdings are saved in the browser's `localStorage`.

## Data

`data/equities.json` and `data/macro.json` are a snapshot taken on 2026-11-06 from these sources:

| Source | Used for |
|---|---|
| Robinhood market data (read-only) | quotes, fundamentals, analyst ratings, 1Y weekly history, earnings dates |
| CoinGecko | BTC/ETH prices, 1Y history, crypto news |
| Alpha Vantage | fed funds, Treasury yields, CPI, unemployment |
| Web search | market headlines, Fed calendar |

Beta is computed in the app from weekly returns against SPY.

To go live, replace the snapshot with a serverless function that calls a market-data API, and wire the broker buttons to an aggregator such as SnapTrade or Plaid Investments.

## Run locally

```bash
python -m http.server 5180
```

_This is a demo. The flags compare holdings against guidelines the user sets; they are not investment advice._
