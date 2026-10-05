// Ventana flotante de la mascota (#32): sin bordes, transparente, siempre
// encima, arrastrable. Carga la URL del daemon en vez de traer su propio
// bundle (docs/STACK.md §3) — la URL se resuelve aquí, en tiempo de
// ejecución, nunca en tauri.conf.json (docs/DESIGN.md: "todo por HTTP con
// URL configurable, nunca localhost hardcodeado").
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod anchor;

use anchor::Anchor;
use std::net::TcpStream;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{
    App, AppHandle, LogicalSize, Manager, PhysicalPosition, RunEvent, Runtime, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use url::Url;

/// Tamaño plegado a escala 1 (#42). Con la escala de los ajustes da el de
/// arranque, antes de que cargue el JS que decide si el panel estaba
/// desplegado. Debe coincidir con `collapsedSize` de `useTauriWindow.ts`,
/// redondeo incluido — si diverge, la ventana nace con un tamaño y salta al
/// correcto en cuanto el JS llama a `resizeWindow`.
const BASE_SIZE: (f64, f64) = (150.0, 110.0);

/// Escalas admitidas: la lista `PET_SCALES` de `packages/shared/src/types.ts`.
const PET_SCALES: [f64; 4] = [0.75, 1.0, 1.3, 1.6];

/// Escala de la mascota plegada (#151) según `settings.json` del daemon.
/// Rust no tiene otro modo de saberla antes de que cargue el JS; un fichero
/// ausente o un valor desconocido dan 1, como `sanitizeSettings`.
fn load_pet_scale() -> f64 {
    let dir = std::env::var_os("AMNIS_DIR")
        .map(PathBuf::from)
        .or_else(|| {
            std::env::var_os("USERPROFILE")
                .or_else(|| std::env::var_os("HOME"))
                .map(|home| PathBuf::from(home).join(".amnis"))
        });
    let scale = dir
        .and_then(|dir| std::fs::read_to_string(dir.join("settings.json")).ok())
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .and_then(|json| json.get("petScale")?.as_f64());
    match scale {
        Some(s) if PET_SCALES.contains(&s) => s,
        _ => 1.0,
    }
}

fn collapsed_size(scale: f64) -> (f64, f64) {
    ((BASE_SIZE.0 * scale).round(), (BASE_SIZE.1 * scale).round())
}

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

// Lo que tarda el sidecar en abrir el puerto: SQLite + rutas, medido en
// ~100ms. 5s es el margen para una máquina lenta antes de rendirse y
// enseñar el fallback (#39), que sigue reconectando por su cuenta.
const SIDECAR_STARTUP: Duration = Duration::from_secs(5);
const SIDECAR_POLL: Duration = Duration::from_millis(100);

/// El daemon que lanzó esta app, si lanzó alguno (#41). Se mata al salir:
/// si ya había uno vivo (p. ej. `pnpm dev`), no es nuestro y no se toca.
struct Sidecar(Mutex<Option<CommandChild>>);

/// Lanza el daemon empaquetado (binario Node SEA) en el puerto de `url`.
/// No depende del `node` del sistema: es lo que permite que la app arranque
/// en una máquina sin Node instalado.
fn spawn_daemon(app: &App, url: &Url) -> Result<CommandChild, Box<dyn std::error::Error>> {
    let resources = app.path().resource_dir()?.join("resources");
    let port = url.port_or_known_default().unwrap_or(4747).to_string();
    let (mut rx, child) = app
        .shell()
        .sidecar("amnis-daemon")?
        .args(["serve", "--exit-with-parent"])
        .env("AMNIS_PORT", port)
        .env("AMNIS_RESOURCES_DIR", resources)
        .spawn()?;

    // Drenar la salida: sin esto se pierde el log del daemon, que es lo
    // único que explica por qué no arrancó.
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    log::info!("daemon: {}", String::from_utf8_lossy(&line).trim_end())
                }
                CommandEvent::Stderr(line) => {
                    log::warn!("daemon: {}", String::from_utf8_lossy(&line).trim_end())
                }
                CommandEvent::Terminated(status) => {
                    log::warn!("el daemon terminó: {status:?}")
                }
                _ => {}
            }
        }
    });

    Ok(child)
}

fn wait_for_daemon(url: &Url, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if daemon_alive(url) {
            return true;
        }
        std::thread::sleep(SIDECAR_POLL);
    }
    false
}

/// Ancla de la ventana `pet` (#71), compartida por el comando de resize y
/// el listener de `Moved`. Dos mutex: `resizing` se retiene mientras se
/// espera al gestor de ventanas, y esa espera necesita que el listener de
/// `Moved` (hilo principal) pueda tomar `anchor` mientras tanto.
struct PetAnchor {
    anchor: Mutex<Anchor>,
    resizing: Mutex<()>,
}

