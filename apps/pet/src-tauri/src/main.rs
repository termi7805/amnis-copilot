// Ventana flotante de la mascota (#32): sin bordes, transparente, siempre
// encima, arrastrable. Carga la URL del daemon en vez de traer su propio
// bundle (docs/STACK.md §3) — la URL se resuelve aquí, en tiempo de
// ejecución, nunca en tauri.conf.json (docs/DESIGN.md: "todo por HTTP con
// URL configurable, nunca localhost hardcodeado").
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{WebviewUrl, WebviewWindowBuilder};

fn main() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let url = std::env::var("AMNIS_URL")
                .unwrap_or_else(|_| "http://127.0.0.1:4747/pet".to_string());
            let webview_url = WebviewUrl::External(url.parse()?);

            let window = WebviewWindowBuilder::new(app, "pet", webview_url)
                .decorations(false)
                .transparent(true)
                .resizable(false)
                .skip_taskbar(true)
                .build()?;

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
