use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SearchOptions {
    pub exact_phrase: bool,
    pub match_all_words: bool,
}

impl Default for SearchOptions {
    fn default() -> Self {
        Self {
            exact_phrase: true,
            match_all_words: true,
        }
    }
}

pub fn tokenize_query(query: &str) -> Vec<String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return vec![];
    }

    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut in_quote = false;

    for c in trimmed.chars() {
        match c {
            '"' => {
                if in_quote {
                    push_token(&mut tokens, &current);
                    current.clear();
                    in_quote = false;
                } else {
                    flush_whitespace_tokens(&mut tokens, &mut current);
                    in_quote = true;
                }
            }
            ch if ch.is_whitespace() && !in_quote => {
                push_token(&mut tokens, &current);
                current.clear();
            }
            _ => current.push(c),
        }
    }

    push_token(&mut tokens, &current);
    tokens
}

fn flush_whitespace_tokens(tokens: &mut Vec<String>, current: &mut String) {
    if current.is_empty() {
        return;
    }
    for part in current.split_whitespace() {
        push_token(tokens, part);
    }
    current.clear();
}

fn push_token(tokens: &mut Vec<String>, raw: &str) {
    let cleaned = clean_token(raw);
    if !cleaned.is_empty() {
        tokens.push(cleaned);
    }
}

fn clean_token(raw: &str) -> String {
    raw.trim()
        .trim_matches(|c: char| !c.is_alphanumeric() && c != '\'')
        .to_string()
}

fn escape_fts_token(token: &str) -> String {
    token.replace('"', "\"\"")
}

pub fn build_fts_query(tokens: &[String], opts: &SearchOptions) -> Option<String> {
    if tokens.is_empty() {
        return None;
    }

    if opts.exact_phrase {
        if tokens.len() == 1 {
            return Some(format!("{}*", escape_fts_token(&tokens[0])));
        }

        let phrase = tokens
            .iter()
            .map(|t| escape_fts_token(t))
            .collect::<Vec<_>>()
            .join(" ");
        let near_terms = phrase.clone();
        let distance = (tokens.len() * 5).max(15);
        return Some(format!("\"{phrase}\" OR NEAR({near_terms}, {distance})"));
    }

    if tokens.len() == 1 {
        return Some(format!("{}*", escape_fts_token(&tokens[0])));
    }

    let parts: Vec<String> = tokens
        .iter()
        .map(|t| format!("{}*", escape_fts_token(t)))
        .collect();

    Some(if opts.match_all_words {
        parts.join(" AND ")
    } else {
        parts.join(" OR ")
    })
}

pub fn build_relaxed_fts_query(tokens: &[String]) -> Option<String> {
    if tokens.is_empty() {
        return None;
    }

    Some(
        tokens
            .iter()
            .map(|t| format!("{}*", escape_fts_token(t)))
            .collect::<Vec<_>>()
            .join(" AND "),
    )
}

pub fn normalize_match_text(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c.is_whitespace() {
                c
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn score_verse_match(text: &str, tokens: &[String], opts: &SearchOptions) -> Option<i32> {
    if tokens.is_empty() {
        return None;
    }

    let normalized = normalize_match_text(text);
    if normalized.is_empty() {
        return None;
    }

    if opts.exact_phrase {
        let phrase = tokens.join(" ");
        if let Some(pos) = normalized.find(&phrase) {
            return Some(pos as i32);
        }

        let mut search_from = 0usize;
        let mut last_pos = 0i32;
        let mut all_found = true;
        for token in tokens {
            let token_norm = normalize_match_text(token);
            if let Some(rel) = normalized[search_from..].find(&token_norm) {
                let pos = search_from + rel;
                last_pos = last_pos.saturating_add((pos - search_from) as i32);
                search_from = pos + token_norm.len();
            } else {
                all_found = false;
                break;
            }
        }
        if all_found {
            return Some(1_000 + last_pos);
        }
        return None;
    }

    let mut matched = 0usize;
    let mut first_pos = i32::MAX;
    for token in tokens {
        let token_norm = normalize_match_text(token);
        if let Some(pos) = normalized.find(&token_norm) {
            matched += 1;
            first_pos = first_pos.min(pos as i32);
        }
    }

    if opts.match_all_words {
        if matched == tokens.len() {
            return Some(2_000 + first_pos);
        }
        return None;
    }

    if matched > 0 {
        return Some(3_000 + first_pos + ((tokens.len() - matched) as i32 * 100));
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokenize_respects_quotes() {
        assert_eq!(
            tokenize_query(r#""God so loved" world"#),
            vec!["God so loved".to_string(), "world".to_string()]
        );
    }

    #[test]
    fn phrase_query_uses_near() {
        let tokens = tokenize_query("God so loved");
        let q = build_fts_query(&tokens, &SearchOptions::default()).unwrap();
        assert!(q.contains("\"God so loved\""));
        assert!(q.contains("NEAR("));
    }

    #[test]
    fn all_words_query_uses_and() {
        let tokens = tokenize_query("faith hope love");
        let q = build_fts_query(
            &tokens,
            &SearchOptions {
                exact_phrase: false,
                match_all_words: true,
            },
        )
        .unwrap();
        assert!(q.contains(" AND "));
    }
}
