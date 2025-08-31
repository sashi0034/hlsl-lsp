import {TokenObject, TokenReserved} from "../compiler_tokenizer/tokenObject";
import {TokenRange} from "../compiler_tokenizer/tokenRange";

export enum AccessModifier {
    Private = 'Private',
    Protected = 'Protected',
}

export enum ReferenceModifier {
    At = 'At',
    AtConst = 'AtConst',
}

export interface EntityAttribute {
    readonly isShared: boolean,
    readonly isExternal: boolean,
    readonly isAbstract: boolean,
    readonly isFinal: boolean,
}

export interface FunctionAttribute {
    readonly isOverride: boolean,
    readonly isFinal: boolean,
    readonly isExplicit: boolean,
    readonly isProperty: boolean,
    readonly isDeleted: boolean,
    readonly isNoDiscard: boolean
}

export enum NodeName {
    NodeName = 'NodeName',
    Using = 'Using',
    Namespace = 'Namespace',
    Enum = 'Enum',
    Struct = 'Struct',
    Class = 'Class',
    TypeDef = 'TypeDef',
    Func = 'Func',
    Interface = 'Interface',
    Var = 'Var',
    Import = 'Import',
    VarTail = 'VarTail',
    RscDecl = 'RscDecl',
    Buffer = 'Buffer',
    BufferMember = 'BufferMember',
    FuncDef = 'FuncDef',
    VirtualProp = 'VirtualProp',
    Mixin = 'Mixin',
    IntfMethod = 'IntfMethod',
    StatBlock = 'StatBlock',
    Param = 'Param',
    ParamList = 'ParamList',
    TypeMod = 'TypeMod',
    Type = 'Type',
    InitList = 'InitList',
    Scope = 'Scope',
    DataType = 'DataType',
    Attr = 'Attr',
    Register = 'Register',
    PackOffset = 'PackOffset',
    PrimType = 'PrimType',
    FuncAttr = 'FuncAttr',
    Statement = 'Statement',
    Switch = 'Switch',
    Break = 'Break',
    For = 'For',
    ForEach = 'ForEach',
    ForEachVar = 'ForEachVar',
    While = 'While',
    DoWhile = 'DoWhile',
    If = 'If',
    Continue = 'Continue',
    ExprStat = 'ExprStat',
    Try = 'Try',
    Return = 'Return',
    Case = 'Case',
    Expr = 'Expr',
    ExprTerm = 'ExprTerm',
    ExprValue = 'ExprValue',
    ExprVoid = 'ExprVoid',
    ConstructCall = 'ConstructCall',
    ExprPreOp = 'ExprPreOp',
    ExprPostOp = 'ExprPostOp',
    Cast = 'Cast',
    Lambda = 'Lambda',
    Literal = 'Literal',
    FuncCall = 'FuncCall',
    VarAccess = 'VarAccess',
    ArgList = 'ArgList',
    Assign = 'Assign',
    Condition = 'Condition',
    ExprOp = 'ExprOp',
    BitOp = 'BitOp',
    MathOp = 'MathOp',
    CompOp = 'CompOp',
    LogicOp = 'LogicOp',
    AssignOp = 'AssignOp',
    Identifier = 'Identifier',
    Number = 'Number',
    String = 'String',
    Bits = 'Bits',
    Comment = 'Comment',
    Whitespace = 'Whitespace',
    ListPattern = 'ListPattern'
}

export interface NodeBase {
    readonly nodeName: NodeName;
    readonly nodeRange: TokenRange;
}

// BNF: SCRIPT        ::= {USING | NAMESPACE | ENUM | TYPEDEF | STRUCT | CLASS | INTERFACE | VAR | FUNC | BUFFER | RSCDECL | ';'}
export type NodeScript = NodeScriptMember[];

export type NodeScriptMember =
    NodeUsing |
    NodeNamespace |
    NodeEnum |
    NodeTypeDef |
    NodeStruct |
    NodeClass |
    NodeInterface |
    NodeVar |
    NodeFunc |
    NodeBuffer |
    NodeResDecl;

// BNF: USING         ::= 'using' 'namespace' IDENTIFIER ('::' IDENTIFIER)* ';'
export interface NodeUsing extends NodeBase {
    readonly nodeName: NodeName.Using;
    readonly namespaceList: TokenObject[];
}

