//! Book names as they come out of a speech engine, in English and French.
//!
//! [`crate::bible::books::resolve_book`] serves typed searches, where "Is 53" means
//! Isaiah and a suffix match is a convenience. In a transcript those same rules turn
//! ordinary speech into references: "this 3" ends in the Isaiah abbreviation "is". So
//! speech gets its own resolver that accepts whole spoken names only, and repairs a near
//! miss ("Mathew", "Colosians") as a suggestion rather than a certainty.

use std::collections::HashMap;

use once_cell::sync::Lazy;

use crate::bible::books::CANONICAL_BOOKS;

/// Forms people say, or speech engines write, besides the canonical English name.
/// Abbreviations are deliberately absent: they are for typing, and in a transcript
/// "is", "am" or "he" are ordinary words.
const SPOKEN_FORMS: &[(i32, &[&str])] = &[
    (1, &["genese"]),
    (2, &["exode"]),
    (3, &["levitique"]),
    (4, &["nombres", "nations"]),
    (5, &["deuteronome"]),
    (6, &["josue"]),
    (7, &["juges"]),
    (11, &["1 rois"]),
    (12, &["2 rois"]),
    (13, &["1 chroniques"]),
    (14, &["2 chroniques"]),
    (15, &["esdras"]),
    (16, &["nehemie"]),
    (19, &["psalm", "psaume", "psaumes"]),
    (20, &["proverb", "proverbe", "proverbes"]),
    (21, &["ecclesiaste", "qohelet"]),
    (
        22,
        &["song of songs", "songs of solomon", "canticles", "cantique des cantiques", "cantique", "cantiques"],
    ),
    (23, &["esaie", "isaie"]),
    (24, &["jeremie"]),
    (25, &["lamentation"]),
    (26, &["ezechiel"]),
    (28, &["osee"]),
    (31, &["abdias"]),
    (32, &["jonas"]),
    (33, &["michee"]),
    (35, &["habacuc"]),
    (36, &["sophonie"]),
    (37, &["aggee"]),
    (38, &["zacharie"]),
    (39, &["malachie"]),
    (40, &["matthieu", "mathieu"]),
    (41, &["marc"]),
    (42, &["luc"]),
    (43, &["jean"]),
    (44, &["acts of the apostles", "actes", "actes des apotres"]),
    (45, &["romains"]),
    (46, &["1 corinthiens", "1 corinthian"]),
    (47, &["2 corinthiens", "2 corinthian"]),
    (48, &["galates", "galatian"]),
    (49, &["ephesiens", "ephesian"]),
    (50, &["philippiens", "philippian"]),
    (51, &["colossiens", "colossian"]),
    (52, &["1 thessaloniciens", "1 thessalonian"]),
    (53, &["2 thessaloniciens", "2 thessalonian"]),
    (54, &["1 timothee"]),
    (55, &["2 timothee"]),
    (56, &["tite"]),
    (58, &["hebreux", "hebrew"]),
    (59, &["jacques"]),
    (60, &["1 pierre"]),
    (61, &["2 pierre"]),
    (62, &["1 jean"]),
    (63, &["2 jean"]),
    (64, &["3 jean"]),
    (66, &["revelations", "revelation of john", "apocalypse"]),
];

/// Names too close to everyday words to repair: "number 5" is not Numbers 5.
const NEVER_REPAIR: &[&str] = &["numbers", "nombres", "judges", "juges", "daniel", "samuel", "esther"];

