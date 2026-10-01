# Convenciones del backlog

> Las plantillas viven en [`.github/ISSUE_TEMPLATE/`](../.github/ISSUE_TEMPLATE/).
> Aquí están las reglas que un esqueleto no puede expresar, y el porqué de cada una.

## Por qué hay reglas para esto

El valor de este backlog no está en la lista de cosas por hacer: está en que **cada issue
recuerda por qué se decidió así**. Sin eso, quien la implemente —tú dentro de tres meses, o un
agente en otra sesión— "mejora" algo que estaba puesto por una razón, y la razón no vuelve.

## Dos plantillas, porque son dos géneros

| | Épica | Tarea |
|---|---|---|
| Responde | ¿Por qué existe este bloque y cuándo lo cierro? | ¿Qué escribo y dónde? |
| `Hecho cuando` | Resultado de producto | Comando o experimento |
| Ficheros y firmas | No | Sí |
| `⚠️` | No | Si hay |

Forzar una sola plantilla dejaría media docena de campos vacíos en las épicas. **Una plantilla
con secciones que se dejan en blanco por norma se aprende a ignorar entera**, y la siguiente
issue vuelve a ser un párrafo suelto.

### Issues de seguimiento: un nivel intermedio, no un tercer género

Cuando una épica pasa de unas diez tareas, se agrupan en **issues de seguimiento**: hijas de la
épica y madres de las tareas. Usan la **plantilla de épica** (`**Seguimiento.**` en vez de
`**Épica.**`), porque responden a lo mismo a menor escala: por qué existe el bloque y cuándo se
cierra. Las tareas no cambian.

El agrupamiento es solo jerarquía: los `blocked by` siguen entre tareas, aunque crucen de un
bloque a otro. Ejemplo: E8 → `E8.A`…`E8.D`.

## Las reglas

### 1. El "por qué" es obligatorio, incluso en tareas mecánicas

Si parece que no hay razón, casi siempre hay una restricción que sí lo es. `1.1` parecía "crea
un `tsconfig.json`"; su porqué real es que `erasableSyntaxOnly` no es una preferencia, es lo que
Node exige para ejecutar TypeScript sin build.

Si de verdad no aparece ninguna, sospecha de la issue antes que de la regla: puede que estés
partiendo el trabajo demasiado fino.

### 2. Si la trampa y la razón son la misma cosa, se dice una vez

En el hook fire-and-forget, *"si bloquea, degrada la herramienta que Amnis pretende acompañar"*
es a la vez el motivo del diseño y el aviso al implementarlo. Va en **Por qué** y se omite el
`⚠️`. Un mismo hecho en dos bloques envejece en uno de los dos.

### 3. `⚠️` solo cuando hay trampa de verdad

`1.5` (el test del doble conteo) no lleva ninguna: la trampa *es* la issue. `6.1` lleva tres.
Rellenarlo siempre produce avisos inventados, y **un aviso inventado diluye los reales** — que
es lo contrario de para lo que existe el bloque.

### 4. `Hecho cuando` es una frase, observable, y **capaz de fallar**

Ese último requisito es el que más aprieta y el más útil. `1.5` lo cumple: *el test falla si
alguien cambia la clave de dedupe a `uuid`*. Está escrito desde el fallo que quiere impedir, no
desde el éxito que espera.

**Si un criterio no describe nada que pudiera salir mal, no comprueba nada.**

Prioridad al escribirlo:

1. **Experimento con el mundo real** — *usar Claude Code en otra terminal cambia lo que se ve en
   el navegador*. Prueba la cadena entera, que es donde fallan estos proyectos.
2. **Comando que se ejecuta** — *`tsc --noEmit` no reporta errores*. Inapelable, pero solo existe
   para tooling.
3. **Propiedad del sistema** — *los totales por proyecto cuadran con la suma de eventos crudos*.

Prohibido: listas de tareas (se marcan sin que nada funcione) y nombrar ficheros o funciones
(*"existe `petState.ts`"* no es un criterio, es la tarea otra vez).

### 5. La jerarquía y las dependencias no se escriben en el cuerpo

Se enganchan con **sub-issues** y **`blocked by`** nativos de GitHub. Nada de `Parte de #N` ni de
`Depende de:` en el texto.

No versiones lo que se deriva solo: si la relación vive en el cuerpo *y* en el mecanismo, el día
que se re-padrina una issue el cuerpo miente sin que nada avise. Y el grafo es justo la parte del
backlog que interesa que sea máquina y no prosa — es lo que responde *"¿qué puedo empezar hoy?"*
con una consulta en vez de leyendo 38 issues.

De regalo, GitHub calcula el progreso de cada épica sin que nadie mantenga una casilla.

**El coste:** `gh issue view` no muestra las relaciones. Se recupera con:

```bash
gh api repos/:owner/:repo/issues/N/dependencies/blocked_by -q '.[].number'
gh api repos/:owner/:repo/issues/N/sub_issues -q '.[].number'
```

### 6. Enlaces al diseño solo si existen

`7.1` (CI) no sale de ninguna sección de `DESIGN.md`. Enlazarlo igualmente es ruido con forma de
rigor.

## Etiquetas y milestones

- **Milestone** = épica. Uno por cada una.
- **Capa:** `daemon` · `ui` · `mascota` · `infra`
- **Alcance:** `mvp` · `fase-2`
- **`épica`** solo en las épicas; las issues de seguimiento llevan la etiqueta de capa de su bloque.

## Títulos

`N.M · Descripción` para tareas, `EN · Nombre` para épicas y `EN.X · Nombre` (X = A, B, C…) para
issues de seguimiento. El prefijo numérico ordena el backlog
alfabéticamente sin depender de ninguna vista guardada.