// BNF: NAMESPACE     ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
export interface NodeNamespace extends NodeBase {
    readonly nodeName: NodeName.Namespace
    readonly namespaceList: TokenObject[],
    readonly script: NodeScript
}

// BNF: ENUM          ::= 'enum' IDENTIFIER [ ':' ('int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64') ] (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}' ';'))
export interface NodeEnum extends NodeBase {
    readonly nodeName: NodeName.Enum;
    readonly scopeRange: TokenRange;
    readonly entity: EntityAttribute | undefined;
    readonly identifier: TokenObject;
    readonly memberList: ParsedEnumMember[];
    readonly enumType: TokenReserved | undefined;
}

export interface ParsedEnumMember {
    readonly identifier: TokenObject,
    readonly expr: NodeExpr | undefined
}

// BNF: STRUCT        ::= 'struct' IDENTIFIER [('{' {VAR | FUNC} '}')] ';'
export interface NodeStruct extends NodeBase {
    readonly nodeName: NodeName.Struct;
    readonly identifier: TokenObject;
    readonly scopeRange: TokenRange;
    readonly memberList: (NodeVar | NodeFunc)[];
}

// BNF: CLASS         ::= 'class' IDENTIFIER [':' SCOPE IDENTIFIER {',' SCOPE IDENTIFIER}] (';' | ('{' {FUNC | VAR} '}' ';'))
export interface NodeClass extends NodeBase {
    readonly nodeName: NodeName.Class;
    readonly scopeRange: TokenRange;
    readonly entity: EntityAttribute | undefined;
    readonly identifier: TokenObject;
    readonly typeTemplates: NodeType[] | undefined;
    readonly baseList: ClassBasePart[];
    readonly memberList: (NodeFunc | NodeVar)[];
}

export interface ClassBasePart {
    readonly scope: NodeScope | undefined;
    readonly identifier: TokenObject | undefined;
}

// BNF: TYPEDEF       ::= 'typedef' TYPE IDENTIFIER ';'
// TODO
export interface NodeTypeDef extends NodeBase {
    readonly nodeName: NodeName.TypeDef;
    readonly type: TokenObject;
    readonly identifier: TokenObject;
}

// BNF: FUNC          ::= {ATTR} TYPE IDENTIFIER PARAMLIST [':' SEMANTIC] (';' | STATBLOCK)
export interface NodeFunc extends NodeBase {
    readonly nodeName: NodeName.Func;
    readonly entity: EntityAttribute | undefined;
    readonly accessor: AccessModifier | undefined;
    readonly head: FuncHead;
    readonly identifier: TokenObject;
    readonly paramList: NodeParamList;
    readonly isConst: boolean;
    readonly funcAttr: FunctionAttribute | undefined;
    readonly statBlock: NodeStatBlock;
    readonly typeTemplates: NodeType[];
    readonly listPattern: NodeListPattern | undefined;
}

export interface FuncHeadReturnValue {
    readonly returnType: NodeType;
    readonly isRef: boolean;
}

export const funcHeadDestructor = Symbol();
export type FuncHeadDestructor = typeof funcHeadDestructor;

export const funcHeadConstructor = Symbol();
export type FuncHeadConstructor = typeof funcHeadConstructor;

export type FuncHead = FuncHeadReturnValue | FuncHeadDestructor | FuncHeadConstructor;

export function isFuncHeadConstructor(head: FuncHead): head is FuncHeadConstructor {
    return head === funcHeadConstructor;
}

export function isFuncHeadDestructor(head: FuncHead): head is FuncHeadDestructor {
    return head === funcHeadDestructor;
}

export function isFuncHeadReturnValue(head: FuncHead): head is FuncHeadReturnValue {
    return head !== funcHeadDestructor && head !== funcHeadConstructor;
}

// BNF: INTERFACE     ::= 'interface' IDENTIFIER (';' | ([':' SCOPE IDENTIFIER {',' SCOPE IDENTIFIER}] '{' {INTFMTHD} '}' ';'))
export interface NodeInterface extends NodeBase {
    readonly nodeName: NodeName.Interface;
    readonly entity: EntityAttribute | undefined;
    readonly identifier: TokenObject;
    readonly baseList: ClassBasePart[];
    readonly memberList: (NodeVirtualProp | NodeIntfMethod)[];
}