/// Letters a misspelling may differ by before it stops counting as the book.
fn repair_distance(name_len: usize) -> usize {
    match name_len {
        0..=5 => 0,
        6..=8 => 1,
        _ => 2,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SpokenBook {
    pub number: i32,
    pub name: &'static str,
    /// Matched a misspelling, not a name: worth suggesting, not projecting unseen.
    pub repaired: bool,
}

/// "Genèse" → "genese", "Ésaïe" → "esaie". French names reach the parsers in the same
/// ASCII form as English ones.
pub fn fold_accents(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for ch in text.chars() {
        match ch {
            'à' | 'â' | 'ä' | 'á' | 'À' | 'Â' | 'Ä' | 'Á' => out.push('a'),
            'ç' | 'Ç' => out.push('c'),
            'é' | 'è' | 'ê' | 'ë' | 'É' | 'È' | 'Ê' | 'Ë' => out.push('e'),
            'î' | 'ï' | 'í' | 'Î' | 'Ï' | 'Í' => out.push('i'),
            'ô' | 'ö' | 'ó' | 'Ô' | 'Ö' | 'Ó' => out.push('o'),
            'ù' | 'û' | 'ü' | 'ú' | 'Ù' | 'Û' | 'Ü' | 'Ú' => out.push('u'),
            'ÿ' | 'Ÿ' => out.push('y'),
            'œ' | 'Œ' => out.push_str("oe"),
            'æ' | 'Æ' => out.push_str("ae"),
            '’' | '‘' => out.push('\''),
            other => out.push(other),
        }
    }
    out
}

/// Lowercase, accent-free, single-spaced, with spoken ordinals as digits and the
/// descriptive lead-ins people use ("the gospel of", "l'évangile selon") removed.
fn spoken_key(text: &str) -> String {
    let folded = fold_accents(&text.to_lowercase()).replace(['.', ',', '\''], " ");
    let mut key = folded.split_whitespace().collect::<Vec<_>>().join(" ");

    const LEAD_INS: &[&str] = &[
        "the gospel according to ",
        "gospel according to ",
        "the gospel of ",
        "gospel of ",
        "the book of ",
        "book of ",
        "the letter to the ",
        "letter to the ",
        "the epistle to the ",
        "epistle to the ",
        "l evangile selon ",
        "evangile selon ",
        "le livre de ",
        "le livre des ",
        "livre de ",
        "livre des ",
        "l epitre aux ",
        "epitre aux ",
        "la lettre aux ",
        "lettre aux ",
        "saint ",
        "st ",
        "the ",
        "le ",
        "la ",
        "les ",
    ];
    let mut changed = true;
    while changed {
        changed = false;
        for lead in LEAD_INS {
            if key.len() > lead.len() {
                if let Some(rest) = key.strip_prefix(lead) {
                    key = rest.to_string();
                    changed = true;
                }
            }
        }
    }

    const ORDINALS: &[(&str, &str)] = &[
        ("1st ", "1 "),
        ("2nd ", "2 "),
        ("3rd ", "3 "),
        ("first ", "1 "),
        ("second ", "2 "),
        ("third ", "3 "),
        ("one ", "1 "),
        ("two ", "2 "),
        ("three ", "3 "),
        ("premier ", "1 "),
        ("premiere ", "1 "),
        ("1er ", "1 "),
        ("1re ", "1 "),
        ("1ere ", "1 "),
        ("deuxieme ", "2 "),
        ("seconde ", "2 "),
        ("2e ", "2 "),
        ("2eme ", "2 "),
        ("troisieme ", "3 "),
        ("3e ", "3 "),
        ("3eme ", "3 "),
    ];
    for (word, digit) in ORDINALS {
        if let Some(rest) = key.strip_prefix(word) {
            key = format!("{digit}{rest}");
            break;
        }
    }
    key
}

static EXACT: Lazy<HashMap<String, (i32, &'static str)>> = Lazy::new(|| {
    let mut table = HashMap::new();
    for book in CANONICAL_BOOKS {
        table.insert(spoken_key(book.name), (book.number, book.name));
    }
    for (number, forms) in SPOKEN_FORMS {
        let name = CANONICAL_BOOKS
            .iter()
            .find(|b| b.number == *number)
            .map(|b| b.name)
            .expect("spoken form for a canonical book");
        for form in *forms {
            table.insert(spoken_key(form), (*number, name));
        }
    }
    table
});

/// One-word names a misspelling can be repaired to, with the number prefix a numbered
/// book needs ("1" for "1 Corinthians").
static REPAIRABLE: Lazy<Vec<(Option<&'static str>, String, i32, &'static str)>> = Lazy::new(|| {
    let mut out = Vec::new();
    for (key, (number, name)) in EXACT.iter() {
        let (prefix, word) = match key.split_once(' ') {
            Some((p @ ("1" | "2" | "3"), rest)) if !rest.contains(' ') => (Some(p), rest),
            None => (None, key.as_str()),
            _ => continue,
        };
        if NEVER_REPAIR.contains(&word) || repair_distance(word.len()) == 0 {
            continue;
        }
        out.push((prefix, word.to_string(), *number, *name));
    }
    out
});

fn edit_distance(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    for (i, ca) in a.iter().enumerate() {
        let mut cur = vec![i + 1; b.len() + 1];
        for (j, cb) in b.iter().enumerate() {
            let substitution = prev[j] + usize::from(ca != cb);
            cur[j + 1] = substitution.min(prev[j + 1] + 1).min(cur[j] + 1);
        }
        prev = cur;
    }
    prev[b.len()]
}

fn exact(key: &str) -> Option<SpokenBook> {
    EXACT.get(key).map(|(number, name)| SpokenBook {
        number: *number,
        name,
        repaired: false,
    })
}

fn repair(words: &[&str]) -> Option<SpokenBook> {
    let word = *words.last()?;
    let prefix = words
        .len()
        .checked_sub(2)
        .map(|i| words[i])
        .filter(|w| matches!(*w, "1" | "2" | "3"));
    let first = word.chars().next()?;

    let mut best: Option<(usize, SpokenBook)> = None;
    for (needs, name_word, number, name) in REPAIRABLE.iter() {
        if *needs != prefix || !name_word.starts_with(first) {
            continue;
        }
        let allowed = repair_distance(name_word.len());
        let distance = edit_distance(word, name_word);
        if distance == 0 || distance > allowed {
            continue;
        }
        if best.as_ref().is_none_or(|(d, _)| distance < *d) {
            best = Some((
                distance,
                SpokenBook {
                    number: *number,
                    name,
                    repaired: true,
                },
            ));
        }
    }
    best.map(|(_, book)| book)
}

/// The book named at the *end* of `phrase`. Reference patterns capture greedily, so
/// "let us read from romans" arrives whole and the book is its last words.
pub fn resolve_spoken_book(phrase: &str) -> Option<SpokenBook> {
    let key = spoken_key(phrase);
    let words: Vec<&str> = key.split_whitespace().collect();
    for len in (1..=words.len().min(4)).rev() {
        let window = spoken_key(&words[words.len() - len..].join(" "));
        if let Some(book) = exact(&window) {
            return Some(book);
        }
    }
    repair(&words)
}

/// The book named at the *start* of `phrase`, for "chapter 3 of John and …" where the
/// pattern cannot know where the name stops.
pub fn resolve_leading_spoken_book(phrase: &str) -> Option<SpokenBook> {
    let key = spoken_key(phrase);
    let words: Vec<&str> = key.split_whitespace().collect();
    for len in (1..=words.len().min(4)).rev() {
        if let Some(book) = exact(&spoken_key(&words[..len].join(" "))) {
            return Some(book);
        }
    }
    words.first().and_then(|w| repair(&[w]))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn name(phrase: &str) -> Option<&'static str> {
        resolve_spoken_book(phrase).map(|b| b.name)
    }

    #[test]
    fn resolves_english_names_at_the_end_of_a_phrase() {
        assert_eq!(name("turn with me to romans"), Some("Romans"));
        assert_eq!(name("let s read 1 corinthians"), Some("1 Corinthians"));
        assert_eq!(name("first john"), Some("1 John"));
        assert_eq!(name("the gospel according to john"), Some("John"));
        assert_eq!(name("song of songs"), Some("Song of Solomon"));
        assert_eq!(name("psalm"), Some("Psalms"));
    }

    #[test]
    fn resolves_french_names_with_or_without_accents() {
        assert_eq!(name("Genèse"), Some("Genesis"));
        assert_eq!(name("genese"), Some("Genesis"));
        assert_eq!(name("Ésaïe"), Some("Isaiah"));
        assert_eq!(name("Matthieu"), Some("Matthew"));
        assert_eq!(name("Saint Jean"), Some("John"));
        assert_eq!(name("1 Jean"), Some("1 John"));
        assert_eq!(name("première Jean"), Some("1 John"));
        assert_eq!(name("2e Corinthiens"), Some("2 Corinthians"));
        assert_eq!(name("Hébreux"), Some("Hebrews"));
        assert_eq!(name("Apocalypse"), Some("Revelation"));
        assert_eq!(name("Cantique des cantiques"), Some("Song of Solomon"));
        assert_eq!(name("l'évangile selon Luc"), Some("Luke"));
    }

    #[test]
    fn ordinary_words_are_not_books() {
        // Each ends in a typed abbreviation the search resolver accepts.
        for phrase in ["this", "i am", "the", "we see a word document", "masterchef", "petite", "map"] {
            assert_eq!(name(phrase), None, "{phrase}");
        }
    }

    #[test]
    fn repairs_near_misses_and_says_so() {
        for (heard, book) in [
            ("Mathew", "Matthew"),
            ("Phillipians", "Philippians"),
            ("Colosians", "Colossians"),
            ("Galations", "Galatians"),
            ("Ezekial", "Ezekiel"),
            ("1 Corintians", "1 Corinthians"),
            ("Deuteronomie", "Deuteronomy"),
        ] {
            let found = resolve_spoken_book(heard).unwrap_or_else(|| panic!("{heard}"));
            assert_eq!(found.name, book);
            assert!(found.repaired, "{heard} is a repair, not a name");
        }
    }

    #[test]
    fn never_repairs_everyday_words_into_books() {
        for word in ["number", "judge", "romance", "matter", "mother", "isaac", "seconds"] {
            assert_eq!(resolve_spoken_book(word), None, "{word}");
        }
    }

    #[test]
    fn exact_names_are_not_marked_repaired() {
        assert!(!resolve_spoken_book("Matthew").unwrap().repaired);
        assert!(!resolve_spoken_book("Romains").unwrap().repaired);
    }

    #[test]
    fn leading_resolution_ignores_what_follows_the_name() {
        assert_eq!(resolve_leading_spoken_book("john and we see").map(|b| b.name), Some("John"));
        assert_eq!(resolve_leading_spoken_book("the book of jean").map(|b| b.name), Some("John"));
        assert_eq!(resolve_leading_spoken_book("1 corinthiens alors").map(|b| b.name), Some("1 Corinthians"));
    }
}
