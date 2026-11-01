declare module 'ssh2' {
  export class Client {
    on(event: string, listener: (...args: unknown[]) => void): this
    connect(config: Record<string, unknown>): void
    forwardOut(
      srcIP: string,
      srcPort: number,
      dstIP: string,
      dstPort: number,
      callback: (err: Error | undefined, stream: import('node:stream').Duplex) => void,
    ): void
    exec(
      command: string,
      callback: (err: Error | undefined, stream: import('node:stream').Duplex & { stderr?: import('node:stream').Readable }) => void,
    ): void
    end(): void
    destroy(): void
  }
}
