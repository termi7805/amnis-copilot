# Amnis Copilot

Mascota de escritorio que refleja lo que están haciendo tus sesiones de Claude Code, con un
dashboard local de consumo de cuota (ventanas de 5h y 7d, tokens y coste por proyecto y modelo).
Todo corre en tu máquina: los transcripts nunca salen de ella.

## Descarga

Linux x86_64 y macOS (Apple Silicon e Intel). Última versión en
[Releases](https://github.com/termi7805/amnis-copilot/releases/latest):

| Formato | Para | Descarga |
|---|---|---|
| `.dmg` | Mac con Apple Silicon (M1 y posteriores) | [`amnis-copilot-aarch64.dmg`](https://github.com/termi7805/amnis-copilot/releases/latest/download/amnis-copilot-aarch64.dmg) |
| `.dmg` | Mac con Intel | [`amnis-copilot-x86_64.dmg`](https://github.com/termi7805/amnis-copilot/releases/latest/download/amnis-copilot-x86_64.dmg) |
| AppImage | Cualquier distro Linux, sin instalar | [`amnis-copilot-x86_64.AppImage`](https://github.com/termi7805/amnis-copilot/releases/latest/download/amnis-copilot-x86_64.AppImage) |
| `.deb` | Debian, Ubuntu, Parrot… | [`amnis-copilot-amd64.deb`](https://github.com/termi7805/amnis-copilot/releases/latest/download/amnis-copilot-amd64.deb) |
| `.rpm` | Fedora, openSUSE… | [`amnis-copilot-x86_64.rpm`](https://github.com/termi7805/amnis-copilot/releases/latest/download/amnis-copilot-x86_64.rpm) |

No hace falta Node ni Rust: el daemon va dentro de la app.

### macOS

Abre el `.dmg` y arrastra **Amnis Copilot** a Aplicaciones. La app no está firmada con una cuenta
de Apple Developer, así que la primera vez macOS la bloquea ("está dañada" o "no se puede
verificar el desarrollador"). Para quitarle la cuarentena:

```bash
xattr -dr com.apple.quarantine "/Applications/Amnis Copilot.app"
```

También puedes intentar abrirla y luego ir a **Ajustes del Sistema → Privacidad y seguridad →
Abrir igualmente**. La primera vez que lea la cuota, macOS te pedirá permiso para acceder al
llavero, donde Claude Code guarda su sesión.

### Linux

```bash
# AppImage
chmod +x amnis-copilot-x86_64.AppImage && ./amnis-copilot-x86_64.AppImage

# .deb
sudo apt install ./amnis-copilot-amd64.deb

# .rpm
sudo dnf install ./amnis-copilot-x86_64.rpm
```

## Primer arranque

1. Abre la app: aparece la mascota y el daemon arranca en `http://127.0.0.1:4747`.
2. Abre el dashboard en esa dirección y, en **Ajustes**, pulsa **Reparar hooks**. Añade los
   hooks de Amnis a `~/.claude/settings.json` sin tocar los que ya tengas, con copia de
   seguridad.
3. Usa Claude Code como siempre: la mascota reacciona a cada sesión.

La cuota sale de las credenciales de Claude Code (`~/.claude/.credentials.json` en Linux, el
llavero en macOS), que Amnis solo lee. Sus datos viven en `~/.amnis/`.

## Desarrollo

Monorepo pnpm con Node 24. Arquitectura y decisiones en [`docs/DESIGN.md`](docs/DESIGN.md) y
[`docs/STACK.md`](docs/STACK.md).

```bash
pnpm install
pnpm dev          # daemon + dashboard en caliente
pnpm test && pnpm typecheck && pnpm lint
```

Para compilar la app hace falta Rust (y en Linux, `libwebkit2gtk-4.1-dev`):
`pnpm --filter @amnis/pet build`.

### Publicar una versión

Sube la versión en los `package.json`, `apps/pet/src-tauri/tauri.conf.json`, `Cargo.toml` /
`Cargo.lock` y `VERSION` de `packages/daemon/src/config.ts`; intégrala en `main` y sube el tag:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

El workflow `Release` construye los paquetes de Linux y macOS y publica la release. Falla si el
tag no coincide con la versión de `tauri.conf.json`. Lanzado a mano
(`gh workflow run Release --ref <rama>`) compila y prueba todo sin publicar nada.
