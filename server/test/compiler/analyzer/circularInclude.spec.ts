import {expectError, expectSuccess} from "./utils";

describe('analyzer/circularInclude', () => {
    expectSuccess([{
        uri: 'file:///path/to/file_1.hlsl',
        content: `
            #include "file_2.hlsl"
            class File1 { 
            }`
    }, {
        uri: 'file:///path/to/file_2.hlsl',
        content: `// Circular include is allowed.
            #include "file_1.hlsl"
            class File2 : File1 {
            }`
    }]);

    expectError([{
        uri: 'file:///path/to/file_1.hlsl',
        content: `
            #include "file_2.hlsl"
            class File1 { 
            }`
    }, {
        uri: 'file:///path/to/file_2.hlsl',
        content: `// This is an error because the other file is not included.
            // #include "file_1.hlsl"
            class File2 : File1 {
            }`
    }]);
});