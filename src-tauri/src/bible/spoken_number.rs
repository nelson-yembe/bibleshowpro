//! Spoken-number tokenizer for live-transcript scripture detection.
//!
//! Converts spoken number words into digits while preserving the rest of the
//! sentence. Unlike a naive string `replace`, this works token-by-token so it
//! never corrupts words that merely *contain* a number word (e.g. "every**one**"
//! stays "everyone"), and it folds spoken compounds correctly:
//!
//! - "twenty eight" / "twenty-eight"  -> 28
//! - "eight twenty-eight"             -> "8 28"  (chapter then verse)
//! - "twenty three"                   -> 23
//! - "the twenty-third"               -> 23
//! - "one hundred nineteen"           -> 119
//! - "three sixteen"                  -> "3 16"

/// A number word classified by its grammatical role so runs fold correctly.
#[derive(Clone, Copy, Debug, PartialEq)]
enum NumWord {
    /// 1-9 (cardinal or ordinal).
    Unit(i64),
    /// 10-19 (cardinal or ordinal).
    Teen(i64),
    /// 20, 30, ... 90 (cardinal or ordinal).
    Ten(i64),
    Hundred,
}

fn classify(word: &str) -> Option<NumWord> {
    let w = word.trim_matches(|c: char| !c.is_ascii_alphabetic());
    if w.is_empty() {
        return None;
    }
    Some(match w {
        "one" | "first" => NumWord::Unit(1),
        "two" | "second" => NumWord::Unit(2),
        "three" | "third" => NumWord::Unit(3),
        "four" | "fourth" => NumWord::Unit(4),
        "five" | "fifth" => NumWord::Unit(5),
        "six" | "sixth" => NumWord::Unit(6),
        "seven" | "seventh" => NumWord::Unit(7),
        "eight" | "eighth" => NumWord::Unit(8),
        "nine" | "ninth" => NumWord::Unit(9),
        "ten" | "tenth" => NumWord::Teen(10),
        "eleven" | "eleventh" => NumWord::Teen(11),
        "twelve" | "twelfth" => NumWord::Teen(12),
        "thirteen" | "thirteenth" => NumWord::Teen(13),
        "fourteen" | "fourteenth" => NumWord::Teen(14),
        "fifteen" | "fifteenth" => NumWord::Teen(15),
        "sixteen" | "sixteenth" => NumWord::Teen(16),
        "seventeen" | "seventeenth" => NumWord::Teen(17),
        "eighteen" | "eighteenth" => NumWord::Teen(18),
        "nineteen" | "nineteenth" => NumWord::Teen(19),
        "twenty" | "twentieth" => NumWord::Ten(20),
        "thirty" | "thirtieth" => NumWord::Ten(30),
        "forty" | "fortieth" => NumWord::Ten(40),
        "fifty" | "fiftieth" => NumWord::Ten(50),
        "sixty" | "sixtieth" => NumWord::Ten(60),
        "seventy" | "seventieth" => NumWord::Ten(70),
        "eighty" | "eightieth" => NumWord::Ten(80),
        "ninety" | "ninetieth" => NumWord::Ten(90),
        "hundred" | "hundredth" => NumWord::Hundred,
        _ => return None,
    })
}

