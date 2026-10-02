// Ancla de la ventana flotante (#71): la posición que eligió el usuario
// arrastrando a BIT. Desplegar un panel junto a un borde obliga a meter la
// ventana hacia dentro, pero eso es transitorio — al plegar, BIT vuelve al
// ancla. Solo un arrastre la cambia.
//
// Un `Moved` cuenta como arrastre solo entre `begin_drag` (lo llama el
// comando que arranca el arrastre nativo) y `end_drag` (el siguiente
// resize). Distinguir los ecos de los `set_position` propios comparando
// posiciones no funciona en X11: un solo `set_position` llega como varios
// `Moved`, y al corregir el alto con el panel abierto GTK aún informa de la
// posición anterior después del nuevo `set_position` (medido) — cualquier
// eco desfasado se tomaba por un arrastre y sobrescribía el ancla.

use tauri::{PhysicalPosition, PhysicalRect, PhysicalSize};

#[derive(Debug, Default)]
pub struct Anchor {
    /// `None` hasta el primer arrastre o una posición restaurada.
    pub pos: Option<PhysicalPosition<i32>>,
    dragging: bool,
}

impl Anchor {
    pub fn new(pos: Option<PhysicalPosition<i32>>) -> Self {
        Self {
            pos,
            dragging: false,
        }
    }

    pub fn begin_drag(&mut self) {
        self.dragging = true;
    }

    /// No hay un "fin de arrastre" fiable (`startDragging()` en X11 no
    /// devuelve un `pointerup`): el arrastre se da por terminado en cuanto
    /// la app vuelve a mover la ventana por su cuenta.
    pub fn end_drag(&mut self) {
        self.dragging = false;
    }

    /// `true` si el movimiento es un arrastre del usuario y el ancla cambió
    /// (hay que persistirla).
    pub fn on_moved(&mut self, pos: PhysicalPosition<i32>) -> bool {
        if !self.dragging || self.pos == Some(pos) {
            return false;
        }
        self.pos = Some(pos);
        true
    }

    /// Dónde debe quedar la ventana con `size`: el ancla (o `current` si aún
    /// no hay) metida en el área de trabajo.
    pub fn target(
        &self,
        current: PhysicalPosition<i32>,
        size: PhysicalSize<u32>,
        work_area: &PhysicalRect<i32, u32>,
    ) -> PhysicalPosition<i32> {
        clamp(self.pos.unwrap_or(current), size, work_area)
    }
}

/// Mete la ventana en el área de trabajo moviéndola hacia dentro, nunca
/// agrandándola. Si no cabe, manda el borde superior izquierdo.
pub fn clamp(
    pos: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    work_area: &PhysicalRect<i32, u32>,
) -> PhysicalPosition<i32> {
    let (wx, wy) = (work_area.position.x, work_area.position.y);
    let max_x = wx + work_area.size.width as i32 - size.width as i32;
    let max_y = wy + work_area.size.height as i32 - size.height as i32;
    PhysicalPosition::new(pos.x.min(max_x).max(wx), pos.y.min(max_y).max(wy))
}

/// ¿Cae la esquina superior izquierda de la ventana dentro de `work_area`?
/// Al restaurar, una posición fuera de todos los monitores (uno
/// desconectado, otra resolución) abriría la ventana invisible.
pub fn contains(work_area: &PhysicalRect<i32, u32>, pos: PhysicalPosition<i32>) -> bool {
    let (wx, wy) = (work_area.position.x, work_area.position.y);
    pos.x >= wx
        && pos.y >= wy
        && pos.x < wx + work_area.size.width as i32
        && pos.y < wy + work_area.size.height as i32
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCREEN: PhysicalRect<i32, u32> = PhysicalRect {
        position: PhysicalPosition { x: 0, y: 0 },
        size: PhysicalSize {
            width: 1920,
            height: 1080,
        },
    };
    const COLLAPSED: PhysicalSize<u32> = PhysicalSize {
        width: 150,
        height: 110,
    };
    const EXPANDED: PhysicalSize<u32> = PhysicalSize {
        width: 320,
        height: 400,
    };

    fn p(x: i32, y: i32) -> PhysicalPosition<i32> {
        PhysicalPosition::new(x, y)
    }

    /// Simula `resize_pet` con los ecos que se midieron en X11: varios
    /// `Moved` al destino y, tras él, uno desfasado con la posición vieja.
    fn resize(anchor: &mut Anchor, window: &mut PhysicalPosition<i32>, size: PhysicalSize<u32>) {
        anchor.end_drag();
        let target = anchor.target(*window, size, &SCREEN);
        let before = *window;
        *window = target;
        for echo in [target, target, before, target] {
            assert!(!anchor.on_moved(echo), "un eco del resize no es un arrastre");
        }
    }

    fn drag(anchor: &mut Anchor, window: &mut PhysicalPosition<i32>, to: PhysicalPosition<i32>) {
        anchor.begin_drag();
        *window = to;
        assert!(anchor.on_moved(to));
    }

    #[test]
    fn desplegar_junto_al_borde_no_mueve_el_ancla() {
        let mut anchor = Anchor::default();
        let mut window = p(0, 0);
        drag(&mut anchor, &mut window, p(1760, 900));

        for _ in 0..5 {
            resize(&mut anchor, &mut window, EXPANDED);
            assert_eq!(window, p(1600, 680));
            // El alto real del panel se corrige tras medirlo.
            resize(&mut anchor, &mut window, PhysicalSize::new(320, 300));
            resize(&mut anchor, &mut window, COLLAPSED);
            assert_eq!(window, p(1760, 900));
        }
        assert_eq!(anchor.pos, Some(p(1760, 900)));
    }

    #[test]
    fn arrastrar_desplegado_mueve_el_ancla() {
        let mut anchor = Anchor::new(Some(p(1760, 900)));
        let mut window = p(1760, 900);
        resize(&mut anchor, &mut window, EXPANDED);

        drag(&mut anchor, &mut window, p(500, 300));
        resize(&mut anchor, &mut window, COLLAPSED);
        assert_eq!(window, p(500, 300));
    }

    #[test]
    fn sin_arrastre_ningun_movimiento_cambia_el_ancla() {
        let mut anchor = Anchor::new(Some(p(10, 10)));
        assert!(!anchor.on_moved(p(0, 0)));
        assert_eq!(anchor.pos, Some(p(10, 10)));
    }

    #[test]
    fn una_posicion_fuera_de_pantalla_se_reencaja() {
        assert!(!contains(&SCREEN, p(99_999, 99_999)));
        assert_eq!(clamp(p(99_999, 99_999), COLLAPSED, &SCREEN), p(1770, 970));
        assert_eq!(clamp(p(-500, -500), COLLAPSED, &SCREEN), p(0, 0));
    }
}
