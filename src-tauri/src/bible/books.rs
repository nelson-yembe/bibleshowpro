pub struct CanonBook {
    pub number: i32,
    pub name: &'static str,
    pub aliases: &'static [&'static str],
    pub chapters: i32,
}

pub const CANONICAL_BOOKS: &[CanonBook] = &[
    CanonBook { number: 1, name: "Genesis", aliases: &["gen", "ge", "gn"], chapters: 50 },
    CanonBook { number: 2, name: "Exodus", aliases: &["exod", "ex", "exo"], chapters: 40 },
    CanonBook { number: 3, name: "Leviticus", aliases: &["lev", "le", "lv"], chapters: 27 },
    CanonBook { number: 4, name: "Numbers", aliases: &["num", "nu", "nm", "nb", "nations"], chapters: 36 },
    CanonBook { number: 5, name: "Deuteronomy", aliases: &["deut", "deu", "dt"], chapters: 34 },
    CanonBook { number: 6, name: "Joshua", aliases: &["josh", "jos", "jsh"], chapters: 24 },
    CanonBook { number: 7, name: "Judges", aliases: &["judg", "jdg", "jg"], chapters: 21 },
    CanonBook { number: 8, name: "Ruth", aliases: &["ru", "rt"], chapters: 4 },
    CanonBook { number: 9, name: "1 Samuel", aliases: &["1 sam", "1 samuel", "1sam", "1sa"], chapters: 31 },
    CanonBook { number: 10, name: "2 Samuel", aliases: &["2 sam", "2 samuel", "2sam", "2sa"], chapters: 24 },
    CanonBook { number: 11, name: "1 Kings", aliases: &["1 kgs", "1 kings", "1kgs", "1ki"], chapters: 22 },
    CanonBook { number: 12, name: "2 Kings", aliases: &["2 kgs", "2 kings", "2kgs", "2ki"], chapters: 25 },
    CanonBook { number: 13, name: "1 Chronicles", aliases: &["1 chr", "1 chronicles", "1chr", "1ch"], chapters: 29 },
    CanonBook { number: 14, name: "2 Chronicles", aliases: &["2 chr", "2 chronicles", "2chr", "2ch"], chapters: 36 },
    CanonBook { number: 15, name: "Ezra", aliases: &["ezr"], chapters: 10 },
    CanonBook { number: 16, name: "Nehemiah", aliases: &["neh", "ne"], chapters: 13 },
    CanonBook { number: 17, name: "Esther", aliases: &["est", "es"], chapters: 10 },
    CanonBook { number: 18, name: "Job", aliases: &["jb"], chapters: 42 },
    CanonBook { number: 19, name: "Psalms", aliases: &["ps", "psa", "psalm", "psm"], chapters: 150 },
    CanonBook { number: 20, name: "Proverbs", aliases: &["prov", "pro", "prv", "pr"], chapters: 31 },
    CanonBook { number: 21, name: "Ecclesiastes", aliases: &["eccl", "ecc", "ec"], chapters: 12 },
    CanonBook { number: 22, name: "Song of Solomon", aliases: &["song", "sos", "solomon", "song of songs", "canticles"], chapters: 8 },
    CanonBook { number: 23, name: "Isaiah", aliases: &["isa", "is"], chapters: 66 },
    CanonBook { number: 24, name: "Jeremiah", aliases: &["jer", "je", "jr"], chapters: 52 },
    CanonBook { number: 25, name: "Lamentations", aliases: &["lam", "la", "lamentation", "lamentations"], chapters: 5 },
    CanonBook { number: 26, name: "Ezekiel", aliases: &["ezek", "eze", "ezk"], chapters: 48 },
    CanonBook { number: 27, name: "Daniel", aliases: &["dan", "da", "dn"], chapters: 12 },
    CanonBook { number: 28, name: "Hosea", aliases: &["hos", "ho"], chapters: 14 },
    CanonBook { number: 29, name: "Joel", aliases: &["joe", "jl"], chapters: 3 },
    CanonBook { number: 30, name: "Amos", aliases: &["am"], chapters: 9 },
    CanonBook { number: 31, name: "Obadiah", aliases: &["obad", "ob"], chapters: 1 },
    CanonBook { number: 32, name: "Jonah", aliases: &["jnh", "jon"], chapters: 4 },
    CanonBook { number: 33, name: "Micah", aliases: &["mic", "mc"], chapters: 7 },
    CanonBook { number: 34, name: "Nahum", aliases: &["nah", "na"], chapters: 3 },
    CanonBook { number: 35, name: "Habakkuk", aliases: &["hab", "hb"], chapters: 3 },
    CanonBook { number: 36, name: "Zephaniah", aliases: &["zeph", "zep", "zp"], chapters: 3 },
    CanonBook { number: 37, name: "Haggai", aliases: &["hag", "hg"], chapters: 2 },
    CanonBook { number: 38, name: "Zechariah", aliases: &["zech", "zec", "zc"], chapters: 14 },
    CanonBook { number: 39, name: "Malachi", aliases: &["mal", "ml"], chapters: 4 },
    CanonBook { number: 40, name: "Matthew", aliases: &["matt", "mat", "mt"], chapters: 28 },
    CanonBook { number: 41, name: "Mark", aliases: &["mk", "mar", "mrk"], chapters: 16 },
    CanonBook { number: 42, name: "Luke", aliases: &["lk", "luk", "lu"], chapters: 24 },
    CanonBook { number: 43, name: "John", aliases: &["jn", "jhn", "joh", "jo", "join"], chapters: 21 },
    CanonBook { number: 44, name: "Acts", aliases: &["act", "ac"], chapters: 28 },
    CanonBook { number: 45, name: "Romans", aliases: &["rom", "ro", "rm"], chapters: 16 },
    CanonBook { number: 46, name: "1 Corinthians", aliases: &["1 cor", "1 corinthians", "1cor", "1co"], chapters: 16 },
    CanonBook { number: 47, name: "2 Corinthians", aliases: &["2 cor", "2 corinthians", "2cor", "2co"], chapters: 13 },
    CanonBook { number: 48, name: "Galatians", aliases: &["gal", "ga"], chapters: 6 },
    CanonBook { number: 49, name: "Ephesians", aliases: &["eph", "ep"], chapters: 6 },
    CanonBook { number: 50, name: "Philippians", aliases: &["phil", "php", "pp"], chapters: 4 },
    CanonBook { number: 51, name: "Colossians", aliases: &["col", "co"], chapters: 4 },
    CanonBook { number: 52, name: "1 Thessalonians", aliases: &["1 thess", "1 thessalonians", "1thess", "1th"], chapters: 5 },
    CanonBook { number: 53, name: "2 Thessalonians", aliases: &["2 thess", "2 thessalonians", "2thess", "2th"], chapters: 3 },
    CanonBook { number: 54, name: "1 Timothy", aliases: &["1 tim", "1 timothy", "1tim", "1ti"], chapters: 6 },
    CanonBook { number: 55, name: "2 Timothy", aliases: &["2 tim", "2 timothy", "2tim", "2ti"], chapters: 4 },
    CanonBook { number: 56, name: "Titus", aliases: &["tit", "ti"], chapters: 3 },
    CanonBook { number: 57, name: "Philemon", aliases: &["phlm", "phm"], chapters: 1 },
    CanonBook { number: 58, name: "Hebrews", aliases: &["heb", "he"], chapters: 13 },
    CanonBook { number: 59, name: "James", aliases: &["jas", "jm"], chapters: 5 },
    CanonBook { number: 60, name: "1 Peter", aliases: &["1 pet", "1 peter", "1pet", "1pe"], chapters: 5 },
    CanonBook { number: 61, name: "2 Peter", aliases: &["2 pet", "2 peter", "2pet", "2pe"], chapters: 3 },
    CanonBook { number: 62, name: "1 John", aliases: &["1 jn", "1 john", "1john", "1jo"], chapters: 5 },
    CanonBook { number: 63, name: "2 John", aliases: &["2 jn", "2 john", "2john", "2jo"], chapters: 1 },
    CanonBook { number: 64, name: "3 John", aliases: &["3 jn", "3 john", "3john", "3jo"], chapters: 1 },
    CanonBook { number: 65, name: "Jude", aliases: &["jud", "jd"], chapters: 1 },
    CanonBook { number: 66, name: "Revelation", aliases: &["rev", "re", "revelations", "apocalypse"], chapters: 22 },
];

pub fn normalize_book_key(input: &str) -> String {
    input
        .trim()
        .to_lowercase()
        .replace('.', "")
        .replace('-', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn max_chapters_for_book(book_number: i32) -> i32 {
    CANONICAL_BOOKS
        .iter()
        .find(|book| book.number == book_number)
        .map(|book| book.chapters)
        .unwrap_or(150)
}

pub fn resolve_book(name: &str) -> Option<(i32, &'static str)> {
    let key = normalize_book_key(name);
    if key.is_empty() {
        return None;
    }

    for book in CANONICAL_BOOKS {
        if key == normalize_book_key(book.name) {
            return Some((book.number, book.name));
        }
        for alias in book.aliases {
            if key == normalize_book_key(alias) {
                return Some((book.number, book.name));
            }
        }
    }

    for book in CANONICAL_BOOKS {
        let canonical = normalize_book_key(book.name);
        if key == canonical || key.ends_with(&canonical) || canonical.ends_with(&key) {
            return Some((book.number, book.name));
        }
        for alias in book.aliases {
            let alias_key = normalize_book_key(alias);
            if key == alias_key || key.ends_with(&alias_key) {
                return Some((book.number, book.name));
            }
        }
    }

    None
}
