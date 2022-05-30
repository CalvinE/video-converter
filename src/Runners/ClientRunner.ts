import { IRunner } from './IRunner';
export class ClientRunner implements IRunner {

    // For the client implementation this will initiate a connection with the server and register the handler for different messages.
    // I am thinking trying web sockets for communications...
    run(): Promise<void> {
        throw new Error('Method not implemented.');
    }

    stop(): Promise<void> {
        throw new Error('Method not implemented.');
    }
}