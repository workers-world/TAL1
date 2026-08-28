# TAL1

Central [Tail Worker](https://developers.cloudflare.com/workers/observability/logs/tail-workers/) that writes **invocation-level** samples to [Workers Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/). Producer Workers only add `[[tail_consumers]]` — they do **not** need their own Analytics Engine binding for this layer.

This is the platform pattern from Cloudflare docs, generalized: one tail consumer, one dataset, SQL-friendly columns.

## What it does

```mermaid
flowchart LR
  producers[Producer Workers]
  tal1[TAL1 tail handler]
  ae["Analytics Engine invocation_slo"]
  producers -->|tail_consumers| tal1
  tal1 -->|writeDataPoint| ae
```

After each producer invocation, TAL1 receives a tail event and writes **one** data point with:

| AE column | Meaning |
|-----------|---------|
| `index1` | Producer `scriptName` |
| `blob1` | `outcome` (`ok`, `exception`, `exceededCpu`, `canceled`, …) |
| `blob2` | HTTP method; `unknown` for cron / queue / email (no fetch URL yet) |
| `blob3` | First two path segments (query stripped), max 256 chars |
| `double1` | `cpuTimeMs` |
| `double2` | `1` if `outcome === "ok"`, else `0` |
| `double3` | `wallTimeMs` |

**Not included:** `console.log` bodies, headers, stack traces, or request URLs with query strings. Keeps cardinality and PII risk low.

**Not a replacement** for business SLO metrics (`kind`, `because`, per-route latency on hot paths). Use explicit `writeDataPoint` in application code or OTEL export for that.

**Note:** `outcome` is Workers exit status, not HTTP status. A `400` response can still be `ok`.

## Requirements

- Cloudflare Workers **Paid** or Enterprise (Tail Workers)
- Tail Worker billed by **CPU time**, not request count

## Deploy

1. Clone and install:

```bash
npm install
npm test
npm run check
```

2. Optionally rename the Worker in `wrangler.toml` (`name = "TAL1"`). Producers must use the **same** script name in `tail_consumers`.

3. Deploy the tail worker **before** producers:

```bash
npx wrangler deploy
```

4. On each producer `wrangler.toml`:

```toml
[[tail_consumers]]
service = "TAL1"   # must match tail worker script name
```

Do **not** add `tail_consumers` on the tail worker itself (no self-tail).

## Query example

[Analytics Engine SQL API](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/):

```sql
SELECT
  index1 AS script,
  blob1 AS outcome,
  SUM(_sample_interval) AS n,
  SUM(_sample_interval * double3) / SUM(_sample_interval) AS avg_wall_ms
FROM invocation_slo
WHERE timestamp >= NOW() - INTERVAL '1' DAY
GROUP BY script, outcome
ORDER BY n DESC
```

## Local development

`wrangler dev` has limited `tail()` coverage. Mapper logic is covered by Vitest (`test/trace-to-point.test.ts`).

## Architecture notes

See [docs/architecture.md](docs/architecture.md) for design boundaries, cost, and what we intentionally do not do.

## Related Cloudflare docs

- [Tail Workers](https://developers.cloudflare.com/workers/observability/logs/tail-workers/)
- [tail() handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/tail/)
- [Exporting OTEL](https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/) — alternative if you need batch export to Grafana/Honeycomb without custom tail code
