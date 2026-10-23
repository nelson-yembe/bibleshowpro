//! The church-network server: a phone view of what is on the projector, and a remote
//! control for the operator or preacher, protected by a PIN.
//!
//! It is off until the operator turns it on. It serves two built-in pages and the live
//! words on screen; it never serves files from the PC.

mod pwa;
mod view;

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{Html, IntoResponse};
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
/// What the remote may do on the Bible page (see `src/lib/remoteBible.ts`).
const BIBLE_ACTIONS: &[&str] = &["search", "open", "verse", "result", "step", "translation", "live"];
/// Ends every open phone connection when the server stops.
const CLOSED: &str = "\u{0}closed";

#[derive(Clone, Serialize, PartialEq)]
struct Live {
    view: view::PhoneView,
    caption: Option<String>,
    translation: Option<String>,
    /// Bumped when the Bible page changes; the remote then fetches it with its PIN, so
    /// congregation phones on the same stream never receive it.
    bible: u64,
}

static LIVE: Lazy<Mutex<Live>> = Lazy::new(|| {
    Mutex::new(Live {
        view: view::phone_view(None),
        caption: None,
        translation: None,
        bible: 0,
    })
});

/// The Bible page as the app last published it, and the book list for its picker.
static BIBLE_STATE: Mutex<String> = Mutex::new(String::new());
static BIBLE_BOOKS: Mutex<String> = Mutex::new(String::new());

/// The app's Bible page changed: keep it for the remote and tell the remote to fetch it.
pub fn publish_bible(state: &Value) {
    let json = serde_json::to_string(state).unwrap_or_default();
    let Ok(mut stored) = BIBLE_STATE.lock() else { return };
    if *stored == json {
        return;
    }
    *stored = json;
    drop(stored);
    update(|live| live.bible += 1);
}

pub fn publish_bible_books(books: &Value) {
    if let Ok(mut stored) = BIBLE_BOOKS.lock() {
        *stored = serde_json::to_string(books).unwrap_or_default();
    }
}
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
    /// Phone view address on each network this PC is on, the church Wi-Fi or router first.
    pub addresses: Vec<NetworkAddress>,
    pub pin: Option<String>,
    /// QR code for the first address.
    pub qr_svg: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NetworkAddress {
    pub url: String,
    /// Windows' name for the adapter ("Wi-Fi", "Ethernet"), so the operator can tell them apart.
    pub adapter: String,
}

/// Adapters phones can never reach: virtual switches for VMs, containers and capture tools.
fn is_virtual_adapter(name: &str) -> bool {
    let name = name.to_lowercase();
    ["vethernet", "hyper-v", "virtualbox", "vmware", "wsl", "docker", "loopback", "npcap", "tap-"]
        .iter()
        .any(|virtual_name| name.contains(virtual_name))
}

/// The address Windows would send from to reach the internet: the adapter with the default
/// route, which is the church network. No packet is sent.
fn primary_address() -> Option<Ipv4Addr> {
    let socket = std::net::UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).ok()?;
    socket.connect((Ipv4Addr::new(8, 8, 8, 8), 80)).ok()?;
    match socket.local_addr().ok()?.ip() {
        IpAddr::V4(ip) if ip.is_private() => Some(ip),
        _ => None,
    }
}

/// Private addresses phones on the same network can reach: the default-route adapter first,
/// then real adapters, then this PC's own hotspot (phones joined to it can use that one).
fn order_addresses(found: Vec<(Ipv4Addr, String)>, primary: Option<Ipv4Addr>) -> Vec<(Ipv4Addr, String)> {
    let mut usable: Vec<(Ipv4Addr, String)> = found
        .into_iter()
        .filter(|(ip, name)| ip.is_private() && !ip.is_loopback() && !is_virtual_adapter(name))
        .collect();
    usable.sort_by_key(|(ip, name)| {
        if Some(*ip) == primary {
            0
        } else if name.starts_with("Local Area Connection*") {
            // Windows' mobile hotspot and Wi-Fi Direct adapters.
            2
        } else {
            1
        }
    });
    usable.dedup_by(|a, b| a.0 == b.0);
    usable
}

