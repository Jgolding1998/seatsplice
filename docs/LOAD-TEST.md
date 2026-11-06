# Board load test

The November 6, 2026 loopback run met the PS1 board target with **110.24 ms p95** at **100 concurrent virtual users**, each with a distinct authenticated session.

| Metric | Result |
|---|---:|
| Seeded participants | 10,000 |
| Seeded teams | 2,000 |
| Sustained test duration | 20 seconds |
| Completed requests | 26,344 |
| Failed HTTP requests | 0 |
| Response shape checks passed | 26,344 of 26,344 |
| Mean response time | 75.83 ms |
| Median response time | 74.03 ms |
| p90 response time | 97.17 ms |
| p95 response time | 110.24 ms |
| Slowest response | 243.22 ms |

Reproduce with `npm ci`, install k6, then run `npm run load`. The runner seeds a fresh local MongoDB replica set, opens 100 separate fixture sessions, starts Express on a random loopback port, and invokes [the committed k6 scenario](../tests/board.k6.js). The scenario repeatedly requests the first unfiltered board page and checks that each response contains 12 teams and a next cursor. The run fails if p95 reaches 200 ms, an HTTP request fails, or a response check fails.

Measured with k6 v2.3.0 and Node v24.13.0 on Windows, with an AMD Ryzen 7 7730U and 13.8 GiB of reported memory. The app, database, and load generator shared the host. The figures cover the unfiltered board API under local read load. Deployment network latency, filtered searches, active SSE viewers, and concurrent writes have separate performance characteristics.