/// Parse a single spoken number starting at `tokens[i]`. Returns the value and
/// the index just past the consumed words. The grammar keeps adjacent numbers
/// (chapter and verse) separate, e.g. "eight twenty eight" -> 8, then 28.
fn parse_number(tokens: &[NumWord], i: usize) -> Option<(i64, usize)> {
    let mut idx = i;
    let first = *tokens.get(idx)?;

    match first {
        NumWord::Unit(u) => {
            idx += 1;
            // "<unit> hundred [tens] [unit]" / "<unit> hundred [teen]"
            if matches!(tokens.get(idx), Some(NumWord::Hundred)) {
                idx += 1;
                let mut value = u * 100;
                match tokens.get(idx) {
                    Some(NumWord::Ten(t)) => {
                        value += t;
                        idx += 1;
                        if let Some(NumWord::Unit(u2)) = tokens.get(idx) {
                            value += u2;
                            idx += 1;
                        }
                    }
                    Some(NumWord::Teen(t)) => {
                        value += t;
                        idx += 1;
                    }
                    Some(NumWord::Unit(u2)) => {
                        value += u2;
                        idx += 1;
                    }
                    _ => {}
                }
                Some((value, idx))
            } else {
                Some((u, idx))
            }
        }
        NumWord::Teen(t) => Some((t, idx + 1)),
        NumWord::Ten(t) => {
            idx += 1;
            // "<ten> <unit>" -> tens + ones (twenty eight -> 28)
            if let Some(NumWord::Unit(u)) = tokens.get(idx) {
                Some((t + u, idx + 1))
            } else {
                Some((t, idx))
            }
        }
        NumWord::Hundred => None,
    }
}

/// Replace spoken number words in `text` with digits, folding compounds and
/// keeping non-number words untouched. Hyphens inside compounds are treated as
/// spaces ("twenty-eight" -> "twenty eight" -> 28).
pub fn normalize_spoken_numbers(text: &str) -> String {
    let lowered = text.to_lowercase();

    // Split spoken compounds on hyphens ("twenty-eight") but preserve numeric
    // ranges ("16-18") so verse ranges survive intact.
    let chars: Vec<char> = lowered.chars().collect();
    let mut prepared = String::with_capacity(lowered.len());
    for (idx, ch) in chars.iter().enumerate() {
        if *ch == '-' {
            let prev = if idx > 0 { chars[idx - 1] } else { ' ' };
            let next = chars.get(idx + 1).copied().unwrap_or(' ');
            if prev.is_ascii_digit() && next.is_ascii_digit() {
                prepared.push('-');
            } else {
                prepared.push(' ');
            }
        } else {
            prepared.push(*ch);
        }
    }

    let raw_tokens: Vec<&str> = prepared.split_whitespace().filter(|t| !t.is_empty()).collect();

    let mut out: Vec<String> = Vec::with_capacity(raw_tokens.len());
    let mut i = 0;
    while i < raw_tokens.len() {
        // Gather a maximal run of consecutive number words.
        let run_start = i;
        let mut run: Vec<NumWord> = Vec::new();
        while i < raw_tokens.len() {
            if let Some(nw) = classify(raw_tokens[i]) {
                run.push(nw);
                i += 1;
            } else {
                break;
            }
        }

        if run.is_empty() {
            out.push(raw_tokens[run_start].to_string());
            i = run_start + 1;
            continue;
        }

        // Fold the run into one or more integers.
        let mut j = 0;
        let mut produced = false;
        while j < run.len() {
            if let Some((value, next)) = parse_number(&run, j) {
                out.push(value.to_string());
                j = next;
                produced = true;
            } else {
                j += 1;
            }
        }

        // A lone "hundred" with nothing parseable: keep the original words.
        if !produced {
            for k in run_start..i {
                out.push(raw_tokens[k].to_string());
            }
        }
    }

    out.join(" ")
}

