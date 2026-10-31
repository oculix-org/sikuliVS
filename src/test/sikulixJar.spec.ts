import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import {
    cannotRunScripts,
    majorVersion,
    meetsMinimumJava,
    minimumJava,
    pickWorkspaceJar,
    stubGeneration
} from '../utils/sikulixJar';

describe('workspace jar discovery', () => {
    test('finds an OculiX IDE jar', () => {
        assert.equal(pickWorkspaceJar(['a.txt', 'oculixide-4.0.0-linux.jar']), 'oculixide-4.0.0-linux.jar');
    });

    test('finds either SikuliX jar', () => {
        assert.equal(pickWorkspaceJar(['sikulixapi-2.0.5-linux.jar']), 'sikulixapi-2.0.5-linux.jar');
        assert.equal(pickWorkspaceJar(['sikulixide-2.0.5-linux.jar']), 'sikulixide-2.0.5-linux.jar');
    });

    test('prefers OculiX whatever the listing order', () => {
        assert.equal(
            pickWorkspaceJar(['sikulixapi-2.0.5-linux.jar', 'oculixide-4.0.0-linux.jar']),
            'oculixide-4.0.0-linux.jar'
        );
    });

    test('ignores jars that cannot run a script', () => {
        assert.equal(pickWorkspaceJar(['oculixapi-4.0.0-linux.jar', 'oculix-mcp-server-4.0.0.jar']), undefined);
    });
});

describe('what a jar can do', () => {
    test('only the OculiX API jar cannot run scripts', () => {
        assert.equal(cannotRunScripts('/opt/oculixapi-4.0.0-linux.jar'), true);
        assert.equal(cannotRunScripts('/opt/oculixide-4.0.0-linux.jar'), false);
        assert.equal(cannotRunScripts('/opt/sikulixapi-2.0.5-linux.jar'), false);
    });

    test('a folder name does not decide it', () => {
        assert.equal(cannotRunScripts('/opt/oculixapi/sikulixapi-2.0.5-linux.jar'), false);
        assert.equal(minimumJava('/opt/oculix/sikulixide-2.0.5-linux.jar'), 0);
    });

    test('OculiX needs Java 17, anything else has no known floor', () => {
        assert.equal(minimumJava('/opt/oculixide-4.0.0-linux.jar'), 17);
        assert.equal(minimumJava('/opt/sikulixapi-2.0.5-linux.jar'), 0);
        assert.equal(minimumJava('/opt/renamed.jar'), 0);
    });

    test('each jar gets the stub for its own API', () => {
        assert.equal(stubGeneration('/opt/oculixide-4.0.0-linux.jar'), 'oculix');
        assert.equal(stubGeneration('/opt/sikulixide-2.0.5-linux.jar'), 'sikulix');
        assert.equal(stubGeneration('/opt/sikulixapi-2.0.5-linux.jar'), 'sikulix');
    });

    test('with no jar chosen, the stub is the current API', () => {
        assert.equal(stubGeneration(null), 'oculix');
    });
});

describe('Java versions', () => {
    test('reads modern and pre-9 version strings', () => {
        assert.equal(majorVersion('17.0.20'), 17);
        assert.equal(majorVersion('1.8.0_392'), 8);
        assert.equal(majorVersion('25.0.4.1'), 25);
    });

    test('compares against the minimum', () => {
        assert.equal(meetsMinimumJava('17.0.20', 17), true);
        assert.equal(meetsMinimumJava('21.0.1', 17), true);
        assert.equal(meetsMinimumJava('11.0.22', 17), false);
        assert.equal(meetsMinimumJava('1.8.0_392', 17), false);
    });

    test('anything meets no minimum, and an unreadable version is not held against a runtime', () => {
        assert.equal(meetsMinimumJava('1.8.0_392', 0), true);
        assert.equal(meetsMinimumJava('unknown', 17), true);
    });
});
