declare module '@stomp/stompjs' {
  export interface IMessage {
    body: string;
    headers: { [key: string]: string };
    ack: () => void;
    nack: () => void;
  }

  export interface StompSubscription {
    unsubscribe: () => void;
  }

  export interface IFrame {
    command: string;
    headers: { [key: string]: string };
    body: string;
  }

  export interface ClientConfig {
    webSocketFactory?: () => any;
    connectHeaders?: { [key: string]: string };
    debug?: (str: string) => void;
    reconnectDelay?: number;
    heartbeatIncoming?: number;
    heartbeatOutgoing?: number;
    onConnect?: (frame: IFrame) => void;
    onDisconnect?: () => void;
    onStompError?: (frame: IFrame) => void;
  }

  export class Client {
    constructor(config?: ClientConfig);
    activate(): void;
    deactivate(): void;
    publish(params: { destination: string; body?: string; headers?: { [key: string]: string } }): void;
    subscribe(destination: string, callback: (message: IMessage) => void): StompSubscription;
    connected: boolean;
  }
}

declare module 'sockjs-client' {
  export default class SockJS {
    constructor(url: string, _reserved?: any, options?: any);
    close(): void;
    send(data: string): void;
    onopen: ((event: Event) => void) | null;
    onclose: ((event: CloseEvent) => void) | null;
    onmessage: ((event: MessageEvent) => void) | null;
    onerror: ((event: Event) => void) | null;
  }
}
