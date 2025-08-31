import {
    createAnonymousIdentifier,
    getActiveGlobalScope,
    SymbolGlobalScope,
    SymbolScope,
    tryResolveActiveScope
} from "./symbolScope";
import {
    AccessModifier,
    funcHeadDestructor,
    isFuncHeadReturnValue,
    NodeClass,
    NodeEnum,
    NodeFunc,
    NodeFuncDef,
    NodeInterface,
    NodeIntfMethod,
    NodeMixin,
    NodeName,
    NodeNamespace,
    NodeParamList,
    NodeScript, NodeStruct,
    NodeType,
    NodeTypeDef,
    NodeVar,
    NodeVirtualProp,
    ParsedEnumMember
} from "../compiler_parser/nodes";
import {SymbolFunction, SymbolType, SymbolVariable} from "./symbolObject";
import {getFullIdentifierOfSymbol} from "./symbolUtils";
import {ResolvedType} from "./resolvedType";
import {getGlobalSettings} from "../core/settings";
import {builtinSetterValueToken, builtinThisToken, tryGetBuiltinType} from "./builtinType";
import {TokenIdentifier, TokenObject} from "../compiler_tokenizer/tokenObject";
import {getIdentifierInNodeType} from "../compiler_parser/nodesUtils";
import {
    analyzeFunc,
    AnalyzeQueue,
    analyzeStatBlock,
    analyzeType, analyzeUsingNamespace,
    analyzeVarInitializer, findOptimalScope,
    HoistQueue,
    HoistResult,
    insertVariables,
    pushScopeRegionInfo
} from "./analyzer";
import {analyzerDiagnostic} from "./analyzerDiagnostic";
import {TokenRange} from "../compiler_tokenizer/tokenRange";
import {findConstructorOfType} from "./constrcutorCall";
import assert = require("node:assert");

// BNF: SCRIPT        ::= {USING | NAMESPACE | ENUM | TYPEDEF | STRUCT | CLASS | INTERFACE | VAR | FUNC | BUFFER | RSCDECL | ';'}
// BNF: SCRIPT        ::= {USING | NAMESPACE | ENUM | TYPEDEF | STRUCT | CLASS | INTERFACE | VAR | FUNC | BUFFER | RSCDECL | ';'}
function hoistScript(parentScope: SymbolScope, ast: NodeScript, analyzeQueue: AnalyzeQueue, hoistQueue: HoistQueue) {
    for (const statement of ast) {
        const nodeName = statement.nodeName;

        if (nodeName === NodeName.Using) {
            analyzeUsingNamespace(parentScope, statement);
        } else if (nodeName === NodeName.Namespace) {
            hoistNamespace(parentScope, statement, analyzeQueue, hoistQueue);
        } else if (nodeName === NodeName.Enum) {
            hoistEnum(parentScope, statement);
        } else if (nodeName === NodeName.TypeDef) {
            hoistTypeDef(parentScope, statement);
        } else if (nodeName === NodeName.Struct) {
            hoistStruct(parentScope, statement, analyzeQueue, hoistQueue);
        } else if (nodeName === NodeName.Class) {
            hoistClass(parentScope, statement, false, analyzeQueue, hoistQueue);
        } else if (nodeName === NodeName.Interface) {
            hoistInterface(parentScope, statement, analyzeQueue, hoistQueue);
        } else if (nodeName === NodeName.Var) {
            hoistVar(parentScope, statement, analyzeQueue, hoistQueue, false);
        } else if (nodeName === NodeName.Func) {
            hoistFunc(parentScope, statement, analyzeQueue, hoistQueue, false);
        }
    }
}

// BNF: USING         ::= 'using' 'namespace' IDENTIFIER ('::' IDENTIFIER)* ';'

// BNF: NAMESPACE     ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
function hoistNamespace(
    parentScope: SymbolScope, nodeNamespace: NodeNamespace, analyzeQueue: AnalyzeQueue, hoistQueue: HoistQueue
) {
    if (nodeNamespace.namespaceList.length === 0) return;

    let scopeIterator = parentScope;
    for (let i = 0; i < nodeNamespace.namespaceList.length; i++) {
        const namespaceToken = nodeNamespace.namespaceList[i];
        scopeIterator = scopeIterator.insertScopeAndCheck(namespaceToken, undefined);
        scopeIterator.pushNamespaceNode(nodeNamespace, namespaceToken);
    }

    hoistScript(scopeIterator, nodeNamespace.script, analyzeQueue, hoistQueue);

    pushScopeRegionInfo(scopeIterator, nodeNamespace.nodeRange);
}

