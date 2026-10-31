# VoxelCraft 架构

## 总览

```text
main.ts
  └─ VoxelCraftApp (app/app.ts)
       ├─ UI (ui/ui.ts)               DOM 菜单、HUD、容器界面
       ├─ AudioEngine (audio/audio.ts) 用户手势解锁的程序音频
       ├─ WorldStorage (persistence/storage.ts)
       └─ GameSession (game/session.ts) 一个已加载世界的生命周期所有者
            ├─ VoxelWorld ── WorldGenerator / BlockRegistry
            ├─ ChunkRenderer ── WorkerClient ── voxel.worker
            ├─ PlayerBody / Survival / Inventory
            ├─ MobSystem / DropSystem
            ├─ SkySystem / Particles / MobRenderer / DropRenderer
            └─ Crafting / Furnace pure functions
```

### 状态所有权

- `VoxelCraftApp` 只负责应用导航、世界列表和一个当前 `GameSession`。切换世界时先释放上一会话。
- `GameSession` 拥有玩家、背包、世界编辑、熔炉、掉落物、世界时间和自动保存定时器；销毁时移除输入、RAF、ResizeObserver、GPU Mesh 与 Worker。
- `VoxelWorld` 拥有 Chunk 体素数组和 `edits` 稀疏修改表；UI 从不作为游戏数据的真实来源。
- `Inventory` 只允许通过方法改变堆叠，负责数量约束；UI 操作回传到 `GameSession`。
- 纯函数模块（`generator`, `mesher`, `raycast`, `recipes`, `furnace`, `survival`）不依赖 Three.js 或 DOM，可直接单元测试。

## 线程模型

- 主线程：输入、物理、交互、实体、UI 与 Three.js 场景提交。
- 一个模块型 Web Worker 串行处理生成和 Mesh 请求。`ChunkRenderer` 限制最多 3 个在途生成任务和 3 个在途 Mesh 任务。
- Worker 协议带 `epoch`。切换/释放世界时 `WorkerClient.cancelEpoch()` 终止 Worker 并递增 epoch；过期应答被丢弃。
- 每个 Mesh 请求记录 Chunk revision；返回时 revision 不一致即丢弃，防止旧网格覆盖新编辑。
- 生成结果使用 Transferable typed arrays，避免大块体素数组复制。

## Chunk 生命周期

```text
目标范围 → generate queued → generated (ready) → all four neighbors ready
        → mesh queued → GPU mesh (visible) → edit marks dirty
        → remesh → leave radius → geometry.dispose + chunk removal
```

- 加载半径为渲染距离 + 1，保证边缘 Chunk 也有四个邻居可做遮蔽判断。
- 修改方块会递增所属 Chunk revision；若位于边界，同时 mark 相邻 Chunk。
- 首次进入要等玩家周围 3×3 Chunk 均已生成 Mesh 才隐藏加载页，降低出生坠落风险。
- 未加载的区块返回空气；玩家所在 3×3 由加载页保证先满足。

## Mesh 与渲染

- 每个 Chunk 最多两个 Mesh：不透明地形和透明几何（水/冰/玻璃）。
- 六邻面可见性剔除；角点 Ambient Occlusion 写入顶点色；纹理使用程序化 8×8 tile Atlas。
- `FrustumCulled` 由 Three.js 包围球与相机视锥完成，不会为每个方块创建 Mesh。
- 一个 Worker Mesh 任务实测约 5–7 ms；地形生成约 5–8 ms（本机 Chromium/SwiftShader，样本见验收报告）。
- 光照采用太阳方向光、天空半球光与最多 6 个靠近玩家的点光源；并非完整体素光照传播。

## 物理与交互

- 固定模拟步长 1/60 秒，单帧最多 8 步，避免卡顿后无限追帧。
- 玩家碰撞使用 0.58×1.79 的 AABB，按轴分步移动；每轴对位移切片，每次最多约 0.18 格，防止低帧率穿墙。
- 移动方向由 yaw 计算，斜向输入归一化；水改变速度/浮力，创造模式可开启飞行。
- 交互使用 DDA 体素射线，最大距离 6 格；目标方块高亮与裂纹层使用独立对象。
- 挖掘时间由硬度、工具类型、工具等级共同决定；成功采集或攻击后消耗工具耐久。

## 生存和实体

- 生存逻辑封装在 `Survival`，对伤害来源、冷却、死亡只结算一次。
- 生物状态机为 wander/flee/chase/attack；重力、地面、水平碰撞和攻击距离都由模拟决定，渲染器只同步显示。
- 掉落物有重力、拾取延迟、磁吸、合并和 300 秒生命周期；拾取时库存先决定可接收数量，避免复制。

## 存档模型

IndexedDB 数据库 `voxelcraft-k3`，对象仓库 `worlds`，以 `metadata.id` 为 key。一个世界一条记录：

```ts
type WorldSave = {
  schema: 2;
  generator: 1;
  metadata: { id, name, seed, mode, createdAt, updatedAt, version };
  player: { position, yaw, pitch, health, hunger, oxygen, time, inventory, selected };
  edits: Record<'x,y,z', blockId>;
  furnaces: Record<'x,y,z', FurnaceState>;
  drops: { id, count, position, age }[];
}
```

- 修改保存的是完整稀疏编辑覆盖层，不依赖 Chunk 是否在内存中。
- 同一世界所有保存通过 Promise 队列串行化，后发快照不会先写。
- 一个 IndexedDB `readwrite` 事务写入整条世界记录，防止半写入。
- `schema` 校验；当前提供 schema 1 → 2 迁移函数。不兼容版本会拒绝加载并提示。
- 导入使用新 UUID，避免覆盖已有世界；导出为完整 JSON。
- 保存失败通过 UI 明确显示，不伪造成功。

## 扩展点

- 新方块：在 `world/blocks.ts` 添加定义，在 Atlas 加 tile，在 `world/mesher` 的 tile 映射里自动可用；必要时自定义渲染路径。
- 新物品/工具：`inventory/inventory.ts` 的 `ITEM_NAMES`；配方加入 `crafting/recipes.ts`。
- 新配方/熔炼：纯数据表，`Recipe` 与 `SMELTING`。
- 新生物：`MobSystem` 类型与状态机分支，渲染器单独建模型。
- 新结构：`generator.ts` 中用种子确定的世界坐标生成，跨 Chunk 的同一结构会按坐标重叠填充。