// BNF: VAR           ::= {ATTR} ['groupshared'] [INTERPOLATION] TYPE IDENTIFIER { ARRAYDIM } [VARTAIL] {',' IDENTIFIER { ARRAYDIM } [VARTAIL]} ';'
export interface NodeVar extends NodeBase {
    readonly nodeName: NodeName.Var;
    readonly attrList: NodeAttr[] | undefined;
    readonly groupShared: boolean;
    readonly interpolation: InterpolationModifier | undefined;
    readonly type: NodeType;

    readonly variables: ParsedVariableInitializer[]; // TODO: REMOVE
    // readonly varList: VariableInitializerPart[]; // TODO: USE IT
}

// IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | ASSIGN)) | ARGLIST]}
export interface ParsedVariableInitializer {
    readonly identifier: TokenObject;
    readonly initializer: NodeInitList | NodeAssign | NodeArgList | undefined;
}

// IDENTIFIER { ARRAYDIM } [VARTAIL] {',' IDENTIFIER { ARRAYDIM } [VARTAIL]}
export interface VariableInitializerPart {
    readonly identifier: TokenObject;
    readonly arrayDim: (NodeAssign | undefined)[] | undefined;
    readonly varTail: NodeVarTail | undefined;
}

// BNF: IMPORT        ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'
// TODO: REMOVE IT!
export interface NodeImport extends NodeBase {
    readonly nodeName: NodeName.Import;
    readonly type: NodeType;
    readonly isRef: boolean;
    readonly identifier: TokenObject;
    readonly paramList: NodeParamList;
    readonly funcAttr: FunctionAttribute | undefined;
    readonly path: TokenObject;
}

// BNF: VARTAIL       ::= ['=' (INITLIST | ASSIGN) | ARGLIST] [':' SEMANTIC] [REGISTER] [PACKOFFSET]
export interface NodeVarTail extends NodeBase {
    readonly nodeName: NodeName.VarTail;
    readonly initializer: NodeInitList | NodeAssign | NodeArgList | undefined;
    readonly semantic: TokenObject | undefined;
    readonly register: TokenObject | undefined;
    readonly packOffset: TokenObject | undefined;
}

// BNF: ARRAYDIM      ::= '[' [ASSIGN] ']'

// BNF: RSCDECL       ::= {ATTR} RSCTYPE IDENTIFIER { ARRAYDIM } [REGISTER] ';'
export interface NodeResDecl extends NodeBase {
    readonly nodeName: NodeName.RscDecl;
    readonly attrList: NodeArgList | undefined;
    readonly resourceType: NodeType;
    readonly identifier: TokenObject;
    readonly arrayDim: (NodeAssign | undefined)[];
    readonly register: NodeRegister | undefined;
}

// BNF: BUFFER        ::= ('cbuffer' | 'tbuffer') IDENTIFIER [REGISTER] '{' {BUFFERMEMBER} '}'
export interface NodeBuffer extends NodeBase {
    readonly nodeName: NodeName.Buffer;
    readonly bufferType: 'c' | 't';
    readonly identifier: TokenObject;
    readonly register: NodeRegister | undefined;
    readonly bufferMember: NodeBufferMember[];
}

// BNF: BUFFERMEMBER  ::= [MATRIXLAYOUT] [INTERPOLATION] TYPE IDENTIFIER { ARRAYDIM } [PACKOFFSET] ';'
export interface NodeBufferMember extends NodeBase {
    readonly nodeName: NodeName.BufferMember;
    readonly matrixLayout: MatrixLayoutModifier | undefined;
    readonly interpolation: InterpolationModifier | undefined;
    readonly type: NodeType;
    readonly identifier: TokenObject;
    readonly arrayDim: (NodeAssign | undefined)[];
    readonly packOffset: NodePackOffset | undefined;
}

// BNF: FUNCDEF       ::= TYPE IDENTIFIER PARAMLIST ';'
// TODO: REMOVE IT!
export interface NodeFuncDef extends NodeBase {
    readonly nodeName: NodeName.FuncDef;
    readonly entity: EntityAttribute | undefined;
    readonly returnType: NodeType;
    readonly isRef: boolean;
    readonly identifier: TokenObject;
    readonly paramList: NodeParamList;
}

