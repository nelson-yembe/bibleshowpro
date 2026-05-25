use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::bible::books::resolve_book;

static REF_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)^\s*(?<book>(?:[1-3]\s+)?[a-z]+(?:\s+(?:of\s+)?[a-z]+)*)\.?\s+(?<chapter>\d+)(?::(?<start>\d+)(?:-(?<end>\d+))?)?\s*$",
    )
    .unwrap()
});

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ParsedReference {
    pub book_number: i32,
    pub book_name: String,
    pub chapter: i32,
    pub verse_start: Option<i32>,
    pub verse_end: Option<i32>,
}

pub fn parse_reference(input: &str) -> Option<ParsedReference> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }

    let caps = REF_PATTERN.captures(trimmed)?;
    let book_raw = caps.name("book")?.as_str().trim();
    let (book_number, book_name) = resolve_book(book_raw)?;

    let chapter: i32 = caps.name("chapter")?.as_str().parse().ok()?;
    let verse_start = caps.name("start").and_then(|m| m.as_str().parse().ok());
    let verse_end = caps
        .name("end")
        .and_then(|m| m.as_str().parse().ok())
        .or(verse_start);

    Some(ParsedReference {
        book_number,
        book_name: book_name.to_string(),
        chapter,
        verse_start,
        verse_end,
    })
}

pub fn suggest_references(input: &str) -> Vec<String> {
    let trimmed = input.trim().to_lowercase();
    if trimmed.is_empty() {
        return vec![];
    }

    let suggestions = [
        "John 3:16",
        "John 3:16-18",
        "Psalm 23",
        "Romans 8:28",
        "Genesis 1:1",
        "Matthew 5:3",
        "1 Corinthians 13:4",
    ];

    suggestions
        .iter()
        .filter(|s| {
            s.to_lowercase().contains(&trimmed)
                || trimmed.contains(&s.to_lowercase()[..2.min(s.len())])
        })
        .map(|s| s.to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_john_3_16() {
        let parsed = parse_reference("John 3:16").unwrap();
        assert_eq!(parsed.book_number, 43);
        assert_eq!(parsed.chapter, 3);
        assert_eq!(parsed.verse_start, Some(16));
    }

    #[test]
    fn parses_abbreviated_reference() {
        let parsed = parse_reference("Jn 3:16-18").unwrap();
        assert_eq!(parsed.verse_start, Some(16));
        assert_eq!(parsed.verse_end, Some(18));
    }

    #[test]
    fn parses_chapter_only() {
        let parsed = parse_reference("Psalm 23").unwrap();
        assert_eq!(parsed.book_number, 19);
        assert_eq!(parsed.chapter, 23);
        assert_eq!(parsed.verse_start, None);
    }

    #[test]
    fn parses_numbered_book() {
        let parsed = parse_reference("1 Corinthians 13:4").unwrap();
        assert_eq!(parsed.book_number, 46);
        assert_eq!(parsed.book_name, "1 Corinthians");
    }

    #[test]
    fn parses_song_of_solomon() {
        let parsed = parse_reference("Song of Solomon 1:1").unwrap();
        assert_eq!(parsed.book_number, 22);
    }
}
