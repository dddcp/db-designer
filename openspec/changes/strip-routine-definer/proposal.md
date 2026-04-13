## Why

MySQL 的 `SHOW CREATE FUNCTION/PROCEDURE/TRIGGER` 输出始终包含 `DEFINER=<user>@<host>` 子句，这是环境相关的元数据而非逻辑定义。当前代码直接将完整 DDL 存入 `RemoteRoutine.body`，导致不同环境（dev/staging/prod）的相同 routine 在对比时始终显示为 "different"，产生大量误报。

## What Changes

- 在拉取远端 MySQL routine 时，剥离 `DEFINER=<user>@<host>` 子句后再存储
- 在 routine 对比逻辑中，对比较双方都进行 DEFINER 剥离后再比较，以兼容历史遗留数据
- 在同步远端 routine 到本地时，同步存储已剥离 DEFINER 的 body
- 在版本间 routine 对比时，同样进行 DEFINER 归一化
- 提供统一的 `normalize_routine_body()` 函数，供所有需要的位置调用

## Capabilities

### New Capabilities
- `routine-body-normalization`: routine body 归一化处理——在拉取、对比、同步、版本 diff 等环节统一剥离 MySQL DEFINER 子句，消除环境差异导致的误报

### Modified Capabilities

## Impact

- `src-tauri/src/dialect.rs`：MySQL `get_remote_routines` 实现中增加 DEFINER 剥离
- `src-tauri/src/services/routine_service.rs`：`compare_routines` 和 `sync_remote_routine_to_local` 增加 normalize
- `src-tauri/src/services/version_service.rs`：版本间 routine diff 增加 normalize
- 新增公共 normalize 函数（可放在 dialect.rs 或独立的工具模块）
- 仅影响 MySQL dialect，PostgreSQL 和 Oracle 不受影响
