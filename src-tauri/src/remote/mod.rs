//! The church-network server: a phone view of what is on the projector, and a remote
//! control for the operator or preacher, protected by a PIN.
//!
//! It is off until the operator turns it on. It serves two built-in pages and the live
//! words on screen; it never serves files from the PC.

mod view;

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::Html;
use axum::routing::{get, post};
use axum::{Json, Router};
use futures_util::stream::{self, Stream, StreamExt};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::convert::Infallible;
use std::net::{IpAddr, Ipv4Addr};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Listener};
use tokio::sync::{broadcast, oneshot};

pub const DEFAULT_PORT: u16 = 4316;
const PHONE_PAGE: &str = include_str!("phone.html");
const REMOTE_PAGE: &str = include_str!("remote.html");
/// Wrong PINs allowed before the remote stops accepting any for a minute.
const MAX_FAILED_PINS: u32 = 5;
const LOCKOUT: Duration = Duration::from_secs(60);
/// What the remote may do: the same actions as the operator's keyboard.
const COMMANDS: &[&str] = &["prev", "next", "go-live", "accept-next", "blackout", "clear"];
/// Ends every open phone connection when the server stops.
const CLOSED: &str = "\u{0}closed";

#[derive(Clone, Serialize, PartialEq)]
struct Live {
    view: view::PhoneView,
    caption: Option<String>,
    translation: Option<String>,
}

static LIVE: Lazy<Mutex<Live>> = Lazy::new(|| {
    Mutex::new(Live {
        view: view::phone_view(None),
        caption: None,
        translation: None,
    })
});
static UPDATES: Lazy<broadcast::Sender<String>> = Lazy::new(|| broadcast::channel(32).0);

struct Running {
    port: u16,
    pin: String,
    stop: oneshot::Sender<()>,
}

static SERVER: Mutex<Option<Running>> = Mutex::new(None);

fn snapshot() -> String {
    let live = LIVE.lock().map(|l| l.clone()).unwrap_or_else(|e| e.into_inner().clone());
    serde_json::to_string(&live).unwrap_or_default()
}

fn update(change: impl FnOnce(&mut Live)) {
    let Ok(mut live) = LIVE.lock() else { return };
    let before = live.clone();
    change(&mut live);
    if *live != before {
        let json = serde_json::to_string(&*live).unwrap_or_default();
        drop(live);
        let _ = UPDATES.send(json);
    }
}

/// Called with every program change, so phones follow the projector.
pub fn publish_program(scene: &Option<Value>) {
    let view = view::phone_view(scene.as_ref());
    update(|live| live.view = view);
}

/// Forward caption changes from the main window to phones.
pub fn listen_for_captions(app: &AppHandle) {
    app.listen("caption-update", |event| {
        if let Ok(snapshot) = serde_json::from_str::<Value>(event.payload()) {
            let caption = view::caption_text(&snapshot);
            let translation = view::caption_translation(&snapshot);
            update(|live| {
                live.caption = caption;
                live.translation = translation;
            });
        }
    });
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteStatus {
    pub running: bool,
    pub port: u16,
    /// Phone view address on each church network this PC is on; the first is the likeliest.
    pub phone_urls: Vec<String>,
    pub pin: Option<String>,
    /// QR code for the first phone address.
    pub qr_svg: Option<String>,
}

/// Private IPv4 addresses phones on the same network can reach.
fn lan_addresses() -> Vec<Ipv4Addr> {
    let mut found: Vec<Ipv4Addr> = if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|iface| match iface.ip() {
            IpAddr::V4(ip) if ip.is_private() && !ip.is_loopback() => Some(ip),
            _ => None,
        })
        .collect();
    // Home and church routers hand out 192.168.x.x; virtual adapters favour 172.x.
    found.sort_by_key(|ip| match ip.octets()[0] {
        192 => 0,
        10 => 1,
        _ => 2,
    });
    found.dedup();
    found
}

pub fn status() -> RemoteStatus {
    let server = SERVER.lock().ok();
    let running = server.as_ref().and_then(|s| s.as_ref().map(|r| (r.port, r.pin.clone())));
    match running {
        Some((port, pin)) => {
            let phone_urls: Vec<String> = lan_addresses().iter().map(|ip| format!("http://{ip}:{port}/")).collect();
            let qr_svg = phone_urls.first().and_then(|url| qr_svg(url, None).ok());
            RemoteStatus {
                running: true,
                port,
                phone_urls,
                pin: Some(pin),
                qr_svg,
            }
        }
        None => RemoteStatus {
            running: false,
            port: DEFAULT_PORT,
            phone_urls: Vec::new(),
            pin: None,
            qr_svg: None,
        },
    }
}

fn new_pin() -> String {
    format!("{:06}", uuid::Uuid::new_v4().as_u128() % 1_000_000)
}

