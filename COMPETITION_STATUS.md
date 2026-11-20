# Git Forge competition status

Updated: 2026-11-20 01:11 UTC
Official deadline: 2026-11-21 06:30 UTC (https://make.fun/bounty/github-core-clone-01)

## Repository state
- Verified HEAD: 628020d891ca289e5c93853256bfab1976e9fb53 (competition status baseline; includes healthz regression test)
- Boot fix: c2ffa42d880332164f34a024283efb1c55719957
- Last VERIFIED green baseline: 628020d891ca289e5c93853256bfab1976e9fb53; GitHub Actions Quality Gate run 44636396709, 31 passed, 0 failed (Node 22, 2026-11-19 23:17 UTC).
- Current HEAD CI: VERIFIED PASS (https://github.com/wallyben/makefun-git-forge/actions/runs/44636396709); workflow job 135955907215 completed successfully.
- Official practice grader: NOT RUN. Official score: UNKNOWN.
- Tests run directly in this session: NONE. Independently inspected GitHub Actions job logs for HEAD: 31/31 passed, including healthz regression test. Official practice suite still unrun.

## Competition readiness
| Category | Status | Notes |
| --- | --- | --- |
| Git smart HTTP | PARTIAL | Prior local tests reported push/clone; official suite unrun |
| REST | PARTIAL | Basic repository/issues/pulls/contents endpoints |
| GraphQL | PARTIAL | Regex-based query/mutation handling, not full schema |
| MCP | PARTIAL | Tools supported, official compatibility unverified |
| Deterministic exports | UNKNOWN | Official byte-for-byte replay not tested |
| Performance workloads | UNKNOWN | 200 pushes, 50 shallow clones, 2000 reads, 200 writes untested |
| Boot and /healthz | VERIFIED PASS (local CI) | 31-test Node 22 CI suite passed including healthz regression; official grader unrun |
| Eligibility | PARTIAL | Public repo and root main.ts; authentic transcripts and kit checks unverified |

## Critical rules
The official grader requires the process to POST its ephemeral port to MAKEFUN_ENV_URL/register, then answer GET /healthz twice; without boot, all checks score zero. Node 22; no installed dependencies, external git binary or services; source limits 16 MiB total/8 MiB per file. No external submission without user approval.

## Next highest-value actions
1. Run the official practice kit's grade-local and eligibility checks under Node 22; collect actual pass/fail and score.
2. Validate deterministic state export byte-for-byte across repeated official practice runs; implement only against confirmed kit contract.
3. Correct fake pull-request merge semantics (current PUT /pulls/{n}/merge marks merged without applying Git refs), with real-client regression coverage.