fn lan_addresses() -> Vec<(Ipv4Addr, String)> {
    let found = if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|iface| match iface.ip() {
            IpAddr::V4(ip) => Some((ip, iface.name)),
            _ => None,
        })
        .collect();
    order_addresses(found, primary_address())
}

pub fn status() -> RemoteStatus {
    let server = SERVER.lock().ok();
    let running = server.as_ref().and_then(|s| s.as_ref().map(|r| (r.port, r.pin.clone())));
    match running {
        Some((port, pin)) => {
            let addresses: Vec<NetworkAddress> = lan_addresses()
                .into_iter()
                .map(|(ip, adapter)| NetworkAddress { url: format!("http://{ip}:{port}/"), adapter })
                .collect();
            let qr_svg = addresses.first().and_then(|a| qr_svg(&a.url, None).ok());
            RemoteStatus {
                running: true,
                port,
                addresses,
                pin: Some(pin),
                qr_svg,
            }
        }
        None => RemoteStatus {
            running: false,
            port: DEFAULT_PORT,
            addresses: Vec::new(),
            pin: None,
            qr_svg: None,
        },
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FirewallStatus {
    /// Windows' profile for the network phones connect through: "Private", "Public" or "Domain".
    pub profile: String,
    pub allowed: bool,
}

/// Whether Windows Firewall lets phones on the primary network reach this app. Asked of
/// PowerShell because the firewall cmdlets answer in enum names, not translated text.
/// `None` when it cannot be told (no network, another firewall, no PowerShell).
#[cfg(windows)]
pub fn firewall_status() -> Option<FirewallStatus> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let ip = lan_addresses().first()?.0;
    let exe = std::env::current_exe().ok()?.to_string_lossy().replace('\'', "''");
    let script = FIREWALL_SCRIPT.replace("{exe}", &exe).replace("{ip}", &ip.to_string());
    // Encoded, so no command-line quoting can strip the script's own quotes.
    let utf16: Vec<u8> = script.encode_utf16().flat_map(u16::to_le_bytes).collect();
    let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, utf16);
    let output = std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", &encoded])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    serde_json::from_str(String::from_utf8_lossy(&output.stdout).trim()).ok()
}

#[cfg(not(windows))]
pub fn firewall_status() -> Option<FirewallStatus> {
    None
}

/// Inbound rules for this exe that apply to the network's profile; a block rule wins.
#[cfg(windows)]
const FIREWALL_SCRIPT: &str = r#"$ErrorActionPreference = 'Stop'
$exe = '{exe}'
$index = (Get-NetIPAddress -IPAddress '{ip}' -AddressFamily IPv4).InterfaceIndex
$category = "$((Get-NetConnectionProfile -InterfaceIndex $index).NetworkCategory)"
$name = if ($category -eq 'DomainAuthenticated') { 'Domain' } else { $category }
$fw = Get-NetFirewallProfile -Name $name
$allowed = $true
if ("$($fw.Enabled)" -eq 'True') {
  $rules = @(Get-NetFirewallApplicationFilter | Where-Object { $_.Program -eq $exe } | Get-NetFirewallRule |
    Where-Object { "$($_.Enabled)" -eq 'True' -and "$($_.Direction)" -eq 'Inbound' -and ("$($_.Profile)" -eq 'Any' -or "$($_.Profile)" -match $name) })
  $allow = @($rules | Where-Object { "$($_.Action)" -eq 'Allow' }).Count -gt 0
  $block = @($rules | Where-Object { "$($_.Action)" -eq 'Block' }).Count -gt 0
  $allowed = (-not $block) -and ($allow -or "$($fw.DefaultInboundAction)" -eq 'Allow')
}
@{ profile = $name; allowed = $allowed } | ConvertTo-Json -Compress"#;

