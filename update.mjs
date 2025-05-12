import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { inspect } from "node:util";


class Route {
	/**@type {string[]} */ #method;
	/**@type {string[]} */
	get method() { return this.#method; }
	set method(/**@type {string}*/value) {
		this.#method = value.split(/(?=[A-Z])/).map(it=>it.toUpperCase());
		console.log('method:', value.split(/(?=[A-Z])/).map(it=>it.toUpperCase()));
	}
	/**@type {string} */ rawComment;

	/**@type {string} */ path;
	/**@type {string} */ help = '';
	/**@type {Param[]} */ paramList = [];
	/**@type {Returns} */ returns;
	/**@type {boolean} */ isPlainResult = false;
	/**@type {boolean} */ isKeepReturns = false;
	/**@type {boolean} */ isManual = false;

	toJSON() {
		return {
			rawComment: this.rawComment,
			method: this.method,
			path: this.path,
			help: this.help,
			paramList: this.paramList,
			returns: this.returns,
		};
	}
}
class Param {
	/**@type {string} */ type;
	/**@type {boolean} */ isOptional;
	/**@type {string} */ name;
	/**@type {string} */ help;

	/**
	 * @param {string} text
	 */
	constructor(text) {
		const match = /^\{(.+)\}\s+(\[?)(\w+)\]?\s+(.+)$/.exec(text);
		if (match) {
			this.type = match[1];
			this.isOptional = !!match[2];
			this.name = match[3];
			this.help = match[4];
		}
	}
}
class Returns {
	/**@type {string} */ type;
	/**@type {string} */ help;

	/**
	 * @param {string} text
	 */
	constructor(text) {
		const match = /^\{(.+)\}(?:\s+(.+))?$/s.exec(text);
		if (match) {
			this.type = match[1];
			this.help = match[4];
		}
	}
}


let routeMatcher = /^(get|post|getPost|head)\('([^']+)',.+$/;


/**@type {Route[]} */
const routeList = [];
const lines = readFileSync(path.join(import.meta.dirname, 'index.mjs'), { encoding:'utf-8' }).split('\n');

/**@type {Route} */
let currentRoute = new Route();
let currentParam = '';
let inComment = false;
let justClosed = false;
let afterHelp = false;
let inParam = false;
let inReturns = false;
let rawComment = '';
for (let line of lines) {
	line = line.trim();
	if (!inComment) {
		if (justClosed) {
			if (routeMatcher.test(line)) {
				const match = routeMatcher.exec(line);
				if (!match) continue;
				currentRoute.method = match[1];
				currentRoute.path = match[2];
				routeList.push(currentRoute);
				if (inParam) {
					currentRoute.paramList.push(new Param(currentParam));
					inParam = false;
				} else if (inReturns) {
					currentRoute.returns = new Returns(currentParam);
					inReturns = false;
				}
				inComment = false;
				justClosed = false;
				afterHelp = false;
				inParam = false;
				inReturns = false;
				rawComment = '';
				currentRoute = new Route();
				// break;
			}
		} else if (line == '/**') {
			inComment = true;
			justClosed = false;
			afterHelp = false;
			inParam = false;
			inReturns = false;
			rawComment = line;
			currentRoute = new Route();
		}
	} else {
		rawComment += `\n${line}`;
		if (line == '*/') {
			inComment = false;
			justClosed = true;
			currentRoute.rawComment = rawComment;
			continue;
		} else if (line.at(0) == '*') {
			line = line.slice(2);
			console.log(line);
			if (line.at(0) == '@') {
				if (inParam) {
					currentRoute.paramList.push(new Param(currentParam));
					inParam = false;
				} else if (inReturns) {
					currentRoute.returns = new Returns(currentParam);
					inReturns = false;
				}
				if (line.startsWith('@param ')) {
					currentParam = line.replace(/^@param\s+/, '');
					inParam = true;
				} else if (line.startsWith('@returns ')) {
					currentParam = line.replace(/^@returns\s+/, '');
					inReturns = true;
				} else if (line.startsWith('@plainResult')) {
					currentRoute.isPlainResult = true;
				} else if (line.startsWith('@keepReturns')) {
					currentRoute.isKeepReturns = true;
				} else if (line.startsWith('@manual')) {
					currentRoute.isManual = true;
				}
				afterHelp = true;
			} else {
				if (afterHelp) {
					if (inParam || inReturns) {
						currentParam += `\n${line}`;
					}
				} else {
					currentRoute.help += currentRoute.help.length == 0 ? '' : '\n';
					currentRoute.help += line;
				}
			}
		}
	}
	justClosed = false;
}

console.log(JSON.stringify(routeList, null, 4));

const pathToApi = (p)=>p.slice(1).split(/[/-]/).map((it,idx)=>idx == 0 ? it : `${it[0].toUpperCase()}${it.slice(1)}`).join('');;
const pathToSlash = (p)=>p.slice(1).replace('/', '-') || 'plugin';

