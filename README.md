# gpm-nodejs homework for Continue
The node.js gpm app contains two functions:
* Initialize node.js app
* Install dependencies

## Requirements
* Node 20
* Npm
* Git

## Steps to build app

Step 1: Install dependencies
```bash
npm install
```

Step 2: Build typescript
> **Note**: Build result will bi located in *dist* directory.
```bash
npm run tsc
```

## Run application
### Initialize node application
```bash
node dist/index.js init
```
Will initialize project by creating *node_modules* directory and minimal *package.json* file in work directory.

### Install dependencies
```bash
node dist/index.js install
```
> **Note**: If you want to install only production dependency, you should provide --prod argument.
Will install dependencies from workspace *package.json* file.
