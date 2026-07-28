// Ventana flotante de la mascota (#32): sin bordes, transparente, siempre
// encima, arrastrable. Carga la URL del daemon en vez de traer su propio
// bundle (docs/STACK.md §3) — la URL se resuelve aquí, en tiempo de
// ejecución, nunca en tauri.conf.json (docs/DESIGN.md: "todo por HTTP con
// URL configurable, nunca localhost hardcodeado").
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::TcpStream;
use std::time::Duration;
use tauri::{WebviewUrl, WebviewWindowBuilder};
use url::Url;

// 500ms basta para distinguir "nada escuchando" de "está tardando": el
// daemon en 127.0.0.1 responde en microsegundos si está vivo.
const PROBE_TIMEOUT: Duration = Duration::from_millis(500);

/// Sondeo TCP, no HTTP: no hace falta una petición completa para saber si
/// hay algo escuchando en el puerto, y evita tirar de un cliente HTTP
/// solo para esto (issue #39).
fn daemon_alive(url: &Url) -> bool {
    let Ok(addrs) = url.socket_addrs(|| None) else {
        return false;
    };
    addrs
        .into_iter()
        .any(|addr| TcpStream::connect_timeout(&addr, PROBE_TIMEOUT).is_ok())
}

fn main() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let url_str = std::env::var("AMNIS_URL")
                .unwrap_or_else(|_| "http://127.0.0.1:4747/pet".to_string());
            let url: Url = url_str.parse()?;

            let mut builder = if daemon_alive(&url) {
                WebviewWindowBuilder::new(app, "pet", WebviewUrl::External(url.clone()))
            } else {
                log::warn!("daemon inalcanzable en {url}, mostrando fallback empaquetado (#39)");
                WebviewWindowBuilder::new(app, "pet", WebviewUrl::App("index.html".into()))
                    .initialization_script(&format!(
                        "window.__AMNIS_URL__ = {:?};",
                        url.origin().ascii_serialization()
                    ))
            };

            builder = builder
                .decorations(false)
                .transparent(true)
                .resizable(false)
                .skip_taskbar(true);

            let window = builder.build()?;

            // Wayland no tiene protocolo estándar de always-on-top ni de
            // posicionamiento: si el compositor lo rechaza, se queda como
            // ventana normal en vez de entrar en pánico (issue #32).
            if let Err(e) = window.set_always_on_top(true) {
                log::warn!("always-on-top no soportado por el compositor: {e}");
            }

            log::info!("amnis-pet arrancado, ventana 'pet' cargando {url}");

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error al arrancar amnis-pet");
}
