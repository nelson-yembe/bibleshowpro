use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::bible::books::{max_chapters_for_book, resolve_book};
use crate::bible::parser::ParsedReference;

static SPOKEN_CHAPTER_VERSE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)(?P<book>(?:[1-3]\s+|first\s+|second\s+|third\s+)?[a-z]+(?:\s+(?:of\s+)?[a-z]+)*)\s*,?\s*chapter\s+(?P<chapter>\d+)\s*,?\s*(?:verse|verses)\s+(?P<verse>\d+)(?:\s*(?:-|through|to)\s*(?P<verse_end>\d+))?",
    )
    .unwrap()
});

static STANDARD_REF: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)(?:\b(?:turn\s+(?:with\s+me\s+to|to)|read(?:ing)?\s+(?:from\s+)?|in\s+|from\s+))?(?P<book>(?:[1-3]\s+|first\s+|second\s+|third\s+)?[a-z]+(?:\s+(?:of\s+)?[a-z]+)*)\.?\s+(?P<chapter>\d+)\s*:\s*(?P<verse>\d+)(?:\s*(?:-|through|to)\s*(?P<verse_end>\d+))?",
    )
    .unwrap()
});

static VERSE_AFTER_CHAPTER: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)(?P<book>(?:[1-3]\s+|first\s+|second\s+|third\s+)?[a-z]+(?:\s+(?:of\s+)?[a-z]+)*)\.?\s+(?P<chapter>\d+)\s+(?:verse|verses)\s+(?P<verse>\d+)(?:\s*(?:-|through|to)\s*(?P<verse_end>\d+))?",
    )
    .unwrap()
});

static SPACED_CHAPTER_VERSE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)(?:\b(?:turn\s+(?:with\s+me\s+to|to)|read(?:ing)?\s+(?:from\s+)?|in\s+|from\s+|let(?:'s|'s)\s+read\s+))?(?P<book>(?:[1-3]\s+|first\s+|second\s+|third\s+)?[a-z]+(?:\s+(?:of\s+)?[a-z]+)*)\.?\s+(?P<chapter>\d+)\s+(?P<verse>\d+)(?:\s*(?:-|through|to)\s*(?P<verse_end>\d+))?",
    )
    .unwrap()
});

static CHAPTER_THEN_VERSE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)(?P<book>(?:[1-3]\s+|first\s+|second\s+|third\s+)?[a-z]+(?:\s+(?:of\s+)?[a-z]+)*)\s*,?\s*chapter\s+(?P<chapter>\d+)\s+(?P<verse>\d+)(?:\s*(?:-|through|to)\s*(?P<verse_end>\d+))?",
    )
    .unwrap()
});

static MERGED_DIGITS: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)(?P<book>(?:[1-3]\s+|first\s+|second\s+|third\s+)?[a-z]+(?:\s+(?:of\s+)?[a-z]+)*)\.?\s*(?P<digits>\d{3,4})(?:\.\s*|$|\s)",
    )
    .unwrap()
});

static CHAPTER_RANGE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)(?P<book>(?:[1-3]\s+|first\s+|second\s+|third\s+)?[a-z]+(?:\s+(?:of\s+)?[a-z]+)*)\s*,?\s*chapter\s+(?P<chapter_start>\d+)\s*(?:-|through|to)\s*(?P<chapter_end>\d+)",
    )
    .unwrap()
});

static CHAPTER_ONLY: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)(?:\b(?:turn\s+(?:with\s+me\s+to|to)|read(?:ing)?\s+(?:from\s+)?|in\s+|from\s+))?(?P<book>(?:[1-3]\s+|first\s+|second\s+|third\s+)?[a-z]+(?:\s+(?:of\s+)?[a-z]+)*)\.?\s*(?:,\s*)?(?:chapter\s+)?(?P<chapter>\d{1,3})",
    )
    .unwrap()
});

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ScriptureDetectionMatch {
    pub matched_text: String,
    pub normalized_reference: String,
    pub parsed: ParsedReference,
    pub confidence: f32,
    pub detection_type: String,
}

fn normalize_book_prefix(raw: &str) -> String {
    raw.trim()
        .trim_matches(',')
        .trim()
        .to_lowercase()
        .replace("first ", "1 ")
        .replace("second ", "2 ")
        .replace("third ", "3 ")
}

fn build_reference(book_name: &str, chapter: i32, verse_start: Option<i32>, verse_end: Option<i32>) -> String {
    match verse_start {
        Some(start) => {
            if let Some(end) = verse_end.filter(|&e| e != start) {
                format!("{book_name} {chapter}:{start}-{end}")
            } else {
                format!("{book_name} {chapter}:{start}")
            }
        }
        None => format!("{book_name} {chapter}"),
    }
}

