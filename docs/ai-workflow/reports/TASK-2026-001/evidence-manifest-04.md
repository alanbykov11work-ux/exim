# Evidence manifest 04
| ID | Что | Где |
|---|---|---|
| E4-01 | fix preflight + tests | commit ef0a834, scripts/local-stack/preflight.sh, test/local-stack-preflight.test.mjs |
| E4-02 | CI success на ef0a834 | PR #8 checks |
| E4-03 | red→green 49 FAIL → 98 PASS | локальный прогон исполнителя, Linux VM |
| E4-04 | сетевой blocker | curl api.supabase.com → proxy 403, 10.11.2026 |
