use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptionSessionSummary {
    pub id: String,
    pub title: String,
    pub service_plan_id: Option<String>,
    pub status: String,
    pub model_id: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub segment_count: i64,
    pub detection_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptSegmentRecord {
    pub id: String,
    pub session_id: String,
    pub text: String,
    pub is_final: bool,
    pub offset_ms: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptureDetectionRecord {
    pub id: String,
    pub session_id: String,
    pub transcript_segment_id: Option<String>,
    pub detected_phrase: String,
    pub suggested_reference: String,
    pub translation_id: Option<String>,
    pub confidence: f32,
    pub detection_type: String,
    pub status: String,
    pub verse_preview: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptionSessionDetail {
    pub id: String,
    pub title: String,
    pub service_plan_id: Option<String>,
    pub status: String,
    pub model_id: String,
    pub audio_device_id: Option<String>,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub segments: Vec<TranscriptSegmentRecord>,
    pub detections: Vec<ScriptureDetectionRecord>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SaveTranscriptionSessionInput {
    pub id: Option<String>,
    pub title: String,
    pub service_plan_id: Option<String>,
    pub status: String,
    pub model_id: String,
    pub audio_device_id: Option<String>,
    pub started_at: Option<String>,
    pub ended_at: Option<String>,
    pub segments: Vec<SaveSegmentInput>,
    pub detections: Vec<SaveDetectionInput>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SaveSegmentInput {
    pub id: Option<String>,
    pub text: String,
    pub is_final: bool,
    pub offset_ms: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SaveDetectionInput {
    pub id: Option<String>,
    pub transcript_segment_id: Option<String>,
    pub detected_phrase: String,
    pub suggested_reference: String,
    pub translation_id: Option<String>,
    pub confidence: f32,
    pub detection_type: String,
    pub status: String,
    pub verse_preview: Option<String>,
}

pub fn list_sessions(conn: &Connection, limit: i64) -> Result<Vec<TranscriptionSessionSummary>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.title, s.service_plan_id, s.status, s.model_id, s.started_at, s.ended_at,
                    (SELECT COUNT(*) FROM transcript_segments ts WHERE ts.session_id = s.id) AS segment_count,
                    (SELECT COUNT(*) FROM scripture_detections sd WHERE sd.session_id = s.id) AS detection_count
             FROM transcription_sessions s
             ORDER BY s.started_at DESC
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([limit], |row| {
            Ok(TranscriptionSessionSummary {
                id: row.get(0)?,
                title: row.get(1)?,
                service_plan_id: row.get(2)?,
                status: row.get(3)?,
                model_id: row.get(4)?,
                started_at: row.get(5)?,
                ended_at: row.get(6)?,
                segment_count: row.get(7)?,
                detection_count: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

pub fn get_session(conn: &Connection, id: &str) -> Result<TranscriptionSessionDetail, String> {
    let session = conn
        .query_row(
            "SELECT id, title, service_plan_id, status, model_id, audio_device_id, started_at, ended_at
             FROM transcription_sessions WHERE id = ?1",
            [id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, Option<String>>(7)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?;

    let mut seg_stmt = conn
        .prepare(
            "SELECT id, session_id, text, is_final, offset_ms, created_at
             FROM transcript_segments WHERE session_id = ?1 ORDER BY offset_ms ASC, created_at ASC",
        )
        .map_err(|e| e.to_string())?;
    let segments = seg_stmt
        .query_map([id], |row| {
            Ok(TranscriptSegmentRecord {
                id: row.get(0)?,
                session_id: row.get(1)?,
                text: row.get(2)?,
                is_final: row.get::<_, i64>(3)? != 0,
                offset_ms: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut det_stmt = conn
        .prepare(
            "SELECT id, session_id, transcript_segment_id, detected_phrase, suggested_reference,
                    translation_id, confidence, detection_type, status, verse_preview, created_at
             FROM scripture_detections WHERE session_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;
    let detections = det_stmt
        .query_map([id], |row| {
            Ok(ScriptureDetectionRecord {
                id: row.get(0)?,
                session_id: row.get(1)?,
                transcript_segment_id: row.get(2)?,
                detected_phrase: row.get(3)?,
                suggested_reference: row.get(4)?,
                translation_id: row.get(5)?,
                confidence: row.get(6)?,
                detection_type: row.get(7)?,
                status: row.get(8)?,
                verse_preview: row.get(9)?,
                created_at: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(TranscriptionSessionDetail {
        id: session.0,
        title: session.1,
        service_plan_id: session.2,
        status: session.3,
        model_id: session.4,
        audio_device_id: session.5,
        started_at: session.6,
        ended_at: session.7,
        segments,
        detections,
    })
}

pub fn save_session(conn: &Connection, input: SaveTranscriptionSessionInput) -> Result<String, String> {
    let session_id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO transcription_sessions (id, title, service_plan_id, status, model_id, audio_device_id, started_at, ended_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, COALESCE(?7, datetime('now')), ?8)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           service_plan_id = excluded.service_plan_id,
           status = excluded.status,
           model_id = excluded.model_id,
           audio_device_id = excluded.audio_device_id,
           ended_at = excluded.ended_at",
        params![
            session_id,
            input.title,
            input.service_plan_id,
            input.status,
            input.model_id,
            input.audio_device_id,
            input.started_at,
            input.ended_at,
        ],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "DELETE FROM transcript_segments WHERE session_id = ?1",
        [&session_id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM scripture_detections WHERE session_id = ?1",
        [&session_id],
    )
    .map_err(|e| e.to_string())?;

    {
        let mut insert_seg = tx
            .prepare(
                "INSERT INTO transcript_segments (id, session_id, text, is_final, offset_ms)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )
            .map_err(|e| e.to_string())?;
        for seg in input.segments {
            let seg_id = seg.id.unwrap_or_else(|| Uuid::new_v4().to_string());
            insert_seg
                .execute(params![
                    seg_id,
                    session_id,
                    seg.text,
                    if seg.is_final { 1 } else { 0 },
                    seg.offset_ms,
                ])
                .map_err(|e| e.to_string())?;
        }
    }

    {
        let mut insert_det = tx
            .prepare(
                "INSERT INTO scripture_detections
                 (id, session_id, transcript_segment_id, detected_phrase, suggested_reference,
                  translation_id, confidence, detection_type, status, verse_preview)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            )
            .map_err(|e| e.to_string())?;
        for det in input.detections {
            let det_id = det.id.unwrap_or_else(|| Uuid::new_v4().to_string());
            insert_det
                .execute(params![
                    det_id,
                    session_id,
                    det.transcript_segment_id,
                    det.detected_phrase,
                    det.suggested_reference,
                    det.translation_id,
                    det.confidence,
                    det.detection_type,
                    det.status,
                    det.verse_preview,
                ])
                .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(session_id)
}

pub fn delete_session(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM transcription_sessions WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
