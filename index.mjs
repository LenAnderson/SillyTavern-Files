import { json, Router } from "express";
import { argv } from "process";
import * as fs from "fs";
import path from "path";
import mime from "mime-types";
import * as readline from "readline";

import { existsAsync, lstatAsync, readDirAsync, readFileAsync, renameAsync, statAsync, writeFileAsync } from "./src/fs.mjs";
import { uuidv4 } from "../../src/util.js";
import Jimp from "../../src/jimp.js";
import { error } from "console";
import open from "open";
import { log } from "./src/console.mjs";
import { WatcherManager } from "./src/WatcherManager.mjs";

const NO_SANDBOX_FLAG = '--files--noSandbox';
const CONFIG = {
	noSandbox: false,
};

const sendSandboxError = (res)=>res.status(403).send(sendError(`Launch SillyTavern with ${NO_SANDBOX_FLAG} to access files outside of SillyTavern\'s user data directory.`));
const sendError = (error)=>({
	ok: false,
	error,
});
const send = (data)=>({
	ok: true,
	data,
});

/**
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {string} [explicitPath]
 * @returns {string|null}
 */
const resolvePath = (req, res, explicitPath = undefined)=>{
	let requestedPath = path.parse(explicitPath ?? req.body?.path ?? req.query.path);
	// deny if path has root and plugin is sandboxed
	if (requestedPath.root.length && !CONFIG.noSandbox) {
		sendSandboxError(res);
		return null;
	}

	// use user dir as root if no explicit root
	if (!requestedPath.root.length) {
		if (requestedPath.dir.length == 0 && requestedPath.base == '~') {
			requestedPath.dir = requestedPath.base;
			requestedPath.base = '';
			requestedPath.name = '';
		}
		requestedPath.dir = path.join(
			req.user.directories.root,
			requestedPath.dir.replace(/^(USER|HOME|~)([\\/]|$)/, ''),
		);
	}

	const userPath = path.resolve(req.user.directories.root);
	const finalPath = path.resolve(path.format(requestedPath));

	// if sandboxed, check that path is inside user dir
	if (!CONFIG.noSandbox && !finalPath.startsWith(userPath)) {
		sendSandboxError(res);
		return null;
	}

	return finalPath;
};

/**
 * @param {Router} router
 */