/// Windows' "Allow an app through firewall" page, where the operator ticks Private.
pub fn open_firewall_settings() -> Result<(), String> {
    std::process::Command::new("control.exe")
        .args(["/name", "Microsoft.WindowsFirewall", "/page", "pageConfigureApps"])
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Could not open Windows Firewall settings: {e}"))
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
    let command_app = app.clone();
    let router = router(
        pin.clone(),
        Services {
            run: Arc::new(move |action: &str| command_app.emit_to("main", "remote-command", action).is_ok()),
            bible: Arc::new(move |request: &Value| app.emit_to("main", "remote-bible", request).is_ok()),
        },
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
/// Hands a Bible page action to the app, which runs it as if picked on the page.
type BibleSink = Arc<dyn Fn(&Value) -> bool + Send + Sync>;

/// What the remote can reach in the app.
struct Services {
    run: CommandSink,
    bible: BibleSink,
}

struct ServerState {
    pin: PinGuard,
    services: Services,
}

impl ServerState {
    fn authorize(&self, pin: &str) -> Result<(), StatusCode> {
        match self.pin.check(pin) {
            Err(()) => Err(StatusCode::TOO_MANY_REQUESTS),
            Ok(false) => Err(StatusCode::UNAUTHORIZED),
            Ok(true) => Ok(()),
        }
    }
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

fn router(pin: String, services: Services) -> Router {
    Router::new()
        .route("/", get(|| async { Html(PHONE_PAGE) }))
        .route("/remote", get(|| async { Html(REMOTE_PAGE) }))
        .route("/manifest.webmanifest", get(|| async { pwa::manifest() }))
        .route("/sw.js", get(|| async { pwa::service_worker() }))
        .route("/icons/{name}", get(|axum::extract::Path(name): axum::extract::Path<String>| async move { pwa::icon_file(&name) }))
        .route("/events", get(events))
        .route("/api/command", post(command))
        .route("/api/bible", post(bible_action))
        .route("/api/bible/state", post(bible_state))
        .route("/api/bible/books", post(bible_books))
        .with_state(Arc::new(ServerState { pin: PinGuard::new(pin), services }))
}

#[derive(Deserialize)]
struct Signed {
    pin: String,
}

fn json_reply(body: String) -> axum::response::Response {
    let body = if body.is_empty() { "null".to_string() } else { body };
    ([(axum::http::header::CONTENT_TYPE, "application/json")], body).into_response()
}

/// The Bible page as the app last published it.
async fn bible_state(State(state): State<Arc<ServerState>>, Json(request): Json<Signed>) -> axum::response::Response {
    if let Err(code) = state.authorize(&request.pin) {
        return code.into_response();
    }
    json_reply(BIBLE_STATE.lock().map(|s| s.clone()).unwrap_or_default())
}

/// Book names and verse counts for the Book / Ch / V picker.
async fn bible_books(State(state): State<Arc<ServerState>>, Json(request): Json<Signed>) -> axum::response::Response {
    if let Err(code) = state.authorize(&request.pin) {
        return code.into_response();
    }
    json_reply(BIBLE_BOOKS.lock().map(|s| s.clone()).unwrap_or_default())
}

/// A Bible page action from the remote: the app does it exactly as if picked on the page.
async fn bible_action(State(state): State<Arc<ServerState>>, Json(mut request): Json<Value>) -> StatusCode {
    let pin = request.get("pin").and_then(Value::as_str).unwrap_or_default().to_string();
    if let Err(code) = state.authorize(&pin) {
        return code;
    }
    let action = request.get("action").and_then(Value::as_str).unwrap_or_default();
    if !BIBLE_ACTIONS.contains(&action) {
        return StatusCode::BAD_REQUEST;
    }
    if let Some(fields) = request.as_object_mut() {
        fields.remove("pin");
    }
    if (state.services.bible)(&request) {
        StatusCode::NO_CONTENT
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    }
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
    if let Err(code) = state.authorize(&command.pin) {
        return code;
    }
    // "check" only signs the remote in.
    if command.action == "check" {
        return StatusCode::NO_CONTENT;
    }
    if !COMMANDS.contains(&command.action.as_str()) {
        return StatusCode::BAD_REQUEST;
    }
    if (state.services.run)(&command.action) {
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
        let asked = Arc::new(Mutex::new(Vec::<Value>::new()));
        let bible_log = asked.clone();
        let app = router(
            "424242".into(),
            Services {
                run: Arc::new(move |action: &str| {
                    log.lock().unwrap().push(action.to_string());
                    true
                }),
                bible: Arc::new(move |request: &Value| {
                    bible_log.lock().unwrap().push(request.clone());
                    true
                }),
            },
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let client = reqwest::Client::new();

        let page = client.get(format!("{base}/")).send().await.unwrap().text().await.unwrap();
        assert!(page.contains("EventSource(\"/events\")"));
        assert!(client.get(format!("{base}/remote")).send().await.unwrap().status().is_success());

        // What makes the remote installable on a phone.
        let manifest = client.get(format!("{base}/manifest.webmanifest")).send().await.unwrap();
        assert_eq!(manifest.headers()["content-type"], "application/manifest+json");
        for icon in ["192.png", "512.png", "maskable-512.png", "apple-touch-icon.png"] {
            let response = client.get(format!("{base}/icons/{icon}")).send().await.unwrap();
            assert_eq!(response.headers()["content-type"], "image/png", "{icon}");
        }
        assert_eq!(client.get(format!("{base}/icons/other.png")).send().await.unwrap().status(), 404);
        let worker = client.get(format!("{base}/sw.js")).send().await.unwrap().text().await.unwrap();
        assert!(worker.contains("/api/"), "the service worker must leave the API alone");

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

        // The Bible page: the remote is told it changed, fetches it with the PIN, and acts on it.
        let post = |path: &str, body: serde_json::Value| client.post(format!("{base}{path}")).json(&body).send();
        let mut rx = UPDATES.subscribe();
        publish_bible(&serde_json::json!({ "chapter": { "label": "John 3" }, "activeVerse": 16 }));
        publish_bible(&serde_json::json!({ "chapter": { "label": "John 3" }, "activeVerse": 16 }));
        let mut bumps = 0;
        while let Ok(message) = rx.try_recv() {
            bumps += usize::from(message.contains("\"bible\""));
        }
        assert_eq!(bumps, 1, "an unchanged Bible page must not be announced again");
        let page: serde_json::Value =
            post("/api/bible/state", serde_json::json!({ "pin": "424242" })).await.unwrap().json().await.unwrap();
        assert_eq!(page["activeVerse"], 16);
        publish_bible_books(&serde_json::json!([{ "name": "John", "number": 43, "verses": [51, 25, 36] }]));
        let books: serde_json::Value =
            post("/api/bible/books", serde_json::json!({ "pin": "424242" })).await.unwrap().json().await.unwrap();
        assert_eq!(books[0]["verses"][2], 36);
        let pick = post("/api/bible", serde_json::json!({ "pin": "424242", "action": "verse", "verse": 17 })).await.unwrap();
        assert_eq!(pick.status(), 204);
        assert_eq!(*asked.lock().unwrap(), vec![serde_json::json!({ "action": "verse", "verse": 17 })]);
        let unknown = post("/api/bible", serde_json::json!({ "pin": "424242", "action": "format-disk" })).await.unwrap();
        assert_eq!(unknown.status(), 400);
        let refused = post("/api/bible/state", serde_json::json!({ "pin": "000000" })).await.unwrap();
        assert_eq!(refused.status(), 401);
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
    fn puts_the_church_network_first_and_drops_virtual_adapters() {
        let found = vec![
            (Ipv4Addr::new(172, 17, 176, 1), "vEthernet (Default Switch)".to_string()),
            (Ipv4Addr::new(169, 254, 63, 19), "Bluetooth Network Connection".to_string()),
            (Ipv4Addr::new(192, 168, 137, 1), "Local Area Connection* 2".to_string()),
            (Ipv4Addr::new(172, 20, 196, 254), "Wi-Fi".to_string()),
            (Ipv4Addr::new(127, 0, 0, 1), "Loopback Pseudo-Interface 1".to_string()),
        ];
        let ordered = order_addresses(found, Some(Ipv4Addr::new(172, 20, 196, 254)));
        let names: Vec<&str> = ordered.iter().map(|(_, name)| name.as_str()).collect();
        assert_eq!(names, vec!["Wi-Fi", "Local Area Connection* 2"]);
    }

    #[test]
    fn without_a_default_route_a_real_adapter_still_comes_before_the_hotspot() {
        let found = vec![
            (Ipv4Addr::new(192, 168, 137, 1), "Local Area Connection* 2".to_string()),
            (Ipv4Addr::new(10, 0, 0, 12), "Ethernet".to_string()),
        ];
        assert_eq!(order_addresses(found, None)[0].1, "Ethernet");
    }

    /// Reads this PC's real firewall; run with `cargo test firewall -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn reads_this_pcs_firewall() {
        println!("{:?} {:?}", lan_addresses(), firewall_status());
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
