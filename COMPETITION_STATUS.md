# Git Forge competition status

Updated: 2026-11-20 04:08 UTC
Official deadline: 2026-11-21 06:30 UTC (https://make.fun/bounty/github-core-clone-01)

## Repository state
- Current verified application HEAD: b3b27f3717598ff28c344a4d06fb4e16f816aaa8 (fast-forward PR merge fix plus regression test; Quality Gate passed)
- Boot fix: c2ffa42d880332164f34a024283efb1c55719957
- Last VERIFIED green baseline: b3b27f3717598ff28c344a4d06fb4e16f816aaa8; GitHub Actions Quality Gate run 44666074941, 32 passed, 0 failed (Node 22, 2026-11-20 03:12 UTC).
- Last verified green baseline CI: VERIFIED PASS (https://github.com/wallyben/makefun-git-forge/actions/runs/44666074941); 32/32 on b3b27f3, including pull-merge regression.
- Official practice grader: NOT RUN. Official score: UNKNOWN.
- Tests run directly in this session: NONE. Independently inspected latest GitHub Actions job logs: 32/32 passed at HEAD b3b27f3. Official practice suite still unrun.

## Competition readiness
| Category | Status | Notes |
| --- | --- | --- |
| Git smart HTTP | PARTIAL | Prior local tests reported push/clone; official suite unrun |
| REST | PARTIAL | Basic repository/issues/pulls/contents endpoints |
| GraphQL | PARTIAL | Regex-based query/mutation handling, not full schema |
| MCP | PARTIAL | Tools supported, official compatibility unverified |
| Deterministic exports | UNKNOWN | Official byte-for-byte replay not tested |
| Performance workloads | UNKNOWN | 200 pushes, 50 shallow clones, 2000 reads, 200 writes untested |
| Boot and /healthz | VERIFIED PASS (local CI) | 32-test Node 22 CI suite passed including healthz regression; official grader unrun |
| Eligibility | PARTIAL | Public repo and root main.ts; authentic transcripts and kit checks unverified |

## Critical rules
The official grader requires the process to POST its ephemeral port to MAKEFUN_ENV_URL/register, then answer GET /healthz twice; without boot, all checks score zero. Node 22; no installed dependencies, external git binary or services; source limits 16 MiB total/8 MiB per file. No external submission without user approval.

## Next highest-value actions
1. Run the official practice kit's grade-local and eligibility checks under Node 22; collect actual pass/fail and score.
2. Validate deterministic state export byte-for-byte across repeated official practice runs; implement only against confirmed kit contract.
3. Investigate official Git shallow clone and incremental fetch behavior (advertises shallow support, but no verified shallow boundaries). Fast-forward PR merge regression is now green in CI; divergent merges still return 409.
