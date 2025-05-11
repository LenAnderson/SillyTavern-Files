import { json, Router } from "express";
import { argv } from "process";
import * as fs from "fs";
import path from "path";
import mime from "mime-types";
import * as readline from "readline";

import { existsAsync, lstatAsync, readDirAsync, readFileAsync, statAsync, writeFileAsync } from "./src/fs.mjs";

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
 * @returns {string|null}
 */
const resolvePath = (req, res)=>{
	let requestedPath = path.parse(req.body?.path ?? req.query.path);
	// deny if path has root and plugin is sandboxed
	if (requestedPath.root.length && !CONFIG.noSandbox) {
		sendSandboxError(res);
		return null;
	}

	// use user dir as root if no explicit root
	if (!requestedPath.root.length) {
		requestedPath.dir = path.join(
			req.user.directories.root,
			requestedPath.dir.replace(/^(USER|HOME|~)[\\/]/, ''),
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
		const extList = req.body.extensions?.map(it=>it.toLowerCase());
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
	 * Count the number of lines in a text file.
	 * @param {string} path Path to the file.
	 * @returns {number}
	 */
	getPost('/count/lines', async(req, res)=>{
		const filePath = resolvePath(req, res);
		if (!filePath) throw new Error('missing path');

		if (await existsAsync(filePath) && (await fs.lstatSync(filePath)).isFile()) {
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