// BNF: VIRTPROP      ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
// TODO: REMOVE IT!
export interface NodeVirtualProp extends NodeBase {
    readonly nodeName: NodeName.VirtualProp
    readonly accessor: AccessModifier | undefined,
    readonly type: NodeType,
    readonly isRef: boolean,
    readonly identifier: TokenObject,
    readonly getter: ParsedGetterSetter | undefined,
    readonly setter: ParsedGetterSetter | undefined
}

export interface ParsedGetterSetter {
    readonly isConst: boolean,
    readonly funcAttr: FunctionAttribute | undefined,
    readonly statBlock: NodeStatBlock | undefined
}

// BNF: MIXIN         ::= 'mixin' CLASS
// TODO: REMOVE IT!
export interface NodeMixin extends NodeBase {
    readonly nodeName: NodeName.Mixin;
    readonly mixinClass: NodeClass;
}

// BNF: INTFMTHD      ::= TYPE IDENTIFIER PARAMLIST ['const'] ';'
export interface NodeIntfMethod extends NodeBase {
    readonly nodeName: NodeName.IntfMethod;
    readonly returnType: NodeType;
    readonly isRef: boolean;
    readonly identifier: TokenObject;
    readonly paramList: NodeParamList;
    readonly isConst: boolean;
    readonly funcAttr: FunctionAttribute | undefined;
}

// BNF: STATBLOCK     ::= '{' {VAR | STATEMENT | USING} '}'
export interface NodeStatBlock extends NodeBase {
    readonly nodeName: NodeName.StatBlock;
    readonly statementList: (NodeVar | NodeStatement | NodeUsing)[];
}

export enum NodeListOp {
    StartList = 'StartList',
    EndList = 'EndList',
    Repeat = 'Repeat',
    RepeatSame = 'RepeatSame',
    Type = 'Type'
}

export interface NodeListOperator {
    readonly operator: NodeListOp;
}

export interface NodeListOperatorStartList extends NodeListOperator {
    readonly operator: NodeListOp.StartList;
}

export interface NodeListOperatorEndList extends NodeListOperator {
    readonly operator: NodeListOp.EndList;
}

export interface NodeListOperatorRepeat extends NodeListOperator {
    readonly operator: NodeListOp.Repeat;
}

export interface NodeListOperatorRepeatSame extends NodeListOperator {
    readonly operator: NodeListOp.RepeatSame;
}

export interface NodeListOperatorType extends NodeListOperator {
    readonly operator: NodeListOp.Type,
    readonly type: NodeType
}

export type NodeListValidOperators =
    NodeListOperatorType
    | NodeListOperatorRepeatSame
    | NodeListOperatorRepeat
    | NodeListOperatorEndList
    | NodeListOperatorStartList;

// BNF: LISTENTRY     ::= (('repeat' | 'repeat_same') (('{' LISTENTRY '}') | TYPE)) | (TYPE {',' TYPE})
// TODO: REMOVE IT!

// BNF: LISTPATTERN   ::= '{' LISTENTRY {',' LISTENTRY} '}'
// TODO: REMOVE IT!
export interface NodeListPattern extends NodeBase {
    readonly nodeName: NodeName.ListPattern;
    readonly operators: NodeListValidOperators[];
}

// BNF: PARAMLIST     ::= '(' ['void' | (PARAM {',' PARAM})] ')'
export type NodeParamList = NodeParam[];

// BNF: PARAM         ::= [INTERPOLATION] [PARAMMOD] TYPE [IDENTIFIER] { ARRAYDIM } [ '=' [EXPR | 'void'] ] [':' SEMANTIC]
export interface NodeParam extends NodeBase {
    readonly nodeName: NodeName.Param;
    readonly interpolation: InterpolationModifier | undefined,
    readonly modifier: ParamModifier | undefined,
    readonly type: NodeType,
    readonly identifier: TokenObject | undefined,
    readonly arrayDim: (NodeAssign | undefined)[] | undefined,
    readonly defaultExpr: NodeExpr | NodeExprVoid | undefined,
    readonly semantic: TokenObject | undefined,
}

// BNF: PARAMMOD      ::= 'in' | 'out' | 'inout'
export enum ParamModifier {
    In = 'In',
    Out = 'Out',
    InOut = 'InOut',
}

