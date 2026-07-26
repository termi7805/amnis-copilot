---
name: Tarea
about: Una unidad de trabajo implementable dentro de una épica
title: "N.M · "
labels: ""
---

<!--
Reglas completas: docs/CONVENCIONES.md

La jerarquía y las dependencias NO se escriben aquí: se enganchan con
sub-issues y "blocked by" nativos de GitHub. Nada de "Parte de #N".
-->

<Qué es. Una o dos frases, sin rodeos.>

**Por qué**
<La razón que no es obvia leyendo el código: la restricción, el riesgo,
la decisión ya tomada y su motivo. Si la trampa y la razón son la misma
cosa, va aquí y se omite el bloque ⚠️.>

⚠️ <Lo que muerde al implementar aunque la decisión esté clara. Omitir si
no hay ninguna: un aviso inventado diluye los reales.>

**Implementación**
- `capa/fichero.ts` — `firma(args): Retorno`
- <Lo que evita releer el diseño entero para empezar>

Diseño: [`docs/DESIGN.md` §N](../blob/main/docs/DESIGN.md) · Stack: [`docs/STACK.md` §N](../blob/main/docs/STACK.md)

**Hecho cuando** <una frase observable, que pueda fallar. Sin nombrar
ficheros ni funciones: eso es la tarea otra vez, no su criterio.>