// BNF: ENUM          ::= 'enum' IDENTIFIER [ ':' ('int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64') ] (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}' ';'))
function hoistEnum(parentScope: SymbolScope, nodeEnum: NodeEnum) {
    const symbol: SymbolType = SymbolType.create({
        identifierToken: nodeEnum.identifier,
        scopePath: parentScope.scopePath,
        linkedNode: nodeEnum,
        membersScopePath: undefined,
    });

    if (parentScope.insertSymbolAndCheck(symbol) === false) return;

    const scope = parentScope.insertScopeAndCheck(nodeEnum.identifier, nodeEnum);
    symbol.assignMembersScopePath(scope.scopePath);

    hoistEnumMembers(scope, nodeEnum.memberList, new ResolvedType(symbol));
}

function hoistEnumMembers(parentScope: SymbolScope, memberList: ParsedEnumMember[], type: ResolvedType) {
    for (const member of memberList) {
        parentScope.insertSymbolAndCheck(
            SymbolVariable.create({
                identifierToken: member.identifier,
                scopePath: parentScope.scopePath,
                type: type,
                isInstanceMember: false,
                accessRestriction: undefined,
            })
        );
    }
}

// BNF: STRUCT        ::= 'struct' IDENTIFIER [('{' {VAR | FUNC} '}')] ';'
function hoistStruct(
    parentScope: SymbolScope,
    nodeStruct: NodeStruct,
    analyzeQueue: AnalyzeQueue,
    hoistQueue: HoistQueue
) {
    const symbol: SymbolType = SymbolType.create({
        identifierToken: nodeStruct.identifier,
        scopePath: parentScope.scopePath,
        linkedNode: nodeStruct,
        membersScopePath: undefined,
    });
    if (parentScope.insertSymbolAndCheck(symbol) === false) return;

    const scope: SymbolScope = parentScope.insertScopeAndCheck(nodeStruct.identifier, nodeStruct);
    symbol.assignMembersScopePath(scope.scopePath);

    hoistQueue.push(() => {
        for (const member of nodeStruct.memberList) {
            if (member.nodeName === NodeName.Var) {
                hoistVar(scope, member, analyzeQueue, hoistQueue, true);
            } else if (member.nodeName === NodeName.Func) {
                hoistFunc(scope, member, analyzeQueue, hoistQueue, true);
            }
        }
    });
}

// BNF: CLASS         ::= 'class' IDENTIFIER [':' SCOPE IDENTIFIER {',' SCOPE IDENTIFIER}] (';' | ('{' {FUNC | VAR} '}' ';'))
function hoistClass(
    parentScope: SymbolScope,
    nodeClass: NodeClass,
    isMixin: boolean,
    analyzeQueue: AnalyzeQueue,
    hoistQueue: HoistQueue
) {
    const symbol: SymbolType = SymbolType.create({
        identifierToken: nodeClass.identifier,
        scopePath: parentScope.scopePath,
        linkedNode: nodeClass,
        membersScopePath: undefined,
        isMixin: isMixin,
    });
    if (parentScope.insertSymbolAndCheck(symbol) === false) return;

    const scope: SymbolScope = parentScope.insertScopeAndCheck(nodeClass.identifier, nodeClass);
    symbol.assignMembersScopePath(scope.scopePath);

    const thisVariable: SymbolVariable = SymbolVariable.create({
        identifierToken: builtinThisToken,
        scopePath: parentScope.scopePath,
        type: new ResolvedType(symbol),
        isInstanceMember: false,
        accessRestriction: AccessModifier.Private,
    });
    scope.insertSymbolAndCheck(thisVariable);

    const templateTypes = hoistClassTemplateTypes(scope, nodeClass.typeTemplates);
    if (templateTypes.length > 0) symbol.assignTemplateTypes(templateTypes);

    symbol.assignBaseList(hoistBaseList(scope, nodeClass));

    hoistQueue.push(() => {
        hoistClassMembers(scope, nodeClass, analyzeQueue, hoistQueue);

        hoistQueue.push(() => {
            if (symbol.baseList === undefined) return;

            // Copy the members of the base class
            copyBaseMembers(scope, symbol.baseList);

            // Insert the super constructor
            const primeBase = symbol.baseList.length >= 1 ? symbol.baseList[0] : undefined;
            const baseConstructorHolder = findConstructorOfType(primeBase);
            if (baseConstructorHolder?.isFunctionHolder()) {
                for (const baseConstructor of baseConstructorHolder.toList()) {
                    const superConstructor = baseConstructor.clone({
                        identifierToken: TokenIdentifier.createVirtual(
                            'super',
                            new TokenRange(baseConstructor.identifierToken, baseConstructor.identifierToken)
                        ),
                        accessRestriction: AccessModifier.Private,
                    });

                    scope.insertSymbol(superConstructor);
                }
            }
        });
    });

    pushScopeRegionInfo(scope, nodeClass.nodeRange);
}

