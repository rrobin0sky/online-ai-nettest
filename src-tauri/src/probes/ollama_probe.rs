use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaModelTag {
    pub name: String,
    pub model: Option<String>,
    pub modified_at: Option<String>,
    pub size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaTagsResponse {
    pub models: Option<Vec<OllamaModelTag>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaStatus {
    pub is_online: bool,
    pub base_url: String,
    pub models: Vec<String>,
    pub default_model: Option<String>,
    pub message: String,
}

pub struct OllamaProbe;

impl OllamaProbe {
    /// Normalizes base URL to host:port without trailing /v1 or slashes
    pub fn normalize_ollama_base(url: &str) -> String {
        let mut cleaned = url.trim().trim_end_matches('/').to_string();
        if cleaned.ends_with("/v1") {
            cleaned = cleaned.trim_end_matches("/v1").trim_end_matches('/').to_string();
        }
        if !cleaned.starts_with("http://") && !cleaned.starts_with("https://") {
            cleaned = format!("http://{}", cleaned);
        }
        cleaned
    }

    /// Probes local Ollama instance explicitly bypassing system HTTP/SOCKS proxies
    pub async fn probe(base_url: Option<String>) -> Result<OllamaStatus, String> {
        let raw_url = base_url.unwrap_or_else(|| "http://127.0.0.1:11434".to_string());
        let normalized = Self::normalize_ollama_base(&raw_url);
        let tags_endpoint = format!("{}/api/tags", normalized);

        // Build client with no_proxy to ensure Clash/Surge/V2ray cannot intercept localhost
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_millis(1500))
            .build()
            .map_err(|e| format!("Failed to create direct HTTP client: {}", e))?;

        let res = client.get(&tags_endpoint).send().await;

        match res {
            Ok(resp) if resp.status().is_success() => {
                let tags = resp.json::<OllamaTagsResponse>().await.unwrap_or(OllamaTagsResponse { models: None });
                let model_names: Vec<String> = tags
                    .models
                    .unwrap_or_default()
                    .into_iter()
                    .map(|m| m.name)
                    .collect();

                let default_model = model_names.first().cloned();

                Ok(OllamaStatus {
                    is_online: true,
                    base_url: format!("{}/v1", normalized),
                    models: model_names.clone(),
                    default_model,
                    message: format!("Ollama 在线，检测到 {} 个本地模型", model_names.len()),
                })
            }
            Ok(resp) => Ok(OllamaStatus {
                is_online: false,
                base_url: format!("{}/v1", normalized),
                models: Vec::new(),
                default_model: None,
                message: format!("Ollama 响应异常状态码: HTTP {}", resp.status()),
            }),
            Err(err) => Ok(OllamaStatus {
                is_online: false,
                base_url: format!("{}/v1", normalized),
                models: Vec::new(),
                default_model: None,
                message: format!("无法连接本地 Ollama (1.5s 超时): {}", err),
            }),
        }
    }
}
