# just-collect

<img src="assets/icon.png" alt="just-collect 图标" width="96" />

使用 React Native、Expo 和 TypeScript 编写的 B 站收藏视频客户端，面向 Android / iOS。只有收藏视频、收藏夹和设置三个页面，视频来源始终限定在你指定的收藏夹。

[下载 Android APK v1.3.0](https://github.com/Rkgua/just-collect/releases/tag/v1.3.0) · [播放器实现说明](docs/player-reference.md)

软件名和项目 / 仓库名为 `just-collect`，使用用户提供的粉色电视图标，原图保存在 `assets/logo.png`，`npm run icons` 可重新生成桌面图标及 Android 自适应、圆形和主题图标。应用内首页、关于页与 Web 图标同步使用该图片。

当前版本为 1.3.0，安装包名称为 `just-collect-1.3.0-arm64.apk`，在 [GitHub Releases](https://github.com/Rkgua/just-collect/releases) 下载，适用于 Android 7.0 及以上的 ARM64 手机。内置应用代码，无需 Expo Go 或开发服务器。沿用旧版签名与应用标识，可覆盖安装并保留已连接收藏夹和登录设置。使用测试签名，对应 SHA-256 校验文件位于同一 Release。

## 启动

需要 Node.js 22.13 或更高版本。

```powershell
npm install
npm start
```

公开收藏的界面与播放可以使用与 Expo SDK 58 匹配的 Expo Go。完整的官方网页登录同步使用自定义原生 Cookie 模块，需要本项目 APK 或 development build，不能在 Expo Go 中使用。配置好 Android 环境后可运行 `npm run android`；iOS 原生构建需要 macOS。

`npm run web` 可以预览界面。浏览器受 B 站跨域策略及媒体请求头限制，不作为实际观看客户端；真实收藏夹访问、私密登录和视频播放请在 Android / iOS 中使用。应用不需要额外后端。

## 使用

私密收藏或不方便分享时，直接选择「登录后直接选择收藏夹」：

1. 在应用内的 B 站官方页面完成短信或密码登录。
2. 登录成功后自动验证本人账号，并列出自己创建的公开、私密收藏夹。
3. 勾选需要的收藏夹，点击「汇总所选收藏夹」。
4. 在「收藏汇总」中连续观看，重复视频按视频 ID 去重。也可以点击顶部标签单独观看某个收藏夹。

汇总按收藏夹轮流分页载入，并不预先下载全部收藏；载入后即可播放。搜索同样限定在所选收藏夹内。可以在「收藏夹」页面点击「汇总全部已连接收藏夹」扩大本机汇总范围。重新从账号选择时，会以本次勾选设置汇总范围。

公开收藏也可以继续使用分享链接：

1. 点击「添加第一个收藏夹」。
2. 点击「打开 B 站收藏」，在官方 App 中进入「我的 → 我的收藏」，打开想看的收藏夹，点「分享 → 复制链接」（部分版本位于右上角「⋯」）。
3. 回到应用点「一键粘贴」，再点「添加收藏夹」。支持粘贴整段分享文案和 `b23.tv` 短链接，无需打开网页版。
4. 添加后点击视频，或点击「开始播放」。可以添加多个收藏夹，点击顶部标签切换，也可以在「收藏夹」页面选择。

也支持直接输入数字收藏夹 ID，或粘贴带 `fid`、`media_id` 参数、`/medialist/detail/ml数字`、`/medialist/play/ml数字`、`/list/ml数字` 的完整链接。收藏夹 ID 和用户 UID 是不同的数字。短链接以匿名方式解析，不携带账号 Cookie；视频分享链接不会被当作收藏夹导入。

「打开 B 站收藏」使用 `bilibili://main/favorite` 跳转，实际落地位置取决于 B 站版本，需在安装了官方 App 的手机上验证。若打开后没有进入收藏页，可在 B 站手动点「我的 → 我的收藏」。跳转不会共享官方 App 的登录状态，私密收藏夹仍需要自己的凭证。进入官方 App 后，其推荐内容不受本应用控制。

收藏列表按收藏时间分页，每页最多 20 项；「再翻一些收藏」加载下一页。搜索请求限定在当前收藏夹，支持搜索尚未载入的视频。非视频条目不会显示，已失效视频会标记并禁用播放。下拉刷新同步收藏夹内容。

播放器支持全屏、暂停、进度拖动、上一个 / 下一个视频、分 P 选择和自动连播。自动连播默认开启，分 P 播完后继续同一收藏夹中的下一条；列表末尾按需加载下一页，最后一条播完后停止。随机模式从已载入的有效收藏中选择下一条，不会跳到站外推荐。应用进入后台会暂停。

普通播放和短视频播放使用同一套自定义播放器，交互参考 B 站公开工程和操作介绍，具体来源和对应实现见 [播放器参考说明](docs/player-reference.md)。

- 单击画面显示 / 隐藏控制条，双击播放 / 暂停；播放中控制条会自动隐藏。
- 播放时长按画面临时至少 2× 加速，松手恢复保存的倍速，不把临时速度写入设置。
- 左右滑动预览进度，松手提交；移动到上方两个角落松手可取消。进度条支持拖动，并显示缓冲位置。
- 「横屏全屏」直接旋转，在横屏继续使用相同的倍速、进度和下一条控件。全屏切片后保留全屏。
- 横屏左侧上下滑动调整应用窗口亮度，右侧调整当前视频音量；锁屏按钮暂时禁用画面手势，解锁后恢复。
- 倍速支持 0.5×、0.75×、1×、1.25×、1.5×、2×、2.5×、3×，保持音调；换片、切换模式和重启后保留选择。

退出横屏或关闭播放器会恢复原旋转设置和窗口亮度。亮度不修改系统全局设置。进入后台会暂停，回到应用后可继续播放。Android 返回键先退出横屏，再关闭播放器。

删除连接只会移除本机收藏夹记录，不会修改 B 站收藏。

### 短视频随机模式

在收藏视频页点击「随机刷 · 短视频模式」，进入全屏上下滑动观看：上滑随机下一条，下滑回看上一条，也可以使用底部箭头。当前选择单个收藏夹时只刷这个夹；选择「收藏汇总」时只刷已经勾选的夹。随机范围不受列表已加载页数或搜索词限制。

模式会先打乱所选收藏夹的页码，再从逐步加载的视频池随机抽取，避免只在第一页随机。一轮内按视频 ID 去重，刷完后可以重新开始一轮；失效条目会跳过，网络或权限错误可以重试。不会获取推荐流。

双击画面暂停或继续，单击显隐控制条，底部进度条可拖动；支持静音、分 P 切换和自动连播。连播开关与设置同步，播放完当前视频的所有分 P 后随机下一条。切换视频、退出模式或进入后台会暂停当前播放。「短视频」表示滑动观看方式，不按时长筛选或裁剪画面，横屏视频仍保持原比例。

## 私密收藏夹

私密收藏夹无需改为公开，也不依赖分享按钮；在「设置」中点击「打开 B 站官方登录页」完成本人登录即可。登录凭证从本应用内 WebView 的 Cookie 存储中读取，经 B 站登录状态接口验证后，使用 SecureStore 加密保存；不读取官方 App 的私有数据，不记录密码，也不通过脚本读取登录表单。退出登录会清理本应用的网页登录 Cookie，并从本机列表移除已识别的私密收藏夹连接。

如已有自己的 `SESSDATA`，下方手动导入仍作为备用入口：

1. 电脑浏览器登录 B 站。
2. 开发者工具 → Application / 存储 → Cookies → `https://www.bilibili.com`。
3. 复制 `SESSDATA` 的值，粘贴到应用并保存。

凭证使用 Expo SecureStore 保存在手机的系统安全存储中，不会写入普通偏好文件或发送到自建服务器。请求媒体 CDN 时不携带账号 Cookie。凭证等同登录钥匙，请勿提供给他人或提交到 Git。可以在设置中删除本机凭证。当前版本未实现扫码登录。

接口调查结论：检查了[官方开放平台公开文档目录](https://openhome.bilibili.com/doc)，未发现公开提供的“读取个人收藏夹”OAuth 权限。因此本版本使用 B 站自身的网页登录态和站内接口，不声称拥有官方第三方开放授权。列出收藏夹使用 `/x/v3/fav/folder/created/list-all`，夹内视频使用 `/x/v3/fav/resource/list`；私密数据必须由本人登录访问。[接口行为的社区记录](https://github.com/bilibili-plugins/bilibili-api-collect/blob/master/docs/fav/info.md)。这类接口可能变更、拒绝访问或受风控限制，应用会提示错误，不把拒绝响应当作空收藏。

## 检查与构建

```powershell
npm run typecheck
npm test
npm run test:ui
```

UI 测试需要本机 Microsoft Edge；也可以修改 `playwright.config.ts` 使用已安装的 Chromium。测试直接向浏览器提供导出的静态文件，无需本地服务器或外网，通过拦截请求验证添加、输入校验、分页、搜索、播放队列、偏好持久化和移除流程，截图保存在 `artifacts/`。标注为 fixture 的截图使用测试内容。测试不会读取真实登录凭证。

验证某个公开收藏夹的真实接口、分 P、MP4 地址和 CDN（只读取少量字节）：

```powershell
npm run check:api -- 你的公开收藏夹ID
```

生成 Android APK 可使用 EAS，已提供 `eas.json` 中的 `preview` 配置：

```powershell
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

EAS 构建需要使用你自己的 Expo 账号。项目没有内置 EAS 项目 ID，也没有生成或上传任何签名凭证。

Android JavaScript / Hermes 资源包可用 `npx expo export --platform android` 验证，该命令生成的不是 APK。如果受限 Windows 环境的默认临时目录无法写入，可在当前终端设置项目内临时目录后重试：

```powershell
New-Item -ItemType Directory -Force artifacts/tmp | Out-Null
$env:TEMP = (Resolve-Path artifacts/tmp).Path
$env:TMP = $env:TEMP
npx expo export --platform android --output-dir artifacts/android-export
```

## 实现与边界

- `src/services/bilibili.ts`：收藏夹列表、分 P 与播放地址；请求播放前校验视频属于当前收藏夹。
- `src/hooks/useFavoriteFeed.ts`：单夹和汇总分页、取消过期请求与列表合并。
- `src/services/favoriteQueue.ts`：限定收藏范围、轮流分页及去重。
- `src/services/randomFavorites.ts`：所选收藏的随机分页、视频池抽取和一轮去重。
- `src/components/RandomShorts.tsx`：全屏上下滑动、回看历史和短视频播放控制。
- `src/components/AccountLogin.native.tsx`：本应用内的官方网页登录、验证和凭证接收。
- `src/components/AccountFolders.tsx`：列出本人收藏夹并选择汇总范围。
- `src/components/Player.tsx`：普通播放与当前收藏夹队列。
- `src/components/FavoriteVideo.tsx`：统一播放控制、临时倍速、进度拖动、亮度 / 音量和锁屏。
- `src/hooks/usePlayerFullscreen.ts`：横屏、退出恢复方向和窗口亮度。
- `src/services/storage.ts`：本地收藏夹、播放偏好和安全凭证存储。
- `tests/core.test.ts`：链接解析、访问范围、接口错误、过滤及凭证边界测试。

这是独立第三方客户端，不是 B 站官方应用。收藏和播放使用 B 站现有 Web 接口，接口变动、风控、地区、登录状态及视频权限均可能影响可用性。不绕过付费、会员或私密权限。当前播放器使用单段 MP4；受限试看、无 MP4 返回或多段媒体会显示明确提示。未实现离线下载、DASH 音视频合流或播放进度跨次恢复。

已验证公开收藏夹列表和一条有效视频的分 P、MP4 / CDN 访问（HTTP 206）。29 项单元测试覆盖本人账号验证、私密收藏夹标识、拒绝响应、汇总范围、随机分页、去重、手势阈值和失败重试；6 项浏览器 UI 测试覆盖汇总分页、原有播放流程、短视频触屏上滑、历史回看、限定范围、连播偏好，以及实际媒体元素的倍速和音调保持状态。浏览器使用模拟收藏接口和本地合成 PCM 媒体。另在 Android 14 x86_64 模拟器中安装同源码的对应架构测试包，导入公开收藏夹并实际播放两条视频，验证点击暂停、上滑换片、下滑回看、后台暂停和返回键退出，未发现 AndroidRuntime 或 ReactNativeJS 错误。此前也已确认官方手机号 / 密码登录页面和原生未登录检测正常。手机交付文件为 ARM64 APK。实际私密账号登录、验证码和内容读取仍需账号本人在手机上验证，测试不使用用户真实凭证。

参考：[Expo Video](https://docs.expo.dev/versions/latest/sdk/video/)、[Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)、[you-get 的 B 站接口实现](https://github.com/soimort/you-get/blob/develop/src/you_get/extractors/bilibili.py)。
