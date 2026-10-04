/** Forma de `es` con cada texto como `string`: una clave que falte en `en` rompe `tsc`. */
export type Messages<T> = {
  [K in keyof T]: T[K] extends string ? string : Messages<T[K]>;
};