/// Fichero propio y no `tauri-plugin-window-state`: el plugin solo guarda al
/// cerrar la ventana, y una ventana sin decoraciones se cierra matando el
/// proceso — nunca llegó a escribir nada. Aquí se escribe en cada arrastre.
fn anchor_file(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join("pet-position.json"))
}

fn load_anchor(app: &AppHandle) -> Option<PhysicalPosition<i32>> {
    let raw = std::fs::read_to_string(anchor_file(app)?).ok()?;
    let json: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let x = i32::try_from(json.get("x")?.as_i64()?).ok()?;
    let y = i32::try_from(json.get("y")?.as_i64()?).ok()?;
    Some(PhysicalPosition::new(x, y))
}

fn save_anchor(app: &AppHandle, pos: PhysicalPosition<i32>) {
    let Some(path) = anchor_file(app) else { return };
    let json = serde_json::json!({ "x": pos.x, "y": pos.y }).to_string();
    let result = path
        .parent()
        .map_or(Ok(()), std::fs::create_dir_all)
        .and_then(|_| std::fs::write(&path, json));
    if let Err(e) = result {
        log::warn!("no se pudo guardar la posición de la mascota en {path:?}: {e}");
    }
}

/// Coloca la ventana en el ancla guardada antes de mostrarla. Si ya no cae
/// en ningún monitor (uno desconectado, otra resolución), se reencaja en
/// el principal en vez de abrir la ventana fuera de la vista.
fn restore_anchor(app: &AppHandle, window: &WebviewWindow, collapsed: (f64, f64)) {
    let Some(saved) = load_anchor(app) else {
        return;
    };
    let on_screen = window
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .any(|m| anchor::contains(m.work_area(), saved));
    let pos = if on_screen {
        saved
    } else {
        match window.primary_monitor() {
            Ok(Some(monitor)) => {
                let size =
                    LogicalSize::new(collapsed.0, collapsed.1).to_physical(monitor.scale_factor());
                anchor::clamp(saved, size, monitor.work_area())
            }
            _ => return,
        }
    };

    *app.state::<PetAnchor>().anchor.lock().unwrap() = Anchor::new(Some(pos));
    if let Err(e) = window.set_position(pos) {
        log::warn!("no se pudo restaurar la posición de la mascota: {e}");
    }
}

// Lo que tarda el gestor de ventanas en aplicar un resize (medido en X11:
// decenas de ms). Si no llega, se mueve igualmente: mejor un reencaje
// imperfecto que no recolocar.
const RESIZE_SETTLE: Duration = Duration::from_millis(300);
const RESIZE_POLL: Duration = Duration::from_millis(10);

/// Redimensiona la ventana al plegar/desplegar (#42) y la coloca respecto
/// al ancla (#71): desplegada junto a un borde se mete hacia dentro, y al
/// plegar vuelve al punto donde el usuario soltó a BIT. Best-effort como
/// `set_always_on_top`: en Wayland el posicionamiento puede no existir.
///
/// `async` para no correr en el hilo principal: tiene que esperar a que el
/// gestor de ventanas aplique el tamaño antes de mover, y eso pasa por el
/// bucle de eventos. Mover antes falla al plegar: el gestor encaja la
/// ventana en pantalla con el tamaño desplegado aún vigente y la deja en
/// (ancho_pantalla − 320, alto − alto_panel), no en el ancla (medido).
#[tauri::command(async)]
fn resize_pet(window: WebviewWindow, state: tauri::State<PetAnchor>, width: f64, height: f64) {
    // Un despliegue lanza varios resizes seguidos (el alto real se mide
    // después); intercalados, el movimiento de uno usaría el tamaño de otro.
    let _serial = state.resizing.lock().unwrap();
    state.anchor.lock().unwrap().end_drag();
    let size = LogicalSize::new(width, height);
    // GTK recalcula su propio "tamaño natural" a partir del contenido en
    // cada resize, no solo al arrancar — fijar el mínimo una vez alcanzaba
    // para plegar (110px, coincide con el contenido mínimo), pero no para
    // desplegar: sin repetir aquí el mínimo al tamaño exacto que se pide,
    // GTK deshace el `set_size()` por su cuenta (medido con xwininfo:
    // pedía 210×alto y se quedaba en ~174px de ancho).
    let resized = window
        .set_resizable(true)
        .and_then(|_| window.set_min_size(Some(size)))
        .and_then(|_| window.set_size(size));
    if let Err(e) = resized {
        log::warn!("no se pudo redimensionar la ventana: {e}");
        return;
    }

    let (Ok(Some(monitor)), Ok(scale)) = (window.current_monitor(), window.scale_factor()) else {
        return;
    };
    let physical = size.to_physical::<u32>(scale);
    let deadline = Instant::now() + RESIZE_SETTLE;
    while Instant::now() < deadline {
        match window.inner_size() {
            Ok(s)
                if s.width.abs_diff(physical.width) <= 1
                    && s.height.abs_diff(physical.height) <= 1 =>
            {
                break
            }
            _ => std::thread::sleep(RESIZE_POLL),
        }
    }

    let Ok(current) = window.outer_position() else {
        return;
    };
    let target = state
        .anchor
        .lock()
        .unwrap()
        .target(current, physical, monitor.work_area());
    // Sin comparar con `current`: justo después de un resize puede venir
    // desfasada, y mover al mismo sitio no cuesta nada.
    if let Err(e) = window.set_position(target) {
        log::warn!("no se pudo recolocar la ventana: {e}");
    }
}

