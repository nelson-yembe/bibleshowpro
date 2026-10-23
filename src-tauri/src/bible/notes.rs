//! Sermon notes: every reference the preacher wrote down, found before the service starts,
//! so each verse is queued and pre-loaded, and hearing it spoken confirms rather than guesses.

use std::collections::HashSet;
use std::io::{Cursor, Read};

use once_cell::sync::Lazy;
use quick_xml::events::Event;
use quick_xml::Reader;
use regex::Regex;
use serde::Serialize;

use crate::bible::books::{max_chapters_for_book, resolve_book_exact};
use crate::bible::detection::detect_references_in_text;
use crate::bible::spoken_book::fold_accents;

/// Books whose names are everyday words: written alone with a number ("Mark 5 places")
/// they are not taken as a chapter reference, only with a verse ("Mark 5:1").
const EVERYDAY_WORD_BOOKS: &[&str] = &[
    "job", "mark", "marc", "acts", "actes", "numbers", "nombres", "judges", "juges", "ruth", "jude", "jean", "luc",
];

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NotesReference {
    pub reference: String,
    pub book_number: i32,
    pub chapter: i32,
    pub verse_start: Option<i32>,
    pub verse_end: Option<i32>,
    /// The line it was written on, so the operator can tell the references apart.
    pub context: String,
}

/// Plain text from a notes file: Word (.docx), PDF, or anything else read as text.
pub fn document_text(file_name: &str, bytes: &[u8]) -> Result<String, String> {
    let lower = file_name.to_lowercase();
    if lower.ends_with(".docx") {
        docx_text(bytes)
    } else if lower.ends_with(".pdf") {
        pdf_text(bytes)
    } else if lower.ends_with(".doc") {
        Err("Older Word (.doc) files can't be read. Save the notes as .docx or PDF and try again.".into())
    } else {
        Ok(String::from_utf8_lossy(bytes).into_owned())
    }
}

fn docx_text(bytes: &[u8]) -> Result<String, String> {
    let mut archive =
        zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| "This is not a readable Word (.docx) file.".to_string())?;
    let mut xml = String::new();
    archive
        .by_name("word/document.xml")
        .map_err(|_| "This Word file has no document text.".to_string())?
        .read_to_string(&mut xml)
        .map_err(|e| e.to_string())?;

    let mut reader = Reader::from_str(&xml);
    let mut out = String::new();
    let mut in_text = false;
    loop {
        match reader.read_event().map_err(|e| format!("Could not read the Word file: {e}"))? {
            Event::Start(e) if e.local_name().as_ref() == b"t" => in_text = true,
            Event::End(e) => match e.local_name().as_ref() {
                b"t" => in_text = false,
                b"p" => out.push('\n'),
                _ => {}
            },
            Event::Empty(e) => match e.local_name().as_ref() {
                b"tab" => out.push(' '),
                b"br" | b"cr" => out.push('\n'),
                _ => {}
            },
            Event::Text(t) if in_text => out.push_str(&t.decode().map_err(|e| e.to_string())?),
            Event::GeneralRef(r) if in_text => {
                if let Ok(Some(ch)) = r.resolve_char_ref() {
                    out.push(ch);
                } else {
                    out.push_str(match r.decode().as_deref() {
                        Ok("amp") => "&",
                        Ok("lt") => "<",
                        Ok("gt") => ">",
                        Ok("quot") => "\"",
                        Ok("apos") => "'",
                        _ => "",
                    });
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    Ok(out)
}

fn pdf_text(bytes: &[u8]) -> Result<String, String> {
    // The PDF library can panic on malformed files; a bad file must not take the app down.
    let extracted = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| pdf_extract::extract_text_from_mem(bytes)));
    match extracted {
        Ok(Ok(text)) if !text.trim().is_empty() => Ok(text),
        Ok(Ok(_)) => Err("This PDF has no text to read — it may be scanned pages. Paste the notes instead.".into()),
        _ => Err("This PDF could not be read. Paste the notes instead.".into()),
    }
}

fn format_reference(book: &str, chapter: i32, start: Option<i32>, end: Option<i32>) -> String {
    match (start, end) {
        (Some(s), Some(e)) if e > s => format!("{book} {chapter}:{s}-{e}"),
        (Some(s), _) => format!("{book} {chapter}:{s}"),
        _ => format!("{book} {chapter}"),
    }
}

/// Numbered books first ("1 Cor 13:4-7", "II Tim 3:16"): scanned together with the rest,
/// "and 1 Cor" would lose its "1" to a failed match on "and 1".
static NUMBERED: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)\b([1-3]|i{1,3})\s*([a-z]+)\.?\s*(\d{1,3})(?:\s*[:.,]\s*(\d{1,3})(?:\s*[-\u{2013}\u{2014}]\s*(\d{1,3}))?)?\b",
    )
    .unwrap()
});

