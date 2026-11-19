# Git Forge competition status

Updated: 2026-11-19 23:17 UTC
Official deadline: 2026-11-21 06:30 UTC (https://make.fun/bounty/github-core-clone-01)

## Repository state
- Latest change: 5fd85b566caf1ff464a8b96ade9dce14b79068f3 (healthz regression test)
- Boot fix: c2ffa42d880332164f34a024283efb1c55719957
- Last previously reported passing baseline: 2c6a135f4f39620e1800bf6461d44b3fcf474e7f (28/28 reported earlier; independently revalidate before relying on it)
- Current HEAD CI: UNKNOWN. Commit-status API returned no statuses for prior HEAD c7140c7; new changes have not been executed in this environment.
- Official practice grader: NOT RUN. Official score: UNKNOWN.
- Tests run in this session: NONE (container cannot resolve github.com, so repository could not be cloned). New healthz regression test is committed but UNVERIFIED.

## Competition readiness
| Category | Status | Notes |
| --- | --- | --- |
| Git smart HTTP | PARTIAL | Prior local tests reported push/clone; official suite unrun |
| REST | PARTIAL | Basic repository/issues/pulls/contents endpoints |
| GraphQL | PARTIAL | Regex-based query/mutation handling, not full schema |
| MCP | PARTIAL | Tools supported, official compatibility unverified |
| Deterministic exports | UNKNOWN | Official byte-for-byte replay not tested |
| Performance workloads | UNKNOWN | 200 pushes, 50 shallow clones, 2000 reads, 200 writes untested |
| Boot and /healthz | PARTIAL | Endpoint added; regression test awaiting CI |
| Eligibility | PARTIAL | Public repo and root main.ts; authentic transcripts and kit checks unverified |

## Critical rules
The official grader requires the process to POST its ephemeral port to MAKEFUN_ENV_URL/register, then answer GET /healthz twice; without boot, all checks score zero. Node 22; no installed dependencies, external git binary or services; source limits 16 MiB total/8 MiB per file. No external submission without user approval.

## Next highest-value actions
1. Inspect GitHub Actions result for 5fd85b5, repair any failing tests, preserve a verified green SHA.
2. Download official kit and run grade-local plus eligibility check with Node 22 in a compatible execution environment.
3. Implement and test deterministic state export and real Git merge semantics based on official failures, not speculation.
