# Security verification

The review focused on the application code and local fixtures. It covers account and session handling, authorization, request parsing, invitation guessing, user isolation, and transactional integrity.

| Boundary | Evidence |
|---|---|
| Account and session | API tests check hashed credentials and opaque tokens, token rotation, expiry, logout, and consistent invalid-login responses. SQL-style strings, MongoDB operators, arrays, and extra query fields sent to login fail without minting a session. Production cookies use Secure, HttpOnly, and SameSite Strict. |
| Browser origin | The API rejects cross-origin and cross-site requests, limits JSON bodies, and sends security headers. Browser tests exercise rendered untrusted text. |
| Team permissions | Outsiders cannot approve, decline, remove, or invite. A leader cannot approve a request for another team. Nonmembers do not receive leader inboxes or member audit history. |
| Invitations | Codes have 128 bits of keyed entropy, expire after an hour, and can be redeemed once. They are hashed in storage. A shared rate limit covers attempts, and old codes are revoked on leader handoff. |
| Membership | Tests race 50 concurrent approvals, 50 distinct invite holders, and two teams approving the same participant. Stored team count, membership, request or invite state, and audit events are checked after each run. |
| Live updates | A second app instance sees committed changes through the database. Events carry empty payloads and private invalidations are limited to the intended recipients. |

Claude Code reviewed the backend independently. The follow-up implementation addressed stale requests, request contention, invite plaintext in the retry ledger, broad live fanout, login throttling, and high-cost suggestion queries. See the GitHub Actions run for the release test results. The dependency audit reported zero known vulnerabilities. Deployment still needs a check of TLS, proxy hop count, MongoDB network access, and stream behavior on the selected host. Public sign-up currently uses unverified email, and duplicate registration can reveal that an address was already used. Account verification and recovery would be needed for a real public event.
