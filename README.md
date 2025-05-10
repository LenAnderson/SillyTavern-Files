# SillyTavern - Files Plugin v2

Adds endpoints to access local files.

## Configuration

Launch SillyTavern with the `--files--noSandbox` to access directories
outside of the current user's data directory.

```bash
node server.js --files--noSandbox
```


## Endpoints

### `/api/plugins/files-v2/` [GET]

Get information about the current plugin version
and configuration.

**Arguments:**

*(no arguments)*

**Returns:**
```

{
	ok: boolean,
	error: string,
	data: {
    	version: string,
    	CONFIG: { [key:string]: string }
    },
}
```

### `/api/plugins/files-v2/list` [GET, POST]

Get a list of files and directories inside a given path.

**Arguments:**

- `path`: `{string}` - The path to list contents of.
- *(optional)* `extensions`: `{string[]}` - List of file extensions to limit the results to.
- *(optional)* `types`: `{string[]}` - List of MIME types to limit the results to. Can be prefix (e.g., "image") or full MIME type (e.g., "image/png")

**Returns:**
```

{
	ok: boolean,
	error: string,
	data: {
    	path: string,
    	type: 'dir'|'file',
    	fileType: string,
    	fileTypeFull: string,
    	modified: number,
    	size: number,
    }[],
}
```

### `/api/plugins/files-v2/get` [GET, POST]

Get a file as is.

**Arguments:**

- `path`: `{string}` - Path to the file.

**Returns:**
```
string|ArrayBuffer
```

### `/api/plugins/files-v2/get/last-line` [GET, POST]

Get the last line of a text file.

**Arguments:**

- `path`: `{string}` - Path to the file.

**Returns:**
```

{
	ok: boolean,
	error: string,
	data: string,
}
```

### `/api/plugins/files-v2/get/line` [GET, POST]

Get the specified line of a text file.

**Arguments:**

- `path`: `{string}` - Path to the file.
- `line`: `{number}` - The line to retrieve.

**Returns:**
```

{
	ok: boolean,
	error: string,
	data: string,
}
```

### `/api/plugins/files-v2/put` [GET, POST]

Write / upload a file.

**Arguments:**

- `path`: `{string}` - Path to the file.
- *(optional)* `overwrite`: `{boolean}` - Whether to overwrite an existing file or automatically create a new filename.
- *(optional)* `text`: `{string}` - Text contents of the file.
- *(optional)* `file`: `{string}` - Base64 encoded binary contents of the file.

**Returns:**
```

{
	ok: boolean,
	error: string,
	data: {
    	path:string,
    	name:string,
    },
}
```

### `/api/plugins/files-v2/count/lines` [GET, POST]

Count the number of lines in a text file.

**Arguments:**

- `path`: `{string}` - Path to the file.

**Returns:**
```

{
	ok: boolean,
	error: string,
	data: number,
}
```

