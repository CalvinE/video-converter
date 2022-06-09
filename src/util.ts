export function normalizeString(s: string): string {
    return s.toLowerCase().trim();
}

export function isNullOrUndefined(x: unknown): boolean {
    return x === null || x === undefined;
}