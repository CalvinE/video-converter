import { JobFile } from '../VideoConverter';
import { ISweetDisplayManager } from './models';

// https://en.wikipedia.org/wiki/ANSI_escape_code

const ESC = "\x1B";
const CSI = "[";
const EID = "J"; // \x1B[2J // clears entire screen and moves cursor up and to the left.
const CP = "H"; // \x1B[1;1H // sets the cursor to the top left most position

export class TTYOutputWriter implements ISweetDisplayManager {
    updateDisplayInfo(jobFileData: JobFile, currentJobsData: { commandID: string; pctDone: number; }): void {
        throw new Error('Method not implemented.');
    }
    supportsProgressiveUpdates(): boolean {
        throw new Error('Method not implemented.');
    }
    initialize(): Promise<void> {
        throw new Error('Method not implemented.');
    }
    write(message: string): void {
        throw new Error('Method not implemented.');
    }
    writeLine(message: string): void {
        throw new Error('Method not implemented.');
    }
    writeObject(data: unknown): void {
        throw new Error('Method not implemented.');
    }
    shutdown(): Promise<void> {
        throw new Error('Method not implemented.');
    }

}