/// Arrastre nativo de la ventana (#32) marcando antes el ancla (#71): solo
/// los `Moved` que siguen a esta llamada son del usuario.
#[tauri::command]
fn start_drag(window: WebviewWindow, state: tauri::State<PetAnchor>) {
    state.anchor.lock().unwrap().begin_drag();
    if let Err(e) = window.start_dragging() {
        log::warn!("no se pudo arrastrar la ventana: {e}");
    }
}

/// Origen del daemon (sin `/pet`), el que abre el botón de la mascota (#131).
/// Sale de la misma `url` que carga la ventana, así respeta `AMNIS_URL`.
struct DashboardUrl(String);

/// Abre el dashboard en el navegador por defecto (#131). Lo hace el proceso
/// nativo porque un enlace dentro del webview no sale al navegador del
/// sistema. No toca la ventana: la mascota sigue desplegada y en su sitio.
#[tauri::command]
fn open_dashboard(app: AppHandle) {
    open_dashboard_in_browser(&app);
}

fn open_dashboard_in_browser(app: &AppHandle) {
    let url = &app.state::<DashboardUrl>().0;
    if let Err(e) = app.opener().open_url(url, None::<&str>) {
        log::warn!("no se pudo abrir el dashboard en {url}: {e}");
    }
}

/// Entrada «Descargar vX.Y.Z» del menú (#148): etiqueta ya traducida y URL de
/// la release. La pone la ventana `pet`, que es quien recibe el aviso por SSE.
struct UpdateEntry(Mutex<Option<(String, String)>>);

/// Lo único que la entrada puede abrir: el webview carga una URL remota y no
/// debe poder usar el menú para mandar el navegador a cualquier sitio.
const RELEASES_PREFIX: &str = "https://github.com/termi7805/amnis-copilot/releases/";

/// Menú de la bandeja y del clic derecho sobre la mascota. La ventana no
/// tiene decoraciones ni sale en la barra de tareas (ni en el Dock): sin
/// esto no hay forma de cerrar la app. Los clics los atiende
/// `on_pet_menu_event`, registrado una vez para los dos sitios.
fn pet_menu<R: Runtime, M: Manager<R>>(app: &M) -> tauri::Result<Menu<R>> {
    let menu = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "dashboard", "Abrir dashboard", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?,
        ],
    )?;
    if let Some((label, _)) = app.state::<UpdateEntry>().0.lock().unwrap().as_ref() {
        menu.prepend(&PredefinedMenuItem::separator(app)?)?;
        menu.prepend(&MenuItem::with_id(
            app,
            "update",
            label,
            true,
            None::<&str>,
        )?)?;
    }
    Ok(menu)
}

/// `exit` pasa por `RunEvent::Exit`, que es donde se para el daemon lanzado
/// por la app.
fn on_pet_menu_event(app: &AppHandle, event: MenuEvent) {
    match event.id().as_ref() {
        "dashboard" => open_dashboard_in_browser(app),
        "update" => {
            let url = app
                .state::<UpdateEntry>()
                .0
                .lock()
                .unwrap()
                .as_ref()
                .map(|(_, url)| url.clone());
            if let Some(url) = url {
                if let Err(e) = app.opener().open_url(&url, None::<&str>) {
                    log::warn!("no se pudo abrir la release en {url}: {e}");
                }
            }
        }
        "quit" => app.exit(0),
        _ => {}
    }
}

