# Changelog

## 0.1.0 (unreleased)

- 初始原型：动态 Cordis 插件（Host 执行/账本/工具 + Client 图卡片与工作台 tab）
- `bio_init_project` / `bio_run_cell` / `bio_rerun_cell` / `bio_add_feedback` / `bio_get_project` / `bio_list_projects` / `bio_set_projects_dir` / `bio_delete_cell` 工具
- 项目布局 + `manifest.json` 账本 + cell 头契约 + `environment.lock`
- 配套 skill `bio-workbench`
- 设计文档 + 示例项目骨架
- 多格式图预览（png/jpg/webp/gif/svg/pdf/tif/bmp，PDF 内嵌 iframe）+ 删除 cell
- 跨平台 shell 层（Windows PowerShell 命令方言 / python↔python3 / explorer 定位）
- Phase 2 骨架：`cordis.patch.yml` bundle 补丁 + 双面包 `package.json` 元数据（`dsh.bundle` / `dsh.client`）