/// Then the rest: "John 3:16", "Jn 3.16", "Rom. 8:28", "Jean 3,16", "Psalm 23".
static TYPED: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)\b()([a-z]+(?:\s+of\s+[a-z]+)?)\.?\s*(\d{1,3})(?:\s*[:.,]\s*(\d{1,3})(?:\s*[-\u{2013}\u{2014}]\s*(\d{1,3}))?)?\b",
    )
    .unwrap()
});

/// "1", "I", "ii" → the digit a numbered book is written with.
fn prefix_digit(prefix: &str) -> &'static str {
    match prefix.to_lowercase().as_str() {
        "i" | "1" => "1",
        "ii" | "2" => "2",
        _ => "3",
    }
}

fn typed_references(line: &str) -> Vec<(i32, &'static str, i32, Option<i32>, Option<i32>)> {
    let folded = fold_accents(line);
    // Blank out what the numbered pass took, keeping positions so the results stay in order.
    let mut rest = folded.clone();
    let mut candidates: Vec<(usize, regex::Captures)> = Vec::new();
    for caps in NUMBERED.captures_iter(&folded) {
        let whole = caps.get(0).unwrap();
        let prefix_and_token = format!("{} {}", prefix_digit(&caps[1]), &caps[2]);
        if resolve_book_exact(&prefix_and_token).is_some() {
            rest.replace_range(whole.range(), &" ".repeat(whole.len()));
            candidates.push((whole.start(), caps));
        }
    }
    for caps in TYPED.captures_iter(&rest) {
        candidates.push((caps.get(0).unwrap().start(), caps));
    }
    candidates.sort_by_key(|(start, _)| *start);

    let mut found = Vec::new();
    for (_, caps) in candidates {
        let token = caps.get(2).map(|m| m.as_str()).unwrap_or("");
        let prefix = caps.get(1).filter(|m| !m.as_str().is_empty()).map(|m| prefix_digit(m.as_str()));
        let key = match prefix {
            Some(p) => format!("{p} {token}"),
            None => token.to_string(),
        };
        let Some((number, name)) = resolve_book_exact(&key) else { continue };
        let Some(chapter) = caps.get(3).and_then(|m| m.as_str().parse::<i32>().ok()) else { continue };
        let verse = caps.get(4).and_then(|m| m.as_str().parse::<i32>().ok());
        let verse_end = caps.get(5).and_then(|m| m.as_str().parse::<i32>().ok());
        if verse.is_none() {
            // "Psalm 23" yes; "mark 5 places" and "is 3" no.
            let word = token.to_lowercase();
            let short_ok = word == "ps";
            if EVERYDAY_WORD_BOOKS.contains(&word.as_str()) || (word.len() < 3 && !short_ok) {
                continue;
            }
        }
        if chapter < 1 || chapter > max_chapters_for_book(number) || verse.is_some_and(|v| !(1..=200).contains(&v)) {
            continue;
        }
        found.push((number, name, chapter, verse, verse_end.filter(|e| verse.is_some_and(|v| *e > v))));
    }
    found
}

