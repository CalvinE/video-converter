import { JobFile } from './../VideoConverter/models';

export interface IOutputWriter {
    supportsProgressiveUpdates(): boolean;
    initialize(): Promise<void>;
    write(message: string): void;
    writeLine(message: string): void;
    writeObject(data: unknown): void;
    shutdown(): Promise<void>;
}



export interface ISweetDisplayManager {
    updateDisplayInfo(jobFileData: JobFile, currentJobsData: { commandID: string; pctDone: number }): void;
}