const indent = (text, level, offset = 0, prefix = '')=>{
	return text
		.split('\n')
		.map((it,idx)=>idx < offset ? `${it}` : `${' '.repeat(4 * level)}${prefix}${it}`)
		.join('\n')
	;
};
let api = `
import { getRequestHeaders } from '../../../../script.js';

import { API } from './index.js';


const { promise, resolve } = Promise.withResolvers();

export class FilesPluginApi {
	static /**@type {Promise<typeof FilesPluginApi>}*/ ready = promise;
	static /**@type {()=>typeof FilesPluginApi}*/ readyResolve = resolve;
`;
for (const route of routeList) {
	let name = pathToApi(route.path);
	let params = route.paramList.filter(it=>!it.isOptional).map(it=>it.name).join(', ');
	const hasOptions = route.paramList.some(it=>it.isOptional);
	let body = [
		'{',
		indent(route.paramList.map(it=>it.isOptional ? `${it.name}: options.${it.name}` : it.name).join(',\n'), 1) + ',',
		'}'
	].join('\n');
	api += `
	/**
	 * ${route.help.split('\n').join('\n     * ')}`;
	for (const param of route.paramList.filter(it=>!it.isOptional)) {
		api += `
	 * @param {${param.type}} ${param.name} ${param.help}`;
	}
	if (hasOptions) {
		api += `
	 * @param {object} [options]`;
	}
	for (const param of route.paramList.filter(it=>it.isOptional)) {
		api += `
	 * @param {${param.type}} [options.${param.name}] ${param.help}`;
	}
	if (route.isPlainResult) {
		if (route.isKeepReturns) {
			api += `
	 * @returns {Promise<${indent(route.returns.type, 1, 1, ' *')}>} ${route.returns.help ?? ''}`
		} else {
			api += `
	 * @returns {Promise<Response>} Fetch response`;
		}
	} else {
		api += `
	 * @returns {Promise<${indent(route.returns.type, 1, 1, ' *')}>} ${route.returns.help ?? ''}`;
	}
	api += `
	 */`;
	if (route.isManual) {
		api += `
	static async ${name || 'plugin'}(...args) {
		await FilesPluginApi.ready;
		return FilesPluginApi.${name || 'plugin'}(...args);
	}
	`;
		continue;
	} else {
		api += `
	static async ${name || 'plugin'}(${params}${hasOptions ? ', options = {}' : ''}) {`;
	}
	api += `
		const response = await fetch(\`\${API}${route.path}\`, {
			method: '${route.method.at(-1)}',`;
	if (route.method.at(-1) == 'POST') {
		api += `
			headers: getRequestHeaders(),
			body: JSON.stringify(${indent(body, 3, 1)}),`;
	}
	api += `
		});
		if (!response.ok) {
			throw new Error(\`\${response.status}: \${response.statusText}\`);
		}`;
		if (route.isPlainResult) {
			api += `
		return response;`;
		} else {
			api += `
		const result = await response.json();
		if (!result.ok) {
			throw new Error(result.error);
		}
		return result.data;`;
		}
		api += `
	}
`;
}
api += `
}
`;
api = api.replace(/\t/g, ' '.repeat(4));




let slash = `
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { SlashCommandArgument } from '../../../slash-commands/SlashCommandArgument.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';

/**@typedef {import('../../../slash-commands/SlashCommand.js').NamedArguments} NamedArguments */

import { FilesPluginApi } from './api.js';



export const API = '/api/plugins/files-v2';



export const registerSlash = ()=>{
`;
for (const route of routeList) {
	if (route.isManual) continue;
	slash += `
	SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'files-${pathToSlash(route.path)}',
		/**
		 * @param {NamedArguments&{`;
	for (const param of route.paramList) {
		slash += `
	     *	${param.name}:string`;
	}
	slash +=`
		 * }} args
		 * @param {string} value
		 */
		async callback(args, value) {
			const result = await FilesPluginApi.${pathToApi(route.path) || 'plugin'}(${route.paramList.filter(it=>!it.isOptional).map(it=>`args.${it.name}`).join(', ')});
			return JSON.stringify(result);
		},
		namedArgumentList: [],
		unnamedArgumentList: [],
		helpString: ${JSON.stringify(route.help)},
		returns: ${JSON.stringify(route.returns.help ?? '')},
	}));
`;
}
slash += `
};
`;
slash = slash.replace(/\t/g, ' '.repeat(4));



let md = `# SillyTavern - Files Plugin v2

Adds endpoints to access local files.

## Configuration

Launch SillyTavern with the \`--files--noSandbox\` to access directories
outside of the current user's data directory.

\`\`\`bash
node server.js --files--noSandbox
\`\`\`


## Endpoints
`;
for (const route of routeList) {
	md += `
### \`/api/plugins/files-v2${route.path}\` [${route.method.join(', ')}]

${route.help}

**Arguments:**
`;
	if (route.paramList.length == 0) {
		md += `
*(no arguments)*`;
	}
	for (const param of route.paramList) {
		md += `
- ${param.isOptional ? '*(optional)* ' : ''}\`${param.name}\`: \`{${param.type}}\` - ${param.help}`;
	}
	md += `

**Returns:**
\`\`\`
`;
	if (route.isPlainResult) {
		md += route.returns.type;
	} else {
		md += `
{
	ok: boolean,
	error: string,
	data: ${indent(route.returns.type, 1, 1)},
}`;
	}
	md += `
\`\`\`
`;
}
md += `
`;


writeFileSync(path.join('public', 'scripts', 'extensions', 'third-party', 'SillyTavern-FilesPluginApi', 'api.js'), api, { encoding:"utf-8" });
writeFileSync(path.join('public', 'scripts', 'extensions', 'third-party', 'SillyTavern-FilesPluginApi', 'slash.js'), slash, { encoding:"utf-8" });
writeFileSync(path.join(import.meta.dirname, 'README.md'), md, { encoding:"utf-8" });
