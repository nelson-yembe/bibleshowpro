use std::path::PathBuf;

#[tokio::main]
async fn main() {
    let db_path = std::env::args()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(default_db_path);

    println!("Bible Show Pro — importing core Bible packages");
    println!("Database: {}", db_path.display());

    let progress: bible_show_pro_lib::bible::install::ProgressFn =
        Box::new(|msg| println!("  {msg}"));

    match bible_show_pro_lib::bible::install::ensure_core_packages(&db_path, Some(progress)).await {
        Ok(stats) if stats.is_empty() => println!("All core packages already installed."),
        Ok(stats) => {
            for s in stats {
                println!(
                    "✓ {} — {} verses",
                    s.abbreviation, s.verse_count
                );
            }
        }
        Err(e) => {
            eprintln!("Import failed: {e}");
            std::process::exit(1);
        }
    }
}

fn default_db_path() -> PathBuf {
    let base = std::env::var("APPDATA")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".into());
    PathBuf::from(base)
        .join("com.bibleshowpro.app")
        .join("bible-show-pro.db")
}
