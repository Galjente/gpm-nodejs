import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as winston from "winston";
import * as path from 'path';
import * as fs from 'fs';
import * as semver from 'semver';
import {KeyValueType} from './types';
import {NpmClient} from "./npm";
import {PackageResponse} from "./npm/package.response";
import {VersionResponse} from "./npm/version.response";

interface Package {
    name: string;
    version: string;
    dependencies: KeyValueType;
    devDependencies: KeyValueType;

}

interface PackageDependency {
    name: string;
    version: string;
}

const NPM_REGISTRY: string = 'https://registry.npmjs.org';
const PACKAGE_FILE_NAME: string = 'package.json';
const NODE_MODULES_DIR_NAME: string = 'node_modules';
const WORKING_DIRECTORY: string = process.cwd();
const PACKAGE_JSON_PATH: string = path.join(WORKING_DIRECTORY, PACKAGE_FILE_NAME);
const NODE_MODULES_PATH: string = path.join(WORKING_DIRECTORY, NODE_MODULES_DIR_NAME);
const NODE_MODULES_BIN_PATH: string = path.join(NODE_MODULES_PATH, '.bin');

const npmClient: NpmClient = new NpmClient(NPM_REGISTRY);

const readPackageJson = (packageJsonPath: string): Package => {
    return JSON.parse(fs.readFileSync(packageJsonPath, { encoding: 'utf-8' }));
}

const dependenciesObjectToMap = (dependencies: KeyValueType): Map<string, string> => {
    const dependenciesMap: Map<string, string> = new Map();
    Object.keys(dependencies).forEach(key => dependenciesMap.set(key, dependencies[key]));
    return dependenciesMap;

}

const getPackageDependencies = (packageJsonPath: string, prod: boolean = false): KeyValueType => {
    const packageJsonObject = readPackageJson(packageJsonPath);
    let dependencies =  packageJsonObject?.dependencies || {};

    if (!prod) {
        dependencies = {...dependencies, ...(packageJsonObject?.devDependencies || {})};
    }

    return dependencies;
}

const installDependencies = async (processedDependencies: KeyValueType, requiredDependencies: KeyValueType): Promise<KeyValueType> => {
    winston.debug(`Installing dependencies...`);
    let requiredModuleDependencies: KeyValueType = {};
    const dependencies: Array<string> = Object.keys(requiredDependencies);

    winston.debug(`Checking for "${NODE_MODULES_PATH}" directory in directory: ${WORKING_DIRECTORY}`);
    if (!fs.existsSync(NODE_MODULES_PATH)) {
        winston.debug(`"${NODE_MODULES_PATH}" directory not found, creating...`);
        fs.mkdirSync(NODE_MODULES_PATH, {recursive: true});
        winston.info(`"${NODE_MODULES_PATH}" directory created in directory: ${WORKING_DIRECTORY}`);
    }

    for (let key of dependencies) {
        if (processedDependencies[key]) {
            winston.debug(`Dependency "${key}" already processed, skipping...`);
            continue;
        }

        const requiredModuleVersion: string = npmClient.extractVersionFromVersion(requiredDependencies[key]);
        const modulePackageDirPath: string = path.join(NODE_MODULES_PATH, key);
        const modulePackageJsonPath: string = path.join(modulePackageDirPath, PACKAGE_FILE_NAME);
        const packageName: string = npmClient.isVersionContainPackageName(requiredDependencies[key]) ? npmClient.extractPackageNameFromVersion(requiredDependencies[key]) : key;
        const packageResponse: PackageResponse = await npmClient.getPackage(packageName);
        if (fs.existsSync(modulePackageJsonPath)) {
            winston.debug(`Dependency "${key}" already installed, checking version...`);
            const modulePackageJsonObject: Package = readPackageJson(modulePackageJsonPath);
            const moduleCurrentVersion: VersionResponse = packageResponse.versions[modulePackageJsonObject.version];

            if (semver.satisfies(modulePackageJsonObject.version, requiredModuleVersion)) {
                winston.debug(`Dependency "${key}" already installed with correct version: ${requiredModuleVersion}, checking validity...`);
                if (npmClient.isModuleValid(moduleCurrentVersion, modulePackageDirPath)) {
                    winston.debug(`Dependency "${key}" is valid`);
                } else {
                    winston.warn(`Dependency "${key}" is invalid, reinstalling...`);
                    await npmClient.redownloadModule(moduleCurrentVersion, modulePackageDirPath);
                }
                npmClient.symlinkBinFiles(moduleCurrentVersion, modulePackageDirPath, NODE_MODULES_BIN_PATH);
            } else {
                const moduleNewVersion: string = semver.maxSatisfying(Object.keys(packageResponse.versions), requiredModuleVersion);
                winston.debug(`Updating dependency "${key}:${modulePackageJsonObject.version}" to version: ${moduleNewVersion}...`);
                await npmClient.redownloadModule(packageResponse.versions[moduleNewVersion], modulePackageDirPath);
                npmClient.symlinkBinFiles(packageResponse.versions[moduleNewVersion], modulePackageDirPath, NODE_MODULES_BIN_PATH);
                winston.info(`Dependency "${key}" updated to version: ${moduleNewVersion}`);
            }

            requiredModuleDependencies = {...requiredModuleDependencies, ...modulePackageJsonObject?.dependencies};
        } else {
            winston.debug(`Dependency "${key}" not installed, installing...`);
            const versionToDownload: string = semver.maxSatisfying(Object.keys(packageResponse.versions), requiredModuleVersion);
            const moduleVersionToDownload = packageResponse.versions[versionToDownload];
            await npmClient.downloadModule(moduleVersionToDownload, modulePackageDirPath);
            npmClient.symlinkBinFiles(moduleVersionToDownload, modulePackageDirPath, NODE_MODULES_BIN_PATH);

            requiredModuleDependencies = {...requiredModuleDependencies, ...(moduleVersionToDownload?.dependencies || {})};
        }

        processedDependencies[key] = requiredModuleVersion;
    }
    winston.info(`Dependencies installed, required module dependencies: ${Object.keys(requiredModuleDependencies).join(', ')}`);
    return requiredModuleDependencies;
}