// BNF: TYPE          ::= {TYPEMOD} [MATRIXLAYOUT] SCOPE DATATYPE [TEMPLATEARGS]
export interface NodeType extends NodeBase {
    readonly nodeName: NodeName.Type
    readonly isConst: boolean,
    readonly scope: NodeScope | undefined,
    readonly dataType: NodeDataType,
    readonly typeTemplates: NodeType[],
    readonly isArray: boolean,
    readonly refModifier: ReferenceModifier | undefined,
}

// BNF: TYPEMOD       ::= 'const' | 'volatile' | 'static' | 'precise' | 'uniform'
export enum TypeModifier {
    Const = 'Const',
    Volatile = 'Volatile',
    Static = 'Static',
    Precise = 'Precise',
    Uniform = 'Uniform',
}

// BNF: INITLIST      ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'
// TODO: REMOVE IT!
export interface NodeInitList extends NodeBase {
    readonly nodeName: NodeName.InitList;
    readonly initList: (NodeAssign | NodeInitList)[];
}

// BNF: TEMPLATEARGS  ::= '<' TYPE {',' TYPE} '>'

// BNF: SCOPE         ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER [TEMPLATEARGS] '::']
export interface NodeScope extends NodeBase {
    readonly nodeName: NodeName.Scope
    readonly isGlobal: boolean,
    readonly scopeList: TokenObject[],
    readonly typeTemplates: NodeType[]
}

// BNF: DATATYPE      ::= IDENTIFIER | PRIMTYPE | '?' | 'auto'
export interface NodeDataType extends NodeBase {
    readonly nodeName: NodeName.DataType;
    readonly identifier: TokenObject;
}

// BNF: RSCTYPE       ::= TYPE

// BNF: ATTR          ::= '[' IDENTIFIER [ '(' [ASSIGN {',' ASSIGN}] ')' ] ']'
export interface NodeAttr extends NodeBase {
    readonly nodeName: NodeName.Attr;
    readonly identifier: TokenObject;
    readonly assignList: NodeAssign[] | undefined;
}

// BNF: INTERPOLATION ::= 'nointerpolation' | 'linear' | 'centroid' | 'noperspective' | 'sample'
export enum InterpolationModifier {
    NoInterpolation = 'NoInterpolation',
    Linear = 'Linear',
    Centroid = 'Centroid',
    NoPerspective = 'NoPerspective',
    Sample = 'Sample',
}

// BNF: MATRIXLAYOUT  ::= 'row_major' | 'column_major'
export enum MatrixLayoutModifier {
    RowMajor = 'RowMajor',
    ColumnMajor = 'ColumnMajor'
}

// BNF: SEMANTIC      ::= IDENTIFIER

// BNF: REGISTER      ::= ':' 'register' '(' IDENTIFIER [',' IDENTIFIER ')'
export interface NodeRegister extends NodeBase {
    readonly nodeName: NodeName.Register;
    readonly register: TokenObject | undefined,
    readonly space: TokenObject | undefined,
}

// BNF: PACKOFFSET    ::= ':' 'packoffset' '(' IDENTIFIER [ '.' ('x' | 'y' | 'z' | 'w') ] ')'
export interface NodePackOffset extends NodeBase {
    readonly nodeName: NodeName.PackOffset;
    readonly identifier: TokenObject | undefined,
    readonly component: TokenObject | undefined,
}

// BNF: PRIMTYPE      ::= 'void' | 'bool' | 'half' | 'float' | 'double' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'min16float' | 'min16int' | 'min16uint'

// BNF: FUNCATTR      ::= {'override' | 'final' | 'explicit' | 'property' | 'delete' | 'nodiscard'}
// TODO: REMOVE IT!

// BNF: STATEMENT     ::= {ATTR} (IF | FOR | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT)
export type NodeStatement =
    NodeIf
    | NodeFor
    | NodeForEach
    | NodeWhile
    | NodeReturn
    | NodeStatBlock
    | NodeBreak
    | NodeContinue
    | NodeDoWhile
    | NodeSwitch
    | NodeExprStat
    | NodeTry;

// BNF: SWITCH        ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
export interface NodeSwitch extends NodeBase {
    readonly nodeName: NodeName.Switch
    readonly assign: NodeAssign,
    readonly caseList: NodeCase[]
}

// BNF: BREAK         ::= 'break' ';'
export interface NodeBreak extends NodeBase {
    readonly nodeName: NodeName.Break;
}

