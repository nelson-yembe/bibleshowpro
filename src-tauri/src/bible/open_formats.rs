//! Bibles in the open formats churches already have: Zefania XML, OSIS XML and USFM.
//!
//! Each reader turns a file into verses keyed by the app's book numbers (1 = Genesis,
//! 66 = Revelation) plus whatever metadata the file carries; `to_payload` builds the same
//! payload the JSON importer takes, so both share one import path.

use std::collections::{BTreeMap, HashMap};

use once_cell::sync::Lazy;
use quick_xml::events::{BytesRef, Event};
use quick_xml::Reader;
use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::bible::books::CANONICAL_BOOKS;
use crate::bible::import::{ImportBook, ImportPayload, ImportTranslation, ImportVerse};

/// OSIS book ids, in canonical order (index + 1 = book number).
const OSIS_BOOKS: [&str; 66] = [
    "Gen", "Exod", "Lev", "Num", "Deut", "Josh", "Judg", "Ruth", "1Sam", "2Sam", "1Kgs", "2Kgs", "1Chr", "2Chr",
    "Ezra", "Neh", "Esth", "Job", "Ps", "Prov", "Eccl", "Song", "Isa", "Jer", "Lam", "Ezek", "Dan", "Hos", "Joel",
    "Amos", "Obad", "Jonah", "Mic", "Nah", "Hab", "Zeph", "Hag", "Zech", "Mal", "Matt", "Mark", "Luke", "John",
    "Acts", "Rom", "1Cor", "2Cor", "Gal", "Eph", "Phil", "Col", "1Thess", "2Thess", "1Tim", "2Tim", "Titus", "Phlm",
    "Heb", "Jas", "1Pet", "2Pet", "1John", "2John", "3John", "Jude", "Rev",
];

/// USFM book codes, in canonical order.
const USFM_BOOKS: [&str; 66] = [
    "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA", "1KI", "2KI", "1CH", "2CH", "EZR", "NEH",
    "EST", "JOB", "PSA", "PRO", "ECC", "SNG", "ISA", "JER", "LAM", "EZK", "DAN", "HOS", "JOL", "AMO", "OBA", "JON",
    "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL", "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL",
    "EPH", "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS", "1PE", "2PE", "1JN", "2JN", "3JN",
    "JUD", "REV",
];

/// What a file says about itself, plus its verses. Fields a format does not carry stay None.
#[derive(Debug, Default)]
pub struct ParsedBible {
    pub format: &'static str,
    pub name: Option<String>,
    pub abbreviation: Option<String>,
    pub language: Option<String>,
    pub copyright: Option<String>,
    /// Book names as the file spells them ("Genèse"), by book number.
    pub book_names: HashMap<i32, String>,
    /// (book, chapter, verse) → text. Ordered, and a repeated verse keeps its first text.
    pub verses: BTreeMap<(i32, i32, i32), String>,
}

/// The operator's final say on how the version is listed.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BibleMeta {
    pub name: String,
    pub abbreviation: String,
    pub language: String,
    #[serde(default)]
    pub copyright: Option<String>,
}

/// What the import screen shows before anything is written.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenBiblePreview {
    pub format: String,
    pub name: String,
    pub abbreviation: String,
    pub language: String,
    pub copyright: Option<String>,
    pub book_count: usize,
    pub verse_count: usize,
    pub warnings: Vec<String>,
}

