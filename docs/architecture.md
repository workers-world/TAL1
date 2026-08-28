# Architecture

## Role

TAL1 is a **single tail consumer** for many producer Workers. It normalizes tail events into a fixed Analytics Engine schema (`invocation_slo`) so you can query error rates and wall time by script, outcome, and coarse route prefix without binding AE on every producer.

## Data flow

1. Producer runs (fetch, cron, queue, …).
2. Cloudflare invokes TAL1 `tail(events)` with trace metadata (not full log export).
3. `traceToPoint()` maps each event; skips empty `scriptName` and self (`TAL1`).
4. `recordInvocationSamples()` calls `writeDataPoint` (non-blocking; errors are logged and dropped).

## Design choices

| Choice | Rationale |
|--------|-----------|
| Separate dataset from app SLO | Avoid mixing invocation metrics with `kind` / `because` business samples |
| Path = first two segments | Enough for `/v1/chat`-style grouping; limits cardinality vs full URL |
| No log parsing | Fragile; business SLO belongs in app code or structured metrics |
| No `await` on `writeDataPoint` | Matches CF guidance; tail handler stays cheap |
| `fetch` health only | No Bearer API; not an MCP/agent surface |

## Cost and volume

- Every producer invocation triggers **one** tail invocation on TAL1.
- A request through edge gateway + origin Worker produces **two** points (expected).
- Keep tail handler minimal: no `fetch` to external endpoints, no KV/D1.

## When not to use this

- You only need Cloudflare Dashboard / Workers Logs → use built-in observability.
- You need batch export to SaaS → consider [OTEL destinations](https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/).
- You need `because` / validation failure reasons → instrument in application code, not tail logs.

## Customization

- **Script name:** change `name` in `wrangler.toml` and `service` in producer `tail_consumers`.
- **Dataset name:** change `dataset` under `[[analytics_engine_datasets]]` and SQL queries.
- **Columns:** edit `src/trace-to-point.ts`; keep tests in sync.