// BNF: FOR           ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
export interface NodeFor extends NodeBase {
    readonly nodeName: NodeName.For
    readonly initial: NodeVar | NodeExprStat,
    readonly condition: NodeExprStat | undefined
    readonly incrementList: NodeAssign[],
    readonly statement: NodeStatement | undefined
}

// like NodeVar but no initializer or modifier
export interface NodeForEachVar extends NodeBase {
    readonly nodeName: NodeName.ForEachVar
    readonly type: NodeType,
    readonly identifier: TokenObject;
}

// BNF: FOREACH       ::= 'foreach' '(' TYPE IDENTIFIER {',' TYPE INDENTIFIER} ':' ASSIGN ')' STATEMENT
// TODO: REMOVE IT!
export interface NodeForEach extends NodeBase {
    readonly nodeName: NodeName.ForEach
    readonly variables: NodeForEachVar[],
    readonly assign: NodeAssign | undefined,
    readonly statement: NodeStatement | undefined
}

// BNF: WHILE         ::= 'while' '(' ASSIGN ')' STATEMENT
export interface NodeWhile extends NodeBase {
    readonly nodeName: NodeName.While
    readonly assign: NodeAssign,
    readonly statement: NodeStatement | undefined
}

// BNF: DOWHILE       ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
export interface NodeDoWhile extends NodeBase {
    readonly nodeName: NodeName.DoWhile
    readonly statement: NodeStatement,
    readonly assign: NodeAssign | undefined
}

// BNF: IF            ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
export interface NodeIf extends NodeBase {
    readonly nodeName: NodeName.If
    readonly condition: NodeAssign,
    readonly thenStat: NodeStatement | undefined,
    readonly elseStat: NodeStatement | undefined
}

// BNF: CONTINUE      ::= 'continue' ';'
export interface NodeContinue extends NodeBase {
    readonly nodeName: NodeName.Continue;
}

// BNF: EXPRSTAT      ::= [ASSIGN] ';'
export interface NodeExprStat extends NodeBase {
    readonly nodeName: NodeName.ExprStat,
    readonly assign: NodeAssign | undefined
}

// BNF: TRY           ::= 'try' STATBLOCK 'catch' STATBLOCK
// TODO: REMOVE IT!
export interface NodeTry extends NodeBase {
    readonly nodeName: NodeName.Try;
    readonly tryBlock: NodeStatBlock,
    readonly catchBlock: NodeStatBlock | undefined
}

// BNF: RETURN        ::= 'return' [ASSIGN] ';'
export interface NodeReturn extends NodeBase {
    readonly nodeName: NodeName.Return;
    readonly assign: NodeAssign | undefined;
}

// BNF: CASE          ::= (('case' EXPR) | 'default') ':' {STATEMENT}
export interface NodeCase extends NodeBase {
    readonly nodeName: NodeName.Case
    readonly expr: NodeExpr | undefined,
    readonly statementList: NodeStatement[]
}

// BNF: EXPR          ::= EXPRTERM {EXPROP EXPRTERM}
export interface NodeExpr extends NodeBase {
    readonly nodeName: NodeName.Expr
    readonly head: NodeExprTerm,
    readonly tail: ParsedOpExpr | undefined
}

// EXPRVOID      ::= 'void'
export interface NodeExprVoid extends NodeBase {
    readonly nodeName: NodeName.ExprVoid;
}

export interface ParsedOpExpr {
    readonly operator: TokenObject,
    readonly expression: NodeExpr
}

// BNF: EXPRTERM      ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
export type NodeExprTerm = NodeExprTerm1 | NodeExprTerm2;

// ([TYPE '='] INITLIST)
export interface NodeExprTerm1 extends NodeBase {
    readonly nodeName: NodeName.ExprTerm
    readonly exprTerm: 1
    readonly type: NodeType | undefined,
    readonly initList: NodeInitList
}

// ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
export interface NodeExprTerm2 extends NodeBase {
    readonly nodeName: NodeName.ExprTerm
    readonly exprTerm: 2,
    readonly preOps: TokenObject[],
    readonly value: NodeExprValue,
    readonly postOps: NodeExprPostOp[]
}

// BNF: EXPRVALUE     ::= 'void' | CONSTRUCTCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')'
export type NodeExprValue =
    NodeConstructCall
    | NodeFuncCall
    | NodeVarAccess
    | NodeCast
    | NodeLiteral
    | NodeAssign
    | NodeLambda;

