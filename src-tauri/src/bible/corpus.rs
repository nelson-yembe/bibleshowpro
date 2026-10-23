//! Scores scripture detection against labelled sermon transcripts.
//!
//! A corpus case is a run of transcript segments, each with the references a person
//! confirmed were said in it. Segments are detected in order with the same sermon
//! context the app carries, so "verse 17" after "John 3:16" is scored as it would be
//! live. The corpus lives in `corpus/detection/*.json`; `cargo test corpus -- --nocapture`
//! prints the report.

use crate::bible::detection::{detect_references_with_context, DetectionContext, ScriptureDetectionMatch};
use crate::bible::parser::{parse_reference, ParsedReference};
use serde::Deserialize;

/// What the app stages without the operator: explicit citations at medium confidence
/// or better (`isExplicitScripture` on the frontend).
const AUTO_CONFIDENCE: f32 = 0.65;

#[derive(Debug, Deserialize)]
pub struct CorpusCase {
    pub id: String,
    pub language: String,
    /// Where the transcript came from, and the consent it was given under.
    #[serde(default)]
    pub source: String,
    /// False on a fresh export from Live Listen, until a person has checked the labels.
    #[serde(default = "checked")]
    pub reviewed: bool,
    pub segments: Vec<CorpusSegment>,
}

fn checked() -> bool {
    true
}

#[derive(Debug, Deserialize)]
pub struct CorpusSegment {
    pub text: String,
    /// References said in this segment, as a person would write them.
    #[serde(default)]
    pub expect: Vec<String>,
}

#[derive(Debug, Default)]
pub struct Score {
    pub segments: usize,
    pub expected: usize,
    pub found: usize,
    pub suggested: usize,
    pub suggested_right: usize,
    pub auto: usize,
    pub auto_right: usize,
    /// "case: text → missed reference"
    pub misses: Vec<String>,
    /// "case: text → wrong reference (auto)"
    pub false_hits: Vec<String>,
}

impl Score {
    /// Share of the references said that were suggested.
    pub fn recall(&self) -> f64 {
        ratio(self.found, self.expected)
    }

    /// Share of suggestions that were right.
    pub fn precision(&self) -> f64 {
        ratio(self.suggested_right, self.suggested)
    }

    /// Share of automatically staged verses that were right.
    pub fn auto_precision(&self) -> f64 {
        ratio(self.auto_right, self.auto)
    }

    pub fn report(&self) -> String {
        let mut out = format!(
            "{} segments, {} references said\n\
             recall          {:6.1}%  ({} of {} suggested)\n\
             precision       {:6.1}%  ({} of {} suggestions right)\n\
             auto precision  {:6.1}%  ({} of {} staged without the operator right)\n",
            self.segments,
            self.expected,
            self.recall() * 100.0,
            self.found,
            self.expected,
            self.precision() * 100.0,
            self.suggested_right,
            self.suggested,
            self.auto_precision() * 100.0,
            self.auto_right,
            self.auto,
        );
        if !self.misses.is_empty() {
            out.push_str("\nMissed:\n");
            for miss in &self.misses {
                out.push_str(&format!("  {miss}\n"));
            }
        }
        if !self.false_hits.is_empty() {
            out.push_str("\nWrong suggestions:\n");
            for hit in &self.false_hits {
                out.push_str(&format!("  {hit}\n"));
            }
        }
        out
    }
}

fn ratio(part: usize, whole: usize) -> f64 {
    if whole == 0 {
        1.0
    } else {
        part as f64 / whole as f64
    }
}

/// Same passage: book, chapter and verses, whatever the book was called.
fn same_passage(a: &ParsedReference, b: &ParsedReference) -> bool {
    a.book_number == b.book_number
        && a.chapter == b.chapter
        && a.verse_start == b.verse_start
        && a.verse_end.or(a.verse_start) == b.verse_end.or(b.verse_start)
}

/// The suggestion the app would treat as current: explicit first, then most confident.
fn current_passage(found: &[ScriptureDetectionMatch]) -> Option<&ScriptureDetectionMatch> {
    found.iter().max_by(|a, b| {
        (a.detection_type == "explicit")
            .cmp(&(b.detection_type == "explicit"))
            .then(a.confidence.total_cmp(&b.confidence))
    })
}