fn build_tray(app: &App) -> tauri::Result<()> {
    let mut tray = TrayIconBuilder::with_id("amnis")
        .tooltip("Amnis Copilot")
        .menu(&pet_menu(app)?);
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// Clic derecho sobre la mascota: el mismo menú que la bandeja, que en
/// GNOME sin la extensión de AppIndicator no existe.
#[tauri::command]
fn show_pet_menu(window: WebviewWindow) {
    if let Err(e) = pet_menu(&window).and_then(|menu| window.popup_menu(&menu)) {
        log::warn!("no se pudo abrir el menú de la mascota: {e}");
    }
}

/// Pone o quita la entrada de actualización (#148) y rehace el menú de la
/// bandeja; el del clic derecho se construye en cada apertura.
#[tauri::command]
fn set_update_menu(app: AppHandle, label: Option<String>, url: Option<String>) {
    let entry = match (label, url) {
        (Some(label), Some(url)) if url.starts_with(RELEASES_PREFIX) => Some((label, url)),
        (Some(_), Some(url)) => {
            log::warn!("URL de release rechazada: {url}");
            return;
        }
        _ => None,
    };
    *app.state::<UpdateEntry>().0.lock().unwrap() = entry;
    let Some(tray) = app.tray_by_id("amnis") else {
        return;
    };
    if let Err(e) = pet_menu(&app).and_then(|menu| tray.set_menu(Some(menu))) {
        log::warn!("no se pudo actualizar el menú de la bandeja: {e}");
    }
}

/// «Cerrar Amnis» del dashboard: el daemon lo difunde por SSE como `quit` y
/// la ventana lo reenvía aquí, porque el navegador no habla con Tauri.
#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

fn main() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Sidecar(Mutex::new(None)))
        .manage(UpdateEntry(Mutex::new(None)))
        .manage(PetAnchor {
            anchor: Mutex::new(Anchor::default()),
            resizing: Mutex::new(()),
        })
        .invoke_handler(tauri::generate_handler![
            resize_pet,
            start_drag,
            open_dashboard,
            show_pet_menu,
            set_update_menu,
            quit_app
        ])
        .on_menu_event(on_pet_menu_event)
        .on_window_event(|window, event| {
            // Cada paso del arrastre se persiste al momento: no hay un "fin
            // de arrastre" fiable ni un cierre limpio en el que guardar.
            if let WindowEvent::Moved(pos) = event {
                let app = window.app_handle();
                let changed = app
                    .state::<PetAnchor>()
                    .anchor
                    .lock()
                    .unwrap()
                    .on_moved(*pos);
                if changed {
                    save_anchor(app, *pos);
                }
            }
        })
        .setup(|app| {
            // `skip_taskbar` no existe en macOS: sin esto la mascota sale
            // en el Dock y en Cmd+Tab como una app más (#130).
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let url_str = std::env::var("AMNIS_URL")
                .unwrap_or_else(|_| "http://127.0.0.1:4747/pet".to_string());
            let url: Url = url_str.parse()?;
            app.manage(DashboardUrl(format!(
                "{}/",
                url.origin().ascii_serialization()
            )));

            // Antes de esperar al daemon, para poder salir aunque el
            // arranque se alargue. Sin bandeja (Linux sin AppIndicator) se
            // arranca igual.
            if let Err(e) = build_tray(app) {
                log::warn!("no se pudo crear el icono de bandeja: {e}");
            }

            let mut alive = daemon_alive(&url);
            if !alive {
                match spawn_daemon(app, &url) {
                    Ok(child) => {
                        *app.state::<Sidecar>().0.lock().unwrap() = Some(child);
                        alive = wait_for_daemon(&url, SIDECAR_STARTUP);
                    }
                    Err(e) => log::error!("no se pudo lanzar el daemon empaquetado: {e}"),
                }
            }

            let mut builder = if alive {
                WebviewWindowBuilder::new(app, "pet", WebviewUrl::External(url.clone()))
            } else {
                log::warn!("daemon inalcanzable en {url}, mostrando fallback empaquetado (#39)");
                WebviewWindowBuilder::new(app, "pet", WebviewUrl::App("index.html".into()))
                    .initialization_script(&format!(
                        "window.__AMNIS_URL__ = {:?};",
                        url.origin().ascii_serialization()
                    ))
            };

            let collapsed = collapsed_size(load_pet_scale());
            builder = builder
                .decorations(false)
                .shadow(false)
                .transparent(true)
                .resizable(true)
                .skip_taskbar(true)
                .inner_size(collapsed.0, collapsed.1)
                // Oculta hasta colocarla en el ancla (#71): sin esto se ve
                // un salto desde la posición por defecto del gestor.
                .visible(false);

            let window = builder.build()?;
            restore_anchor(app.handle(), &window, collapsed);
            window.show()?;

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
                width: collapsed.0,
                height: collapsed.1,
            })) {
                log::warn!("no se pudo fijar el tamaño mínimo de la ventana: {e}");
            }

            log::info!("amnis-pet arrancado, ventana 'pet' cargando {url}");

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error al arrancar amnis-pet")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(child) = app.state::<Sidecar>().0.lock().unwrap().take() {
                    if let Err(e) = child.kill() {
                        log::warn!("no se pudo parar el daemon: {e}");
                    }
                }
            }
        });
}
