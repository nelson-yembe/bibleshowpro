//! Caption translation for interpreted services, through Google Gemini with the church's own
//! key. Only a finished caption line is sent, as text (never audio), and only while the
//! operator has translation turned on.

use serde_json::{json, Value};
use std::time::Duration;

/// Tracks Google's newest light model, so the default survives model retirements.
pub const DEFAULT_MODEL: &str = "gemini-flash-lite-latest";

pub fn language_name(code: &str) -> Option<&'static str> {
    Some(match code {
        "en" => "English",
        "fr" => "French",
        "es" => "Spanish",
        "pt" => "Portuguese",
        "de" => "German",
        _ => return None,
    })
}

pub fn request_body(text: &str, source: Option<&str>, target: &str) -> Result<Value, String> {
    let target_name = language_name(target).ok_or_else(|| format!("Cannot translate into \"{target}\"."))?;
    let from = source.and_then(language_name).map(|name| format!(" from {name}")).unwrap_or_default();
    Ok(json!({
        "systemInstruction": { "parts": [{ "text": format!(
            "You translate live captions of a church sermon{from} into {target_name}. Reply with the translation \
             only: no quotes, notes or alternatives. Keep Bible references, names and numbers as they are. \
             If the text is already in {target_name}, reply with it unchanged."
        ) }] },
        "contents": [{ "role": "user", "parts": [{ "text": text }] }],
        "generationConfig": { "temperature": 0, "maxOutputTokens": 512 }
    }))
}

pub fn parse_reply(reply: &Value) -> Result<String, String> {
    if let Some(message) = reply.pointer("/error/message").and_then(Value::as_str) {
        return Err(format!("Gemini could not translate: {message}"));
    }
    let text: String = reply
        .pointer("/candidates/0/content/parts")
        .and_then(Value::as_array)
        .map(|parts| parts.iter().filter_map(|p| p.get("text").and_then(Value::as_str)).collect())
        .unwrap_or_default();
    let text = text.trim().trim_matches('"').trim().to_string();
    if text.is_empty() {
        return Err("Gemini returned no translation.".into());
    }
    Ok(text)
}

pub async fn translate(api_key: &str, model: &str, text: &str, source: Option<&str>, target: &str) -> Result<String, String> {
    let body = request_body(text, source, target)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;
    let url = format!("https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent");
    let response = client
        .post(url)
        // In a header, not the URL, so the key never lands in a proxy's request log.
        .header("x-goog-api-key", api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                "Translation took too long; check the internet connection.".to_string()
            } else {
                format!("Could not reach Gemini: {}", e.without_url())
            }
        })?;
    let reply: Value = response.json().await.map_err(|e| e.without_url().to_string())?;
    parse_reply(&reply)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn asks_for_the_translation_alone_and_names_both_languages() {
        let body = request_body("For God so loved the world", Some("en"), "fr").unwrap();
        let instruction = body.pointer("/systemInstruction/parts/0/text").unwrap().as_str().unwrap();
        assert!(instruction.contains("from English into French"));
        assert!(instruction.contains("Keep Bible references"));
        assert_eq!(body.pointer("/contents/0/parts/0/text").unwrap(), "For God so loved the world");
        assert_eq!(body.pointer("/generationConfig/temperature").unwrap(), 0);
    }

    #[test]
    fn refuses_a_language_it_does_not_offer() {
        assert!(request_body("text", None, "xx").is_err());
    }

    #[test]
    fn reads_the_translation_and_reports_errors() {
        let ok = json!({ "candidates": [{ "content": { "parts": [{ "text": "\"Car Dieu a tant aimé le monde\"\n" }] } }] });
        assert_eq!(parse_reply(&ok).unwrap(), "Car Dieu a tant aimé le monde");
        let bad = json!({ "error": { "code": 400, "message": "API key not valid." } });
        assert!(parse_reply(&bad).unwrap_err().contains("API key not valid"));
        assert!(parse_reply(&json!({ "candidates": [] })).is_err());
    }
}
