import * as fs from 'fs';
import * as path from 'path';
import {PackageResponse} from "./package.response";
import * as winston from "winston";
import {VersionResponse} from "./version.response";
import {Readable} from "node:stream";
import {ReadableStream} from "node:stream/web";
import {finished} from "node:stream/promises";
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import * as tar from 'tar';
import {FolderStat} from "./folder-stat";
import * as semver from 'semver';

export class NpmClient {

    private readonly cacheDir: string = path.join('.gpm', 'cache');

    constructor(private readonly registryUrl: string,
                private readonly workingDir: string = process.cwd(),
                private cacheable: boolean = true) {
        if (this.cacheable) {
            if (fs.existsSync(this.cacheDir)) {
                fs.rmSync(path.join(this.workingDir, this.cacheDir), {recursive: true, force: true});
            }
            fs.mkdirSync(path.join(this.workingDir, this.cacheDir), {recursive: true});
        }
    }

    public async getPackage(packageName: string): Promise<PackageResponse> {
        let packageResponse: PackageResponse = undefined;
        if (this.cacheable) {
            winston.debug(`Fetching package "${packageName}" from cache...`);
            packageResponse = this.readPackageInfoCache(packageName);
            winston.info(`Package "${packageName}" fetched from cache`);
        }
        if (!packageResponse) {
            winston.debug(`Downloading package "${packageName}"...`);
            packageResponse = await this.downloadPackageInfo(packageName);
            winston.info(`Package "${packageName}" downloaded from registry "${this.registryUrl}"`);
            if (this.cacheable) {
                winston.debug(`Writing package "${packageName}" to cache...`);
                this.writePackageInfoCache(packageName, packageResponse);
                winston.info(`Package "${packageName}" written to cache`);
            }
        }
        return packageResponse;
    }

    public async redownloadModule(version: VersionResponse, destinationDir: string): Promise<void> {
        winston.debug(`Deleting module: ${version.name}...`);
        fs.rmSync(destinationDir, {recursive: true, force: true});
        winston.debug(`Module: ${version.name} deleted, downloading new version...`);
        await this.downloadModule(version, destinationDir);
        winston.info(`Module: ${version.name}:${version.version} downloaded`);
    }

    public async downloadModule(version: VersionResponse, destinationDir: string): Promise<void> {
        const fileUrl: string = version.dist.tarball;
        const fileName: string = path.basename(fileUrl);
        const destinationFilePath: string = path.join(destinationDir, fileName);
        if (!fs.existsSync(destinationDir)) {
            fs.mkdirSync(destinationDir, {recursive: true});
        }

        if (fs.existsSync(destinationFilePath)) {
            fs.rmSync(destinationFilePath);
        }

        const res: Response = await fetch(fileUrl);
        const fileStream: fs.WriteStream = fs.createWriteStream(destinationFilePath, {flags: 'wx'});
        await finished(Readable.fromWeb(<ReadableStream<any>>res.body).pipe(fileStream));
        if (! (await this.isFileValid(destinationFilePath, version.dist.shasum))) {
            winston.error(`Downloaded file "${fileName}" has incorrect hash`);
            fs.rmSync(destinationFilePath);
            throw new Error(`Downloaded file "${fileName}" has incorrect hash`);
        }

        await this.unpackModule(destinationFilePath, destinationDir);
        fs.rmSync(destinationFilePath)
    }

    public getClosestVersion(packageResponse: PackageResponse, requiredModuleVersion: string): VersionResponse {
        const versionRange: string = this.getSanitizedVersion(requiredModuleVersion);
        const closestVersion: string = semver.maxSatisfying(Object.keys(packageResponse.versions), versionRange);
        return packageResponse.versions[closestVersion];
    }

    public isVersionSatisfies(packageVersion: string, requiredModuleVersion: string): boolean {
        const versionRange: string = this.getSanitizedVersion(requiredModuleVersion);
        return semver.satisfies(packageVersion, requiredModuleVersion);
    }

    public extractPackageNameFromVersion(version: string): string {
        const versionRangeArray: Array<string> = version.split('@');
        const nameParts: Array<string> = versionRangeArray[0].split(':');
        return nameParts.length > 1 ? nameParts[1] : nameParts[0];
    }

