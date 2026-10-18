# VoxelCraft 部署说明（Netlify）

状态：**本地配置与生产构建验证通过；Netlify 站点尚未创建，生产 URL 尚不存在。**
Netlify 站点导入与 GitHub App 授权必须在浏览器中由仓库所有者手动完成。

## 1. 仓库与分支

- GitHub：<https://github.com/baicie/voxelcraft>
- 生产分支：`main`
- 构建目录：仓库根目录
- 构建命令：`npm run check:deploy`
- 发布目录：`dist`
- Node：22（`netlify.toml` 的 `NODE_VERSION`）

`check:deploy` 依次执行：

```text
typecheck → Vitest 单元测试 → production build
```

Playwright E2E 不放进 Netlify 每次静态构建：它需要本机 Chrome，耗时较长。E2E 在合并前/发布后单独执行。

## 2. Netlify 手动步骤

1. 用 GitHub 账号登录 <https://app.netlify.com/>。
2. `Add new project` → `Import an existing project` → GitHub。
3. 授权 Netlify GitHub App 访问 `baicie/voxelcraft`。
4. 选择仓库，确认：
   - Production branch：`main`
   - Base directory：留空（仓库根目录）
   - Build command：`npm run check:deploy`（若仓库内 `netlify.toml` 生效，UI 可显示仓库配置）
   - Publish directory：`dist`
   - Node：22
5. 触发首次 Deploy，等待构建日志显示 typecheck、85 个单元测试和 Vite build 全部通过。
6. 记录 Netlify 分配的真实 HTTPS 地址；在 Site configuration 中按需修改子域名。
7. 确认 Deploy Previews 已启用；PR 会得到独立预览域名和生产域名隔离的 IndexedDB。

## 3. 构建与缓存策略

`netlify.toml` 配置：

- `/assets/*`：内容哈希的 JS/CSS/Worker，`max-age=31536000, immutable`；
- `/index.html`：`no-cache`，确保入口始终引用当前构建；
- 全站：`X-Content-Type-Options: nosniff`、`Referrer-Policy: strict-origin-when-cross-origin`；
- 不配置 SPA fallback，因为当前只有根路径游戏，没有 History API 子路由；
- 不引入 Service Worker/PWA，避免首版离线缓存与版本一致性风险。

当前 Vite 配置为 `base: './'`，构建产物使用相对路径，可部署在 Netlify 根域名；Chunk Worker 通过：

```ts
new Worker(new URL('./generationWorker.ts', import.meta.url), { type: 'module' })
```

由 Vite 打包为 `dist/assets/generationWorker-<hash>.js`，不依赖 `/src` 运行时路径。

## 4. IndexedDB 与域名

IndexedDB 是**浏览器本地、按 Origin 隔离**的数据，Netlify 构建阶段无法读取，也不会被部署：

- 生产 `*.netlify.app`、PR 预览域名、`127.0.0.1:5173` 各自独立；
- 更换生产域名后，旧域名下的存档不会自动迁移；
- Deploy Preview 看不到生产存档，这是预期行为；
- V1→V2 迁移已在客户端完成；Netlify 静态回滚不能逆向 IndexedDB 迁移；
- 当前没有云存档、登录或导入/导出；跨设备/跨域名迁移仍是后续工作。

## 5. 生产构建本地验证

```bash
npm ci
npm run check:deploy
npm run preview -- --host 127.0.0.1 --port 4180
```

另一个终端：

```bash
BASE_URL=http://127.0.0.1:4180 node scripts/deploy-smoke.mjs
```

`deploy-smoke.mjs` 在真实 Chromium 中验证构建产物：菜单、创建世界、Worker 资源、WebGL、HUD、Pointer Lock、挖掘、保存、退出与继续。

### 2026-10-18 本地结果

```text
npm ci                51 packages, 4 s
npm run check:deploy  typecheck 通过
                      17 test files / 85 tests 通过
                      Vite build 通过（dist 4 个文件）
BASE_URL=...           Worker 200（4 个实例请求）
                      IndexedDB: worlds=1, players=1, chunkDeltas=2
                      重载后 CREATIVE、112 loaded chunks
                      pageErrors=[] consoleErrors=[]
deploy smoke passed
```

本次验证使用 `vite preview` 服务 `dist/`，不是 Netlify CDN；它能验证生产构建、相对资源路径和 Worker，但不能替代线上域名验收。

## 6. 发布后验收

在真实 Netlify URL（不是本地 dev server）检查：

- `/`、`/assets/*.js`、Worker 资源均 HTTP 200；控制台无 404/CORS/MIME 错误；
- WebGL2 初始化，创建世界后 Chunk 流式加载；
- 移动/挖掘/放置/刷新/退出继续；
- 存档在当前 Origin 保留；
- 至少 Chrome，再补 Edge/Firefox；移动端给出可理解的不可玩提示；
- 记录发布 SHA、浏览器、操作系统、首次加载时间、FPS、Draw Calls 和 JS Heap。

## 7. 回滚

- 构建失败：旧生产 Deploy 继续服务；查看 Deploy log 第一个失败步骤。
- 运行时失败：Netlify Deploys → 上一条成功 Deploy → `Publish deploy`。
- 随后 `git revert` 问题提交并推送 `main`，避免下一次自动发布覆盖紧急回滚。
- 如果涉及 IndexedDB schema，回滚静态资源不等于恢复存档；先验证旧 Schema 兼容性。

## 8. 当前未完成项

- Netlify 账号授权、站点创建、首次线上 Deploy：需要仓库所有者手动完成。
- 真实 Netlify 域名上的生产冒烟测试：需拿到 URL 后执行。
- PR Deploy Preview 强制门禁：需在 GitHub Ruleset/Netlify 设置中按账号权限启用。
- 自定义域名、GitHub Pages 或 Netlify 之外的托管：不在本次范围。
