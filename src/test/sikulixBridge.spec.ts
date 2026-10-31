import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildRunArgs, launchEnvironment, runSikulixScript, SikulixRun } from '../bridge/sikulixBridge';

const BASE = {
    javaPath: 'java',
    jarPath: '/opt/sikulixapi.jar',
    target: '/home/t/login.sikuli',
    cwd: '/home/t'
};

const UI_SCALE = '-Dsun.java2d.uiScale=1';
const UI_SCALE_OFF = '-Dsun.java2d.uiScale.enabled=false';

describe('SikuliX command line', () => {
    test('always routes output to the console and runs the target', () => {
        assert.deepEqual(buildRunArgs(BASE), [
            UI_SCALE, UI_SCALE_OFF, '-jar', '/opt/sikulixapi.jar', '-c', '-r', '/home/t/login.sikuli'
        ]);
    });

    test('omits -d at debug level 0, since the option rejects it', () => {
        assert.equal(buildRunArgs({ ...BASE, debugLevel: 0 }).includes('-d'), false);
    });

    test('passes a positive debug level through', () => {
        const args = buildRunArgs({ ...BASE, debugLevel: 3 });
        assert.deepEqual(args.slice(args.indexOf('-d'), args.indexOf('-d') + 2), ['-d', '3']);
    });

    test('JVM arguments precede -jar', () => {
        const args = buildRunArgs({ ...BASE, jvmArgs: ['-Xmx512m'] });
        assert.ok(args.indexOf('-Xmx512m') < args.indexOf('-jar'));
    });

    test('pins the Java UI scale, so geometry and the visual tools share a pixel', () => {
        assert.ok(buildRunArgs(BASE).includes(UI_SCALE));
    });

    test('leaves a deliberately chosen scale alone', () => {
        const args = buildRunArgs({ ...BASE, jvmArgs: ['-Dsun.java2d.uiScale=2'] });
        assert.ok(args.includes('-Dsun.java2d.uiScale=2'));
        assert.equal(args.includes(UI_SCALE), false);
    });

    test('sets the scale ahead of the user own arguments, without repeating itself', () => {
        const args = buildRunArgs({ ...BASE, jvmArgs: ['-Xmx512m'] });
        assert.equal(args.filter(arg => arg === UI_SCALE).length, 1);
        assert.ok(args.indexOf(UI_SCALE) < args.indexOf('-Xmx512m'));
    });
});

describe('SikuliX launch environment', () => {
    test('carries the scale properties, for a JVM that replaces the one we launch', () => {
        const env = launchEnvironment(BASE, {});
        assert.equal(env.JAVA_TOOL_OPTIONS, `${UI_SCALE} ${UI_SCALE_OFF}`);
    });

    test('keeps an existing JAVA_TOOL_OPTIONS and appends to it', () => {
        const env = launchEnvironment(BASE, { JAVA_TOOL_OPTIONS: '-Xshare:auto' });
        assert.equal(env.JAVA_TOOL_OPTIONS, `-Xshare:auto ${UI_SCALE} ${UI_SCALE_OFF}`);
    });

    test('leaves a scale chosen in jvmArgs alone', () => {
        const env = launchEnvironment({ ...BASE, jvmArgs: ['-Dsun.java2d.uiScale=2'] }, {});
        assert.equal(env.JAVA_TOOL_OPTIONS, undefined);
    });

    test('leaves a scale already in the environment alone', () => {
        const existing = '-Dsun.java2d.uiScale=2';
        const env = launchEnvironment(BASE, { JAVA_TOOL_OPTIONS: existing });
        assert.equal(env.JAVA_TOOL_OPTIONS, existing);
    });

    test('preserves the rest of the environment', () => {
        const env = launchEnvironment(BASE, { PATH: '/usr/bin' });
        assert.equal(env.PATH, '/usr/bin');
    });
});

describe('stopping a run', { skip: process.platform === 'win32' }, () => {
    /**
     * Starts a shell script in place of java. It prints the pid of a process it leaves
     * running, the way SikuliX 2.0.5 hands a script over to a second JVM.
     */
    async function launch(script: string): Promise<{ run: SikulixRun; descendant: number }> {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svs-test-'));
        const fakeJava = path.join(dir, 'java');
        fs.writeFileSync(fakeJava, `#!/bin/sh\n${script}\n`, { mode: 0o755 });

        let run!: SikulixRun;
        const descendant = await new Promise<number>((resolve) => {
            run = runSikulixScript(
                { ...BASE, javaPath: fakeJava, cwd: dir },
                line => resolve(Number(line))
            );
        });
        void run.exited.finally(() => fs.rmSync(dir, { recursive: true, force: true }));

        return { run, descendant };
    }

    function isAlive(pid: number): boolean {
        try {
            process.kill(pid, 0);
            return true;
        } catch {
            return false;
        }
    }

    test('ends what the launched process started', { timeout: 10000 }, async () => {
        const { run, descendant } = await launch('sleep 60 &\necho $!\nwait');
        run.stop();
        await run.exited;
        assert.equal(isAlive(descendant), false);
    });

    test('still works once the launched process has already exited', { timeout: 10000 }, async () => {
        const { run, descendant } = await launch('sleep 60 &\necho $!');
        await new Promise(resolve => setTimeout(resolve, 300));
        run.stop();
        await run.exited;
        assert.equal(isAlive(descendant), false);
    });

    test('forces anything that ignores the polite signal', { timeout: 10000 }, async () => {
        const { run, descendant } = await launch("trap '' TERM\nsleep 60 &\necho $!\nwait");
        run.stop();
        await run.exited;
        assert.equal(isAlive(descendant), false);
    });

    test('does nothing once the run is over', { timeout: 10000 }, async () => {
        const { run } = await launch('echo 1');
        await run.exited;
        run.stop();
    });
});