function hoistClassTemplateTypes(scope: SymbolScope, types: NodeType[] | undefined) {
    const templateTypes: TokenObject[] = [];
    for (const type of types ?? []) {
        scope.insertSymbolAndCheck(SymbolType.create({
            identifierToken: getIdentifierInNodeType(type),
            scopePath: scope.scopePath,
            linkedNode: undefined,
            membersScopePath: undefined,
            isTypeParameter: true,
        }));

        templateTypes.push(getIdentifierInNodeType(type));
    }
    return templateTypes;
}

function hoistBaseList(scope: SymbolScope, nodeClass: NodeClass | NodeInterface): (ResolvedType | undefined)[] | undefined {
    if (nodeClass.baseList.length === 0) return undefined;

    const baseList: (ResolvedType | undefined)[] = [];
    for (const basePart of nodeClass.baseList) {
        const baseIdentifier = basePart.identifier;

        const baseScope = findOptimalScope(scope, basePart.scope, basePart.scope?.nodeRange.end?.next) ?? scope;

        if (baseIdentifier === undefined) {
            baseList.push(undefined);
            continue;
        }

        const baseType = baseScope.lookupSymbolWithParent(baseIdentifier.text);

        if (baseType === undefined) {
            analyzerDiagnostic.error(baseIdentifier.location, `'${baseIdentifier.text}' is not defined type`);
            baseList.push(undefined);
        } else if (baseType.isType() === false) {
            analyzerDiagnostic.error(baseIdentifier.location, `'${baseIdentifier.text}' is not class or interface`);
            baseList.push(undefined);
        } else {
            // Found the base class
            baseList.push(new ResolvedType(baseType));

            getActiveGlobalScope().info.reference.push({
                toSymbol: baseType,
                fromToken: baseIdentifier
            });
        }
    }
    return baseList;
}

function copyBaseMembers(scope: SymbolScope, baseList: (ResolvedType | undefined)[], outputError = true) {
    // Iterate over each base class
    for (const baseType of baseList) {
        if (baseType === undefined) continue;
        if (baseType.typeOrFunc.isFunction()) continue;

        const baseScope = tryResolveActiveScope(baseType.typeOrFunc.membersScopePath);
        if (baseScope === undefined) continue;

        const isMixin = baseType.typeOrFunc.isMixin;

        // Insert each base class member if possible
        for (const [key, symbolHolder] of baseScope.symbolTable) {
            if (key === 'this') continue;

            for (const symbol of symbolHolder.toList()) {
                if (symbol.isFunction() || symbol.isVariable()) {
                    if (!isMixin && symbol.accessRestriction === AccessModifier.Private) {
                        continue;
                    }
                }

                const alreadyExists = scope.insertSymbol(symbol);
                if (alreadyExists === undefined) continue;

                const isVirtualProperty = symbol.isVariable() && symbol.isVirtualProperty;
                if (outputError && isVirtualProperty === false) {
                    analyzerDiagnostic.error(
                        alreadyExists.toList()[0].identifierToken.location,
                        `Duplicated symbol '${key}'`
                    );
                }
            }
        }
    }
}

// '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'
function hoistClassMembers(scope: SymbolScope, nodeClass: NodeClass, analyzeQueue: AnalyzeQueue, hoistQueue: HoistQueue) {
    for (const member of nodeClass.memberList) {
        // if (member.nodeName === NodeName.VirtualProp) {
        //     hoistVirtualProp(scope, member, analyzeQueue, hoistQueue, true);
        // } else
        if (member.nodeName === NodeName.Func) {
            hoistFunc(scope, member, analyzeQueue, hoistQueue, true);
        } else if (member.nodeName === NodeName.Var) {
            hoistVar(scope, member, analyzeQueue, hoistQueue, true);
        }
        // else if (member.nodeName === NodeName.FuncDef) {
        //     hoistFuncDef(scope, member, analyzeQueue, hoistQueue);
        // }
    }
}

