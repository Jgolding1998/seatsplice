# Five-minute walkthrough outline

Record with two separate browser profiles. Create a leader and applicant account with fictional details, then create a two-seat team.

| Time | Show |
|---|---|
| 0:00–0:35 | Open the board, filter by a skill, show the seat indicator, and point out where the team minimum appears. |
| 0:35–1:25 | Switch to the applicant profile, request the last seat, and show it appear in the leader's inbox. Approve and show both profiles update. |
| 1:25–2:30 | Run `node --test --test-name-pattern="50 different invite holders" tests/api.test.js`. Explain why all 50 redemptions compete on the same team document and why the membership unique index is separate. |
| 2:30–3:25 | Show the audit trail. Trace the mutation through validation, authorization, the transaction, and the notification sent after commit. Explain that a leader-issued code preapproves one seat, while ordinary requests still go through the inbox. |
| 3:25–4:10 | Show the benchmark report, fixture sizes, 100-user scenario, and p95. Explain what this local run measures. |
| 4:10–4:50 | Demonstrate leader handoff or explain what happens when an old request is cancelled. Close with one trade-off and one change you would make for a real event. |

Before recording or interviewing, trace these paths yourself and practice a small live change. Good exercises are changing the teammate score weight, adding a test for an expired invite, and explaining why a retry key cannot authorize an action for someone else.
