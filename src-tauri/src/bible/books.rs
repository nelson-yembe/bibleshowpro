pub struct CanonBook {
    pub number: i32,
    pub name: &'static str,
    pub aliases: &'static [&'static str],
}

pub const CANONICAL_BOOKS: &[CanonBook] = &[
    CanonBook { number: 1, name: "Genesis", aliases: &["gen", "ge", "gn"] },
    CanonBook { number: 2, name: "Exodus", aliases: &["exod", "ex", "exo"] },
    CanonBook { number: 3, name: "Leviticus", aliases: &["lev", "le", "lv"] },
    CanonBook { number: 4, name: "Numbers", aliases: &["num", "nu", "nm", "nb"] },
    CanonBook { number: 5, name: "Deuteronomy", aliases: &["deut", "deu", "dt"] },
    CanonBook { number: 6, name: "Joshua", aliases: &["josh", "jos", "jsh"] },
    CanonBook { number: 7, name: "Judges", aliases: &["judg", "jdg", "jg"] },
    CanonBook { number: 8, name: "Ruth", aliases: &["ru", "rt"] },
    CanonBook { number: 9, name: "1 Samuel", aliases: &["1 sam", "1 samuel", "1sam", "1sa"] },
    CanonBook { number: 10, name: "2 Samuel", aliases: &["2 sam", "2 samuel", "2sam", "2sa"] },
    CanonBook { number: 11, name: "1 Kings", aliases: &["1 kgs", "1 kings", "1kgs", "1ki"] },
    CanonBook { number: 12, name: "2 Kings", aliases: &["2 kgs", "2 kings", "2kgs", "2ki"] },
    CanonBook { number: 13, name: "1 Chronicles", aliases: &["1 chr", "1 chronicles", "1chr", "1ch"] },
    CanonBook { number: 14, name: "2 Chronicles", aliases: &["2 chr", "2 chronicles", "2chr", "2ch"] },
    CanonBook { number: 15, name: "Ezra", aliases: &["ezr"] },
    CanonBook { number: 16, name: "Nehemiah", aliases: &["neh", "ne"] },
    CanonBook { number: 17, name: "Esther", aliases: &["est", "es"] },
    CanonBook { number: 18, name: "Job", aliases: &["jb"] },
    CanonBook { number: 19, name: "Psalms", aliases: &["ps", "psa", "psalm", "psm"] },
    CanonBook { number: 20, name: "Proverbs", aliases: &["prov", "pro", "prv", "pr"] },
    CanonBook { number: 21, name: "Ecclesiastes", aliases: &["eccl", "ecc", "ec"] },
    CanonBook { number: 22, name: "Song of Solomon", aliases: &["song", "sos", "solomon", "song of songs", "canticles"] },
    CanonBook { number: 23, name: "Isaiah", aliases: &["isa", "is"] },
    CanonBook { number: 24, name: "Jeremiah", aliases: &["jer", "je", "jr"] },
    CanonBook { number: 25, name: "Lamentations", aliases: &["lam", "la"] },
    CanonBook { number: 26, name: "Ezekiel", aliases: &["ezek", "eze", "ezk"] },
    CanonBook { number: 27, name: "Daniel", aliases: &["dan", "da", "dn"] },
    CanonBook { number: 28, name: "Hosea", aliases: &["hos", "ho"] },
    CanonBook { number: 29, name: "Joel", aliases: &["joe", "jl"] },
    CanonBook { number: 30, name: "Amos", aliases: &["am"] },
    CanonBook { number: 31, name: "Obadiah", aliases: &["obad", "ob"] },
    CanonBook { number: 32, name: "Jonah", aliases: &["jnh", "jon"] },
    CanonBook { number: 33, name: "Micah", aliases: &["mic", "mc"] },
    CanonBook { number: 34, name: "Nahum", aliases: &["nah", "na"] },
    CanonBook { number: 35, name: "Habakkuk", aliases: &["hab", "hb"] },
    CanonBook { number: 36, name: "Zephaniah", aliases: &["zeph", "zep", "zp"] },
    CanonBook { number: 37, name: "Haggai", aliases: &["hag", "hg"] },
    CanonBook { number: 38, name: "Zechariah", aliases: &["zech", "zec", "zc"] },
    CanonBook { number: 39, name: "Malachi", aliases: &["mal", "ml"] },
    CanonBook { number: 40, name: "Matthew", aliases: &["matt", "mat", "mt"] },
    CanonBook { number: 41, name: "Mark", aliases: &["mk", "mar", "mrk"] },
    CanonBook { number: 42, name: "Luke", aliases: &["lk", "luk", "lu"] },
    CanonBook { number: 43, name: "John", aliases: &["jn", "jhn", "joh", "jo"] },
    CanonBook { number: 44, name: "Acts", aliases: &["act", "ac"] },
    CanonBook { number: 45, name: "Romans", aliases: &["rom", "ro", "rm"] },
    CanonBook { number: 46, name: "1 Corinthians", aliases: &["1 cor", "1 corinthians", "1cor", "1co"] },
    CanonBook { number: 47, name: "2 Corinthians", aliases: &["2 cor", "2 corinthians", "2cor", "2co"] },
    CanonBook { number: 48, name: "Galatians", aliases: &["gal", "ga"] },
    CanonBook { number: 49, name: "Ephesians", aliases: &["eph", "ep"] },
    CanonBook { number: 50, name: "Philippians", aliases: &["phil", "php", "pp"] },
    CanonBook { number: 51, name: "Colossians", aliases: &["col", "co"] },
    CanonBook { number: 52, name: "1 Thessalonians", aliases: &["1 thess", "1 thessalonians", "1thess", "1th"] },
    CanonBook { number: 53, name: "2 Thessalonians", aliases: &["2 thess", "2 thessalonians", "2thess", "2th"] },
    CanonBook { number: 54, name: "1 Timothy", aliases: &["1 tim", "1 timothy", "1tim", "1ti"] },
    CanonBook { number: 55, name: "2 Timothy", aliases: &["2 tim", "2 timothy", "2tim", "2ti"] },
    CanonBook { number: 56, name: "Titus", aliases: &["tit", "ti"] },
    CanonBook { number: 57, name: "Philemon", aliases: &["phlm", "phm"] },
    CanonBook { number: 58, name: "Hebrews", aliases: &["heb", "he"] },
    CanonBook { number: 59, name: "James", aliases: &["jas", "jm"] },
    CanonBook { number: 60, name: "1 Peter", aliases: &["1 pet", "1 peter", "1pet", "1pe"] },
    CanonBook { number: 61, name: "2 Peter", aliases: &["2 pet", "2 peter", "2pet", "2pe"] },
    CanonBook { number: 62, name: "1 John", aliases: &["1 jn", "1 john", "1john", "1jo"] },
    CanonBook { number: 63, name: "2 John", aliases: &["2 jn", "2 john", "2john", "2jo"] },
    CanonBook { number: 64, name: "3 John", aliases: &["3 jn", "3 john", "3john", "3jo"] },
    CanonBook { number: 65, name: "Jude", aliases: &["jud", "jd"] },
    CanonBook { number: 66, name: "Revelation", aliases: &["rev", "re", "revelations", "apocalypse"] },
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