/// French number words, accent-folded and with hyphens already split ("dix-sept" arrives
/// as "dix sept"). Ordinals fold to the same values as cardinals.
fn french_value(word: &str) -> Option<i64> {
    let base = match word.strip_suffix("ieme") {
        Some(stem) => match stem {
            "deux" => "deux",
            "trois" => "trois",
            "quatr" => "quatre",
            "cinqu" => "cinq",
            "six" => "six",
            "sept" => "sept",
            "huit" => "huit",
            "neuv" => "neuf",
            "dix" => "dix",
            "onz" => "onze",
            "douz" => "douze",
            "treiz" => "treize",
            "quatorz" => "quatorze",
            "quinz" => "quinze",
            "seiz" => "seize",
            "vingt" => "vingt",
            "trent" => "trente",
            "quarant" => "quarante",
            "cinquant" => "cinquante",
            "soixant" => "soixante",
            "cent" => "cent",
            _ => return None,
        },
        None => word,
    };
    Some(match base {
        "un" | "une" => 1,
        "deux" => 2,
        "trois" => 3,
        "quatre" => 4,
        "cinq" => 5,
        "six" => 6,
        "sept" => 7,
        "huit" => 8,
        "neuf" => 9,
        "dix" => 10,
        "onze" => 11,
        "douze" => 12,
        "treize" => 13,
        "quatorze" => 14,
        "quinze" => 15,
        "seize" => 16,
        "vingt" | "vingts" => 20,
        "trente" => 30,
        "quarante" => 40,
        "cinquante" => 50,
        "soixante" => 60,
        "cent" | "cents" => 100,
        _ => return None,
    })
}

/// 0–19, the part of French counting that "dix sept" and "soixante douze" build on.
fn french_below_twenty(tokens: &[&str], i: usize) -> Option<(i64, usize)> {
    let value = french_value(tokens.get(i)?)?;
    match value {
        1..=9 => Some((value, i + 1)),
        10 => match tokens.get(i + 1).and_then(|t| french_value(t)) {
            Some(unit @ 7..=9) => Some((10 + unit, i + 2)),
            _ => Some((10, i + 1)),
        },
        11..=16 => Some((value, i + 1)),
        _ => None,
    }
}

fn french_below_hundred(tokens: &[&str], i: usize) -> Option<(i64, usize)> {
    let word = *tokens.get(i)?;
    let value = french_value(word)?;
    // "quatre vingt(s)" is 80, and takes 1–19 after it: "quatre vingt dix neuf" = 99.
    if value == 4 && tokens.get(i + 1).and_then(|t| french_value(t)) == Some(20) {
        return Some(match french_below_twenty(tokens, i + 2) {
            Some((rest, next)) => (80 + rest, next),
            None => (80, i + 2),
        });
    }
    match value {
        20 | 30 | 40 | 50 | 60 => {
            // "vingt et un", "soixante et onze"
            if tokens.get(i + 1) == Some(&"et") {
                if let Some(unit @ (1 | 11)) = tokens.get(i + 2).and_then(|t| french_value(t)) {
                    return Some((value + unit, i + 3));
                }
            }
            match tokens.get(i + 1).and_then(|_| french_below_twenty(tokens, i + 1)) {
                // Only sixty takes a teen: "soixante douze" = 72, but "vingt douze" is two numbers.
                Some((rest, next)) if rest < 10 || value == 60 => Some((value + rest, next)),
                _ => Some((value, i + 1)),
            }
        }
        _ => french_below_twenty(tokens, i),
    }
}

fn french_number(tokens: &[&str], i: usize) -> Option<(i64, usize)> {
    let first = french_value(tokens.get(i)?)?;
    let (hundreds, next) = if first == 100 {
        (100, i + 1)
    } else if (2..=9).contains(&first) && tokens.get(i + 1).and_then(|t| french_value(t)) == Some(100) {
        (first * 100, i + 2)
    } else {
        return french_below_hundred(tokens, i);
    };
    match french_below_hundred(tokens, next) {
        Some((rest, after)) => Some((hundreds + rest, after)),
        None => Some((hundreds, next)),
    }
}