pub async fn start(app: AppHandle, port: u16) -> Result<RemoteStatus, String> {
    if SERVER.lock().map_err(|e| e.to_string())?.is_some() {
        return Ok(status());
    }
    let listener = tokio::net::TcpListener::bind((Ipv4Addr::UNSPECIFIED, port))
        .await
        .map_err(|e| format!("Port {port} is not available ({e}). Another program may be using it; choose another port."))?;
    let pin = new_pin();
    let router = router(
        pin.clone(),
        Arc::new(move |action: &str| app.emit_to("main", "remote-command", action).is_ok()),
    );

    let (stop, stopped) = oneshot::channel::<()>();
    tauri::async_runtime::spawn(async move {
        let shutdown = async {
            let _ = stopped.await;
        };
        if let Err(error) = axum::serve(listener, router).with_graceful_shutdown(shutdown).await {
            eprintln!("[remote] server stopped: {error}");
        }
    });
    *SERVER.lock().map_err(|e| e.to_string())? = Some(Running { port, pin, stop });
    Ok(status())
}

pub fn stop() {
    let running = SERVER.lock().ok().and_then(|mut s| s.take());
    if let Some(running) = running {
        let _ = running.stop.send(());
        let _ = UPDATES.send(CLOSED.to_string());
    }
}

/// Hands a remote command to the operator's window; false when it is not there.
type CommandSink = Arc<dyn Fn(&str) -> bool + Send + Sync>;

struct ServerState {
    pin: PinGuard,
    run: CommandSink,
}

/// The remote's PIN, and how many wrong ones have been tried against it.
struct PinGuard {
    pin: String,
    failed: Mutex<(u32, Option<Instant>)>,
}

impl PinGuard {
    fn new(pin: String) -> Self {
        Self { pin, failed: Mutex::new((0, None)) }
    }

    /// `Err` while too many wrong PINs have been tried.
    fn check(&self, given: &str) -> Result<bool, ()> {
        let mut failed = self.failed.lock().map_err(|_| ())?;
        if let Some(until) = failed.1 {
            if Instant::now() < until {
                return Err(());
            }
            *failed = (0, None);
        }
        if given.trim() == self.pin {
            *failed = (0, None);
            return Ok(true);
        }
        failed.0 += 1;
        if failed.0 >= MAX_FAILED_PINS {
            failed.1 = Some(Instant::now() + LOCKOUT);
        }
        Ok(false)
    }
}

fn router(pin: String, run: CommandSink) -> Router {
    Router::new()
        .route("/", get(|| async { Html(PHONE_PAGE) }))
        .route("/remote", get(|| async { Html(REMOTE_PAGE) }))
        .route("/events", get(events))
        .route("/api/command", post(command))
        .with_state(Arc::new(ServerState { pin: PinGuard::new(pin), run }))
}

async fn events() -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let first = stream::once(async { Ok(Event::default().data(snapshot())) });
    let updates = stream::unfold(UPDATES.subscribe(), |mut rx| async move {
        match rx.recv().await {
            Ok(message) if message == CLOSED => None,
            Ok(message) => Some((Ok(Event::default().data(message)), rx)),
            // Too far behind to replay: the current state is all a phone needs.
            Err(broadcast::error::RecvError::Lagged(_)) => Some((Ok(Event::default().data(snapshot())), rx)),
            Err(broadcast::error::RecvError::Closed) => None,
        }
    });
    Sse::new(first.chain(updates)).keep_alive(KeepAlive::default())
}

#[derive(Deserialize)]
struct Command {
    pin: String,
    action: String,
}

async fn command(State(state): State<Arc<ServerState>>, Json(command): Json<Command>) -> StatusCode {
    match state.pin.check(&command.pin) {
        Err(()) => return StatusCode::TOO_MANY_REQUESTS,
        Ok(false) => return StatusCode::UNAUTHORIZED,
        Ok(true) => {}
    }
    // "check" only signs the remote in.
    if command.action == "check" {
        return StatusCode::NO_CONTENT;
    }
    if !COMMANDS.contains(&command.action.as_str()) {
        return StatusCode::BAD_REQUEST;
    }
    if (state.run)(&command.action) {
        StatusCode::NO_CONTENT
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    }
}