const initEndpoints = (router)=>{
	/**
	 *
	 * @param {string} path
	 * @param {(req:import('express').Request, res:import('express').Response)=>Promise<any>|any} handler
	 */
	const get = (path, handler)=>addRoute('get', path, handler);
	/**
	 * @param {string} path
	 * @param {(req:import('express').Request, res:import('express').Response)=>Promise<any>|any} handler
	 */
	const post = (path, handler)=>addRoute('post', path, handler);
	/**
	 * @param {string} path
	 * @param {(req:import('express').Request, res:import('express').Response)=>Promise<any>|any} handler
	 */
	const getPost = (path, handler)=>addRoute(['get', 'post'], path, handler);
	/**
	 * @param {string} path
	 * @param {(req:import('express').Request, res:import('express').Response)=>Promise<any>|any} handler
	 */
	const head = (path, handler)=>addRoute('head', path, handler);
	/**
	 * @param {string|string[]} method
	 * @param {string} path
	 * @param {(req:import('express').Request, res:import('express').Response)=>Promise<any>|any} handler
	 */
	const addRoute = (method, path, handler)=>{
		/**
		 * @param {import("express").Request} req
		 * @param {import("express").Response} res
		 * @param {import("express").NextFunction} next
		 */
		const mergeBodyAndQuery = (req, res, next)=>{
			req.body = { ...(req.body ?? {}), ...(req.query ?? {})};
			next();
		};
		const handledHandler = async(req, res)=>{
			try {
				await handler(req, res);
			} catch (ex) {
				const e = /**@type {Error} */ (ex);
				res.status(500).send(sendError({
					name: e.name,
					message: e.message,
					cause: e.cause,
					stack: e.stack,
				}));
			}
		};
		for (const m of Array.isArray(method) ? method : [method]) {
			router[m](path, mergeBodyAndQuery, handledHandler);
		}
	};

	/**
	 * Get information about the current plugin version
	 * and configuration.
	 * @returns {{
	 * 	version: string,
	 * 	CONFIG: { [key:string]: string }
	 * }}
	 * @example {}->{"version":"2.0.0", "CONFIG":{"noSandbox":true}}
	 */
	get('/', (req, res)=>{
		res.send({
			version: '2.0.0',
			CONFIG,
		});
	});

	/**
	 * Get a list of files and directories inside a given path.
	 * @param {string} path The path to list contents of.
	 * @param {string[]} [extensions] List of file extensions to limit the results to.
	 * @param {string[]} [types] List of MIME types to limit the results to. Can be prefix (e.g., "image") or full MIME type (e.g., "image/png")
	 * @returns {{
	 * 	path: string,
	 * 	type: 'dir'|'file',
	 * 	fileType: string,
	 * 	fileTypeFull: string,
	 * 	modified: number,
	 * 	size: number,
	 * }[]}
	 * @example {"path":"~/user/images", "extensions":["png"]}->[{
	 * 	"path": "image_1.png",
	 * 	"type": "file",
	 * 	"fileType": "image",
	 * 	"fileTypeFull": "image/png",
	 * 	"modified": 123456789,
	 * 	"size": 1234
	 * }]
	 */
	getPost('/list', async(req, res)=>{
		const dirPath = resolvePath(req, res);
		if (!dirPath) return;

		// filter by file extension
		const extList = req.body.extensions?.map(it=>`${it[0] == '.' ? '' : '.'}${it.toLowerCase()}`);
		// filter by mime type
		const typeList = req.body.types?.map(it=>it.toLowerCase());

		const items = await Promise.all((await Promise.all(
			(await readDirAsync(dirPath))
				.map(async(item)=>{
					const lstat = await lstatAsync(path.join(dirPath, item));
					const mimeType = lstat.isDirectory() ? null : mime.lookup(item) || null;
					return {
						path: item,
						type: lstat.isDirectory() ? 'dir' : 'file',
						fileType: mimeType?.split('/')[0],
						fileTypeFull: mimeType,
						modified: lstat.mtimeMs,
					};
				})
		))
			.filter(item=>{
				if (extList?.length) {
					if (item.type != 'file') return true;
					return extList.includes(path.extname(item.path));
				}
				if (typeList?.length) {
					if (item.type != 'file') return true;
					return typeList.includes(item.fileType?.toLowerCase()) || typeList.includes(item.fileTypeFull?.toLowerCase());
				}
				return true;
			})
			.map(async(item)=>{
				const stat = await statAsync(path.join(dirPath, item.path));
				return {
					...item,
					size: stat.size,
				};
			})
		);
		res.send(send(items));
	});

	/**
	 * Get a file as is.
	 * @param {string} path Path to the file.
	 * @returns {string|ArrayBuffer}
	 * @plainResult
	 * @example {"path":"~/user/settings.json"}->FILE
	 */
	getPost('/get', async(req, res)=>{
		const filePath = resolvePath(req, res);
		if (!filePath) throw new Error('missing path');

		if (await existsAsync(filePath) && (await lstatAsync(filePath)).isFile()) {
			return res.sendFile(filePath);
		}
		return res.sendStatus(404);
	});
	/**
	 * Get the last line of a text file.
	 * @param {string} path Path to the file.
	 * @returns {string}
	 * @example {"path":"~/user/files/someFile.txt"}->"this is the last line"
	 */
	getPost('/get/last-line', async(req, res)=>{
		const filePath = resolvePath(req, res);
		if (!filePath) throw new Error('missing path');

		if (await existsAsync(filePath) && (await lstatAsync(filePath)).isFile()) {
			let num = 0;
			let prevLine;
			let line = '';
			const readStream = fs.createReadStream(filePath);
			const reader = readline.createInterface(readStream);
			try {
				for await (const curLine of reader) {
					[prevLine, line] = [line, curLine];
					num++;
				}
				reader.close();
			} catch (ex) {
				readStream.destroy();
				throw ex;
			} finally {
				if (!readStream.destroyed) {
					readStream.destroy();
				}
			}
			return res.send(send(line.length ? line : prevLine));
		}
		return res.sendStatus(404);
	});
	/**
	 * Get the specified line of a text file.
	 * @param {string} path Path to the file.
	 * @param {number} line The line to retrieve.
	 * @returns {string}
	 * @example {"path":"~/user/files/someFile.txt", "line":42}->"this is the 42nd line"
	 */
	getPost('/get/line', async(req, res)=>{
		const filePath = resolvePath(req, res);
		if (!filePath) throw new Error('missing path');

		if (await existsAsync(filePath) && (await lstatAsync(filePath)).isFile()) {
			let num = 0;
			let target = req.body.line ?? 0;
			let line;
			const readStream = fs.createReadStream(filePath);
			const reader = readline.createInterface(readStream);
			try {
				for await (const curLine of reader) {
					if (num == target) {
						line = curLine;
						reader.close();
						break;
					}
					num++;
				}
			} catch (ex) {
				readStream.destroy();
				throw ex;
			} finally {
				if (!readStream.destroyed) {
					readStream.destroy();
				}
			}
			return res.send(send(line));
		}
		return res.sendStatus(404);
	});

	/**
	 * Write / upload a file.
	 * @param {string} path Path to the file.
	 * @param {boolean} [overwrite] Whether to overwrite an existing file or automatically create a new filename.
	 * @param {string} [text] Text contents of the file.
	 * @param {string} [file] Base64 encoded binary contents of the file.
	 * @returns {{
	 * 	path:string,
	 * 	name:string,
	 * }}
	 */
	getPost('/put', async(req, res)=>{
		let filePath = resolvePath(req, res);
		if (!filePath) throw new Error('missing path');

		const parsed = path.parse(filePath);
		fs.mkdirSync(parsed.dir, { recursive:true });
		if (!req.body.overwrite && await existsAsync(filePath)) {
			let num = 1;
			let fileName = parsed.name
			while (await existsAsync(path.join(parsed.dir, `${fileName}_${num}${parsed.ext}`))) {
				num++;
			}
			parsed.name = `${fileName}_${num}`;
			filePath = path.format(parsed);
		}

		if (req.body.text) {
			await writeFileAsync(filePath, req.body.text, { encoding:'utf-8' });
		} else if (req.body.file) {
			const data = req.body.file.split(',').slice(1).join(',');
			const buffer = Buffer.from(data, 'base64');
			await writeFileAsync(filePath, buffer, {});
		} else {
			throw new Error('missing content');
		}
		return res.send(send({ path: filePath, name: parsed.base }));
	});

	/**
	 * Rename a file.
	 * @param {string} path The old path.
	 * @param {string} newName The new filename.
	 * @returns {boolean}
	 */
	getPost('/rename', async(req, res)=>{
		let filePath = resolvePath(req, res);
		if (!filePath) throw new Error('missing path');

		const parsed = path.parse(filePath);
		const newPath = resolvePath(req, res, path.join(...req.body.path.split(/[/\\]/).slice(0,-1), req.body.newName));
		if (!newPath) throw new Error('missing new path');

		if (!(await existsAsync(filePath) && (await lstatAsync(filePath)).isFile())) {
			throw new Error('not a file');
		}
		if (await existsAsync(newPath)) {
			throw new Error('file already exists');
		}
		await renameAsync(filePath, newPath);
		return res.send(send(true));
	});

	/**
	 * Delete a file.
	 * @param {string} path Path to the file.
	 * @returns {boolean}
	 */
	getPost('/delete', async(req, res)=>{
		let filePath = resolvePath(req, res);
		if (!filePath) throw new Error('missing path');

		if (!(await existsAsync(filePath) && (await lstatAsync(filePath)).isFile())) {
			throw new Error('not a file');
		}
		await fs.unlinkSync(filePath);
		return res.send(send(true));
	});

	/**
	 * Get a thumbnail of the image.
	 * @param {string} path Path to the file.
	 * @param {number} w Width
	 * @param {number} h Height
	 * @param {boolean} [force] Whether to generate a new thumbnail or use a cached one (if available).
	 * @returns {ArrayBuffer}
	 * @plainResult
	 */
	getPost('/thumb', async(req, res)=>{
		const filePath = resolvePath(req, res);
		if (!filePath) throw new Error('missing path');

		if (await existsAsync(filePath) && (await lstatAsync(filePath)).isFile()) {
			try {
				const pluginPath = import.meta.dirname;
				const parsedPath = path.parse(filePath);
				const dbPath = path.join(pluginPath, 'thumbs.json');
				const thumbDir = path.join(pluginPath, 'thumbs');
				if (!fs.existsSync(dbPath)) {
					fs.writeFileSync(dbPath, '{}', { encoding:'utf-8' });
				}
				if (!await existsAsync(thumbDir)) {
					fs.mkdirSync(thumbDir, { recursive:true });
				}

				const thumbs = JSON.parse(fs.readFileSync(dbPath, { encoding:'utf-8' }));
				let id = thumbs[filePath];
				if (!id) {
					id = uuidv4();
					thumbs[filePath] = id;
					fs.writeFileSync(dbPath, JSON.stringify(thumbs), { encoding:'utf-8' });
				}

				const sizes = [100, 200, 300, 500, 800];
				const reqW = sizes.find(it=>it >= Number(req.body.w)) ?? sizes.slice(-1)[0];
				const reqH = sizes.find(it=>it >= Number(req.body.h)) ?? sizes.slice(-1)[0];
				const thumbName = `${id}.${reqW}.${reqH}.png`;
				const thumbPath = path.join(thumbDir, thumbName);

				if (req.body.force || !await existsAsync(thumbPath)) {
					const image = await Jimp.read(filePath);
					const aspect = image.width / image.height;
					const reqAspect = reqW / reqH;
					let w = reqW;
					let h = reqH;
					if (aspect > reqAspect) {
						h = reqW / aspect;
					} else if (aspect < reqAspect) {
						w = reqH * aspect;
					}
					const buffer = await image.cover({ w, h }).getBuffer('image/png');
					await writeFileAsync(thumbPath, buffer, {});
				}

				return res.sendFile(thumbPath);
			} catch (ex) {
				error('/thumb', filePath, ex);
				return res.sendFile(filePath);
			}
		}
		return res.sendStatus(404);
	});

	/**
	 * Count the number of lines in a text file.
	 * @param {string} path Path to the file.
	 * @returns {number}
	 */
	getPost('/count/lines', async(req, res)=>{
		const filePath = resolvePath(req, res);
		if (!filePath) throw new Error('missing path');

		if (await existsAsync(filePath) && (await lstatAsync(filePath)).isFile()) {
			let num = 0;
			let line;
			const readStream = fs.createReadStream(filePath);
			const reader = readline.createInterface(readStream);
			try {
				for await (const curLine of reader) {
					num++;
				}
				reader.close();
			} catch (ex) {
				readStream.destroy();
				throw ex;
			} finally {
				if (!readStream.destroyed) {
					readStream.destroy();
				}
			}
			return res.send(send(num));
		}
		return res.sendStatus(404);
	});


	/**
	 * Open the path in the OS file explorer.
	 * @param {string} path Path to the directory or file.
	 * @returns {boolean}
	 */
	getPost('/reveal', async(req, res)=>{
		const filePath = resolvePath(req, res);
		if (!filePath) throw new Error('missing path');

		if (await existsAsync(filePath)) {
			let dirPath = filePath;
			if ((await lstatAsync(filePath)).isFile()) {
				dirPath = path.dirname(filePath);
			}
			open(dirPath);
			return res.send(send(true));
		}
		throw new Error('Not found.');
	});

	/**
	 * Open the file in the OS default application.
	 * @param {string} path Path to the file.
	 * @returns {boolean}
	 */
	getPost('/open', async(req, res)=>{
		const filePath = resolvePath(req, res);
		if (!filePath) throw new Error('missing path');

		if (await existsAsync(filePath) && (await lstatAsync(filePath)).isFile()) {
			open(filePath);
			return res.send(send(true));
		}
		throw new Error('not a file');
	});

	/**
	 * Check if the file or directory exists.
	 * @param {string} path Path to the file.
	 * @returns {boolean}
	 */
	getPost('/exists', async(req, res)=>{
		const filePath = resolvePath(req, res);
		if (!filePath) throw new Error('missing path');

		if (await existsAsync(filePath)) {
			return res.send(send(true));
		}
		return res.send(send(false));
	});

	/**
	 * Watch a file for changes.
	 * @param {string} path Path to the file.
	 * @param {number} interval How often the target should be polled in milliseconds.
	 * @returns {EventSource}
	 * @plainResult
	 * @keepReturns
	 * @manual
	 */
	get('/watch', async(req, res)=>{
		const filePath = resolvePath(req, res);
		if (!filePath) throw new Error('missing path');

		if (!await existsAsync(filePath)) {
			throw new Error('not a file')
		}
		const userHandle = req.user.profile.handle;
		WatcherManager.instance.start(userHandle, filePath, res, parseInt((req.body.interval ?? 500).toString()));
	});
};
/**
 * @param {Router} router
 */
async function init(router) {
	// check server startup args
	CONFIG.noSandbox = argv.includes(NO_SANDBOX_FLAG);

	// always parse JSON
	router.use(json());
	initEndpoints(router);
}

async function exit() {}

const module = {
    init,
    exit,
    info: {
        id: 'files-v2',
        name: 'Files v2',
        description: '...',
    },
};
export default module;
