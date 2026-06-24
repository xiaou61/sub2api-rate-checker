# Sub2API Rate Checker

一个给中转站用户用的桌面端倍率比价工具。适合同时维护多个 `sub2api` / `New API` 站点时，批量查询分组倍率、API Key 分组绑定情况，并快速找出哪个站点、哪个分组最便宜。

当前版本：`v0.01`

## 功能

- 支持添加多个站点。
- 添加站点时可选择站点类型：`sub2api` 或 `New API`。
- 支持批量查询全部站点，也支持只查询当前选中站点。
- 支持按分组筛选，分组选择体验接近 sub2api 的下拉搜索。
- 支持全站比价，按有效倍率从低到高排序。
- 自动过滤无效倍率，避免空值、`0`、`x0` 混进比价结果。
- 小倍率不会再被四舍五入成 `x0`，例如 `0.00001` 会正常显示。
- 支持展示 API Key 的分组、状态、默认倍率、专属倍率、最终倍率、配额和最近使用时间。
- 对 sub2api 站点支持渠道监控汇总，包括主模型、状态、延迟、7 日可用率和模型详情。
- 支持浏览器登录窗口和本地 Token 采集。
- 数据保存在本机 Electron `userData` 目录，不上传到第三方服务。

## 支持的站点类型

### sub2api

sub2api 站点会调用这些接口：

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/admin/groups/all`
- `GET /api/v1/groups/available`
- `GET /api/v1/groups/rates`
- `GET /api/v1/keys`
- `GET /api/v1/channel-monitors`

如果自动登录遇到 Turnstile 或 2FA，可以直接粘贴 `auth_token` / `refresh_token`。

### New API

New API 站点会调用这些接口：

- `GET /api/pricing`
- `GET /api/token/`
- `GET /api/user/self`
- `GET /api/user/self/groups`

说明：

- `/api/pricing` 通常可以公开读取，用来拿 `group_ratio` 和 `usable_group`。
- `/api/token/` 需要 `Authorization: Bearer <AccessToken>`。
- 某些 New API 部署还需要请求头 `New-Api-User`，所以站点配置里提供了可选的 `New API User ID`。
- 不同 New API 站点的前端本地存储字段可能不一样，浏览器登录采集是尽力识别；如果采集不到，手动粘贴 AccessToken 最稳。

## 安装和使用

### 直接运行 Release

到 GitHub Release 下载 Windows 版本：

[Releases](https://github.com/xiaou61/sub2api-rate-checker/releases)

下载后运行 `Sub2API Rate Checker v0.01.exe` 即可。

### 从源码运行

```bash
npm install
npm start
```

### 添加站点

1. 点击「新建站点」。
2. 填写站点名称和 Base URL，例如 `https://example.com`。
3. 选择站点类型：`sub2api` 或 `New API`。
4. 填写 Token 或使用「浏览器登录」后再「采集 Token」。
5. 点击「保存」。
6. 点击「查询当前」或「查询全部」。

## Token 获取说明

### sub2api

推荐方式：

1. 在工具里选择站点。
2. 点击「浏览器登录」。
3. 在打开的窗口里正常登录站点。
4. 登录成功后点击「采集 Token」，或等待工具自动采集。

如果站点有 Turnstile / 2FA，自动密码登录可能失败，这时直接粘贴网页本地存储里的 `auth_token` / `refresh_token` 更可靠。

### New API

推荐方式：

1. 进入 New API 站点的个人设置。
2. 找到系统 AccessToken 或用户 AccessToken。
3. 粘贴到工具的 `Auth Token`。
4. 如果站点要求 `New-Api-User`，再填写 `New API User ID`。

## 本地数据位置

站点配置保存在 Electron 的 `userData` 目录。Windows 上一般类似：

```text
C:\Users\<你的用户名>\AppData\Roaming\sub2api-rate-checker\sites.json
```

这个文件可能包含站点 Token 和密码。不要把它发给别人，也不要提交到 GitHub。

## 开发

```bash
npm install
npm test
npm start
```

项目结构：

```text
src/main.js                  Electron 主进程和 IPC
src/storage.js               本地站点配置存储
src/sub2apiClient.js          sub2api / New API 查询客户端
src/preload.js               Renderer 安全桥接
src/renderer/index.html       页面结构
src/renderer/renderer.js      前端交互和比价逻辑
src/renderer/styles.css       UI 样式
scripts/check-rate-format.js  倍率格式回归检查
scripts/check-newapi-client.js New API mock 查询检查
scripts/smoke-ui.js           Electron UI 冒烟检查
```

## 构建

生成 portable Windows exe：

```bash
npx electron-builder --win portable --publish never --config.directories.output=dist-release-v0.01
```

开发时也可以生成 unpacked 目录：

```bash
npx electron-builder --win dir --publish never --config.directories.output=dist-newapi
```

## 安全说明

- 不会把 Token 上传到任何第三方服务器。
- 不会在日志里打印 Token。
- Git 仓库不会提交 `dist*`、`node_modules`、本地配置和过程文件。
- 这个工具仍然会在本机明文保存站点配置，建议只在自己的电脑使用。

## 版本记录

### v0.01

- 初始开源版本。
- 支持 sub2api 和 New API。
- 支持站点类型选择。
- 支持全站倍率比价。
- 支持分组搜索和筛选。
- 修复小倍率显示为 `x0` 的问题。
- 支持 GitHub Actions 自动检查。

## License

MIT