// BNF: TYPEDEF       ::= 'typedef' TYPE IDENTIFIER ';'
function hoistTypeDef(parentScope: SymbolScope, typeDef: NodeTypeDef) {
    const builtInType = tryGetBuiltinType(typeDef.type);
    if (builtInType === undefined) return;

    const symbol: SymbolType = SymbolType.create({
        identifierToken: typeDef.identifier,
        scopePath: parentScope.scopePath,
        linkedNode: builtInType.linkedNode,
        membersScopePath: undefined,
    });
    parentScope.insertSymbolAndCheck(symbol);
}

// BNF: FUNC          ::= {ATTR} TYPE IDENTIFIER PARAMLIST [':' SEMANTIC] (';' | STATBLOCK)
function hoistFunc(
    parentScope: SymbolScope, nodeFunc: NodeFunc, analyzeQueue: AnalyzeQueue, hoistQueue: HoistQueue, isInstanceMember: boolean
) {
    if (nodeFunc.head === funcHeadDestructor) return;

    // Function holder scope (with no node)
    // |-- Anonymous scope of one of the overloads (with NodeFunc)
    //     |-- ...

    // Create a new scope for the function
    const funcionHolderScope: SymbolScope =
        // This doesn't have a linked node because the function may be overloaded.
        parentScope.insertScope(nodeFunc.identifier.text, undefined);
    const functionScope = funcionHolderScope.insertScope(createAnonymousIdentifier(), nodeFunc);

    const symbol: SymbolFunction = SymbolFunction.create({
        identifierToken: nodeFunc.identifier,
        scopePath: parentScope.scopePath,
        returnType: undefined, // set below
        parameterTypes: [],
        linkedNode: nodeFunc,
        functionScopePath: functionScope.scopePath,
        isInstanceMember: isInstanceMember,
        accessRestriction: nodeFunc.accessor
    });

    const templateTypes = hoistClassTemplateTypes(functionScope, nodeFunc.typeTemplates);
    if (templateTypes.length > 0) symbol.assignTemplateTypes(templateTypes);

    if (parentScope.insertSymbolAndCheck(symbol) === false) return;

    hoistQueue.push(() => {
        const returnType = isFuncHeadReturnValue(nodeFunc.head)
            ? analyzeType(functionScope, nodeFunc.head.returnType)
            : undefined;
        symbol.assignReturnType(returnType);

        // Check if the function is a virtual property setter or getter
        tryInsertVirtualSetterOrGetter(parentScope, nodeFunc, returnType, isInstanceMember);

        symbol.assignParameterTypes(hoistParamList(funcionHolderScope, functionScope, nodeFunc.paramList));
    });

    analyzeQueue.push(() => {
        analyzeFunc(functionScope, nodeFunc);
    });
}

// Check if the function is a virtual property setter or getter
function tryInsertVirtualSetterOrGetter(
    scope: SymbolScope,
    node: NodeFunc | NodeIntfMethod,
    returnType: ResolvedType | undefined,
    isInstanceMember: boolean
) {
    if (node.identifier.text.startsWith('get_') || node.identifier.text.startsWith('set_')) {
        if (node.funcAttr?.isProperty === true || getGlobalSettings().explicitPropertyAccessor === false) {
            // FIXME?A
            const identifier: TokenObject = TokenIdentifier.createVirtual(
                node.identifier.text.substring(4),
                new TokenRange(node.identifier, node.identifier)
            );

            const symbol: SymbolVariable = SymbolVariable.create({
                identifierToken: identifier,
                scopePath: scope.scopePath,
                type: returnType,
                isInstanceMember: isInstanceMember,
                accessRestriction: node.nodeName === NodeName.IntfMethod ? undefined : node.accessor,
                isVirtualProperty: true
            });

            scope.insertSymbol(symbol);
        }
    } else if (node.funcAttr?.isProperty === true) {
        analyzerDiagnostic.error(node.identifier.location, 'Property accessor must start with "get_" or "set_"');
    }
}

