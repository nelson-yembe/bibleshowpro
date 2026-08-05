use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::bible::books::{max_chapters_for_book, resolve_book, CANONICAL_BOOKS};
use crate::bible::parser::ParsedReference;
use crate::bible::spoken_number::normalize_spoken_numbers;

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
    // Negative lookahead-free: stop the book token before the words chapter/verse.
    Regex::new(
        r"(?i)(?:\b(?:turn\s+(?:with\s+me\s+to|to)|read(?:ing)?\s+(?:from\s+)?|in\s+|from\s+))?(?P<book>(?:[1-3]\s+|first\s+|second\s+|third\s+)?[a-z]+(?:\s+of\s+[a-z]+)?)\.?\s*(?:,\s*)?(?:chapter\s+)?(?P<chapter>\d{1,3})\b",
    )
    .unwrap()
});

// "the twenty-third psalm" -> (after number folding) "23 psalm" -> Psalm 23.
static ORDINAL_PSALM: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(?P<chapter>\d{1,3})(?:st|nd|rd|th)?\s+psalms?\b").unwrap()
});

// "the third chapter of John" -> (after number folding) "3 chapter of John".
static CHAPTER_OF_BOOK: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)\b(?P<chapter>\d{1,3})(?:st|nd|rd|th)?\s+chapter\s+of\s+(?P<book>(?:[1-3]\s+|first\s+|second\s+|third\s+)?[a-z]+(?:\s+(?:of\s+)?[a-z]+)*?)(?:\s*,?\s*(?:verse|verses)\s+(?P<verse>\d{1,3})(?:\s*(?:-|through|to)\s*(?P<verse_end>\d{1,3}))?)?",
    )
    .unwrap()
});

// Context fallbacks (no book spoken): resolve against the active sermon passage.
static CONTEXT_CHAPTER_VERSE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)\bchapter\s+(?P<chapter>\d{1,3})\s*,?\s*(?:verse|verses)\s+(?P<verse>\d{1,3})(?:\s*(?:-|through|to)\s*(?P<verse_end>\d{1,3}))?",
    )
    .unwrap()
});

static CONTEXT_VERSE_ONLY: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)\b(?:verse|verses)\s+(?P<verse>\d{1,3})(?:\s*(?:-|through|to)\s*(?P<verse_end>\d{1,3}))?",
    )
    .unwrap()
});

static CONTEXT_CHAPTER_ONLY: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\bchapter\s+(?P<chapter>\d{1,3})\b").unwrap()
});

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ScriptureDetectionMatch {
    pub matched_text: String,
    pub normalized_reference: String,
    pub parsed: ParsedReference,
    pub confidence: f32,
    pub detection_type: String,
    /// Other plausible readings the operator can switch to (ambiguous speech).
    #[serde(default)]
    pub alternatives: Vec<String>,
}

/// Optional sermon context so bare references ("verse 16", "chapter 3 verse 16")
/// can resolve against the book/chapter the preacher is currently in.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectionContext {
    pub book_number: i32,
    pub book_name: String,
    pub chapter: Option<i32>,
}

/// How a reference was recognized — drives confidence and ambiguity handling.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MatchKind {
    /// "John 3:16" — explicit colon, highest trust.
    ExplicitColon,
    /// "John chapter 3 verse 16" — explicit chapter/verse words.
    SpokenChapterVerse,
    /// "John 3 16" — two bare numbers, inherently ambiguous.
    Spaced,
    /// "John 316" — merged digits split heuristically.
    Merged,
    /// "John 3" — chapter only.
    ChapterOnly,
    /// "verse 16" / "chapter 3 verse 16" resolved via sermon context.
    Context,
    /// Recovered from ASR book/phrase confusion (e.g. "efficient" → Ephesians).
    /// Shown as a suggestion but must not auto-project.
    SpeechRepaired,
}