/// Every reference in the notes, once each, in the order the preacher wrote them.
pub fn find_references(text: &str) -> Vec<NotesReference> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let context: String = trimmed.chars().take(140).collect();
        let mut push = |number: i32, name: &str, chapter: i32, start: Option<i32>, end: Option<i32>| {
            let reference = format_reference(name, chapter, start, end);
            if seen.insert(reference.clone()) {
                out.push(NotesReference {
                    reference,
                    book_number: number,
                    chapter,
                    verse_start: start,
                    verse_end: end,
                    context: context.clone(),
                });
            }
        };
        for (number, name, chapter, start, end) in typed_references(trimmed) {
            push(number, name, chapter, start, end);
        }
        // Spelled out, as some preachers write: "John chapter 3 verse 16".
        for m in detect_references_in_text(trimmed) {
            if m.detection_type == "explicit" && m.parsed.verse_start.is_some() {
                let p = &m.parsed;
                push(p.book_number, &p.book_name, p.chapter, p.verse_start, p.verse_end.filter(|e| Some(*e) != p.verse_start));
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn refs(text: &str) -> Vec<String> {
        find_references(text).into_iter().map(|r| r.reference).collect()
    }

    #[test]
    fn finds_typed_references_in_the_forms_preachers_write() {
        let notes = "Intro: read John 3:16 aloud\nThen Rom. 8.28 and 1 Cor 13:4-7\nJn 1:1; Ps 23\nFrench service: Jean 3,16 et Ésaïe 53:5\nII Tim 3:16";
        assert_eq!(
            refs(notes),
            vec![
                "John 3:16",
                "Romans 8:28",
                "1 Corinthians 13:4-7",
                "John 1:1",
                "Psalms 23",
                "Isaiah 53:5",
                "2 Timothy 3:16"
            ]
        );
    }

    #[test]
    fn finds_references_spelled_out() {
        assert_eq!(refs("Turn to Matthew chapter 5 verse 14 for the light"), vec!["Matthew 5:14"]);
    }

    #[test]
    fn keeps_the_first_mention_and_its_line() {
        let found = find_references("Main text: John 3:16\nRepeat John 3:16 at the end");
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].context, "Main text: John 3:16");
        assert_eq!((found[0].book_number, found[0].chapter, found[0].verse_start), (43, 3, Some(16)));
    }

    #[test]
    fn ignores_numbers_that_are_not_references() {
        for prose in [
            "Mark 5 places on the map",
            "this is 3 times",
            "We need 2 volunteers and 1 sound engineer",
            "Job 2 starts at 9",
            "Lamentations 8:10",
            "Service at 10:30",
        ] {
            assert_eq!(refs(prose), Vec::<String>::new(), "{prose}");
        }
    }

    #[test]
    fn still_accepts_everyday_word_books_with_a_verse() {
        assert_eq!(refs("Mark 5:1 and Job 38:4"), vec!["Mark 5:1", "Job 38:4"]);
    }

    #[test]
    fn reads_text_from_a_word_file() {
        use std::io::Write;
        let mut buffer = Cursor::new(Vec::new());
        {
            let mut zip = zip::ZipWriter::new(&mut buffer);
            let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
            zip.start_file("word/document.xml", options).unwrap();
            zip.write_all(
                br#"<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Read John 3:16</w:t></w:r></w:p><w:p><w:r><w:t>then Romans 8:28 &amp; more</w:t></w:r></w:p></w:body></w:document>"#,
            )
            .unwrap();
            zip.finish().unwrap();
        }
        let text = document_text("notes.docx", buffer.get_ref()).unwrap();
        assert_eq!(text, "Read John 3:16\nthen Romans 8:28 & more\n");
        assert_eq!(refs(&text), vec!["John 3:16", "Romans 8:28"]);
    }

    /// A one-page PDF in the standard Helvetica font, with a valid cross-reference table.
    fn one_line_pdf(line: &str) -> Vec<u8> {
        let content = format!("BT /F1 12 Tf 72 720 Td ({line}) Tj ET");
        let objects = [
            "<< /Type /Catalog /Pages 2 0 R >>".to_string(),
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_string(),
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>".to_string(),
            format!("<< /Length {} >>\nstream\n{content}\nendstream", content.len()),
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_string(),
        ];
        let mut pdf = b"%PDF-1.4\n".to_vec();
        let mut offsets = Vec::new();
        for (i, body) in objects.iter().enumerate() {
            offsets.push(pdf.len());
            pdf.extend(format!("{} 0 obj\n{body}\nendobj\n", i + 1).as_bytes());
        }
        let xref = pdf.len();
        pdf.extend(format!("xref\n0 {}\n0000000000 65535 f \n", objects.len() + 1).as_bytes());
        for offset in offsets {
            pdf.extend(format!("{offset:010} 00000 n \n").as_bytes());
        }
        pdf.extend(format!("trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n", objects.len() + 1).as_bytes());
        pdf
    }

    #[test]
    fn reads_text_from_a_pdf() {
        let text = document_text("notes.pdf", &one_line_pdf("Read Isaiah 40:31 slowly")).unwrap();
        assert_eq!(refs(&text), vec!["Isaiah 40:31"]);
    }

    #[test]
    fn explains_files_it_cannot_read() {
        assert!(document_text("notes.doc", b"").unwrap_err().contains(".docx"));
        assert!(document_text("notes.docx", b"not a zip").is_err());
        assert!(document_text("notes.pdf", b"not a pdf").is_err());
        assert_eq!(document_text("notes.txt", b"John 3:16").unwrap(), "John 3:16");
    }
}
