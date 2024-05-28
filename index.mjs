import { Router } from 'express';
import { jsonParser } from '../../src/express-common.js';
import { createRequire } from 'module';
const require  = createRequire(import.meta.url);
const path = require('path');
const sanitize = require('sanitize-filename');
const fs = require('fs');



/**
 *
 * @param {Router} router
 */
export async function init(router) {
	router.get('/', jsonParser, (req, res)=>{
		res.send('nothing to see here');
	});

	router.post('/list', jsonParser, (req, res)=>{
		let requestedPath = req.body.folder ?? '/';
		if (requestedPath[0] != '/') requestedPath = `/${requestedPath}`;
		const parts = requestedPath.split('/');
		parts[0] = process.cwd();
		if (['USER', 'HOME', '~'].includes(parts[1])) {
			parts[1] = req.user.directories.root;
			parts.shift();
		}
		const dirPath = path.join(...parts);
		const items = fs.readdirSync(dirPath).map(item=>{
			const lstat = fs.lstatSync(path.join(dirPath, item));
			const stat = fs.statSync(path.join(dirPath, item));
			return {
				path: item,
				type: lstat.isDirectory() ? 'dir' : 'file',
				modified: lstat.mtimeMs,
				size: stat.size,
			}
		});
		items.sort((a,b)=>b.modified - a.modified);
		return res.send(items);
	});

	router.post('/get', jsonParser, (req, res)=>{
		let requestedPath = req.body.file;
		if (requestedPath[0] != '/') requestedPath = `/${requestedPath}`;
		const parts = requestedPath.split('/');
		parts[0] = process.cwd();if (['USER', 'HOME', '~'].includes(parts[1])) {
			parts[1] = req.user.directories.root;
			parts.shift();
		}
		const filePath = path.join(...parts);
		if (fs.existsSync(filePath) && fs.lstatSync(filePath).isFile()) {
			return res.sendFile(filePath);
		}
	});

	router.post('/get/last-line', jsonParser, (req, res)=>{
		let requestedPath = req.body.file;
		if (requestedPath[0] != '/') requestedPath = `/${requestedPath}`;
		const parts = requestedPath.split('/');
		parts[0] = process.cwd();if (['USER', 'HOME', '~'].includes(parts[1])) {
			parts[1] = req.user.directories.root;
			parts.shift();
		}
		const filePath = path.join(...parts);
		const stat = fs.statSync(filePath);
		if (fs.existsSync(filePath) && fs.lstatSync(filePath).isFile()) {
			return res.send(JSON.parse(fs.readFileSync(filePath, 'utf-8').split('\n').slice(-1)[0]));
		}
	});

	router.post('/put', jsonParser, (req, res)=>{
		let requestedPath = req.body.path;
		if (requestedPath[0] != '/') requestedPath = `/${requestedPath}`;
		const parts = requestedPath.split('/');
		parts[0] = process.cwd();if (['USER', 'HOME', '~'].includes(parts[1])) {
			parts[1] = req.user.directories.root;
			parts.shift();
		}
		const filePath = path.join(...parts);
		const fileDir = path.join(...parts.slice(0, -1));
		let fileName = parts.slice(-1)[0];
		const namePart = fileName.split('.').slice(0, -1).join('.');
		const extPart = fileName.split('.').pop();
		console.log('[FILES/put]', { path:req.body.path, dir:fileDir, name:fileName});
		try {
			fs.mkdirSync(fileDir, { recursive:true });
			if (fs.existsSync(path.join(fileDir, fileName))) {
				let num = 1;
				fileName = `${namePart}_${num}.${extPart}`;
				while (fs.existsSync(path.join(fileDir, fileName))) {
					num++;
					fileName = `${namePart}_${num}.${extPart}`;
					console.log('[FILES/put]', { path:req.body.path, dir:fileDir, name:fileName});
				}
			}
			console.log('[FILES/put]', 'final name', { path:req.body.path, dir:fileDir, name:fileName});
			const data = req.body.file.split(',').slice(1).join(',');
			console.log('[FILES/put]', 'grabbed data -> buffer', { path:req.body.path, dir:fileDir, name:fileName});
			const buffer = Buffer.from(data, 'base64');
			console.log('[FILES/put]', 'WRITING', { path:req.body.path, dir:fileDir, name:fileName});
			fs.writeFileSync(path.join(fileDir, fileName), buffer);
			console.log('[FILES/put]', 'DONE', { path:req.body.path, dir:fileDir, name:fileName});
			return res.send({ name: fileName });
		} catch(ex) {
			console.log('[FILES/put]', 'ERROR', { path:req.body.path, dir:fileDir, name:fileName}, ex);
			return res.sendStatus(500);
		}

	});
}

export async function exit() {}

const module = {
    init,
    exit,
    info: {
        id: 'files',
        name: 'Files',
        description: '...',
    },
};
export default module;