fn normalize_book_prefix(raw: &str) -> String {
    let mut s = raw.trim().trim_matches(',').trim().to_lowercase();
    for (from, to) in [
        ("1st ", "1 "),
        ("2nd ", "2 "),
        ("3rd ", "3 "),
        ("first ", "1 "),
        ("second ", "2 "),
        ("third ", "3 "),
    ] {
        if let Some(rest) = s.strip_prefix(from) {
            s = format!("{to}{rest}");
            break;
        }
    }
    s
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

fn has_intro_cue(matched_text: &str) -> bool {
    let lower = matched_text.to_ascii_lowercase();
    ["turn", "read", "open", "let's", "lets", "look at", "go to"]
        .iter()
        .any(|cue| lower.contains(cue))
}

fn confidence_for_kind(kind: MatchKind, verse_start: Option<i32>, has_cue: bool) -> f32 {
    let base: f32 = match kind {
        MatchKind::ExplicitColon => 0.95,
        MatchKind::SpokenChapterVerse => 0.9,
        MatchKind::Spaced => {
            if verse_start.is_some() {
                0.8
            } else {
                0.68
            }
        }
        MatchKind::Merged => 0.78,
        MatchKind::ChapterOnly => 0.68,
        MatchKind::Context => {
            if verse_start.is_some() {
                0.8
            } else {
                0.66
            }
        }
        // Medium — visible in suggestions, never auto-live (non-explicit type).
        MatchKind::SpeechRepaired => 0.74,
    };
    (base + if has_cue { 0.03_f32 } else { 0.0_f32 }).min(0.99)
}

fn detection_type_for_kind(kind: MatchKind) -> &'static str {
    match kind {
        MatchKind::SpeechRepaired => "speech_repaired",
        _ => "explicit",
    }
}

/// For two bare spoken numbers ("Psalm one twenty one" -> "1 21"), the speaker
/// may have meant a single chapter ("Psalm 121"). Offer it when valid.
fn concat_chapter_alternative(
    book_name: &str,
    chapter: i32,
    verse_start: Option<i32>,
    max_ch: i32,
) -> Option<String> {
    let verse = verse_start?;
    let concat = format!("{chapter}{verse}").parse::<i32>().ok()?;
    if concat != chapter && (1..=max_ch).contains(&concat) {
        Some(format!("{book_name} {concat}"))
    } else {
        None
    }
}

fn parse_capture(
    book_raw: &str,
    chapter: i32,
    verse_start: Option<i32>,
    verse_end: Option<i32>,
    matched_text: &str,
    kind: MatchKind,
) -> Option<ScriptureDetectionMatch> {
    let book_key = normalize_book_prefix(book_raw);
    let (book_number, book_name) = resolve_book(&book_key)?;
    finalize_capture(
        book_number,
        book_name,
        chapter,
        verse_start,
        verse_end,
        matched_text,
        kind,
    )
}

fn finalize_capture(
    book_number: i32,
    book_name: &'static str,
    chapter: i32,
    verse_start: Option<i32>,
    verse_end: Option<i32>,
    matched_text: &str,
    kind: MatchKind,
) -> Option<ScriptureDetectionMatch> {
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

    let mut alternatives = Vec::new();
    if matches!(kind, MatchKind::Spaced | MatchKind::Context) {
        if let Some(alt) = concat_chapter_alternative(book_name, chapter, verse_start, max_ch) {
            alternatives.push(alt);
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
        confidence: confidence_for_kind(kind, verse_start, has_intro_cue(matched_text)),
        detection_type: detection_type_for_kind(kind).to_string(),
        alternatives,
    })
}

/// Result of speech preprocessing: cleaned text + whether ASR confusion repairs ran.
struct PreprocessResult {
    text: String,
    speech_repaired: bool,
}

