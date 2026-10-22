// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Offline transcription runs in a child copy of this executable so a native crash in
    // whisper.cpp cannot take the presentation down with it. See transcription/worker.rs.
    if std::env::args().any(|arg| arg == bible_show_pro_lib::transcription::worker::WORKER_FLAG) {
        std::process::exit(bible_show_pro_lib::transcription::worker::run_worker());
    }
    bible_show_pro_lib::run()
}
