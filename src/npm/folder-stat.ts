import * as fs from 'fs';

export class FolderStat {
    fileCount: number = 0;
    totalSize: number = 0;

    public addFolderStat(folderSize: FolderStat) {
        this.fileCount += folderSize.fileCount;
        this.totalSize += folderSize.totalSize;
    }

    public addFileStat(stat: fs.Stats) {
        if (stat.isFile()) {
            this.fileCount += 1;
            this.totalSize += stat.size;
        }
    }
}