// BNF: INTERFACE     ::= 'interface' IDENTIFIER (';' | ([':' SCOPE IDENTIFIER {',' SCOPE IDENTIFIER}] '{' {INTFMTHD} '}' ';'))
function hoistInterface(parentScope: SymbolScope, nodeInterface: NodeInterface, analyzeQueue: AnalyzeQueue, hoistQueue: HoistQueue) {
    const symbol: SymbolType = SymbolType.create({
        identifierToken: nodeInterface.identifier,
        scopePath: parentScope.scopePath,
        linkedNode: nodeInterface,
        membersScopePath: undefined,
    });
    if (parentScope.insertSymbolAndCheck(symbol) === false) return;

    const scope: SymbolScope = parentScope.insertScopeAndCheck(nodeInterface.identifier, nodeInterface);
    symbol.assignMembersScopePath(scope.scopePath);

    const baseList = hoistBaseList(scope, nodeInterface);
    if (baseList !== undefined) symbol.assignBaseList(baseList);

    hoistQueue.push(() => {
        hoistInterfaceMembers(scope, nodeInterface, analyzeQueue, hoistQueue);
        if (baseList !== undefined) copyBaseMembers(scope, baseList);
    });

    pushScopeRegionInfo(scope, nodeInterface.nodeRange);
}

function hoistInterfaceMembers(scope: SymbolScope, nodeInterface: NodeInterface, analyzeQueue: AnalyzeQueue, hoistQueue: HoistQueue) {
    for (const member of nodeInterface.memberList) {
        if (member.nodeName === NodeName.VirtualProp) {
            hoistVirtualProp(scope, member, analyzeQueue, hoistQueue, true);
        } else if (member.nodeName === NodeName.IntfMethod) {
            hoistIntfMethod(scope, member, hoistQueue);
        }
    }
}

// BNF: VAR           ::= {ATTR} ['groupshared'] [INTERPOLATION] TYPE IDENTIFIER { ARRAYDIM } [VARTAIL] {',' IDENTIFIER { ARRAYDIM } [VARTAIL]} ';'
function hoistVar(scope: SymbolScope, nodeVar: NodeVar, analyzeQueue: AnalyzeQueue, hoistQueue: HoistQueue, isInstanceMember: boolean) {
    const variables = insertVariables(scope, undefined, nodeVar, isInstanceMember);
    hoistQueue.push(() => {
        const varType = analyzeType(scope, nodeVar.type);
        for (const variable of variables) {
            variable.assignType(varType);
        }

        analyzeQueue.push(() => {
            for (const declaredVar of nodeVar.variables) {
                const initializer = declaredVar.initializer;
                if (initializer === undefined) continue;
                analyzeVarInitializer(scope, varType, declaredVar.identifier, initializer);
            }
        });
    });
}

// BNF: IMPORT        ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'
// TODO: REMOVE IT!

// BNF: FUNCDEF       ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
// TODO: REMOVE IT!
function hoistFuncDef(parentScope: SymbolScope, funcDef: NodeFuncDef, analyzeQueue: AnalyzeQueue, hoistQueue: HoistQueue) {
    const symbol: SymbolFunction = SymbolFunction.create({
        identifierToken: funcDef.identifier,
        scopePath: parentScope.scopePath,
        returnType: undefined,
        parameterTypes: [],
        linkedNode: funcDef,
        functionScopePath: undefined,
        isInstanceMember: false,
        accessRestriction: undefined,
    });
    if (parentScope.insertSymbolAndCheck(symbol) === false) return;

    hoistQueue.push(() => {
        symbol.assignReturnType(analyzeType(parentScope, funcDef.returnType));
    });

    hoistQueue.push(() => {
        symbol.assignParameterTypes(funcDef.paramList.map(param => analyzeType(parentScope, param.type)));
    });
}

