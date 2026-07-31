use std::time::Duration;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};

/// AI 接口超时（秒）。
/// AI 评审等长任务会把项目所有表结构送进 LLM 推理，
/// 大模型常需 30~60s 甚至更久，统一用一个较宽的值避免误杀。
const REQUEST_TIMEOUT_SECS: u64 = 120;

/// 聊天消息条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// 流式聊天推送给前端的事件块。
/// 序列化为 `{"type":"delta"|"done"}`（delta 带 content）。
/// 错误统一以命令 `Result::Err` 返回（与 `ai_chat` 一致），不另设 error chunk。
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum StreamChunk {
    Delta { content: String },
    Done,
}

/// 把 baseUrl 推导为 chat completions 端点 URL
/// - 已是完整 chat URL（以 /chat/completions 结尾）→ 原样返回
/// - 否则在末尾追加 /chat/completions
pub fn derive_chat_url(base: &str) -> String {
    let trimmed = base.trim_end_matches('/');
    if trimmed.ends_with("/chat/completions") {
        trimmed.to_string()
    } else {
        format!("{}/chat/completions", trimmed)
    }
}

/// 把 baseUrl 推导为 models 端点 URL
/// - 去除末尾 /chat/completions 后缀，再追加 /models
/// - 未带该后缀时直接追加 /models
pub fn derive_models_url(base: &str) -> String {
    let trimmed = base.trim_end_matches('/');
    let stripped = trimmed.strip_suffix("/chat/completions").unwrap_or(trimmed);
    format!("{}/models", stripped)
}

/// 把 reqwest 错误分类成中文错误信息
fn classify_reqwest_error(err: reqwest::Error) -> String {
    if err.is_timeout() {
        return "网络超时".to_string();
    }
    if err.is_connect() {
        return "无法连接服务器".to_string();
    }
    format!("未知错误: {}", err)
}

/// 根据状态码生成对应中文消息
fn status_message(status: reqwest::StatusCode, body: &str) -> String {
    let code = status.as_u16();
    match code {
        401 | 403 => format!("鉴权失败 ({}): {}", code, body),
        408 | 504 | 524 => format!("网络超时 ({}): {}", code, body),
        500..=599 => format!("服务端错误 ({}): {}", code, body),
        _ => format!("API请求失败 ({}): {}", code, body),
    }
}

/// 给 RequestBuilder 附加可选 Authorization 头（api_key 自动 trim）
fn apply_auth(
    method: reqwest::Method,
    builder: reqwest::RequestBuilder,
    api_key: &str,
) -> reqwest::RequestBuilder {
    let trimmed = api_key.trim();
    let b = if method == reqwest::Method::GET {
        builder
    } else {
        builder.header("Content-Type", "application/json")
    };
    if !trimmed.is_empty() {
        b.header("Authorization", format!("Bearer {}", trimmed))
    } else {
        b
    }
}

/// AI 聊天接口：POST 推导出的 chat URL，返回助手 content 字符串。
/// 始终保持模型默认（思考开启），不再附加关闭思考字段。
#[tauri::command]
pub async fn ai_chat(
    base_url: String,
    api_key: String,
    model: String,
    messages: Vec<ChatMessage>,
) -> Result<String, String> {
    let url = derive_chat_url(&base_url);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("创建HTTP客户端失败: {}", e))?;

    let payload = serde_json::json!({
        "model": model,
        "messages": messages,
        "temperature": 0.7,
    });

    let req = apply_auth(reqwest::Method::POST, client.post(&url), &api_key).json(&payload);

    // reqwest 自身的 .timeout 已覆盖整次请求（含读取 body），
    // 无需再套一层 tokio::time::timeout。
    let response = req.send().await.map_err(classify_reqwest_error)?;
    let status = response.status();
    let body = response.text().await.map_err(classify_reqwest_error)?;
    if !status.is_success() {
        return Err(status_message(status, &body));
    }

    // 解析 OpenAI 风格响应并提取 choices[0].message.content
    let json: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| format!("响应解析失败: {}", e))?;
    let content = json
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|v| v.as_str())
        .unwrap_or_default();

    Ok(content.to_string())
}