    public extractVersionFromVersion(version: string): string {
        const versionRangeArray: Array<string> = version.split('@');
        return versionRangeArray.length > 1 ? versionRangeArray[1] : versionRangeArray[0];
    }

    public getSanitizedVersion(version: string): string {
        const versionRangeArray: Array<string> = version.split('@');
        return versionRangeArray.length > 1 ? versionRangeArray[1] : versionRangeArray[0];
    }

    public isVersionContainPackageName(version: string): boolean {
        return version.includes('@');
    }

    public isModuleValid(version: VersionResponse, destinationDir: string): boolean {
        const folderStat = this.getFolderStat(destinationDir);
        return folderStat.fileCount === version.dist.fileCount && folderStat.totalSize === version.dist.unpackedSize;
    }

    public symlinkBinFiles(version: VersionResponse, moduleDirPath: string, binDirPath: string): void {
        if (version.bin) {
            if (!fs.existsSync(binDirPath)) {
               fs.mkdirSync(binDirPath, {recursive: true});
            }
            if (typeof version.bin === 'string') {
                const srcModuleBinFilePath: string = path.normalize(path.join(moduleDirPath, version.bin));
                const destModuleBinFilePath: string = path.join(binDirPath, version.name);
                const relativeBinPath = path.relative(binDirPath, srcModuleBinFilePath);
                fs.symlinkSync(relativeBinPath, destModuleBinFilePath);
            } else {
                for (let binFile of Object.keys(version.bin)) {
                    const srcModuleBinFilePath: string = path.normalize(path.join(moduleDirPath, version.bin[binFile]));
                    const destModuleBinFilePath: string = path.join(binDirPath, binFile);
                    const relativeBinPath = path.relative(binDirPath, srcModuleBinFilePath);
                    fs.symlinkSync(relativeBinPath, destModuleBinFilePath);
                }
            }
        }
    }

    private async unpackModule(srcFile: string, destDir: string): Promise<void> {
        return new Promise((resolve, reject) => {
            fs.createReadStream(srcFile)
                .on('error', reject)
                .on('close', resolve)
                .pipe(zlib.createUnzip())
                .pipe(tar.extract({
                        cwd: destDir,
                        strip: 1,
                    })
                );
        });
    }

    private getFolderStat(dir: string): FolderStat {
        let folderSize: FolderStat = new FolderStat();
        fs.readdirSync(dir).forEach(file => {
            const filePath: string = path.join(dir, file);
            const fileStat = fs.statSync(filePath);
            folderSize.addFileStat(fileStat);
            if (fileStat.isDirectory()) {
                folderSize.addFolderStat(this.getFolderStat(filePath));
            }
        });
        return folderSize;
    }

    private async isFileValid(path: string, expectedShaSum: string): Promise<boolean> {
        const fileHash: string = await this.getFileHash(path);
        return fileHash === expectedShaSum;
    }

    private async getFileHash(path: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha1');
            const rs = fs.createReadStream(path);
            rs.on('error', reject);
            rs.on('data', chunk => hash.update(chunk));
            rs.on('end', () => resolve(hash.digest('hex')));
        });
    }

    private async downloadPackageInfo(packageName: string): Promise<PackageResponse> {
        const packageUrl: string = `${this.registryUrl}/${packageName}`;
        const response = await fetch(packageUrl);
        if (!response.ok) {
            winston.error(`Failed to download package: ${response.status} ${response.statusText}`);
            throw new Error(`Failed to download package: ${response.statusText}`);
        }
        return await response.json();
    }

    private readPackageInfoCache(packageName: string): PackageResponse {
        const cacheFilePath: string = path.join(this.workingDir, this.cacheDir, `${packageName}.json`);
        let packageResponse: PackageResponse = undefined;
        if (fs.existsSync(cacheFilePath)) {
            packageResponse = JSON.parse(fs.readFileSync(cacheFilePath, { encoding: 'utf-8' }));
        }
        return packageResponse;
    }

    private writePackageInfoCache(packageName: string, packageResponse: PackageResponse): void {
        const cacheFilePath: string = path.join(this.workingDir, this.cacheDir, `${packageName}.json`);
        fs.mkdirSync(path.dirname(cacheFilePath), {recursive: true});
        fs.writeFileSync(cacheFilePath, JSON.stringify(packageResponse, null, 2));
    }
}
