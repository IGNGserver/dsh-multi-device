declare module '@deepseek-ai/cordis' {
  export interface Context {
    effect(fn: () => (() => void) | Promise<void> | void, label?: string): () => void
    inject(deps: readonly string[], fn: (ctx: Context) => void): () => void
    on(event: string, listener: (...args: any[]) => any, options?: { global?: boolean }): () => void
    get<T = unknown>(key: string): T | undefined
    readonly root: Context
    readonly logger: {
      info(msg: string, ...args: unknown[]): void
      warn(msg: string, ...args: unknown[]): void
      error(msg: string, ...args: unknown[]): void
    }
  }
  export class Service {
    protected readonly ctx: Context
    constructor(ctx: Context, name: string, immediate?: boolean)
  }
}
