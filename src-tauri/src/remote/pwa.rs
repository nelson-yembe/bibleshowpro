//! What lets operators add the remote to their home screen: the web app manifest, icons
//! at the sizes phones ask for, and a service worker that keeps the remote's own page
//! available offline. Live data always comes from the server.

use axum::http::header;
use axum::response::{IntoResponse, Response};
use image::{imageops, ImageFormat, Rgba, RgbaImage};
use once_cell::sync::Lazy;
use std::io::Cursor;

/// The app icon, 512 × 512.
const ICON: &[u8] = include_bytes!("../../icons/icon.png");
const BACKGROUND: Rgba<u8> = Rgba([5, 6, 8, 255]);

pub const MANIFEST: &str = r##"{
  "name": "Bible Show Pro Remote",
  "short_name": "BSP Remote",
  "description": "Drive Bible Show Pro from your phone: verses, slides and the screen.",
  "id": "/remote",
  "start_url": "/remote",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#050608",
  "theme_color": "#0b0e14",
  "icons": [
    { "src": "/icons/192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}"##;

/// The remote's page and icons are cached; the API and live stream never are, so a stale
/// verse can never show.
pub const SERVICE_WORKER: &str = r#"const CACHE = "bsp-remote-v1";
const SHELL = ["/remote", "/manifest.webmanifest", "/icons/192.png", "/icons/512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/") || url.pathname === "/events") return;
  // Network first, so an updated app serves its new remote; the cache when the PC is away.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
"#;

fn png(image: &RgbaImage) -> Vec<u8> {
    let mut bytes = Cursor::new(Vec::new());
    image.write_to(&mut bytes, ImageFormat::Png).expect("encode icon");
    bytes.into_inner()
}

fn icon() -> RgbaImage {
    image::load_from_memory(ICON).expect("bundled icon").to_rgba8()
}

fn resized(size: u32) -> Vec<u8> {
    png(&imageops::resize(&icon(), size, size, imageops::FilterType::Lanczos3))
}

/// Android crops maskable icons to a circle or squircle; the logo must sit inside the
/// middle 80 %, on a full-bleed background.
fn maskable() -> Vec<u8> {
    let mut canvas = RgbaImage::from_pixel(512, 512, BACKGROUND);
    let logo = imageops::resize(&icon(), 384, 384, imageops::FilterType::Lanczos3);
    imageops::overlay(&mut canvas, &logo, 64, 64);
    png(&canvas)
}

static ICON_192: Lazy<Vec<u8>> = Lazy::new(|| resized(192));
static ICON_180: Lazy<Vec<u8>> = Lazy::new(|| resized(180));
static ICON_MASKABLE: Lazy<Vec<u8>> = Lazy::new(maskable);

pub fn manifest() -> Response {
    ([(header::CONTENT_TYPE, "application/manifest+json")], MANIFEST).into_response()
}

pub fn service_worker() -> Response {
    (
        [(header::CONTENT_TYPE, "text/javascript"), (header::CACHE_CONTROL, "no-cache")],
        SERVICE_WORKER,
    )
        .into_response()
}

/// `name` is "192.png", "512.png", "maskable-512.png" or "apple-touch-icon.png".
pub fn icon_file(name: &str) -> Response {
    let bytes: &[u8] = match name {
        "512.png" => ICON,
        "192.png" => &ICON_192,
        "maskable-512.png" => &ICON_MASKABLE,
        "apple-touch-icon.png" => &ICON_180,
        _ => return axum::http::StatusCode::NOT_FOUND.into_response(),
    };
    ([(header::CONTENT_TYPE, "image/png"), (header::CACHE_CONTROL, "max-age=86400")], bytes.to_vec()).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_is_installable_json() {
        let manifest: serde_json::Value = serde_json::from_str(MANIFEST).unwrap();
        assert_eq!(manifest["display"], "standalone");
        assert_eq!(manifest["start_url"], "/remote");
        let sizes: Vec<&str> = manifest["icons"].as_array().unwrap().iter().map(|i| i["sizes"].as_str().unwrap()).collect();
        assert!(sizes.contains(&"192x192") && sizes.contains(&"512x512"));
    }

    #[test]
    fn icons_have_the_sizes_the_manifest_claims() {
        for (bytes, size) in [(ICON.to_vec(), 512), (ICON_192.clone(), 192), (ICON_MASKABLE.clone(), 512), (ICON_180.clone(), 180)] {
            let image = image::load_from_memory(&bytes).unwrap();
            assert_eq!((image.width(), image.height()), (size, size));
        }
        // A maskable icon is full-bleed: its corners are the background, not transparent.
        let maskable = image::load_from_memory(&ICON_MASKABLE).unwrap().to_rgba8();
        assert_eq!(*maskable.get_pixel(0, 0), BACKGROUND);
    }
}
