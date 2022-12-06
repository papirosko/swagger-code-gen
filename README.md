# swagger-code-gen
The utility to generate a client for a services, described with openapi.

Install:
```shell
npm install -D @penkov/swagger-code-gen
```


Usage:
```shell
generate-client --url <URI> output_filename.ts
```

Cli parameters:
* `--url` - the swagger url
* `--enableScats` - generate additional wrappers in [scats](https://www.npmjs.com/package/scats) 
  style for all objects and create a service with methods for each endpoint.