pub fn score(cases: &[CorpusCase]) -> Result<Score, String> {
    let mut score = Score::default();
    for case in cases {
        let mut context: Option<DetectionContext> = None;
        for segment in &case.segments {
            score.segments += 1;
            let expected = segment
                .expect
                .iter()
                .map(|r| parse_reference(r).ok_or_else(|| format!("{}: cannot read expected reference {r:?}", case.id)))
                .collect::<Result<Vec<_>, _>>()?;
            let found = detect_references_with_context(&segment.text, context.as_ref());

            score.expected += expected.len();
            for (said, want) in segment.expect.iter().zip(&expected) {
                if found.iter().any(|m| same_passage(&m.parsed, want)) {
                    score.found += 1;
                } else {
                    score.misses.push(format!("{}: {:?} → {said}", case.id, segment.text));
                }
            }
            for m in &found {
                let right = expected.iter().any(|want| same_passage(&m.parsed, want));
                let auto = m.detection_type == "explicit" && m.confidence >= AUTO_CONFIDENCE;
                score.suggested += 1;
                score.suggested_right += usize::from(right);
                if auto {
                    score.auto += 1;
                    score.auto_right += usize::from(right);
                }
                if !right {
                    score.false_hits.push(format!(
                        "{}: {:?} → {}{}",
                        case.id,
                        segment.text,
                        m.normalized_reference,
                        if auto { " (staged)" } else { "" }
                    ));
                }
            }

            if let Some(current) = current_passage(&found) {
                context = Some(DetectionContext {
                    book_number: current.parsed.book_number,
                    book_name: current.parsed.book_name.clone(),
                    chapter: Some(current.parsed.chapter),
                });
            }
        }
    }
    Ok(score)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    /// The plan's targets, held as floors: a change that drops the corpus below either
    /// fails the build. A new case that the detector cannot meet yet belongs in the
    /// corpus anyway; fix detection rather than lowering these.
    const RECALL_FLOOR: f64 = 0.95;
    const AUTO_PRECISION_FLOOR: f64 = 0.99;

    fn load_corpus() -> Vec<CorpusCase> {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("corpus").join("detection");
        let mut paths: Vec<_> = std::fs::read_dir(&dir)
            .unwrap_or_else(|e| panic!("{}: {e}", dir.display()))
            .map(|entry| entry.unwrap().path())
            .filter(|p| p.extension().is_some_and(|ext| ext == "json"))
            .collect();
        paths.sort();
        paths
            .iter()
            .map(|p| {
                let text = std::fs::read_to_string(p).unwrap();
                let case: CorpusCase =
                    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{}: {e}", p.display()));
                assert!(
                    case.reviewed,
                    "{}: check every segment's references, then set \"reviewed\": true",
                    p.display()
                );
                case
            })
            .collect()
    }

    #[test]
    fn corpus_holds_its_ground() {
        let cases = load_corpus();
        assert!(!cases.is_empty(), "the corpus is empty");
        let score = score(&cases).unwrap();
        println!("\n{}", score.report());
        assert!(
            score.recall() >= RECALL_FLOOR,
            "recall fell to {:.1}% (floor {:.1}%)\n{}",
            score.recall() * 100.0,
            RECALL_FLOOR * 100.0,
            score.report()
        );
        assert!(
            score.auto_precision() >= AUTO_PRECISION_FLOOR,
            "auto precision fell to {:.1}% (floor {:.1}%)\n{}",
            score.auto_precision() * 100.0,
            AUTO_PRECISION_FLOOR * 100.0,
            score.report()
        );
    }

    fn case(segments: &[(&str, &[&str])]) -> CorpusCase {
        CorpusCase {
            id: "t".into(),
            language: "en".into(),
            source: String::new(),
            reviewed: true,
            segments: segments
                .iter()
                .map(|(text, expect)| CorpusSegment {
                    text: text.to_string(),
                    expect: expect.iter().map(|r| r.to_string()).collect(),
                })
                .collect(),
        }
    }

    #[test]
    fn scores_hits_misses_and_wrong_suggestions() {
        let score = score(&[case(&[
            ("Turn to John chapter 3 verse 16.", &["John 3:16"]),
            ("We sang a hymn.", &["Psalm 100"]),
            ("Look at Romans 8:28 tonight.", &[]),
        ])])
        .unwrap();
        assert_eq!((score.expected, score.found), (2, 1));
        assert_eq!(score.misses.len(), 1);
        assert_eq!(score.false_hits.len(), 1);
        assert!(score.false_hits[0].contains("Romans 8:28 (staged)"));
        assert_eq!((score.auto, score.auto_right), (2, 1));
    }

    #[test]
    fn carries_the_sermon_passage_like_the_app() {
        let score = score(&[case(&[
            ("Open to John chapter 3 verse 16.", &["John 3:16"]),
            ("And verse 17 says", &["John 3:17"]),
        ])])
        .unwrap();
        assert_eq!(score.found, 2, "{}", score.report());
    }

    #[test]
    fn names_the_book_any_way_the_labeller_wrote_it() {
        let score = score(&[case(&[("Psalm twenty three", &["Ps 23"])])]).unwrap();
        assert_eq!(score.found, 1, "{}", score.report());
    }

    #[test]
    fn rejects_a_label_it_cannot_read() {
        assert!(score(&[case(&[("text", &["Hezekiah 4:2"])])]).is_err());
    }
}
