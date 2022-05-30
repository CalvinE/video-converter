import { IRunner } from './IRunner';
export class ServerRunner implements IRunner {
    // For the server implementation will start the server and accept connections from clients.
    // I am thinking about having all of this be web socket communications?
    run(): Promise<void> {
        throw new Error('Method not implemented.');
    }
    stop(): Promise<void> {
        throw new Error('Method not implemented.');
    }

}