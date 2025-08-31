import {expectError, expectSuccess} from "./utils";

describe('analyzer/include', () => {
    expectSuccess([{
        uri: 'file:///path/to/file_1.hlsl',
        content: `
            class File1 {
            }`
    }, {
        uri: 'file:///path/to/file_2.hlsl',
        content: `// Include is allowed.
            #include "file_1.hlsl"
            class File2 : File1 {
            }`
    }]);

    expectError([{
        uri: 'file:///path/to/file_1.hlsl',
        content: `
            class File1 { 
            }`
    }, {
        uri: 'file:///path/to/file_2.hlsl',
        content: `// This is an error because the other file is not included.
            #include "file_3.hlsl"
            class File2 : File1 {
            }`
    }]);
});