fn clean(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn non_empty(text: Option<String>) -> Option<String> {
    text.map(|t| clean(&t)).filter(|t| !t.is_empty())
}

/// "fra", "FRE", "French", "fr-FR" → "fr". Unknown codes pass through lowercased.
pub fn normalize_language(raw: &str) -> String {
    let lower = raw.trim().to_lowercase();
    let primary = lower.split(['-', '_']).next().unwrap_or("").to_string();
    match primary.as_str() {
        "eng" | "english" => "en".into(),
        "fra" | "fre" | "french" | "francais" | "français" => "fr".into(),
        "spa" | "spanish" | "espanol" | "español" => "es".into(),
        "por" | "portuguese" => "pt".into(),
        "deu" | "ger" | "german" => "de".into(),
        _ => primary,
    }
}

fn push_entity(out: &mut String, reference: &BytesRef) {
    if let Ok(Some(ch)) = reference.resolve_char_ref() {
        out.push(ch);
        return;
    }
    match reference.decode().as_deref() {
        Ok("amp") => out.push('&'),
        Ok("lt") => out.push('<'),
        Ok("gt") => out.push('>'),
        Ok("quot") => out.push('"'),
        Ok("apos") => out.push('\''),
        _ => {}
    }
}

fn local_name(name: &[u8]) -> String {
    let full = String::from_utf8_lossy(name);
    full.rsplit(':').next().unwrap_or("").to_string()
}

fn attr(e: &quick_xml::events::BytesStart, key: &str) -> Option<String> {
    e.attributes()
        .flatten()
        .find(|a| local_name(a.key.as_ref()).eq_ignore_ascii_case(key))
        .and_then(|a| a.unescape_value().ok().map(|v| v.to_string()))
}

fn number(text: Option<String>) -> Option<i32> {
    // "3-4" (a verse bridge) counts as its first verse.
    text.and_then(|t| t.trim().split(|c: char| !c.is_ascii_digit()).next().and_then(|n| n.parse().ok()))
}

/// Zefania XML: `<XMLBIBLE><BIBLEBOOK bnumber bname><CHAPTER cnumber><VERS vnumber>`.
fn parse_zefania(xml: &str) -> Result<ParsedBible, String> {
    let mut reader = Reader::from_str(xml);
    let mut bible = ParsedBible {
        format: "Zefania XML",
        ..Default::default()
    };
    let (mut book, mut chapter) = (0, 0);
    let mut verse: Option<(i32, String)> = None;
    let mut info_field: Option<String> = None;
    let mut info_text = String::new();
    let mut skip_depth = 0usize;

    loop {
        match reader.read_event().map_err(|e| format!("Not readable as Zefania XML: {e}"))? {
            Event::Start(e) => {
                let name = local_name(e.name().as_ref()).to_uppercase();
                match name.as_str() {
                    "XMLBIBLE" => bible.name = non_empty(attr(&e, "biblename")),
                    "TITLE" | "IDENTIFIER" | "LANGUAGE" | "RIGHTS" if verse.is_none() => {
                        info_field = Some(name);
                        info_text.clear();
                    }
                    "BIBLEBOOK" => {
                        book = number(attr(&e, "bnumber")).unwrap_or(0);
                        if let Some(bname) = non_empty(attr(&e, "bname")) {
                            bible.book_names.insert(book, bname);
                        }
                    }
                    "CHAPTER" => chapter = number(attr(&e, "cnumber")).unwrap_or(0),
                    "VERS" => verse = number(attr(&e, "vnumber")).map(|v| (v, String::new())),
                    // Footnotes and cross-references are not read aloud or projected.
                    "NOTE" | "XREF" if verse.is_some() => skip_depth += 1,
                    _ => {}
                }
            }
            Event::Text(t) => {
                let text = t.decode().map_err(|e| e.to_string())?;
                if skip_depth > 0 {
                } else if let Some((_, buf)) = verse.as_mut() {
                    buf.push_str(&text);
                } else if info_field.is_some() {
                    info_text.push_str(&text);
                }
            }
            Event::CData(t) => {
                if let (Some((_, buf)), 0) = (verse.as_mut(), skip_depth) {
                    buf.push_str(&String::from_utf8_lossy(&t.into_inner()));
                }
            }
            Event::GeneralRef(r) => {
                if skip_depth > 0 {
                } else if let Some((_, buf)) = verse.as_mut() {
                    push_entity(buf, &r);
                } else if info_field.is_some() {
                    push_entity(&mut info_text, &r);
                }
            }
            Event::Empty(e) => {
                if local_name(e.name().as_ref()).eq_ignore_ascii_case("BR") {
                    if let Some((_, buf)) = verse.as_mut() {
                        buf.push(' ');
                    }
                }
            }
            Event::End(e) => {
                let name = local_name(e.name().as_ref()).to_uppercase();
                match name.as_str() {
                    "VERS" => {
                        if let Some((v, text)) = verse.take() {
                            let text = clean(&text);
                            if book > 0 && chapter > 0 && !text.is_empty() {
                                bible.verses.entry((book, chapter, v)).or_insert(text);
                            }
                        }
                    }
                    "NOTE" | "XREF" if skip_depth > 0 => skip_depth -= 1,
                    _ if info_field.as_deref() == Some(name.as_str()) => {
                        let value = non_empty(Some(info_text.clone()));
                        match name.as_str() {
                            "TITLE" => bible.name = bible.name.take().or(value),
                            "IDENTIFIER" => bible.abbreviation = value,
                            "LANGUAGE" => bible.language = value.map(|l| normalize_language(&l)),
                            _ => bible.copyright = value,
                        }
                        info_field = None;
                    }
                    _ => {}
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    Ok(bible)
}

fn osis_reference(id: &str) -> Option<(i32, i32, i32)> {
    // "Gen.1.1", possibly "Gen.1.1 Gen.1.2" for a merged verse: the first one counts.
    let first = id.split_whitespace().next()?;
    let mut parts = first.split('.');
    let code = parts.next()?;
    let book = OSIS_BOOKS.iter().position(|b| b.eq_ignore_ascii_case(code))? as i32 + 1;
    let chapter = parts.next()?.parse().ok()?;
    let verse = parts.next()?.parse().ok()?;
    Some((book, chapter, verse))
}

/// OSIS XML, with verses either as containers (`<verse osisID>text</verse>`) or as
/// milestones (`<verse sID/>text<verse eID/>`).
fn parse_osis(xml: &str) -> Result<ParsedBible, String> {
    let mut reader = Reader::from_str(xml);
    let mut bible = ParsedBible {
        format: "OSIS XML",
        ..Default::default()
    };
    let mut current: Option<((i32, i32, i32), String)> = None;
    let mut skip_depth = 0usize;
    let mut work_title: Option<String> = None;
    let mut in_work_title = false;
    let mut in_rights = false;
    let mut header_text = String::new();

    let finish = |current: &mut Option<((i32, i32, i32), String)>, bible: &mut ParsedBible| {
        if let Some((key, text)) = current.take() {
            let text = clean(&text);
            if !text.is_empty() {
                bible.verses.entry(key).or_insert(text);
            }
        }
    };

    loop {
        match reader.read_event().map_err(|e| format!("Not readable as OSIS XML: {e}"))? {
            Event::Start(e) | Event::Empty(e) if local_name(e.name().as_ref()) == "verse" => {
                if attr(&e, "eID").is_some() {
                    finish(&mut current, &mut bible);
                } else if let Some(key) = attr(&e, "osisID").as_deref().and_then(osis_reference) {
                    finish(&mut current, &mut bible);
                    current = Some((key, String::new()));
                }
            }
            Event::Start(e) => match local_name(e.name().as_ref()).as_str() {
                "osisText" => {
                    bible.abbreviation = non_empty(attr(&e, "osisIDWork"));
                    bible.language = attr(&e, "lang").map(|l| normalize_language(&l));
                }
                "title" if work_title.is_none() && current.is_none() && bible.verses.is_empty() => {
                    in_work_title = true;
                    header_text.clear();
                }
                "rights" => {
                    in_rights = true;
                    header_text.clear();
                }
                // Notes, headings and cross-references are not verse text.
                "note" | "title" | "reference" if current.is_some() => skip_depth += 1,
                _ => {}
            },
            Event::End(e) => match local_name(e.name().as_ref()).as_str() {
                "verse" => finish(&mut current, &mut bible),
                "note" | "title" | "reference" if skip_depth > 0 => skip_depth -= 1,
                "title" if in_work_title => {
                    in_work_title = false;
                    work_title = non_empty(Some(header_text.clone()));
                }
                "rights" => {
                    in_rights = false;
                    bible.copyright = non_empty(Some(header_text.clone()));
                }
                _ => {}
            },
            Event::Text(t) => {
                let text = t.decode().map_err(|e| e.to_string())?;
                if in_work_title || in_rights {
                    header_text.push_str(&text);
                } else if let (Some((_, buf)), 0) = (current.as_mut(), skip_depth) {
                    buf.push_str(&text);
                }
            }
            Event::GeneralRef(r) => {
                if in_work_title || in_rights {
                    push_entity(&mut header_text, &r);
                } else if let (Some((_, buf)), 0) = (current.as_mut(), skip_depth) {
                    push_entity(buf, &r);
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    finish(&mut current, &mut bible);
    bible.name = work_title;
    Ok(bible)
}

/// The plain `bible / book / chapter / verse` family: the "holy-bible-xml" layout
/// (`<book number="1"><chapter number="1"><verse number="1">`) and OpenSong's
/// (`<b n="Genesis"><c n="1"><v n="1">`). A book is known by its number, else its name,
/// else its position in the file.
fn parse_simple_xml(xml: &str) -> Result<ParsedBible, String> {
    let mut reader = Reader::from_str(xml);
    let mut bible = ParsedBible {
        format: "Bible XML",
        ..Default::default()
    };
    let (mut book, mut chapter, mut books_seen) = (0, 0, 0);
    let mut verse: Option<(i32, String)> = None;
    let mut skip_depth = 0usize;

    loop {
        match reader.read_event().map_err(|e| format!("Not readable as Bible XML: {e}"))? {
            Event::Start(e) => match local_name(e.name().as_ref()).to_lowercase().as_str() {
                "bible" => {
                    bible.name = non_empty(attr(&e, "translation").or_else(|| attr(&e, "name")));
                    bible.copyright = non_empty(attr(&e, "status").or_else(|| attr(&e, "copyright")));
                    bible.abbreviation = non_empty(attr(&e, "abbreviation"));
                    bible.language = attr(&e, "language").map(|l| normalize_language(&l));
                }
                "book" | "b" => {
                    books_seen += 1;
                    let label = attr(&e, "n").or_else(|| attr(&e, "name"));
                    book = number(attr(&e, "number"))
                        .or_else(|| label.as_deref().and_then(|n| n.trim().parse().ok()))
                        .or_else(|| {
                            label
                                .as_deref()
                                .and_then(crate::bible::spoken_book::resolve_spoken_book)
                                .filter(|b| !b.repaired)
                                .map(|b| b.number)
                        })
                        .unwrap_or(books_seen);
                    if let Some(name) = non_empty(label.filter(|l| l.trim().parse::<i32>().is_err())) {
                        bible.book_names.insert(book, name);
                    }
                }
                "chapter" | "c" => chapter = number(attr(&e, "number").or_else(|| attr(&e, "n"))).unwrap_or(0),
                "verse" | "v" => {
                    verse = number(attr(&e, "number").or_else(|| attr(&e, "n"))).map(|v| (v, String::new()))
                }
                "note" if verse.is_some() => skip_depth += 1,
                _ => {}
            },
            Event::End(e) => match local_name(e.name().as_ref()).to_lowercase().as_str() {
                "verse" | "v" => {
                    if let Some((v, text)) = verse.take() {
                        let text = clean(&text);
                        if book > 0 && chapter > 0 && !text.is_empty() {
                            bible.verses.entry((book, chapter, v)).or_insert(text);
                        }
                    }
                }
                "note" if skip_depth > 0 => skip_depth -= 1,
                _ => {}
            },
            Event::Text(t) => {
                if let (Some((_, buf)), 0) = (verse.as_mut(), skip_depth) {
                    buf.push_str(&t.decode().map_err(|e| e.to_string())?);
                }
            }
            Event::GeneralRef(r) => {
                if let (Some((_, buf)), 0) = (verse.as_mut(), skip_depth) {
                    push_entity(buf, &r);
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    Ok(bible)
}

/// Markers whose text is not part of any verse: headings, titles, introductions.
fn usfm_is_heading(marker: &str) -> bool {
    let base = marker.trim_end_matches(|c: char| c.is_ascii_digit());
    matches!(
        base,
        "id" | "ide" | "h" | "toc" | "toca" | "mt" | "mte" | "ms" | "mr" | "s" | "sr" | "r" | "d" | "sp" | "cl" | "cp"
            | "ca" | "va" | "vp" | "rem" | "sts" | "usfm" | "imt" | "is" | "ip" | "ipi" | "im" | "imi" | "ipq" | "imq"
            | "ipr" | "iq" | "ib" | "ili" | "iot" | "io" | "ior" | "iex" | "ie" | "periph" | "restore"
    )
}

/// USFM, one or more books per file: `\id GEN`, `\h Genesis`, `\c 1`, `\v 1 text`.
fn parse_usfm(sources: &[String]) -> Result<ParsedBible, String> {
    // Footnotes, cross-references and their contents go first, then word-level markup.
    static NOTES: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?s)\\(f|fe|ef|x|ex)\s.*?\\(f|fe|ef|x|ex)\*").unwrap());
    static WORD: Lazy<Regex> = Lazy::new(|| Regex::new(r"\\\+?w\s([^|\\]*)(\|[^\\]*)?\\\+?w\*").unwrap());
    static CHAR_END: Lazy<Regex> = Lazy::new(|| Regex::new(r"\\\+?[a-z]+[0-9]*\*").unwrap());
    static MARKER: Lazy<Regex> = Lazy::new(|| Regex::new(r"\\\+?([a-z]+[0-9]*)\s?").unwrap());

    let mut bible = ParsedBible {
        format: "USFM",
        ..Default::default()
    };
    for source in sources {
        let text = NOTES.replace_all(source, " ");
        let text = WORD.replace_all(&text, "$1");
        let text = CHAR_END.replace_all(&text, "");

        let (mut book, mut chapter) = (0, 0);
        let mut verse: Option<(i32, String)> = None;
        let mut heading = false;

        let flush = |verse: &mut Option<(i32, String)>, bible: &mut ParsedBible, book: i32, chapter: i32| {
            if let Some((v, t)) = verse.take() {
                let t = clean(&t);
                if book > 0 && chapter > 0 && !t.is_empty() {
                    bible.verses.entry((book, chapter, v)).or_insert(t);
                }
            }
        };

        let mut cursor = 0;
        let markers: Vec<_> = MARKER.captures_iter(&text).collect();
        for (i, caps) in markers.iter().enumerate() {
            let whole = caps.get(0).unwrap();
            let marker = caps.get(1).unwrap().as_str();
            // Text between the previous marker and this one belongs to the previous marker.
            let before = &text[cursor..whole.start()];
            if !heading {
                if let Some((_, buf)) = verse.as_mut() {
                    buf.push_str(before);
                    buf.push(' ');
                }
            }
            cursor = whole.end();
            let content_end = markers.get(i + 1).map(|m| m.get(0).unwrap().start()).unwrap_or(text.len());
            let content = &text[cursor..content_end];
            let first_line = content.lines().next().unwrap_or("").trim();

            match marker {
                "id" => {
                    flush(&mut verse, &mut bible, book, chapter);
                    let code = first_line.split_whitespace().next().unwrap_or("").to_uppercase();
                    book = USFM_BOOKS.iter().position(|b| *b == code).map(|p| p as i32 + 1).unwrap_or(0);
                    chapter = 0;
                    heading = true;
                    cursor = content_end;
                }
                "h" | "toc2" | "toc1" | "mt" | "mt1" => {
                    if book > 0 && (marker == "h" || !bible.book_names.contains_key(&book)) && !first_line.is_empty() {
                        bible.book_names.insert(book, clean(first_line));
                    }
                    heading = true;
                    cursor = content_end;
                }
                "c" => {
                    flush(&mut verse, &mut bible, book, chapter);
                    chapter = number(Some(first_line.to_string())).unwrap_or(0);
                    heading = false;
                    let digits = content.find(|c: char| !c.is_ascii_digit() && !c.is_whitespace()).unwrap_or(content.len());
                    cursor += digits.min(first_line.len() + (content.len() - content.trim_start().len()));
                }
                "v" => {
                    flush(&mut verse, &mut bible, book, chapter);
                    let trimmed = content.trim_start();
                    let num_len = trimmed.find(char::is_whitespace).unwrap_or(trimmed.len());
                    verse = number(Some(trimmed[..num_len].to_string())).map(|v| (v, String::new()));
                    heading = false;
                    cursor += (content.len() - trimmed.len()) + num_len;
                }
                m if usfm_is_heading(m) => {
                    heading = true;
                    cursor = content_end;
                }
                _ => heading = false,
            }
        }
        if !heading {
            if let Some((_, buf)) = verse.as_mut() {
                buf.push_str(&text[cursor..]);
            }
        }
        flush(&mut verse, &mut bible, book, chapter);
    }
    Ok(bible)
}

/// Read one or more files of the same Bible. XML is told apart by its root element; plain
/// text with `\id` or `\v` markers is USFM.
pub fn parse_files(files: &[String]) -> Result<ParsedBible, String> {
    let first = files.first().ok_or("Choose at least one file.")?;
    let head: String = first.trim_start_matches('\u{feff}').trim_start().chars().take(4000).collect();
    let lower = head.to_lowercase();
    let parsed = if lower.contains("<xmlbible") {
        parse_zefania(first.trim_start_matches('\u{feff}'))?
    } else if lower.contains("<osis") {
        parse_osis(first.trim_start_matches('\u{feff}'))?
    } else if lower.contains("<bible") {
        parse_simple_xml(first.trim_start_matches('\u{feff}'))?
    } else if head.contains("\\id ") || head.contains("\\c ") || head.contains("\\v ") {
        parse_usfm(files)?
    } else {
        return Err("This file is not a Bible format the app reads (Zefania, OSIS, OpenSong or holy-bible XML, or USFM). For JSON, use Import JSON.".into());
    };
    if parsed.verses.is_empty() {
        return Err(format!("No verses were found in this {} file.", parsed.format));
    }
    Ok(parsed)
}

fn canonical(book: i32) -> Option<&'static crate::bible::books::CanonBook> {
    CANONICAL_BOOKS.iter().find(|b| b.number == book)
}

fn slug(text: &str) -> String {
    text.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_lowercase()
}

/// Initials of the name when the file names no abbreviation: "Louis Segond 1910" → "LS1910",
/// "The Holy Bible, New International Version®" → "NIV".
fn abbreviation_from(name: &str) -> String {
    const FILLER: &[&str] = &["the", "holy", "of", "la", "sainte", "de", "du", "des"];
    let words: Vec<&str> = name
        .split(|c: char| c.is_whitespace() || c == ',')
        .filter(|w| !w.is_empty() && !FILLER.contains(&w.to_lowercase().as_str()))
        .collect();
    // "Bible" is filler in a long title, but the point of "Amplified Bible".
    let skip_bible = words.iter().filter(|w| !w.eq_ignore_ascii_case("bible")).count() >= 3;
    let mut out = String::new();
    for word in words.into_iter().filter(|w| !(skip_bible && w.eq_ignore_ascii_case("bible"))) {
        if word.chars().all(|c| c.is_ascii_digit()) {
            out.push_str(word);
        } else if let Some(c) = word.chars().find(|c| c.is_alphanumeric()) {
            out.extend(c.to_uppercase());
        }
    }
    if out.is_empty() {
        "BIBLE".into()
    } else {
        out
    }
}

/// `fallback_name` is the file name, for formats that carry no title.
pub fn preview(parsed: &ParsedBible, existing_ids: &[String], fallback_name: Option<&str>) -> OpenBiblePreview {
    let name = parsed
        .name
        .clone()
        .or_else(|| non_empty(fallback_name.map(str::to_string)))
        .unwrap_or_else(|| "Imported Bible".into());
    let abbreviation = parsed.abbreviation.clone().unwrap_or_else(|| abbreviation_from(&name));
    let books: std::collections::BTreeSet<i32> = parsed.verses.keys().map(|(b, _, _)| *b).collect();
    let mut warnings = Vec::new();
    if books.len() < 66 {
        let has_ot = books.iter().any(|b| *b <= 39);
        let has_nt = books.iter().any(|b| *b >= 40);
        warnings.push(match (has_ot, has_nt) {
            (false, true) => format!("New Testament only: {} of 27 books.", books.len()),
            (true, false) => format!("Old Testament only: {} of 39 books.", books.len()),
            _ => format!("{} of 66 books; the rest are missing from the file.", books.len()),
        });
    }
    if existing_ids.iter().any(|id| *id == slug(&abbreviation)) {
        warnings.push(format!(
            "A version with the abbreviation {abbreviation} is already installed; importing replaces it."
        ));
    }
    OpenBiblePreview {
        format: parsed.format.to_string(),
        name,
        abbreviation,
        language: parsed.language.clone().unwrap_or_else(|| "en".into()),
        copyright: parsed.copyright.clone(),
        book_count: books.len(),
        verse_count: parsed.verses.len(),
        warnings,
    }
}

pub fn to_payload(parsed: ParsedBible, meta: &BibleMeta) -> Result<ImportPayload, String> {
    let abbreviation = clean(&meta.abbreviation);
    let id = slug(&abbreviation);
    if id.is_empty() {
        return Err("Give the version an abbreviation with letters or digits, such as LSG.".into());
    }
    let mut chapters: BTreeMap<i32, i32> = BTreeMap::new();
    for (book, chapter, _) in parsed.verses.keys() {
        let entry = chapters.entry(*book).or_insert(0);
        *entry = (*entry).max(*chapter);
    }
    let books = chapters
        .iter()
        .filter_map(|(book, chapter_count)| {
            let canon = canonical(*book)?;
            let abbreviation = canon.aliases.first().map(|a| {
                let mut chars = a.chars();
                chars.next().map(|c| c.to_uppercase().collect::<String>() + chars.as_str()).unwrap_or_default()
            });
            Some(ImportBook {
                book_number: *book,
                name: parsed.book_names.get(book).cloned().unwrap_or_else(|| canon.name.to_string()),
                abbreviation: abbreviation.unwrap_or_else(|| canon.name.to_string()),
                testament: if *book <= 39 { "OT".into() } else { "NT".into() },
                chapter_count: *chapter_count,
            })
        })
        .collect();
    let verses = parsed
        .verses
        .into_iter()
        .filter(|((book, _, _), _)| canonical(*book).is_some())
        .map(|((book_number, chapter, verse), text)| ImportVerse {
            book_number,
            chapter,
            verse,
            text,
        })
        .collect();
    Ok(ImportPayload {
        translation: ImportTranslation {
            id,
            name: clean(&meta.name),
            abbreviation,
            language: normalize_language(&meta.language),
            copyright: meta.copyright.clone().map(|c| clean(&c)).filter(|c| !c.is_empty()),
        },
        books,
        verses,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const ZEFANIA: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<XMLBIBLE biblename="Louis Segond 1910">
  <INFORMATION><title>Louis Segond 1910</title><identifier>LSG</identifier><language>FRA</language><rights>Domaine public</rights></INFORMATION>
  <BIBLEBOOK bnumber="1" bname="Genèse">
    <CHAPTER cnumber="1">
      <VERS vnumber="1">Au commencement, Dieu cr&#233;a les cieux &amp; la terre.</VERS>
      <VERS vnumber="2">La terre <STYLE css="x">&#233;tait</STYLE> informe<NOTE>une note</NOTE> et vide.</VERS>
    </CHAPTER>
  </BIBLEBOOK>
  <BIBLEBOOK bnumber="43" bname="Jean">
    <CHAPTER cnumber="3"><VERS vnumber="16">Car Dieu a tant aimé le monde.</VERS></CHAPTER>
  </BIBLEBOOK>
</XMLBIBLE>"#;

    #[test]
    fn reads_zefania_with_entities_markup_and_notes() {
        let bible = parse_files(&[ZEFANIA.to_string()]).unwrap();
        assert_eq!(bible.format, "Zefania XML");
        assert_eq!(bible.name.as_deref(), Some("Louis Segond 1910"));
        assert_eq!(bible.abbreviation.as_deref(), Some("LSG"));
        assert_eq!(bible.language.as_deref(), Some("fr"));
        assert_eq!(bible.copyright.as_deref(), Some("Domaine public"));
        assert_eq!(bible.verses[&(1, 1, 1)], "Au commencement, Dieu créa les cieux & la terre.");
        assert_eq!(bible.verses[&(1, 1, 2)], "La terre était informe et vide.");
        assert_eq!(bible.book_names[&43], "Jean");
    }

    #[test]
    fn reads_osis_container_verses() {
        let osis = r#"<osis><osisText osisIDWork="WEB" xml:lang="en"><header><work><title>World English Bible</title></work></header>
          <div type="book" osisID="John"><chapter osisID="John.3">
            <verse osisID="John.3.16">For God so loved the world<note>a note</note>, that he gave.</verse>
          </chapter></div></osisText></osis>"#;
        let bible = parse_files(&[osis.to_string()]).unwrap();
        assert_eq!(bible.name.as_deref(), Some("World English Bible"));
        assert_eq!(bible.abbreviation.as_deref(), Some("WEB"));
        assert_eq!(bible.verses[&(43, 3, 16)], "For God so loved the world, that he gave.");
    }

    #[test]
    fn reads_osis_milestone_verses() {
        let osis = r#"<osis><osisText osisIDWork="KJV"><div type="book" osisID="Gen"><chapter sID="Gen.1"/>
          <verse sID="Gen.1.1" osisID="Gen.1.1"/>In the beginning <hi type="italic">God</hi> created.<verse eID="Gen.1.1"/>
          <verse sID="Gen.1.2" osisID="Gen.1.2"/>And the earth was without form.<verse eID="Gen.1.2"/>
          <chapter eID="Gen.1"/></div></osisText></osis>"#;
        let bible = parse_files(&[osis.to_string()]).unwrap();
        assert_eq!(bible.verses[&(1, 1, 1)], "In the beginning God created.");
        assert_eq!(bible.verses[&(1, 1, 2)], "And the earth was without form.");
    }

    #[test]
    fn reads_usfm_without_footnotes_headings_or_word_markup() {
        let usfm = "\\id JHN World English Bible\n\\h Jean\n\\mt1 L'évangile selon Jean\n\\c 3\n\\s1 Nicodème\n\\p\n\\v 16 \\w For|strong=\"G1063\"\\w* God so loved\\f + \\fr 3:16 \\ft a footnote\\f* the world,\n\\q1 that he gave \\wj his Son\\wj*.\n\\v 17 For God sent not.\n";
        let bible = parse_files(&[usfm.to_string()]).unwrap();
        assert_eq!(bible.format, "USFM");
        assert_eq!(bible.book_names[&43], "Jean");
        assert_eq!(bible.verses[&(43, 3, 16)], "For God so loved the world, that he gave his Son.");
        assert_eq!(bible.verses[&(43, 3, 17)], "For God sent not.");
    }

    #[test]
    fn reads_usfm_spread_over_several_files() {
        let files = ["\\id GEN\n\\c 1\n\\v 1 In the beginning.\n".to_string(), "\\id REV\n\\c 22\n\\v 21 Amen.\n".to_string()];
        let bible = parse_files(&files).unwrap();
        assert_eq!(bible.verses.len(), 2);
        assert_eq!(bible.verses[&(66, 22, 21)], "Amen.");
    }

    #[test]
    fn rejects_files_in_no_known_format() {
        assert!(parse_files(&["just some text".to_string()]).unwrap_err().contains("not a Bible format"));
        assert!(parse_files(&[]).is_err());
    }

    #[test]
    fn previews_with_warnings_and_builds_the_import_payload() {
        let bible = parse_files(&[ZEFANIA.to_string()]).unwrap();
        let shown = preview(&bible, &["lsg".to_string()], None);
        assert_eq!((shown.book_count, shown.verse_count), (2, 3));
        assert!(shown.warnings.iter().any(|w| w.contains("2 of 66")));
        assert!(shown.warnings.iter().any(|w| w.contains("already installed")));

        let meta = BibleMeta {
            name: shown.name,
            abbreviation: shown.abbreviation,
            language: shown.language,
            copyright: shown.copyright,
        };
        let payload = to_payload(bible, &meta).unwrap();
        assert_eq!(payload.translation.id, "lsg");
        assert_eq!(payload.translation.language, "fr");
        assert_eq!(payload.books.len(), 2);
        assert_eq!(payload.books[0].name, "Genèse");
        assert_eq!(payload.books[0].testament, "OT");
        assert_eq!(payload.books[1].chapter_count, 3);
        assert_eq!(payload.verses.len(), 3);
    }

    #[test]
    fn reads_holy_bible_xml_by_book_number() {
        let xml = r#"<bible translation="New International Reader's Version" status="Copyright Biblica"><testament name="New">
          <book number="43"><chapter number="3"><verse number="16">God so loved the world.</verse></chapter></book></testament></bible>"#;
        let bible = parse_files(&[xml.to_string()]).unwrap();
        assert_eq!(bible.name.as_deref(), Some("New International Reader's Version"));
        assert_eq!(bible.copyright.as_deref(), Some("Copyright Biblica"));
        assert_eq!(bible.verses[&(43, 3, 16)], "God so loved the world.");
    }

    #[test]
    fn reads_opensong_xml_by_book_name() {
        let xml = r#"<bible><b n="Genesis"><c n="1"><v n="1">In the beginning.</v></c></b><b n="Jean"><c n="3"><v n="16">Car Dieu.</v></c></b></bible>"#;
        let bible = parse_files(&[xml.to_string()]).unwrap();
        assert_eq!(bible.verses[&(1, 1, 1)], "In the beginning.");
        assert_eq!(bible.verses[&(43, 3, 16)], "Car Dieu.");
        assert_eq!(bible.book_names[&43], "Jean");
    }

    #[test]
    fn makes_a_sensible_abbreviation_from_a_long_title() {
        assert_eq!(abbreviation_from("The Holy Bible, New International Version®"), "NIV");
        assert_eq!(abbreviation_from("The Holy Bible, New International Reader’s Version"), "NIRV");
        assert_eq!(abbreviation_from("Amplified Bible"), "AB");
        assert_eq!(abbreviation_from("Louis Segond 1910"), "LS1910");
    }

    #[test]
    fn names_a_titleless_file_after_the_file() {
        let xml = r#"<bible><b n="John"><c n="1"><v n="1">In the beginning.</v></c></b></bible>"#;
        let bible = parse_files(&[xml.to_string()]).unwrap();
        let shown = preview(&bible, &[], Some("The Holy Bible, New International Version®"));
        assert_eq!(shown.name, "The Holy Bible, New International Version®");
        assert_eq!(shown.abbreviation, "NIV");
    }

    #[test]
    fn imports_into_the_database_like_json_does() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrations::run_migrations(&conn).unwrap();
        let bible = parse_files(&[ZEFANIA.to_string()]).unwrap();
        let meta = BibleMeta {
            name: "Louis Segond 1910".into(),
            abbreviation: "LSG10".into(),
            language: "fr".into(),
            copyright: None,
        };
        let payload = to_payload(bible, &meta).unwrap();
        crate::bible::import::import_payload(&conn, &payload, false).unwrap();
        assert_eq!(crate::bible::import::verse_count_for_translation(&conn, "lsg10").unwrap(), 3);
    }

    #[test]
    fn normalizes_language_codes() {
        assert_eq!(normalize_language("FRA"), "fr");
        assert_eq!(normalize_language("fr-FR"), "fr");
        assert_eq!(normalize_language("English"), "en");
        assert_eq!(normalize_language("sw"), "sw");
    }

    /// Run with BSP_ZEFANIA_FILE=<path> to check a real XML Bible without importing it.
    #[test]
    fn reads_a_real_zefania_file_when_given_one() {
        let Ok(path) = std::env::var("BSP_ZEFANIA_FILE") else { return };
        let xml = std::fs::read_to_string(&path).unwrap();
        let bible = parse_files(&[xml]).unwrap();
        let shown = preview(&bible, &[], None);
        eprintln!(
            "{}: {} '{}' [{}] {} books, {} verses, warnings {:?}\nJohn 3:16 = {:?}",
            path,
            shown.format,
            shown.name,
            shown.abbreviation,
            shown.book_count,
            shown.verse_count,
            shown.warnings,
            bible.verses.get(&(43, 3, 16))
        );
        assert!(shown.verse_count > 7_000);
    }
}