// BNF: VIRTPROP      ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
// TODO: REMOVE IT!
function hoistVirtualProp(
    parentScope: SymbolScope, virtualProp: NodeVirtualProp, analyzeQueue: AnalyzeQueue, hoistQueue: HoistQueue, isInstanceMember: boolean
) {
    const type = analyzeType(parentScope, virtualProp.type);

    const identifier = virtualProp.identifier;
    const symbol: SymbolVariable = SymbolVariable.create({
        identifierToken: identifier,
        scopePath: parentScope.scopePath,
        type: type,
        isInstanceMember: isInstanceMember,
        accessRestriction: virtualProp.accessor,
    });
    parentScope.insertSymbolAndCheck(symbol);

    const getter = virtualProp.getter;
    if (getter !== undefined && getter.statBlock !== undefined) {
        const getterScope = parentScope.insertScope(`get_${identifier.text}`, virtualProp);

        const statBlock = getter.statBlock;
        analyzeQueue.push(() => {
            analyzeStatBlock(getterScope, statBlock);
        });
    }

    const setter = virtualProp.setter;
    if (setter !== undefined && setter.statBlock !== undefined) {
        const setterScope = parentScope.insertScope(`set_${identifier.text}`, virtualProp);

        if (type !== undefined) {
            const valueVariable: SymbolVariable = SymbolVariable.create({
                identifierToken: builtinSetterValueToken,
                scopePath: parentScope.scopePath,
                type: new ResolvedType(type.typeOrFunc),
                isInstanceMember: false,
                accessRestriction: virtualProp.accessor,
            });
            setterScope.insertSymbolAndCheck(valueVariable);
        }

        const statBlock = setter.statBlock;
        analyzeQueue.push(() => {
            analyzeStatBlock(setterScope, statBlock);
        });
    }
}

// BNF: MIXIN         ::= 'mixin' CLASS
// TODO: REMOVE IT!
function hoistMixin(parentScope: SymbolScope, mixin: NodeMixin, analyzeQueue: AnalyzeQueue, hoistQueue: HoistQueue) {
    hoistClass(parentScope, mixin.mixinClass, true, analyzeQueue, hoistQueue);
}

// BNF: VARTAIL       ::= ['=' (INITLIST | ASSIGN) | ARGLIST] [':' SEMANTIC] [REGISTER] [PACKOFFSET]
// TODO: IMPLEMENT IT!

// BNF: ARRAYDIM      ::= '[' [ASSIGN] ']'
// TODO: IMPLEMENT IT!

// BNF: RSCDECL       ::= {ATTR} RSCTYPE IDENTIFIER { ARRAYDIM } [REGISTER] ';'
// TODO: IMPLEMENT IT!

// BNF: BUFFER        ::= ('cbuffer' | 'tbuffer') IDENTIFIER [REGISTER] '{' {BUFFERMEMBER} '}'
// TODO: IMPLEMENT IT!

// BNF: BUFFERMEMBER  ::= [MATRIXLAYOUT] [INTERPOLATION] TYPE IDENTIFIER { ARRAYDIM } [PACKOFFSET] ';'
// TODO: IMPLEMENT IT!

// BNF: INTFMTHD      ::= TYPE IDENTIFIER PARAMLIST ['const'] ';'
function hoistIntfMethod(parentScope: SymbolScope, intfMethod: NodeIntfMethod, hoistQueue: HoistQueue) {
    const symbol: SymbolFunction = SymbolFunction.create({
        identifierToken: intfMethod.identifier,
        scopePath: parentScope.scopePath,
        returnType: undefined,
        parameterTypes: [],
        linkedNode: intfMethod,
        functionScopePath: undefined, // TODO: Create a dummy function scope for the interface method because named arguments give reference
        isInstanceMember: true,
        accessRestriction: undefined,
    });
    if (parentScope.insertSymbolAndCheck(symbol) === false) {
        return;
    }

    hoistQueue.push(() => {
        const returnType = analyzeType(parentScope, intfMethod.returnType);
        symbol.assignReturnType(returnType);

        // Check if the function is a virtual property setter or getter
        tryInsertVirtualSetterOrGetter(parentScope, intfMethod, symbol.returnType, true);

        symbol.assignParameterTypes(hoistParamList(parentScope, undefined, intfMethod.paramList));
    });
}

// BNF: STATBLOCK     ::= '{' {VAR | STATEMENT | USING} '}'

// BNF: PARAMLIST     ::= '(' ['void' | (PARAM {',' PARAM})] ')'
function hoistParamList(functionHolderScope: SymbolScope, functionScope: SymbolScope | undefined, paramList: NodeParamList) {
    assert(functionScope === undefined || functionScope.parentScope === functionHolderScope);

    const resolvedTypes: (ResolvedType | undefined)[] = [];
    for (const param of paramList) {
        const type = analyzeType(functionHolderScope, param.type);
        if (type === undefined) {
            resolvedTypes.push(undefined);
        } else {
            resolvedTypes.push(type);
        }

        if (param.identifier === undefined) {
            continue;
        }

        functionScope?.insertSymbolAndCheck(SymbolVariable.create({
            identifierToken: param.identifier,
            scopePath: functionScope.scopePath,
            type: type,
            isInstanceMember: false,
            accessRestriction: undefined,
        }));
    }
    return resolvedTypes;
}

