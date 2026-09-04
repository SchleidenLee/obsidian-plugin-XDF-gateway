# Changelog

## v0.1.0 (2026-09-04)

### 核心功能
- **插件自动更新**：支持 XDF 套件插件一键检查和更新
- **镜像站 Fallback**：内置 4 个镜像站，自动降级确保下载成功
- **设置页分组渲染**：通过 DOM 操作将插件按分组折叠显示
- **插件启用/禁用**：iOS 风格 Toggle 开关，一键切换插件状态
- **标签系统**：预设 4 个功能标签（日历、AI、编辑器、工具），支持自定义

### UI 优化
- Banner 导航：插件管理 / 标签管理 / 高级设置
- 置顶插件左侧指示条（微妙灰色，不抢眼）
- 分组折叠动画（▶ 箭头旋转）
- XDF 教学套件分组特殊高亮（主题色）

### 预设配置
- **分组**：XDF 教学套件 / 编辑器与文件 / 外观与样式 / 其他插件
- **标签**：日历 / AI / 编辑器 / 工具
- **镜像站**：gh-proxy.com / ghproxy.net / gh.llkk.cc / ghfast.top

### 技术细节
- 基于 BRAT 的 GitHub API 通信层改造
- 借鉴 obsidian-manager 的 Install Hub 两级回退下载
- 借鉴 settings-sidebar-organizer 的 proxy button 机制
- 使用 Obsidian 内部 API 实现插件启用/禁用