/// QR code for `url` as SVG. With a caption it is a 16:9 slide for the projector.
pub fn qr_svg(url: &str, caption: Option<&str>) -> Result<String, String> {
    let code = qrcode::QrCode::new(url.as_bytes()).map_err(|e| e.to_string())?;
    let width = code.width();
    let quiet = 4;
    let size = width + 2 * quiet;
    let mut modules = String::new();
    for (i, color) in code.to_colors().iter().enumerate() {
        if *color == qrcode::Color::Dark {
            modules.push_str(&format!("M{} {}h1v1h-1z", i % width + quiet, i / width + quiet));
        }
    }
    let Some(caption) = caption else {
        return Ok(format!(
            r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" shape-rendering="crispEdges"><rect width="{size}" height="{size}" fill="#fff"/><path d="{modules}" fill="#000"/></svg>"##
        ));
    };
    let scale = 600.0 / size as f64;
    let escape = |s: &str| s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;");
    Ok(format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#fff"/><g transform="translate(130 150) scale({scale})" shape-rendering="crispEdges"><rect width="{size}" height="{size}" fill="#fff"/><path d="{modules}" fill="#000"/></g><g font-family="Segoe UI, Arial, sans-serif" fill="#111"><text x="820" y="360" font-size="66" font-weight="700">{caption}</text><text x="820" y="450" font-size="42" fill="#444">Scan the code, or open</text><text x="820" y="520" font-size="46" font-family="Consolas, monospace">{url}</text><text x="820" y="600" font-size="36" fill="#666">on the church Wi-Fi</text></g></svg>"##,
        caption = escape(caption),
        url = escape(url),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The real server on a loopback port: pages, live updates and commands.
    #[tokio::test]
    async fn serves_phones_and_the_remote() {
        let ran = Arc::new(Mutex::new(Vec::<String>::new()));
        let log = ran.clone();
        let app = router(
            "424242".into(),
            Arc::new(move |action: &str| {
                log.lock().unwrap().push(action.to_string());
                true
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let client = reqwest::Client::new();

        let page = client.get(format!("{base}/")).send().await.unwrap().text().await.unwrap();
        assert!(page.contains("EventSource(\"/events\")"));
        assert!(client.get(format!("{base}/remote")).send().await.unwrap().status().is_success());

        // A phone connecting mid-service gets what is on screen, then each change.
        publish_program(&Some(serde_json::json!({
            "type": "scripture_fullscreen",
            "content": { "reference": "Psalms 23:1", "verses": [{ "verse": 1, "text": "The LORD is my shepherd" }] }
        })));
        let mut events = client.get(format!("{base}/events")).send().await.unwrap();
        let first = String::from_utf8(events.chunk().await.unwrap().unwrap().to_vec()).unwrap();
        assert!(first.starts_with("data: ") && first.contains("Psalms 23:1"), "{first}");
        publish_program(&Some(serde_json::json!({ "type": "song_lyrics", "content": { "title": "How Great Thou Art", "body": "O Lord my God" } })));
        let next = String::from_utf8(events.chunk().await.unwrap().unwrap().to_vec()).unwrap();
        assert!(next.contains("How Great Thou Art"), "{next}");
        // The same scene again is not news.
        let mut rx = UPDATES.subscribe();
        publish_program(&Some(serde_json::json!({ "type": "song_lyrics", "content": { "title": "How Great Thou Art", "body": "O Lord my God" } })));
        assert!(rx.try_recv().is_err(), "an identical scene must not be sent again");

        let send = |pin: &str, action: &str| {
            client
                .post(format!("{base}/api/command"))
                .json(&serde_json::json!({ "pin": pin, "action": action }))
                .send()
        };
        assert_eq!(send("424242", "next").await.unwrap().status(), 204);
        assert_eq!(send("424242", "check").await.unwrap().status(), 204);
        assert_eq!(send("424242", "shutdown-pc").await.unwrap().status(), 400);
        assert_eq!(send("111111", "blackout").await.unwrap().status(), 401);
        assert_eq!(*ran.lock().unwrap(), vec!["next"]);
    }

    #[test]
    fn locks_the_remote_after_repeated_wrong_pins() {
        let guard = PinGuard::new("123456".into());
        for _ in 0..MAX_FAILED_PINS {
            assert_eq!(guard.check("000000"), Ok(false));
        }
        // Even the right PIN is refused until the lockout passes.
        assert_eq!(guard.check("123456"), Err(()));
        *guard.failed.lock().unwrap() = (0, Some(Instant::now() - Duration::from_secs(1)));
        assert_eq!(guard.check(" 123456 "), Ok(true));
    }

    #[test]
    fn pins_are_six_digits() {
        for _ in 0..20 {
            let pin = new_pin();
            assert_eq!(pin.len(), 6);
            assert!(pin.chars().all(|c| c.is_ascii_digit()));
        }
    }

    #[test]
    fn draws_a_qr_code_and_a_projector_slide() {
        let square = qr_svg("http://192.168.1.20:4316/", None).unwrap();
        assert!(square.starts_with("<svg") && square.contains("<path d=\"M"));
        let slide = qr_svg("http://192.168.1.20:4316/", Some("Follow <along>")).unwrap();
        assert!(slide.contains("viewBox=\"0 0 1600 900\""));
        assert!(slide.contains("Follow &lt;along&gt;") && slide.contains("192.168.1.20:4316"));
    }
}