const initializeProject = async(): Promise<void> => {
    winston.info(`Initializing a new project in directory: ${WORKING_DIRECTORY}`);

    winston.debug(`Checking for "${PACKAGE_FILE_NAME}" file in directory: ${PACKAGE_JSON_PATH}`);
    if (fs.existsSync(PACKAGE_JSON_PATH)) {
        winston.debug(`Project already initialized in directory: ${WORKING_DIRECTORY}`);
    } else {
        const workingDirName: string = path.basename(WORKING_DIRECTORY);
        const basePackage = {
            name: workingDirName,
            description: '',
            version: '0.0.0',
            dependencies: {},
            devDependencies: {}
        };
        winston.debug(`Creating "${PACKAGE_FILE_NAME}" file in directory: ${PACKAGE_JSON_PATH}`);
        fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(basePackage, undefined, 2), { encoding: 'utf-8' });
        winston.info(`"${PACKAGE_FILE_NAME}" file created in directory: ${PACKAGE_JSON_PATH}`);
    }

    winston.debug(`Checking for "${NODE_MODULES_DIR_NAME}" file in directory: ${PACKAGE_JSON_PATH}`);
    if (fs.existsSync(NODE_MODULES_PATH)) {
        winston.debug(`"${NODE_MODULES_DIR_NAME}" directory already exists in directory: ${WORKING_DIRECTORY}`);
    } else {
        winston.debug(`Creating "${NODE_MODULES_DIR_NAME}" directory in directory: ${PACKAGE_JSON_PATH}`);
        fs.mkdirSync(NODE_MODULES_PATH, {recursive: true});
        winston.info(`"${NODE_MODULES_DIR_NAME}" directory created in directory: ${PACKAGE_JSON_PATH}`);
    }
};

const installPackage = async (args): Promise<void> => {
    const workingDirectory: string = process.cwd();
    const packageJsonPath: string = path.join(workingDirectory, PACKAGE_FILE_NAME);

    const processedDependencies: KeyValueType = {};
    const requiredDependencies: KeyValueType = getPackageDependencies(packageJsonPath, args.prod);
    let requiredModuleDependencies: KeyValueType = await installDependencies(processedDependencies, requiredDependencies);
    do {
        requiredModuleDependencies = await installDependencies(processedDependencies, requiredModuleDependencies);
    } while (Object.keys(requiredModuleDependencies).length > 0);
}

// ----------------------------------------------------------------------------------------
winston.configure({
    level: 'debug',
    exitOnError: false,
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.timestamp(),
                winston.format.simple()
            )
        })
    ]
});
winston.info('Starting gpm the CLI');
yargs(hideBin(process.argv))
    .usage('Usage: $0 <command> [options]')
    .command('init', 'Initialize a new project', initializeProject)
    .command('install', 'Install a package', (value) => {
        return value.option('prod', {default: false, type: 'boolean', description: 'Install package as production dependency'})
    }, installPackage)
    .demandCommand()
    .help()
    .showHelpOnFail(true, 'whoops, something went wrong! run with help')
    .parse();
winston.debug('Finished gpm the CLI');