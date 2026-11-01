declare module '@deepseek-ai/schemastery' {
  export interface Schema<S = any, T = S> {
    (value?: S): T
    default(val: Partial<T>): Schema<S | undefined, T>
    required(): Schema<S, T>
    min(n: number): Schema<S, T>
    max(n: number): Schema<S, T>
    step(n: number): Schema<S, T>
  }
  export interface SchemaStatic {
    string(): Schema<string | undefined, string>
    number(): Schema<number | undefined, number>
    natural(): Schema<number | undefined, number>
    boolean(): Schema<boolean | undefined, boolean>
    array<T>(inner: Schema<T> | StringConstructor): Schema<T[] | undefined, T[]>
    object<T extends Record<string, Schema<any, any>>>(
      shape: T,
    ): Schema<
      { [K in keyof T]?: Parameters<T[K]>[0] },
      { [K in keyof T]: ReturnType<T[K]> }
    >
  }
  const z: SchemaStatic
  export default z
}