/// Convert spoken word numbers and strip punctuation so STT output matches our parsers.
fn preprocess_spoken_text(text: &str) -> PreprocessResult {
    let mut s = text.to_lowercase();
    s = s.replace(',', " ");
    s = s.replace('.', " ");

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

    // Fold spoken numbers ("eight twenty eight" -> "8 28") without corrupting
    // ordinary words that merely contain a number word.
    s = normalize_spoken_numbers(&s);
    s = normalize_ordinal_book_prefixes(&s);

    // Structural pulpit repairs (bridge phrases, "was"→verse) stay explicit.
    s = collapse_verse_bridge_phrases(&s);
    s = apply_asr_pattern_repairs(&s);

    // Phonetic book confusion only — these must not auto-project.
    let before_confusion = s.clone();
    s = apply_speech_confusion_aliases(&s);
    s = repair_book_that_or_after_chapter(&s);
    let speech_repaired = s != before_confusion;

    s = s.split_whitespace().collect::<Vec<_>>().join(" ");
    PreprocessResult {
        text: s,
        speech_repaired,
    }
}

/// "1st/2nd/3rd Peter" → "1/2/3 Peter" so ordinal STT matches numbered books.
fn normalize_ordinal_book_prefixes(text: &str) -> String {
    static ORDINAL_PREFIX: Lazy<Regex> = Lazy::new(|| {
        Regex::new(r"(?i)\b(1st|2nd|3rd|first|second|third)\s+").unwrap()
    });
    ORDINAL_PREFIX
        .replace_all(text, |caps: &regex::Captures| {
            let raw = caps.get(1).map(|m| m.as_str().to_ascii_lowercase()).unwrap_or_default();
            let digit = match raw.as_str() {
                "1st" | "first" => "1",
                "2nd" | "second" => "2",
                "3rd" | "third" => "3",
                _ => return caps.get(0).map(|m| m.as_str().to_string()).unwrap_or_default(),
            };
            format!("{digit} ")
        })
        .into_owned()
}

/// Collapse pulpit bridge phrases so split announcements join into one ref:
/// "Second Peter chapter 1. We begin from verse one." → "... chapter 1 verse 1"
fn collapse_verse_bridge_phrases(text: &str) -> String {
    static LONG_BRIDGES: Lazy<Regex> = Lazy::new(|| {
        Regex::new(
            r"(?i)\b(?:(?:we\s+|let'?s\s+|let\s+us\s+)?(?:begin|beginning|start|starting)\s+(?:from|at|in)|(?:we\s+)?(?:look|looking)\s+at|open\s+(?:at|from)|read\s+from)\s+(?:the\s+)?(?:verse|verses)\b",
        )
        .expect("long verse bridge regex")
    });
    // "chapter 1 from verse 1" / "chapter 1 at verse 1" → keep "verse"
    static SHORT_CONNECTOR: Lazy<Regex> = Lazy::new(|| {
        Regex::new(r"(?i)\b(?:from|at|in)\s+(?:the\s+)?(verse|verses)\b")
            .expect("short verse connector regex")
    });

    let mut s = LONG_BRIDGES.replace_all(text, "verse").into_owned();
    s = SHORT_CONNECTOR.replace_all(&s, "$1").into_owned();
    s
}

/// Narrow ASR repairs that do not change clean scripture speech.
fn apply_asr_pattern_repairs(text: &str) -> String {
    static DOUBLE_CHAPTER: Lazy<Regex> = Lazy::new(|| {
        Regex::new(
            r"(?i)\bchapter\s+(\d{1,3})\s+chapter\s+(\d{1,3})\s+(?:from\s+)?(?:verse|verses)\b",
        )
        .unwrap()
    });
    static CHAPTER_WAS_VERSE: Lazy<Regex> = Lazy::new(|| {
        Regex::new(r"(?i)\bchapter\s+(\d{1,3})\s+was\s+(\d{1,3})\b").unwrap()
    });
    static PLUS_BETWEEN_DIGITS: Lazy<Regex> =
        Lazy::new(|| Regex::new(r"(\d)\s*\+\s*(\d)").unwrap());
    static PERCENT_AFTER_DIGIT: Lazy<Regex> =
        Lazy::new(|| Regex::new(r"(\d)\s*%").unwrap());

    let mut s = DOUBLE_CHAPTER
        .replace_all(text, "chapter $2 verse")
        .into_owned();
    s = CHAPTER_WAS_VERSE
        .replace_all(&s, "chapter $1 verse $2")
        .into_owned();
    s = PLUS_BETWEEN_DIGITS.replace_all(&s, "$1 $2").into_owned();
    s = PERCENT_AFTER_DIGIT.replace_all(&s, "$1").into_owned();
    s
}

