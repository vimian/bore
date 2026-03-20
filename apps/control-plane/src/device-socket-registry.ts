export interface CloseableSocket {
  close(code?: number, data?: string): void;
}

export class DeviceSocketRegistry<TSocket extends CloseableSocket> {
  readonly #sockets = new Map<string, TSocket>();

  attach(deviceId: string, socket: TSocket): void {
    const previous = this.#sockets.get(deviceId);
    this.#sockets.set(deviceId, socket);

    if (previous && previous !== socket) {
      previous.close(1000, "Replaced by a newer connection");
    }
  }

  get(deviceId: string): TSocket | undefined {
    return this.#sockets.get(deviceId);
  }

  detach(deviceId: string, socket: TSocket): boolean {
    if (this.#sockets.get(deviceId) !== socket) {
      return false;
    }

    this.#sockets.delete(deviceId);
    return true;
  }
}
