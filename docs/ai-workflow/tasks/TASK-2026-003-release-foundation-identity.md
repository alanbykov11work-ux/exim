# TASK-2026-003 — Release foundation и явный access context

Статус: `in_progress`

Product OS: `product-os-task-2026-003-r2` / `f783667681e81ba6368b09558f89bacdf7587def`

Baseline: `b3dd29751fbb9a6334f255e58576764dd44a29cd`

Branch: `task/TASK-2026-003-release-foundation-identity`

Environment: managed preview, synthetic data only

## Цель

Убрать неявный выбор наиболее привилегированной membership, сделать активный workspace/role явным session context и доказать server-side role/tenant/module boundaries как основу следующих product waves.

## Scope

- migration `0002_explicit_access_context.sql`;
- exact membership pointer в session с composite FK к тому же user;
- список собственных contexts и безопасное same-origin переключение;
- chooser при неоднозначном context;
- reusable module/role guards;
- client/logistician safe payload projections;
- семь synthetic accounts, два workspaces и A1/A2/B1 acceptance matrix;
- checks, migration/rollback evidence и managed preview exact commit.

## Acceptance criteria

Канонические AC-003-01…AC-003-10 находятся в Product OS TASK-2026-003. Application submission обязан дать результат каждого AC и не скрывать NOT_RUN/BLOCKED.

## Merge boundary

Новая ветка stacked от PR #6. До merge base dependency запрещено сливать её напрямую в `main`. Production deploy и реальные данные запрещены.
