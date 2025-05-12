import { access, exists, lstat, readdir, readFile, rename, stat, Stats, writeFile } from "node:fs";

/** @type {((path:string|Buffer|URL, options:{encoding:BufferEncoding})=>Promise<string>) & ((path:string|Buffer|URL, options:null)=>Promise<string|Buffer>)} */
export const readFileAsync = async(path, options)=>{
    return new Promise((resolve, reject)=>{
        readFile(path, options, (err, data)=>{
            if (err) reject(err);
            else resolve(data);
        });
    });
};

/**@type {((path:import("node:fs").PathOrFileDescriptor, data:string|NodeJS.ArrayBufferView, options:import("node:fs").WriteFileOptions)=>Promise<void>)} */
export const writeFileAsync = async(path, data, options)=>{
    return new Promise((resolve, reject)=>{
        writeFile(path, data, options, (err)=>{
            if (err) reject(err);
            else resolve();
        });
    });
};

/**@type {((oldPath:import("node:fs").PathLike, newPath:import("node:fs").PathLike)=>Promise<void>)} */
export const renameAsync = async(oldPath, newPath)=>{
    return new Promise((resolve, reject)=>{
        rename(oldPath, newPath, (err)=>{
            if (err) reject(err);
            else resolve();
        });
    });
};


/** @type {((path:string|Buffer|URL, options:{encoding:BufferEncoding})=>Promise<string>) & ((path:string|Buffer|URL)=>Promise<string[]>)} */
export const readDirAsync = async(path)=>{
	return new Promise((resolve, reject)=>{
		readdir(path, (err, data)=>{
			if (err) reject(err);
			else resolve(data);
		});
	});
};


/** @type {((path:string|Buffer|URL, options:{encoding:BufferEncoding})=>Promise<string>) & ((path:string|Buffer|URL)=>Promise<string[]>)} */
export const existsAsync = async(path)=>{
	return new Promise((resolve, reject)=>{
		access(path, (err, data)=>{
			if (err) resolve(false);
			else resolve(true);
		});
	});
};


/**
 *
 * @param {import("node:fs").PathLike} path
 * @returns {Promise<Stats>}
 */
export const lstatAsync = async(path)=>{
    return new Promise((resolve, reject)=>{
        lstat(path, (err, stats)=>{
            if (err) reject(err);
            else resolve(stats);
        });
    });
};


/**
 *
 * @param {import("node:fs").PathLike} path
 * @returns {Promise<Stats>}
 */
export const statAsync = async(path)=>{
    return new Promise((resolve, reject)=>{
        stat(path, (err, stats)=>{
            if (err) reject(err);
            else resolve(stats);
        });
    });
};
