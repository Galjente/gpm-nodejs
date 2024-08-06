import {KeyValueType} from '../types';

export interface VersionRepositoryResponse {
    type: string; // repository type
    url: string; // repository url
}

export interface VersionAuthorResponse {
    name: string; // author name
    email: string; // author email
    url: string; // author url

}

export interface VersionLicenseResponse {
    type: string; // license type
    url: string; // license url
}

export interface VersionDistSignatureResponse {
    sig: string; // signature
    keyid: string; // keyid
}

export interface VersionDistResponse {
    shasum: string; // shasum
    tarball: string; // tarball url
    integrity: string; // integrity
    signatures: Array<VersionDistSignatureResponse>; // array of objects with sig and keyid
    fileCount: number; // number of files in the tarball
    unpackedSize: number; // size of the tarball when unpacked
}

export interface VersionMaintainerResponse {
    name: string; // author name
    email: string; // author email
}

export interface VersionResponse {
    name: string; // package name,
    version: string; // version number
    homepage?: string; // homepage listed in the package.json
    repository?: VersionRepositoryResponse; // object with type and url of package repository as listed in package.json
    dependencies: KeyValueType; // object with dependencies and versions as listed in package.json
    devDependencies: KeyValueType; // object with devDependencies and versions as listed in package.json
    scripts: KeyValueType; // object with scripts as listed in package.json
    author: VersionAuthorResponse; // object with name, email, and or url of author as listed in package.json
    license: Array<VersionLicenseResponse>; // as listed in package.json
    readme: string // full text of README file as pointed to in package.json
    readmeFilename: string; // name of README file
    _id: string; //<name>@<version>
    description: string; // description as listed in package.json
    dist: VersionDistResponse; // and object containing a shasum and tarball url, usually in the form of https://registry.npmjs.org/<name>/-/<name>-<version>.tgz
    _npmVersion: string; // version of npm the package@version was published with
    _npmUser: string; // an object containing the name and email of the npm user who published the package@version
    maintainers: VersionMaintainerResponse; // and array of objects containing author objects as listed in package.json
    bin: string | KeyValueType; // object with bin commands as listed in package.json
}

export type KeyVersionResponseType = {[key: string]: VersionResponse};