fn confidence_for(chapter: i32, verse_start: Option<i32>, spoken: bool) -> f32 {
    if verse_start.is_some() && !spoken {
        0.95
    } else if verse_start.is_some() {
        0.85
    } else if chapter > 0 {
        0.7
    } else {
        0.5
    }
}

fn parse_capture(
    book_raw: &str,
    chapter: i32,
    verse_start: Option<i32>,
    verse_end: Option<i32>,
    matched_text: &str,
    spoken: bool,
) -> Option<ScriptureDetectionMatch> {
    let book_key = normalize_book_prefix(book_raw);
    let (book_number, book_name) = resolve_book(&book_key)?;

    let max_ch = max_chapters_for_book(book_number);
    let (chapter, verse_start, verse_end) = if chapter > max_ch && verse_start.is_none() {
        if let Some((split_ch, split_vs)) = split_merged_digits(&chapter.to_string()) {
            if split_ch <= max_ch {
                (split_ch, Some(split_vs), verse_end.or(Some(split_vs)))
            } else {
                return None;
            }
        } else {
            return None;
        }
    } else if chapter > max_ch {
        return None;
    } else {
        (chapter, verse_start, verse_end)
    };

    if let Some(vs) = verse_start {
        if vs < 1 || vs > 200 {
            return None;
        }
    }

    let parsed = ParsedReference {
        book_number,
        book_name: book_name.to_string(),
        chapter,
        verse_start,
        verse_end: verse_end.or(verse_start),
    };
    let normalized_reference = build_reference(book_name, chapter, verse_start, verse_end);
    Some(ScriptureDetectionMatch {
        matched_text: matched_text.to_string(),
        normalized_reference,
        parsed,
        confidence: confidence_for(chapter, verse_start, spoken),
        detection_type: "explicit".to_string(),
    })
}

