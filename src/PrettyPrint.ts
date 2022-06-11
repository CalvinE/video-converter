const trillion = 1_000_000_000_000;
const billion = 1_000_000_000;
const million = 1_000_000;
const thousand = 1_000;

export function dateToFileSafeDate(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    const hour = `${date.getHours()}`.padStart(2, '0');
    const minute = `${date.getMinutes()}`.padStart(2, '0');
    const second = `${date.getSeconds()}`.padStart(2, '0');
    // const millisecond = `${now.getMilliseconds()}`.padStart(2, '0');
    const dateString = `${year}${month}${day}${hour}${minute}${second}`;
    return dateString;
}

export function HHMMSSmmToMilliseconds(HHMMSSmmString: string): number {
    let milliseconds = 0;
    const parts = HHMMSSmmString.split(":");
    const hoursNumber = parseInt(parts[0], 10);
    milliseconds += hoursNumber * 60 * 60 * 1000;
    const minutesNumber = parseInt(parts[1], 10);
    milliseconds += minutesNumber * 60 * 1000;
    const secondsNumber = parseFloat(parts[2]);
    milliseconds += secondsNumber * 1000;
    return Math.floor(milliseconds);
}

export function HHMMSSmmToSeconds(HHMMSSmmString: string): number {
    return HHMMSSmmToMilliseconds(HHMMSSmmString) / 1000;
}

export function millisecondsToHHMMSS(ms: number): string {
    const hours = Math.floor(ms / 1000 / 60 / 60);
    const minutes = Math.floor((ms / 1000 / 60 / 60 - hours) * 60);
    const seconds = Math.ceil(((ms / 1000 / 60 / 60 - hours) * 60 - minutes) * 60);
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function bytesToHumanReadableBytes(bytes: number): string {
    if (Math.abs(bytes) >= trillion) {
        // TerraBytes
        const amount = (bytes / trillion).toFixed(2);
        return `${amount}TB`;
    } else if (Math.abs(bytes) >= billion) {
        // GigaBytes
        const amount = (bytes / billion).toFixed(2);
        return `${amount}GB`;
    } else if (Math.abs(bytes) >= million) {
        // MegaBytes
        const amount = (bytes / million).toFixed(2);
        return `${amount}MB`;
    } else if (Math.abs(bytes) >= thousand) {
        // KiloBytes
        const amount = (bytes / thousand).toFixed(2);
        return `${amount}KB`;
    } else {
        // Bytes ;-(
        return `${Math.floor(bytes)}B`;
    }
}