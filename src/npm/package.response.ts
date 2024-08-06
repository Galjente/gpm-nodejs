import {KeyVersionResponseType} from './version.response';
import {KeyValueType} from '../types';

export interface PackageAuthorResponse {
    name: string;
    email: string;
    url: string;
}

export interface PackageRepositoryResponse {
    type: string;
    url: string;
}

export interface PackageResponse {
    _id: string; // the package name
    _rev: string; // latest revision id
    name: string; // the package name
    description: string; // description from the package.json
    "dist-tags": KeyValueType; // an object with at least one key, latest, representing dist-tags
    versions: KeyVersionResponseType; // a List of all Version objects for the Package
    time: KeyValueType; // an object containing a created and modified time stamp
    author: PackageAuthorResponse; //object with name, email, and or url of author as listed in package.json
    repository: PackageRepositoryResponse; // object with type and url of package repository as listed in package.json
    readme: string; // full text of the latest version's README
}
