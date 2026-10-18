# VoxelCraft 技术设计交付包

## 文件

- `VoxelCraft_完整技术设计_V0.2-V1.0.md`：从现有 V0.1 到 V1.0 的完整产品、架构、数据模型、功能方案、分阶段路线、测试、性能、迁移与发布标准。
- `DS4.1_执行提示词.md`：可直接交给 DS4.1/DSH/Codex 的 V0.2 实施任务。

## 推荐使用步骤

1. 将两份 Markdown 放到 VoxelCraft 仓库的 `docs/design/` 下。
2. 在仓库运行 Agent，并让它读取 `docs/design/VoxelCraft_完整技术设计_V0.2-V1.0.md` 和 `docs/design/DS4.1_执行提示词.md`。
3. 先实现 Phase 0 审计，再依次开发 V0.2 Phase 1–3，不要直接一次跳到 V1.0。
4. 每个 Phase 更新仓库 TODO 与测试证据；在 V0.2 验收通过后再计划 V0.3。

本包基于开发 Agent 提供的 V0.1 交付摘要设计，**尚未独立检查实际源码**。