/// Gated phonetic book confusions — only when a scripture cue follows.
/// (Rust `regex` has no look-ahead, so the cue is captured and preserved.)
fn apply_speech_confusion_aliases(text: &str) -> String {
    static CONFUSIONS: Lazy<Vec<(Regex, &'static str)>> = Lazy::new(|| {
        let cue = r"(\s+(?:chapter|verse|verses|after|that|\d))";
        [
            (format!(r"(?i)\befficient\b{cue}"), "ephesians"),
            (format!(r"(?i)\bephesis\b{cue}"), "ephesians"),
            (format!(r"(?i)\ba\s+fishing\b{cue}"), "ephesians"),
            (format!(r"(?i)\brelationship\b{cue}"), "revelation"),
            (format!(r"(?i)\bmarrakesh\b{cue}"), "malachi"),
            (format!(r"(?i)\bmalakai\b{cue}"), "malachi"),
        ]
        .into_iter()
        .map(|(pat, repl)| (Regex::new(&pat).expect("speech confusion regex"), repl))
        .collect()
    });

    let mut s = text.to_string();
    for (re, book) in CONFUSIONS.iter() {
        s = re
            .replace_all(&s, |caps: &regex::Captures| {
                let cue = caps.get(1).map(|m| m.as_str()).unwrap_or("");
                format!("{book}{cue}")
            })
            .into_owned();
    }
    s
}

