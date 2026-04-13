## 1. 本地设置字段扩展

- [x] 1.1 在 `src-tauri/src/services/setting_service.rs` 中将 `ai_design_common_prompt` 加入本地设置白名单
- [x] 1.2 确认 `get_local_settings` 与 `save_local_setting` 链路可读写 `ai_design_common_prompt`，且不影响现有 AI 配置字段

## 2. 设置页 AI 配置扩展

- [x] 2.1 更新 `src/components/setting/ai-tab.tsx`，加载并回填 `ai_design_common_prompt`
- [x] 2.2 更新 `src/components/setting/ai-tab.tsx`，在保存 AI 配置时写入 `ai_design_common_prompt`
- [x] 2.3 在 AI 配置页新增多行输入框及说明文案，引导用户填写主键偏好、命名习惯、常用字段等默认设计偏好

## 3. AI 自动设计提示词接入

- [x] 3.1 更新 `src/components/proj-detail/ai-design-modal.tsx`，在生成前读取本地设置中的 `ai_design_common_prompt`
- [x] 3.2 调整 AI 自动设计的 system prompt 组装逻辑，在配置非空时追加“默认设计偏好”段落
- [x] 3.3 保持 AI 修改表结构与 AI 推荐索引流程不接入该提示词

## 4. 验证

- [x] 4.1 验证设置页可正确加载、保存并回显 AI 设计通用提示词
- [x] 4.2 验证 AI 自动设计在配置非空时会带上默认偏好，在配置为空时保持原有行为
- [x] 4.3 运行 `cargo check`（`src-tauri/`）与 `npx tsc --noEmit`（仓库根目录）确认变更通过校验
