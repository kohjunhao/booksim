# SLAM

Prediction-market simulator for a sportsbook that will take at most $100k of risk per outcome.

Yes/No event, prices in cents, shares pay $1. Juice is 5% until $25k of liability on that side, then exponential to 18% at the $100k cap. The other side stays at 5%. Fat bets walk in $500 slices.

```
npm install
npm test
npm run dev
```