/// "Ephesians after 5 …" / "Revelation that 3" / "Malachi after that 3"
/// → insert the chapter keyword when the leading token is a real book.
fn repair_book_that_or_after_chapter(text: &str) -> String {
    static BOOK_AFTER: Lazy<Regex> = Lazy::new(|| {
        Regex::new(
            r"(?i)\b((?:[1-3]\s+)?[a-z]+(?:\s+of\s+[a-z]+)?)\s+(?:after\s+that|after|that)\s+(\d{1,3})\b",
        )
        .unwrap()
    });

    BOOK_AFTER
        .replace_all(text, |caps: &regex::Captures| {
            let book_raw = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            let chapter = caps.get(2).map(|m| m.as_str()).unwrap_or("");
            if resolve_book(book_raw).is_some() {
                format!("{book_raw} chapter {chapter}")
            } else {
                caps.get(0).map(|m| m.as_str().to_string()).unwrap_or_default()
            }
        })
        .into_owned()
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
    for caps in CHAPTER_OF_BOOK.captures_iter(text) {
        let Some(book_raw) = caps.name("book").map(|m| m.as_str()) else {
            continue;
        };
        let Some(chapter) = caps.name("chapter").and_then(|m| m.as_str().parse().ok()) else {
            continue;
        };
        let verse_start = caps.name("verse").and_then(|m| m.as_str().parse().ok());
        let verse_end = caps.name("verse_end").and_then(|m| m.as_str().parse().ok());
        let matched = caps.get(0).map(|m| m.as_str().trim()).unwrap_or("");
        let kind = if verse_start.is_some() {
            MatchKind::SpokenChapterVerse
        } else {
            MatchKind::ChapterOnly
        };
        if let Some(found) = parse_capture(book_raw, chapter, verse_start, verse_end, matched, kind) {
            matches.push(found);
        }
    }

    for caps in ORDINAL_PSALM.captures_iter(text) {
        let Some(chapter) = caps.name("chapter").and_then(|m| m.as_str().parse::<i32>().ok()) else {
            continue;
        };
        if !(1..=150).contains(&chapter) {
            continue;
        }
        let matched = caps.get(0).map(|m| m.as_str().trim()).unwrap_or("");
        if let Some(found) = parse_capture("psalm", chapter, None, None, matched, MatchKind::ChapterOnly) {
            matches.push(found);
        }
    }

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
        if let Some(found) = parse_capture(book_raw, chapter, verse_start, verse_end, matched, MatchKind::SpokenChapterVerse) {
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
        if let Some(found) = parse_capture(book_raw, chapter, verse_start, verse_end, matched, MatchKind::ExplicitColon) {
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
        if let Some(found) = parse_capture(book_raw, chapter, verse_start, verse_end, matched, MatchKind::SpokenChapterVerse) {
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
        if let Some(found) = parse_capture(book_raw, chapter, verse_start, verse_end, matched, MatchKind::Spaced) {
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
            alternatives: Vec::new(),
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
        if let Some(found) = parse_capture(book_raw, chapter, verse_start, verse_end, matched, MatchKind::SpokenChapterVerse) {
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
        if let Some(found) = parse_capture(book_raw, chapter, Some(verse), None, matched, MatchKind::Merged) {
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
        if let Some(found) = parse_capture(book_raw, chapter, None, None, matched, MatchKind::ChapterOnly) {
            matches.push(found);
        }
    }
}

/// Resolve a static book name reference so context matches can reuse the
/// canonical `&'static str` required by `finalize_capture`.
fn resolve_context_book(ctx: &DetectionContext) -> Option<(i32, &'static str)> {
    resolve_book(&ctx.book_name).or_else(|| {
        CANONICAL_BOOKS
            .iter()
            .find(|b| b.number == ctx.book_number)
            .map(|b| (b.number, b.name))
    })
}

/// Resolve bare "chapter/verse" phrases against the active sermon passage.
fn collect_context_matches(
    text: &str,
    ctx: &DetectionContext,
    matches: &mut Vec<ScriptureDetectionMatch>,
) {
    let Some((book_number, book_name)) = resolve_context_book(ctx) else {
        return;
    };

    for caps in CONTEXT_CHAPTER_VERSE.captures_iter(text) {
        let Some(chapter) = caps.name("chapter").and_then(|m| m.as_str().parse().ok()) else {
            continue;
        };
        let verse_start = caps.name("verse").and_then(|m| m.as_str().parse().ok());
        let verse_end = caps.name("verse_end").and_then(|m| m.as_str().parse().ok());
        let matched = caps.get(0).map(|m| m.as_str().trim()).unwrap_or("");
        if let Some(found) = finalize_capture(
            book_number,
            book_name,
            chapter,
            verse_start,
            verse_end,
            matched,
            MatchKind::Context,
        ) {
            matches.push(found);
        }
    }

    if let Some(chapter) = ctx.chapter {
        for caps in CONTEXT_VERSE_ONLY.captures_iter(text) {
            let verse_start = caps.name("verse").and_then(|m| m.as_str().parse().ok());
            let verse_end = caps.name("verse_end").and_then(|m| m.as_str().parse().ok());
            let matched = caps.get(0).map(|m| m.as_str().trim()).unwrap_or("");
            if let Some(found) = finalize_capture(
                book_number,
                book_name,
                chapter,
                verse_start,
                verse_end,
                matched,
                MatchKind::Context,
            ) {
                matches.push(found);
            }
        }
    }

    for caps in CONTEXT_CHAPTER_ONLY.captures_iter(text) {
        let Some(chapter) = caps.name("chapter").and_then(|m| m.as_str().parse().ok()) else {
            continue;
        };
        let matched = caps.get(0).map(|m| m.as_str().trim()).unwrap_or("");
        if let Some(found) = finalize_capture(
            book_number,
            book_name,
            chapter,
            None,
            None,
            matched,
            MatchKind::Context,
        ) {
            matches.push(found);
        }
    }
}

pub fn detect_references_in_text(text: &str) -> Vec<ScriptureDetectionMatch> {
    detect_references_with_context(text, None)
}

pub fn detect_references_with_context(
    text: &str,
    context: Option<&DetectionContext>,
) -> Vec<ScriptureDetectionMatch> {
    let mut matches = Vec::new();
    let prepared = preprocess_spoken_text(text);
    let preprocessed = &prepared.text;

    let mut raw_matches = Vec::new();
    collect_from_patterns(text, &mut raw_matches);

    let mut prep_matches = Vec::new();
    if preprocessed != &text.to_lowercase() {
        collect_from_patterns(preprocessed, &mut prep_matches);
    }
    if raw_matches.is_empty() && prep_matches.is_empty() && !preprocessed.is_empty() {
        collect_from_patterns(preprocessed, &mut prep_matches);
    }

    // Matches that only appear after ASR repairs are suggestions, not auto-live.
    if prepared.speech_repaired {
        let raw_refs: std::collections::HashSet<String> = raw_matches
            .iter()
            .map(|m| m.normalized_reference.clone())
            .collect();
        for m in &mut prep_matches {
            if !raw_refs.contains(&m.normalized_reference) {
                m.detection_type = detection_type_for_kind(MatchKind::SpeechRepaired).to_string();
                m.confidence =
                    confidence_for_kind(MatchKind::SpeechRepaired, m.parsed.verse_start, false);
            }
        }
    }

    matches.append(&mut raw_matches);
    matches.append(&mut prep_matches);

    // "Book chapter 1 … verse 1" in one utterance: upgrade chapter-only hits.
    attach_nearby_verses(preprocessed, &mut matches);

    // Bare "verse N" / "chapter N verse M" only resolve via context, and only
    // when no explicit book reference was found in the same window.
    if matches.is_empty() {
        if let Some(ctx) = context {
            collect_context_matches(preprocessed, ctx, &mut matches);
        }
    }

    dedupe_matches(matches)
}

/// If we already have "2 Peter 1" (chapter only) and the same window later says
/// "verse 1", promote to "2 Peter 1:1".
fn attach_nearby_verses(text: &str, matches: &mut Vec<ScriptureDetectionMatch>) {
    let mut extras = Vec::new();
    for m in matches.iter() {
        if m.parsed.verse_start.is_some() {
            continue;
        }
        let chapter_pat = format!(
            r"(?i)\bchapter\s+{}\b",
            regex::escape(&m.parsed.chapter.to_string())
        );
        let Ok(chapter_re) = Regex::new(&chapter_pat) else {
            continue;
        };
        let Some(chapter_match) = chapter_re.find(text) else {
            continue;
        };
        let after = &text[chapter_match.end()..];
        let Some(caps) = CONTEXT_VERSE_ONLY.captures(after) else {
            continue;
        };
        let Some(verse) = caps
            .name("verse")
            .and_then(|v| v.as_str().parse::<i32>().ok())
        else {
            continue;
        };
        let verse_end = caps
            .name("verse_end")
            .and_then(|v| v.as_str().parse::<i32>().ok());
        let Some((book_number, book_name)) = resolve_book(&m.parsed.book_name) else {
            continue;
        };
        if let Some(upgraded) = finalize_capture(
            book_number,
            book_name,
            m.parsed.chapter,
            Some(verse),
            verse_end,
            caps.get(0).map(|c| c.as_str()).unwrap_or(text),
            MatchKind::SpokenChapterVerse,
        ) {
            extras.push(upgraded);
        }
    }
    matches.extend(extras);
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

    #[test]
    fn detects_compound_spoken_numbers() {
        let found = detect_references_in_text("Turn with me to Romans chapter eight verse twenty eight.");
        assert!(!found.is_empty());
        assert_eq!(found[0].normalized_reference, "Romans 8:28");
    }

    #[test]
    fn detects_spoken_spaced_chapter_verse() {
        let found = detect_references_in_text("Let's read Romans eight twenty eight this morning.");
        assert!(found.iter().any(|m| m.normalized_reference == "Romans 8:28"));
    }

    #[test]
    fn detects_spoken_ordinal_book() {
        let found = detect_references_in_text("Let's read one Corinthians thirteen verse four.");
        assert!(found.iter().any(|m| m.normalized_reference == "1 Corinthians 13:4"));
    }

    #[test]
    fn detects_twenty_third_psalm() {
        let found = detect_references_in_text("Let us read the twenty-third Psalm together.");
        assert!(found.iter().any(|m| m.normalized_reference == "Psalms 23"));
    }

    #[test]
    fn detects_nth_chapter_of_book() {
        let found = detect_references_in_text("Turn to the third chapter of John.");
        assert!(found.iter().any(|m| m.normalized_reference == "John 3"));
    }

    #[test]
    fn detects_gospel_according_to() {
        let found =
            detect_references_in_text("Turn to the gospel according to John, chapter three, verse sixteen.");
        assert!(found.iter().any(|m| m.normalized_reference == "John 3:16"));
    }

    #[test]
    fn does_not_corrupt_everyone() {
        let found = detect_references_in_text("Everyone should read John 3:16 today.");
        assert!(found.iter().any(|m| m.normalized_reference == "John 3:16"));
    }

    #[test]
    fn resolves_saint_john_prefix() {
        let found = detect_references_in_text("Saint John chapter 3 verse 16.");
        assert!(found.iter().any(|m| m.normalized_reference == "John 3:16"));
    }

    #[test]
    fn explicit_colon_outranks_spaced() {
        let colon = detect_references_in_text("John 3:16");
        let spaced = detect_references_in_text("John 3 16");
        let colon_conf = colon[0].confidence;
        let spaced_conf = spaced
            .iter()
            .find(|m| m.normalized_reference == "John 3:16")
            .map(|m| m.confidence)
            .unwrap();
        assert!(colon_conf >= 0.9);
        assert!(colon_conf > spaced_conf);
    }

    #[test]
    fn offers_concat_alternative_for_ambiguous_psalm() {
        let found = detect_references_in_text("Let's read Psalm one twenty one.");
        let primary = found
            .iter()
            .find(|m| m.normalized_reference == "Psalms 1:21")
            .expect("primary reading present");
        assert!(primary.alternatives.iter().any(|a| a == "Psalms 121"));
    }

    #[test]
    fn no_alternative_when_concat_invalid() {
        let found = detect_references_in_text("Romans eight twenty eight.");
        let primary = found
            .iter()
            .find(|m| m.normalized_reference == "Romans 8:28")
            .expect("primary reading present");
        assert!(primary.alternatives.is_empty());
    }

    fn ctx(book_number: i32, book_name: &str, chapter: Option<i32>) -> DetectionContext {
        DetectionContext {
            book_number,
            book_name: book_name.to_string(),
            chapter,
        }
    }

    #[test]
    fn context_resolves_bare_verse() {
        let found = detect_references_with_context(
            "and in verse sixteen we see",
            Some(&ctx(43, "John", Some(3))),
        );
        assert!(found.iter().any(|m| m.normalized_reference == "John 3:16"));
    }

    #[test]
    fn context_resolves_chapter_and_verse() {
        let found = detect_references_with_context(
            "now turn to chapter five verse two",
            Some(&ctx(43, "John", Some(3))),
        );
        assert!(found.iter().any(|m| m.normalized_reference == "John 5:2"));
    }

    #[test]
    fn context_ignored_when_book_present() {
        let found = detect_references_with_context(
            "Romans 8:28 is a promise",
            Some(&ctx(43, "John", Some(3))),
        );
        assert!(found.iter().any(|m| m.normalized_reference == "Romans 8:28"));
        assert!(!found.iter().any(|m| m.parsed.book_name == "John"));
    }

    #[test]
    fn rejects_impossible_malachi_chapter() {
        let found = detect_references_in_text("Malachi chapter 8 verse 10.");
        assert!(found.is_empty());
    }

    #[test]
    fn rejects_impossible_revelation_chapter() {
        let found = detect_references_in_text("Revelation 60 verse 15.");
        assert!(found.is_empty());
    }

    #[test]
    fn repairs_efficient_to_ephesians_with_double_chapter_stutter() {
        let found = detect_references_in_text(
            "he read from efficient chapter 1, chapter 5, from verse 1 to 14.",
        );
        let hit = found
            .iter()
            .find(|m| m.normalized_reference == "Ephesians 5:1-14")
            .expect("Ephesians 5:1-14 recovered");
        assert_eq!(hit.detection_type, "speech_repaired");
        assert!(hit.confidence < 0.85);
    }

    #[test]
    fn repairs_efficient_after_plus_range() {
        let found = detect_references_in_text("efficient after 5 + 1 to 14");
        assert!(found.iter().any(|m| m.normalized_reference == "Ephesians 5:1-14"));
    }

    #[test]
    fn repairs_chapter_was_as_verse() {
        let found = detect_references_in_text("Matthew chapter 24. Was 42");
        assert!(found.iter().any(|m| m.normalized_reference == "Matthew 24:42"));
    }

    #[test]
    fn repairs_relationship_that_to_revelation() {
        let found = detect_references_in_text("relationship that three");
        assert!(found.iter().any(|m| m.normalized_reference == "Revelation 3"));
    }

    #[test]
    fn repairs_marrakesh_to_malachi() {
        let found = detect_references_in_text("Marrakesh after that 3");
        assert!(found.iter().any(|m| {
            m.parsed.book_name == "Malachi" && m.parsed.chapter == 3
        }));
    }

    #[test]
    fn clean_ephesians_still_explicit_high_confidence() {
        let found = detect_references_in_text("Ephesians chapter 5 verse 14.");
        let hit = found
            .iter()
            .find(|m| m.normalized_reference == "Ephesians 5:14")
            .expect("clean Ephesians");
        assert_eq!(hit.detection_type, "explicit");
        assert!(hit.confidence >= 0.9);
    }

    #[test]
    fn efficient_alone_without_cue_is_not_a_book() {
        let found = detect_references_in_text("The process was efficient and clear.");
        assert!(found.is_empty());
    }

    #[test]
    fn detects_second_peter_split_begin_from_verse() {
        let found = detect_references_in_text(
            "Second Peter, chapter 1. We begin from verse one.",
        );
        let hit = found
            .iter()
            .find(|m| m.normalized_reference == "2 Peter 1:1")
            .expect("2 Peter 1:1 from split announcement");
        assert_eq!(hit.detection_type, "explicit");
        assert!(hit.confidence >= 0.85);
    }

    #[test]
    fn detects_first_john_starting_at_verse() {
        let found =
            detect_references_in_text("First John chapter 3. Starting at verse 16.");
        assert!(found.iter().any(|m| m.normalized_reference == "1 John 3:16"));
    }

    #[test]
    fn detects_second_timothy_lets_begin_in_verse() {
        let found =
            detect_references_in_text("Second Timothy, chapter 2. Let's begin in verse 15.");
        assert!(found.iter().any(|m| m.normalized_reference == "2 Timothy 2:15"));
    }

    #[test]
    fn detects_romans_we_start_from_verse() {
        let found = detect_references_in_text("Romans chapter 8. We start from verse 28.");
        assert!(found.iter().any(|m| m.normalized_reference == "Romans 8:28"));
    }

    #[test]
    fn detects_2nd_peter_ordinal_digits() {
        let found = detect_references_in_text("2nd Peter chapter 1 verse 1.");
        assert!(found.iter().any(|m| m.normalized_reference == "2 Peter 1:1"));
    }

    #[test]
    fn detects_chapter_from_verse_connector() {
        let found = detect_references_in_text("Genesis chapter 1 from verse 1.");
        assert!(found.iter().any(|m| m.normalized_reference == "Genesis 1:1"));
    }
}
