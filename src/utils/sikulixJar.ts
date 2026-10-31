import * as path from 'path';

export type StubGeneration = 'oculix' | 'sikulix';

// In order of preference. OculiX's API jar is absent on purpose, since it cannot run a script.
const WORKSPACE_JARS = [/^oculixide.*\.jar$/i, /^sikulix.*\.jar$/i];

const OCULIX_MIN_JAVA = 17;

function name(jarPath: string): string {
    return path.basename(jarPath);
}

/** The jar a workspace root offers out of its file names, if any. */
export function pickWorkspaceJar(names: string[]): string | undefined {
    for (const pattern of WORKSPACE_JARS) {
        const jar = names.find(candidate => pattern.test(candidate));
        if (jar) {
            return jar;
        }
    }
    return undefined;
}

/** OculiX's API jar is a library, with no main class and no Jython to run a script in. */
export function cannotRunScripts(jarPath: string): boolean {
    return /^oculixapi/i.test(name(jarPath));
}

/** The oldest Java major version a jar runs on, or 0 when there is no known floor. */
export function minimumJava(jarPath: string): number {
    return /^oculix/i.test(name(jarPath)) ? OCULIX_MIN_JAVA : 0;
}

export function majorVersion(version: string): number {
    const parts = version.split('.');
    // Pre-9 runtimes report as 1.8.x, where the major version is the second part.
    const major = parts[0] === '1' ? parts[1] : parts[0];
    return parseInt(major, 10) || 0;
}

/** A version that could not be read is given the benefit of the doubt. */
export function meetsMinimumJava(version: string, minimum: number): boolean {
    const major = majorVersion(version);
    return major === 0 || major >= minimum;
}

/** Which API a jar exposes. With no jar chosen yet, the current one is the better guess. */
export function stubGeneration(jarPath: string | null): StubGeneration {
    return jarPath === null || /^oculix/i.test(name(jarPath)) ? 'oculix' : 'sikulix';
}
