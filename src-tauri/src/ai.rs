use std::time::Duration;

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

/// AI 聊天接口：POST 推导出的 chat URL，返回助手 content 字符串
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
