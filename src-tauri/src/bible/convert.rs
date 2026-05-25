use crate::bible::books::CANONICAL_BOOKS;
use crate::bible::import::{ImportBook, ImportPayload, ImportTranslation, ImportVerse};
use serde::Deserialize;

fn strip_bom(text: &str) -> &str {
    text.trim_start_matches('\u{FEFF}').trim()
}

#[derive(Debug, Deserialize)]
struct ThiaBook {
    abbrev: String,
    name: String,
    chapters: Vec<Vec<String>>,
}

pub fn payload_from_thiagobodruk(
    json: &str,
    translation: ImportTranslation,
) -> Result<ImportPayload, String> {
    let cleaned = strip_bom(json);
    let books: Vec<ThiaBook> = serde_json::from_str(cleaned).map_err(|e| {
        format!(
            "Invalid Bible JSON ({}). Starts with: {:?}",
            e,
            &cleaned.chars().take(40).collect::<String>()
        )
    })?;
    if books.len() != CANONICAL_BOOKS.len() {
        return Err(format!(
            "Expected {} books, got {}",
            CANONICAL_BOOKS.len(),
            books.len()
        ));
    }

    let mut import_books = Vec::with_capacity(CANONICAL_BOOKS.len());
    let mut verses = Vec::new();

    for (idx, source) in books.iter().enumerate() {
        let canon = &CANONICAL_BOOKS[idx];
        let testament = if canon.number <= 39 { "OT" } else { "NT" };
        import_books.push(ImportBook {
            book_number: canon.number,
            name: canon.name.to_string(),
            abbreviation: source.abbrev.clone(),
            testament: testament.to_string(),
            chapter_count: source.chapters.len() as i32,
        });

        for (chapter_idx, chapter) in source.chapters.iter().enumerate() {
            for (verse_idx, text) in chapter.iter().enumerate() {
                let cleaned = text.replace('\n', " ").split_whitespace().collect::<Vec<_>>().join(" ");
                if cleaned.is_empty() {
                    continue;
                }
                verses.push(ImportVerse {
                    book_number: canon.number,
                    chapter: (chapter_idx + 1) as i32,
                    verse: (verse_idx + 1) as i32,
                    text: cleaned,
                });
            }
        }
    }

    Ok(ImportPayload {
        translation,
        books: import_books,
        verses,
    })
}