// BNF: RSCTYPE       ::= TYPE
// TODO: IMPLEMENT IT!

// BNF: ATTR          ::= '[' IDENTIFIER [ '(' [ASSIGN {',' ASSIGN}] ')' ] ']'
// TODO: IMPLEMENT IT!

// BNF: INTERPOLATION ::= 'nointerpolation' | 'linear' | 'centroid' | 'noperspective' | 'sample'
// TODO: IMPLEMENT IT!

// BNF: MATRIXLAYOUT  ::= 'row_major' | 'column_major'
// TODO: IMPLEMENT IT!

// BNF: SEMANTIC      ::= IDENTIFIER
// TODO: IMPLEMENT IT!

// BNF: REGISTER      ::= ':' 'register' '(' IDENTIFIER [',' IDENTIFIER ')'
// TODO: IMPLEMENT IT!

// BNF: PACKOFFSET    ::= ':' 'packoffset' '(' IDENTIFIER [ '.' ('x' | 'y' | 'z' | 'w') ] ')'
// TODO: IMPLEMENT IT!

// BNF: TYPEMOD       ::= 'const' | 'volatile' | 'static' | 'precise' | 'uniform'
// TODO: IMPLEMENT IT!

// BNF: TEMPLATEARGS  ::= '<' TYPE {',' TYPE} '>'
// TODO: IMPLEMENT IT!

// BNF: PARAM         ::= [INTERPOLATION] [PARAMMOD] TYPE [IDENTIFIER] { ARRAYDIM } [ '=' [EXPR | 'void'] ] [':' SEMANTIC]
// TODO: IMPLEMENT IT!

// BNF: PARAMMOD      ::= 'in' | 'out' | 'inout'
// TODO: IMPLEMENT IT!

// BNF: TYPE          ::= {TYPEMOD} [MATRIXLAYOUT] SCOPE DATATYPE [TEMPLATEARGS]
// TODO: IMPLEMENT IT!

// BNF: TYPEMOD       ::= 'const' | 'volatile' | 'static' | 'precise' | 'uniform'
// BNF: TYPE          ::= {TYPEMOD} [MATRIXLAYOUT] SCOPE DATATYPE [TEMPLATEARGS]
// BNF: INITLIST      ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'
// TODO: REMOVE IT!
// BNF: SCOPE         ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER [TEMPLATEARGS] '::']
// BNF: DATATYPE      ::= IDENTIFIER | PRIMTYPE | '?' | 'auto'
// BNF: PRIMTYPE      ::= 'void' | 'bool' | 'half' | 'float' | 'double' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'min16float' | 'min16int' | 'min16uint'
// BNF: FUNCATTR      ::= {'override' | 'final' | 'explicit' | 'property' | 'delete' | 'nodiscard'}
// TODO: REMOVE IT!
// BNF: STATEMENT     ::= {ATTR} (IF | FOR | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT)
// BNF: SWITCH        ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
// BNF: BREAK         ::= 'break' ';'
// BNF: FOR           ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
// BNF: FOREACH       ::= 'foreach' '(' TYPE IDENTIFIER {',' TYPE INDENTIFIER} ':' ASSIGN ')' STATEMENT
// TODO: REMOVE IT!
// BNF: WHILE         ::= 'while' '(' ASSIGN ')' STATEMENT
// BNF: DOWHILE       ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
// BNF: IF            ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
// BNF: CONTINUE      ::= 'continue' ';'
// BNF: EXPRSTAT      ::= [ASSIGN] ';'
// BNF: TRY           ::= 'try' STATBLOCK 'catch' STATBLOCK
// TODO: REMOVE IT!
// BNF: RETURN        ::= 'return' [ASSIGN] ';'
// BNF: CASE          ::= (('case' EXPR) | 'default') ':' {STATEMENT}
// BNF: EXPR          ::= EXPRTERM {EXPROP EXPRTERM}
// BNF: EXPRTERM      ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
// BNF: EXPRVALUE     ::= 'void' | CONSTRUCTCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')'
// BNF: CONSTRUCTCALL ::= TYPE ARGLIST
// BNF: EXPRPREOP     ::= '-' | '+' | '!' | '++' | '--' | '~'
// BNF: EXPRPOSTOP    ::= (('.' | '->') (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ']') | ARGLIST | '++' | '--'
// BNF: CAST          ::= '(' TYPE ')' EXPRVALUE
// BNF: LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK
// TODO: REMOVE IT!
// BNF: LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
// BNF: FUNCCALL      ::= SCOPE IDENTIFIER ARGLIST
// BNF: VARACCESS     ::= SCOPE IDENTIFIER
// BNF: ARGLIST       ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
// BNF: ASSIGN        ::= CONDITION [ ASSIGNOP ASSIGN ]
// BNF: CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]
// BNF: EXPROP        ::= MATHOP | COMPOP | LOGICOP | BITOP
// BNF: BITOP         ::= '&' | '|' | '^' | '<<' | '>>'
// BNF: MATHOP        ::= '+' | '-' | '*' | '/' | '%'
// BNF: COMPOP        ::= '==' | '!=' | '<' | '<=' | '>' | '>='
// BNF: LOGICOP       ::= '&&' | '||' | '^^'
// BNF: ASSIGNOP      ::= '=' | '+=' | '-=' | '*=' | '/=' | '|=' | '&=' | '^=' | '%=' | '<<=' | '>>='