/// 拉取供应商 /models 列表，返回模型 id 字符串数组
#[tauri::command]
pub async fn ai_fetch_models(base_url: String, api_key: String) -> Result<Vec<String>, String> {
    let url = derive_models_url(&base_url);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("创建HTTP客户端失败: {}", e))?;

    let req = apply_auth(reqwest::Method::GET, client.get(&url), &api_key);

    // reqwest 自身的 .timeout 已覆盖整次请求（含读取 body），
    // 无需再套一层 tokio::time::timeout。
    let response = req.send().await.map_err(classify_reqwest_error)?;
    let status = response.status();
    let body = response.text().await.map_err(classify_reqwest_error)?;
    if !status.is_success() {
        return Err(status_message(status, &body));
    }

    // 兼容 OpenAI 风格 {"data":[{"id":"..."}]} 与简单 ["m1","m2"] 形式
    let json: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| format!("响应解析失败: {}", e))?;

    if let Some(arr) = json.get("data").and_then(|v| v.as_array()) {
        let ids: Vec<String> = arr
            .iter()
            .filter_map(|item| {
                item.get("id")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            })
            .collect();
        return Ok(ids);
    }

    if let Some(arr) = json.as_array() {
        let ids: Vec<String> = arr
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect();
        return Ok(ids);
    }

    Ok(Vec::new())
}

/// 测试连接：复用 ai_fetch_models 同一实现，仅语义上表示"验证连通性"
#[tauri::command]
pub async fn ai_test_connection(base_url: String, api_key: String) -> Result<Vec<String>, String> {
    ai_fetch_models(base_url, api_key).await
}

/// AI 流式聊天接口：POST 推导出的 chat URL，把文本增量经 Channel 逐块推送给前端，
/// 直到生成结束。仅限制建连阶段超时，传输阶段不限时——只要片段持续到达就继续，
/// 避免重推理任务被固定整体超时或中间网关"长时间无响应"切断。
#[tauri::command]
pub async fn ai_chat_stream(
    base_url: String,
    api_key: String,
    model: String,
    messages: Vec<ChatMessage>,
    on_event: tauri::ipc::Channel<StreamChunk>,
) -> Result<(), String> {
    let url = derive_chat_url(&base_url);

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建HTTP客户端失败: {}", e))?;

    let payload = serde_json::json!({
        "model": model,
        "messages": messages,
        "temperature": 0.7,
        "stream": true,
    });

    let req = apply_auth(reqwest::Method::POST, client.post(&url), &api_key).json(&payload);

    let response = req.send().await.map_err(classify_reqwest_error)?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.map_err(classify_reqwest_error)?;
        return Err(status_message(status, &body));
    }

    // 逐块读取 SSE 流，按行解析 data: 增量
    let mut buf = String::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(classify_reqwest_error)?;
        let text = std::str::from_utf8(chunk.as_ref())
            .map_err(|e| format!("流响应解码失败: {}", e))?;
        buf.push_str(text);

        // SSE 以换行分隔事件；逐行处理已完整的行，保留不完整末行在 buf
        while let Some(idx) = buf.find('\n') {
            let line: String = buf[..idx].trim_end_matches('\r').trim().to_string();
            buf.drain(..=idx);

            if line.is_empty() || line.starts_with(':') {
                // 空行或注释心跳，跳过
                continue;
            }
            let Some(data) = line.strip_prefix("data:") else {
                // event: / id: / retry: 等非 data 行忽略
                continue;
            };
            let data = data.trim();
            if data == "[DONE]" {
                let _ = on_event.send(StreamChunk::Done);
                return Ok(());
            }
            // 解析 JSON，提取 choices[0].delta.content；解析失败则跳过该块继续（容错）
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(content) = json
                    .get("choices")
                    .and_then(|c| c.get(0))
                    .and_then(|c| c.get("delta"))
                    .and_then(|d| d.get("content"))
                    .and_then(|v| v.as_str())
                {
                    if !content.is_empty()
                        && on_event
                            .send(StreamChunk::Delta {
                                content: content.to_string(),
                            })
                            .is_err()
                    {
                        // 前端已关闭通道（如关闭 Modal），视为取消
                        return Ok(());
                    }
                }
            }
        }
    }

    // 流自然结束（未收到 [DONE]）
    let _ = on_event.send(StreamChunk::Done);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derive_chat_url_appends_when_missing() {
        assert_eq!(
            derive_chat_url("https://api.openai.com/v1"),
            "https://api.openai.com/v1/chat/completions"
        );
    }

    #[test]
    fn derive_chat_url_keeps_full_chat_url() {
        assert_eq!(
            derive_chat_url("https://opencode.ai/zen/go/v1/chat/completions"),
            "https://opencode.ai/zen/go/v1/chat/completions"
        );
    }

    #[test]
    fn derive_chat_url_trims_trailing_slash() {
        assert_eq!(
            derive_chat_url("https://api.openai.com/v1/"),
            "https://api.openai.com/v1/chat/completions"
        );
    }

    #[test]
    fn derive_models_url_for_root_form() {
        assert_eq!(
            derive_models_url("https://api.openai.com/v1"),
            "https://api.openai.com/v1/models"
        );
    }

    #[test]
    fn derive_models_url_for_full_chat_form() {
        assert_eq!(
            derive_models_url("https://opencode.ai/zen/go/v1/chat/completions"),
            "https://opencode.ai/zen/go/v1/models"
        );
    }
}
