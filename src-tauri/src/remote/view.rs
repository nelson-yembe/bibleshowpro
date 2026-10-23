//! What phones see: the live scene reduced to its words. Themes, backgrounds and local
//! file paths never leave the projection PC.

use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, Serialize, PartialEq, Default)]
pub struct PhoneVerse {
    pub n: i64,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Default)]
pub struct PhoneView {
    /// "scripture" | "lyrics" | "text" | "countdown" | "idle"
    pub kind: &'static str,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub title: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub reference: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub translation: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub verses: Vec<PhoneVerse>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub lines: Vec<String>,
    /// Second translation of a side-by-side comparison.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comparison: Option<Comparison>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Comparison {
    pub translation: String,
    pub text: String,
}

fn text(content: &Value, key: &str) -> String {
    content.get(key).and_then(Value::as_str).unwrap_or("").trim().to_string()
}

fn lines(body: &str) -> Vec<String> {
    body.lines().map(str::trim).filter(|l| !l.is_empty()).map(str::to_string).collect()
}

fn verses(content: &Value) -> Vec<PhoneVerse> {
    content
        .get("verses")
        .and_then(Value::as_array)
        .map(|verses| {
            verses
                .iter()
                .filter_map(|v| {
                    Some(PhoneVerse {
                        n: v.get("verse")?.as_i64()?,
                        text: v.get("text")?.as_str()?.trim().to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

pub fn phone_view(scene: Option<&Value>) -> PhoneView {
    let idle = PhoneView { kind: "idle", ..Default::default() };
    let Some(scene) = scene else { return idle };
    let kind = scene.get("type").and_then(Value::as_str).unwrap_or("");
    let empty = Value::Null;
    let content = scene.get("content").unwrap_or(&empty);

    match kind {
        "scripture_fullscreen" | "scripture_lower_third" | "scripture_comparison" => {
            let verses = verses(content);
            let comparison_text = text(content, "comparisonBody");
            PhoneView {
                kind: "scripture",
                reference: text(content, "reference"),
                translation: text(content, "translationAbbr"),
                lines: if verses.is_empty() { lines(&text(content, "body")) } else { Vec::new() },
                verses,
                comparison: (!comparison_text.is_empty()).then(|| Comparison {
                    translation: content
                        .pointer("/comparisonVerse/translation_abbr")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string(),
                    text: comparison_text,
                }),
                ..Default::default()
            }
        }
        "song_lyrics" => PhoneView {
            kind: "lyrics",
            title: text(content, "title"),
            lines: lines(&text(content, "body")),
            ..Default::default()
        },
        "announcement" => PhoneView {
            kind: "text",
            title: text(content, "title"),
            lines: lines(&text(content, "body")),
            ..Default::default()
        },
        "speaker_lower_third" => PhoneView {
            kind: "text",
            title: text(content, "speakerName"),
            lines: lines(&text(content, "speakerTitle")),
            ..Default::default()
        },
        "countdown" => PhoneView { kind: "countdown", title: text(content, "title"), ..Default::default() },
        _ => idle,
    }
}

/// The caption lines the projector would show, or nothing while captions are off.
pub fn caption_text(snapshot: &Value) -> Option<String> {
    if !snapshot.pointer("/settings/enabled").and_then(Value::as_bool).unwrap_or(false) {
        return None;
    }
    let mut parts: Vec<&str> = snapshot
        .get("finalLines")
        .and_then(Value::as_array)
        .map(|l| l.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();
    let keep = parts.len().saturating_sub(2);
    parts.drain(..keep);
    if let Some(partial) = snapshot.get("partial").and_then(Value::as_str) {
        parts.push(partial);
    }
    let text = parts.iter().map(|p| p.trim()).filter(|p| !p.is_empty()).collect::<Vec<_>>().join(" ");
    (!text.is_empty()).then_some(text)
}

/// The newest translated caption line, while captions and translation are on.
pub fn caption_translation(snapshot: &Value) -> Option<String> {
    if !snapshot.pointer("/settings/enabled").and_then(Value::as_bool).unwrap_or(false) {
        return None;
    }
    snapshot
        .get("translatedLines")
        .and_then(Value::as_array)
        .and_then(|lines| lines.last())
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn scripture_keeps_the_words_and_drops_theme_and_paths() {
        let scene = json!({
            "id": "x",
            "type": "scripture_fullscreen",
            "content": {
                "reference": "John 3:16-17",
                "translationAbbr": "KJV",
                "body": "[16] For God so loved…",
                "verses": [
                    { "verse": 16, "text": "For God so loved the world", "reference": "John 3:16" },
                    { "verse": 17, "text": "For God sent not his Son", "reference": "John 3:17" }
                ]
            },
            "theme": { "backgroundImage": "C:\\Users\\pastor\\Pictures\\bg.jpg" }
        });
        let view = phone_view(Some(&scene));
        assert_eq!(view.kind, "scripture");
        assert_eq!(view.reference, "John 3:16-17");
        assert_eq!(view.verses, vec![
            PhoneVerse { n: 16, text: "For God so loved the world".into() },
            PhoneVerse { n: 17, text: "For God sent not his Son".into() },
        ]);
        assert!(!serde_json::to_string(&view).unwrap().contains("Pictures"));
    }

    #[test]
    fn lyrics_become_lines() {
        let scene = json!({ "type": "song_lyrics", "content": { "title": "Amazing Grace", "body": "Amazing grace\n\nhow sweet the sound" } });
        let view = phone_view(Some(&scene));
        assert_eq!((view.kind, view.title.as_str()), ("lyrics", "Amazing Grace"));
        assert_eq!(view.lines, vec!["Amazing grace", "how sweet the sound"]);
    }

    #[test]
    fn pictures_blank_and_nothing_are_idle() {
        for kind in ["image", "video", "blank", "blackout", "logo"] {
            let scene = json!({ "type": kind, "content": { "imagePath": "C:\\media\\x.png" } });
            assert_eq!(phone_view(Some(&scene)).kind, "idle");
        }
        assert_eq!(phone_view(None).kind, "idle");
    }

    #[test]
    fn captions_follow_the_operator_switch() {
        let on = json!({ "settings": { "enabled": true }, "finalLines": ["one", "two", "three"], "partial": "four" });
        assert_eq!(caption_text(&on).as_deref(), Some("two three four"));
        let off = json!({ "settings": { "enabled": false }, "finalLines": ["one"], "partial": "" });
        assert_eq!(caption_text(&off), None);
    }

    #[test]
    fn phones_get_the_newest_translated_line() {
        let on = json!({ "settings": { "enabled": true }, "translatedLines": ["Dieu est amour.", "Car Dieu a tant aimé le monde"] });
        assert_eq!(caption_translation(&on).as_deref(), Some("Car Dieu a tant aimé le monde"));
        assert_eq!(caption_translation(&json!({ "settings": { "enabled": true } })), None);
    }
}
