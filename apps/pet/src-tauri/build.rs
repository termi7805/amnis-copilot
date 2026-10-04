fn main() {
    // Los comandos propios (#71) se invocan desde la URL del daemon (remota
    // para el ACL): sin declararlos aquí no generan su permiso `allow-*` y
    // la capability no puede concederlo — la llamada se rechaza en silencio.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["resize_pet", "start_drag", "open_dashboard"])),
    )
    .expect("error al ejecutar tauri-build");
}