#[derive(Debug, Deserialize)]
struct BibleApiTranslation {
    identifier: String,
    name: String,
    language: String,
    license: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BibleApiBookRef {
    id: String,
    name: String,
    url: String,
}

#[derive(Debug, Deserialize)]
struct BibleApiBooksResponse {
    translation: BibleApiTranslation,
    books: Vec<BibleApiBookRef>,
}

#[derive(Debug, Deserialize)]
struct BibleApiChapterRef {
    chapter: i32,
    url: String,
}

#[derive(Debug, Deserialize)]
struct BibleApiBookResponse {
    chapters: Vec<BibleApiChapterRef>,
}

#[derive(Debug, Deserialize)]
struct BibleApiVerse {
    chapter: i32,
    verse: i32,
    text: String,
}

#[derive(Debug, Deserialize)]
struct BibleApiChapterResponse {
    verses: Vec<BibleApiVerse>,
}

fn book_number_from_api_id(id: &str) -> Option<i32> {
    let map: [(&str, i32); 66] = [
        ("GEN", 1),
        ("EXO", 2),
        ("LEV", 3),
        ("NUM", 4),
        ("DEU", 5),
        ("JOS", 6),
        ("JDG", 7),
        ("RUT", 8),
        ("1SA", 9),
        ("2SA", 10),
        ("1KI", 11),
        ("2KI", 12),
        ("1CH", 13),
        ("2CH", 14),
        ("EZR", 15),
        ("NEH", 16),
        ("EST", 17),
        ("JOB", 18),
        ("PSA", 19),
        ("PRO", 20),
        ("ECC", 21),
        ("SNG", 22),
        ("ISA", 23),
        ("JER", 24),
        ("LAM", 25),
        ("EZK", 26),
        ("DAN", 27),
        ("HOS", 28),
        ("JOL", 29),
        ("AMO", 30),
        ("OBA", 31),
        ("JON", 32),
        ("MIC", 33),
        ("NAM", 34),
        ("HAB", 35),
        ("ZEP", 36),
        ("HAG", 37),
        ("ZEC", 38),
        ("MAL", 39),
        ("MAT", 40),
        ("MRK", 41),
        ("LUK", 42),
        ("JHN", 43),
        ("ACT", 44),
        ("ROM", 45),
        ("1CO", 46),
        ("2CO", 47),
        ("GAL", 48),
        ("EPH", 49),
        ("PHP", 50),
        ("COL", 51),
        ("1TH", 52),
        ("2TH", 53),
        ("1TI", 54),
        ("2TI", 55),
        ("TIT", 56),
        ("PHM", 57),
        ("HEB", 58),
        ("JAS", 59),
        ("1PE", 60),
        ("2PE", 61),
        ("1JN", 62),
        ("2JN", 63),
        ("3JN", 64),
        ("JUD", 65),
        ("REV", 66),
    ];
    map.iter().find(|(k, _)| *k == id).map(|(_, n)| *n)
}

pub async fn fetch_bible_api_payload(
    client: &reqwest::Client,
    catalog_id: &str,
    root_url: &str,
    translation_meta: ImportTranslation,
    on_progress: impl Fn(i32, i32, &str),
) -> Result<ImportPayload, String> {
    let books_resp: BibleApiBooksResponse = client
        .get(root_url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let _ = catalog_id;
    let mut import_books = Vec::new();
    let mut verses = Vec::new();
    let total_books = books_resp.books.len() as i32;

    for (book_idx, book_ref) in books_resp.books.iter().enumerate() {
        let book_number = book_number_from_api_id(&book_ref.id)
            .ok_or_else(|| format!("Unknown bible-api book id: {}", book_ref.id))?;
        let canon = CANONICAL_BOOKS
            .iter()
            .find(|b| b.number == book_number)
            .ok_or_else(|| format!("Missing canonical book {}", book_number))?;
        let testament = if book_number <= 39 { "OT" } else { "NT" };

        on_progress(
            book_idx as i32 + 1,
            total_books,
            &format!("Fetching {}...", canon.name),
        );

        let book_data: BibleApiBookResponse = client
            .get(&book_ref.url)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;

        import_books.push(ImportBook {
            book_number,
            name: canon.name.to_string(),
            abbreviation: book_ref.id.clone(),
            testament: testament.to_string(),
            chapter_count: book_data.chapters.len() as i32,
        });

        for chapter_ref in &book_data.chapters {
            let mut chapter_data: Option<BibleApiChapterResponse> = None;
            for attempt in 0..3 {
                match client.get(&chapter_ref.url).send().await {
                    Ok(resp) => match resp.json().await {
                        Ok(data) => {
                            chapter_data = Some(data);
                            break;
                        }
                        Err(e) if attempt < 2 => {
                            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                            let _ = e;
                        }
                        Err(e) => return Err(e.to_string()),
                    },
                    Err(e) if attempt < 2 => {
                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                        let _ = e;
                    }
                    Err(e) => return Err(e.to_string()),
                }
            }
            let chapter_data = chapter_data.ok_or_else(|| "Failed to fetch chapter".to_string())?;

            for v in chapter_data.verses {
                let cleaned = v.text.replace('\n', " ").split_whitespace().collect::<Vec<_>>().join(" ");
                if cleaned.is_empty() {
                    continue;
                }
                verses.push(ImportVerse {
                    book_number,
                    chapter: v.chapter,
                    verse: v.verse,
                    text: cleaned,
                });
            }
            tokio::time::sleep(std::time::Duration::from_millis(75)).await;
        }
    }

    let translation = ImportTranslation {
        id: translation_meta.id,
        name: books_resp.translation.name,
        abbreviation: translation_meta.abbreviation,
        language: translation_meta.language,
        copyright: translation_meta
            .copyright
            .or(books_resp.translation.license),
    };

    Ok(ImportPayload {
        translation,
        books: import_books,
        verses,
    })
}

#[derive(Debug, Deserialize)]
struct HelloAoTranslation {
    name: String,
    #[serde(rename = "shortName")]
    short_name: Option<String>,
    language: String,
    #[serde(rename = "licenseUrl")]
    license_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct HelloAoBook {
    id: String,
    order: i32,
    #[serde(rename = "numberOfChapters")]
    number_of_chapters: i32,
    chapters: Vec<HelloAoChapterWrap>,
}

#[derive(Debug, Deserialize)]
struct HelloAoChapterWrap {
    chapter: HelloAoChapter,
}

#[derive(Debug, Deserialize)]
struct HelloAoChapter {
    number: i32,
    content: Vec<HelloAoContent>,
}

#[derive(Debug, Deserialize)]
struct HelloAoContent {
    #[serde(rename = "type")]
    content_type: String,
    number: Option<i32>,
    content: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Deserialize)]
struct HelloAoComplete {
    translation: HelloAoTranslation,
    books: Vec<HelloAoBook>,
}

fn verse_text_from_helloao_content(parts: &[serde_json::Value]) -> String {
    parts
        .iter()
        .filter_map(|part| {
            if let Some(text) = part.as_str() {
                return Some(text.to_string());
            }
            part.as_object()
                .and_then(|obj| obj.get("text"))
                .and_then(|v| v.as_str())
                .map(String::from)
        })
        .collect::<Vec<_>>()
        .join(" ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn payload_from_helloao(
    json: &str,
    translation: ImportTranslation,
) -> Result<ImportPayload, String> {
    let cleaned = strip_bom(json);
    let data: HelloAoComplete = serde_json::from_str(cleaned).map_err(|e| {
        format!(
            "Invalid HelloAO Bible JSON ({}). Starts with: {:?}",
            e,
            &cleaned.chars().take(40).collect::<String>()
        )
    })?;

    if data.books.len() != CANONICAL_BOOKS.len() {
        return Err(format!(
            "Expected {} books, got {}",
            CANONICAL_BOOKS.len(),
            data.books.len()
        ));
    }

    let mut import_books = Vec::with_capacity(CANONICAL_BOOKS.len());
    let mut verses = Vec::new();

    for source in &data.books {
        let book_number = book_number_from_api_id(&source.id).ok_or_else(|| {
            format!("Unknown HelloAO book id: {}", source.id)
        })?;
        if book_number != source.order {
            return Err(format!(
                "Book order mismatch for {} (order {}, expected {})",
                source.id, source.order, book_number
            ));
        }
        let canon = CANONICAL_BOOKS
            .iter()
            .find(|b| b.number == book_number)
            .ok_or_else(|| format!("Missing canonical book {}", book_number))?;
        let testament = if book_number <= 39 { "OT" } else { "NT" };

        import_books.push(ImportBook {
            book_number,
            name: canon.name.to_string(),
            abbreviation: source.id.clone(),
            testament: testament.to_string(),
            chapter_count: source.number_of_chapters,
        });

        for chapter_wrap in &source.chapters {
            let chapter = &chapter_wrap.chapter;
            for block in &chapter.content {
                if block.content_type != "verse" {
                    continue;
                }
                let Some(verse_number) = block.number else {
                    continue;
                };
                let Some(parts) = block.content.as_ref() else {
                    continue;
                };
                let text = verse_text_from_helloao_content(parts);
                if text.is_empty() {
                    continue;
                }
                verses.push(ImportVerse {
                    book_number,
                    chapter: chapter.number,
                    verse: verse_number,
                    text,
                });
            }
        }
    }

    let language = match translation.language.as_str() {
        "fr" => "fr".to_string(),
        "en" => "en".to_string(),
        other if data.translation.language.starts_with(other) => other.to_string(),
        _ => data
            .translation
            .language
            .split('_')
            .next()
            .unwrap_or("en")
            .to_string(),
    };

    Ok(ImportPayload {
        translation: ImportTranslation {
            id: translation.id,
            name: translation.name,
            abbreviation: translation.abbreviation,
            language,
            copyright: translation.copyright.or(data.translation.license_url),
        },
        books: import_books,
        verses,
    })
}