/// French counterpart of [`normalize_spoken_numbers`], for text that is already
/// lowercase and accent-folded. "Un"/"une" are numbers only after a chapter or verse
/// word — everywhere else they are the article "a".
pub fn normalize_french_numbers(text: &str) -> String {
    let prepared = text
        .char_indices()
        .map(|(idx, ch)| {
            if ch != '-' {
                return ch;
            }
            let prev = text[..idx].chars().next_back().unwrap_or(' ');
            let next = text[idx + 1..].chars().next().unwrap_or(' ');
            if prev.is_ascii_digit() && next.is_ascii_digit() {
                '-'
            } else {
                ' '
            }
        })
        .collect::<String>();
    let tokens: Vec<&str> = prepared.split_whitespace().collect();

    let mut out: Vec<String> = Vec::with_capacity(tokens.len());
    let mut i = 0;
    while i < tokens.len() {
        let word = tokens[i];
        let is_article = matches!(word, "un" | "une");
        let counts = !is_article
            || out
                .last()
                .is_some_and(|prev| matches!(prev.as_str(), "chapter" | "verse" | "verses" | "to" | "and"));
        match counts.then(|| french_number(&tokens, i)).flatten() {
            Some((value, next)) => {
                out.push(value.to_string());
                i = next;
            }
            None => {
                out.push(word.to_string());
                i += 1;
            }
        }
    }
    out.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn norm(text: &str) -> String {
        normalize_spoken_numbers(text)
    }

    fn fr(text: &str) -> String {
        normalize_french_numbers(text)
    }

    #[test]
    fn folds_french_numbers() {
        assert_eq!(fr("jean trois seize"), "jean 3 16");
        assert_eq!(fr("dix sept"), "17");
        assert_eq!(fr("dix-neuf"), "19");
        assert_eq!(fr("vingt et un"), "21");
        assert_eq!(fr("vingt-trois"), "23");
        assert_eq!(fr("soixante et onze"), "71");
        assert_eq!(fr("soixante douze"), "72");
        assert_eq!(fr("quatre vingts"), "80");
        assert_eq!(fr("quatre-vingt-dix-neuf"), "99");
        assert_eq!(fr("cent dix neuf"), "119");
        assert_eq!(fr("cent cinquante"), "150");
        assert_eq!(fr("le troisieme"), "le 3");
    }

    #[test]
    fn french_articles_stay_words_outside_a_reference() {
        assert_eq!(fr("un homme et une femme"), "un homme et une femme");
        assert_eq!(fr("chapter un verse une"), "chapter 1 verse 1");
    }

    #[test]
    fn french_folding_keeps_adjacent_numbers_apart() {
        assert_eq!(fr("psaume cent dix neuf verse cent cinq"), "psaume 119 verse 105");
        assert_eq!(fr("vingt douze"), "20 12");
        assert_eq!(fr("versets 16-18"), "versets 16-18");
    }

    #[test]
    fn folds_compound_tens() {
        assert_eq!(norm("twenty eight"), "28");
        assert_eq!(norm("twenty-eight"), "28");
        assert_eq!(norm("twenty three"), "23");
    }

    #[test]
    fn keeps_adjacent_numbers_separate() {
        assert_eq!(norm("eight twenty eight"), "8 28");
        assert_eq!(norm("three sixteen"), "3 16");
        assert_eq!(norm("one twenty one"), "1 21");
    }

    #[test]
    fn handles_ordinals() {
        assert_eq!(norm("the twenty-third"), "the 23");
        assert_eq!(norm("twenty-eighth"), "28");
    }

    #[test]
    fn handles_hundreds() {
        assert_eq!(norm("one hundred nineteen"), "119");
        assert_eq!(norm("one hundred twenty one"), "121");
    }

    #[test]
    fn does_not_corrupt_words_containing_number_words() {
        assert_eq!(norm("everyone"), "everyone");
        assert_eq!(norm("someone said"), "someone said");
        assert_eq!(norm("for the nations"), "for the nations");
    }

    #[test]
    fn embeds_numbers_in_sentence() {
        assert_eq!(norm("romans eight twenty eight"), "romans 8 28");
        assert_eq!(norm("john three sixteen"), "john 3 16");
    }

    #[test]
    fn preserves_numeric_ranges() {
        assert_eq!(norm("john 3:16-18"), "john 3:16-18");
        assert_eq!(norm("verses 16-18"), "verses 16-18");
    }
}
