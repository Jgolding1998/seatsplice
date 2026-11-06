# Board load test

The November 6, 2026 release loopback run met the PS1 board target with **64.24 ms p95** at **100 concurrent virtual users**, each with a distinct authenticated session.

| Metric | Result |
|---|---:|
| Seeded participants | 10,000 |
| Seeded teams | 2,000 |
| Sustained test duration | 20 seconds |
| Completed requests | 41,174 |
| Failed HTTP requests | 0 |
| Response shape checks passed | 41,174 of 41,174 |
| Mean response time | 48.31 ms |
| Median response time | 46.65 ms |
| p90 response time | 59.68 ms |
| p95 response time | 64.24 ms |
| Slowest response | 199.99 ms |

Reproduce with `npm ci`, install k6, then run `npm run load`. The runner seeds a fresh local MongoDB replica set, opens 100 separate fixture sessions, starts Express on a random loopback port, and invokes [the committed k6 scenario](../tests/board.k6.js). The scenario repeatedly requests the first unfiltered board page and checks that each response contains 12 teams and a next cursor. The run fails if p95 reaches 200 ms, an HTTP request fails, or a response check fails.

Measured with k6 v2.3.0 and Node v24.13.0 on Windows, with an AMD Ryzen 7 7730U and 13.8 GiB of reported memory. The app, database, and load generator shared the host. The figures cover the unfiltered board API under local read load. Deployment network latency, filtered searches, active SSE viewers, and concurrent writes have separate performance characteristics.

Before the board optimization, local runs measured 110.24 ms p95 and 267.94 ms p95, with the slower run overlapping video encoding. Concurrent requests for the unfiltered first page now share only a query that is still running. Every reader still authenticates, and the app discards the shared promise as soon as the query finishes or a board change is observed. The release run did not overlap video encoding.