function collectBaseClassesAndDeivedClasses(scope: SymbolScope, baseClassSet: Set<string>, derivedClassList: SymbolType[]) {
    for (const symbol of scope.symbolTable.values()) {
        if (symbol.isType()) {
            if (symbol.baseList.length >= 1) {
                derivedClassList.push(symbol);
            } else {
                baseClassSet.add(getFullIdentifierOfSymbol(symbol));
            }
        }
    }

    for (const childScope of scope.childScopeTable.values()) {
        if (childScope.isAnonymousScope() || childScope.isFunctionScope()) {
            continue;
        }

        collectBaseClassesAndDeivedClasses(childScope, baseClassSet, derivedClassList);
    }
}

function applyInheritanceBeforeHoist(globalScope: SymbolGlobalScope) {
    const resolvedClassSet: Set<string> = new Set();

    let unresolvedDerivedClassList: SymbolType[] = [];

    collectBaseClassesAndDeivedClasses(globalScope, resolvedClassSet, unresolvedDerivedClassList);

    // FIXME: Optimize?
    let nextList: SymbolType[] = [];
    for (; ;) {
        for (const derivedClass of unresolvedDerivedClassList) {
            let resolveBaseClasses = true;
            for (const baseType of derivedClass.baseList) {
                if (baseType === undefined || baseType.typeOrFunc.isFunction()) {
                    continue;
                }

                if (resolvedClassSet.has(getFullIdentifierOfSymbol(baseType.typeOrFunc)) === false) {
                    resolveBaseClasses = false;
                    break;
                }
            }

            if (resolveBaseClasses) {
                let scope = globalScope.resolveScope(derivedClass.scopePath)?.lookupScope(derivedClass.identifierText);
                if (scope === undefined) {
                    scope = globalScope.resolveScope(derivedClass.scopePath)
                        ?.insertScope(derivedClass.identifierText, derivedClass.linkedNode);
                }

                if (scope !== undefined) {
                    copyBaseMembers(scope, derivedClass.baseList, false);

                    resolvedClassSet.add(getFullIdentifierOfSymbol(derivedClass));
                    continue;
                }
            }

            nextList.push(derivedClass);

        }

        if (nextList.length === 0 || nextList.length === unresolvedDerivedClassList.length) {
            // No more classes to resolve or no progress made
            break;
        } else {
            unresolvedDerivedClassList = nextList;
            nextList = [];
        }
    }
}

export function hoistAfterParsed(ast: NodeScript, globalScope: SymbolGlobalScope): HoistResult {
    const analyzeQueue: AnalyzeQueue = [];
    const hoistQueue: HoistQueue = [];

    // At this stage, inheritance from classes included from other files has not yet been applied.
    // Therefore, the first step is to process that.
    applyInheritanceBeforeHoist(globalScope);

    // Hoist the declared symbols.
    hoistScript(globalScope, ast, analyzeQueue, hoistQueue);
    while (hoistQueue.length > 0) {
        const next = hoistQueue.shift();
        if (next !== undefined) next();
    }

    return {globalScope, analyzeQueue};
}
