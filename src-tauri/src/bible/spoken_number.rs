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

#[cfg(test)]
mod tests {
    use super::*;

    fn norm(text: &str) -> String {
        normalize_spoken_numbers(text)
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
