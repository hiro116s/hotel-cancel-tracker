import { PuppeteerLaunchOptions } from 'puppeteer';
import yargs from 'yargs';

export type CommandLineArgs = {
    debug: boolean,
    noSandbox: boolean
}

const argv = yargs(process.argv.slice(2)).options({
    debug: { type: "boolean", default: false },
    noSandbox: { type: "boolean", default: false }
}).parseSync();

function createPuppeteerConfig(argv: CommandLineArgs): PuppeteerLaunchOptions {
    let config = {};
    if (argv.debug) {
        config = {
            ...config,
            headless: false,
            slowMo: 250
        };
    }
    if (argv.noSandbox) {
        config = {
            ...config,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ]
        };
    }
    return config;
}

export const puppeteerConfig = createPuppeteerConfig(argv);