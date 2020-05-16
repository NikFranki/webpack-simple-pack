const fs = require('fs');
const path = require('path');
const babylon = require('babylon');
const traverse = require('babel-traverse').default;
const { transformFromAst } = require('babel-core');

let ID = 0;

function createAsset(filename) {

    const content = fs.readFileSync(filename, 'utf-8');
    const ast = babylon.parse(content, {
        sourceType: 'module',
    });

    const dependencies = [];
    traverse(ast, {
        ImportDeclaration: ({ node }) => {
            dependencies.push(node.source.value);
        },
    });

    const id = ID++;
    const { code } = transformFromAst(ast, null, {
        presets: ['env'],
    });

    const customCode = loader(filename, code)

    return {
        id,
        filename,
        dependencies,
        code,
    };
}

function createGraph(entry) {
    const mainAsset = createAsset(entry);
    const queue = [mainAsset];

    for (const asset of queue) {
        asset.mapping = {};
        const dirname = path.dirname(asset.filename);
        asset.dependencies.forEach(relativePath => {
            const absolutePath = path.join(dirname, relativePath);
            const child = createAsset(absolutePath);
            asset.mapping[relativePath] = child.id;
            queue.push(child);
        });
    }

    // [
    //     {
    //         id: 0,
    //         filename: './example/sum.js',
    //         dependencies: ['./a.js', './b.js'],
    //         code: '"use strict";\n' +
    //             '\n' +
    //             'var _a = require("./a.js");\n' +
    //             '\n' +
    //             'var _b = require("./b.js");\n' +
    //             '\n' +
    //             'console.log(_a.a + _b.b);',
    //         mapping: { './a.js': 1, './b.js': 2 }
    //     },
    //     {
    //         id: 1,
    //         filename: 'example/a.js',
    //         dependencies: [],
    //         code: '"use strict";\n' +
    //             '\n' +
    //             'Object.defineProperty(exports, "__esModule", {\n' +
    //             '  value: true\n' +
    //             '});\n' +
    //             'var a = exports.a = 1;',
    //         mapping: {}
    //     },
    //     {
    //         id: 2,
    //         filename: 'example/b.js',
    //         dependencies: ['./a.js'],
    //         code: '"use strict";\n' +
    //             '\n' +
    //             'Object.defineProperty(exports, "__esModule", {\n' +
    //             '  value: true\n' +
    //             '});\n' +
    //             'exports.b = undefined;\n' +
    //             '\n' +
    //             'var _a = require("./a.js");\n' +
    //             '\n' +
    //             'var b = exports.b = _a.a + 1;',
    //         mapping: { './a.js': 3 }
    //     },
    //     {
    //         id: 3,
    //         filename: 'example/a.js',
    //         dependencies: [],
    //         code: '"use strict";\n' +
    //             '\n' +
    //             'Object.defineProperty(exports, "__esModule", {\n' +
    //             '  value: true\n' +
    //             '});\n' +
    //             'var a = exports.a = 1;',
    //         mapping: {}
    //     }
    // ]
    return queue;
}

function bundle(graph) {
    let modules = '';
    graph.forEach(mod => {
        modules += `${mod.id}: [
            function (require, module, exports) {
                ${mod.code}
            },
            ${JSON.stringify(mod.mapping)},
        ],`;
    });
    const result = `
    (function(modules) {
      function require(id) {
        const [fn, mapping] = modules[id];
        function localRequire(name) {
          return require(mapping[name]);
        }
        const module = { exports : {} };
        fn(localRequire, module, module.exports);
        return module.exports;
      }
      require(0);
    })({${modules}})
  `;
    return result;
}

function loader(filename, code) {
    if (/entry/.test(filename)) {
        console.log('this is loader ')
    }
    return code
}

const graph = createGraph('./example/sum.js');
const result = bundle(graph);

console.log(result);