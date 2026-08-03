// Ventana flotante de la mascota (#32): sin bordes, transparente, siempre
// encima, arrastrable. Carga la URL del daemon en vez de traer su propio
// bundle (docs/STACK.md §3) — la URL se resuelve aquí, en tiempo de
// ejecución, nunca en tauri.conf.json (docs/DESIGN.md: "todo por HTTP con
// URL configurable, nunca localhost hardcodeado").
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::TcpStream;
use std::time::Duration;
use tauri::{WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_window_state::StateFlags;
use url::Url;

/// Tamaño de arranque plegado (#42): antes de que cargue el JS que decide
/// si el panel de cuota estaba desplegado. Debe coincidir con
/// `COLLAPSED_SIZE` de `useTauriWindow.ts` — si diverge, la ventana nace
/// con un tamaño y salta al correcto en cuanto el JS llama a `resizeWindow`.
const COLLAPSED_SIZE: (f64, f64) = (150.0, 110.0);

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
        .plugin(
            // Solo posición: el tamaño ahora lo decide el JS según
            // `expanded` en localStorage (#42). Restaurar SIZE aquí
            // pelearía con el setSize() que dispara PetWindow.tsx en
            // cada arranque.
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::POSITION | StateFlags::VISIBLE)
                .build(),
        )
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
                .resizable(true)
                .skip_taskbar(true)
                .inner_size(COLLAPSED_SIZE.0, COLLAPSED_SIZE.1);

            let window = builder.build()?;

            // Wayland no tiene protocolo estándar de always-on-top ni de
            // posicionamiento: si el compositor lo rechaza, se queda como
            // ventana normal en vez de entrar en pánico (issue #32).
            if let Err(e) = window.set_always_on_top(true) {
                log::warn!("always-on-top no soportado por el compositor: {e}");
            }

            // Sin un mínimo explícito, GTK le pone a la ventana su propio
            // "tamaño natural" como suelo — el `setSize()` de
            // `resizeWindow()` (useTauriWindow.ts) se quedaba clavado en
            // ~230-250px de alto en vez de los 110 pedidos (medido con
            // xwininfo). Pedirlo con `.min_inner_size()` en el builder
            // (antes de `.build()`) provoca un segfault en GTK con estos
            // valores — hay que fijarlo en tiempo de ejecución, después de
            // construir la ventana, y una sola vez: basta para que todos
            // los `setSize()` posteriores (plegar y desplegar) respeten el
            // tamaño exacto pedido, sin tocarlo de nuevo desde el JS.
            if let Err(e) = window.set_min_size(Some(tauri::LogicalSize {
                width: COLLAPSED_SIZE.0,
                height: COLLAPSED_SIZE.1,
            })) {
                log::warn!("no se pudo fijar el tamaño mínimo de la ventana: {e}");
            }

            log::info!("amnis-pet arrancado, ventana 'pet' cargando {url}");

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error al arrancar amnis-pet");
}