/// Convert spoken word numbers and strip punctuation so STT output matches our parsers.
fn preprocess_spoken_text(text: &str) -> String {
    let mut s = text.to_lowercase();
    s = s.replace(',', " ");
    s = s.replace('.', " ");
    // Keep numeric ranges like "1-2"; only split spoken compounds such as "forty-seven".
    {
        let chars: Vec<char> = s.chars().collect();
        let mut out = String::with_capacity(s.len());
        for (i, ch) in chars.iter().enumerate() {
            if *ch == '-' {
                let prev_digit = i > 0 && chars[i - 1].is_ascii_digit();
                let next_digit = i + 1 < chars.len() && chars[i + 1].is_ascii_digit();
                if prev_digit && next_digit {
                    out.push('-');
                } else {
                    out.push(' ');
                }
            } else {
                out.push(*ch);
            }
        }
        s = out;
    }

    let fillers = [
        "turn with me to ",
        "turn to ",
        "reading from ",
        "reading ",
        "read from ",
        "read ",
        "the scripture ",
        "scripture ",
        "the bible ",
        "bible ",
    ];
    for filler in fillers {
        if let Some(rest) = s.strip_prefix(filler) {
            s = rest.to_string();
            break;
        }
    }

    if let Some(rest) = s.strip_prefix("scripture") {
        if rest.starts_with(|c: char| c.is_ascii_alphabetic()) {
            s = rest.to_string();
        }
    }
    if let Some(rest) = s.strip_prefix("bible") {
        if rest.starts_with(|c: char| c.is_ascii_alphabetic()) {
            s = rest.to_string();
        }
    }

    s = s.replace(" join ", " john ");
    if s == "join" {
        s = "john".to_string();
    } else if s.starts_with("join ") {
        s = format!("john {}", &s[5..]);
    }

    const WORDS: &[(&str, &str)] = &[
        ("twenty first", "21"),
        ("twenty second", "22"),
        ("twenty third", "23"),
        ("twenty fourth", "24"),
        ("twenty fifth", "25"),
        ("twenty sixth", "26"),
        ("twenty seventh", "27"),
        ("twenty eighth", "28"),
        ("twenty ninth", "29"),
        ("thirty first", "31"),
        ("twenty", "20"),
        ("thirty", "30"),
        ("forty", "40"),
        ("fifty", "50"),
        ("fourteen", "14"),
        ("fifteen", "15"),
        ("sixteen", "16"),
        ("seventeen", "17"),
        ("eighteen", "18"),
        ("nineteen", "19"),
        ("thirteen", "13"),
        ("twelve", "12"),
        ("eleven", "11"),
        ("ten", "10"),
        ("first", "1"),
        ("second", "2"),
        ("third", "3"),
        ("fourth", "4"),
        ("fifth", "5"),
        ("sixth", "6"),
        ("seventh", "7"),
        ("eighth", "8"),
        ("ninth", "9"),
        ("one", "1"),
        ("two", "2"),
        ("three", "3"),
        ("four", "4"),
        ("five", "5"),
        ("six", "6"),
        ("seven", "7"),
        ("eight", "8"),
        ("nine", "9"),
    ];

    for (word, num) in WORDS {
        s = s.replace(word, num);
    }

    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Split merged STT digits like "514" into chapter 5 verse 14.
fn split_merged_digits(digits: &str) -> Option<(i32, i32)> {
    let len = digits.len();
    if !(2..=4).contains(&len) {
        return None;
    }

    let mut candidates: Vec<(usize, i32, i32)> = Vec::new();
    for split_at in 1..len {
        let Ok(chapter) = digits[..split_at].parse::<i32>() else {
            continue;
        };
        let Ok(verse) = digits[split_at..].parse::<i32>() else {
            continue;
        };
        if (1..=150).contains(&chapter) && (1..=200).contains(&verse) {
            candidates.push((split_at, chapter, verse));
        }
    }

    candidates.sort_by_key(|(split_at, chapter, _)| (*split_at, *chapter));
    candidates.first().map(|(_, chapter, verse)| (*chapter, *verse))
}

fn text_has_spoken_chapter_verse(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    lower.contains("chapter") || lower.contains("verse") || lower.contains("verses")
}

fn collect_from_patterns(text: &str, matches: &mut Vec<ScriptureDetectionMatch>) {
    for caps in SPOKEN_CHAPTER_VERSE.captures_iter(text) {
        let Some(book_raw) = caps.name("book").map(|m| m.as_str()) else {
            continue;
        };
        let Some(chapter) = caps.name("chapter").and_then(|m| m.as_str().parse().ok()) else {
            continue;
        };
        let verse_start = caps.name("verse").and_then(|m| m.as_str().parse().ok());
        let verse_end = caps.name("verse_end").and_then(|m| m.as_str().parse().ok());
        let matched = caps.get(0).map(|m| m.as_str().trim()).unwrap_or("");
        if let Some(found) = parse_capture(book_raw, chapter, verse_start, verse_end, matched, true) {
            matches.push(found);
        }
    }

    for caps in STANDARD_REF.captures_iter(text) {
        let Some(book_raw) = caps.name("book").map(|m| m.as_str()) else {
            continue;
        };
        let Some(chapter) = caps.name("chapter").and_then(|m| m.as_str().parse().ok()) else {
            continue;
        };
        let verse_start = caps.name("verse").and_then(|m| m.as_str().parse().ok());
        let verse_end = caps.name("verse_end").and_then(|m| m.as_str().parse().ok());
        let matched = caps.get(0).map(|m| m.as_str().trim()).unwrap_or("");
        if let Some(found) = parse_capture(book_raw, chapter, verse_start, verse_end, matched, false) {
            matches.push(found);
        }
    }

    for caps in VERSE_AFTER_CHAPTER.captures_iter(text) {
        let Some(book_raw) = caps.name("book").map(|m| m.as_str()) else {
            continue;
        };
        let Some(chapter) = caps.name("chapter").and_then(|m| m.as_str().parse().ok()) else {
            continue;
        };
        let verse_start = caps.name("verse").and_then(|m| m.as_str().parse().ok());
        let verse_end = caps.name("verse_end").and_then(|m| m.as_str().parse().ok());
        let matched = caps.get(0).map(|m| m.as_str().trim()).unwrap_or("");
        if let Some(found) = parse_capture(book_raw, chapter, verse_start, verse_end, matched, true) {
            matches.push(found);
        }
    }

    for caps in SPACED_CHAPTER_VERSE.captures_iter(text) {
        let Some(book_raw) = caps.name("book").map(|m| m.as_str()) else {
            continue;
        };
        let Some(chapter) = caps.name("chapter").and_then(|m| m.as_str().parse().ok()) else {
            continue;
        };
        let verse_start = caps.name("verse").and_then(|m| m.as_str().parse().ok());
        let verse_end = caps.name("verse_end").and_then(|m| m.as_str().parse().ok());
        let matched = caps.get(0).map(|m| m.as_str().trim()).unwrap_or("");
        if let Some(found) = parse_capture(book_raw, chapter, verse_start, verse_end, matched, true) {
            matches.push(found);
        }
    }

    for caps in CHAPTER_RANGE.captures_iter(text) {
        let Some(book_raw) = caps.name("book").map(|m| m.as_str()) else {
            continue;
        };
        let Some(chapter_start) = caps.name("chapter_start").and_then(|m| m.as_str().parse().ok()) else {
            continue;
        };
        let Some(chapter_end) = caps
            .name("chapter_end")
            .and_then(|m| m.as_str().parse::<i32>().ok())
        else {
            continue;
        };
        let matched = caps.get(0).map(|m| m.as_str().trim()).unwrap_or("");
        let book_key = normalize_book_prefix(book_raw);
        let (book_number, book_name) = match resolve_book(&book_key) {
            Some(v) => v,
            None => continue,
        };
        let parsed = ParsedReference {
            book_number,
            book_name: book_name.to_string(),
            chapter: chapter_start,
            verse_start: None,
            verse_end: None,
        };
        let normalized_reference = if chapter_end != chapter_start {
            format!("{book_name} {chapter_start}-{chapter_end}")
        } else {
            format!("{book_name} {chapter_start}")
        };
        matches.push(ScriptureDetectionMatch {
            matched_text: matched.to_string(),
            normalized_reference,
            parsed,
            confidence: 0.75,
            detection_type: "explicit".to_string(),
        });
    }

    for caps in CHAPTER_THEN_VERSE.captures_iter(text) {
        let Some(book_raw) = caps.name("book").map(|m| m.as_str()) else {
            continue;
        };
        let Some(chapter) = caps.name("chapter").and_then(|m| m.as_str().parse().ok()) else {
            continue;
        };
        let verse_start = caps.name("verse").and_then(|m| m.as_str().parse().ok());
        let verse_end = caps.name("verse_end").and_then(|m| m.as_str().parse().ok());
        let matched = caps.get(0).map(|m| m.as_str().trim()).unwrap_or("");
        if let Some(found) = parse_capture(book_raw, chapter, verse_start, verse_end, matched, true) {
            matches.push(found);
        }
    }

    if !text_has_spoken_chapter_verse(text) {
        for caps in MERGED_DIGITS.captures_iter(text) {
        let Some(book_raw) = caps.name("book").map(|m| m.as_str()) else {
            continue;
        };
        let Some(digits) = caps.name("digits").map(|m| m.as_str()) else {
            continue;
        };
        let Some((chapter, verse)) = split_merged_digits(digits) else {
            continue;
        };
        let matched = caps.get(0).map(|m| m.as_str().trim()).unwrap_or("");
        if let Some(found) = parse_capture(book_raw, chapter, Some(verse), None, matched, true) {
            matches.push(found);
        }
        }
    }

    for caps in CHAPTER_ONLY.captures_iter(text) {
        let Some(book_raw) = caps.name("book").map(|m| m.as_str()) else {
            continue;
        };
        let Some(chapter) = caps.name("chapter").and_then(|m| m.as_str().parse().ok()) else {
            continue;
        };
        let Some(full) = caps.get(0) else {
            continue;
        };
        let tail = text[full.end()..].trim_start();
        if tail.starts_with(':')
            || tail.to_ascii_lowercase().starts_with("verse")
            || tail.to_ascii_lowercase().starts_with("verses")
            || tail.to_ascii_lowercase().starts_with("chapter")
            || tail.chars().next().is_some_and(|c| c.is_ascii_digit())
        {
            continue;
        }
        let matched = full.as_str().trim();
        if let Some(found) = parse_capture(book_raw, chapter, None, None, matched, false) {
            matches.push(found);
        }
    }
}

pub fn detect_references_in_text(text: &str) -> Vec<ScriptureDetectionMatch> {
    let mut matches = Vec::new();
    let preprocessed = preprocess_spoken_text(text);

    collect_from_patterns(text, &mut matches);
    if preprocessed != text.to_lowercase() {
        collect_from_patterns(&preprocessed, &mut matches);
    }
    if matches.is_empty() && !preprocessed.is_empty() {
        collect_from_patterns(&preprocessed, &mut matches);
    }

    dedupe_matches(matches)
}

fn dedupe_matches(matches: Vec<ScriptureDetectionMatch>) -> Vec<ScriptureDetectionMatch> {
    let mut out: Vec<ScriptureDetectionMatch> = Vec::new();
    for m in matches {
        if let Some(idx) = out
            .iter()
            .position(|e| e.normalized_reference == m.normalized_reference)
        {
            if m.confidence > out[idx].confidence {
                out[idx] = m;
            }
        } else {
            out.push(m);
        }
    }
    out.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap_or(std::cmp::Ordering::Equal));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_inline_john_3_16() {
        let found = detect_references_in_text("Let's read John 3:16 together today.");
        assert!(!found.is_empty());
        assert_eq!(found[0].normalized_reference, "John 3:16");
    }

    #[test]
    fn detects_spoken_romans_reference() {
        let found = detect_references_in_text("Turn with me to Romans chapter 8 verse 28.");
        assert!(!found.is_empty());
        assert_eq!(found[0].normalized_reference, "Romans 8:28");
    }

    #[test]
    fn detects_matthew_chapter_verse_with_commas() {
        let found = detect_references_in_text("Matthew chapter 5, verse 14.");
        assert!(!found.is_empty());
        assert_eq!(found[0].normalized_reference, "Matthew 5:14");
    }

    #[test]
    fn detects_merged_matthew_514() {
        let found = detect_references_in_text("Matthew 514.");
        assert!(!found.is_empty());
        assert_eq!(found[0].normalized_reference, "Matthew 5:14");
    }

    #[test]
    fn detects_lamentation_spoken_words() {
        let found = detect_references_in_text("Lamentation, chapter 2, verse one.");
        assert!(!found.is_empty());
        assert_eq!(found[0].normalized_reference, "Lamentations 2:1");
    }

    #[test]
    fn detects_nations_as_numbers() {
        let found = detect_references_in_text("Nations, chapter 2, verse one.");
        assert!(!found.is_empty());
        assert_eq!(found[0].normalized_reference, "Numbers 2:1");
    }

    #[test]
    fn detects_first_corinthians() {
        let found = detect_references_in_text("First Corinthians 13 is about love.");
        assert!(!found.is_empty());
        assert_eq!(found[0].parsed.book_name, "1 Corinthians");
    }

    #[test]
    fn detects_psalm_chapter_only() {
        let found = detect_references_in_text("We will read Psalm 23 this morning.");
        assert!(!found.is_empty());
        assert_eq!(found[0].normalized_reference, "Psalms 23");
    }

    #[test]
    fn detects_spaced_chapter_verse() {
        let found = detect_references_in_text("Let's read Romans 8 28 this morning.");
        assert!(!found.is_empty());
        assert_eq!(found[0].normalized_reference, "Romans 8:28");
    }

    #[test]
    fn detects_john_3_16_without_colon() {
        let found = detect_references_in_text("Open your Bibles to John 3 16");
        assert!(!found.is_empty());
        assert_eq!(found[0].normalized_reference, "John 3:16");
    }

    #[test]
    fn detects_scripture_prefix_glued_to_book() {
        let found = detect_references_in_text("ScriptureJohn chapter 5, verse 2.");
        assert!(!found.is_empty());
        assert_eq!(found[0].normalized_reference, "John 5:2");
    }

    #[test]
    fn detects_join_as_john() {
        let found = detect_references_in_text("Join chapter 3, verse 16.");
        assert!(!found.is_empty());
        assert_eq!(found[0].normalized_reference, "John 3:16");
    }

    #[test]
    fn detects_genesis_chapter_range() {
        let found = detect_references_in_text("Genesis chapter 1-2.");
        assert!(!found.is_empty());
        assert_eq!(found[0].normalized_reference, "Genesis 1-2");
    }

    #[test]
    fn detects_proverbs_chapter_4_verse_7() {
        let found = detect_references_in_text("Proverbs chapter 4 verse 7.");
        assert!(!found.is_empty());
        assert_eq!(found[0].normalized_reference, "Proverbs 4:7");
    }

    #[test]
    fn reinterprets_proverbs_47_as_chapter_4_verse_7() {
        let found = detect_references_in_text("Proverbs 47.");
        assert!(!found.is_empty());
        assert_eq!(found[0].normalized_reference, "Proverbs 4:7");
    }

    #[test]
    fn reinterprets_matthew_48_as_chapter_4_verse_8() {
        let found = detect_references_in_text("Matthew 48.");
        assert!(!found.is_empty());
        assert_eq!(found[0].normalized_reference, "Matthew 4:8");
    }

    #[test]
    fn detects_chapter_then_verse_without_verse_word() {
        let found = detect_references_in_text("Matthew chapter 4 8.");
        assert!(!found.is_empty());
        assert_eq!(found[0].normalized_reference, "Matthew 4:8");
    }
}
