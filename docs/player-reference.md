# 播放器交互参考与实现

2026-11-27 联网核查，当前实现为 just-collect 1.3.0。

参考来源：

- [Bilibili 官方 ijkplayer 工程](https://github.com/bilibili/ijkplayer)：公开的 Android / iOS 播放引擎与示例，不等于当前 B 站客户端完整界面源码。
- [官方仓库的 AndroidMediaController 示例](https://github.com/bilibili/ijkplayer/blob/master/android/ijkplayer/ijkplayer-example/src/main/java/tv/danmaku/ijk/media/example/widget/media/AndroidMediaController.java)：播放引擎和控制层分离，控制条可显隐。本项目独立编写 React Native 控制层，没有复制此代码或引入旧版 ijkplayer 二进制。
- [B 站发布平台上的播放器操作介绍](https://www.bilibili.com/read/cv19585586/)：长按倍速、拖动调整进度及角落取消、竖屏上下切片等公开操作说明；文章与版本存在时间差，不作为当前客户端逐项行为保证。
- [B 站官方外链播放器文档](https://player.bilibili.com/)：公开嵌入参数包括视频 ID、分 P、起始时间、自动播放等。本项目继续使用原生媒体播放与收藏成员校验，未嵌入外链推荐界面。
- [Expo Video](https://docs.expo.dev/versions/latest/sdk/video/)、[ScreenOrientation](https://docs.expo.dev/versions/latest/sdk/screen-orientation/)、[Brightness](https://docs.expo.dev/versions/latest/sdk/brightness/)：当前运行库的原生播放、屏幕旋转和应用窗口亮度接口。

实现对应关系：

| 操作 | just-collect 行为 |
| --- | --- |
| 单击 / 双击画面 | 单击显示或隐藏控制条；双击播放或暂停 |
| 长按画面 | 播放中临时至少 2× 加速，松手恢复；不改写用户保存的倍速；保持音调 |
| 左右滑动 | 预览目标时间，松手提交；移动到上方角落松手取消 |
| 拖动进度条 | 显示已播放、缓冲与预览位置；松手定位，保留拖动前的播放 / 暂停状态 |
| 横屏两侧上下滑动 | 左侧调当前应用窗口亮度，右侧调当前视频音量 |
| 横屏锁定 | 隐藏控制条并阻止画面手势，点击解锁恢复；系统返回键仍可退出全屏 |
| 倍速菜单 | 0.5×–3×，切片和全屏保持选择；临时长按与保存倍速分开 |
| 横屏与退出 | 在同一 React 视图内旋转，保持播放器实例和时间；退出恢复原旋转设置、窗口亮度 |
| 短视频竖屏上下滑动 | 在选定收藏中换片、回看；横屏时转为调节手势 |
| 连播 | 普通模式和短视频模式沿用收藏队列；在全屏切片后仍保留全屏 |

本版仿照公开交互独立实现，没有取得或声称取得当前 B 站 Android 客户端源码。弹幕、投屏、会员清晰度和 DASH 合流没有在本次变更中实现，也不显示无效入口。收藏访问范围和权限检查继续沿用原实现。

亮度使用当前 Activity 的窗口属性，不修改系统全局亮度，也不请求修改系统设置权限。播放器使用同一 Activity 内覆盖层，避免原生对话框另起窗口而使亮度调整作用于不可见窗口。
