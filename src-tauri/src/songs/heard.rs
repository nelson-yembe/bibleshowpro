//! Which song is being sung: the transcript of the worship leader matched against every
//! lyric line in the library, in order, so a few misheard words still find the song.

use rusqlite::Connection;
use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HeardSong {
    pub song_id: String,
    pub title: String,
    pub section_id: Option<String>,
    pub section_label: Option<String>,
    /// The lyric line that matched, or the title when that was what was said.
    pub line: String,
    pub score: f32,
}

/// A line must be this well covered to name a song; one wrong word in four is allowed.
const LINE_MATCH: f32 = 0.75;
/// Shorter lines ("Hallelujah, amen") are in too many songs to tell them apart.
const MIN_LINE_WORDS: usize = 4;
const TITLE_SCORE: f32 = 0.9;

pub fn words(text: &str) -> Vec<String> {
    crate::bible::spoken_book::fold_accents(&text.to_lowercase())
        .replace(['\'', '’'], "")
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .map(str::to_string)
        .collect()
}

/// Longest run of `line`'s words found in order in `heard`.
fn in_order(heard: &[String], line: &[String]) -> usize {
    let mut row = vec![0usize; line.len() + 1];
    for h in heard {
        let mut diagonal = 0;
        for (j, word) in line.iter().enumerate() {
            let above = row[j + 1];
            row[j + 1] = if h == word { diagonal + 1 } else { row[j + 1].max(row[j]) };
            diagonal = above;
        }
    }
    row[line.len()]
}

/// Share of `line` that was sung, in order, somewhere in `heard`.
pub fn coverage(heard: &[String], line: &[String]) -> f32 {
    if line.is_empty() {
        return 0.0;
    }
    in_order(heard, line) as f32 / line.len() as f32
}

/// The best few songs for what was just heard, most likely first.
pub fn match_heard(conn: &Connection, heard_text: &str) -> Result<Vec<HeardSong>, String> {
    let heard = words(heard_text);
    if heard.len() < MIN_LINE_WORDS - 1 {
        return Ok(Vec::new());
    }
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.title, sec.id, sec.label, sec.lyrics
             FROM songs s LEFT JOIN song_sections sec ON sec.song_id = s.id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut best: Vec<HeardSong> = Vec::new();
    let mut keep = |candidate: HeardSong| match best.iter_mut().find(|b| b.song_id == candidate.song_id) {
        Some(existing) if existing.score >= candidate.score => {}
        Some(existing) => *existing = candidate,
        None => best.push(candidate),
    };
    for row in rows {
        let (song_id, title, section_id, section_label, lyrics) = row.map_err(|e| e.to_string())?;
        let title_words = words(&title);
        if title_words.len() >= 2 && coverage(&heard, &title_words) == 1.0 {
            keep(HeardSong {
                song_id: song_id.clone(),
                title: title.clone(),
                section_id: None,
                section_label: None,
                line: title.clone(),
                score: TITLE_SCORE,
            });
        }
        for line in lyrics.as_deref().unwrap_or("").lines() {
            let line_words = words(line);
            if line_words.len() < MIN_LINE_WORDS {
                continue;
            }
            let score = coverage(&heard, &line_words);
            if score >= LINE_MATCH {
                keep(HeardSong {
                    song_id: song_id.clone(),
                    title: title.clone(),
                    section_id: section_id.clone(),
                    section_label: section_label.clone(),
                    line: line.trim().to_string(),
                    score,
                });
            }
        }
    }
    best.sort_by(|a, b| b.score.total_cmp(&a.score));
    best.truncate(3);
    Ok(best)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn library() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE songs (id TEXT PRIMARY KEY, title TEXT NOT NULL);
             CREATE TABLE song_sections (id TEXT PRIMARY KEY, song_id TEXT, label TEXT, lyrics TEXT);
             INSERT INTO songs VALUES ('grace', 'Amazing Grace'), ('great', 'How Great Thou Art'), ('blessed', 'Blessed Assurance');
             INSERT INTO song_sections VALUES
               ('g1', 'grace', 'Verse 1', 'Amazing grace, how sweet the sound\nThat saved a wretch like me\nI once was lost, but now am found'),
               ('h1', 'great', 'Chorus', 'Then sings my soul, my Saviour God, to Thee\nHow great Thou art, how great Thou art'),
               ('b1', 'blessed', 'Chorus', 'This is my story, this is my song\nPraising my Saviour all the day long');",
        )
        .unwrap();
        conn
    }

    #[test]
    fn finds_the_song_from_a_sung_line_with_a_misheard_word() {
        let found = match_heard(&library(), "that saved a wreck like me").unwrap();
        assert_eq!(found[0].song_id, "grace");
        assert_eq!(found[0].section_label.as_deref(), Some("Verse 1"));
        assert!(found[0].score >= 0.75);
    }

    #[test]
    fn finds_the_song_when_its_title_is_announced() {
        let found = match_heard(&library(), "let us stand and sing how great thou art").unwrap();
        assert_eq!(found[0].song_id, "great");
    }

    #[test]
    fn stays_quiet_for_ordinary_speech() {
        assert!(match_heard(&library(), "please be seated and turn to the person next to you").unwrap().is_empty());
        assert!(match_heard(&library(), "amen").unwrap().is_empty());
    }

    #[test]
    fn coverage_counts_words_in_order() {
        let heard = words("then sings my soul my Saviour God to thee");
        assert_eq!(coverage(&heard, &words("Then sings my soul, my Saviour God, to Thee")), 1.0);
        assert!(coverage(&words("thee to God Saviour"), &words("my Saviour God to Thee")) < 0.5);
    }
}