// BNF: CONSTRUCTCALL ::= TYPE ARGLIST
export interface NodeConstructCall extends NodeBase {
    readonly nodeName: NodeName.ConstructCall;
    readonly type: NodeType;
    readonly argList: NodeArgList;
}

// BNF: EXPRPREOP     ::= '-' | '+' | '!' | '++' | '--' | '~'

// BNF: EXPRPOSTOP    ::= (('.' | '->') (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ']') | ARGLIST | '++' | '--'
export type NodeExprPostOp = NodeExprPostOp1 | NodeExprPostOp2 | NodeExprPostOp3 | NodeExprPostOp4;

// ('.' (FUNCCALL | IDENTIFIER))
export interface NodeExprPostOp1 extends NodeBase {
    readonly nodeName: NodeName.ExprPostOp;
    readonly postOp: 1;
    readonly member: NodeFuncCall | TokenObject | undefined;
}

export function isMemberMethodInPostOp(member: NodeFuncCall | TokenObject | undefined): member is NodeFuncCall {
    return member !== undefined && 'nodeName' in member;
}

// ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']')
export interface NodeExprPostOp2 extends NodeBase {
    readonly nodeName: NodeName.ExprPostOp;
    readonly postOp: 2;
    readonly indexingList: ParsedPostIndexing[];
}

export interface ParsedPostIndexing {
    readonly identifier: TokenObject | undefined,
    readonly assign: NodeAssign
}

// ARGLIST
export interface NodeExprPostOp3 extends NodeBase {
    readonly nodeName: NodeName.ExprPostOp;
    readonly postOp: 3;
    readonly args: NodeArgList;
}

// ++ | --
export interface NodeExprPostOp4 extends NodeBase {
    readonly nodeName: NodeName.ExprPostOp;
    readonly postOp: 4;
    readonly operator: '++' | '--';
}

// BNF: CAST          ::= '(' TYPE ')' EXPRVALUE
export interface NodeCast extends NodeBase {
    readonly nodeName: NodeName.Cast;
    readonly type: NodeType;
    readonly assign: NodeAssign;
}

// BNF: LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK
// TODO: REMOVE IT!
export interface NodeLambda extends NodeBase {
    readonly nodeName: NodeName.Lambda;
    readonly paramList: ParsedLambdaParams[],
    readonly statBlock: NodeStatBlock | undefined
}

export interface ParsedLambdaParams {
    readonly type: NodeType | undefined,
    readonly typeMod: TypeModifier | undefined,
    readonly identifier: TokenObject | undefined
}

// BNF: LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
export interface NodeLiteral extends NodeBase {
    readonly nodeName: NodeName.Literal;
    readonly value: TokenObject;
}

// BNF: FUNCCALL      ::= SCOPE IDENTIFIER ARGLIST
export interface NodeFuncCall extends NodeBase {
    readonly nodeName: NodeName.FuncCall
    readonly scope: NodeScope | undefined,
    readonly identifier: TokenObject,
    readonly argList: NodeArgList,
    readonly typeTemplates: NodeType[] | undefined;
}

// BNF: VARACCESS     ::= SCOPE IDENTIFIER
export interface NodeVarAccess extends NodeBase {
    readonly nodeName: NodeName.VarAccess;
    readonly scope: NodeScope | undefined;
    readonly identifier: TokenObject | undefined;
}

// BNF: ARGLIST       ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
export interface NodeArgList extends NodeBase {
    readonly nodeName: NodeName.ArgList;
    readonly argList: ParsedArgument[];
}

export interface ParsedArgument {
    readonly identifier: TokenObject | undefined,
    readonly assign: NodeAssign
}

// BNF: ASSIGN        ::= CONDITION [ ASSIGNOP ASSIGN ]
export interface NodeAssign extends NodeBase {
    readonly nodeName: NodeName.Assign;
    readonly condition: NodeCondition;
    readonly tail: ParsedAssignTail | undefined;
}

export interface ParsedAssignTail {
    readonly operator: TokenObject,
    readonly assign: NodeAssign
}

// BNF: CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]
export interface NodeCondition extends NodeBase {
    readonly nodeName: NodeName.Condition
    readonly expr: NodeExpr,
    readonly ternary: ParsedTernary | undefined
}

export interface ParsedTernary {
    readonly trueAssign: NodeAssign,
    readonly falseAssign: NodeAssign
}
